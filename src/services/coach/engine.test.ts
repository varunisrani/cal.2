import { afterEach, describe, expect, it } from 'vitest';
import type { ImageBackend } from '../../ai/image';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ProviderKeys } from '../../ai/settings';
import { fakeFetch, type FakeFetch, type RecordedRequest } from '../../ai/testing/fakeFetch';
import {
  anthropicTextStream,
  openAiTextStream,
  openAiToolStream,
  streamReply,
} from '../../ai/testing/streamWire';
import { anthropicToolUse, openAiToolCalls } from '../../ai/testing/toolWire';
import {
  anthropicAnswer,
  anthropicError,
  openAiAnswer,
  openAiError,
  type JsonObject,
} from '../../ai/testing/wire';
import type { PlatewiseDb } from '../../data/schema';
import { addDays } from '../../domain/dates/dayKey';
import type { CoachMessage } from '../../domain/model';
import { WEEKDAYS } from '../../domain/reminders/custom';
import { makeCoachMessage, makeWalk } from '../../test/factories';
import { advanceAsync, useFakeTime } from '../../test/time';
import {
  SNAPSHOT_TODAY,
  activityOn,
  connectedActivity,
  entryOn,
  fixtureDiary,
  makeSnapshot,
  workoutOn,
} from './__fixtures__/snapshot';
import { storedActions } from './__fixtures__/actions';
import { closeAll, openCoachStores } from './__fixtures__/stores';
import { readCheckIns } from './checkIns';
import { MAX_ROUNDS, runTurn, type TurnInput } from './engine';
import { TOOL_RESULT_MAX_CHARS } from './limiter';
import type { ReminderChecks } from './reminderTool';
import { NUTRITION_TOOL_NAMES } from './toolSchemas';

const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MISTRAL_KEY = 'mi-coach-key-5521';
const GROQ_KEY = 'gq-coach-key-7780';
const ANTHROPIC_KEY = 'an-coach-key-3307';
const KEYS: ProviderKeys = { mistral: MISTRAL_KEY, groq: GROQ_KEY, anthropic: ANTHROPIC_KEY };

/** Mistral reads photos and answers everything; nothing optional is on. */
const SETTINGS: AiSettings = {
  ...DEFAULT_AI_SETTINGS,
  primary: { provider: 'mistral', model: 'mistral-small-2603' },
};
/** The same, with an Anthropic text standby. */
const WITH_STANDBY: AiSettings = {
  ...SETTINGS,
  textStandby: { on: true, provider: 'anthropic', model: 'claude-haiku-5-5' },
};

const QUESTION = 'What did I eat yesterday?';

/** A stored conversation: one exchange, then the question as the newest message. */
function conversation(): CoachMessage[] {
  return [
    makeCoachMessage({ id: 'm1', role: 'user', text: 'Hi Coach' }),
    makeCoachMessage({ id: 'm2', role: 'assistant', text: 'Hello! Ask me about your log.' }),
    makeCoachMessage({ id: 'q1', role: 'user', text: QUESTION }),
  ];
}

function input(changes: Partial<TurnInput> = {}): TurnInput {
  return {
    messages: conversation(),
    question: { id: 'q1', text: QUESTION },
    snapshot: makeSnapshot({ entries: fixtureDiary() }),
    ...changes,
  };
}

function ask(fake: FakeFetch, changes: Partial<TurnInput> = {}, settings = SETTINGS) {
  return runTurn(input(changes), { settings, keys: KEYS, fetch: fake.fetch });
}

type Json = Record<string, unknown>;

/** A turn that answered `text` and proposed no reminder. */
function answered(text: string) {
  return { ok: true, value: { text, reminders: [] } };
}

function bodyOf(request: RecordedRequest | undefined): Json {
  return (request?.body ?? {}) as Json;
}

function messagesOf(request: RecordedRequest | undefined): Json[] {
  return (bodyOf(request).messages ?? []) as Json[];
}

/** The tool messages of an OpenAI-compatible request, their content read back as objects. */
function toolResults(request: RecordedRequest | undefined): { id: unknown; result: Json }[] {
  return messagesOf(request)
    .filter((message) => message.role === 'tool')
    .map((message) => ({
      id: message.tool_call_id,
      result: JSON.parse(String(message.content)) as Json,
    }));
}

const FOOD_YESTERDAY = { from: '2026-10-25', to: '2026-10-25' };

/** A reply asking for one `weight_log` call, its id numbered by round. */
function toolRound(round: number) {
  return { json: openAiToolCalls([{ id: `call-${round}`, name: 'weight_log', args: {} }]) };
}

