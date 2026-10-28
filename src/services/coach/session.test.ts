import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACH_THUMBNAIL, type ImageBackend } from '../../ai/image';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../ai/settings';
import { fakeFetch, type FakeFetch, type RecordedRequest } from '../../ai/testing/fakeFetch';
import { openAiToolCalls } from '../../ai/testing/toolWire';
import { anthropicError, openAiAnswer, openAiError, type JsonObject } from '../../ai/testing/wire';
import { createHealthRepo } from '../../data/repos/healthRepo';
import type { PlatewiseDb } from '../../data/schema';
import { CUSTOM_REMINDER_LIMIT, WEEKDAYS } from '../../domain/reminders/custom';
import { withIdSequence } from '../../lib/ids';
import { makeProfile } from '../../test/factories';
import { createFakeCodec, type FakeCodec } from '../../test/fakeImageCodec';
import {
  SNAPSHOT_NOW,
  SNAPSHOT_TODAY,
  activityOn,
  entryOn,
  fixtureDiary,
} from './__fixtures__/snapshot';
import { storedActions } from './__fixtures__/actions';
import { closeAll, openCoachStores, type CoachStores } from './__fixtures__/stores';
import { readCheckIns } from './checkIns';
import type { StoredAiAccess } from '../aiAccess';
import { createCustomRemindersService } from '../reminders/customReminders';
import { COACH_THUMB, createCoachSession, type CoachSession } from './session';

const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MISTRAL_KEY = 'mi-session-key-6610';
const ANTHROPIC_KEY = 'an-session-key-2294';
const PHOTO_ONLY = 'Look at the attached photo, please.';

/** The chat most tests ask in. */
const CHAT = 'chat-1';

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

/** The words of the question a request asks: its last message's text. */
function askedIn(init: RequestInit | undefined): string {
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Json) : {};
  const last = (body.messages as Json[] | undefined)?.at(-1)?.content;
  return typeof last === 'string' ? last : '';
}

/**
 * A fetch that keeps each request waiting until its question is released (or it is aborted),
 * then hands it to the fake: a test decides which of several chats' requests gets through first,
 * and so which scripted answer it takes.
 */
