import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhotoRepo } from '../../data/repos/photoRepo';
import type { DiaryEntry } from '../../domain/model';
import { common } from '../../i18n/en/common';
import { fasting as fastingWords } from '../../i18n/en/fasting';
import { home } from '../../i18n/en/home';
import { createCombineService, type CombineService } from '../../services/combine';
import { ServicesProvider } from '../../services/context';
import { createFastingService } from '../../services/fasting';
import { FACTORY_NOW, makeEntry, makeFast } from '../../test/factories';
import { closeHarnesses, openHarness } from '../../test/screenHarness';
import { settle } from '../water/testing/openWater';
import { SelectionBar } from './SelectionBar';

afterEach(closeHarnesses);

const words = home.home.selection;
const paused = fastingWords.fasting.paused;
const HOUR = 3_600_000;
const TODAY = '2026-10-26';

interface Setup {
  /** How many of the morning's three entries are picked (all by default). */
  readonly picked?: number;
  /** A fast left running since 08:30. */
  readonly fasting?: boolean;
  /** Replaces the real combine service. */
  readonly combine?: (real: CombineService) => CombineService;
}

/** The bar over the morning's toast, eggs and tea, with the real combine and fasting services. */
async function openBar(setup: Setup = {}) {
  const h = await openHarness();
  const { diaryRepo, fastRepo, settingsRepo } = h.repos;
  const entries = await diaryRepo.addMany([
    makeEntry({ id: 'toast', name: 'Toast', kcal: 250, loggedAt: FACTORY_NOW - 4 * HOUR }),
    makeEntry({ id: 'eggs', name: 'Eggs', kcal: 155, loggedAt: FACTORY_NOW - 3 * HOUR }),
    makeEntry({ id: 'tea', name: 'Tea', kcal: 30, loggedAt: FACTORY_NOW - 2 * HOUR }),
  ]);
  const running = makeFast({ id: 'running', start: FACTORY_NOW - 4 * HOUR, end: null });
  if (setup.fasting) await h.db.fasts.put(running);
  const real = createCombineService({
    diaryRepo: h.repos.diaryRepo,
    photoRepo: createPhotoRepo(h.db),
    words: { fallbackName: 'Plate', more: (count) => `${count} others` },
  });
  const combine = setup.combine ? setup.combine(real) : real;
  const services = {
    ...h.services,
    combine,
    fasting: createFastingService({ fastRepo, diaryRepo, settingsRepo, clock: h.clock }),
  };
  const onCancel = vi.fn();
  const onCombined = vi.fn();
  let pick: (chosen: readonly DiaryEntry[]) => void = () => undefined;
  /** The bar over the picked entries, which the test can change. */
  function Picking({ initial }: { readonly initial: readonly DiaryEntry[] }) {
    const [chosen, setChosen] = useState(initial);
    pick = setChosen;
    return <SelectionBar entries={chosen} onCancel={onCancel} onCombined={onCombined} />;
  }
  h.mount(
    <ServicesProvider services={services}>
      <Picking initial={entries.slice(0, setup.picked ?? entries.length)} />
    </ServicesProvider>,
  );
  const repick = (chosen: readonly DiaryEntry[]) => act(() => pick(chosen));
  return { ...h, entries, running, onCancel, onCombined, repick };
}

/** Waits until a toast says `text`. */
const untilToast = (text: string) =>
  settle(() => screen.queryByRole('status')?.textContent?.includes(text) === true);

const bar = () => within(screen.getByRole('region', { name: words.label }));
const combineButton = () => bar().getByRole('button', { name: words.combine });
const pausedDialog = () => screen.queryByRole('alertdialog', { name: paused.title });

