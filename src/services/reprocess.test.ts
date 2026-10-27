import { afterEach, describe, expect, it } from 'vitest';
import type { ImageBackend } from '../ai/image';
import { DEFAULT_AI_SETTINGS } from '../ai/settings';
import { fakeFetch, type RecordedRequest } from '../ai/testing/fakeFetch';
import { geminiAnswer, geminiError } from '../ai/testing/wire';
import { createPhotoRepo } from '../data/repos/photoRepo';
import type { PlatewiseDb } from '../data/schema';
import { GRAMS_UNIT, SERVING_COUNT_UNIT } from '../domain/servings/units';
import { withIdSequence } from '../lib/ids';
import { storableBlob } from '../test/blobs';
import { openTestDb } from '../test/db';
import type { StoredAiAccess } from './aiAccess';
import { createReprocessService, reprocessDescription, type ReprocessRequest } from './reprocess';

const GEMINI = 'https://generativelanguage.googleapis.com/';
const ACCESS: StoredAiAccess = {
  settings: DEFAULT_AI_SETTINGS,
  keys: { gemini: 'gm-reprocess-key-4410' },
  configured: true,
};

/** What the AI makes of the edited salad (our own numbers). */
const SALAD = {
  name: 'Grain salad with feta',
  kcal: 520,
  protein: 18,
  carbs: 61,
  fat: 23,
  servingGrams: 320,
  emoji: '🥗',
};

/** Every photo decodes for the AI into the same small JPEG. */
const backend: ImageBackend = {
  decode: () =>
    Promise.resolve({
      width: 1200,
      height: 900,
      toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 3)),
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
const textOf = (request: RecordedRequest | undefined) =>
  partsOf(request)
    .map((part) => part.text ?? '')
    .join('');

const opened: PlatewiseDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function setUp() {
  const { db } = await openTestDb();
  opened.push(db);
  const photoRepo = createPhotoRepo(db, { newId: withIdSequence('photo') });
  const fake = fakeFetch();
  const service = createReprocessService({
    aiAccess: async () => ACCESS,
    photoRepo,
    fetch: fake.fetch,
    imageBackend: backend,
  });
  return { fake, photoRepo, service };
}

const SALAD_REQUEST: ReprocessRequest = {
  name: 'Grain salad',
  amount: { unit: GRAMS_UNIT, count: 280, amount: 280 },
  note: '  extra feta  ',
  photoIds: [],
  progressive: false,
};

describe('reprocessDescription (02 §3.7)', () => {
  it('reads "name, amount. note" with grams, a named unit or a serving count', () => {
    expect(reprocessDescription(SALAD_REQUEST)).toBe('Grain salad, 280 g. extra feta');
    const slice = { kind: 'unit', id: 'slice', gramsEach: 30 } as const;
    expect(
      reprocessDescription({
        name: 'Rye toast',
        amount: { unit: slice, count: 2, amount: 60 },
        note: 'with butter',
      }),
    ).toBe('Rye toast, 2 slice. with butter');
    expect(
      reprocessDescription({
        name: 'Stew',
        amount: { unit: SERVING_COUNT_UNIT, count: 1.5, amount: 1.5 },
        note: 'beef',
      }),
    ).toBe('Stew, 1.5 serving. beef');
  });

  it('leaves out a blank note and an amount that is not above 0', () => {
    expect(reprocessDescription({ ...SALAD_REQUEST, note: '   ' })).toBe('Grain salad, 280 g');
    expect(
      reprocessDescription({
        ...SALAD_REQUEST,
        amount: { unit: GRAMS_UNIT, count: 0, amount: 0 },
      }),
    ).toBe('Grain salad. extra feta');
  });
});

describe('createReprocessService (P06-11)', () => {
  it("sends the entry's photos with the line as their note, and gives back what the AI made of it", async () => {
    const { fake, photoRepo, service } = await setUp();
    const first = await photoRepo.put(await storableBlob(40, 1), { width: 1200, height: 900 });
    const second = await photoRepo.put(await storableBlob(40, 2), { width: 1200, height: 900 });
    fake.on(GEMINI, { json: geminiAnswer(JSON.stringify(SALAD)) });

    const outcome = await service.run(
      { ...SALAD_REQUEST, photoIds: [first, second] },
      new AbortController().signal,
    );

    expect(outcome.kind === 'draft' && outcome.draft).toMatchObject({
      name: 'Grain salad with feta',
      kcal: 520,
      protein: 18,
      basis: { kind: 'grams', grams: 320 },
      emoji: '🥗',
    });
    expect(fake.requests).toHaveLength(1);
    expect(partsOf(fake.requests[0]).filter((part) => part.inlineData)).toHaveLength(2);
    expect(textOf(fake.requests[0])).toContain('Grain salad, 280 g. extra feta');
  });

  it('asks with the line as a typed meal when no photo of the entry can be read', async () => {
    const { fake, service } = await setUp();
    fake.on(GEMINI, { json: geminiAnswer(JSON.stringify(SALAD)) });

    const outcome = await service.run(
      { ...SALAD_REQUEST, photoIds: ['photo-gone'] },
      new AbortController().signal,
    );

    expect(outcome.kind).toBe('draft');
    expect(partsOf(fake.requests[0]).some((part) => part.inlineData)).toBe(false);
    expect(textOf(fake.requests[0])).toContain('Grain salad, 280 g. extra feta');
  });

  it('gives a failure its messages', async () => {
    const { fake, service } = await setUp();
    fake.on(GEMINI, { status: 401, json: geminiError(401, 'UNAUTHENTICATED', 'Refused.') });
    expect(await service.run(SALAD_REQUEST, new AbortController().signal)).toEqual({
      kind: 'failed',
      messages: [{ key: 'ai.failure.keyRejected' }],
    });
  });

  it('answers cancelled and sends nothing once the caller has stopped', async () => {
    const { fake, service } = await setUp();
    const controller = new AbortController();
    controller.abort();
    expect(await service.run(SALAD_REQUEST, controller.signal)).toEqual({ kind: 'cancelled' });
    expect(fake.requests).toHaveLength(0);
  });
});
