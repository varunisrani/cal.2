import { describe, expect, it } from 'vitest';
import { advanceAsync, useFakeTime } from '../../test/time';
import { fakeFetch } from './fakeFetch';

const CHAT = 'https://chat.example.test/v1/chat/completions';
const MODELS = 'https://models.example.test/v1beta/models/';

/** Tracks whether a promise has settled, without waiting for it. */
function watch<T>(promise: Promise<T>): { settled: () => boolean } {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  return { settled: () => done };
}

describe('fakeFetch: scripted replies', () => {
  it('answers queued replies in order, per route', async () => {
    const fake = fakeFetch()
      .on(CHAT, { status: 429, json: { error: { message: 'busy' } } }, { json: { n: 2 } })
      .on(/models\.example\.test/, { text: 'model route' });

    const first = await fake.fetch(CHAT, { method: 'POST' });
    const other = await fake.fetch(`${MODELS}m1:generateContent`, { method: 'POST' });
    const second = await fake.fetch(CHAT, { method: 'POST' });

    expect(first.status).toBe(429);
    expect(await first.json()).toEqual({ error: { message: 'busy' } });
    expect(await other.text()).toBe('model route');
    expect(second.status).toBe(200);
    expect(second.ok).toBe(true);
    expect(await second.json()).toEqual({ n: 2 });
    expect(fake.pending()).toBe(0);
  });

  it('appends to a route when the same pattern is scripted again', async () => {
    const fake = fakeFetch().on(CHAT, { text: 'one' }).on(CHAT, { text: 'two' });
    expect(fake.pending()).toBe(2);
    expect(await (await fake.fetch(CHAT)).text()).toBe('one');
    expect(await (await fake.fetch(CHAT)).text()).toBe('two');
  });

  it('sends the status, the headers and a JSON or a text body', async () => {
    const fake = fakeFetch().on(
      CHAT,
      { status: 201, headers: { 'X-Request-Id': 'r-1' }, json: [1, 'two'] },
      { status: 503, text: 'plain words' },
      { headers: { 'content-type': 'application/problem+json' }, json: { a: 1 } },
      { status: 204, json: { ignored: true } },
      {},
    );

    const json = await fake.fetch(CHAT);
    expect(json.status).toBe(201);
    expect(json.headers.get('x-request-id')).toBe('r-1');
    expect(json.headers.get('content-type')).toBe('application/json');
    expect(await json.json()).toEqual([1, 'two']);

    const text = await fake.fetch(CHAT);
    expect(text.status).toBe(503);
    expect(text.ok).toBe(false);
    expect(text.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await text.text()).toBe('plain words');

    const typed = await fake.fetch(CHAT);
    expect(typed.headers.get('content-type')).toBe('application/problem+json');

    const empty = await fake.fetch(CHAT);
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe('');

    const bare = await fake.fetch(CHAT);
    expect(bare.status).toBe(200);
    expect(await bare.text()).toBe('');
  });

  it('matches a string pattern as a prefix and gives a request to the first matching route', async () => {
    const fake = fakeFetch()
      .on(MODELS, { text: 'by prefix' })
      .on(/:generateContent$/, { text: 'by pattern' });
    expect(await (await fake.fetch(`${MODELS}a:generateContent`)).text()).toBe('by prefix');
    expect(fake.pending()).toBe(1);
  });

  it('rejects with a TypeError for a network step, after its delay', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { fail: 'network' }, { fail: 'network', delayMs: 2000 });
    await expect(fake.fetch(CHAT)).rejects.toBeInstanceOf(TypeError);

    const slow = fake.fetch(CHAT);
    const state = watch(slow);
    await advanceAsync(1999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);
    await expect(slow).rejects.toBeInstanceOf(TypeError);
  });

  it('refuses a malformed script when it is set up', () => {
    const fake = fakeFetch();
    expect(() => fake.on(CHAT, { status: 99 })).toThrow(RangeError);
    expect(() => fake.on(CHAT, { status: 600 })).toThrow(RangeError);
    expect(() => fake.on(CHAT, { delayMs: -1 })).toThrow(RangeError);
    expect(() => fake.on(CHAT, { bodyDelayMs: Number.NaN })).toThrow(RangeError);
    expect(() => fake.on(CHAT, { json: {}, text: 'x' })).toThrow(TypeError);
    expect(() => fake.on(CHAT, { json: undefined })).toThrow(TypeError);
    expect(fake.pending()).toBe(0);
  });
});

