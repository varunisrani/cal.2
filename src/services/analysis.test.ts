import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImageBackend } from '../ai/image';
import { labelScanPrompt, photoMealPrompt, textMealPrompt } from '../ai/prompts/food';
import { DEFAULT_AI_SETTINGS } from '../ai/settings';
import {
  fakeFetch,
  type FakeFetch,
  type FakeStep,
  type RecordedRequest,
} from '../ai/testing/fakeFetch';
import { geminiAnswer, geminiError } from '../ai/testing/wire';
import { createAppState, type AppStateStore } from '../app/appState';
import { createDiaryRepo } from '../data/repos/diaryRepo';
import { createDraftsRepo, type DraftsRepo } from '../data/repos/draftsRepo';
import { createPhotoRepo, type PhotoRepo } from '../data/repos/photoRepo';
import { createSecretsRepo } from '../data/repos/secretsRepo';
import { createSettingsRepo, type SettingsRepo } from '../data/repos/settingsRepo';
import type { PlatewiseDb } from '../data/schema';
import { fixedClock } from '../lib/clock';
import { withIdSequence } from '../lib/ids';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import { FACTORY_NOW, makeDraft, makeEntry } from '../test/factories';
import { advanceAsync } from '../test/time';
import {
  createAnalysisService,
  type AnalysisService,
  type AnalysisState,
  type ReviewOrigin,
} from './analysis';

const GEMINI = 'https://generativelanguage.googleapis.com/';
const GEMINI_KEY = 'gm-test-key-5521';
const NOTE = 'The sauce is tomato only.';

const SOUP = { name: 'Lentil soup', kcal: 310, protein: 18, carbs: 44, fat: 7, servingGrams: 400 };
const BAKE = { name: 'Vegetable bake', kcal: 520, protein: 21, carbs: 48, fat: 26 };

const answer = (meal: object): FakeStep => ({ json: geminiAnswer(JSON.stringify(meal)) });

/** Any photo decodes; its JPEG carries the photo's byte size, so the requests tell photos apart. */
const sizedBackend: ImageBackend = {
  decode: (blob) =>
    Promise.resolve({
      width: 1200,
      height: 900,
      toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, blob.size % 256)),
      close: () => undefined,
    }),
};
const jpegOf = (size: number): string => btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, size));

// ---- Requests --------------------------------------------------------------------------------

interface GeminiBody {
  readonly contents: readonly {
    readonly parts: readonly {
      readonly text?: string;
      readonly inlineData?: { readonly data: string };
    }[];
  }[];
}
const partsOf = (request: RecordedRequest | undefined) =>
  (request?.body as GeminiBody | undefined)?.contents[0]?.parts ?? [];
const promptOf = (request: RecordedRequest | undefined) =>
  partsOf(request)
    .flatMap((part) => part.text ?? [])
    .join('');
const photosOf = (request: RecordedRequest | undefined) =>
  partsOf(request).flatMap((part) => part.inlineData?.data ?? []);

/**
 * A `fetch` that holds the next `held` requests until `open()`; later ones go straight to the
 * fake. A held request rejects at once on abort, unless `ignoreAbort`: then its reply still
 * arrives, as one already on its way would.
 */
function holding(fake: FakeFetch, held = 1, ignoreAbort = false) {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (open = resolve));
  let calls = 0;
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls += 1;
    if (calls > held) return fake.fetch(input, init);
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      if (!ignoreAbort) signal?.addEventListener('abort', () => reject(signal.reason));
      void gate.then(() => fake.fetch(input, { ...init, signal: null })).then(resolve, reject);
    });
  };
  return { fetch, open: () => open(), calls: () => calls };
}

// ---- Set-up ----------------------------------------------------------------------------------

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface Repos {
  readonly db: PlatewiseDb;
  readonly draftsRepo: DraftsRepo;
  readonly photoRepo: PhotoRepo;
  readonly settingsRepo: SettingsRepo;
}

interface Connected extends Repos {
  readonly service: AnalysisService;
  readonly fake: FakeFetch;
  readonly appState: AppStateStore;
}

interface ConnectOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly draftsRepo?: (real: DraftsRepo) => DraftsRepo;
}

let connections = 0;