function gatedFetch(inner: typeof fetch) {
  const doors = new Map<
    string,
    { arrive: () => void; open: () => void; reached: Promise<void>; gate: Promise<void> }
  >();
  const door = (question: string) => {
    let found = doors.get(question);
    if (found === undefined) {
      let arrive = (): void => undefined;
      let open = (): void => undefined;
      const reached = new Promise<void>((resolve) => (arrive = resolve));
      const gate = new Promise<void>((resolve) => (open = resolve));
      found = { arrive: () => arrive(), open: () => open(), reached, gate };
      doors.set(question, found);
    }
    return found;
  };
  const gated: typeof fetch = async (input, init) => {
    const held = door(askedIn(init));
    held.arrive();
    await new Promise<void>((resolve) => {
      void held.gate.then(resolve);
      if (init?.signal?.aborted) resolve();
      init?.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    return inner(input, init);
  };
  return {
    fetch: gated,
    reached: (question: string) => door(question).reached,
    release: (question: string) => door(question).open(),
  };
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
  readonly gate?: ReturnType<typeof gatedFetch>;
  /** The activity copy, when `activityCopy` asked for one. */
  readonly activityRepo?: ReturnType<typeof createHealthRepo>;
  /** Every reply the session reported stored (P17). */
  readonly onReply: ReturnType<typeof vi.fn>;
  /** How often subscribers heard a change. */
  changes(): number;
}

const opened: PlatewiseDb[] = [];
afterEach(() => closeAll(opened));

interface SetUpOptions {
  readonly settings?: AiSettings;
  /** Hold every request until released. */
  readonly hold?: boolean;
  /** Hold each request until its question is released. */
  readonly gate?: boolean;
  /** Store the profile (true by default). */
  readonly profile?: boolean;
  /** Give the session an activity copy, as the Android app does (none by default: the web). */
  readonly activityCopy?: boolean;
  /** Give the session the custom reminders service, as the app does (none by default). */
  readonly reminders?: boolean;
  /** What the Android app lets the Coach do, with `reminders` (P17; none by default: the web). */
  readonly android?: boolean;
}

async function setUp(options: SetUpOptions = {}): Promise<Harness> {
  const stores = await openCoachStores();
  opened.push(stores.db);
  if (options.profile !== false) await stores.profileRepo.save(makeProfile());
  await stores.diaryRepo.addMany(fixtureDiary());
  const fake = fakeFetch();
  const hold = options.hold ? heldFetch(fake.fetch) : undefined;
  const gate = options.gate ? gatedFetch(fake.fetch) : undefined;
  const codec = createFakeCodec();
  const { backend, drawn } = modelBackend();
  const access: StoredAiAccess = {
    settings: options.settings ?? SETTINGS,
    keys: { mistral: MISTRAL_KEY, anthropic: ANTHROPIC_KEY },
    configured: true,
  };
  const activityRepo = options.activityCopy
    ? createHealthRepo(stores.db, { clock: stores.clock })
    : undefined;
  const onReply = vi.fn();
  const session = createCoachSession({
    coachRepo: stores.coachRepo,
    data: activityRepo === undefined ? stores.sources : { ...stores.sources, activityRepo },
    aiAccess: () => Promise.resolve(access),
    fetch: hold?.fetch ?? gate?.fetch ?? fake.fetch,
    photoOnlyText: () => PHOTO_ONLY,
    codec: codec.codec,
    imageBackend: backend,
    ...(options.reminders
      ? {
          reminders: createCustomRemindersService({
            settingsRepo: stores.settingsRepo,
            clock: stores.clock,
            newId: withIdSequence('reminder'),
          }),
        }
      : {}),
    ...(options.android ? { actions: storedActions(stores) } : {}),
    onReply,
    newId: withIdSequence('chat'),
  });
  let changes = 0;
  session.subscribe(() => {
    changes += 1;
  });
  return {
    stores,
    session,
    fake,
    codec,
    drawn,
    hold,
    gate,
    activityRepo,
    onReply,
    changes: () => changes,
  };
}

/** A chat's stored messages (the main test chat's by default) as side, words and failure mark. */
async function chat(stores: CoachStores, chatId = CHAT) {
  return (await stores.coachRepo.list(chatId)).map((message) => ({
    role: message.role,
    text: message.text,
    ...(message.state ? { state: message.state } : {}),
  }));
}

describe('createCoachSession: send (04 §3.6)', () => {
  it('stores the question, then the answer, pending only while the turn runs', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('  About 1 650 kcal so far today.  ') });

    const turn = h.session.send(CHAT, '  How am I doing today?  ');
    expect(h.session.getState()).toEqual({ waiting: [CHAT] });
    expect(h.changes()).toBe(1);

    expect(await turn).toBe('answered');
    expect(h.session.getState()).toEqual({ waiting: [] });
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

    const first = h.session.send(CHAT, 'How am I doing today?');
    const second = h.session.send(CHAT, 'How am I doing today?');

    expect(await second).toBe('ignored');
    expect(await first).toBe('answered');
    expect(h.fake.requests).toHaveLength(1);
    expect((await chat(h.stores)).map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('ignores blank text without a photo, never turning pending', async () => {
    const h = await setUp();

    expect(await h.session.send(CHAT, ' \n ')).toBe('ignored');
    expect(h.changes()).toBe(0);
    expect(await chat(h.stores)).toEqual([]);
  });

  it('stores a photo without words as the fixed request with a small thumbnail; the model gets its own copy', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('A tuna salad, roughly 450 kcal.') });
    const photo = await h.codec.photo(4000, 3000);

    expect(await h.session.send(CHAT, '   ', photo)).toBe('answered');

    const [question] = await h.stores.coachRepo.list(CHAT);
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

    expect(await h.session.send(CHAT, 'What is this?', await h.codec.undecodable())).toBe(
      'photoUnreadable',
    );
    expect(await chat(h.stores)).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
    expect(h.session.getState()).toEqual({ waiting: [] });
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

    const turn = h.session.send(CHAT, 'What did I eat yesterday?');
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

    expect(await h.session.send(CHAT, 'How am I doing today?')).toBe('failed');
    expect(await chat(h.stores)).toEqual([
      {
        role: 'user',
        text: 'How am I doing today?',
        state: { status: 'failed', kind: 'keyRejected', details: 'Bad key •••; also tried •••' },
      },
    ]);
    expect(h.session.getState()).toEqual({ waiting: [] });
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

    expect(await h.session.send(CHAT, 'How am I doing today?')).toBe('failed');
    const [question] = await h.stores.coachRepo.list(CHAT);
    expect(question?.state).toEqual({ status: 'failed', kind: 'model', details: 'No such model' });
  });

  it('asks a failed question again without storing it twice, its mark cleared (R04.4, ACC-I11-1)', async () => {
    const h = await setUp();
    h.fake.on(
      MISTRAL,
      { status: 500, json: openAiError('Internal error') },
      { json: openAiAnswer('About 1 650 kcal so far today.') },
    );
    expect(await h.session.send(CHAT, 'How am I doing today?')).toBe('failed');
    const [failed] = await h.stores.coachRepo.list(CHAT);

    const retry = h.session.retry(CHAT, failed?.id ?? '');
    expect(h.session.getState()).toEqual({ waiting: [CHAT] });
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
    await h.session.send(CHAT, 'How am I doing today?');
    const [failed] = await h.stores.coachRepo.list(CHAT);

    expect(await h.session.retry(CHAT, failed?.id ?? '')).toBe('failed');
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
    await h.session.send(CHAT, 'What is this?', await h.codec.photo(4000, 3000));
    const [failed] = await h.stores.coachRepo.list(CHAT);

    expect(await h.session.retry(CHAT, failed?.id ?? '')).toBe('answered');
    expect(questionOf(h.fake.requests[1])).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AE=' } },
      { type: 'text', text: 'What is this?' },
    ]);
  });

  it('ignores a retry of an answered question or an unknown id', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('About 1 650 kcal so far today.') });
    await h.session.send(CHAT, 'How am I doing today?');
    const [answered] = await h.stores.coachRepo.list(CHAT);

    expect(await h.session.retry(CHAT, answered?.id ?? '')).toBe('ignored');
    expect(await h.session.retry(CHAT, 'message-404')).toBe('ignored');
    expect(h.fake.requests).toHaveLength(1);
  });

  it('marks the question generic when no profile can be read, sending nothing', async () => {
    const h = await setUp({ profile: false });

    expect(await h.session.send(CHAT, 'How am I doing today?')).toBe('failed');
    expect(await chat(h.stores)).toEqual([
      { role: 'user', text: 'How am I doing today?', state: { status: 'failed', kind: 'generic' } },
    ]);
    expect(h.fake.requests).toHaveLength(0);
  });
});

