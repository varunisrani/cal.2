import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppState } from '../../../app/appState';
import { createDraftsRepo } from '../../../data/repos/draftsRepo';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import { createSecretsRepo } from '../../../data/repos/secretsRepo';
import type { AnalysisDraft, NutritionDraft } from '../../../domain/model';
import { mergePartitions } from '../../../i18n/catalogue';
import { enPartitions } from '../../../i18n/en';
import { common } from '../../../i18n/en/common';
import { log as logWords } from '../../../i18n/en/log';
import { review } from '../../../i18n/en/review';
import { lintCatalogue } from '../../../i18n/lint';
import { fixedClock, type Clock } from '../../../lib/clock';
import {
  createAnalysisService,
  type AnalysisService,
  type AnalysisState,
} from '../../../services/analysis';
import { ServicesProvider } from '../../../services/context';
import type { DiaryService, LogContext, LogResult } from '../../../services/diary';
import { storableBlob } from '../../../test/blobs';
import {
  FACTORY_NOW,
  makeAnalysisDraft,
  makeDraft,
  makeEntry,
  makeFast,
  makeLine,
} from '../../../test/factories';
import { closeHarnesses, openHarness, untilShown } from '../../../test/screenHarness';
import {
  AnalysisReview,
  ReviewSheet,
  type FitCheckSlot,
  type IngredientsSlot,
  type ReviewSlots,
} from './ReviewSheet';

afterEach(closeHarnesses);

const words = review.review;
const meals = logWords.log.meal;
/** Monday 26 October 2026, 21:00 in New York: every time of that day can be picked. */
const EVENING = Date.parse('2026-10-26T21:00:00-04:00');
const LOGGED: LogResult = { kind: 'logged', entry: makeEntry() };

/** A diary service that records what it is asked to log. */
function recordingDiary(result: LogResult = LOGGED) {
  return {
    logEntry: vi.fn<DiaryService['logEntry']>(async () => result),
    deleteEntry: vi.fn<DiaryService['deleteEntry']>(),
  };
}

interface Setup {
  readonly review?: AnalysisDraft;
  readonly clock?: Clock;
  readonly diary?: DiaryService;
  readonly slots?: ReviewSlots;
  readonly gramsFirst?: boolean;
}

/** The open sheet over a test database (the real diary service unless one is given). */
async function openReview({ review: draft, clock, diary, slots, gramsFirst }: Setup = {}) {
  const h = await openHarness({ clock, diary });
  if (gramsFirst) await h.repos.settingsRepo.set('log.gramsFirst', true);
  const onClose = vi.fn();
  const view = h.mount(
    <ReviewSheet review={draft ?? makeAnalysisDraft()} onClose={onClose} slots={slots} />,
  );
  await untilShown('[data-ui="review.amount"]');
  const sheet = within(screen.getByRole('dialog', { name: words.title }));
  return { ...h, onClose, sheet, unmount: view.unmount };
}

type Sheet = Awaited<ReturnType<typeof openReview>>['sheet'];

const logButton = (sheet: Sheet) => sheet.getByRole('button', { name: words.log });
const mealShown = () => document.querySelector('[data-ui="review.meal"]')?.textContent ?? '';
const hooked = (hook: string) => document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);

function setWhen(part: 'date' | 'time', value: string) {
  fireEvent.change(hooked(`review.when.${part}`) as HTMLElement, { target: { value } });
}

async function pressLog(sheet: Sheet) {
  await act(async () => {
    fireEvent.click(logButton(sheet));
  });
}

/** The draft and context of the one logEntry call. */
function logged(diary: ReturnType<typeof recordingDiary>) {
  expect(diary.logEntry).toHaveBeenCalledTimes(1);
  const [draft, ctx] = diary.logEntry.mock.calls[0] as [NutritionDraft, LogContext];
  return { draft, ctx };
}

/** Lets one round of queued tasks run (IndexedDB callbacks), inside act. No timer is involved. */
function nextTask(): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
          channel.port1.close();
          resolve();
        };
        channel.port2.postMessage(null);
      }),
  );
}

/**
 * Runs tasks until `check()` holds. The limit is a time, not a count of rounds: a key read opens
 * the stored key with WebCrypto, which answers on the clock (in a thread of its own), and a loaded
 * machine runs any number of rounds before it does.
 */
async function settle(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 3_000;
  while (!(await check())) {
    if (performance.now() > deadline)
      throw new Error('The review never reached the expected state');
    await nextTask();
  }
}

