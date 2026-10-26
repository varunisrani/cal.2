// @vitest-environment node
import { request, type IncomingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_PATH,
  DEFAULT_PORT,
  PORT_ENV,
  portFromEnv,
  readNamedScript,
  scriptNames,
  startFakeAiServer,
  type FakeAiServer,
  type RecordedRequest,
} from './server';

interface Answer {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

/** The parts of a chat completion these tests read. */
interface Completion {
  choices: {
    finish_reason: string;
    message: {
      content: string | null;
      tool_calls?: { type: string; function: { name: string; arguments: string } }[];
    };
  }[];
}

let server: FakeAiServer;

beforeEach(async () => {
  server = await startFakeAiServer({ port: 0 });
});

afterEach(async () => {
  await server.close();
});

/**
 * One request on its own connection through node:http, whose timers are Node's own: fake timers
 * in a test never stall the client. A string body is sent as-is, anything else as JSON.
 */
function call(
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Answer> {
  const { body, headers = {} } = options;
  const payload = body === undefined || typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((done, fail) => {
    const req = request(
      `${server.url}${path}`,
      {
        method,
        agent: false,
        headers:
          payload === undefined ? headers : { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', fail);
        res.on('end', () =>
          done({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', fail);
    req.end(payload);
  });
}

const json = (answer: Answer): unknown => JSON.parse(answer.text);
const errorMessage = (answer: Answer): string =>
  (json(answer) as { error: { message: string } }).error.message;

const chatBody = (text: string) => ({
  model: 'fake-model',
  messages: [{ role: 'user', content: text }],
});
const ask = (text: string, headers?: Record<string, string>) =>
  call('POST', CHAT_PATH, { body: chatBody(text), headers });
const load = (script: unknown) => call('POST', '/__script', { body: script });
const recorded = async () => json(await call('GET', '/__requests')) as RecordedRequest[];

const completionOf = (body: unknown) => body as Completion;
const firstChoice = (body: unknown) => completionOf(body).choices[0]!;

describe('startFakeAiServer', () => {
  it('listens on loopback and reports its origin', () => {
    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
  });

  it('names the port and the variable when the port is taken', async () => {
    await expect(startFakeAiServer({ port: server.port })).rejects.toThrow(
      new RegExp(`port ${server.port} .*in use.*${PORT_ENV}`),
    );
  });
});

describe('CORS', () => {
  it('answers a preflight with 204 and the CORS headers', async () => {
    const answer = await call('OPTIONS', CHAT_PATH, {
      headers: {
        origin: 'http://127.0.0.1:4173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(answer.status).toBe(204);
    expect(answer.headers['access-control-allow-origin']).toBe('*');
    expect(answer.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(answer.headers['access-control-allow-headers']).toBe('authorization, content-type');
    expect(answer.text).toBe('');
    expect(await recorded()).toEqual([]);
  });

  it('lets any origin read every reply: chat, control routes and unknown routes', async () => {
    const answers = [
      await load({ replies: [{ status: 200, body: {} }] }),
      await ask('hello'),
      await ask('one too many'),
      await call('GET', '/__requests'),
      await call('POST', '/__reset'),
      await call('GET', '/v1/models'),
    ];
    expect(answers.map((a) => a.status)).toEqual([200, 200, 500, 200, 200, 404]);
    for (const answer of answers) expect(answer.headers['access-control-allow-origin']).toBe('*');
    expect(errorMessage(answers[5]!)).toBe('fake AI server: no route for GET /v1/models');
  });
});

describe('scripted replies', () => {
  it('answers a 429-then-200 script in order', async () => {
    const loaded = await load({ name: 'busy-then-ok' });
    expect(json(loaded)).toEqual({ ok: true, script: 'busy-then-ok', replies: 2 });

    const busy = await ask('first try');
    expect(busy.status).toBe(429);
    expect(busy.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(errorMessage(busy)).toMatch(/busy/);

    const ok = await ask('second try');
    expect(ok.status).toBe(200);
    expect(firstChoice(json(ok)).finish_reason).toBe('stop');
  });

  it('answers 500 with a clear message when no script is loaded', async () => {
    const answer = await ask('anyone there?');
    expect(answer.status).toBe(500);
    expect(errorMessage(answer)).toBe(
      'fake AI server: no script is loaded. Load a script with POST /__script.',
    );
  });

  it('answers 500 with a clear message for an empty script', async () => {
    await load({ replies: [] });
    const answer = await ask('anyone there?');
    expect(answer.status).toBe(500);
    expect(errorMessage(answer)).toBe(
      'fake AI server: the inline script has no replies. Load a script with POST /__script.',
    );
  });

  it('answers 500 naming the script and the request once the script is used up', async () => {
    await load({ name: 'busy-then-ok' });
    await ask('one');
    await ask('two');
    const answer = await ask('three');
    expect(answer.status).toBe(500);
    expect(errorMessage(answer)).toBe(
      'fake AI server: script "busy-then-ok" has 2 replies, all used; this is request 3. ' +
        'Load a script with POST /__script.',
    );
    expect(await recorded()).toHaveLength(3);
  });

  it('sends a string body as-is, so a reply can be text that is not JSON', async () => {
    await load({ name: 'garbage' });
    const answer = await ask('describe my lunch');
    expect(answer.status).toBe(200);
    expect(answer.text).toBe(readNamedScript('garbage').replies[0]!.body);
    expect(() => json(answer)).toThrow(SyntaxError);
  });

  it('holds a reply for its delayMs, on fake timers (no real wait)', async () => {
    await load({ replies: [{ status: 200, body: { late: true }, delayMs: 5_000 }] });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let answered = false;
    const reply = ask('take your time').then((answer) => {
      answered = true;
      return answer;
    });
    // The server records a request just before its delay starts; each check is a round trip.
    for (let tries = 1; (await recorded()).length === 0; tries++) {
      if (tries === 100) throw new Error('the request never reached the server');
    }
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(4_999);
    await recorded(); // one more round trip, room for an early reply to arrive
    expect(answered).toBe(false);

    vi.advanceTimersByTime(1);
    const answer = await reply;
    expect(answer.status).toBe(200);
    expect(json(answer)).toEqual({ late: true });
  });
});

describe('recorded requests', () => {
  it('lists both bodies in order, without the authorization header or the key', async () => {
    const key = 'sk-fake-key-not-for-reports';
    await load({ name: 'busy-then-ok' });
    await ask('first try', { authorization: `Bearer ${key}` });
    await ask('second try', { authorization: `Bearer ${key}` });

    const list = await call('GET', '/__requests');
    expect(list.text).not.toContain(key);
    const requests = json(list) as RecordedRequest[];
    expect(requests.map((r) => r.body)).toEqual([chatBody('first try'), chatBody('second try')]);
    for (const r of requests) {
      expect(r.method).toBe('POST');
      expect(r.path).toBe(CHAT_PATH);
      expect(r.headers['content-type']).toBe('application/json');
      expect(r.headers).not.toHaveProperty('authorization');
    }
  });

  it('keeps a body that is not JSON as its text', async () => {
    await call('POST', CHAT_PATH, { body: 'plain words' });
    expect((await recorded()).map((r) => r.body)).toEqual(['plain words']);
  });

  it('clears the script and the recorded requests on /__reset', async () => {
    await load({ name: 'food-ok' });
    await ask('soup?');
    const reset = await call('POST', '/__reset');
    expect(json(reset)).toEqual({ ok: true });
    expect(await recorded()).toEqual([]);
    expect(errorMessage(await ask('soup again?'))).toMatch(/no script is loaded/);
  });
});

describe('loading scripts', () => {
  it('rewinds the script on every load and keeps the recorded requests', async () => {
    const script = { replies: [{ status: 201, body: { n: 1 } }] };
    expect(json(await load(script))).toEqual({ ok: true, script: 'inline', replies: 1 });
    expect(json(await ask('a'))).toEqual({ n: 1 });
    await load(script);
    const again = await ask('b');
    expect(again.status).toBe(201);
    expect(json(again)).toEqual({ n: 1 });
    expect(await recorded()).toHaveLength(2);
  });

  it.each([
    ['an unknown name', { name: 'nope' }, /no script named "nope" \(scripts: .*food-ok/],
    ['a path for a name', { name: '../package' }, /no script named "\.\.\/package"/],
    ['a name with replies', { name: 'food-ok', replies: [] }, /"name".*alone/],
    ['no replies array', { steps: [] }, /a script is an object with a "replies" array/],
    ['an unknown script key', { replies: [], note: 'x' }, /unknown script key "note"/],
    ['a reply without a body', { replies: [{ status: 200 }] }, /reply 1: body is missing/],
    ['a status out of range', { replies: [{ status: 99, body: {} }] }, /reply 1: status/],
    [
      'a misspelt key',
      {
        replies: [
          { status: 200, body: {} },
          { status: 200, body: {}, delay: 5 },
        ],
      },
      /reply 2: unknown key "delay"/,
    ],
    [
      'a negative delay',
      { replies: [{ status: 200, body: {}, delayMs: -1 }] },
      /reply 1: delayMs must be/,
    ],
    ['a body that is not JSON', 'not json', /the request body must be JSON/],
  ])('refuses %s with 400 and keeps the loaded script', async (_case, script, message) => {
    await load({ replies: [{ status: 202, body: { kept: true } }] });
    const refused = await load(script);
    expect(refused.status).toBe(400);
    expect(errorMessage(refused)).toMatch(message);
    const answer = await ask('still there?');
    expect(answer.status).toBe(202);
    expect(json(answer)).toEqual({ kept: true });
  });
});

describe('starter scripts', () => {
  it('ships the five starters', () => {
    expect(scriptNames()).toEqual(
      expect.arrayContaining(['busy-then-ok', 'coach-tool', 'cut-then-ok', 'food-ok', 'garbage']),
    );
  });

  it.each(scriptNames())('%s loads and has a description', (name) => {
    expect(readNamedScript(name).description).toEqual(expect.any(String));
  });

  const foodOk = readNamedScript('food-ok');
  const foodText = firstChoice(foodOk.replies[0]!.body).message.content!;

  it('food-ok answers one food analysis in our reply keys, its parts adding up', () => {
    expect(foodOk.replies.map((r) => r.status)).toEqual([200]);
    expect(firstChoice(foodOk.replies[0]!.body).finish_reason).toBe('stop');
    const food = JSON.parse(foodText) as {
      kcal: number;
      servingGrams: number;
      units: { count: number; gramsEach: number }[];
      parts: { grams: number; kcal: number }[];
    };
    expect(Object.keys(food).sort()).toEqual(
      [
        'carbs',
        'emoji',
        'fat',
        'kcal',
        'name',
        'nutrients',
        'parts',
        'progressive',
        'protein',
        'servingGrams',
        'units',
      ].sort(),
    );
    expect(food.parts.reduce((sum, p) => sum + p.kcal, 0)).toBe(food.kcal);
    expect(food.parts.reduce((sum, p) => sum + p.grams, 0)).toBe(food.servingGrams);
    for (const unit of food.units) {
      expect(unit.count * unit.gramsEach).toBeCloseTo(food.servingGrams, 6);
    }
  });

  it('busy-then-ok is a 429, then the food-ok answer', () => {
    const { replies } = readNamedScript('busy-then-ok');
    expect(replies.map((r) => r.status)).toEqual([429, 200]);
    expect(firstChoice(replies[1]!.body).message.content).toBe(foodText);
  });

  it('cut-then-ok is a reply cut off at the token cap, then the food-ok answer', () => {
    const { replies } = readNamedScript('cut-then-ok');
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    const cut = firstChoice(replies[0]!.body);
    expect(cut.finish_reason).toBe('length');
    expect(foodText.startsWith(cut.message.content!)).toBe(true);
    expect(() => JSON.parse(cut.message.content!)).toThrow(SyntaxError);
    expect(firstChoice(replies[1]!.body).message.content).toBe(foodText);
  });

  it('coach-tool calls food_log, then answers in text', () => {
    const { replies } = readNamedScript('coach-tool');
    expect(replies.map((r) => r.status)).toEqual([200, 200]);
    const round = firstChoice(replies[0]!.body);
    expect(round.finish_reason).toBe('tool_calls');
    expect(round.message.tool_calls).toHaveLength(1);
    const tool = round.message.tool_calls![0]!;
    expect(tool.type).toBe('function');
    expect(tool.function.name).toBe('food_log');
    expect(JSON.parse(tool.function.arguments)).toEqual({
      from: expect.any(String),
      to: expect.any(String),
    });
    const text = firstChoice(replies[1]!.body);
    expect(text.finish_reason).toBe('stop');
    expect(text.message.content).toEqual(expect.stringMatching(/\w/));
  });

  it('garbage is a 200 whose body no JSON parser accepts', () => {
    const { replies } = readNamedScript('garbage');
    expect(replies.map((r) => r.status)).toEqual([200]);
    expect(typeof replies[0]!.body).toBe('string');
    expect(() => JSON.parse(replies[0]!.body as string)).toThrow(SyntaxError);
  });
});

describe('portFromEnv', () => {
  it('defaults to 4320 when the variable is unset or blank', () => {
    expect(DEFAULT_PORT).toBe(4320);
    expect(portFromEnv({})).toBe(4320);
    expect(portFromEnv({ [PORT_ENV]: '  ' })).toBe(4320);
  });

  it('reads a port number, 0 included', () => {
    expect(portFromEnv({ [PORT_ENV]: '5001' })).toBe(5001);
    expect(portFromEnv({ [PORT_ENV]: '0' })).toBe(0);
  });

  it.each(['abc', '-1', '43.5', '70000'])('refuses %j, naming the variable', (value) => {
    expect(() => portFromEnv({ [PORT_ENV]: value })).toThrow(
      `${PORT_ENV} must be a port number from 0 to 65535, not "${value}"`,
    );
  });
});