/** The repositories over a test database, with a Gemini key stored. */
async function openRepos(withKey = true): Promise<Repos> {
  const { db, bus } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  if (withKey) await createSecretsRepo(db).set('gemini', GEMINI_KEY);
  return {
    db,
    draftsRepo: createDraftsRepo(db),
    photoRepo: createPhotoRepo(db, { newId: withIdSequence(`photo-${++connections}-`) }),
    settingsRepo,
  };
}

/** A service over `repos`, as the app builds it at start-up (a new one after a reload). */
function connect(repos: Repos, fake: FakeFetch, options: ConnectOptions = {}): Connected {
  const appState = createAppState();
  const draftsRepo = options.draftsRepo ? options.draftsRepo(repos.draftsRepo) : repos.draftsRepo;
  const service = createAnalysisService({
    draftsRepo,
    photoRepo: repos.photoRepo,
    settingsRepo: repos.settingsRepo,
    secretsRepo: createSecretsRepo(repos.db),
    overlay: appState,
    fetch: options.fetch ?? fake.fetch,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
    imageBackend: sizedBackend,
  });
  return { ...repos, service, fake, appState };
}

async function setUp(options: ConnectOptions & { readonly withKey?: boolean } = {}) {
  return connect(await openRepos(options.withKey), fakeFetch(), options);
}

/** Stores photos of `sizes` bytes, as the capture sheet does before Analyse. */
function storePhotos(photoRepo: PhotoRepo, ...sizes: number[]): Promise<string[]> {
  return Promise.all(
    sizes.map(async (size, index) =>
      photoRepo.put(await storableBlob(size, index), { width: 1200, height: 900 }),
    ),
  );
}

/** Photos in the capture record, the way they are when Analyse is pressed. */
async function captured(setup: Repos, ...sizes: number[]): Promise<string[]> {
  const photoIds = await storePhotos(setup.photoRepo, ...sizes);
  await setup.draftsRepo.saveCapture({ photoIds, note: NOTE, progressive: false });
  return photoIds;
}

async function storedPhotos(photoRepo: PhotoRepo, ids: readonly string[]) {
  const rows = await Promise.all(ids.map((id) => photoRepo.get(id)));
  return rows.filter((row) => row !== null).map((row) => row.id);
}

/** Lets one round of queued tasks run (IndexedDB callbacks). No timer is involved. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

/**
 * Runs tasks until `check()` holds. The limit is a time, not a count of rounds: the stored key is
 * opened with WebCrypto, which answers on the clock (in a thread of its own), and a loaded machine
 * runs any number of rounds before it does.
 */
async function until(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 3_000;
  while (!check()) {
    if (performance.now() > deadline)
      throw new Error('The analysis never reached the expected state');
    await nextTask();
  }
}

function phaseOf(service: AnalysisService): AnalysisState['phase'] {
  return service.getSnapshot().phase;
}

/** The draft waiting for review; fails the test when there is none. */
function reviewOf(service: AnalysisService) {
  const state = service.getSnapshot();
  if (state.phase !== 'reviewReady') throw new Error(`Expected a review, found ${state.phase}`);
  return state;
}

function failureOf(service: AnalysisService) {
  const state = service.getSnapshot();
  if (state.phase !== 'failed') throw new Error(`Expected a failure, found ${state.phase}`);
  return state;
}

// ---- Tests -----------------------------------------------------------------------------------