// Reset is Delete chat since P16-02 (D-16.99): the same question, for the open chat; the titles
// below keep the words the acceptance map and the trap ledger cite.
describe('createCoachSession: Reset (R04.6, D-16.34)', () => {
  it('aborts the running request, ends pending at once and leaves the chat empty (ACC-I5-1)', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('A late answer.') });

    const turn = h.session.send(CHAT, 'How am I doing today?');
    await h.hold?.reached;
    const deleting = h.session.deleteChat(CHAT);
    expect(h.session.getState()).toEqual({ waiting: [] });
    await deleting;

    expect(await turn).toBe('dropped');
    expect(h.fake.requests[0]?.signal?.aborted).toBe(true);
    h.hold?.release();
    expect(await chat(h.stores)).toEqual([]);
    expect(await h.stores.coachRepo.chats()).toEqual([]);
  });

  it('drops a reply that comes back after a Reset in another tab', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('A late answer.') });

    const turn = h.session.send(CHAT, 'How am I doing today?');
    await h.hold?.reached;
    // Another tab deletes the chat: this session never hears of it.
    await h.stores.coachRepo.remove(CHAT);
    h.hold?.release();

    expect(await turn).toBe('dropped');
    expect(h.fake.requests).toHaveLength(1);
    expect(await chat(h.stores)).toEqual([]);
    expect(await h.stores.coachRepo.chats()).toEqual([]);
  });

  it('lets a question sent in a new chat right after a Delete land there', async () => {
    const h = await setUp({ hold: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('Fresh start: 1 650 kcal so far.') });

    const old = h.session.send(CHAT, 'How am I doing today?');
    await h.hold?.reached;
    const deleting = h.session.deleteChat(CHAT);
    const fresh = h.session.send('chat-new', 'And now?');
    h.hold?.release();
    await deleting;

    expect(await old).toBe('dropped');
    expect(await fresh).toBe('answered');
    expect(await chat(h.stores)).toEqual([]);
    expect(await chat(h.stores, 'chat-new')).toEqual([
      { role: 'user', text: 'And now?' },
      { role: 'assistant', text: 'Fresh start: 1 650 kcal so far.' },
    ]);
  });

  it('stores nothing when Delete comes while the photo is being prepared', async () => {
    const h = await setUp();
    const decoding = h.codec.hold();

    const turn = h.session.send(CHAT, 'What is this?', await h.codec.photo(4000, 3000));
    await decoding.reached;
    await h.session.deleteChat(CHAT);
    decoding.release();

    expect(await turn).toBe('dropped');
    expect(await chat(h.stores)).toEqual([]);
    expect(await h.stores.coachRepo.chats()).toEqual([]);
    expect(h.fake.requests).toHaveLength(0);
  });

  it('deletes the chat when nothing is pending', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('About 1 650 kcal so far today.') });
    await h.session.send(CHAT, 'How am I doing today?');

    await h.session.deleteChat(CHAT);

    expect(await chat(h.stores)).toEqual([]);
    expect(await h.stores.coachRepo.chats()).toEqual([]);
    expect(h.session.getState()).toEqual({ waiting: [] });
  });
});

