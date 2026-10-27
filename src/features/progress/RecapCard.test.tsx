import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startOfDay, type DayKey } from '../../domain/dates/dayKey';
import type { WeekStart } from '../../domain/dates/week';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { progress } from '../../i18n/en/progress';
import type { Clock } from '../../lib/clock';
import { makeEntry, makeProfile } from '../../test/factories';
import { closeHarnesses, openHarness, until, untilShown } from '../../test/screenHarness';
import { ProgressPage } from './ProgressPage';
import { RecapCard } from './RecapCard';
import { openProgress, type ProgressHarness } from './testing/openProgress';

afterEach(closeHarnesses);

const words = progress.progress.recap;
const HOUR = 3_600_000;
// The harness's today is Monday 26 October 2026: the last week to end ran 19–25 October (Monday
// weeks) or 18–24 October (Sunday weeks).
const PROFILE = makeProfile({ saved: { kcal: 2_000, protein: 150 } });

/** A meal: its day, kcal, protein in grams, and the local hour it was logged at (noon). */
type Meal = readonly [day: DayKey, kcal: number, protein: number, hour?: number];

const at = (day: DayKey, hour = 12): number => startOfDay(day) + hour * HOUR;

// Monday 19 to Sunday 25 October against a goal of 2 000 kcal and 150 g of protein: six logged
// days, four near the calorie goal (not 2 500 nor 1 799), four with the protein goal met (149.6 g
// included), a run of five, an average of 2 033.
const RECAPPED_WEEK: readonly Meal[] = [
  ['2026-10-19', 1_800, 149.6],
  ['2026-10-20', 2_100, 155],
  ['2026-10-21', 2_500, 160],
  ['2026-10-22', 1_950, 100],
  ['2026-10-23', 1_799, 90],
  ['2026-10-25', 2_050, 151, 23.5],
];

// Monday 12 to Sunday 18 October: every day logged, four near the goal, three with protein met.
const FULL_WEEK_BEFORE: readonly Meal[] = [
  ['2026-10-12', 2_000, 150],
  ['2026-10-13', 2_000, 150],
  ['2026-10-14', 3_000, 40],
  ['2026-10-15', 1_500, 160],
  ['2026-10-16', 2_000, 100],
  ['2026-10-17', 2_000, 20],
  ['2026-10-18', 1_000, 10],
];

interface RecapSetup {
  readonly meals?: readonly Meal[];
  readonly weighIns?: ReadonlyArray<{ readonly at: number; readonly kg: number }>;
  readonly energy?: EnergyDisplayUnit;
  readonly weekStart?: WeekStart;
  /** Anything else to store before the card is drawn. */
  readonly also?: (h: ProgressHarness) => Promise<void>;
}

async function openRecap({ meals = [], weighIns, energy, weekStart, also }: RecapSetup = {}) {
  const h = await openProgress({ profile: PROFILE, weighIns });
  if (energy) await h.repos.settingsRepo.set('units.energy', energy);
  if (weekStart) await h.repos.settingsRepo.set('display.weekStart', weekStart);
  if (meals.length > 0) {
    await h.repos.diaryRepo.addMany(
      meals.map(([day, kcal, protein, hour]) =>
        makeEntry({ loggedAt: at(day, hour), kcal, protein }),
      ),
    );
  }
  await also?.(h);
  h.mount(<RecapCard />);
  await untilShown('[data-ui="progress.recap"]');
  return h;
}

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

/** A tile's value, label and change line, and whether the change is drawn as better. */
function tile(name: string) {
  const element = document.querySelector(`[data-ui="progress.recap.${name}"]`);
  if (!element) throw new Error(`no ${name} tile`);
  const [value, label, detail] = [...element.children].map((child) => child.textContent);
  const better = element.lastElementChild?.hasAttribute('data-better') ?? false;
  return { value, label, detail, better };
}

const highlights = (): Array<string | null> =>
  [...document.querySelectorAll('[data-ui="progress.recap.highlights"] li')].map(
    (line) => line.textContent,
  );

