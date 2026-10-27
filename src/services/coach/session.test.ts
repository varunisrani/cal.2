import { afterEach, describe, expect, it } from 'vitest';
import { COACH_THUMBNAIL, type ImageBackend } from '../../ai/image';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../ai/settings';
import { fakeFetch, type FakeFetch, type RecordedRequest } from '../../ai/testing/fakeFetch';
import { openAiToolCalls } from '../../ai/testing/toolWire';
import { anthropicError, openAiAnswer, openAiError } from '../../ai/testing/wire';
import type { PlatewiseDb } from '../../data/schema';
import { makeProfile } from '../../test/factories';
import { createFakeCodec, type FakeCodec } from '../../test/fakeImageCodec';
import { entryOn, fixtureDiary } from './__fixtures__/snapshot';
import { closeAll, openCoachStores, type CoachStores } from './__fixtures__/stores';
import type { StoredAiAccess } from '../aiAccess';
import { COACH_THUMB, createCoachSession, type CoachSession } from './session';

const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MISTRAL_KEY = 'mi-session-key-6610';
const ANTHROPIC_KEY = 'an-session-key-2294';
const PHOTO_ONLY = 'Look at the attached photo, please.';

const SETTINGS: AiSettings = {
  ...DEFAULT_AI_SETTINGS,
  primary: { provider: 'mistral', model: 'mistral-small-2603' },
};

type Json = Record<string, unknown>;

function messagesOf(request: RecordedRequest | undefined): Json[] {
  return ((request?.body ?? {}) as { messages?: Json[] }).messages ?? [];
}

/** The text of a request's last message, the question this turn asks. */
function questionOf(request: RecordedRequest | undefined): unknown {
  return messagesOf(request).at(-1)?.content;
}

/**
 * A fetch that keeps every request waiting at the door until `release` (or until it is aborted),
 * then hands it to the fake. `reached` settles when the first request arrives.
 */
function heldFetch(inner: typeof fetch) {
  let arrive = (): void => undefined;
  let open = (): void => undefined;
  const reached = new Promise<void>((resolve) => (arrive = resolve));
  const gate = new Promise<void>((resolve) => (open = resolve));
  const held: typeof fetch = async (input, init) => {
    arrive();
    await new Promise<void>((resolve) => {
      void gate.then(resolve);
      if (init?.signal?.aborted) resolve();
      init?.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    return inner(input, init);
  };
  return { fetch: held, reached, release: () => open() };
}

/** Every photo decodes for the model as 4 000 × 3 000; records what it is drawn at. */
function modelBackend() {
  const drawn: { width: number; height: number; quality: number }[] = [];
  const backend: ImageBackend = {
    decode: () =>
      Promise.resolve({
        width: 4000,
        height: 3000,
        toJpeg: (width, height, quality) => {
          drawn.push({ width, height, quality });
          return Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1));
        },
        close: () => undefined,
      }),
  };
  return { backend, drawn };
}

interface Harness {
  readonly stores: CoachStores;
  readonly session: CoachSession;
  readonly fake: FakeFetch;
  readonly codec: FakeCodec;
  readonly drawn: { width: number; height: number; quality: number }[];
  readonly hold?: ReturnType<typeof heldFetch>;
  /** How often subscribers heard a change. */
  changes(): number;
}

const opened: PlatewiseDb[] = [];
afterEach(() => closeAll(opened));

interface SetUpOptions {
  readonly settings?: AiSettings;
  /** Hold every request until released. */
  readonly hold?: boolean;
  /** Store the profile (true by default). */
  readonly profile?: boolean;
}

async function setUp(options: SetUpOptions = {}): Promise<Harness> {
  const stores = await openCoachStores();
  opened.push(stores.db);
  if (options.profile !== false) await stores.profileRepo.save(makeProfile());
  await stores.diaryRepo.addMany(fixtureDiary());
  const fake = fakeFetch();
  const hold = options.hold ? heldFetch(fake.fetch) : undefined;
  const codec = createFakeCodec();
  const { backend, drawn } = modelBackend();
  const access: StoredAiAccess = {
    settings: options.settings ?? SETTINGS,
    keys: { mistral: MISTRAL_KEY, anthropic: ANTHROPIC_KEY },
    configured: true,
  };
  const session = createCoachSession({
    coachRepo: stores.coachRepo,
    data: stores.sources,
    aiAccess: () => Promise.resolve(access),
    fetch: hold?.fetch ?? fake.fetch,
    photoOnlyText: () => PHOTO_ONLY,
    codec: codec.codec,
    imageBackend: backend,
  });
  let changes = 0;
  session.subscribe(() => {
    changes += 1;
  });
  return { stores, session, fake, codec, drawn, hold, changes: () => changes };
}

/** The stored conversation as side, words and failure mark. */
async function chat(stores: CoachStores) {
  return (await stores.coachRepo.list()).map((message) => ({
    role: message.role,
    text: message.text,
    ...(message.state ? { state: message.state } : {}),
  }));
}