describe('runTurn: rounds (04 §3.11, R04.19)', () => {
  it('answers after two tool rounds, each round carrying the calls and their results (ACC-I8-1)', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'c1', name: 'food_log', args: FOOD_YESTERDAY }]) },
      {
        json: openAiToolCalls([
          { id: 'c2', name: 'daily_energy_totals', args: FOOD_YESTERDAY },
          { id: 'c3', name: 'data_overview', args: {} },
        ]),
      },
      { json: openAiAnswer('  Yesterday you had a matcha oat latte, 180 kcal.  ') },
    );

    expect(await ask(fake)).toEqual(answered('Yesterday you had a matcha oat latte, 180 kcal.'));
    expect(fake.requests).toHaveLength(3);
    const [first, second, third] = fake.requests;
    expect(toolResults(first)).toEqual([]);
    const [food] = toolResults(second);
    expect(food?.id).toBe('c1');
    expect(food?.result).toMatchObject({ from: '2026-10-25', to: '2026-10-25' });
    expect(JSON.stringify(food?.result)).toContain('Matcha oat latte');
    expect(toolResults(third).map((tool) => tool.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('ends with roundLimit when the sixth round still asks for tools, and sends no seventh (R04.11, ACC-I8-2)', async () => {
    const rounds = Array.from({ length: MAX_ROUNDS }, (_, index) => toolRound(index + 1));
    const fake = fakeFetch().on(MISTRAL, ...rounds, { json: openAiAnswer('Never sent') });

    expect(await ask(fake)).toEqual({ ok: false, error: { kind: 'roundLimit' } });
    expect(fake.requests).toHaveLength(6);
    expect(fake.pending()).toBe(1);
    // The sixth request carried the first five rounds' results; the sixth round's call ran nowhere.
    expect(toolResults(fake.requests[5]).map((tool) => tool.id)).toEqual([
      'call-1',
      'call-2',
      'call-3',
      'call-4',
      'call-5',
    ]);
  });

  it('counts the answer round among the six: five tool rounds and the answer fit (R04.19)', async () => {
    const rounds = Array.from({ length: MAX_ROUNDS - 1 }, (_, index) => toolRound(index + 1));
    const fake = fakeFetch().on(MISTRAL, ...rounds, { json: openAiAnswer('Steady at 70 kg.') });

    expect(await ask(fake)).toEqual(answered('Steady at 70 kg.'));
    expect(fake.requests).toHaveLength(MAX_ROUNDS);
  });

  it('keeps the re-ask after a cut-off reply inside its round, so it uses up no round', async () => {
    const rounds = Array.from({ length: MAX_ROUNDS - 1 }, (_, index) => toolRound(index + 1));
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiAnswer('Your weigh', { finishReason: 'length' }) },
      ...rounds,
      { json: openAiAnswer('Steady at 70 kg.') },
    );

    expect(await ask(fake)).toEqual(answered('Steady at 70 kg.'));
    expect(fake.requests).toHaveLength(MAX_ROUNDS + 1);
  });

  it('gives truncated, its own kind, for a reply cut off twice (R04.11)', async () => {
    const cut = { json: openAiAnswer('Your weigh', { finishReason: 'length' }) };
    const fake = fakeFetch().on(MISTRAL, cut, cut);

    expect(await ask(fake)).toEqual({ ok: false, error: { kind: 'truncated' } });
    expect(fake.requests).toHaveLength(2);
  });
});