async function press(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe('SelectionBar', () => {
  it('says how many rows are picked and offers Combine from two (ACC-F12-1)', async () => {
    const h = await openBar({ picked: 1 });
    expect(screen.getByRole('region', { name: words.label })).toHaveAttribute(
      'data-ui',
      'home.selection',
    );
    expect(bar().getByText('1 selected')).toHaveAttribute('data-ui', 'home.selection.count');
    expect(combineButton()).toBeDisabled();

    h.repick(h.entries.slice(0, 2));
    expect(bar().getByText('2 selected')).toBeVisible();
    expect(combineButton()).toBeEnabled();
    expect(combineButton()).toHaveAttribute('data-ui', 'home.selection.combine');
  });

  it('ends picking on Cancel and changes nothing', async () => {
    const h = await openBar();
    const cancel = bar().getByRole('button', { name: common.common.cancel });
    expect(cancel).toHaveAttribute('data-ui', 'home.selection.cancel');

    fireEvent.click(cancel);

    expect(h.onCancel).toHaveBeenCalledOnce();
    expect(await h.repos.diaryRepo.count()).toBe(3);
  });

  it('combines three rows into one named "Toast + Eggs + Tea" at the latest time, then ends picking (ACC-D15-1)', async () => {
    const h = await openBar();

    await press(combineButton());
    await settle(() => h.onCombined.mock.calls.length > 0);

    const stored = await h.repos.diaryRepo.byDay(TODAY);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      name: 'Toast + Eggs + Tea',
      kcal: 435,
      loggedAt: FACTORY_NOW - 2 * HOUR,
    });
    expect(h.onCombined).toHaveBeenCalledOnce();
  });

  it('changes nothing while a fast runs and shows the paused dialog; Cancel keeps fasting and picking (R02.12)', async () => {
    const h = await openBar({ fasting: true });

    await press(combineButton());
    await settle(() => pausedDialog() !== null);

    expect(pausedDialog()).toHaveTextContent(paused.message);
    expect(await h.repos.diaryRepo.count()).toBe(3);
    fireEvent.click(
      within(pausedDialog() as HTMLElement).getByRole('button', { name: common.common.cancel }),
    );
    expect(pausedDialog()).toBeNull();
    expect(h.onCombined).not.toHaveBeenCalled();
    expect(h.onCancel).not.toHaveBeenCalled();
    expect(await h.repos.fastRepo.list()).toEqual([h.running]);
    expect(screen.getByRole('region', { name: words.label })).toBeVisible();
  });

  it('ends the fast and combines on "End fast and log" (D-16.35)', async () => {
    const h = await openBar({ fasting: true });
    await press(combineButton());
    await settle(() => pausedDialog() !== null);

    await press(
      within(pausedDialog() as HTMLElement).getByRole('button', { name: paused.endAndLog }),
    );
    await settle(() => h.onCombined.mock.calls.length > 0);

    expect(await h.repos.fastRepo.list()).toEqual([{ ...h.running, end: FACTORY_NOW }]);
    const stored = await h.repos.diaryRepo.byDay(TODAY);
    expect(stored.map((entry) => entry.name)).toEqual(['Toast + Eggs + Tea']);
  });

  it('says so when a picked row was deleted meanwhile, and keeps picking', async () => {
    const h = await openBar();
    await h.repos.diaryRepo.remove('eggs');

    await press(combineButton());
    await untilToast(words.missing);
    expect(await h.repos.diaryRepo.count()).toBe(2);
    expect(h.onCombined).not.toHaveBeenCalled();
  });

  it('says so when the combine fails, and Combine works again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const h = await openBar({
      combine: (real) => ({
        combine: (entries) => {
          if (!fail) return real.combine(entries);
          fail = false;
          return Promise.reject(new Error('disk full'));
        },
      }),
    });

    await press(combineButton());
    await untilToast(words.failed);
    expect(await h.repos.diaryRepo.count()).toBe(3);

    await press(combineButton());
    await settle(() => h.onCombined.mock.calls.length > 0);
    expect(await h.repos.diaryRepo.count()).toBe(1);
  });
});