describe('start: a finished analysis waits for review', () => {
  it('stores the draft with its photos, note and source, and hands the capture photos to it', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000, 2_000);
    setup.fake.on(GEMINI, answer(SOUP));

    const started = setup.service.start('photo', { photoIds, note: NOTE, progressive: true });
    expect(setup.service.getSnapshot()).toEqual({ phase: 'analysing', kind: 'photo', photoIds });
    await started;

    const review = reviewOf(setup.service);
    expect(review.draft).toMatchObject({
      photoIds,
      source: 'photo',
      createdAt: FACTORY_NOW,
      fromSavedLabel: false,
      draft: { name: 'Lentil soup', kcal: 310, note: NOTE, progressive: true },
    });
    expect(await setup.draftsRepo.load()).toEqual({
      generation: review.generation,
      draft: review.draft,
    });
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual(photoIds);
    expect(photosOf(setup.fake.requests[0])).toEqual([jpegOf(1_000 % 256), jpegOf(2_000 % 256)]);
    expect(promptOf(setup.fake.requests[0])).toBe(
      photoMealPrompt({ photoCount: 2, note: NOTE, progressive: true }).prompt,
    );
  });

  it('hides the tab bar while it runs and shows it again with the result', async () => {
    const setup = await setUp();
    setup.fake.on(GEMINI, answer(SOUP));

    const started = setup.service.start('text', { text: 'Lentil soup' });
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(true);
    await started;

    expect(phaseOf(setup.service)).toBe('reviewReady');
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(false);
  });

  it('sends a typed meal trimmed, as text, and stores it with no photo', async () => {
    const setup = await setUp();
    setup.fake.on(GEMINI, answer(BAKE));

    await setup.service.start('text', { text: '  two eggs and toast \n' });

    expect(promptOf(setup.fake.requests[0])).toBe(
      textMealPrompt({ description: 'two eggs and toast' }).prompt,
    );
    expect(photosOf(setup.fake.requests[0])).toEqual([]);
    expect(reviewOf(setup.service).draft).toMatchObject({ source: 'text', photoIds: [] });
  });

  it('runs photos taken for an armed label scan as a label, keeping the barcode', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_500);
    setup.fake.on(GEMINI, answer(BAKE));

    await setup.service.start('photo', {
      photoIds,
      note: '',
      progressive: false,
      armedLabel: '0 12345 67890 5',
    });

    expect(promptOf(setup.fake.requests[0])).toBe(
      labelScanPrompt({ photoCount: 1, note: '' }).prompt,
    );
    const { draft } = reviewOf(setup.service);
    expect(draft).toMatchObject({ source: 'label', photoIds });
    expect(draft.draft.product).toEqual({
      barcode: '0 12345 67890 5',
      allergens: [],
      traces: [],
      labels: [],
      categories: [],
    });
  });

  it('stores a label start with source label, and without a barcode leaves the product alone', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_500);
    setup.fake.on(GEMINI, answer(BAKE));

    await setup.service.start('label', { photoIds, note: '' });

    const { draft } = reviewOf(setup.service);
    expect(draft.source).toBe('label');
    expect(draft.draft.product).toBeUndefined();
  });

  it('skips photos that are gone, and with none left shows the photo message without sending', async () => {
    const setup = await setUp();
    const [kept = ''] = await storePhotos(setup.photoRepo, 1_000);
    setup.fake.on(GEMINI, answer(SOUP));

    await setup.service.start('photo', { photoIds: ['gone', kept], note: '', progressive: false });
    expect(reviewOf(setup.service).draft.photoIds).toEqual([kept]);

    await setup.service.start('photo', { photoIds: ['gone'], note: '', progressive: false });
    expect(failureOf(setup.service).messages).toEqual([{ key: 'ai.failure.imageConversion' }]);
    expect(setup.fake.requests).toHaveLength(1);
  });

  it('shows the no-key message and sends nothing when AI is not set up', async () => {
    const setup = await setUp({ withKey: false });
    expect(await setup.settingsRepo.get('ai.settings')).toBeNull();

    await setup.service.start('text', { text: 'Lentil soup' });

    expect(failureOf(setup.service).messages).toEqual([{ key: 'ai.failure.noKey' }]);
    expect(setup.fake.requests).toHaveLength(0);
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(false);
  });

  it('shows the generic message when the draft cannot be stored', async () => {
    const setup = await setUp({
      draftsRepo: (real) => ({
        ...real,
        begin: () => Promise.reject(new DOMException('Disk full', 'QuotaExceededError')),
      }),
    });

    await setup.service.start('text', { text: 'Lentil soup' });

    expect(failureOf(setup.service).messages).toEqual([{ key: 'ai.failure.generic' }]);
  });

  it('still opens the review when the capture record cannot be dropped', async () => {
    const setup = await setUp({
      draftsRepo: (real) => ({
        ...real,
        clearCapture: () => Promise.reject(new DOMException('Disk full', 'QuotaExceededError')),
      }),
    });
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, answer(SOUP));

    await setup.service.start('photo', { photoIds, note: '', progressive: false });

    expect(reviewOf(setup.service).draft.photoIds).toEqual(photoIds);
    expect((await setup.draftsRepo.load())?.draft.photoIds).toEqual(photoIds);
  });
});

