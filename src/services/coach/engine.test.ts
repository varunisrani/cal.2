import { describe, expect, it } from 'vitest';
import type { ImageBackend } from '../../ai/image';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ProviderKeys } from '../../ai/settings';
import { fakeFetch, type FakeFetch, type RecordedRequest } from '../../ai/testing/fakeFetch';
import { openAiToolCalls } from '../../ai/testing/toolWire';
import { anthropicAnswer, anthropicError, openAiAnswer, openAiError } from '../../ai/testing/wire';
import { addDays } from '../../domain/dates/dayKey';
import type { CoachMessage } from '../../domain/model';
import { makeCoachMessage } from '../../test/factories';
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
import { MAX_ROUNDS, runTurn, type TurnInput } from './engine';
import { TOOL_RESULT_MAX_CHARS } from './limiter';
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

    expect(await ask(fake)).toEqual({
      ok: true,
      value: 'Yesterday you had a matcha oat latte, 180 kcal.',
    });
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

    expect(await ask(fake)).toEqual({ ok: true, value: 'Steady at 70 kg.' });
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

    expect(await ask(fake)).toEqual({ ok: true, value: 'Steady at 70 kg.' });
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

    expect(result).toEqual({ ok: true, value: 'You had a latte and lasagne.' });
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

    expect(await ask(fake, {}, WITH_STANDBY)).toEqual({
      ok: true,
      value: 'Your weight is steady.',
    });
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

    expect(result).toEqual({ ok: true, value: 'A bowl of ramen, about 600 kcal.' });
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

    expect(await ask(fake, {}, settings)).toEqual({ ok: true, value: 'About 1 900 kcal a day.' });
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

    expect(result).toEqual({
      ok: true,
      value:
        'Your best day this week was Saturday: 14250 steps and a 95-minute walk that burned 402 kcal.',
    });
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

    expect(await ask(fake)).toEqual({ ok: true, value: 'I cannot see activity data here.' });
    const [stray] = toolResults(fake.requests[1]);
    expect(String(stray?.result.error)).toContain('needs Health Connect');
  });
});
