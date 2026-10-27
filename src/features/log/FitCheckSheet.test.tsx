import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiaryEntry, Targets } from '../../domain/model';
import { mergePartitions } from '../../i18n/catalogue';
import { enPartitions } from '../../i18n/en';
import { ai } from '../../i18n/en/ai';
import { common } from '../../i18n/en/common';
import { fitCheck as fitCheckWords } from '../../i18n/en/fitCheck';
import { lintCatalogue } from '../../i18n/lint';
import { ServicesProvider } from '../../services/context';
import type { FitCheckInput, FitCheckOutcome, FitCheckService } from '../../services/fitCheck';
import { FACTORY_NOW, makeDraft, makeEntry, makeProfile } from '../../test/factories';
import { closeHarnesses, openHarness, until, untilShown } from '../../test/screenHarness';
import { FIT_CHECK_DEBOUNCE_MS, FitCheckSheet } from './FitCheckSheet';
import type { ReviewFood } from './review/ReviewSheet';

afterEach(async () => {
  vi.useRealTimers();
  await closeHarnesses();
});

const words = fitCheckWords.fitCheck;
/** The timers faked: fake-indexeddb runs on setImmediate, which stays real. */
const FAKED = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] as const;
const GOALS: Targets = { kcal: 2_000, protein: 110, carbs: 230, fat: 65 };
/** Yesterday evening, the day before the picked date. */
const YESTERDAY = FACTORY_NOW - 18 * 60 * 60 * 1000;

function foodOf(overrides: Partial<ReviewFood['draft']> = {}, loggedAt = FACTORY_NOW): ReviewFood {
  return {
    draft: makeDraft({
      name: 'Pasta bake',
      kcal: 700,
      protein: 50,
      carbs: 80,
      fat: 28,
      ...overrides,
    }),
    loggedAt,
    meal: 'lunch',
    source: 'photo',
    photoIds: [],
  };
}

/** A fit-check service whose answers the test gives, one call at a time. */
function standInFitCheck() {
  const calls: Array<{
    readonly input: FitCheckInput;
    readonly cancel: AbortSignal;
    readonly answer: (outcome: FitCheckOutcome) => Promise<void>;
  }> = [];
  const service: FitCheckService = {
    suggest: vi.fn(
      (input: FitCheckInput, cancel: AbortSignal) =>
        new Promise<FitCheckOutcome>((resolve) => {
          calls.push({
            input,
            cancel,
            answer: (outcome) => act(async () => resolve(outcome)),
          });
        }),
    ),
  };
  return { service, calls };
}

interface Setup {
  readonly entries?: readonly DiaryEntry[];
  readonly goals?: Partial<Targets> | null;
  readonly energy?: 'kcal' | 'kJ';
  readonly service?: FitCheckService | null;
  readonly food?: ReviewFood;
}

/** The fit check over a test database; `setFood` changes the meal as the review would. */
async function openFitCheck(setup: Setup = {}) {
  const h = await openHarness();
  if (setup.goals !== null)
    await h.repos.profileRepo.save(makeProfile({ saved: setup.goals ?? GOALS }));
  for (const entry of setup.entries ?? []) await h.repos.diaryRepo.add(entry);
  if (setup.energy) await h.repos.settingsRepo.set('units.energy', setup.energy);
  const standIn = standInFitCheck();
  const service = setup.service === undefined ? standIn.service : setup.service;
  const onClose = vi.fn();
  let setFood: (food: ReviewFood) => void = () => undefined;
  function Host() {
    const [food, set] = useState(setup.food ?? foodOf());
    setFood = set;
    return <FitCheckSheet food={food} onClose={onClose} />;
  }
  const view = h.mount(
    <ServicesProvider services={{ ...h.services, fitCheck: service ?? undefined }}>
      <Host />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="fitCheck.row.energy"]');
  return {
    ...h,
    ...standIn,
    onClose,
    unmount: view.unmount,
    setFood: (food: ReviewFood) => act(() => setFood(food)),
  };
}

const hooked = (hook: string) => document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);
const textOf = (hook: string) => hooked(hook)?.textContent ?? '';

/** The day before the meal: 1 500 kcal, 70 g protein, 180 g carbs, 50 g fat. */
const BREAKFAST = makeEntry({
  name: 'Granola',
  kcal: 900,
  protein: 40,
  carbs: 110,
  fat: 30,
  loggedAt: FACTORY_NOW - 4 * 60 * 60 * 1000,
});
const SNACK = makeEntry({
  name: 'Toast',
  kcal: 600,
  protein: 30,
  carbs: 70,
  fat: 20,
  loggedAt: FACTORY_NOW - 60 * 60 * 1000,
});
const DAY = [SNACK, BREAKFAST];