describe('createCoachSession: send (04 §3.6)', () => {
  it('stores the question, then the answer, pending only while the turn runs', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('  About 1 650 kcal so far today.  ') });

    const turn = h.session.send('  How am I doing today?  ');
    expect(h.session.getState()).toEqual({ pending: true });
    expect(h.changes()).toBe(1);

    expect(await turn).toBe('answered');
    expect(h.session.getState()).toEqual({ pending: false });
    expect(h.changes()).toBe(2);
    expect(await chat(h.stores)).toEqual([
      { role: 'user', text: 'How am I doing today?' },
      { role: 'assistant', text: 'About 1 650 kcal so far today.' },
    ]);
    expect(questionOf(h.fake.requests[0])).toBe('How am I doing today?');
  });

  it('starts one turn for two sends in the same tick (R04.5)', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('About 1 650 kcal so far today.') });

    const first = h.session.send('How am I doing today?');
    const second = h.session.send('How am I doing today?');

    expect(await second).toBe('ignored');
    expect(await first).toBe('answered');
    expect(h.fake.requests).toHaveLength(1);
    expect((await chat(h.stores)).map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('ignores blank text without a photo, never turning pending', async () => {
    const h = await setUp();

    expect(await h.session.send(' \n ')).toBe('ignored');
    expect(h.changes()).toBe(0);
    expect(await chat(h.stores)).toEqual([]);
  });

  it('stores a photo without words as the fixed request with a small thumbnail; the model gets its own copy', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('A tuna salad, roughly 450 kcal.') });
    const photo = await h.codec.photo(4000, 3000);

    expect(await h.session.send('   ', photo)).toBe('answered');

    const [question] = await h.stores.coachRepo.list();
    expect(question).toMatchObject({ role: 'user', text: PHOTO_ONLY });
    expect(await h.codec.sizeOf(question?.thumb as Blob)).toEqual({ width: 700, height: 525 });
    expect(h.codec.encodes).toEqual([{ width: 700, height: 525, maxEdge: 700, quality: 0.68 }]);
    expect(h.drawn).toEqual([{ width: 1600, height: 1200, quality: 0.78 }]);
    expect(questionOf(h.fake.requests[0])).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AE=' } },
      { type: 'text', text: PHOTO_ONLY },
    ]);
  });

  it('keeps the thumbnail at P03-10’s Coach size', () => {
    expect(COACH_THUMB).toEqual(COACH_THUMBNAIL);
  });

  it('stores and sends nothing for a photo the browser cannot read', async () => {
    const h = await setUp();

    expect(await h.session.send('What is this?', await h.codec.undecodable())).toBe(
      'photoUnreadable',
    );
    expect(await chat(h.stores)).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
    expect(h.session.getState()).toEqual({ pending: false });
  });

  it('runs the tools on the data as it stood at Send, not on what is logged meanwhile (R04.22)', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(
      MISTRAL,
      {
        json: openAiToolCalls([
          { id: 'c1', name: 'food_log', args: { from: '2026-10-25', to: '2026-10-25' } },
        ]),
      },
      { json: openAiAnswer('Just a matcha oat latte.') },
    );

    const turn = h.session.send('What did I eat yesterday?');
    await h.hold?.reached;
    await h.stores.diaryRepo.add(entryOn('2026-10-25', '21:30', { name: 'Midnight noodles' }));
    h.hold?.release();

    expect(await turn).toBe('answered');
    const tool = messagesOf(h.fake.requests[1]).find((message) => message.role === 'tool');
    expect(String(tool?.content)).toContain('Matcha oat latte');
    expect(String(tool?.content)).not.toContain('Midnight noodles');
  });
});