describe('runTurn: the standby (R04.1, D-16.22)', () => {
  it('re-runs the whole turn on the standby after the primary fails, with nothing from the first attempt (ACC-I12-1)', async () => {
    const fake = fakeFetch()
      .on(
        MISTRAL,
        { json: openAiToolCalls([{ id: 'c1', name: 'food_log', args: FOOD_YESTERDAY }]) },
        { status: 401, json: openAiError('Unauthorized') },
      )
      .on(ANTHROPIC, { json: anthropicAnswer('You had a latte and lasagne.') });

    const result = await ask(fake, {}, WITH_STANDBY);

    expect(result).toEqual(answered('You had a latte and lasagne.'));
    expect(fake.requests.map((request) => request.url)).toEqual([MISTRAL, MISTRAL, ANTHROPIC]);
    const standby = fake.requests[2];
    // From round one: the history and the question in Anthropic's own shape, nothing else.
    expect(bodyOf(standby).messages).toEqual([
      { role: 'user', content: 'Hi Coach' },
      { role: 'assistant', content: 'Hello! Ask me about your log.' },
      { role: 'user', content: QUESTION },
    ]);
    const sent = JSON.stringify(bodyOf(standby));
    for (const leftover of ['c1', 'tool_use', 'tool_result', 'Matcha oat latte']) {
      expect(sent).not.toContain(leftover);
    }
  });

  it('names both providers when both fail, keeping the standby’s failure without any stored key', async () => {
    const fake = fakeFetch()
      .on(MISTRAL, { status: 401, json: openAiError(`Invalid key ${MISTRAL_KEY}`) })
      .on(ANTHROPIC, {
        status: 404,
        json: anthropicError('not_found_error', `No model; ${MISTRAL_KEY}`),
      });

    expect(await ask(fake, {}, WITH_STANDBY)).toEqual({
      ok: false,
      error: {
        kind: 'bothFailed',
        primary: 'Mistral AI',
        standby: 'Anthropic',
        standbyFailure: { kind: 'model', status: 404, detail: 'No model; •••' },
      },
    });
  });

  it('gives the primary’s failure, detail redacted, when no standby is set up', async () => {
    const fake = fakeFetch().on(MISTRAL, {
      status: 401,
      json: openAiError(`Invalid key ${ANTHROPIC_KEY}`),
    });

    expect(await ask(fake)).toEqual({
      ok: false,
      error: { kind: 'keyRejected', status: 401, detail: 'Invalid key •••' },
    });
  });

  it('also sends the standby in after a round limit', async () => {
    const rounds = Array.from({ length: MAX_ROUNDS }, (_, index) => toolRound(index + 1));
    const fake = fakeFetch()
      .on(MISTRAL, ...rounds)
      .on(ANTHROPIC, { json: anthropicAnswer('Your weight is steady.') });

    expect(await ask(fake, {}, WITH_STANDBY)).toEqual(answered('Your weight is steady.'));
  });

  it('stops silently on Cancel and never starts the standby', async () => {
    useFakeTime('2026-10-26T16:30:00Z');
    const cancel = new AbortController();
    const fake = fakeFetch()
      .on(MISTRAL, { json: openAiAnswer('Late'), delayMs: 5_000 })
      .on(ANTHROPIC, { json: anthropicAnswer('Never sent') });

    const pending = runTurn(input(), {
      settings: WITH_STANDBY,
      keys: KEYS,
      fetch: fake.fetch,
      cancel: cancel.signal,
    });
    await advanceAsync(1_000);
    cancel.abort();

    expect(await pending).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(fake.requests.map((request) => request.url)).toEqual([MISTRAL]);
    expect(fake.pending()).toBe(1);
  });

  it('gives timeout when the turn’s time runs out, with no standby (D-16.23)', async () => {
    useFakeTime('2026-10-26T16:30:00Z');
    const fake = fakeFetch()
      .on(MISTRAL, toolRound(1), { json: openAiAnswer('Late'), delayMs: 40_000 })
      .on(ANTHROPIC, { json: anthropicAnswer('Never sent') });

    const pending = runTurn(input(), {
      settings: { ...WITH_STANDBY, timeoutSec: 30 },
      keys: KEYS,
      fetch: fake.fetch,
    });
    await advanceAsync(30_000);

    expect(await pending).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(fake.requests.map((request) => request.url)).toEqual([MISTRAL, MISTRAL]);
  });
});

