import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageBackend } from '../ai/image';
import { DEFAULT_AI_SETTINGS } from '../ai/settings';
import { fakeFetch, type FakeFetch, type RecordedRequest } from '../ai/testing/fakeFetch';
import { geminiAnswer, geminiError } from '../ai/testing/wire';
import { createDiaryRepo } from '../data/repos/diaryRepo';
import { createPhotoRepo, type PhotoRepo } from '../data/repos/photoRepo';
import { createSecretsRepo } from '../data/repos/secretsRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import type { PlatewiseDb } from '../data/schema';
import type { IngredientLine } from '../domain/model';
import { withIdSequence } from '../lib/ids';
import { openTestDb } from '../test/db';
import { createFakeCodec } from '../test/fakeImageCodec';
import { makeEntry } from '../test/factories';
import { createAiAccess, type StoredAiAccess } from './aiAccess';
import { MAX_PICK_BYTES } from './captureDrafts';
import {
  createIngredientIntake,
  type IntakeOutcome,
  type IngredientIntakeDeps,
} from './ingredientIntake';
import { createPhotoService } from './photos';

const GEMINI = 'https://generativelanguage.googleapis.com/';
/** The timers faked: fake-indexeddb runs on setImmediate, which stays real. */
const FAKED = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] as const;
const GEMINI_KEY = 'gm-intake-key-3307';

/** A dish the AI breaks into parts; the intake keeps it as one part. */
const CURRY = {
  name: 'Chickpea curry with rice',
  kcal: 640,
  protein: 22,
  carbs: 96,
  fat: 17,
  servingGrams: 450,
  emoji: '🍛',
  parts: [
    { name: 'Rice', grams: 200, kcal: 260, protein: 5, carbs: 57, fat: 1 },
    { name: 'Chickpea curry', grams: 250, kcal: 380, protein: 17, carbs: 39, fat: 16 },
  ],
};
const OIL = { name: 'Olive oil', kcal: 119, protein: 0, carbs: 0, fat: 13.5, servingGrams: 13.5 };

const answer = (food: object) => ({ json: geminiAnswer(JSON.stringify(food)) });

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

interface GeminiBody {
  readonly contents: readonly {
    readonly parts: readonly { readonly text?: string; readonly inlineData?: object }[];
  }[];
}
const partsOf = (request: RecordedRequest | undefined) =>
  (request?.body as GeminiBody | undefined)?.contents[0]?.parts ?? [];

/**
 * A `fetch` that holds every request until `open()`; `arrived` settles once one is waiting. A
 * held request rejects at once on abort, as the browser's does.
 */
function held(fake: FakeFetch) {
  let open: () => void = () => undefined;
  let arrive: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  const signals: AbortSignal[] = [];
  const fetch: typeof globalThis.fetch = (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal ?? undefined;
      if (signal) {
        signals.push(signal);
        signal.addEventListener('abort', () => reject(signal.reason));
      }
      arrive();
      void gate.then(() => fake.fetch(input, { ...init, signal: null })).then(resolve, reject);
    });
  return { fetch, open: () => open(), arrived, signals };
}

const opened: PlatewiseDb[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.close();
});

let connections = 0;

interface SetUpOptions {
  readonly fetch?: (fake: FakeFetch) => typeof globalThis.fetch;
  readonly aiAccess?: () => Promise<StoredAiAccess>;
}

/** The intake over a test database with a Gemini key stored and AI set up. */
async function setUp(options: SetUpOptions = {}) {
  const { db, bus } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const secretsRepo = createSecretsRepo(db);
  await settingsRepo.set('ai.settings', DEFAULT_AI_SETTINGS);
  await secretsRepo.set('gemini', GEMINI_KEY);
  const photoRepo: PhotoRepo = createPhotoRepo(db, {
    newId: withIdSequence(`photo-${++connections}-`),
  });
  const codec = createFakeCodec();
  const fake = fakeFetch();
  const deps: IngredientIntakeDeps = {
    photos: createPhotoService({ photoRepo, codec: codec.codec }),
    photoRepo,
    aiAccess: options.aiAccess ?? createAiAccess({ settingsRepo, secretsRepo }),
    fetch: options.fetch ? options.fetch(fake) : fake.fetch,
    imageBackend: backend,
  };
  const intake = createIngredientIntake(deps);
  return { db, photoRepo, codec, fake, intake, session: intake.open() };
}

function lineOf(outcome: IntakeOutcome): IngredientLine {
  if (outcome.kind !== 'line') throw new Error(`Expected a part, found ${outcome.kind}`);
  return outcome.line;
}