describe('the time limit (fake timers)', () => {
  // The AI tasks are fetched on first use (P10-08): load them first, so the fake clock measures
  // the request alone whichever test runs first.
  beforeAll(async () => {
    await import('../ai/tasks/food');
  });

  it('stops at the timeout from the AI settings and offers Retry', async () => {
    const setup = await setUp();
    await setup.settingsRepo.set('ai.settings', { ...DEFAULT_AI_SETTINGS, timeoutSec: 30 });
    setup.fake.on(GEMINI, { ...answer(SOUP), delayMs: 60_000 });
    // IndexedDB here runs on setImmediate, which stays real; the deadline's timers are fake.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });

    const started = setup.service.start('text', { text: 'Lentil soup' });
    await until(() => setup.fake.requests.length === 1);
    await advanceAsync(29_999);
    expect(phaseOf(setup.service)).toBe('analysing');
    await advanceAsync(1);
    await started;

    expect(failureOf(setup.service).messages).toEqual([{ key: 'ai.failure.timeout' }]);
    expect(setup.fake.requests[0]?.signal?.aborted).toBe(true);
  });
});

describe('Cancel (ACC-D5-1)', () => {
  it('stops the request with no error, and lets the photos and the capture record go', async () => {
    const fake = fakeFetch().on(GEMINI, answer(SOUP));
    const held = holding(fake);
    const setup = connect(await openRepos(), fake, { fetch: held.fetch });
    const photoIds = await captured(setup, 1_000, 2_000);

    const started = setup.service.start('photo', { photoIds, note: NOTE, progressive: false });
    await until(() => held.calls() === 1);
    const cancelled = setup.service.cancel();
    expect(setup.service.getSnapshot()).toEqual({ phase: 'idle' });
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(false);
    await cancelled;
    await started;

    expect(fake.requests).toHaveLength(0);
    expect(phaseOf(setup.service)).toBe('idle');
    expect(await setup.draftsRepo.load()).toBeNull();
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual([]);
  });

  it('aborts the request on its way (the fake sees the aborted signal)', async () => {
    const setup = await setUp();
    setup.fake.on(GEMINI, { ...answer(SOUP), delayMs: 60_000 });

    const started = setup.service.start('text', { text: 'Lentil soup' });
    await until(() => setup.fake.requests.length === 1);
    await setup.service.cancel();
    await started;

    expect(setup.fake.requests[0]?.signal?.aborted).toBe(true);
    expect(phaseOf(setup.service)).toBe('idle');
  });

  it('sends nothing when pressed before the request goes out', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, answer(SOUP));

    const started = setup.service.start('photo', { photoIds, note: '', progressive: false });
    await setup.service.cancel();
    await started;

    expect(setup.fake.requests).toHaveLength(0);
    expect(setup.fake.pending()).toBe(1);
    expect(phaseOf(setup.service)).toBe('idle');
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual([]);
  });

  it('after a failure, closes it and lets the photos go', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'No.') });

    await setup.service.start('photo', { photoIds, note: '', progressive: false });
    expect(phaseOf(setup.service)).toBe('failed');
    await setup.service.cancel();

    expect(phaseOf(setup.service)).toBe('idle');
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual([]);
  });
});

describe('failure and Retry (ACC-D5-2)', () => {
  it("shows the failure's message, keeps the photos, and Retry sends the same request again", async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000, 2_000);
    setup.fake.on(
      GEMINI,
      { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'The key was refused.') },
      answer(SOUP),
    );

    await setup.service.start('photo', { photoIds, note: NOTE, progressive: false });

    const failed = failureOf(setup.service);
    expect(failed).toMatchObject({ kind: 'photo', photoIds, failure: { kind: 'keyRejected' } });
    expect(failed.messages).toEqual([{ key: 'ai.failure.keyRejected' }]);
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(false);
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual(photoIds);

    const retried = setup.service.retry();
    expect(phaseOf(setup.service)).toBe('analysing');
    await retried;

    expect(setup.fake.requests).toHaveLength(2);
    expect(setup.fake.requests[1]?.body).toEqual(setup.fake.requests[0]?.body);
    expect(reviewOf(setup.service).draft.photoIds).toEqual(photoIds);
  });

  it('keeps photos no record names when Retry sends them again', async () => {
    const setup = await setUp();
    const photoIds = await storePhotos(setup.photoRepo, 1_000);
    setup.fake.on(GEMINI, { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'No.') });
    setup.fake.on(GEMINI, answer(SOUP));

    await setup.service.start('photo', { photoIds, note: '', progressive: false });
    await setup.service.retry();

    expect(photosOf(setup.fake.requests[1])).toEqual([jpegOf(1_000 % 256)]);
    expect(reviewOf(setup.service).draft.photoIds).toEqual(photoIds);
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual(photoIds);
  });

  it('does nothing when there is no failure to retry', async () => {
    const setup = await setUp();
    await setup.service.retry();
    expect(phaseOf(setup.service)).toBe('idle');
    expect(setup.fake.requests).toHaveLength(0);
  });
});