describe('ReviewSheet', () => {
  it('is a sheet titled Review food that only Cancel and Log close, with Fit check when its slot is given', async () => {
    const fitCheck = vi.fn(({ food, onClose }: FitCheckSlot) => (
      <button type="button" onClick={onClose}>
        {`Fit check for ${food.draft.name}, ${food.draft.kcal} kcal at ${food.meal}`}
      </button>
    ));
    const { sheet, onClose } = await openReview({ slots: { fitCheck } });
    const user = userEvent.setup();
    expect(sheet.getByRole('button', { name: common.common.cancel })).toBeEnabled();
    expect(logButton(sheet)).toBeEnabled();

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: words.title })).toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: words.fitCheck }));
    await user.click(
      screen.getByRole('button', { name: 'Fit check for Lentil soup, 410 kcal at lunch' }),
    );
    expect(screen.queryByRole('button', { name: /^Fit check for/ })).toBeNull();

    await user.click(sheet.getByRole('button', { name: common.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no Fit check until its slot is given', async () => {
    const { sheet } = await openReview();
    expect(sheet.queryByRole('button', { name: words.fitCheck })).toBeNull();
  });

  it('suggests the meal for the picked time: 08:00 is breakfast and 19:30 dinner (ACC-D7-1, R02.13, D-16.16)', async () => {
    const diary = recordingDiary();
    const { sheet } = await openReview({ clock: fixedClock(EVENING, 'America/New_York'), diary });
    expect(mealShown()).toContain(meals.dinner);

    setWhen('time', '08:00');
    expect(mealShown()).toContain(meals.breakfast);
    setWhen('time', '19:30');
    expect(mealShown()).toContain(meals.dinner);

    await pressLog(sheet);
    const { ctx } = logged(diary);
    expect(ctx.meal).toBe('dinner');
    expect(ctx.loggedAt).toBe(Date.parse('2026-10-26T19:30:00-04:00'));
  });

  it('keeps the meal the person picked when the time changes', async () => {
    const diary = recordingDiary();
    const { sheet } = await openReview({ clock: fixedClock(EVENING, 'America/New_York'), diary });
    fireEvent.click(hooked('review.meal') as HTMLElement);
    const picker = within(screen.getByRole('dialog', { name: words.meal.picker }));
    fireEvent.click(picker.getByRole('option', { name: meals.snack }));

    setWhen('time', '08:00');
    expect(mealShown()).toContain(meals.snack);
    await pressLog(sheet);
    expect(logged(diary).ctx.meal).toBe('snack');
  });

  it('logs at the opening instant to the millisecond while the date and time are untouched', async () => {
    const opened = FACTORY_NOW + 41_250;
    const diary = recordingDiary();
    const { sheet } = await openReview({ clock: fixedClock(opened, 'America/New_York'), diary });
    expect(hooked('review.when.time')).toHaveValue('12:30');
    await pressLog(sheet);
    expect(logged(diary).ctx.loggedAt).toBe(opened);
  });

  it('logs on a picked earlier day at the picked minute, and refuses a time after now', async () => {
    const diary = recordingDiary();
    const { sheet } = await openReview({ diary });
    setWhen('time', '18:45');
    // Today is held at now (12:30): the future cannot be picked.
    expect(hooked('review.when.time')).toHaveValue('12:30');
    setWhen('date', '2026-10-24');
    setWhen('time', '18:45');
    expect(mealShown()).toContain(meals.dinner);
    expect(hooked('review.when.date')).toHaveAttribute('min', '2016-10-26');

    await pressLog(sheet);
    expect(logged(diary).ctx.loggedAt).toBe(Date.parse('2026-10-24T18:45:00-04:00'));
  });

  it('opens on the day Home shows: an earlier day at the current clock time, with the meal for it (P07-02, D-16.16)', async () => {
    const diary = recordingDiary();
    const h = await openHarness({ clock: fixedClock(EVENING + 41_250, 'America/New_York'), diary });
    // Home shows Saturday; a reuse pick, a typed meal or a photo opens its review now.
    h.appState.selectDay('2026-10-24');
    h.mount(<ReviewSheet review={makeAnalysisDraft()} onClose={vi.fn()} />);
    await untilShown('[data-ui="review.amount"]');

    expect(hooked('review.when.date')).toHaveValue('2026-10-24');
    expect(hooked('review.when.time')).toHaveValue('21:00');
    expect(mealShown()).toContain(meals.dinner);
    await pressLog(within(screen.getByRole('dialog', { name: words.title })));
    const { ctx } = logged(diary);
    expect(ctx.loggedAt).toBe(Date.parse('2026-10-24T21:00:41.250-04:00'));
    expect(ctx.meal).toBe('dinner');
  });

  it('writes one entry when Log is pressed twice (ACC-D7-2, R02.11)', async () => {
    const { sheet, onClose, db } = await openReview();
    await act(async () => {
      fireEvent.click(logButton(sheet));
      fireEvent.click(logButton(sheet));
    });
    await settle(() => onClose.mock.calls.length > 0);
    fireEvent.click(logButton(sheet));
    for (let round = 0; round < 5; round++) await nextTask();

    expect(onClose).toHaveBeenCalledTimes(1);
    const entries = await db.entries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Lentil soup', kcal: 410, meal: 'lunch' });
  });

  it('logs the analysed name when the name is left blank, and a typed one trimmed', async () => {
    const blank = recordingDiary();
    const first = await openReview({ diary: blank });
    fireEvent.change(first.sheet.getByRole('textbox', { name: words.name }), {
      target: { value: '   ' },
    });
    await pressLog(first.sheet);
    expect(logged(blank).draft.name).toBe('Lentil soup');
    first.unmount();

    const typed = recordingDiary();
    const second = await openReview({ diary: typed });
    fireEvent.change(second.sheet.getByRole('textbox', { name: words.name }), {
      target: { value: '  Red lentil soup ' },
    });
    await pressLog(second.sheet);
    expect(logged(typed).draft.name).toBe('Red lentil soup');
  });

  it('logs every value at the shown amount with the shown grams, the note, the steps flag, the photos and the source', async () => {
    const diary = recordingDiary();
    const draft = makeDraft({ note: 'No cream', progressive: true, emoji: '🍲' });
    const { sheet } = await openReview({
      diary,
      review: makeAnalysisDraft({ draft, photoIds: ['photo-1', 'photo-2'], source: 'photo' }),
    });
    // The draft's bowl first; then grams, and half the bowl.
    expect(sheet.getByRole('combobox', { name: words.serving.unit })).toHaveValue('bowl');
    fireEvent.change(sheet.getByRole('combobox', { name: words.serving.unit }), {
      target: { value: 'g' },
    });
    fireEvent.change(sheet.getByRole('textbox', { name: words.serving.amount }), {
      target: { value: '210' },
    });
    expect(hooked('review.kcal')).toHaveTextContent('205');

    await pressLog(sheet);
    const { draft: stored, ctx } = logged(diary);
    expect(stored).toEqual({
      ...draft,
      kcal: 205,
      protein: 12,
      carbs: 29,
      fat: 4.75,
      nutrients: { fibre: 7, sodium: 410 },
      basis: { kind: 'grams', grams: 210 },
      units: [{ unit: 'bowl', gramsEach: 420, count: 0.5 }],
    });
    expect(ctx).toEqual({
      loggedAt: FACTORY_NOW,
      meal: 'lunch',
      source: 'photo',
      photoIds: ['photo-1', 'photo-2'],
    });
  });

  it('logs a food of unknown weight as its serving count, and a typed meal as text', async () => {
    const diary = recordingDiary();
    const draft = makeDraft({ basis: { kind: 'servings', count: 1 }, units: [] });
    const { sheet } = await openReview({
      diary,
      review: makeAnalysisDraft({ draft, photoIds: [], source: undefined }),
    });
    fireEvent.change(sheet.getByRole('textbox', { name: words.serving.amount }), {
      target: { value: '1.5' },
    });
    await pressLog(sheet);
    const { draft: stored, ctx } = logged(diary);
    expect(stored.basis).toEqual({ kind: 'servings', count: 1.5 });
    expect(stored.kcal).toBe(615);
    expect(stored.chosenUnit).toBeUndefined();
    expect(ctx.source).toBe('text');
  });

  it('keeps the sheet open behind the paused dialog while a fast is running, and logs once it ends', async () => {
    const { sheet, onClose, db } = await openReview();
    const fast = makeFast({ end: null, start: FACTORY_NOW - 3_600_000 });
    await db.fasts.put(fast);

    fireEvent.click(logButton(sheet));
    await settle(() => hooked('fasting.paused') !== null);
    fireEvent.click(hooked('fasting.paused.cancel') as HTMLElement);
    await settle(() => logButton(sheet).getAttribute('aria-busy') === null);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: words.title })).toBeInTheDocument();
    expect(await db.entries.count()).toBe(0);

    await db.fasts.put({ ...fast, end: FACTORY_NOW });
    fireEvent.click(logButton(sheet));
    await settle(() => onClose.mock.calls.length > 0);
    expect(await db.entries.count()).toBe(1);
  });

  it('keeps the sheet open with a message when the entry cannot be stored', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diary = recordingDiary();
    diary.logEntry.mockRejectedValueOnce(new Error('quota'));
    const { sheet, onClose } = await openReview({ diary });
    await pressLog(sheet);
    expect(hooked('toast.message')).toHaveTextContent(words.failed);
    expect(onClose).not.toHaveBeenCalled();

    await pressLog(sheet);
    expect(diary.logEntry).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens in grams when grams come first, else in the unit the draft chose (ACC-J2-2)', async () => {
    const draft = makeDraft({ chosenUnit: 'bowl', chosenCount: 1 });
    const first = await openReview({ review: makeAnalysisDraft({ draft }), gramsFirst: true });
    expect(first.sheet.getByRole('combobox', { name: words.serving.unit })).toHaveValue('g');
    expect(first.sheet.getByRole('textbox', { name: words.serving.amount })).toHaveValue('420');
    first.unmount();

    const second = await openReview({ review: makeAnalysisDraft({ draft }) });
    expect(second.sheet.getByRole('combobox', { name: words.serving.unit })).toHaveValue('bowl');
    expect(second.sheet.getByRole('textbox', { name: words.serving.amount })).toHaveValue('1');
  });

  it("opens with the lines' sum as the header (R02.4) and lets the next line change replace values edited through the unlock (R02.5)", async () => {
    const draft = makeDraft({
      kcal: 999,
      protein: 1,
      basis: { kind: 'grams', grams: 400 },
      units: [],
      nutrients: { sodium: 400 },
      lines: [
        makeLine({ name: 'Rice', grams: 150, kcal: 168, protein: 3.5, carbs: 35, fat: 1.4 }),
        makeLine({ name: 'Dal', grams: 250, kcal: 230, protein: 14, carbs: 30, fat: 6 }),
      ],
    });
    const ingredients = ({ lines, onLinesChange }: IngredientsSlot) => (
      <button
        type="button"
        onClick={() =>
          onLinesChange(lines.map((line) => (line.name === 'Dal' ? { ...line, kcal: 250 } : line)))
        }
      >
        More dal
      </button>
    );
    const diary = recordingDiary();
    const { sheet } = await openReview({
      diary,
      review: makeAnalysisDraft({ draft }),
      slots: { ingredients },
    });
    expect(hooked('review.kcal')).toHaveTextContent('398');
    expect(hooked('review.protein')).toHaveTextContent('17.5');

    fireEvent.click(sheet.getByRole('button', { name: words.nutrition.unlock }));
    expect(hooked('review.nutrition.hint')).toHaveTextContent(words.nutrition.linesHint);
    fireEvent.change(sheet.getByRole('textbox', { name: words.nutrition.energy.kcal }), {
      target: { value: '500' },
    });
    expect(sheet.getByRole('textbox', { name: words.nutrition.energy.kcal })).toHaveValue('500');

    fireEvent.click(sheet.getByRole('button', { name: 'More dal' }));
    expect(sheet.getByRole('textbox', { name: words.nutrition.energy.kcal })).toHaveValue('418');
    fireEvent.click(sheet.getByRole('button', { name: words.nutrition.lock }));
    expect(hooked('review.kcal')).toHaveTextContent('418');

    await pressLog(sheet);
    const { draft: stored } = logged(diary);
    expect(stored.kcal).toBe(418);
    // The weight did not change, so sodium did not stretch.
    expect(stored.nutrients.sodium).toBe(400);
  });

  it('shares one lock between the nutrition rows and the micronutrients, locked at first', async () => {
    const { sheet } = await openReview();
    fireEvent.click(sheet.getByRole('button', { name: words.more.heading }));
    expect(hooked('review.more.sodium')).toHaveTextContent('820');
    expect(sheet.queryAllByRole('textbox', { name: words.nutrient.sodium })).toHaveLength(0);

    fireEvent.click(sheet.getByRole('button', { name: words.nutrition.unlock }));
    expect(sheet.getByRole('textbox', { name: words.nutrient.sodium })).toHaveValue('820');
    expect(sheet.getByRole('textbox', { name: words.nutrition.protein })).toHaveValue('24');

    fireEvent.click(sheet.getByRole('button', { name: words.nutrition.lock }));
    expect(sheet.queryAllByRole('textbox', { name: words.nutrient.sodium })).toHaveLength(0);
  });

  it('shows the emoji when there are no photos, and fills the slots it is given', async () => {
    const product = {
      barcode: '4006381333931',
      allergens: [],
      traces: [],
      labels: [],
      categories: [],
    };
    await openReview({
      review: makeAnalysisDraft({
        draft: makeDraft({ emoji: '🍲', product }),
        photoIds: [],
        fromSavedLabel: true,
      }),
      slots: {
        savedLabelNotice: <p>Saved label notice</p>,
        allergenLine: (food) => <p>{`Allergens of ${food.draft.name}`}</p>,
        productBlock: (info) => <p>{`Product ${info.barcode}`}</p>,
      },
    });
    expect(hooked('review.emoji')).toHaveTextContent('🍲');
    expect(screen.getByText('Saved label notice')).toBeInTheDocument();
    expect(screen.getByText('Allergens of Lentil soup')).toBeInTheDocument();
    expect(screen.getByText('Product 4006381333931')).toBeInTheDocument();
  });

  it('leaves out the saved-label notice for a draft that did not come from a saved label', async () => {
    await openReview({ slots: { savedLabelNotice: <p>Saved label notice</p> } });
    expect(screen.queryByText('Saved label notice')).toBeNull();
  });

  it('hooks every control for tests', async () => {
    await openReview();
    for (const hook of [
      'review',
      'review.cancel',
      'review.log',
      'review.name',
      'review.serving',
      'review.amount',
      'review.unit',
      'review.grams',
      'review.nutrition',
      'review.lock',
      'review.kcal',
      'review.protein',
      'review.carbs',
      'review.fat',
      'review.more',
      'review.meal',
      'review.when',
    ]) {
      expect(hooked(hook), hook).not.toBeNull();
    }
  });
});