describe('runTurn: before any request', () => {
  it('refuses without a key for the provider in use, and the standby is not tried', async () => {
    const fake = fakeFetch();
    const result = await runTurn(input(), {
      settings: WITH_STANDBY,
      keys: { anthropic: ANTHROPIC_KEY },
      fetch: fake.fetch,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'noKey' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('refuses a Custom server without an address', async () => {
    const fake = fakeFetch();
    const settings: AiSettings = {
      ...SETTINGS,
      primary: { provider: 'custom', model: 'my-model' },
    };

    expect(await ask(fake, {}, settings)).toEqual({ ok: false, error: { kind: 'invalidUrl' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('refuses a photo the browser cannot read, sending nothing', async () => {
    const fake = fakeFetch();
    const unreadable: ImageBackend = { decode: () => Promise.reject(new Error('HEIC')) };
    const result = await runTurn(input({ image: new Blob([Uint8Array.of(1, 2, 3)]) }), {
      settings: SETTINGS,
      keys: KEYS,
      fetch: fake.fetch,
      imageBackend: unreadable,
    });

    expect(result).toEqual({ ok: false, error: { kind: 'imageConversion' } });
    expect(fake.requests).toHaveLength(0);
  });
});

describe('runTurn: what a request carries', () => {
  /** Records the size and quality every photo is drawn at. */
  function recordingBackend() {
    const drawn: { width: number; height: number; quality: number }[] = [];
    const backend: ImageBackend = {
      decode: () =>
        Promise.resolve({
          width: 3200,
          height: 2400,
          toJpeg: (width, height, quality) => {
            drawn.push({ width, height, quality });
            return Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 7));
          },
          close: () => undefined,
        }),
    };
    return { backend, drawn };
  }

  it('sends a photo question to the primary with the photo at the Coach size, though a text provider is on', async () => {
    const { backend, drawn } = recordingBackend();
    const fake = fakeFetch().on(MISTRAL, {
      json: openAiAnswer('A bowl of ramen, about 600 kcal.'),
    });
    const settings: AiSettings = {
      ...SETTINGS,
      textRole: { on: true, provider: 'groq', model: 'openai/gpt-oss-120b' },
    };

    const result = await runTurn(input({ image: new Blob([Uint8Array.of(9)]) }), {
      settings,
      keys: KEYS,
      fetch: fake.fetch,
      imageBackend: backend,
    });

    expect(result).toEqual(answered('A bowl of ramen, about 600 kcal.'));
    expect(drawn).toEqual([{ width: 1600, height: 1200, quality: 0.78 }]);
    const question = messagesOf(fake.requests[0]).at(-1);
    expect(question).toEqual({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4Ac=' } },
        { type: 'text', text: QUESTION },
      ],
    });
  });

  it('sends a question without a photo to the text provider when it is on', async () => {
    const fake = fakeFetch().on(GROQ, { json: openAiAnswer('About 1 900 kcal a day.') });
    const settings: AiSettings = {
      ...SETTINGS,
      textRole: { on: true, provider: 'groq', model: 'openai/gpt-oss-120b' },
    };

    expect(await ask(fake, {}, settings)).toEqual(answered('About 1 900 kcal a day.'));
    expect(bodyOf(fake.requests[0]).model).toBe('openai/gpt-oss-120b');
  });

  it('sends the facts of the snapshot, the notes once, the six tools and the history', async () => {
    const fake = fakeFetch().on(MISTRAL, { json: openAiAnswer('Noted.') });
    const notes = 'I am vegetarian and train in the mornings.';

    await ask(fake, {}, { ...SETTINGS, instructions: notes });

    const body = bodyOf(fake.requests[0]);
    const [system, ...rest] = messagesOf(fake.requests[0]);
    const text = String(system?.content);
    expect(system?.role).toBe('system');
    expect(text).toContain('2026-10-26');
    expect(text.split(notes)).toHaveLength(2);
    expect(rest).toEqual([
      { role: 'user', content: 'Hi Coach' },
      { role: 'assistant', content: 'Hello! Ask me about your log.' },
      { role: 'user', content: QUESTION },
    ]);
    const tools = body.tools as { function: { name: string } }[];
    expect(tools.map((tool) => tool.function.name)).toEqual([...NUTRITION_TOOL_NAMES]);
  });

  it('cuts every tool result to the 60 000-character limit before sending it (R04.9, D-16.32)', async () => {
    const entries = Array.from({ length: 365 * 3 }, (_, index) =>
      entryOn(addDays(SNAPSHOT_TODAY, Math.floor(index / 3) - 364), '12:00', {
        name: `Meal ${index + 1}`,
        nutrients: { fibre: 6, sugar: 12, sodium: 700, potassium: 900, calcium: 300, iron: 4 },
      }),
    );
    const wide = { from: addDays(SNAPSHOT_TODAY, -364), to: SNAPSHOT_TODAY, limit: 365 };
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'c1', name: 'food_log', args: wide }]) },
      { json: openAiAnswer('You eat about 2 000 kcal a day.') },
    );

    await ask(fake, { snapshot: makeSnapshot({ entries }) });

    const tool = messagesOf(fake.requests[1]).find((message) => message.role === 'tool');
    const content = String(tool?.content);
    expect(content.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    expect(JSON.parse(content)).toMatchObject({ count: 365, truncated: true });
  });
});

describe('runTurn: Health Connect activity (D-16.94)', () => {
  /** An Android turn with Health Connect connected: a week with a long walk on Saturday. */
  function connected(): Partial<TurnInput> {
    return {
      snapshot: makeSnapshot({
        entries: fixtureDiary(),
        activity: connectedActivity([
          activityOn('2026-10-24', {
            steps: 14_250,
            activeKcal: 610,
            totalKcal: 2480,
            distanceM: 10_420,
            sessions: [workoutOn('2026-10-24', '09:00', 95, { type: 'walking', activeKcal: 402 })],
          }),
          activityOn(SNAPSHOT_TODAY, { steps: 3100, activeKcal: 120 }),
        ]),
      }),
    };
  }

  const WEEK = { from: '2026-10-20', to: SNAPSHOT_TODAY };

  it('runs an activity_log call on the snapshot and answers with what it returned', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'a1', name: 'activity_log', args: WEEK }]) },
      {
        json: openAiAnswer(
          'Your best day this week was Saturday: 14250 steps and a 95-minute walk that burned 402 kcal.',
        ),
      },
    );

    const result = await ask(fake, {
      ...connected(),
      question: { id: 'q1', text: 'How active was I this week?' },
    });

    expect(result).toEqual(
      answered(
        'Your best day this week was Saturday: 14250 steps and a 95-minute walk that burned 402 kcal.',
      ),
    );
    expect(fake.requests).toHaveLength(2);
    const [activity] = toolResults(fake.requests[1]);
    expect(activity?.id).toBe('a1');
    expect(activity?.result).toEqual({
      from: '2026-10-20',
      to: '2026-10-26',
      daysWithData: 2,
      items: [
        {
          date: '2026-10-24',
          steps: 14_250,
          activeKcal: 610,
          totalKcal: 2480,
          distanceM: 10_420,
          workouts: [
            { type: 'walking', start: '2026-10-24T09:00:00-04:00', minutes: 95, activeKcal: 402 },
          ],
        },
        { date: '2026-10-26', steps: 3100, activeKcal: 120, workouts: [] },
      ],
    });
  });

  it('offers activity_log and sends its rules and today’s activity only when the snapshot has activity', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiAnswer('You are on 3100 steps so far.') },
      { json: openAiAnswer('Noted.') },
    );

    await ask(fake, connected());
    await ask(fake);

    const [android, web] = fake.requests.map((request) => ({
      tools: (bodyOf(request).tools as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      ),
      system: String(messagesOf(request)[0]?.content),
    }));
    expect(android?.tools).toEqual([...NUTRITION_TOOL_NAMES, 'activity_log']);
    expect(android?.system).toContain('Activity from Health Connect:');
    expect(android?.system).toContain('- Steps: 3100');
    expect(android?.system).toContain(
      '"Count active calories" is on, so today\'s energy target is the',
    );
    expect(web?.tools).toEqual([...NUTRITION_TOOL_NAMES]);
    expect(web?.system).not.toMatch(/Health Connect|activity_log|Steps/);
  });

  it('answers a stray activity_log call on the web with an error and still finishes the turn', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'a1', name: 'activity_log', args: WEEK }]) },
      { json: openAiAnswer('I cannot see activity data here.') },
    );

    expect(await ask(fake)).toEqual(answered('I cannot see activity data here.'));
    const [stray] = toolResults(fake.requests[1]);
    expect(String(stray?.result.error)).toContain('needs Health Connect');
  });
});