describe('late results (R02.10)', () => {
  it('never shows a result that arrives after a newer start, and lets its photos go', async () => {
    // The newer request reaches the fake first: the held one only goes on after `open()`.
    const fake = fakeFetch().on(GEMINI, answer(BAKE), answer(SOUP));
    const held = holding(fake, 1, true);
    const setup = connect(await openRepos(), fake, { fetch: held.fetch });
    const first = await storePhotos(setup.photoRepo, 1_000);

    const late = setup.service.start('photo', { photoIds: first, note: '', progressive: false });
    await until(() => held.calls() === 1);
    await setup.service.start('text', { text: 'Vegetable bake' });
    expect(reviewOf(setup.service).draft.draft.name).toBe('Vegetable bake');

    held.open();
    await late;

    expect(fake.requests).toHaveLength(2);
    const review = reviewOf(setup.service);
    expect(review.draft.draft.name).toBe('Vegetable bake');
    expect((await setup.draftsRepo.load())?.draft.draft.name).toBe('Vegetable bake');
    expect(await storedPhotos(setup.photoRepo, first)).toEqual([]);
  });

  it('drops a result whose write lands after a newer start began', async () => {
    let releaseWrite: () => void = () => undefined;
    const writeHeld = new Promise<void>((resolve) => (releaseWrite = resolve));
    let writes = 0;
    const setup = await setUp({
      draftsRepo: (real) => ({
        ...real,
        saveResult: async (generation, draft) => {
          writes += 1;
          if (writes === 1) await writeHeld;
          return real.saveResult(generation, draft);
        },
      }),
    });
    const first = await storePhotos(setup.photoRepo, 1_000);
    setup.fake.on(GEMINI, answer(SOUP), answer(BAKE));

    const late = setup.service.start('photo', { photoIds: first, note: '', progressive: false });
    await until(() => writes === 1);
    await setup.service.start('text', { text: 'Vegetable bake' });
    releaseWrite();
    await late;

    expect(reviewOf(setup.service).draft.draft.name).toBe('Vegetable bake');
    expect((await setup.draftsRepo.load())?.draft.draft.name).toBe('Vegetable bake');
    expect(await storedPhotos(setup.photoRepo, first)).toEqual([]);
  });

  it('clears again a draft written just as Cancel was pressed', async () => {
    let releaseWrite: () => void = () => undefined;
    const writeHeld = new Promise<void>((resolve) => (releaseWrite = resolve));
    let writes = 0;
    const setup = await setUp({
      draftsRepo: (real) => ({
        ...real,
        saveResult: async (generation, draft) => {
          writes += 1;
          await writeHeld;
          return real.saveResult(generation, draft);
        },
      }),
    });
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, answer(SOUP));

    const started = setup.service.start('photo', { photoIds, note: '', progressive: false });
    await until(() => writes === 1);
    const cancelled = setup.service.cancel();
    releaseWrite();
    await cancelled;
    await started;

    expect(phaseOf(setup.service)).toBe('idle');
    expect(await setup.draftsRepo.load()).toBeNull();
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual([]);
  });

  it('drops the draft waiting for review when a new analysis starts, with its photos', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, answer(SOUP), answer(BAKE));
    await setup.service.start('photo', { photoIds, note: '', progressive: false });

    await setup.service.start('text', { text: 'Vegetable bake' });

    expect(reviewOf(setup.service).draft.draft.name).toBe('Vegetable bake');
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual([]);
  });
});

