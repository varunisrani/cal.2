import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_MEAL_TIMES } from '../../../domain/meals/times';
import type { MealTimes } from '../../../domain/model';
import { common } from '../../../i18n/en/common';
import { log } from '../../../i18n/en/log';
import { trackers } from '../../../i18n/en/trackers';
import { fixedClock } from '../../../lib/clock';
import { closeHarnesses, until, untilGone, untilShown } from '../../../test/screenHarness';
import { ManualSheet } from '../../log/ManualSheet';
import { settle } from '../../water/testing/openWater';
import { clockText } from './clockText';
import { MealTimesCard } from './MealTimesSheet';
import { openTracking, type TrackingSetup } from './testing/openTracking';
import { TrackingPage } from './TrackingPage';

afterEach(closeHarnesses);

beforeAll(async () => {
  // The page's own modules, loaded once so no wait below includes their first transform.
  await import('./TrackingPage');
});

const words = trackers.trackers.mealTimes;
const EDITOR = '[data-ui="mealTimes.editor"]';

/** The four starts as the editor lists them: label and time. */
const listed = (): string[][] =>
  Array.from(document.querySelectorAll(`${EDITOR} li > button`)).map((row) =>
    Array.from(row.querySelectorAll('span')).map((part) => part.textContent ?? ''),
  );

/** `[label, time]` rows for a set of starts. */
const rowsFor = (times: MealTimes): string[][] => [
  [words.starts.breakfast, clockText(times.breakfast, 'en-US')],
  [words.starts.lunch, clockText(times.lunch, 'en-US')],
  [words.starts.dinner, clockText(times.dinner, 'en-US')],
  [words.starts.lateSnack, clockText(times.lateSnack, 'en-US')],
];

interface Setup extends TrackingSetup {
  readonly stored?: MealTimes;
}

/** The meal times card over the test database, its editor open. */
async function openEditor({ stored, ...setup }: Setup = {}) {
  const user = userEvent.setup();
  const h = await openTracking(setup);
  if (stored) await h.repos.settingsRepo.set('meals.times', stored);
  h.mount(<MealTimesCard />);
  await untilShown('[data-ui="mealTimes.open"]');
  await user.click(screen.getByRole('button', { name: words.row }));
  await untilShown(EDITOR);
  return { ...h, user };
}

type Opened = Awaited<ReturnType<typeof openEditor>>;

/** Opens one start's wheel from the list; resolves with the wheel. */
async function openWheel(s: Opened, label: string): Promise<HTMLSelectElement> {
  await s.user.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  await untilShown('[data-ui="mealTimes.wheel"]');
  return screen.getByRole('combobox', { name: label }) as HTMLSelectElement;
}

/** The wheel's choices as minutes of the day. */
const minutesOf = (wheel: HTMLSelectElement): number[] =>
  within(wheel)
    .getAllByRole('option')
    .map((option) => Number((option as HTMLOptionElement).value));

/** Every quarter hour from `first` to `last`, inclusive. */
const quarters = (first: number, last: number): number[] =>
  Array.from({ length: (last - first) / 15 + 1 }, (_, index) => first + index * 15);

describe('MealTimesCard', () => {
  it('is the first card of the Tracking page, above the trackers', async () => {
    const h = await openTracking();
    h.mount(<TrackingPage />);
    await untilShown('[data-ui="water.settings"]');
    await untilShown('[data-ui="mealTimes.settings"]');

    const cards = Array.from(document.querySelectorAll('[data-ui="tracking"] > *')).map((card) =>
      card.getAttribute('data-ui'),
    );
    expect(cards.slice(0, 3)).toEqual(['mealTimes.settings', 'water.settings', 'fasting.settings']);
    expect(screen.getByRole('region', { name: words.heading })).toHaveTextContent(words.note);
  });

  it('opens the editor on the four starts with their times', async () => {
    const s = await openEditor();

    expect(screen.getByRole('dialog', { name: words.title })).toBeVisible();
    expect(listed()).toEqual(rowsFor(DEFAULT_MEAL_TIMES));
    expect(listed()[1]).toEqual([words.starts.lunch, clockText(720, 'en-US')]);
    expect(s.router.current().sheets).toContain('meal-times');
  });
});