describe('createCoachSession: several chats (P16-02, D-16.99)', () => {
  const A = 'chat-a';
  const B = 'chat-b';

  /** The words of every message a request sent, the system text left out. */
  function wordsSent(request: RecordedRequest | undefined): string {
    return JSON.stringify(messagesOf(request).filter((message) => message.role !== 'system'));
  }

  /** The request that asked `question`. */
  function requestFor(h: Harness, question: string): RecordedRequest | undefined {
    return h.fake.requests.find((request) => questionOf(request) === question);
  }

  it('answers two chats at once, each reply in its own chat, each request with its own chat only', async () => {
    const h = await setUp({ gate: true });
    await h.stores.coachRepo.append(
      { chatId: A, role: 'user', text: 'Earlier in A', at: SNAPSHOT_NOW - 60_000 },
      { start: true },
    );
    await h.stores.coachRepo.append({
      chatId: A,
      role: 'assistant',
      text: 'An earlier answer in A.',
      at: SNAPSHOT_NOW - 50_000,
    });
    h.fake.on(
      MISTRAL,
      { json: openAiAnswer('The answer for B.') },
      { json: openAiAnswer('The answer for A.') },
    );

    const inA = h.session.send(A, 'Question in A');
    const inB = h.session.send(B, 'Question in B');
    expect(h.session.getState()).toEqual({ waiting: [A, B] });
    await h.gate?.reached('Question in A');
    await h.gate?.reached('Question in B');

    // B's request goes through first and takes the first answer.
    h.gate?.release('Question in B');
    expect(await inB).toBe('answered');
    expect(h.session.getState()).toEqual({ waiting: [A] });
    h.gate?.release('Question in A');
    expect(await inA).toBe('answered');
    expect(h.session.getState()).toEqual({ waiting: [] });

    expect(await chat(h.stores, B)).toEqual([
      { role: 'user', text: 'Question in B' },
      { role: 'assistant', text: 'The answer for B.' },
    ]);
    expect(await chat(h.stores, A)).toEqual([
      { role: 'user', text: 'Earlier in A' },
      { role: 'assistant', text: 'An earlier answer in A.' },
      { role: 'user', text: 'Question in A' },
      { role: 'assistant', text: 'The answer for A.' },
    ]);
    expect(wordsSent(requestFor(h, 'Question in B'))).not.toContain('Earlier in A');
    expect(wordsSent(requestFor(h, 'Question in A'))).toContain('Earlier in A');
    expect(wordsSent(requestFor(h, 'Question in A'))).not.toContain('Question in B');
    // The same facts and tools for both chats.
    expect(messagesOf(requestFor(h, 'Question in A'))[0]).toEqual(
      messagesOf(requestFor(h, 'Question in B'))[0],
    );
    expect((requestFor(h, 'Question in A')?.body as Json).tools).toEqual(
      (requestFor(h, 'Question in B')?.body as Json).tools,
    );
  });

  it('keeps a reply running while a new chat is started and asked, and lands it in its own chat', async () => {
    const h = await setUp({ gate: true });
    h.fake.on(
      MISTRAL,
      { json: openAiAnswer('Straight away in the new chat.') },
      { json: openAiAnswer('Late, but in A.') },
    );

    const inA = h.session.send(A, 'A slow question');
    await h.gate?.reached('A slow question');
    // The person opens a new chat meanwhile: A's Send waits, the new chat's does not.
    const fresh = h.session.newChatId();
    expect(fresh).not.toBe(A);
    expect(await h.session.send(A, 'Again in A')).toBe('ignored');
    const inFresh = h.session.send(fresh, 'A quick question');
    expect(h.session.getState()).toEqual({ waiting: [A, fresh] });
    h.gate?.release('A quick question');
    expect(await inFresh).toBe('answered');

    h.gate?.release('A slow question');
    expect(await inA).toBe('answered');
    expect(await chat(h.stores, A)).toEqual([
      { role: 'user', text: 'A slow question' },
      { role: 'assistant', text: 'Late, but in A.' },
    ]);
    expect(await chat(h.stores, fresh)).toEqual([
      { role: 'user', text: 'A quick question' },
      { role: 'assistant', text: 'Straight away in the new chat.' },
    ]);
  });

  it('deletes one chat while two wait: its request is aborted and its reply never lands; the other goes on', async () => {
    const h = await setUp({ gate: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('The answer for B.') });

    const inA = h.session.send(A, 'Question in A');
    const inB = h.session.send(B, 'Question in B');
    await h.gate?.reached('Question in A');
    await h.gate?.reached('Question in B');

    await h.session.deleteChat(A);
    expect(h.session.getState()).toEqual({ waiting: [B] });
    expect(await inA).toBe('dropped');
    expect(requestFor(h, 'Question in A')?.signal?.aborted).toBe(true);
    h.gate?.release('Question in B');
    expect(await inB).toBe('answered');

    expect(await chat(h.stores, A)).toEqual([]);
    expect((await h.stores.coachRepo.chats()).map((each) => each.id)).toEqual([B]);
    expect(h.fake.takeUnscripted()).toEqual([]);
  });

  it('asks a failed question again only in its own chat', async () => {
    const h = await setUp();
    h.fake.on(
      MISTRAL,
      { status: 500, json: openAiError('Internal error') },
      { json: openAiAnswer('Now it works.') },
    );
    expect(await h.session.send(A, 'Question in A')).toBe('failed');
    const [failed] = await h.stores.coachRepo.list(A);

    expect(await h.session.retry(B, failed?.id ?? '')).toBe('ignored');
    expect(await h.session.retry(A, failed?.id ?? '')).toBe('answered');
    expect(await chat(h.stores, A)).toEqual([
      { role: 'user', text: 'Question in A' },
      { role: 'assistant', text: 'Now it works.' },
    ]);
    expect(await h.stores.coachRepo.list(B)).toEqual([]);
  });

  it('renames a chat through the store, and gives a new id for each new chat', async () => {
    const h = await setUp();
    h.fake.on(MISTRAL, { json: openAiAnswer('An answer.') });
    await h.session.send(A, 'What did I eat yesterday?');

    expect(await h.session.renameChat(A, 'Yesterday')).toMatchObject({
      id: A,
      title: 'Yesterday',
      titleByPerson: true,
    });
    expect(await h.session.renameChat('chat-gone', 'Nothing')).toBeNull();
    expect([h.session.newChatId(), h.session.newChatId()]).toEqual(['chat-1', 'chat-2']);
  });
});