describe('closing the review', () => {
  it('drops the draft and its photos after Cancel', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, answer(SOUP));
    await setup.service.start('photo', { photoIds, note: '', progressive: false });

    await setup.service.closeReview();

    expect(phaseOf(setup.service)).toBe('idle');
    expect(await setup.draftsRepo.load()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual([]);
  });

  it('keeps the photos a logged entry names', async () => {
    const setup = await setUp();
    const photoIds = await captured(setup, 1_000);
    setup.fake.on(GEMINI, answer(SOUP));
    await setup.service.start('photo', { photoIds, note: '', progressive: false });

    await createDiaryRepo(setup.db).add(makeEntry({ photoIds }));
    await setup.service.closeReview();

    expect(await setup.draftsRepo.load()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual(photoIds);
  });
});

describe('restore after a reload (D-16.46)', () => {
  it('opens the stored draft again, with its photos and source', async () => {
    const repos = await openRepos();
    const before = connect(repos, fakeFetch().on(GEMINI, answer(SOUP)));
    const photoIds = await captured(repos, 1_000, 2_000);
    await before.service.start('photo', { photoIds, note: NOTE, progressive: false });
    const stored = reviewOf(before.service);

    const after = connect(repos, fakeFetch());
    await after.service.restore();

    expect(reviewOf(after.service)).toEqual(stored);
    expect(after.appState.getSnapshot().analysisOverlay).toBe(false);
  });

  it('leaves the review closed when there is no draft', async () => {
    const setup = await setUp();
    await setup.service.restore();
    expect(phaseOf(setup.service)).toBe('idle');
  });

  it('yields to an analysis started while it reads', async () => {
    const repos = await openRepos();
    const before = connect(repos, fakeFetch().on(GEMINI, answer(SOUP)));
    await before.service.start('text', { text: 'Lentil soup' });

    const after = connect(repos, fakeFetch().on(GEMINI, answer(BAKE)));
    const restoring = after.service.restore();
    const started = after.service.start('text', { text: 'Vegetable bake' });
    await restoring;
    expect(phaseOf(after.service)).toBe('analysing');
    await started;

    expect(reviewOf(after.service).draft.draft.name).toBe('Vegetable bake');
  });

  it('stays closed when an analysis started while it read was cancelled', async () => {
    const repos = await openRepos();
    const before = connect(repos, fakeFetch().on(GEMINI, answer(SOUP)));
    await before.service.start('text', { text: 'Lentil soup' });

    const after = connect(repos, fakeFetch());
    const restoring = after.service.restore();
    const started = after.service.start('text', { text: 'Vegetable bake' });
    await after.service.cancel();
    await Promise.all([restoring, started]);

    expect(phaseOf(after.service)).toBe('idle');
    expect(await repos.draftsRepo.load()).toBeNull();
  });
});

