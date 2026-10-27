import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dexie } from 'dexie';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSources } from '../../data/DataProvider';
import { startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { DayWindow } from '../../domain/dates/ranges';
import type { DiaryEntry } from '../../domain/model';
import { progress } from '../../i18n/en/progress';
import { makeEntry } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { NutritionCards } from './NutritionCards';
import { ProgressPage } from './ProgressPage';
import { openProgress, type ProgressHarness } from './testing/openProgress';

afterEach(closeHarnesses);

/** jsdom lays nothing out: every element reports a box 404 px wide, so the bars are drawn. */
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 404, 212));
});

const words = progress.progress;
const HOUR = 3_600_000;
/** The harness's today is Monday 26 October 2026; its week runs from Tuesday the 20th. */
const TODAY = '2026-10-26';
const WEEK: DayWindow = { first: '2026-10-20', last: TODAY };
const WEEK_BEFORE: DayWindow = { first: '2026-10-13', last: '2026-10-19' };

/** A food entry on `day` at `hour` o'clock with only the values given. */
function food(day: DayKey, values: Partial<DiaryEntry>, hour = 12): DiaryEntry {
  return makeEntry({
    loggedAt: startOfDay(day) + hour * HOUR,
    dayKey: day,
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    nutrients: {},
    extras: {},
    ...values,
  });
}

async function addFood(h: ProgressHarness, entries: DiaryEntry[]): Promise<void> {
  for (const entry of entries) await h.repos.diaryRepo.add(entry);
}

const textOf = (hook: string): string | null =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? null;
const valueOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"] [data-part="value"]`)?.textContent ?? '';
const barDays = (): Array<string | null> =>
  [...document.querySelectorAll('[data-ui="progress.calories"] [data-part="bar"]')].map((bar) =>
    bar.getAttribute('data-day'),
  );

/** The entries read of `window` waits until the returned release is called. */
function holdEntries(window: DayWindow) {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sources = (real: DataSources): DataSources => ({
    ...real,
    diaryRepo: {
      ...real.diaryRepo,
      between: (first, last) =>
        first === window.first
          ? Dexie.Promise.resolve(held).then(() => real.diaryRepo.between(first, last))
          : real.diaryRepo.between(first, last),
    },
  });
  return { sources, release: () => release() };
}

/** The cards over the first window, and a button that moves them to the second. */
function TwoWindows({ windows }: { readonly windows: readonly [DayWindow, DayWindow] }) {
  const [shown, setShown] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setShown(1)}>
        next
      </button>
      <NutritionCards window={windows[shown] ?? windows[0]} />
    </>
  );
}