describe('fakeFetch: delays on fake timers', () => {
  it('resolves a reply with a 5 s delay only after advance(5000)', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { delayMs: 5000, json: { ok: true } });

    const reply = fake.fetch(CHAT);
    const state = watch(reply);
    await advanceAsync(4999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);
    expect(state.settled()).toBe(true);
    expect(await (await reply).json()).toEqual({ ok: true });
  });

  it('delivers a slow body only after its body delay', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { bodyDelayMs: 3000, text: 'late body' });

    const response = await fake.fetch(CHAT);
    expect(response.status).toBe(200);
    const body = response.text();
    const state = watch(body);
    await advanceAsync(2999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);
    expect(await body).toBe('late body');
  });
});

describe('fakeFetch: a body in pieces', () => {
  it('hands each piece over after its wait, as a stream of server-sent events', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, {
      chunks: [{ text: 'data: one\n\n' }, { text: 'data: two\n\n', delayMs: 1000 }],
    });

    const response = await fake.fetch(CHAT);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader();
    const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);
    expect(decode((await reader.read()).value)).toBe('data: one\n\n');
    const next = reader.read();
    const state = watch(next);
    await advanceAsync(999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);
    expect(decode((await next).value)).toBe('data: two\n\n');
    expect((await reader.read()).done).toBe(true);
  });

  it('breaks the connection at a fail piece, after the pieces before it were read', async () => {
    const fake = fakeFetch().on(CHAT, { chunks: [{ text: 'data: one\n\n' }, { fail: 'network' }] });
    const reader = (await fake.fetch(CHAT)).body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await expect(reader.read()).rejects.toThrow(TypeError);
  });

  it('fails the read when the abort comes between pieces', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const controller = new AbortController();
    const fake = fakeFetch().on(CHAT, {
      chunks: [{ text: 'data: one\n\n' }, { text: 'data: two\n\n', delayMs: 5000 }],
    });
    const reader = (await fake.fetch(CHAT, { signal: controller.signal })).body!.getReader();
    await reader.read();
    const next = reader.read();
    controller.abort();
    await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses chunks together with json, text or a body delay', () => {
    expect(() => fakeFetch().on(CHAT, { chunks: [], text: 'x' })).toThrow(TypeError);
    expect(() => fakeFetch().on(CHAT, { chunks: [{ text: 'x', delayMs: -1 }] })).toThrow(
      RangeError,
    );
  });
});

describe('fakeFetch: AbortSignal', () => {
  it('rejects with an AbortError when the signal is already aborted, using no reply', async () => {
    const fake = fakeFetch().on(CHAT, { json: {} });
    const controller = new AbortController();
    controller.abort();

    await expect(fake.fetch(CHAT, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fake.pending()).toBe(1);
    expect(fake.requests).toHaveLength(1);
  });

  it('rejects at the moment of the abort while the reply is delayed', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { delayMs: 10_000, json: {} });
    const controller = new AbortController();

    const reply = fake.fetch(CHAT, { signal: controller.signal });
    const state = watch(reply);
    await advanceAsync(1000);
    expect(state.settled()).toBe(false);
    controller.abort();
    await expect(reply).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.pending()).toBe(0);
  });

  it('fails the body read when the abort comes while the body is arriving', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { bodyDelayMs: 4000, json: { late: true } });
    const controller = new AbortController();

    const response = await fake.fetch(CHAT, { signal: controller.signal });
    const body = response.text();
    await advanceAsync(1000);
    controller.abort();
    await expect(body).rejects.toMatchObject({ name: 'AbortError' });
  });

  it("rejects with the signal's own reason, such as a deadline's TimeoutError", async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { delayMs: 500, json: {} });
    const controller = new AbortController();

    const reply = fake.fetch(CHAT, { signal: controller.signal });
    controller.abort(new DOMException('deadline passed', 'TimeoutError'));
    await expect(reply).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('ignores an abort after the whole reply has arrived', async () => {
    const fake = fakeFetch().on(CHAT, { text: 'done' });
    const controller = new AbortController();
    const response = await fake.fetch(CHAT, { signal: controller.signal });
    controller.abort();
    expect(await response.text()).toBe('done');
  });
});