describe('createCoachSession: Health Connect activity (D-16.94)', () => {
  const TODAY = activityOn(SNAPSHOT_TODAY, { steps: 5120, activeKcal: 240 });

  it('reads the activity copy at Send and offers activity_log while Health Connect is connected', async () => {
    const h = await setUp({ activityCopy: true });
    await h.activityRepo?.putDays([TODAY]);
    await h.stores.settingsRepo.set('health.connected', true);
    h.fake.on(
      MISTRAL,
      {
        json: openAiToolCalls([
          { id: 'a1', name: 'activity_log', args: { from: SNAPSHOT_TODAY, to: SNAPSHOT_TODAY } },
        ]),
      },
      { json: openAiAnswer('5120 steps and 240 active kcal so far today.') },
    );

    expect(await h.session.send(CHAT, 'How active am I today?')).toBe('answered');

    const [first, second] = h.fake.requests;
    const tools = ((first?.body as Json).tools as { function: { name: string } }[]).map(
      (tool) => tool.function.name,
    );
    expect(tools.at(-1)).toBe('activity_log');
    expect(String(messagesOf(first)[0]?.content)).toContain('- Steps: 5120');
    const result = messagesOf(second).find((message) => message.role === 'tool');
    expect(JSON.parse(String(result?.content))).toMatchObject({
      daysWithData: 1,
      items: [{ date: SNAPSHOT_TODAY, steps: 5120, activeKcal: 240 }],
    });
  });

  it('offers no activity tool while Health Connect is not connected, or without a copy', async () => {
    for (const activityCopy of [true, false]) {
      const h = await setUp({ activityCopy });
      await h.activityRepo?.putDays([TODAY]);
      h.fake.on(MISTRAL, { json: openAiAnswer('About 1 650 kcal so far today.') });

      expect(await h.session.send(CHAT, 'How am I doing today?')).toBe('answered');

      const body = h.fake.requests[0]?.body as Json;
      const tools = (body.tools as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      );
      expect(tools).not.toContain('activity_log');
      expect(String(messagesOf(h.fake.requests[0])[0]?.content)).not.toContain('Steps');
    }
  });
});

