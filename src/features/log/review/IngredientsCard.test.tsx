import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImageBackend } from '../../../ai/image';
import { DEFAULT_AI_SETTINGS } from '../../../ai/settings';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import type { AnalysisDraft, IngredientLine, NutritionDraft } from '../../../domain/model';
import { mergePartitions } from '../../../i18n/catalogue';
import { enPartitions } from '../../../i18n/en';
import { ai } from '../../../i18n/en/ai';
import { common } from '../../../i18n/en/common';
import { ingredients } from '../../../i18n/en/ingredients';
import { review } from '../../../i18n/en/review';
import { lintCatalogue } from '../../../i18n/lint';
import type { AnalysisService, AnalysisState } from '../../../services/analysis';
import { ServicesProvider } from '../../../services/context';
import type { DiaryService, LogContext, LogResult } from '../../../services/diary';
import {
  createIngredientIntake,
  type IngredientIntakeService,
  type IntakeOutcome,
  type IntakeSession,
} from '../../../services/ingredientIntake';
import { createPhotoService } from '../../../services/photos';
import { createFakeCodec } from '../../../test/fakeImageCodec';
import { makeAnalysisDraft, makeDraft, makeEntry, makeLine } from '../../../test/factories';
import { closeHarnesses, openHarness, until, untilShown } from '../../../test/screenHarness';
import { SOURCES_NOT_BUILT_YET } from './AddIngredientMenu';
import { IngredientsCard } from './IngredientsCard';
import { AnalysisReview, ReviewSheet, type ReviewSlots } from './ReviewSheet';

// The AI tasks are fetched on first use (P10-08): load them once first, so a test that cancels a
// part analysis meets a request already in flight rather than a module still loading.
beforeAll(async () => {
  await import('../../../ai/tasks/food');
});

afterEach(closeHarnesses);

const words = ingredients.ingredients;
const reviewWords = review.review;
const LOGGED: LogResult = { kind: 'logged', entry: makeEntry() };

const SLOTS: ReviewSlots = { ingredients: (slot) => <IngredientsCard {...slot} /> };

/** Rice and dal: 398 kcal in 400 g. */
const RICE = makeLine({ name: 'Rice', grams: 150, kcal: 168, protein: 3.5, carbs: 35, fat: 1.4 });
const DAL = makeLine({ name: 'Dal', grams: 250, kcal: 230, protein: 14, carbs: 30, fat: 6 });

function recordingDiary() {
  return {
    logEntry: vi.fn<DiaryService['logEntry']>(async () => LOGGED),
    deleteEntry: vi.fn<DiaryService['deleteEntry']>(),
  };
}

/** A stand-in intake: each call waits for the test to settle it. */
function standInIntake() {
  const pending: Array<(outcome: IntakeOutcome) => void> = [];
  const ask = () => new Promise<IntakeOutcome>((resolve) => pending.push(resolve));
  const session = {
    photo: vi.fn<IntakeSession['photo']>(ask),
    describe: vi.fn<IntakeSession['describe']>(ask),
    close: vi.fn<IntakeSession['close']>(async () => undefined),
  };
  const service: IngredientIntakeService = { open: () => session };
  const settle = async (outcome: IntakeOutcome) => {
    await act(async () => pending.shift()?.(outcome));
  };
  return { service, session, settle };
}

interface Setup {
  readonly draft?: NutritionDraft;
  readonly intake?: IngredientIntakeService;
}

/** The review with the real ingredients card over a test database, logging into a recorder. */
async function openCard({
  draft = makeDraft({ lines: [RICE, DAL], units: [] }),
  intake,
}: Setup = {}) {
  const diary = recordingDiary();
  const h = await openHarness({ diary });
  const view = h.mount(
    <ServicesProvider services={{ ...h.services, ingredientIntake: intake }}>
      <ReviewSheet review={makeAnalysisDraft({ draft })} onClose={vi.fn()} slots={SLOTS} />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="ingredients"]');
  const sheet = within(screen.getByRole('dialog', { name: reviewWords.title }));
  return { ...h, diary, sheet, unmount: view.unmount };
}

const hooked = (hook: string) => document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);
const textOf = (hook: string) => hooked(hook)?.textContent ?? '';

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: words.add.label }));
}