describe('RecapCard', () => {
  it('recaps the last week that ended: days logged of 7 with the change from the week before (ACC-G8-1, R05.19)', async () => {
    await openRecap({
      // Today's meal is in the week still running, which is never recapped.
      meals: [...RECAPPED_WEEK, ...FULL_WEEK_BEFORE, ['2026-10-26', 2_000, 150]],
    });

    expect(screen.getByRole('heading', { level: 2, name: words.title })).toBeVisible();
    expect(textOf('progress.recap.dates')).toBe('Oct 19 – 25');
    expect(tile('logged')).toEqual({
      value: '6/7',
      label: words.logged,
      detail: '−1',
      better: false,
    });
    expect(tile('nearGoal')).toEqual({
      value: '4/7',
      label: words.nearGoal.kcal,
      detail: '0',
      better: false,
    });
    expect(tile('protein')).toEqual({
      value: '4/7',
      label: words.protein,
      detail: '+1',
      better: true,
    });
    expect(tile('average')).toEqual({
      value: '2,033',
      label: words.average.kcal,
      detail: 'Goal 2,000',
      better: false,
    });
    expect(screen.getByText(words.note)).toBeVisible();
  });

  it('names a step forward and never a step back (ACC-G8-2)', async () => {
    await openRecap({ meals: [...RECAPPED_WEEK, ...FULL_WEEK_BEFORE] });

    // One day fewer and the same days near the goal say nothing; a full week before means no
    // line about more logged days either.
    expect(highlights()).toEqual([
      '5 days logged in a row',
      '1 more day with your protein goal met',
      'Your average calories were near your goal',
    ]);
  });

  it('shows at most three lines, the first three in their order (ACC-G8-2, R05.19)', async () => {
    // Only a day of 3 000 kcal the week before: five lines of good news qualify.
    await openRecap({ meals: [...RECAPPED_WEEK, ['2026-10-14', 3_000, 40]] });

    expect(tile('logged').detail).toBe('+5');
    expect(tile('nearGoal')).toMatchObject({ detail: '+4', better: true });
    expect(highlights()).toEqual([
      '5 days logged in a row',
      '4 more days near your calorie goal',
      '4 more days with your protein goal met',
    ]);
  });

  it('shows energy in kJ while every day is still measured in kcal (R05.19)', async () => {
    await openRecap({
      energy: 'kJ',
      meals: [
        ['2026-10-20', 1_850, 0],
        ['2026-10-21', 1_850, 0],
        ['2026-10-22', 1_850, 0],
      ],
    });

    expect(tile('nearGoal')).toMatchObject({ value: '3/7', label: words.nearGoal.kJ });
    expect(tile('average')).toEqual({
      value: '7,740',
      label: words.average.kJ,
      detail: 'Goal 8,368',
      better: false,
    });
    expect(highlights()).toEqual([
      '3 days logged in a row',
      '3 more days near your kilojoule goal',
      words.highlight.averageNearGoal.kJ,
    ]);
  });

  it('follows the week start setting: a late-Sunday meal leaves the recap for Sunday weeks (R05.19)', async () => {
    const h = await openRecap({ meals: [['2026-10-25', 2_000, 150, 23.5]] });
    expect(textOf('progress.recap.dates')).toBe('Oct 19 – 25');
    expect(tile('logged').value).toBe('1/7');

    // Sunday weeks: 25 October opens the week still running, so the recap is 18–24 October.
    await act(() => h.repos.settingsRepo.set('display.weekStart', 'sun'));
    await until(() => textOf('progress.recap.dates') === 'Oct 18 – 24');
    expect(textOf('progress.recap.empty')).toBe(words.empty);
  });

  it('steps back to earlier weeks and forward again, never past the last week that ended', async () => {
    const user = userEvent.setup();
    await openRecap({ meals: [...RECAPPED_WEEK, ...FULL_WEEK_BEFORE] });
    const later = screen.getByRole('button', { name: words.later });
    expect(later).toBeDisabled();

    await user.click(screen.getByRole('button', { name: words.earlier }));
    await until(() => textOf('progress.recap.dates') === 'Oct 12 – 18');
    expect(tile('logged')).toMatchObject({ value: '7/7', detail: '+7', better: true });
    expect(highlights()[0]).toBe(words.highlight.everyDay);
    expect(later).toBeEnabled();

    await user.click(screen.getByRole('button', { name: words.earlier }));
    await until(() => textOf('progress.recap.dates') === 'Oct 5 – 11');
    expect(textOf('progress.recap.empty')).toBe(words.empty);

    await user.click(later);
    await user.click(later);
    await until(() => textOf('progress.recap.dates') === 'Oct 19 – 25');
    expect(later).toBeDisabled();
  });

  it('shows only the empty message for a week of water and fasts (R05.4)', async () => {
    await openRecap({
      meals: FULL_WEEK_BEFORE,
      also: async (h) => {
        await h.repos.waterRepo.add({ at: at('2026-10-20', 9), ml: 750 });
        await h.repos.waterRepo.add({ at: at('2026-10-21', 9), ml: 500 });
        const fast = await h.repos.fastRepo.start(16 * 60, at('2026-10-22', 20));
        if (!fast.ok) throw new Error('the fast did not start');
        await h.repos.fastRepo.end(fast.value.id, at('2026-10-23', 12));
      },
    });

    expect(textOf('progress.recap.dates')).toBe('Oct 19 – 25');
    expect(textOf('progress.recap.empty')).toBe(words.empty);
    expect(document.querySelector('[data-ui="progress.recap.logged"]')).toBeNull();
    expect(screen.queryByText(words.note)).toBeNull();
  });

  it('shows the change from the first to the last weigh-in of the week, with no food logged', async () => {
    await openRecap({
      weighIns: [
        { at: at('2026-10-19', 7), kg: 64 },
        { at: at('2026-10-22', 7), kg: 63.9 },
        { at: at('2026-10-25', 21), kg: 63.4 },
      ],
    });

    expect(textOf('progress.recap.weight')).toBe(`${words.weightChange}-0.6 kg`);
    expect(tile('logged')).toMatchObject({ value: '0/7', detail: '0' });
    expect(tile('average').value).toBe(words.noAverage);
    expect(document.querySelector('[data-ui="progress.recap.highlights"]')).toBeNull();
  });

  it('leaves the weight row out for a single weigh-in', async () => {
    await openRecap({ weighIns: [{ at: at('2026-10-21', 7), kg: 64 }] });
    expect(tile('logged').value).toBe('0/7');
    expect(document.querySelector('[data-ui="progress.recap.weight"]')).toBeNull();
  });

  it('moves on to the week that just ended when the page is shown again after midnight (R05.14)', async () => {
    // Sunday 25 October, 21:00: the week of 19–25 October is still running.
    let now = Date.parse('2026-10-25T21:00:00-04:00');
    const clock: Clock = { now: () => now, timeZone: () => 'America/New_York' };
    const h = await openHarness({ clock, hash: '#/progress' });
    await h.repos.profileRepo.save(PROFILE);
    await h.repos.diaryRepo.addMany(
      ['2026-10-14', '2026-10-20', '2026-10-21'].map((day) =>
        makeEntry({ loggedAt: at(day), kcal: 2_000, protein: 150 }),
      ),
    );
    h.mount(<RecapCard />);
    await untilShown('[data-ui="progress.recap"]');
    expect(textOf('progress.recap.dates')).toBe('Oct 12 – 18');
    expect(tile('logged').value).toBe('1/7');

    // The phone slept through midnight; the page is shown again on Monday morning.
    now = Date.parse('2026-10-26T07:30:00-04:00');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await until(() => textOf('progress.recap.dates') === 'Oct 19 – 25');
    expect(tile('logged')).toMatchObject({ value: '2/7', detail: '+1', better: true });
  });

  it('sits at the top of the Progress page, above the range control', async () => {
    const h = await openProgress({ profile: PROFILE });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.recap"]');

    const recap = document.querySelector('[data-ui="progress.recap"]') as Element;
    const range = document.querySelector('[data-ui="progress.range"]') as Element;
    expect(recap.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(textOf('progress.recap.empty')).toBe(words.empty);
  });
});