describe('createCoachSession: reminders the Coach proposes (P13, D-16.93)', () => {
  const DAILY = { text: 'Drink a glass of water', time: '10:00', days: 'daily' };
  const ONCE = { text: 'Call the dietitian', time: '17:30', date: '2026-10-28' };

  /** A turn in which the fake proposes `proposals`, then answers. */
  async function proposed(h: Harness, ...proposals: JsonObject[]): Promise<string> {
    h.fake.on(
      MISTRAL,
      {
        json: openAiToolCalls(
          proposals.map((args, index) => ({ id: `r${index}`, name: 'propose_reminder', args })),
        ),
      },
      { json: openAiAnswer('I have proposed it. Tap Add to set it.') },
    );
    expect(await h.session.send(CHAT, 'Remind me, please.')).toBe('answered');
    const reply = (await h.stores.coachRepo.list(CHAT)).at(-1);
    expect(reply?.role).toBe('assistant');
    return reply!.id;
  }

  async function cards(h: Harness) {
    return (await h.stores.coachRepo.list(CHAT)).at(-1)?.reminders;
  }

  const stored = (h: Harness) => h.stores.settingsRepo.get('remind.custom');

  it('stores the reply with a card for each proposal, waiting for the person', async () => {
    const h = await setUp({ reminders: true });
    await proposed(h, DAILY, ONCE);

    expect(await cards(h)).toEqual([
      { text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, status: 'proposed' },
      { text: 'Call the dietitian', time: '17:30', date: '2026-10-28', status: 'proposed' },
    ]);
    const tools = ((h.fake.requests[0]?.body as Json).tools as { function: { name: string } }[])
      .map((tool) => tool.function.name)
      .at(-1);
    expect(tools).toBe('propose_reminder');
    // Proposing stores no reminder.
    expect(await stored(h)).toEqual([]);
  });

  it('adds a card’s reminder once, and marks the card added with its id', async () => {
    const h = await setUp({ reminders: true });
    const reply = await proposed(h, DAILY);

    const [first, second] = await Promise.all([
      h.session.addReminder(reply, 0, true),
      h.session.addReminder(reply, 0, true),
    ]);
    const third = await h.session.addReminder(reply, 0, true);

    expect(first).toEqual({ ok: true, reminderId: 'reminder-1' });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(await stored(h)).toEqual([
      { id: 'reminder-1', text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, on: true },
    ]);
    expect(await cards(h)).toEqual([
      {
        text: 'Drink a glass of water',
        time: '10:00',
        days: WEEKDAYS,
        status: 'added',
        reminderId: 'reminder-1',
      },
    ]);
  });

  it('adds it switched off when notifications were refused', async () => {
    const h = await setUp({ reminders: true });
    const reply = await proposed(h, ONCE);

    expect(await h.session.addReminder(reply, 0, false)).toEqual({
      ok: true,
      reminderId: 'reminder-1',
    });
    expect(await stored(h)).toEqual([
      {
        id: 'reminder-1',
        text: 'Call the dietitian',
        time: '17:30',
        date: '2026-10-28',
        on: false,
      },
    ]);
  });

  it('answers the service’s problem and leaves the card waiting', async () => {
    const h = await setUp({ reminders: true });
    const reply = await proposed(h, DAILY);
    const full = Array.from({ length: CUSTOM_REMINDER_LIMIT }, (_, index) => ({
      id: `kept-${index}`,
      text: `Kept ${index}`,
      time: '08:00',
      days: ['mon' as const],
      on: true,
    }));
    await h.stores.settingsRepo.set('remind.custom', full);

    expect(await h.session.addReminder(reply, 0, true)).toEqual({ ok: false, problem: 'full' });
    expect(await stored(h)).toHaveLength(CUSTOM_REMINDER_LIMIT);
    expect((await cards(h))?.[0]?.status).toBe('proposed');
  });

  it('dismisses a waiting card for good: it can no longer be added', async () => {
    const h = await setUp({ reminders: true });
    const reply = await proposed(h, DAILY, ONCE);

    await h.session.dismissReminder(reply, 1);

    expect((await cards(h))?.map((card) => card.status)).toEqual(['proposed', 'dismissed']);
    expect(await h.session.addReminder(reply, 1, true)).toEqual({ ok: false, problem: 'gone' });
    expect(await h.session.addReminder('no-such-message', 0, true)).toEqual({
      ok: false,
      problem: 'gone',
    });
    expect(await stored(h)).toEqual([]);
  });

  it('never dismisses a card already added', async () => {
    const h = await setUp({ reminders: true });
    const reply = await proposed(h, DAILY);
    await h.session.addReminder(reply, 0, true);

    await h.session.dismissReminder(reply, 0);

    expect((await cards(h))?.[0]?.status).toBe('added');
  });

  it('offers no reminder tool, and stores no card, without the service', async () => {
    const h = await setUp();
    h.fake.on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'r0', name: 'propose_reminder', args: DAILY }]) },
      { json: openAiAnswer('I cannot set reminders here.') },
    );

    expect(await h.session.send(CHAT, 'Remind me to drink water at 10.')).toBe('answered');

    const tools = (
      (h.fake.requests[0]?.body as Json).tools as { function: { name: string } }[]
    ).map((tool) => tool.function.name);
    expect(tools).not.toContain('propose_reminder');
    expect(await cards(h)).toBeUndefined();
    expect(await h.session.addReminder('message-2', 0, true)).toEqual({
      ok: false,
      problem: 'gone',
    });
  });
});

