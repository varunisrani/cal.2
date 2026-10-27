import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import { common } from '../../i18n/en/common';
import { reuse } from '../../i18n/en/reuse';
import { ServicesProvider, type Services } from '../../services/context';
import { createCopyDayService, type CopyDayService } from '../../services/copyDay';
import { FACTORY_NOW, makeEntry } from '../../test/factories';
import {
  closeHarnesses,
  openHarness,
  untilGone,
  untilShown,
  type Harness,
} from '../../test/screenHarness';
import { CopyDaySheet } from './CopyDaySheet';

afterEach(closeHarnesses);

const words = reuse.reuse.copyDay;
const HOUR = 60 * 60 * 1000;
/** Monday 26 October 2026 in New York, where the harness clock stands at 12:30. */
const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';
const yesterdayAt = (hour: number) => Date.parse('2026-10-25T00:00:00-04:00') + hour * HOUR;

/** The sheet as Home holds it: open until Done or a copy closes it. */
function Host({ targetDay }: { readonly targetDay: DayKey }) {
  const [open, setOpen] = useState(true);
  return <CopyDaySheet open={open} onClose={() => setOpen(false)} targetDay={targetDay} />;
}

/** A copy service whose calls are recorded, so a test can wait for one to settle. */
type RecordedCopy = CopyDayService & { copy: ReturnType<typeof vi.fn<CopyDayService['copy']>> };

/** The sheet over the harness with the copy service (the real one unless given); `before` stores
 * what the test needs. */
async function openSheet(
  before?: (h: Harness) => Promise<unknown>,
  targetDay: DayKey = TODAY,
  service?: (h: Harness) => CopyDayService,
): Promise<{ h: Harness; copyDay: RecordedCopy }> {
  const h = await openHarness();
  await before?.(h);
  const inner = service
    ? service(h)
    : createCopyDayService({ diaryRepo: h.repos.diaryRepo, clock: h.clock });
  const copyDay: RecordedCopy = { copy: vi.fn((entries, day) => inner.copy(entries, day)) };
  const services: Services = { ...h.services, copyDay };
  h.mount(
    <ServicesProvider services={services}>
      <Host targetDay={targetDay} />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="copyDay.from"]');
  return { h, copyDay };
}

/** Waits inside act until the latest copy has settled and the sheet has answered it. */
async function settled(copyDay: RecordedCopy): Promise<void> {
  await act(async () => {
    await copyDay.copy.mock.results.at(-1)?.value.catch(() => undefined);
  });
}

/** Yesterday: a dinner, a breakfast, a snack and a lunch, stored out of order. */
function yesterday(h: Harness) {
  return h.repos.diaryRepo.addMany([
    makeEntry({ id: 'd', name: 'Pasta', meal: 'dinner', loggedAt: yesterdayAt(19) }),
    makeEntry({ id: 'b', name: 'Porridge', meal: 'breakfast', loggedAt: yesterdayAt(8) }),
    makeEntry({ id: 's', name: 'Apple', meal: 'snack', loggedAt: yesterdayAt(16) }),
    makeEntry({ id: 'l', name: 'Lentil soup', meal: 'lunch', loggedAt: yesterdayAt(13) }),
  ]);
}

const sheet = () => screen.getByRole('dialog', { name: words.title });
const mealsShown = () =>
  [...document.querySelectorAll('[data-ui^="copyDay.meal."]')]
    .map((section) => section.getAttribute('data-ui') ?? '')
    .filter((hook) => !hook.endsWith('.copy'));

async function todayIn(h: Harness) {
  return (await h.repos.diaryRepo.byDay(TODAY)).map((entry) => [entry.name, entry.meal]);
}