/** One turn of the database, and the zero-delay timers live queries start with, under fake time. */
async function turnOnFakeTimers(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  });
}

async function untilOnFakeTimers(check: () => boolean): Promise<void> {
  for (let turn = 0; turn < 500; turn++) {
    if (check()) return;
    await turnOnFakeTimers();
  }
  throw new Error('untilOnFakeTimers: the check never held');
}

describe('FitCheckSheet: the day with the meal', () => {
  it('shows a day at 1,500 of 2,000 plus 700 as +700 and 2,200 / 2,000, 200 over and highlighted (ACC-D11-1)', async () => {
    await openFitCheck({ entries: DAY });
    expect(screen.getByRole('dialog', { name: words.title })).toBeInTheDocument();
    expect(textOf('fitCheck.row.energy.added')).toBe('+700 kcal');
    expect(textOf('fitCheck.row.energy.after')).toBe('2,200 / 2,000 kcal');
    expect(textOf('fitCheck.row.energy.remaining')).toBe('200 kcal over');
    expect(hooked('fitCheck.row.energy.remaining')).toHaveAttribute('data-over', 'true');
  });

  it('never highlights protein over its goal, while carbs and fat over theirs are', async () => {
    await openFitCheck({ entries: DAY });
    expect(textOf('fitCheck.row.protein.after')).toBe('120 / 110 g');
    expect(textOf('fitCheck.row.protein.remaining')).toBe('10 g over');
    expect(hooked('fitCheck.row.protein.remaining')).not.toHaveAttribute('data-over');
    expect(textOf('fitCheck.row.carbs.remaining')).toBe('30 g over');
    expect(hooked('fitCheck.row.carbs.remaining')).toHaveAttribute('data-over', 'true');
    expect(textOf('fitCheck.row.fat.remaining')).toBe('13 g over');
    expect(hooked('fitCheck.row.fat.remaining')).toHaveAttribute('data-over', 'true');
  });

  it('says what is left, unhighlighted, under the goal and exactly at it', async () => {
    await openFitCheck({ entries: [BREAKFAST], food: foodOf({ kcal: 1_100, carbs: 20.25 }) });
    expect(textOf('fitCheck.row.energy.after')).toBe('2,000 / 2,000 kcal');
    expect(textOf('fitCheck.row.energy.remaining')).toBe('0 kcal left');
    expect(hooked('fitCheck.row.energy.remaining')).not.toHaveAttribute('data-over');
    expect(textOf('fitCheck.row.carbs.after')).toBe('130.3 / 230 g');
    expect(textOf('fitCheck.row.carbs.remaining')).toBe('99.7 g left');
  });

  it('counts only the entries of the picked date', async () => {
    const lastNight = makeEntry({ kcal: 450, loggedAt: YESTERDAY });
    const today = await openFitCheck({ entries: [...DAY, lastNight] });
    expect(textOf('fitCheck.row.energy.after')).toBe('2,200 / 2,000 kcal');
    today.unmount();

    await openFitCheck({ entries: [...DAY, lastNight], food: foodOf({}, YESTERDAY) });
    expect(textOf('fitCheck.row.energy.after')).toBe('1,150 / 2,000 kcal');
  });

  it('shows energy in kJ when the person reads kJ', async () => {
    await openFitCheck({ entries: DAY, energy: 'kJ' });
    expect(textOf('fitCheck.row.energy.added')).toBe('+2,929 kJ');
    expect(textOf('fitCheck.row.energy.after')).toBe('9,205 / 8,368 kJ');
    expect(textOf('fitCheck.row.energy.remaining')).toBe('837 kJ over');
  });

  it('shows the day without goals, and asks for no suggestion, without a profile', async () => {
    const { service } = await openFitCheck({ entries: DAY, goals: null });
    expect(textOf('fitCheck.row.energy.after')).toBe('2,200 kcal');
    expect(hooked('fitCheck.row.energy.remaining')).toBeNull();
    expect(screen.getByText(words.noGoals)).toBeInTheDocument();
    expect(textOf('fitCheck.suggestion.noProfile')).toBe(words.suggestion.noProfile);
    expect(service.suggest).not.toHaveBeenCalled();
  });

  it('closes on Done and logs nothing', async () => {
    const { onClose, repos } = await openFitCheck({ entries: DAY });
    fireEvent.click(screen.getByRole('button', { name: common.common.done }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await repos.diaryRepo.byDay('2026-10-26')).toHaveLength(2);
  });
});

describe('FitCheckSheet: the suggestion', () => {
  it('asks on open with the meal, the day in order and the goals, and shows the text as plain text', async () => {
    const { calls } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    expect(textOf('fitCheck.suggestion.loading')).toBe(words.suggestion.loading);
    const { input } = calls[0] ?? {};
    expect(input).toMatchObject({
      today: '2026-10-26',
      units: { energy: 'kcal', weight: 'lb', height: 'ftIn' },
      targets: GOALS,
      eaten: { kcal: 1_500, protein: 70, carbs: 180, fat: 50 },
      meal: { name: 'Pasta bake', kcal: 700, protein: 50, carbs: 80, fat: 28 },
    });
    expect(input?.todaysMeals.map((meal) => meal.name)).toEqual(['Granola', 'Toast']);

    await calls[0]?.answer({ kind: 'text', text: 'It fits if dinner stays light.' });
    const answer = hooked('fitCheck.suggestion.text');
    expect(answer?.tagName).toBe('P');
    expect(answer).toHaveTextContent('It fits if dinner stays light.');
  });

  it('shows the failure with Retry, which asks again at once (ACC-D11-2)', async () => {
    const { calls } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    await calls[0]?.answer({ kind: 'failed', messages: [{ key: 'ai.failure.rateLimit' }] });

    expect(
      within(hooked('fitCheck.suggestion') as HTMLElement).getByRole('alert'),
    ).toHaveTextContent(ai.ai.failure.rateLimit);
    fireEvent.click(screen.getByRole('button', { name: common.common.retry }));
    expect(calls).toHaveLength(2);
    expect(textOf('fitCheck.suggestion.loading')).toBe(words.suggestion.loading);
    await calls[1]?.answer({ kind: 'text', text: 'Fine as it is.' });
    expect(textOf('fitCheck.suggestion.text')).toBe('Fine as it is.');
  });

  it('shows a neutral line for an empty answer', async () => {
    const { calls } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    await calls[0]?.answer({ kind: 'empty' });
    expect(textOf('fitCheck.suggestion.empty')).toBe(words.suggestion.empty);
  });

  it('says where to add a key when no AI is set up, with no Retry', async () => {
    const { calls } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    await calls[0]?.answer({ kind: 'noKey' });
    expect(textOf('fitCheck.suggestion.noKey')).toBe(words.suggestion.noKey);
    expect(screen.queryByRole('button', { name: common.common.retry })).toBeNull();
  });

  it('stops the request when the sheet goes', async () => {
    const { calls, unmount } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    unmount();
    expect(calls[0]?.cancel.aborted).toBe(true);
  });

  it('asks again once after the debounce when the amount changes, not before, and once for quick changes', async () => {
    const { calls, setFood } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    await calls[0]?.answer({ kind: 'text', text: 'First.' });
    vi.useFakeTimers({ toFake: [...FAKED] });

    setFood(foodOf({ kcal: 800 }));
    expect(textOf('fitCheck.suggestion.loading')).toBe(words.suggestion.loading);
    await act(() => vi.advanceTimersByTimeAsync(FIT_CHECK_DEBOUNCE_MS / 2));
    setFood(foodOf({ kcal: 900 }));
    await act(() => vi.advanceTimersByTimeAsync(FIT_CHECK_DEBOUNCE_MS - 1));
    expect(calls).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.input.meal.kcal).toBe(900);
    await act(() => vi.advanceTimersByTimeAsync(FIT_CHECK_DEBOUNCE_MS * 4));
    expect(calls).toHaveLength(2);
  });

  it('stops a running request and asks again after the debounce when the day gains an entry', async () => {
    const { calls, repos } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    vi.useFakeTimers({ toFake: [...FAKED] });

    await act(async () => {
      await repos.diaryRepo.add(
        makeEntry({ name: 'Apple', kcal: 95, loggedAt: FACTORY_NOW - 1_000 }),
      );
    });
    await untilOnFakeTimers(() => textOf('fitCheck.row.energy.after') === '2,295 / 2,000 kcal');
    expect(calls[0]?.cancel.aborted).toBe(true);
    expect(calls).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(FIT_CHECK_DEBOUNCE_MS));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.input.todaysMeals).toHaveLength(3);
  });

  it('asks again after the debounce when the goals change', async () => {
    const { calls, repos } = await openFitCheck({ entries: DAY });
    await until(() => calls.length === 1);
    await calls[0]?.answer({ kind: 'text', text: 'First.' });
    vi.useFakeTimers({ toFake: [...FAKED] });

    await act(async () => {
      await repos.profileRepo.save(makeProfile({ saved: { ...GOALS, kcal: 2_400 } }));
    });
    await untilOnFakeTimers(() => textOf('fitCheck.row.energy.after') === '2,200 / 2,400 kcal');
    expect(calls).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(FIT_CHECK_DEBOUNCE_MS));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.input.targets.kcal).toBe(2_400);
  });
});

describe('the fitCheck partition', () => {
  it('passes the catalogue lint merged with the other partitions', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(Object.keys(mergePartitions(enPartitions))).toContain('fitCheck');
  });
});