describe('runTurn: reminders the Coach proposes (P13, D-16.93)', () => {
  /** Checks as the custom reminders service would, with the date 2026-10-26 already past noon. */
  const checks: ReminderChecks = {
    problemWith: (proposal) =>
      proposal.date !== undefined && proposal.date < '2026-10-27' ? 'past' : null,
  };
  const DAILY = { text: 'Drink a glass of water', time: '10:00', days: 'daily' };

  function remind(args: JsonObject, id = 'r1') {
    return { json: openAiToolCalls([{ id, name: 'propose_reminder', args }]) };
  }

  it('offers propose_reminder and its rules only when the turn can take proposals', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiAnswer('Sure.') },
      { json: openAiAnswer('Sure.') },
    );

    await ask(fake, { reminders: checks });
    await ask(fake);

    const [withDesk, without] = fake.requests.map((request) => ({
      tools: (bodyOf(request).tools as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      ),
      system: String(messagesOf(request)[0]?.content),
    }));
    expect(withDesk?.tools).toEqual([...NUTRITION_TOOL_NAMES, 'propose_reminder']);
    expect(withDesk?.system).toContain('Reminders:');
    expect(without?.tools).toEqual([...NUTRITION_TOOL_NAMES]);
    expect(without?.system).not.toMatch(/propose_reminder|Reminders:/);
  });

  it('runs a propose_reminder call, tells the model it waits for Add, and ends with the proposal', async () => {
    const fake = fakeFetch().on(MISTRAL, remind(DAILY), {
      json: openAiAnswer('I have proposed a daily reminder at 10:00. Tap Add to set it.'),
    });

    const result = await ask(fake, { reminders: checks });

    expect(result).toEqual({
      ok: true,
      value: {
        text: 'I have proposed a daily reminder at 10:00. Tap Add to set it.',
        reminders: [
          {
            text: 'Drink a glass of water',
            time: '10:00',
            days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
          },
        ],
      },
    });
    const [proposed] = toolResults(fake.requests[1]);
    expect(proposed?.id).toBe('r1');
    expect(proposed?.result).toMatchObject({
      proposed: true,
      reminder: { text: 'Drink a glass of water', time: '10:00', days: 'daily' },
    });
    expect(String(proposed?.result.note)).toContain('Nothing is set until they tap Add');
  });

  it('answers a proposal that cannot be kept with its problem, so no card comes of it', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      remind({ text: 'Call the dietitian', time: '17:00', date: '2026-10-25' }),
      { json: openAiAnswer('That day has passed. Which day should I use?') },
    );

    const result = await ask(fake, { reminders: checks });

    expect(result).toEqual(answered('That day has passed. Which day should I use?'));
    const [refused] = toolResults(fake.requests[1]);
    expect(refused?.result).toMatchObject({ problem: 'past' });
    expect(String(refused?.result.error)).toContain('already passed');
  });

  it('starts the standby with no proposals from the attempt that failed (R04.1)', async () => {
    const fake = fakeFetch()
      .on(MISTRAL, remind(DAILY), { status: 401, json: openAiError('Unauthorized') })
      .on(ANTHROPIC, { json: anthropicAnswer('Here is a different answer.') });

    const result = await ask(fake, { reminders: checks }, WITH_STANDBY);

    expect(result).toEqual(answered('Here is a different answer.'));
  });

  it('answers a stray propose_reminder call with not available when the turn takes none', async () => {
    const fake = fakeFetch().on(MISTRAL, remind(DAILY), {
      json: openAiAnswer('I cannot set reminders here.'),
    });

    expect(await ask(fake)).toEqual(answered('I cannot set reminders here.'));
    const [stray] = toolResults(fake.requests[1]);
    expect(String(stray?.result.error)).toContain('is not available here');
  });
});