function choose(label: string): void {
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

/** The part editor on screen. */
function editor() {
  const dialog = screen.getAllByRole('dialog').at(-1) as HTMLElement;
  const scope = within(dialog);
  return {
    type: (label: string, value: string) =>
      fireEvent.change(scope.getByRole('textbox', { name: label }), { target: { value } }),
    click: (label: string) => fireEvent.click(scope.getByRole('button', { name: label })),
  };
}

async function addManually(fields: Readonly<Record<string, string>>): Promise<void> {
  openMenu();
  choose(words.add.manual);
  await untilShown('[data-ui="ingredients.editor"]');
  const form = editor();
  for (const [label, value] of Object.entries(fields)) form.type(label, value);
  form.click(common.common.save);
}

async function pressLog(sheet: ReturnType<typeof within>) {
  await act(async () => {
    fireEvent.click(sheet.getByRole('button', { name: reviewWords.log }));
  });
}

function logged(diary: ReturnType<typeof recordingDiary>): {
  draft: NutritionDraft;
  ctx: LogContext;
} {
  expect(diary.logEntry).toHaveBeenCalledTimes(1);
  const [draft, ctx] = diary.logEntry.mock.calls[0] as [NutritionDraft, LogContext];
  return { draft, ctx };
}

const unitOptions = () =>
  Array.from((hooked('review.unit') as HTMLSelectElement).options).map((option) => option.value);

describe('IngredientsCard', () => {
  it('lists each part with its picture, name, weight and energy, and macros', async () => {
    const draft = makeDraft({
      units: [],
      lines: [
        { ...RICE, emoji: '🍚' },
        DAL,
        makeLine({ name: 'Pickle', grams: 0, kcal: 12, protein: 0, carbs: 1, fat: 0.9 }),
      ],
    });
    await openCard({ draft });

    expect(textOf('ingredients.line.0')).toContain('🍚');
    expect(textOf('ingredients.line.0')).toContain('Rice');
    expect(textOf('ingredients.line.0.amount')).toBe('150 g · 168 kcal');
    expect(textOf('ingredients.line.0.macros')).toBe('P 3.5 gC 35 gF 1.4 g');
    expect(hooked('ingredients.line.1')?.querySelector('[data-icon="plate"]')).not.toBeNull();
    // A part of unknown weight shows its energy alone, never "0 g".
    expect(textOf('ingredients.line.2.amount')).toBe('12 kcal');
  });

  it('makes the header the sum when a manual part of 100 kcal is added: 398 + 100 (ACC-D13-1, R02.4)', async () => {
    const { sheet, diary } = await openCard();
    expect(textOf('review.kcal')).toBe('398');

    await addManually({ [words.editor.name]: 'Naan', [words.editor.energy.kcal]: '100' });
    expect(textOf('review.kcal')).toBe('498');
    expect(textOf('ingredients.line.2.amount')).toBe('100 g · 100 kcal');
    expect(hooked('review.amount')).toHaveValue('500');

    await pressLog(sheet);
    const { draft } = logged(diary);
    expect(draft.kcal).toBe(498);
    expect(draft.lines.map((line) => line.name)).toEqual(['Rice', 'Dal', 'Naan']);
    expect(draft.basis).toEqual({ kind: 'grams', grams: 500 });
  });

  it('stretches sodium by the weight left when a part is removed: 400 mg × 300/400 (R02.4, ACC-D13-2)', async () => {
    const draft = makeDraft({
      basis: { kind: 'grams', grams: 400 },
      units: [],
      nutrients: { sodium: 400 },
      lines: [
        makeLine({ name: 'Croutons', grams: 100, kcal: 400 }),
        makeLine({ name: 'Tomato soup', grams: 300, kcal: 150 }),
      ],
    });
    const { sheet, diary } = await openCard({ draft });

    fireEvent.click(hooked('ingredients.line.0') as HTMLElement);
    await untilShown('[data-ui="ingredients.editor"]');
    editor().click(words.editor.remove);
    await until(() => hooked('ingredients.line.1') === null);

    expect(textOf('review.kcal')).toBe('150');
    expect(hooked('review.amount')).toHaveValue('300');
    fireEvent.click(sheet.getByRole('button', { name: reviewWords.more.heading }));
    expect(textOf('review.more.sodium')).toBe('300');
    await pressLog(sheet);
    expect(logged(diary).draft.nutrients.sodium).toBe(300);
  });

  it('lets a part change replace energy typed through the unlock (R02.5)', async () => {
    const { sheet } = await openCard();
    fireEvent.click(sheet.getByRole('button', { name: reviewWords.nutrition.unlock }));
    const energy = () => sheet.getByRole('textbox', { name: reviewWords.nutrition.energy.kcal });
    fireEvent.change(energy(), { target: { value: '999' } });
    expect(energy()).toHaveValue('999');

    fireEvent.click(hooked('ingredients.line.1') as HTMLElement);
    await untilShown('[data-ui="ingredients.editor"]');
    const form = editor();
    form.type(words.editor.energy.kcal, '250');
    form.click(common.common.save);

    expect(energy()).toHaveValue('418');
  });

  it('starts a meal without parts from the meal itself, so the first part adds to it', async () => {
    const { sheet, diary } = await openCard({ draft: makeDraft() });
    expect(hooked('ingredients.empty')).toHaveTextContent(words.empty);
    expect(textOf('review.kcal')).toBe('410');

    await addManually({ [words.editor.name]: 'Naan', [words.editor.energy.kcal]: '100' });
    expect(textOf('ingredients.line.0')).toContain('Lentil soup');
    expect(textOf('ingredients.line.0.amount')).toBe('420 g · 410 kcal');
    expect(textOf('review.kcal')).toBe('510');

    await pressLog(sheet);
    const { draft } = logged(diary);
    expect(draft.kcal).toBe(510);
    expect(draft.basis).toEqual({ kind: 'grams', grams: 520 });
    // Sodium of the 420 g soup stretches with the weight: 820 × 520 / 420.
    expect(draft.nutrients.sodium).toBeCloseTo((820 * 520) / 420, 6);
  });
});

describe('IngredientsCard: servings in recipe', () => {
  /** A 2 kg pot of two parts, 1 400 kcal; a bowl is 400 g. */
  const POT = makeDraft({
    name: 'Lentil stew',
    basis: { kind: 'grams', grams: 2_000 },
    units: [{ unit: 'bowl', gramsEach: 400 }],
    lines: [
      makeLine({ name: 'Lentils', grams: 800, kcal: 1_040, protein: 72, carbs: 160, fat: 8 }),
      makeLine({ name: 'Stock', grams: 1_200, kcal: 360, protein: 12, carbs: 24, fat: 24 }),
    ],
  });

  async function splitInto(servings: number): Promise<void> {
    for (let count = 1; count < servings; count++) {
      fireEvent.click(hooked('ingredients.split.increase') as HTMLElement);
    }
    await until(() => hooked('ingredients.split')?.getAttribute('aria-valuenow') === `${servings}`);
  }

  it('splits the pot into 4: a serving unit first, one serving of 500 g on screen (ACC-D14-1)', async () => {
    const { sheet, diary } = await openCard({ draft: POT });
    await splitInto(4);

    expect(unitOptions()).toEqual(['g', 'serving', 'bowl']);
    expect(hooked('review.unit')).toHaveValue('serving');
    expect(hooked('review.amount')).toHaveValue('1');
    expect(textOf('review.grams')).toBe('≈ 500 g');
    expect(textOf('review.kcal')).toBe('350');

    await pressLog(sheet);
    const { draft } = logged(diary);
    expect(draft).toMatchObject({ kcal: 350, chosenUnit: 'serving', chosenCount: 1 });
    expect(draft.units[0]).toMatchObject({ unit: 'serving', gramsEach: 500 });
  });

  it('keeps the 4 servings and the serving unit through a part edit, showing the edited portion (R02.6)', async () => {
    await openCard({ draft: POT });
    await splitInto(4);
    // One serving shows a quarter of each part: Stock is 300 g there.
    expect(textOf('ingredients.line.1.amount')).toBe('300 g · 90 kcal');

    fireEvent.click(hooked('ingredients.line.1') as HTMLElement);
    await untilShown('[data-ui="ingredients.editor"]');
    const form = editor();
    form.type(ingredients.ingredients.editor.weight, '400');
    form.click(common.common.save);

    expect(hooked('ingredients.split')).toHaveAttribute('aria-valuenow', '4');
    expect(hooked('review.unit')).toHaveValue('serving');
    expect(hooked('review.amount')).toHaveValue('1');
    expect(textOf('review.grams')).toBe('≈ 600 g');
    expect(textOf('review.kcal')).toBe('380');
    expect(unitOptions()[1]).toBe('serving');
  });

  it('ends the split with an ordinary change once fewer than two parts are left', async () => {
    await openCard({ draft: POT });
    await splitInto(4);
    fireEvent.click(hooked('ingredients.line.0') as HTMLElement);
    await untilShown('[data-ui="ingredients.editor"]');
    editor().click(words.editor.remove);

    await until(() => hooked('ingredients.split') === null);
    expect(hooked('review.amount')).toHaveValue('300');
    // The bowl described the old pot: only grams are left.
    expect(textOf('review.unit')).toBe(reviewWords.unit.g);
  });

  it('offers no split for a re-logged portion (ACC-D14-2, R02.6), one part or an unknown weight', async () => {
    const portion = makeDraft({
      ...POT,
      basis: { kind: 'grams', grams: 500 },
      units: [{ unit: 'serving', gramsEach: 500, count: 1 }],
    });
    for (const draft of [
      portion,
      makeDraft({ ...POT, lines: POT.lines.slice(0, 1) }),
      makeDraft({ ...POT, basis: { kind: 'servings', count: 1 }, units: [] }),
    ]) {
      const { unmount } = await openCard({ draft });
      expect(hooked('ingredients.split')).toBeNull();
      unmount();
    }
  });
});

describe('IngredientsCard: parts from the AI', () => {
  const OIL: IngredientLine = makeLine({
    name: 'Olive oil',
    grams: 13.5,
    kcal: 119,
    protein: 0,
    carbs: 0,
    fat: 13.5,
  });

  it('offers camera, photo, describe and manual, and leaves the sources not built yet off', async () => {
    const { service } = standInIntake();
    await openCard({ intake: service });
    openMenu();
    const offered = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(offered).toEqual([
      words.add.camera,
      words.add.library,
      words.add.describe,
      words.add.manual,
    ]);
    expect(SOURCES_NOT_BUILT_YET).toEqual(['barcode', 'recent', 'often', 'saved']);

    const camera = hooked('ingredients.camera') as HTMLInputElement;
    expect(camera).toHaveAttribute('capture', 'environment');
    expect((hooked('ingredients.library') as HTMLInputElement).multiple).toBe(false);
  });

  it('offers manual only without an intake service', async () => {
    await openCard();
    openMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      words.add.manual,
    ]);
  });

  it('adds a described part as one line, with a busy line and no menu while it is worked out', async () => {
    const { service, session, settle } = standInIntake();
    await openCard({ intake: service });
    openMenu();
    choose(words.add.describe);
    await untilShown('[data-ui="ingredients.describe"]');
    const describe = within(screen.getByRole('dialog', { name: words.describe.title }));
    const analyse = describe.getByRole('button', { name: words.describe.analyse });
    expect(analyse).toBeDisabled();
    fireEvent.change(describe.getByRole('textbox', { name: words.describe.label }), {
      target: { value: '  a spoon of olive oil ' },
    });
    fireEvent.click(analyse);

    expect(session.describe).toHaveBeenCalledWith('a spoon of olive oil');
    expect(hooked('ingredients.busy')).toHaveAttribute('role', 'status');
    expect(hooked('ingredients.busy')).toHaveTextContent(words.busy);
    expect(screen.queryByRole('button', { name: words.add.label })).toBeNull();

    await settle({ kind: 'line', line: OIL });
    expect(hooked('ingredients.busy')).toBeNull();
    expect(textOf('ingredients.line.2')).toContain('Olive oil');
    expect(textOf('review.kcal')).toBe('517');
  });

  it('adds a photo part with its photo, and logs the part with it', async () => {
    const { service, session, settle } = standInIntake();
    const { sheet, diary } = await openCard({ intake: service });
    const file = new File(['bytes'], 'oil.jpg', { type: 'image/jpeg' });
    fireEvent.change(hooked('ingredients.library') as HTMLInputElement, {
      target: { files: [file] },
    });
    expect(session.photo).toHaveBeenCalledWith(file);

    await settle({ kind: 'line', line: { ...OIL, photoIds: ['photo-oil'] } });
    await pressLog(sheet);
    expect(logged(diary).draft.lines[2]?.photoIds).toEqual(['photo-oil']);
  });

  it("shows a failure's messages until dismissed, then offers the menu again", async () => {
    const { service, session, settle } = standInIntake();
    await openCard({ intake: service });
    fireEvent.change(hooked('ingredients.camera') as HTMLInputElement, {
      target: { files: [new File(['x'], 'a.jpg')] },
    });
    expect(session.photo).toHaveBeenCalledTimes(1);
    await settle({
      kind: 'failed',
      failure: { kind: 'keyRejected' },
      messages: [{ key: 'ai.failure.keyRejected' }],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(ai.ai.failure.keyRejected);
    fireEvent.click(screen.getByRole('button', { name: words.dismiss }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: words.add.label })).toBeInTheDocument();
    expect(hooked('ingredients.line.2')).toBeNull();
  });

  it('closes its session when the review goes', async () => {
    const { service, session } = standInIntake();
    const h = await openHarness({ diary: recordingDiary() });
    const view = h.mount(
      <ServicesProvider services={{ ...h.services, ingredientIntake: service }}>
        <ReviewSheet review={makeAnalysisDraft()} onClose={vi.fn()} slots={SLOTS} />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="ingredients"]');
    expect(session.close).not.toHaveBeenCalled();
    view.unmount();
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});

/** An analysis service that only holds a waiting draft until the review hands it back. */
function waitingAnalysis(draft: AnalysisDraft) {
  let state: AnalysisState = { phase: 'reviewReady', draft, generation: 1 };
  const listeners = new Set<() => void>();
  const service: AnalysisService = {
    getSnapshot: () => state,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    start: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    closeReview: vi.fn(async () => {
      state = { phase: 'idle' };
      for (const listener of [...listeners]) listener();
    }),
    restore: vi.fn(),
  };
  return service;
}

describe('AnalysisReview: the ingredients card', () => {
  /** Every photo decodes for the AI into the same small JPEG. */
  const backend: ImageBackend = {
    decode: () =>
      Promise.resolve({
        width: 1200,
        height: 900,
        toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 7)),
        close: () => undefined,
      }),
  };

  it('stops a part analysis when the review is cancelled, and keeps no photo of it', async () => {
    const h = await openHarness();
    await h.repos.settingsRepo.set('ai.settings', DEFAULT_AI_SETTINGS);
    const photoRepo = createPhotoRepo(h.db);
    const codec = createFakeCodec();
    const signals: AbortSignal[] = [];
    const intake = createIngredientIntake({
      photos: createPhotoService({ photoRepo, codec: codec.codec }),
      photoRepo,
      aiAccess: async () => ({
        settings: DEFAULT_AI_SETTINGS,
        keys: { gemini: 'gm-card-key-4410' },
        configured: true,
      }),
      // The request never answers; only Cancel ends it.
      fetch: (_input, init) =>
        new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (signal) {
            signals.push(signal);
            signal.addEventListener('abort', () => reject(signal.reason));
          }
        }),
      imageBackend: backend,
    });
    const analysis = waitingAnalysis(makeAnalysisDraft());
    h.mount(
      <ServicesProvider services={{ ...h.services, analysis, ingredientIntake: intake }}>
        <AnalysisReview />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="ingredients"]');
    await act(async () => {
      fireEvent.change(hooked('ingredients.camera') as HTMLInputElement, {
        target: { files: [await codec.photo(1600, 1200)] },
      });
    });
    await until(() => signals.length === 1);
    expect(hooked('ingredients.busy')).toHaveTextContent(words.busy);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: common.common.cancel }));
    });
    expect(analysis.closeReview).toHaveBeenCalledTimes(1);
    await until(() => signals[0]?.aborted === true);
    expect(await h.db.photos.count()).toBe(0);
  });

  it('is filled in the analysis review together with the fit check', async () => {
    const h = await openHarness();
    h.mount(
      <ServicesProvider
        services={{ ...h.services, analysis: waitingAnalysis(makeAnalysisDraft()) }}
      >
        <AnalysisReview />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="ingredients"]');
    expect(screen.getByRole('button', { name: reviewWords.fitCheck })).toBeInTheDocument();
  });
});

describe('the ingredients partition', () => {
  it('passes the catalogue lint merged with the other partitions', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(Object.keys(mergePartitions(enPartitions))).toContain('ingredients');
  });
});