describe('NutritionCards', () => {
  it('shows a loading card until the first numbers are in', async () => {
    const hold = holdEntries(WEEK);
    const h = await openProgress({ sources: hold.sources });
    await addFood(h, [food('2026-10-22', { kcal: 1_800 })]);
    h.mount(<NutritionCards window={WEEK} />);

    await untilShown('[data-ui="progress.nutrition.loading"]');
    expect(screen.getByText(words.nutrition.loading)).toHaveAttribute('role', 'status');
    expect(document.querySelector('[data-ui="progress.calories"]')).toBeNull();

    hold.release();
    await untilShown('[data-ui="progress.calories.average"]');
    expect(textOf('progress.calories.average')).toBe('Avg 1,800 kcal');
    expect(document.querySelector('[data-ui="progress.nutrition.loading"]')).toBeNull();
    expect(document.querySelector('[data-ui="progress.nutrition.updating"]')).toBeNull();
  });

  it('counts food only: water and a fast on a day without food add no bar and change no average (R05.4)', async () => {
    const h = await openProgress();
    await addFood(h, [
      food('2026-10-22', { kcal: 1_800, protein: 90, nutrients: { sodium: 2_000 } }),
      food('2026-10-24', { kcal: 2_200, protein: 110, nutrients: { sodium: 1_000 } }),
    ]);
    await h.repos.waterRepo.add({ at: startOfDay('2026-10-23') + 9 * HOUR, ml: 750 });
    await h.repos.waterRepo.add({ at: startOfDay('2026-10-24') + 9 * HOUR, ml: 500 });
    const started = await h.repos.fastRepo.start(960, startOfDay('2026-10-22') + 20 * HOUR);
    if (!started.ok) throw new Error('the fast did not start');
    await h.repos.fastRepo.end(started.value.id, startOfDay('2026-10-23') + 12 * HOUR);
    h.mount(<NutritionCards window={WEEK} />);

    await untilShown('[data-ui="progress.calories.average"]');
    expect(textOf('progress.calories.average')).toBe('Avg 2,000 kcal');
    expect(barDays()).toEqual(['2026-10-22', '2026-10-24']);
    // Two logged days, not three: 200 g of protein and 3 000 mg of sodium over two days.
    expect(valueOf('progress.macros.protein')).toMatch(/^100 g \/ /);
    expect(valueOf('progress.nutrients.sodium')).toBe('1,500 mg / 2,300 mg');
  });

  it('divides the averages by the days with food, not by the days of the period (ACC-G11-1)', async () => {
    const h = await openProgress();
    await addFood(h, [
      food('2026-10-21', { kcal: 2_000, protein: 120, carbs: 210, fat: 64 }),
      food('2026-10-25', { kcal: 1_600, protein: 80, carbs: 150, fat: 50 }, 9),
      food('2026-10-25', { kcal: 0, protein: 0, carbs: 0, fat: 0, extras: { creatine: 5 } }, 10),
    ]);
    h.mount(<NutritionCards window={WEEK} />);

    await untilShown('[data-ui="progress.macros"]');
    expect(valueOf('progress.macros.protein')).toMatch(/^100 g \/ /);
    expect(valueOf('progress.macros.carbs')).toMatch(/^180 g \/ /);
    expect(valueOf('progress.macros.fat')).toMatch(/^57 g \/ /);
    // A sports compound without a goal shows its amount alone.
    expect(valueOf('progress.nutrients.creatine')).toBe('2.5 g');
    // Trans fat has no goal and none was eaten: not listed.
    expect(document.querySelector('[data-ui="progress.nutrients.transFat"]')).toBeNull();
  });

  it('keeps the shown numbers under a spinner while a newer window is read and worked out', async () => {
    const user = userEvent.setup();
    const hold = holdEntries(WEEK_BEFORE);
    const h = await openProgress({ sources: hold.sources });
    await addFood(h, [
      food('2026-10-22', { kcal: 1_800 }),
      food('2026-10-15', { kcal: 2_400 }),
      food('2026-10-16', { kcal: 2_600 }),
    ]);
    h.mount(<TwoWindows windows={[WEEK, WEEK_BEFORE]} />);
    await untilShown('[data-ui="progress.calories.average"]');
    expect(textOf('progress.calories.average')).toBe('Avg 1,800 kcal');

    await user.click(screen.getByRole('button', { name: 'next' }));
    await untilShown('[data-ui="progress.nutrition.updating"]');
    expect(screen.getByRole('status', { name: words.nutrition.updating })).toBeInTheDocument();
    expect(document.querySelector('[data-ui="progress.nutrition"]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(textOf('progress.calories.average')).toBe('Avg 1,800 kcal');
    expect(document.querySelector('[data-ui="progress.nutrition.loading"]')).toBeNull();

    hold.release();
    await untilGone('[data-ui="progress.nutrition.updating"]');
    expect(textOf('progress.calories.average')).toBe('Avg 2,500 kcal');
    expect(barDays()).toEqual(['2026-10-15', '2026-10-16']);
    expect(document.querySelector('[data-ui="progress.nutrition"]')).not.toHaveAttribute(
      'aria-busy',
    );
  });

  it('shows a message in place of the cards when the entries cannot be read', async () => {
    const h = await openProgress({
      sources: (real) => ({
        ...real,
        diaryRepo: { ...real.diaryRepo, between: () => Dexie.Promise.reject(new Error('no')) },
      }),
    });
    h.mount(<NutritionCards window={WEEK} />);
    await untilShown('[data-ui="progress.nutrition.error"]');
    expect(textOf('progress.nutrition.error')).toBe(words.nutrition.loadFailed);
  });

  it('takes out the partial today when Count today is turned off on the page (ACC-G9-1, R05.17)', async () => {
    const user = userEvent.setup();
    const h = await openProgress();
    await addFood(h, [
      food('2026-10-24', { kcal: 2_000, protein: 120 }, 13),
      food('2026-10-25', { kcal: 2_200, protein: 140 }, 19),
      // Breakfast only so far today.
      food(TODAY, { kcal: 400, protein: 20 }, 8),
    ]);
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.calories.average"]');
    expect(textOf('progress.calories.average')).toBe('Avg 1,533 kcal');
    expect(barDays()).toEqual(['2026-10-24', '2026-10-25', TODAY]);
    expect(valueOf('progress.macros.protein')).toMatch(/^93\.3 g \/ /);

    await user.click(screen.getByRole('switch', { name: words.countToday.label }));
    await until(() => textOf('progress.calories.average') === 'Avg 2,100 kcal');
    expect(barDays()).toEqual(['2026-10-24', '2026-10-25']);
    expect(valueOf('progress.macros.protein')).toMatch(/^130 g \/ /);
  });
});