describe('CopyDaySheet', () => {
  it('opens on the day before the target, its foods under their meals in the fixed order', async () => {
    await openSheet(yesterday);
    await untilShown('[data-ui="copyDay.all"]');

    expect(sheet()).toBeVisible();
    expect(screen.getByLabelText(words.from)).toHaveValue(YESTERDAY);
    expect(document.querySelector('[data-ui="copyDay.note"]')?.textContent).toBe(words.toToday);
    expect(mealsShown()).toEqual([
      'copyDay.meal.breakfast',
      'copyDay.meal.lunch',
      'copyDay.meal.dinner',
      'copyDay.meal.snack',
    ]);
    const lunch = document.querySelector<HTMLElement>('[data-ui="copyDay.meal.lunch"]');
    expect(lunch && within(lunch).getByText('Lentil soup')).toBeTruthy();
  });

  it('copies all of them with the count on the button, keeps their meals and leaves yesterday as it was (ACC-D18-1)', async () => {
    let originals: unknown;
    const { h, copyDay } = await openSheet(async (harness) => {
      originals = await yesterday(harness);
    });
    await untilShown('[data-ui="copyDay.all"]');

    fireEvent.click(screen.getByRole('button', { name: 'Copy 4 foods' }));
    await settled(copyDay);
    expect(document.querySelector('[data-ui="copyDay"]')).toBeNull();

    expect(await todayIn(h)).toEqual([
      ['Pasta', 'dinner'],
      ['Apple', 'snack'],
      ['Lentil soup', 'lunch'],
      ['Porridge', 'breakfast'],
    ]);
    const copies = await h.repos.diaryRepo.byDay(TODAY);
    expect(copies.every((entry) => !['d', 'b', 's', 'l'].includes(entry.id))).toBe(true);
    expect(copies[0]?.loggedAt).toBe(FACTORY_NOW);
    expect(await h.repos.diaryRepo.byDay(YESTERDAY)).toEqual(
      [...(originals as unknown[])].sort(
        (a, b) => (b as { loggedAt: number }).loggedAt - (a as { loggedAt: number }).loggedAt,
      ),
    );
  });

  it('copies one meal with its own button', async () => {
    const { h, copyDay } = await openSheet(yesterday);
    await untilShown('[data-ui="copyDay.all"]');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Lunch' }));
    await settled(copyDay);
    expect(document.querySelector('[data-ui="copyDay"]')).toBeNull();

    expect(await todayIn(h)).toEqual([['Lentil soup', 'lunch']]);
  });

  it('copies one food with a tap on it', async () => {
    const { h, copyDay } = await openSheet(yesterday);
    await untilShown('[data-ui="copyDay.all"]');

    const apple = [...document.querySelectorAll<HTMLElement>('[data-ui="copyDay.entry"]')].find(
      (row) => row.textContent?.includes('Apple'),
    );
    if (!apple) throw new Error('No Apple row');
    fireEvent.click(apple);
    await settled(copyDay);
    expect(document.querySelector('[data-ui="copyDay"]')).toBeNull();

    expect(await todayIn(h)).toEqual([['Apple', 'snack']]);
  });

  it('shows an empty day with Done, which closes the sheet', async () => {
    await openSheet();
    await untilShown('[data-ui="copyDay.empty"]');

    expect(document.querySelector('[data-ui="copyDay.empty"]')?.textContent).toBe(words.empty);
    expect(document.querySelector('[data-ui="copyDay.all"]')).toBeNull();
    fireEvent.click(within(sheet()).getByRole('button', { name: common.common.done }));
    await untilGone('[data-ui="copyDay"]');
  });

  it('reads another source day when the date changes', async () => {
    await openSheet((h) =>
      h.repos.diaryRepo.add(
        makeEntry({
          name: 'Pancakes',
          meal: 'breakfast',
          loggedAt: Date.parse('2026-10-20T09:00:00-04:00'),
        }),
      ),
    );
    await untilShown('[data-ui="copyDay.empty"]');

    fireEvent.change(screen.getByLabelText(words.from), { target: { value: '2026-10-20' } });
    await untilShown('[data-ui="copyDay.all"]');

    expect(screen.getByRole('button', { name: 'Copy 1 food' })).toBeVisible();
    expect(within(sheet()).getByText('Pancakes')).toBeTruthy();
  });

  it('writes nothing during a fast: the paused dialog shows and the sheet stays (R02.12)', async () => {
    const { h, copyDay } = await openSheet(async (harness) => {
      await yesterday(harness);
      await harness.repos.fastRepo.start(960, FACTORY_NOW - HOUR);
    });
    await untilShown('[data-ui="copyDay.all"]');

    fireEvent.click(screen.getByRole('button', { name: 'Copy 4 foods' }));
    await settled(copyDay);
    await expect(copyDay.copy.mock.results[0]?.value).resolves.toMatchObject({
      kind: 'fastActive',
    });

    const paused = screen.getByRole('alertdialog', { name: words.paused.title });
    expect(paused).toHaveTextContent(words.paused.message);
    fireEvent.click(within(paused).getByRole('button', { name: words.paused.ok }));
    expect(document.querySelector('[data-ui="copyDay.paused"]')).toBeNull();
    expect(sheet()).toBeVisible();
    expect(await h.repos.diaryRepo.byDay(TODAY)).toEqual([]);
  });

  it('names the target day when it is not today, and starts from the day before it', async () => {
    await openSheet(undefined, '2026-10-22');
    await untilShown('[data-ui="copyDay.empty"]');

    expect(screen.getByLabelText(words.from)).toHaveValue('2026-10-21');
    expect(document.querySelector('[data-ui="copyDay.note"]')?.textContent).toBe(
      'Foods are copied to Oct 22, 2026. The originals stay as they are.',
    );
  });

  it('says so when a copy fails, and stays open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { copyDay } = await openSheet(yesterday, TODAY, () => ({
      copy: () => Promise.reject(new Error('disk full')),
    }));
    await untilShown('[data-ui="copyDay.all"]');

    fireEvent.click(screen.getByRole('button', { name: 'Copy 4 foods' }));
    await settled(copyDay);
    expect(screen.getByText(words.failed)).toBeTruthy();
    expect(sheet()).toBeVisible();
  });
});