describe('openForReview: a reuse pick goes to the review (P06-12)', () => {
  const TOAST = makeDraft({ name: 'Toast', kcal: 250, basis: { kind: 'grams', grams: 60 } });

  function openForReview(service: AnalysisService, origin: ReviewOrigin) {
    if (!service.openForReview) throw new Error('The service has no openForReview');
    return service.openForReview(TOAST, origin);
  }

  /** Photos an entry in the diary names, as a reuse pick finds them. */
  async function loggedPhotos(setup: Repos, ...sizes: number[]): Promise<string[]> {
    const photoIds = await storePhotos(setup.photoRepo, ...sizes);
    await createDiaryRepo(setup.db).add(makeEntry({ photoIds }));
    return photoIds;
  }

  it('stores the draft with the photos and source it is given, and shows it with no overlay or request', async () => {
    const setup = await setUp();
    const photoIds = await loggedPhotos(setup, 1_000);

    expect(await openForReview(setup.service, { photoIds, source: 'barcode' })).toBe(true);

    const review = reviewOf(setup.service);
    expect(review.draft).toEqual({
      draft: TOAST,
      photoIds,
      source: 'barcode',
      createdAt: FACTORY_NOW,
      fromSavedLabel: false,
    });
    expect(await setup.draftsRepo.load()).toEqual({
      generation: review.generation,
      draft: review.draft,
    });
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(false);
    expect(setup.fake.requests).toEqual([]);
  });

  it('opens again after a reload (D-16.46)', async () => {
    const repos = await openRepos();
    const before = connect(repos, fakeFetch());
    await openForReview(before.service, { photoIds: [], source: 'manual' });
    const stored = reviewOf(before.service);

    const after = connect(repos, fakeFetch());
    await after.service.restore();

    expect(reviewOf(after.service)).toEqual(stored);
  });

  it("keeps the entry's photos when the review is cancelled: they are shared, not copied", async () => {
    const setup = await setUp();
    const photoIds = await loggedPhotos(setup, 1_000, 2_000);
    await openForReview(setup.service, { photoIds, source: 'photo' });

    await setup.service.closeReview();

    expect(phaseOf(setup.service)).toBe('idle');
    expect(await setup.draftsRepo.load()).toBeNull();
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual(photoIds);
  });

  it('drops a draft waiting for review, letting go of the photos only it named', async () => {
    const setup = await setUp();
    const analysed = await captured(setup, 3_000);
    setup.fake.on(GEMINI, answer(SOUP));
    await setup.service.start('photo', { photoIds: analysed, note: '', progressive: false });
    const photoIds = await loggedPhotos(setup, 1_000);

    expect(await openForReview(setup.service, { photoIds, source: 'photo' })).toBe(true);

    expect(reviewOf(setup.service).draft.draft.name).toBe('Toast');
    expect(await storedPhotos(setup.photoRepo, analysed)).toEqual([]);
    expect(await storedPhotos(setup.photoRepo, photoIds)).toEqual(photoIds);
  });

  it('stops an analysis that is running, whose late result never shows', async () => {
    const fake = fakeFetch().on(GEMINI, answer(SOUP));
    const held = holding(fake, 1, true);
    const setup = connect(await openRepos(), fake, { fetch: held.fetch });
    const started = setup.service.start('text', { text: 'Lentil soup' });
    await until(() => held.calls() === 1);

    expect(await openForReview(setup.service, { photoIds: [], source: 'text' })).toBe(true);
    expect(setup.appState.getSnapshot().analysisOverlay).toBe(false);
    held.open();
    await started;

    expect(reviewOf(setup.service).draft.draft.name).toBe('Toast');
    expect((await setup.draftsRepo.load())?.draft.draft.name).toBe('Toast');
  });

  it('closes a failure on screen and opens the pick', async () => {
    const setup = await setUp({ withKey: false });
    await setup.service.start('text', { text: 'Lentil soup' });
    expect(phaseOf(setup.service)).toBe('failed');

    expect(await openForReview(setup.service, { photoIds: [], source: 'manual' })).toBe(true);
    expect(reviewOf(setup.service).draft.source).toBe('manual');
  });

  it('yields to an analysis started while it writes', async () => {
    const setup = await setUp();
    setup.fake.on(GEMINI, answer(BAKE));

    const picking = openForReview(setup.service, { photoIds: [], source: 'manual' });
    const started = setup.service.start('text', { text: 'Vegetable bake' });

    expect(await picking).toBe(false);
    await started;
    expect(reviewOf(setup.service).draft.draft.name).toBe('Vegetable bake');
    expect((await setup.draftsRepo.load())?.draft.draft.name).toBe('Vegetable bake');
  });

  it('never shows the pick over an analysis started just after its draft was written', async () => {
    let startNow = (): void => undefined;
    const setup = await setUp({
      draftsRepo: (real) => ({
        ...real,
        saveResult: (generation, draft) => {
          const saving = real.saveResult(generation, draft);
          startNow();
          return saving;
        },
      }),
    });
    setup.fake.on(GEMINI, answer(BAKE));
    let started: Promise<void> = Promise.resolve();
    startNow = () => {
      startNow = () => undefined;
      started = setup.service.start('text', { text: 'Vegetable bake' });
    };

    expect(await openForReview(setup.service, { photoIds: [], source: 'manual' })).toBe(false);
    expect(phaseOf(setup.service)).not.toBe('reviewReady');
    await started;
    expect(reviewOf(setup.service).draft.draft.name).toBe('Vegetable bake');
  });

  it('rejects when the draft cannot be stored, leaving no review', async () => {
    const setup = await setUp({
      draftsRepo: (real) => ({
        ...real,
        saveResult: () => Promise.reject(new Error('disk full')),
      }),
    });

    await expect(openForReview(setup.service, { photoIds: [], source: 'manual' })).rejects.toThrow(
      'disk full',
    );
    expect(phaseOf(setup.service)).toBe('idle');
  });
});