// ---- The review of the app's analysis -------------------------------------------------------

/** An analysis that only holds a state, with closeReview going back to idle. */
function standInAnalysis(initial: AnalysisState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: AnalysisState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const service: AnalysisService = {
    getSnapshot: () => state,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    start: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    closeReview: vi.fn(async () => set({ phase: 'idle' })),
    restore: vi.fn(),
  };
  return { service, set };
}

describe('AnalysisReview', () => {
  it('opens while the analysis has a draft waiting, and hands it back on Cancel', async () => {
    const h = await openHarness();
    const { service, set } = standInAnalysis({ phase: 'idle' });
    h.mount(
      <ServicesProvider services={{ ...h.services, analysis: service }}>
        <AnalysisReview />
      </ServicesProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => set({ phase: 'reviewReady', draft: makeAnalysisDraft(), generation: 4 }));
    await untilShown('[data-ui="review.amount"]');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: common.common.cancel }));
    });
    expect(service.closeReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: words.title })).toBeNull();
  });

  it('lets the draft and its photo go on Cancel, and keeps the photo a logged entry names', async () => {
    const h = await openHarness();
    const draftsRepo = createDraftsRepo(h.db);
    const photoRepo = createPhotoRepo(h.db);
    const analysis = createAnalysisService({
      draftsRepo,
      photoRepo,
      settingsRepo: h.repos.settingsRepo,
      secretsRepo: createSecretsRepo(h.db),
      overlay: createAppState(),
      fetch: vi.fn<typeof fetch>(),
      clock: h.clock,
    });
    const closing: Promise<void>[] = [];
    const watched: AnalysisService = {
      ...analysis,
      closeReview: () => {
        const done = analysis.closeReview();
        closing.push(done);
        return done;
      },
    };
    const stage = async (): Promise<string> => {
      const photoId = await photoRepo.put(await storableBlob(1_000), { width: 1200, height: 900 });
      const { generation } = await draftsRepo.begin();
      await draftsRepo.saveResult(generation, makeAnalysisDraft({ photoIds: [photoId] }));
      await act(() => analysis.restore());
      await untilShown('[data-ui="review.amount"]');
      return photoId;
    };
    h.mount(
      <ServicesProvider services={{ ...h.services, analysis: watched }}>
        <AnalysisReview />
      </ServicesProvider>,
    );

    const cancelled = await stage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: common.common.cancel }));
      await Promise.all(closing.splice(0));
    });
    expect(analysis.getSnapshot().phase).toBe('idle');
    expect(await draftsRepo.load()).toBeNull();
    expect(await photoRepo.get(cancelled)).toBeNull();

    const kept = await stage();
    fireEvent.click(screen.getByRole('button', { name: words.log }));
    await settle(() => closing.length > 0);
    await act(async () => {
      await Promise.all(closing.splice(0));
    });
    expect(analysis.getSnapshot().phase).toBe('idle');
    expect(await draftsRepo.load()).toBeNull();
    expect((await photoRepo.get(kept))?.id).toBe(kept);
    expect((await h.db.entries.toArray()).map((entry) => entry.photoIds)).toEqual([[kept]]);
  });
});

describe('the review partition', () => {
  it('passes the catalogue lint merged with the other partitions', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(Object.keys(mergePartitions(enPartitions))).toContain('review');
  });
});
