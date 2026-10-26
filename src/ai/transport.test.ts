import { describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../test/time';
import { startDeadline, type Deadline } from './deadline';
import { fakeFetch, type FakeStep } from './testing/fakeFetch';
import { openAiAnswer } from './testing/wire';
import { isSuccess, send } from './transport';

const START = '2026-10-26T12:00:00Z';
const CHAT = 'https://chat.example.test/v1/chat/completions';
const REQUEST = { method: 'POST', body: '{"model":"test-model"}' };

/** Tracks whether a promise has settled, without waiting for it. */
function watch<T>(promise: Promise<T>): { settled: () => boolean } {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  return { settled: () => done };
}

/** A fresh deadline and a fake with one route, for a single send. */
function setup(
  steps: readonly FakeStep[],
  timeoutSeconds = 180,
): { fake: ReturnType<typeof fakeFetch>; deadline: Deadline; cancel: AbortController } {
  const cancel = new AbortController();
  const deadline = startDeadline({ timeoutSeconds, cancel: cancel.signal });
  return { fake: fakeFetch().on(CHAT, ...steps), deadline, cancel };
}

/** Makes the device report that it is offline. */
const goOffline = (): void => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
};

describe('send: any 2xx is a success (R03.26)', () => {
  it('counts 200, 201, 204 and 299 as success, and 300 and 404 as not', async () => {
    useFakeTime(START);
    const statuses = [200, 201, 204, 299, 300, 404];
    const { fake, deadline } = setup(statuses.map((status) => ({ status, text: 'x' })));

    const replies = [];
    for (const _ of statuses) {
      const result = await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
      if (!result.ok) throw new Error(`unexpected failure ${result.error.kind}`);
      replies.push([result.value.status, result.value.ok]);
    }
    expect(replies).toEqual([
      [200, true],
      [201, true],
      [204, true],
      [299, true],
      [300, false],
      [404, false],
    ]);
    expect([199, 200, 299, 300].map(isSuccess)).toEqual([false, true, true, false]);
  });

  it('reads the body as text, and an empty body as an empty string', async () => {
    useFakeTime(START);
    const answer = openAiAnswer('{"name":"soup"}');
    const { fake, deadline } = setup([{ json: answer }, { status: 204 }, { status: 503 }]);

    const first = await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    const empty = await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    const bare = await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });

    expect(first).toEqual({
      ok: true,
      value: { status: 200, ok: true, body: JSON.stringify(answer) },
    });
    expect(empty).toEqual({ ok: true, value: { status: 204, ok: true, body: '' } });
    expect(bare).toEqual({ ok: true, value: { status: 503, ok: false, body: '' } });
  });

  it('sends the method, headers and body as given, with its own abort signal', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ json: {} }]);
    await send(
      CHAT,
      { ...REQUEST, headers: { Authorization: 'Bearer test-key' } },
      deadline,
      75_000,
      { fetch: fake.fetch },
    );

    const [request] = fake.requests;
    expect(request).toMatchObject({
      url: CHAT,
      method: 'POST',
      headers: { authorization: 'Bearer test-key' },
      body: { model: 'test-model' },
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(request?.signal).not.toBe(deadline.signal);
  });
});