describe('createCoachSession: what the Coach does itself in the Android app (P17-03, D-16.102)', () => {
  const DAILY = { text: 'Drink a glass of water', time: '10:00', days: 'daily' };
  const CHECK_IN = { date: '2026-10-29', time: '19:00', message: 'How was the new breakfast?' };

  /** A turn in which the fake calls `name` with `args`, then answers. */
  function acts(h: Harness, calls: { name: string; args: JsonObject }[], answer = 'Done.') {
    h.fake.on(
      MISTRAL,
      { json: openAiToolCalls(calls.map((one, index) => ({ id: `t${index}`, ...one }))) },
      { json: openAiAnswer(answer) },
    );
  }

  const reply = async (h: Harness) => (await h.stores.coachRepo.list(CHAT)).at(-1);
  const reminders = (h: Harness) => h.stores.settingsRepo.get('remind.custom');
  const checkIns = async (h: Harness) =>
    readCheckIns(await h.stores.settingsRepo.get('coach.checkIns'));

  it('sets a reminder at once while Let the Coach set reminders is on, its card set', async () => {
    const h = await setUp({ reminders: true, android: true });
    acts(h, [{ name: 'set_reminder', args: DAILY }], 'Set: water every day at 10:00.');

    expect(await h.session.send(CHAT, 'Remind me to drink water at 10 every day.')).toBe(
      'answered',
    );

    expect(await reminders(h)).toEqual([
      { id: 'set-1', text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, on: true },
    ]);
    expect((await reply(h))?.reminders).toEqual([
      {
        text: 'Drink a glass of water',
        time: '10:00',
        days: WEEKDAYS,
        status: 'set',
        reminderId: 'set-1',
      },
    ]);
  });

  it('proposes as on the web while the switch is off', async () => {
    const h = await setUp({ reminders: true, android: true });
    await h.stores.settingsRepo.set('coach.setsReminders', false);
    acts(h, [{ name: 'propose_reminder', args: DAILY }], 'Tap Add to set it.');

    expect(await h.session.send(CHAT, 'Remind me to drink water at 10.')).toBe('answered');

    expect(await reminders(h)).toEqual([]);
    expect((await reply(h))?.reminders?.[0]?.status).toBe('proposed');
  });

  it('takes the reminder away on Undo, and the card waits for Add again', async () => {
    const h = await setUp({ reminders: true, android: true });
    acts(h, [{ name: 'set_reminder', args: DAILY }]);
    await h.session.send(CHAT, 'Remind me to drink water at 10 every day.');
    const id = (await reply(h))!.id;

    await h.session.undoReminder(id, 0);

    expect(await reminders(h)).toEqual([]);
    expect((await reply(h))?.reminders).toEqual([
      { text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, status: 'proposed' },
    ]);
    expect(await h.session.addReminder(id, 0, true)).toEqual({
      ok: true,
      reminderId: 'reminder-1',
    });
  });

  it('ties a check-in to the reply that set it, and a deleted chat’s check-ins go with it', async () => {
    const h = await setUp({ reminders: true, android: true });
    acts(h, [{ name: 'schedule_check_in', args: CHECK_IN }], 'I will check in on Thursday.');

    expect(await h.session.send(CHAT, 'Check on me Thursday evening.')).toBe('answered');
    const stored = await reply(h);
    expect(await checkIns(h)).toEqual([
      {
        id: 'check-1',
        chatId: CHAT,
        at: new Date('2026-10-29T19:00:00').getTime(),
        text: 'How was the new breakfast?',
        messageId: stored?.id,
      },
    ]);

    await h.session.deleteChat(CHAT);
    expect(await checkIns(h)).toEqual([]);
  });

  it('takes back what it set when the reply is not stored: its chat was deleted meanwhile', async () => {
    const h = await setUp({ reminders: true, android: true, hold: true });
    h.fake.on(
      MISTRAL,
      {
        json: openAiToolCalls([
          { id: 't0', name: 'set_reminder', args: DAILY },
          { id: 't1', name: 'schedule_check_in', args: CHECK_IN },
        ]),
      },
      { json: openAiAnswer('Done.') },
    );
    const turn = h.session.send(CHAT, 'Remind me and check on me.');
    await h.hold?.reached;
    // Another tab deletes the chat while the answer is on its way: this session never hears of it.
    await h.stores.coachRepo.remove(CHAT);
    h.hold?.release();

    expect(await turn).toBe('dropped');
    // The Coach did set both on its way to the answer.
    expect(h.fake.requests).toHaveLength(2);
    expect(await reminders(h)).toEqual([]);
    expect(await checkIns(h)).toEqual([]);
    expect(h.onReply).not.toHaveBeenCalled();
  });

  it('reports each stored reply, and nothing for a failed turn', async () => {
    const h = await setUp();
    h.fake.on(
      MISTRAL,
      { json: openAiAnswer('About 1 650 kcal so far today.') },
      { status: 500, json: openAiError('Internal error') },
    );

    await h.session.send(CHAT, 'How am I doing today?');
    expect(h.onReply).toHaveBeenCalledTimes(1);
    expect(h.onReply).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: CHAT,
        role: 'assistant',
        text: 'About 1 650 kcal so far today.',
      }),
    );

    expect(await h.session.send(CHAT, 'And now?')).toBe('failed');
    expect(h.onReply).toHaveBeenCalledTimes(1);
  });

  it('offers neither tool on the web, where the app gives the Coach no actions', async () => {
    const h = await setUp({ reminders: true });
    h.fake.on(MISTRAL, { json: openAiAnswer('Sure.') });
    await h.session.send(CHAT, 'Hello');
    const tools = (
      (h.fake.requests[0]?.body as Json).tools as { function: { name: string } }[]
    ).map((tool) => tool.function.name);
    expect(tools).toContain('propose_reminder');
    expect(tools).not.toContain('set_reminder');
    expect(tools).not.toContain('schedule_check_in');
  });
});