describe('runTurn: what the Coach does itself in the Android app (P17-03, D-16.102)', () => {
  const opened: PlatewiseDb[] = [];
  afterEach(() => closeAll(opened));

  /** The app's actions over a test store, and the turn's input for chat-1. */
  async function android(setsReminders = true) {
    const stores = await openCoachStores();
    opened.push(stores.db);
    await stores.settingsRepo.set('coach.setsReminders', setsReminders);
    const actions = storedActions(stores);
    return {
      stores,
      changes: {
        reminders: { problemWith: actions.reminders.problemWith },
        actions,
        chatId: 'chat-1',
      } satisfies Partial<TurnInput>,
      reminders: () => stores.settingsRepo.get('remind.custom'),
      checkIns: async () => readCheckIns(await stores.settingsRepo.get('coach.checkIns')),
    };
  }

  const DAILY = { text: 'Drink a glass of water', time: '10:00', days: 'daily' };
  const CHECK_IN = { date: '2026-10-29', time: '19:00', message: 'How was the new breakfast?' };

  function offered(request: RecordedRequest | undefined) {
    return {
      tools: (bodyOf(request).tools as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      ),
      system: String(messagesOf(request)[0]?.content),
    };
  }

  it('offers set_reminder and schedule_check_in with their rules; propose_reminder while it is off', async () => {
    const on = await android(true);
    const off = await android(false);
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiAnswer('Sure.') },
      { json: openAiAnswer('Sure.') },
    );

    await ask(fake, on.changes);
    await ask(fake, off.changes);

    const [setting, proposing] = fake.requests.map(offered);
    expect(setting?.tools).toEqual([...NUTRITION_TOOL_NAMES, 'set_reminder', 'schedule_check_in']);
    expect(setting?.system).toContain('call set_reminder');
    expect(setting?.system).toContain('Check-ins:');
    expect(setting?.system).not.toContain('propose_reminder');
    expect(proposing?.tools).toEqual([
      ...NUTRITION_TOOL_NAMES,
      'propose_reminder',
      'schedule_check_in',
    ]);
    expect(proposing?.system).toContain('call propose_reminder');
  });

  it('sets a reminder in a round, tells the model it is set, and ends with it as set', async () => {
    const a = await android();
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'r1', name: 'set_reminder', args: DAILY }]) },
      { json: openAiAnswer('Done: a reminder to drink a glass of water every day at 10:00.') },
    );

    const result = await ask(fake, a.changes);

    expect(result.ok && result.value.reminders).toEqual([
      { text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, reminderId: 'set-1' },
    ]);
    expect(result.ok && typeof result.value.settle).toBe('function');
    expect(toolResults(fake.requests[1])[0]?.result).toMatchObject({ set: true });
    expect(await a.reminders()).toHaveLength(1);
  });

  it('schedules a check-in in a round for its chat, tied to the reply once it is stored', async () => {
    const a = await android();
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'k1', name: 'schedule_check_in', args: CHECK_IN }]) },
      { json: openAiAnswer('I will check in on Thursday at 7 pm.') },
    );

    const result = await ask(fake, a.changes);
    expect(toolResults(fake.requests[1])[0]).toMatchObject({
      id: 'k1',
      result: { scheduled: true, checkIn: CHECK_IN },
    });
    expect(result.ok).toBe(true);
    if (result.ok) await result.value.settle?.({ id: 'reply-1' });

    expect(await a.checkIns()).toEqual([
      {
        id: 'check-1',
        chatId: 'chat-1',
        at: new Date('2026-10-29T19:00:00').getTime(),
        text: 'How was the new breakfast?',
        messageId: 'reply-1',
      },
    ]);
  });

  it('takes back what a failed attempt set, so the standby starts from nothing set', async () => {
    const a = await android();
    const fake = fakeFetch()
      .on(
        MISTRAL,
        {
          json: openAiToolCalls([
            { id: 'r1', name: 'set_reminder', args: DAILY },
            { id: 'k1', name: 'schedule_check_in', args: CHECK_IN },
          ]),
        },
        { status: 401, json: openAiError('Unauthorized') },
      )
      .on(
        ANTHROPIC,
        { json: anthropicToolUse([{ id: 'r2', name: 'set_reminder', args: DAILY }]) },
        { json: anthropicAnswer('Your reminder is set for 10:00 every day.') },
      );

    const result = await ask(fake, a.changes, WITH_STANDBY);

    expect(result.ok && result.value.text).toBe('Your reminder is set for 10:00 every day.');
    expect((await a.reminders()).map(({ id }) => id)).toEqual(['set-2']);
    expect(await a.checkIns()).toEqual([]);
  });

  it('takes it all back when the turn fails for good', async () => {
    const a = await android();
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'k1', name: 'schedule_check_in', args: CHECK_IN }]) },
      { status: 401, json: openAiError('Unauthorized') },
    );

    expect((await ask(fake, a.changes)).ok).toBe(false);
    expect(await a.checkIns()).toEqual([]);
  });

  it('offers neither without a chat to come back to, nor on the web', async () => {
    const a = await android();
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiAnswer('Sure.') },
      { json: openAiAnswer('Sure.') },
    );
    const { chatId: _chatId, ...withoutChat } = a.changes;

    await ask(fake, withoutChat);
    await ask(fake, { reminders: a.changes.reminders });

    for (const request of fake.requests) {
      expect(offered(request).tools).toEqual([...NUTRITION_TOOL_NAMES, 'propose_reminder']);
      expect(offered(request).system).not.toMatch(/set_reminder|schedule_check_in|Check-ins:/);
    }
  });
});