describe('IntakeSession: a part from the AI (02 §3.15)', () => {
  it('turns a description into one part of the whole dish, its own parts not expanded', async () => {
    const { fake, session, db } = await setUp();
    fake.on(GEMINI, answer(CURRY));

    const line = lineOf(await session.describe('  a plate of chickpea curry with rice  '));
    expect(line).toEqual({
      name: 'Chickpea curry with rice',
      grams: 450,
      kcal: 640,
      protein: 22,
      carbs: 96,
      fat: 17,
      photoIds: [],
      emoji: '🍛',
    });
    expect(fake.requests).toHaveLength(1);
    const sent = partsOf(fake.requests[0]);
    expect(sent.some((part) => part.inlineData !== undefined)).toBe(false);
    expect(sent.map((part) => part.text ?? '').join('')).toContain(
      'a plate of chickpea curry with rice',
    );
    expect(await db.photos.count()).toBe(0);
  });

  it('turns a photo into one part that keeps the photo, stored only once the AI answered', async () => {
    const gate = { current: null as ReturnType<typeof held> | null };
    const { fake, session, photoRepo, codec, db } = await setUp({
      fetch: (fake) => {
        gate.current = held(fake);
        return gate.current.fetch;
      },
    });
    fake.on(GEMINI, answer(OIL));
    const asked = session.photo(await codec.photo(1600, 1200));

    await gate.current?.arrived;
    expect(await db.photos.count()).toBe(0);
    gate.current?.open();
    const line = lineOf(await asked);

    expect(line).toMatchObject({ name: 'Olive oil', grams: 13.5, kcal: 119, fat: 13.5 });
    expect(line.photoIds).toHaveLength(1);
    const stored = await photoRepo.get(line.photoIds[0] ?? '');
    expect(stored?.width).toBe(1600);
    expect(partsOf(fake.requests[0]).some((part) => part.inlineData !== undefined)).toBe(true);
  });

  it('stores nothing when the AI fails, and gives the failure its messages', async () => {
    const { fake, session, codec, db } = await setUp();
    fake.on(GEMINI, { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'Refused.') });

    const outcome = await session.photo(await codec.photo(1600, 1200));
    expect(outcome).toMatchObject({
      kind: 'failed',
      failure: { kind: 'keyRejected' },
      messages: [{ key: 'ai.failure.keyRejected' }],
    });
    expect(await db.photos.count()).toBe(0);
  });

  it('says a key is missing before sending anything when the provider has none', async () => {
    const { fake, session } = await setUp({
      aiAccess: async () => ({ settings: DEFAULT_AI_SETTINGS, keys: {}, configured: true }),
    });
    const outcome = await session.describe('two boiled eggs');
    expect(outcome).toMatchObject({ kind: 'failed', messages: [{ key: 'ai.failure.noKey' }] });
    expect(fake.requests).toHaveLength(0);
  });

  it('refuses an empty file and one over 25 MiB before any request', async () => {
    const { fake, session } = await setUp();
    expect(await session.photo(new Blob([]))).toEqual({ kind: 'refused', reason: 'unreadable' });
    const oversized = { size: MAX_PICK_BYTES + 1 } as Blob;
    expect(await session.photo(oversized)).toEqual({ kind: 'refused', reason: 'tooLarge' });
    expect(fake.requests).toHaveLength(0);
  });

  it('runs one request at a time: a second one while the first runs is refused as busy', async () => {
    const gate = { current: null as ReturnType<typeof held> | null };
    const { fake, session } = await setUp({
      fetch: (fake) => {
        gate.current = held(fake);
        return gate.current.fetch;
      },
    });
    fake.on(GEMINI, answer(OIL));
    const first = session.describe('a spoon of olive oil');
    await gate.current?.arrived;

    expect(await session.describe('a slice of bread')).toEqual({ kind: 'busy' });
    gate.current?.open();
    expect(lineOf(await first).name).toBe('Olive oil');
    expect(fake.requests).toHaveLength(1);
  });

  it('gives each request its own time limit from the AI settings', async () => {
    vi.useFakeTimers({ toFake: [...FAKED] });
    const { fake, session } = await setUp({
      aiAccess: async () => ({
        settings: { ...DEFAULT_AI_SETTINGS, timeoutSec: 30 },
        keys: { gemini: GEMINI_KEY },
        configured: true,
      }),
    });
    fake.on(GEMINI, { ...answer(OIL), delayMs: 45_000 });

    const asked = session.describe('a spoon of olive oil');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await asked).toMatchObject({ kind: 'failed', failure: { kind: 'timeout' } });
  });
});

describe('IntakeSession: the sheet goes', () => {
  it('stops a request in flight when it closes, stores nothing and shows nothing', async () => {
    const gate = { current: null as ReturnType<typeof held> | null };
    const { fake, session, codec, db } = await setUp({
      fetch: (fake) => {
        gate.current = held(fake);
        return gate.current.fetch;
      },
    });
    fake.on(GEMINI, answer(OIL));
    const asked = session.photo(await codec.photo(1600, 1200));
    await gate.current?.arrived;

    await session.close();
    expect(await asked).toEqual({ kind: 'stopped' });
    expect(gate.current?.signals.every((signal) => signal.aborted)).toBe(true);
    expect(await db.photos.count()).toBe(0);
    expect(await session.describe('anything')).toEqual({ kind: 'stopped' });
  });

  it('lets go of the photos it stored that nothing names, and keeps one a logged entry names', async () => {
    const { fake, session, codec, photoRepo, db } = await setUp();
    fake.on(GEMINI, answer(OIL), answer({ ...OIL, name: 'Butter' }));
    const kept = lineOf(await session.photo(await codec.photo(1600, 1200)));
    const dropped = lineOf(await session.photo(await codec.photo(800, 600)));
    const [keptId = '', droppedId = ''] = [kept.photoIds[0], dropped.photoIds[0]];

    await createDiaryRepo(db).add(makeEntry({ lines: [kept] }));
    await session.close();

    expect((await photoRepo.get(keptId))?.id).toBe(keptId);
    expect(await photoRepo.get(droppedId)).toBeNull();
  });
});