describe('createCoachSession: failures and Retry (D-16.31, R04.4)', () => {
  it('marks a failed question with its kind and the provider’s message, keys cut out (ACC-I11-1)', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, {
      status: 401,
      json: openAiError(`Bad key ${MISTRAL_KEY}; also tried ${ANTHROPIC_KEY}`),
    });

    expect(await h.session.send('How am I doing today?')).toBe('failed');
    expect(await chat(h.stores)).toEqual([
      {
        role: 'user',
        text: 'How am I doing today?',
        state: { status: 'failed', kind: 'keyRejected', details: 'Bad key •••; also tried •••' },
      },
    ]);
    expect(h.session.getState()).toEqual({ pending: false });
  });

  it('stores the standby’s failure when both providers fail', async () => {
    const h = await setUp({
      settings: {
        ...SETTINGS,
        textStandby: { on: true, provider: 'anthropic', model: 'claude-haiku-5-5' },
      },
    });
    h.fake
      .on(MISTRAL, { status: 401, json: openAiError('Unauthorized') })
      .on(ANTHROPIC, { status: 404, json: anthropicError('not_found_error', 'No such model') });

    expect(await h.session.send('How am I doing today?')).toBe('failed');
    const [question] = await h.stores.coachRepo.list();
    expect(question?.state).toEqual({ status: 'failed', kind: 'model', details: 'No such model' });
  });

  it('asks a failed question again without storing it twice, its mark cleared (R04.4, ACC-I11-1)', async () => {
    const h = await setUp();
    h.fake.on(
      MISTRAL,
      { status: 500, json: openAiError('Internal error') },
      { json: openAiAnswer('About 1 650 kcal so far today.') },
    );
    expect(await h.session.send('How am I doing today?')).toBe('failed');
    const [failed] = await h.stores.coachRepo.list();

    const retry = h.session.retry(failed?.id ?? '');
    expect(h.session.getState()).toEqual({ pending: true });
    expect(await retry).toBe('answered');

    expect(await chat(h.stores)).toEqual([
      { role: 'user', text: 'How am I doing today?' },
      { role: 'assistant', text: 'About 1 650 kcal so far today.' },
    ]);
    expect(messagesOf(h.fake.requests[1]).filter((message) => message.role === 'user')).toEqual([
      { role: 'user', content: 'How am I doing today?' },
    ]);
  });

  it('marks the question again when the retry fails too', async () => {
    const h = await setUp();
    const busy = { status: 500, json: openAiError('Internal error') };
    h.fake.on(MISTRAL, busy, busy);
    await h.session.send('How am I doing today?');
    const [failed] = await h.stores.coachRepo.list();

    expect(await h.session.retry(failed?.id ?? '')).toBe('failed');
    expect(await chat(h.stores)).toEqual([
      {
        role: 'user',
        text: 'How am I doing today?',
        state: { status: 'failed', kind: 'generic', details: 'Internal error' },
      },
    ]);
  });

  it('sends a failed photo question’s photo again on Retry', async () => {
    const h = await setUp();
    h.fake.on(
      MISTRAL,
      { status: 500, json: openAiError('Internal error') },
      { json: openAiAnswer('A tuna salad.') },
    );
    await h.session.send('What is this?', await h.codec.photo(4000, 3000));
    const [failed] = await h.stores.coachRepo.list();

    expect(await h.session.retry(failed?.id ?? '')).toBe('answered');
    expect(questionOf(h.fake.requests[1])).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AE=' } },
      { type: 'text', text: 'What is this?' },
    ]);
  });

  it('ignores a retry of an answered question or an unknown id', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('About 1 650 kcal so far today.') });
    await h.session.send('How am I doing today?');
    const [answered] = await h.stores.coachRepo.list();

    expect(await h.session.retry(answered?.id ?? '')).toBe('ignored');
    expect(await h.session.retry('message-404')).toBe('ignored');
    expect(h.fake.requests).toHaveLength(1);
  });

  it('marks the question generic when no profile can be read, sending nothing', async () => {
    const h = await setUp({ profile: false });

    expect(await h.session.send('How am I doing today?')).toBe('failed');
    expect(await chat(h.stores)).toEqual([
      { role: 'user', text: 'How am I doing today?', state: { status: 'failed', kind: 'generic' } },
    ]);
    expect(h.fake.requests).toHaveLength(0);
  });
});

describe('createCoachSession: Reset (R04.6, D-16.34)', () => {
  it('aborts the running request, ends pending at once and leaves the chat empty (ACC-I5-1)', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('A late answer.') });

    const turn = h.session.send('How am I doing today?');
    await h.hold?.reached;
    const resetting = h.session.reset();
    expect(h.session.getState()).toEqual({ pending: false });
    await resetting;

    expect(await turn).toBe('dropped');
    expect(h.fake.requests[0]?.signal?.aborted).toBe(true);
    h.hold?.release();
    expect(await chat(h.stores)).toEqual([]);
    expect(await h.stores.coachRepo.generation()).toBe(1);
  });

  it('drops a reply that comes back after a Reset in another tab', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('A late answer.') });

    const turn = h.session.send('How am I doing today?');
    await h.hold?.reached;
    await h.stores.coachRepo.reset();
    h.hold?.release();

    expect(await turn).toBe('dropped');
    expect(h.fake.requests).toHaveLength(1);
    expect(await chat(h.stores)).toEqual([]);
  });

  it('lets a question sent right after a Reset land in the new conversation', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('Fresh start: 1 650 kcal so far.') });

    const old = h.session.send('How am I doing today?');
    await h.hold?.reached;
    const resetting = h.session.reset();
    const fresh = h.session.send('And now?');
    h.hold?.release();
    await resetting;

    expect(await old).toBe('dropped');
    expect(await fresh).toBe('answered');
    expect(await chat(h.stores)).toEqual([
      { role: 'user', text: 'And now?' },
      { role: 'assistant', text: 'Fresh start: 1 650 kcal so far.' },
    ]);
  });

  it('stores nothing when Reset comes while the photo is being prepared', async () => {
    const h = await setUp();
    const decoding = h.codec.hold();

    const turn = h.session.send('What is this?', await h.codec.photo(4000, 3000));
    await decoding.reached;
    await h.session.reset();
    decoding.release();

    expect(await turn).toBe('dropped');
    expect(await chat(h.stores)).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
  });

  it('clears the conversation when nothing is pending', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('About 1 650 kcal so far today.') });
    await h.session.send('How am I doing today?');

    await h.session.reset();

    expect(await chat(h.stores)).toEqual([]);
    expect(h.session.getState()).toEqual({ pending: false });
  });
});