describe('MealTimesSheet', () => {
  it("runs lunch's wheel from breakfast + 15 to dinner − 15 in quarter hours", async () => {
    const s = await openEditor();

    const wheel = await openWheel(s, words.starts.lunch);

    // 05:15 … 17:45 around the default 05:00 breakfast and 18:00 dinner.
    expect(minutesOf(wheel)).toEqual(quarters(315, 1_065));
    expect(wheel).toHaveValue('720');
    expect(within(wheel).getAllByRole('option')[0]).toHaveTextContent(clockText(315, 'en-US'));
  });

  it('keeps breakfast from midnight and the late snack up to 23:59', async () => {
    const s = await openEditor();

    expect(minutesOf(await openWheel(s, words.starts.breakfast))).toEqual(quarters(0, 705));
    await s.user.click(screen.getByRole('button', { name: common.common.cancel }));
    await untilShown('[data-ui="mealTimes.lateSnack"]');

    const snack = minutesOf(await openWheel(s, words.starts.lateSnack));
    expect(snack[0]).toBe(1_095);
    expect(snack.at(-1)).toBe(1_425);
  });

  it('offers a stored 07:07 among the quarter hours and opens on it', async () => {
    const stored = { breakfast: 427, lunch: 720, dinner: 1_080, lateSnack: 1_380 };
    const s = await openEditor({ stored });
    expect(listed()[0]).toEqual([words.starts.breakfast, clockText(427, 'en-US')]);

    const wheel = await openWheel(s, words.starts.breakfast);

    expect(wheel).toHaveValue('427');
    expect(minutesOf(wheel)).toEqual([...quarters(0, 420), 427, ...quarters(435, 705)]);

    // Leaving it untouched keeps 07:07.
    await s.user.click(screen.getByRole('button', { name: common.common.done }));
    await s.user.click(screen.getByRole('button', { name: common.common.save }));
    await untilGone(EDITOR);
    expect(await s.repos.settingsRepo.get('meals.times')).toEqual(stored);
  });

  it("narrows breakfast's and dinner's wheels to a lunch moved in the draft", async () => {
    const s = await openEditor();

    await s.user.selectOptions(await openWheel(s, words.starts.lunch), '690');
    await s.user.click(screen.getByRole('button', { name: common.common.done }));
    await untilShown('[data-ui="mealTimes.breakfast"]');
    expect(listed()[1]).toEqual([words.starts.lunch, clockText(690, 'en-US')]);

    expect(minutesOf(await openWheel(s, words.starts.breakfast)).at(-1)).toBe(675);
    await s.user.click(screen.getByRole('button', { name: common.common.cancel }));
    await untilShown('[data-ui="mealTimes.dinner"]');
    expect(minutesOf(await openWheel(s, words.starts.dinner))[0]).toBe(705);
  });

  it('puts 05:00, 12:00, 18:00 and 23:00 back with Restore default times, and Save stores them', async () => {
    const s = await openEditor({
      stored: { breakfast: 360, lunch: 690, dinner: 1_140, lateSnack: 1_410 },
    });

    await s.user.click(screen.getByRole('button', { name: words.restore }));
    expect(listed()).toEqual(rowsFor(DEFAULT_MEAL_TIMES));
    // Nothing is stored before Save.
    expect((await s.repos.settingsRepo.get('meals.times')).breakfast).toBe(360);

    await s.user.click(screen.getByRole('button', { name: common.common.save }));

    await untilGone(EDITOR);
    expect(await s.repos.settingsRepo.get('meals.times')).toEqual({
      breakfast: 300,
      lunch: 720,
      dinner: 1_080,
      lateSnack: 1_380,
    });
  });

  it('leaves the stored times as they were on Cancel, after changes in the draft', async () => {
    const s = await openEditor();

    await s.user.selectOptions(await openWheel(s, words.starts.dinner), '1140');
    await s.user.click(screen.getByRole('button', { name: common.common.done }));
    await s.user.click(screen.getByRole('button', { name: words.restore }));
    await s.user.selectOptions(await openWheel(s, words.starts.lunch), '660');
    await s.user.click(screen.getByRole('button', { name: common.common.done }));
    await untilShown('[data-ui="mealTimes.cancel"]');

    await s.user.click(screen.getByRole('button', { name: common.common.cancel }));

    await untilGone(EDITOR);
    expect(await s.repos.settingsRepo.get('meals.times')).toEqual(DEFAULT_MEAL_TIMES);
    // Opening again starts from the stored times.
    await s.user.click(screen.getByRole('button', { name: words.row }));
    await untilShown(EDITOR);
    expect(listed()).toEqual(rowsFor(DEFAULT_MEAL_TIMES));
  });

  it("goes back to the list, unchanged, from a start's wheel with its Cancel or Escape", async () => {
    const s = await openEditor();

    await s.user.selectOptions(await openWheel(s, words.starts.lunch), '660');
    await s.user.click(screen.getByRole('button', { name: common.common.cancel }));
    await untilShown('[data-ui="mealTimes.lunch"]');
    expect(listed()[1]).toEqual([words.starts.lunch, clockText(720, 'en-US')]);
    // Focus is back on the row it left.
    expect(document.activeElement).toBe(document.querySelector('[data-ui="mealTimes.lunch"]'));

    await s.user.selectOptions(await openWheel(s, words.starts.lunch), '660');
    await s.user.keyboard('{Escape}');
    await untilShown('[data-ui="mealTimes.lunch"]');
    expect(screen.getByRole('dialog', { name: words.title })).toBeVisible();
    expect(listed()[1]).toEqual([words.starts.lunch, clockText(720, 'en-US')]);
  });

  it('keeps the editor open with a message when the times cannot be saved', async () => {
    const s = await openEditor({
      wrap: (real) => ({
        ...real,
        setMealTimes: () => Promise.reject(new Error('disk full')),
      }),
    });

    await s.user.click(screen.getByRole('button', { name: words.restore }));
    await s.user.click(screen.getByRole('button', { name: common.common.save }));

    await settle(() => screen.queryByText(words.saveFailed) !== null);
    expect(screen.getByRole('dialog', { name: words.title })).toBeVisible();
    expect(screen.getByRole('button', { name: common.common.save })).toBeEnabled();
  });

  it('files an entry logged at 11:45 under lunch once lunch starts at 11:30 (ACC-J4-1)', async () => {
    const at1145 = fixedClock(Date.parse('2026-10-26T11:45:00-04:00'), 'America/New_York');
    const s = await openEditor({ clock: at1145 });

    await s.user.selectOptions(await openWheel(s, words.starts.lunch), '690');
    await s.user.click(screen.getByRole('button', { name: common.common.done }));
    await s.user.click(screen.getByRole('button', { name: common.common.save }));
    await untilGone(EDITOR);
    expect((await s.repos.settingsRepo.get('meals.times')).lunch).toBe(690);

    const manual = log.log.manual;
    let logged = false;
    s.mount(<ManualSheet open onClose={() => (logged = true)} dayKey="2026-10-26" />);
    await until(() =>
      (document.querySelector('[data-ui="manual.meal"]')?.textContent ?? '').includes('Lunch'),
    );
    const sheet = within(screen.getByRole('dialog', { name: manual.title }));
    fireEvent.change(sheet.getByLabelText(manual.name), { target: { value: 'Soup' } });
    fireEvent.change(sheet.getByLabelText(manual.energy.kcal), { target: { value: '300' } });
    await s.user.click(sheet.getByRole('button', { name: common.common.save }));

    // The sheet closes itself once the entry is in the diary.
    await settle(() => logged);
    const entries = await s.repos.diaryRepo.byDay('2026-10-26');
    expect(entries.map((entry) => [entry.name, entry.meal])).toEqual([['Soup', 'lunch']]);
  });
});