describe('send: Cancel and the time limits (R03.6)', () => {
  it('reports Cancel during the body read as cancelled, not offline', async () => {
    useFakeTime(START);
    goOffline();
    const { fake, deadline, cancel } = setup([{ bodyDelayMs: 60_000, json: openAiAnswer('x') }]);

    const result = send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    await advanceAsync(5_000);
    expect(fake.requests).toHaveLength(1);
    cancel.abort();

    expect(await result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports Cancel before the headers arrive as cancelled', async () => {
    useFakeTime(START);
    const { fake, deadline, cancel } = setup([{ delayMs: 60_000, json: {} }]);

    const result = send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    const state = watch(result);
    await advanceAsync(1_000);
    cancel.abort();
    await advanceAsync(0);

    expect(state.settled()).toBe(true);
    expect(await result).toEqual({ ok: false, error: { kind: 'cancelled' } });
  });

  it('reports the overall limit during a request as timeout, even while offline', async () => {
    useFakeTime(START);
    goOffline();
    const { fake, deadline } = setup([{ delayMs: 60_000, json: {} }], 30);

    const result = send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    await advanceAsync(30_000);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(deadline.stoppedBy()).toBe('deadline');
  });

  it('stops one attempt at its 75 s cap, not before, as timeout', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ delayMs: 120_000, json: {} }]);

    const result = send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    const state = watch(result);
    await advanceAsync(74_999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    // The cap ends the attempt, not the action: the deadline still runs.
    expect(deadline.stoppedBy()).toBeUndefined();
    expect(deadline.remainingMs()).toBe(105_000);
  });

  it('caps the body read too', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ delayMs: 40_000, bodyDelayMs: 40_000, json: {} }]);

    const result = send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    await advanceAsync(75_000);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it('lets a request with the whole budget as its cap run past 75 s', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ delayMs: 100_000, text: 'slow but fine' }]);

    const result = send(CHAT, REQUEST, deadline, deadline.remainingMs(), { fetch: fake.fetch });
    await advanceAsync(100_000);

    expect(await result).toEqual({
      ok: true,
      value: { status: 200, ok: true, body: 'slow but fine' },
    });
  });

  it('knows who stopped the request even when fetch says only "network error"', async () => {
    useFakeTime(START);
    goOffline();
    // Some browsers reject an aborted request with a bare TypeError, like a network failure.
    const opaque = (_: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new TypeError('Failed to fetch')));
      });
    const cancelled = setup([]);
    const capped = setup([]);
    const limited = setup([], 30);

    const byCancel = send(CHAT, REQUEST, cancelled.deadline, 75_000, { fetch: opaque });
    const byCap = send(CHAT, REQUEST, capped.deadline, 20_000, { fetch: opaque });
    const byLimit = send(CHAT, REQUEST, limited.deadline, 75_000, { fetch: opaque });
    cancelled.cancel.abort();
    await advanceAsync(30_000);

    expect(await byCancel).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(await byCap).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(await byLimit).toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it('sends nothing once the action has stopped', async () => {
    useFakeTime(START);
    const cancelled = setup([{ json: {} }]);
    cancelled.cancel.abort();
    const late = setup([{ json: {} }], 30);
    await advanceAsync(30_000);

    const opts = (fake: ReturnType<typeof fakeFetch>) => ({ fetch: fake.fetch });
    expect(await send(CHAT, REQUEST, cancelled.deadline, 75_000, opts(cancelled.fake))).toEqual({
      ok: false,
      error: { kind: 'cancelled' },
    });
    expect(await send(CHAT, REQUEST, late.deadline, 75_000, opts(late.fake))).toEqual({
      ok: false,
      error: { kind: 'timeout' },
    });
    expect(cancelled.fake.requests).toHaveLength(0);
    expect(late.fake.requests).toHaveLength(0);
  });

  it('leaves no timer and no listener behind', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ json: {} }, { fail: 'network' }]);
    const added = vi.spyOn(deadline.signal, 'addEventListener');
    const removed = vi.spyOn(deadline.signal, 'removeEventListener');

    await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    deadline.end();

    expect(vi.getTimerCount()).toBe(0);
    expect(added).toHaveBeenCalledTimes(2);
    expect(removed.mock.calls.map((call) => call[1])).toEqual(
      added.mock.calls.map((call) => call[1]),
    );
  });
});

describe('send: a request that gets no reply (R03.2)', () => {
  it('reports a network failure as connection, or offline when the device is offline', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ fail: 'network' }, { fail: 'network' }]);

    const online = await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });
    goOffline();
    const offline = await send(CHAT, REQUEST, deadline, 75_000, { fetch: fake.fetch });

    expect(online).toEqual({ ok: false, error: { kind: 'connection' } });
    expect(offline).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('passes the provider on, for the refused-key hint', async () => {
    useFakeTime(START);
    const { fake, deadline } = setup([{ fail: 'network' }]);

    const result = await send(CHAT, REQUEST, deadline, 75_000, {
      fetch: fake.fetch,
      provider: 'cerebras',
      keySent: true,
    });
    expect(result).toEqual({ ok: false, error: { kind: 'connection', keyMayBeRefused: true } });
  });

  it('reports a body cut off midway as connection', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 180 });
    const cutOff = async (): Promise<Response> =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"choices":[{"mess'));
            controller.error(new TypeError('network error'));
          },
        }),
        { status: 200 },
      );
    expect(await send(CHAT, REQUEST, deadline, 75_000, { fetch: cutOff })).toEqual({
      ok: false,
      error: { kind: 'connection' },
    });
  });

  it('reports a fetch that throws before sending as connection', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 180 });
    const throwing = (): Promise<Response> => {
      throw new TypeError('Failed to parse URL');
    };
    expect(await send('not a url', REQUEST, deadline, 75_000, { fetch: throwing })).toEqual({
      ok: false,
      error: { kind: 'connection' },
    });
  });
});

describe('send: nothing is logged', () => {
  it('never writes headers, bodies or errors to the console', async () => {
    useFakeTime(START);
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
    const spies = methods.map((method) => vi.spyOn(console, method));
    const { fake, deadline, cancel } = setup([
      { json: openAiAnswer('secret meal') },
      { status: 401, text: 'refused test-key' },
      { fail: 'network' },
      { bodyDelayMs: 10_000, text: 'never read' },
    ]);
    const init = { ...REQUEST, headers: { Authorization: 'Bearer test-key' } };

    await send(CHAT, init, deadline, 75_000, { fetch: fake.fetch });
    await send(CHAT, init, deadline, 75_000, { fetch: fake.fetch });
    await send(CHAT, init, deadline, 75_000, { fetch: fake.fetch });
    const last = send(CHAT, init, deadline, 75_000, { fetch: fake.fetch });
    await advanceAsync(1_000);
    cancel.abort();
    await last;

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
