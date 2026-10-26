// @vitest-environment node
import { readdirSync } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import globalSetup from './global-setup';
import {
  CHAT_PATH,
  DEFAULT_FAKE_AI_PORT,
  FAKE_AI_PORT_ENV,
  FAKE_AI_URL_ENV,
  fakeAiPortFromEnv,
  SCRIPTS_DIR,
  startFakeAi,
  type FakeAi,
  type RecordedRequest,
} from './server';

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

interface Completion {
  choices: {
    message: {
      content: string | null;
      tool_calls?: { type: string; function: { name: string; arguments: string } }[];
    };
    finish_reason: string;
  }[];
}

interface FoodPart {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Food extends FoodPart {
  name: string;
  servingGrams: number;
  parts: FoodPart[];
}

/**
 * One HTTP exchange through node:http (no keep-alive), not fetch: only the server's own
 * `setTimeout` then sees fake timers.
 */
function send(
  base: string,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<Reply> {
  const { body, headers = {}, signal } = options;
  const payload = body === undefined || typeof body === 'string' ? body : JSON.stringify(body);
  const contentType: Record<string, string> =
    payload === undefined ? {} : { 'content-type': 'application/json' };
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(path, base),
      { method, agent: false, headers: { ...contentType, ...headers }, signal },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const json = <T>(reply: Reply): T => JSON.parse(reply.text) as T;
const errorMessage = (reply: Reply): string =>
  json<{ error: { message: string } }>(reply).error.message;

const chatBody = (text: string) => ({
  model: 'fake-model',
  messages: [{ role: 'user', content: text }],
});

const completion = (text: string) => ({
  object: 'chat.completion',
  choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
});

/** Lets loopback I/O run (no clock moves) until `count` fake timers are pending. */
async function untilTimers(count: number): Promise<void> {
  for (let turn = 0; turn < 10_000 && vi.getTimerCount() < count; turn++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  expect(vi.getTimerCount()).toBe(count);
}

let fake: FakeAi;
const chat = (body: unknown, headers?: Record<string, string>) =>
  send(fake.url, 'POST', CHAT_PATH, { body, headers });
const load = (script: unknown) => send(fake.url, 'POST', '/__script', { body: script });
const recorded = async () =>
  json<{ requests: RecordedRequest[] }>(await send(fake.url, 'GET', '/__requests')).requests;

beforeEach(async () => {
  fake = await startFakeAi({ port: 0 });
});

afterEach(async () => {
  await fake.close();
});

describe('fake AI server: CORS', () => {
  it('answers a preflight with 204 and the CORS headers', async () => {
    const reply = await send(fake.url, 'OPTIONS', CHAT_PATH, {
      headers: {
        origin: 'http://127.0.0.1:4173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(reply.status).toBe(204);
    expect(reply.text).toBe('');
    expect(reply.headers['access-control-allow-origin']).toBe('*');
    expect(reply.headers['access-control-allow-headers']).toBe('authorization, content-type');
    expect(reply.headers['access-control-allow-methods']).toBe('POST, GET, OPTIONS');
  });

  it('puts Access-Control-Allow-Origin on every reply', async () => {
    const replies = [
      await load({ replies: [{ status: 429, body: { error: { message: 'busy' } } }] }),
      await chat(chatBody('one')),
      await chat(chatBody('two')),
      await load({ replies: 'nope' }),
      await send(fake.url, 'GET', '/__requests'),
      await send(fake.url, 'GET', '/nowhere'),
      await send(fake.url, 'POST', '/__reset'),
    ];
    expect(replies.map((reply) => reply.status)).toEqual([200, 429, 500, 400, 200, 404, 204]);
    for (const reply of replies) expect(reply.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('fake AI server: scripted replies', () => {
  it('answers a 429-then-200 script in order, then says the script is used up', async () => {
    const busy = { error: { message: 'Busy, try again.', type: 'rate_limit_exceeded' } };
    const loaded = await load({
      replies: [
        { status: 429, body: busy },
        { status: 200, body: completion('second') },
      ],
    });
    expect(json(loaded)).toEqual({ loaded: 'inline', replies: 2 });

    const first = await chat(chatBody('one'));
    expect(first.status).toBe(429);
    expect(first.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(json(first)).toEqual(busy);
    const second = await chat(chatBody('two'));
    expect(second.status).toBe(200);
    expect(json(second)).toEqual(completion('second'));

    const third = await chat(chatBody('three'));
    expect(third.status).toBe(500);
    expect(errorMessage(third)).toBe(
      'fake AI: script "inline" is used up (all 2 replies were sent); load another one',
    );
  });

  it('lists both requests with their bodies and without the key', async () => {
    await load({
      replies: [
        { status: 429, body: { error: { message: 'busy' } } },
        { status: 200, body: completion('ok') },
      ],
    });
    const key = { authorization: 'Bearer sk-fake-secret-123' };
    await chat(chatBody('first try'), key);
    await chat(chatBody('second try'), key);

    const reply = await send(fake.url, 'GET', '/__requests');
    expect(reply.text).not.toContain('sk-fake-secret');
    const requests = json<{ requests: RecordedRequest[] }>(reply).requests;
    expect(requests.map((r) => r.body)).toEqual([chatBody('first try'), chatBody('second try')]);
    for (const r of requests) {
      expect(r.headers).not.toHaveProperty('authorization');
      expect(r.hasAuthorization).toBe(true);
      expect(r.headers['content-type']).toBe('application/json');
    }
  });

  it('records a request without a key, and a body that is not JSON as its text', async () => {
    await chat('not json at all');
    const [only] = await recorded();
    expect(only).toMatchObject({ hasAuthorization: false, body: 'not json at all' });
  });

  it('answers 500 with a clear message when no script is loaded', async () => {
    const reply = await chat(chatBody('hello'));
    expect(reply.status).toBe(500);
    expect(errorMessage(reply)).toBe('fake AI: no script is loaded; load one with POST /__script');
  });

  it('answers 500 with a clear message for an empty script', async () => {
    expect(json(await load({ replies: [] }))).toEqual({ loaded: 'inline', replies: 0 });
    const reply = await chat(chatBody('hello'));
    expect(reply.status).toBe(500);
    expect(errorMessage(reply)).toBe('fake AI: script "inline" has no replies');
  });

  it('sends a string body exactly as written', async () => {
    await load({ replies: [{ status: 200, body: '{"choices": [' }] });
    expect((await chat(chatBody('hello'))).text).toBe('{"choices": [');
  });

  it('starts a newly loaded script from its first reply', async () => {
    await load({ replies: [{ status: 200, body: completion('a') }] });
    await chat(chatBody('one'));
    await load({ replies: [{ status: 200, body: completion('b') }] });
    expect(json(await chat(chatBody('two')))).toEqual(completion('b'));
  });

  it('forgets the script and the recorded requests on POST /__reset', async () => {
    await load({ replies: [{ status: 200, body: completion('a') }] });
    await chat(chatBody('one'));
    expect(await recorded()).toHaveLength(1);

    expect((await send(fake.url, 'POST', '/__reset')).status).toBe(204);
    expect(await recorded()).toEqual([]);
    expect((await chat(chatBody('two'))).status).toBe(500);
  });
});

describe('fake AI server: delays', () => {
  it('honours delayMs, measured with fake timers', async () => {
    await load({ replies: [{ status: 200, body: completion('late'), delayMs: 5_000 }] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let answered = false;
    const pending = chat(chatBody('hello')).then((reply) => {
      answered = true;
      return reply;
    });
    await untilTimers(1);
    // Recorded on arrival, before the delay is over.
    expect(await recorded()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(vi.getTimerCount()).toBe(1);
    expect(answered).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const reply = await pending;
    expect(reply.status).toBe(200);
    expect(json(reply)).toEqual(completion('late'));
  });

  it('drops a delayed reply whose caller gave up, and answers the next request', async () => {
    await load({
      replies: [
        { status: 200, body: completion('too late'), delayMs: 1_000 },
        { status: 200, body: completion('next') },
      ],
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const controller = new AbortController();
    const abandoned = send(fake.url, 'POST', CHAT_PATH, {
      body: chatBody('hello'),
      signal: controller.signal,
    });
    await untilTimers(1);
    controller.abort();
    await expect(abandoned).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(json(await chat(chatBody('again')))).toEqual(completion('next'));
  });

  it('close() drops a pending delayed reply instead of waiting for it', async () => {
    await load({ replies: [{ status: 200, body: completion('never'), delayMs: 60_000 }] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = chat(chatBody('hello'));
    await untilTimers(1);

    await fake.close();
    expect(vi.getTimerCount()).toBe(0);
    await expect(pending).rejects.toThrow();
  });
});

describe('fake AI server: loading scripts', () => {
  it.each([
    ['a body that is not JSON', 'nope', 400, 'POST /__script needs a JSON body'],
    ['an empty object', {}, 400, '"replies" must be a list'],
    ['a name and replies', { name: 'food-ok', replies: [] }, 400, 'not both'],
    ['a name that is not text', { name: 7 }, 400, '"name" must be a script name'],
    ['a path instead of a name', { name: '../server' }, 400, 'a script name is a slug'],
    ['an unknown name', { name: 'no-such-script' }, 404, 'no script named "no-such-script"'],
    ['a reply without a body', { replies: [{ status: 200 }] }, 400, 'reply 1: "body" is missing'],
    ['a status out of range', { replies: [{ status: 99, body: {} }] }, 400, '"status" must be'],
    ['a misspelt key', { replies: [{ status: 200, body: {}, delay: 5 }] }, 400, 'key "delay"'],
    ['a negative delay', { replies: [{ status: 200, body: {}, delayMs: -1 }] }, 400, '"delayMs"'],
  ])('refuses %s', async (_case, script, status, message) => {
    const reply = await load(script);
    expect(reply.status).toBe(status);
    expect(errorMessage(reply)).toContain(message);
  });

  it('keeps the current script when a load is refused', async () => {
    await load({ replies: [{ status: 200, body: completion('kept') }] });
    expect((await load({ name: 'no-such-script' })).status).toBe(404);
    expect(json(await chat(chatBody('hello')))).toEqual(completion('kept'));
  });

  it('loads every script file in e2e/fake-ai/scripts/', async () => {
    const names = readdirSync(SCRIPTS_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length));
    expect(names).toEqual(
      expect.arrayContaining(['busy-then-ok', 'coach-tool', 'cut-then-ok', 'food-ok', 'garbage']),
    );
    for (const name of names) {
      const reply = await load({ name });
      expect(reply.status, name).toBe(200);
      expect(json<{ loaded: string }>(reply).loaded).toBe(name);
    }
  });
});

describe('fake AI server: starter scripts', () => {
  /** Loads a named script and sends one request per reply it holds. */
  async function play(name: string): Promise<Reply[]> {
    const { replies } = json<{ replies: number }>(await load({ name }));
    const out: Reply[] = [];
    for (let i = 0; i < replies; i++) out.push(await chat(chatBody(`${name} ${i + 1}`)));
    return out;
  }
  const choice = (reply: Reply) => json<Completion>(reply).choices[0]!;
  const parses = (text: string | null): boolean => {
    try {
      JSON.parse(text ?? '');
      return true;
    } catch {
      return false;
    }
  };

  /** A food answer in our reply contract whose parts add up to the totals. */
  function expectFood(content: string | null): void {
    const food = JSON.parse(content ?? '') as Food;
    expect(food.name).toEqual(expect.any(String));
    const sum = (key: keyof FoodPart) => food.parts.reduce((total, part) => total + part[key], 0);
    expect(sum('grams')).toBe(food.servingGrams);
    for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
      expect(sum(key), key).toBeCloseTo(food[key], 6);
    }
  }

  it('food-ok: one valid food analysis', async () => {
    const [only, ...rest] = await play('food-ok');
    expect(rest).toEqual([]);
    expect(only!.status).toBe(200);
    expect(choice(only!).finish_reason).toBe('stop');
    expectFood(choice(only!).message.content);
  });

  it('busy-then-ok: a 429, then a valid food analysis', async () => {
    const replies = await play('busy-then-ok');
    expect(replies.map((reply) => reply.status)).toEqual([429, 200]);
    expect(errorMessage(replies[0]!)).toEqual(expect.any(String));
    expectFood(choice(replies[1]!).message.content);
  });

  it('cut-then-ok: a reply cut off by the length limit, then the full one', async () => {
    const replies = await play('cut-then-ok');
    expect(replies.map((reply) => [reply.status, choice(reply).finish_reason])).toEqual([
      [200, 'length'],
      [200, 'stop'],
    ]);
    expect(parses(choice(replies[0]!).message.content)).toBe(false);
    expectFood(choice(replies[1]!).message.content);
  });

  it('coach-tool: one food_log tool call, then a text answer', async () => {
    const [call, answer, ...rest] = await play('coach-tool');
    expect(rest).toEqual([]);
    expect(choice(call!).finish_reason).toBe('tool_calls');
    const toolCalls = choice(call!).message.tool_calls ?? [];
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe('function');
    expect(toolCalls[0]!.function.name).toBe('food_log');
    expect(JSON.parse(toolCalls[0]!.function.arguments)).toEqual({ limit: 30 });
    expect(choice(answer!).finish_reason).toBe('stop');
    expect(choice(answer!).message.content).toMatch(/\w+/);
  });

  it('garbage: a body that is not JSON, then text that is not the food object', async () => {
    const [broken, prose, ...rest] = await play('garbage');
    expect(rest).toEqual([]);
    expect(broken!.status).toBe(200);
    expect(parses(broken!.text)).toBe(false);
    expect(prose!.status).toBe(200);
    expect(parses(choice(prose!).message.content)).toBe(false);
  });
});

describe('fake AI server: lifecycle', () => {
  it('listens on 127.0.0.1 only', () => {
    expect(fake.port).toBeGreaterThan(0);
    expect(fake.url).toBe(`http://127.0.0.1:${fake.port}`);
  });

  it('refuses a port that is already taken, naming it', async () => {
    await expect(startFakeAi({ port: fake.port })).rejects.toThrow(
      `fake AI: 127.0.0.1:${fake.port} is already in use`,
    );
  });

  it('reads the port from PLATEWISE_FAKE_AI_PORT, 4320 by default', () => {
    expect(DEFAULT_FAKE_AI_PORT).toBe(4320);
    expect(fakeAiPortFromEnv({})).toBe(4320);
    expect(fakeAiPortFromEnv({ [FAKE_AI_PORT_ENV]: ' ' })).toBe(4320);
    expect(fakeAiPortFromEnv({ [FAKE_AI_PORT_ENV]: '4321' })).toBe(4321);
    expect(fakeAiPortFromEnv({ [FAKE_AI_PORT_ENV]: '0' })).toBe(0);
    for (const junk of ['abc', '-1', '43.5', '70000']) {
      expect(() => fakeAiPortFromEnv({ [FAKE_AI_PORT_ENV]: junk }), junk).toThrow(RangeError);
    }
  });

  it('global setup starts the server on the env port and its teardown stops it', async () => {
    const saved = { port: process.env[FAKE_AI_PORT_ENV], url: process.env[FAKE_AI_URL_ENV] };
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env[FAKE_AI_PORT_ENV] = '0';
    try {
      const teardown = await globalSetup();
      const url = process.env[FAKE_AI_URL_ENV] ?? '';
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect((await send(url, 'GET', '/__requests')).status).toBe(200);

      await teardown();
      await expect(send(url, 'GET', '/__requests')).rejects.toThrow(/ECONNREFUSED/);
    } finally {
      restore(FAKE_AI_PORT_ENV, saved.port);
      restore(FAKE_AI_URL_ENV, saved.url);
    }
  });
});