describe('runTurn: recorded walks (D-16.96)', () => {
  it('offers walk_log with what the walk score means only when the snapshot holds walks', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      { json: openAiToolCalls([{ id: 'w1', name: 'walk_log', args: {} }]) },
      { json: openAiAnswer('You walked 30 minutes this morning.') },
      { json: openAiAnswer('Noted.') },
    );

    await ask(fake, {
      snapshot: makeSnapshot({ walks: { countActive: true, items: [makeWalk({ id: 'walk-a' })] } }),
    });
    await ask(fake);

    const [android, , web] = fake.requests.map((request) => ({
      tools: (bodyOf(request).tools as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      ),
      system: String(messagesOf(request)[0]?.content),
    }));
    expect(android?.tools).toEqual([...NUTRITION_TOOL_NAMES, 'walk_log']);
    expect(android?.system).toContain('Walks recorded in Platewise:');
    const answer = messagesOf(fake.requests[1]).find((message) => message.role === 'tool');
    expect(JSON.parse(String(answer?.content))).toMatchObject({ count: 1 });
    expect(web?.tools).toEqual([...NUTRITION_TOOL_NAMES]);
    expect(web?.system).not.toMatch(/walk_log|walk score/);
  });
});

describe('runTurn: replies that stream in (D-16.106)', () => {
  const opened: PlatewiseDb[] = [];
  afterEach(() => closeAll(opened));

  /** A turn that records every text handed up while it runs. */
  async function streamed(fake: FakeFetch, changes: Partial<TurnInput> = {}, settings = SETTINGS) {
    const shown: string[] = [];
    const result = await runTurn(input({ ...changes, onText: (text) => shown.push(text) }), {
      settings,
      keys: KEYS,
      fetch: fake.fetch,
    });
    return { result, shown };
  }

  it('hands up each round’s text, runs the tools when their round is over, then answers (ACC-I13-1)', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      streamReply(
        openAiToolStream(
          [
            {
              id: 's1',
              name: 'food_log',
              argPieces: ['{"from":"2026-10-25",', '"to":"2026-10-25"}'],
            },
          ],
          { text: ['Let me ', 'check.'] },
        ),
        { pieceSize: 50 },
      ),
      streamReply(openAiTextStream(['Yesterday: ', 'a matcha oat latte, ', '180 kcal.'])),
    );

    const { result, shown } = await streamed(fake);

    expect(result).toEqual(answered('Yesterday: a matcha oat latte, 180 kcal.'));
    expect(shown).toEqual([
      'Let me',
      'Let me check.',
      'Yesterday:',
      'Yesterday: a matcha oat latte,',
      'Yesterday: a matcha oat latte, 180 kcal.',
    ]);
    expect(bodyOf(fake.requests[0]).stream).toBe(true);
    const [food] = toolResults(fake.requests[1]);
    expect(food?.id).toBe('s1');
    expect(JSON.stringify(food?.result)).toContain('Matcha oat latte');
    // The round's message goes back as it came, its text included.
    expect(messagesOf(fake.requests[1]).at(-2)).toMatchObject({
      role: 'assistant',
      content: 'Let me check.',
      tool_calls: [{ id: 's1', function: { name: 'food_log' } }],
    });
  });

  it('sets a reminder from a streamed round in the Android app (P17)', async () => {
    const stores = await openCoachStores();
    opened.push(stores.db);
    await stores.settingsRepo.set('coach.setsReminders', true);
    const actions = storedActions(stores);
    const args = '{"text":"Drink a glass of water","time":"10:00","days":"daily"}';
    const fake = fakeFetch().on(
      MISTRAL,
      streamReply(
        openAiToolStream([
          { id: 'r1', name: 'set_reminder', argPieces: [args.slice(0, 20), args.slice(20)] },
        ]),
      ),
      streamReply(openAiTextStream(['Done: every day at 10:00.'])),
    );

    const { result } = await streamed(fake, {
      reminders: { problemWith: actions.reminders.problemWith },
      actions,
      chatId: 'chat-1',
    });

    expect(result.ok && result.value.reminders).toEqual([
      { text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, reminderId: 'set-1' },
    ]);
    expect(toolResults(fake.requests[1])[0]?.result).toMatchObject({ set: true });
    expect(await stores.settingsRepo.get('remind.custom')).toHaveLength(1);
  });

  it('starts the standby afresh after a reply fails midway, its words gone first (ACC-I13-2)', async () => {
    const fake = fakeFetch()
      .on(
        MISTRAL,
        streamReply(openAiTextStream(['You had ', 'a latte and']).slice(0, 4), {
          breakAtEnd: true,
        }),
      )
      .on(ANTHROPIC, streamReply(anthropicTextStream(['You had a latte ', 'and lasagne.'])));

    const { result, shown } = await streamed(fake, {}, WITH_STANDBY);

    expect(result).toEqual(answered('You had a latte and lasagne.'));
    expect(shown).toEqual([
      'You had',
      'You had a latte and',
      '',
      'You had a latte',
      'You had a latte and lasagne.',
    ]);
    expect(fake.requests.map((request) => request.url)).toEqual([MISTRAL, ANTHROPIC]);
  });

  it('fails without a standby when the stream breaks off, giving no answer', async () => {
    const fake = fakeFetch().on(
      MISTRAL,
      streamReply(openAiTextStream(['You had ', 'a latte']).slice(0, 3)),
    );
    const { result, shown } = await streamed(fake);
    expect(result).toEqual({ ok: false, error: { kind: 'connection' } });
    expect(shown).toEqual(['You had', 'You had a latte']);
  });
});