describe('fakeFetch: recorded requests', () => {
  it('records the URL, method, headers in lower case and the parsed JSON body', async () => {
    const fake = fakeFetch().on(CHAT, {});
    const controller = new AbortController();
    await fake.fetch(CHAT, {
      method: 'post',
      headers: { 'X-Goog-Api-Key': 'key-123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
      signal: controller.signal,
    });

    expect(fake.requests).toEqual([
      {
        url: CHAT,
        method: 'POST',
        headers: { 'x-goog-api-key': 'key-123', 'content-type': 'application/json' },
        body: { contents: [{ parts: [{ text: 'hi' }] }] },
        signal: controller.signal,
      },
    ]);
  });

  it('records a body that is not JSON as sent, and no body as undefined', async () => {
    const fake = fakeFetch().on(CHAT, {}, {});
    await fake.fetch(CHAT, { method: 'POST', body: 'not json {' });
    await fake.fetch(new URL(CHAT), { headers: [['Authorization', 'Bearer k']] });

    expect(fake.requests[0]?.body).toBe('not json {');
    expect(fake.requests[1]).toMatchObject({
      url: CHAT,
      method: 'GET',
      headers: { authorization: 'Bearer k' },
      body: undefined,
    });
  });

  it('reads a Request object: its URL, method, headers and body', async () => {
    const fake = fakeFetch().on(CHAT, {});
    const request = new Request(CHAT, {
      method: 'POST',
      headers: { 'X-Api-Key': 'k' },
      body: JSON.stringify({ model: 'm' }),
    });
    await fake.fetch(request);
    expect(fake.requests[0]).toMatchObject({
      url: CHAT,
      method: 'POST',
      headers: { 'x-api-key': 'k' },
      body: { model: 'm' },
    });
  });

  it('records the request before its reply arrives', async () => {
    useFakeTime('2026-10-26T12:00:00Z');
    const fake = fakeFetch().on(CHAT, { delayMs: 1000 });
    const reply = fake.fetch(CHAT, { method: 'POST', body: '{"a":1}' });
    expect(fake.requests.map((request) => request.body)).toEqual([{ a: 1 }]);
    await advanceAsync(1000);
    await reply;
  });

  it('never touches the global fetch', async () => {
    const before = globalThis.fetch;
    const fake = fakeFetch().on(CHAT, {});
    await fake.fetch(CHAT);
    expect(globalThis.fetch).toBe(before);
    expect(fake.fetch).not.toBe(before);
  });
});

describe('fakeFetch: requests the script does not cover', () => {
  it('rejects an unmatched URL, naming it and the scripted patterns', async () => {
    const fake = fakeFetch().on(CHAT, {});
    await expect(fake.fetch('https://elsewhere.test/x', { method: 'POST' })).rejects.toThrow(
      `fakeFetch: no route matches POST https://elsewhere.test/x. Scripted patterns: ${CHAT}.`,
    );
    expect(fake.takeUnscripted()).toEqual([
      `fakeFetch: no route matches POST https://elsewhere.test/x. Scripted patterns: ${CHAT}.`,
    ]);
  });

  it('rejects a request beyond the script instead of falling through to another route', async () => {
    const fake = fakeFetch()
      .on(MODELS, {})
      .on(/example\.test/, {});
    await fake.fetch(`${MODELS}a`);
    await expect(fake.fetch(`${MODELS}a`)).rejects.toThrow(/no reply left for GET/);
    expect(fake.pending()).toBe(1);
    expect(fake.takeUnscripted()).toHaveLength(1);
    expect(fake.takeUnscripted()).toEqual([]);
  });

  // Expected to fail: the fake fails the test itself, although the code swallowed the rejection.
  it.fails('fails the test when the code under test swallows an unmatched request', async () => {
    const fake = fakeFetch().on(CHAT, {});
    await fake.fetch('https://elsewhere.test/x').catch(() => undefined);
  });

  it.fails(
    'fails the test when the code under test swallows a request beyond the script',
    async () => {
      const fake = fakeFetch().on(CHAT, {});
      await fake.fetch(CHAT);
      await fake.fetch(CHAT).catch(() => undefined);
    },
  );
});
