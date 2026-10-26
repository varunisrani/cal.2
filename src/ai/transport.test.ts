import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../test/time';
import { startDeadline } from './deadline';
import { isAiFailureError, type AiFailure } from './errors';
import { createFakeFetch, jsonReply, networkFailure, textReply } from './testing/fakeFetch';
import { openAiError, openAiReply } from './testing/wire';
import {
  CLOUD_ATTEMPT_CAP_MS,
  attemptCapFor,
  send,
  type Fetcher,
  type SendOptions,
} from './transport';

const CHAT = 'https://chat.example.test/v1/chat/completions';
const POST = { method: 'POST', body: JSON.stringify({ model: 'wire-test-model' }) };
const BUDGET_MS = 180_000;

/** The failure a send rejected with; fails the test when it resolved instead. */
async function failureOf(pending: Promise<unknown>): Promise<AiFailure> {
  try {
    await pending;
  } catch (error) {
    if (isAiFailureError(error)) return error.failure;
    throw error;
  }
  throw new Error('expected the send to fail');
}

/** Tracks whether a promise has settled, without letting a rejection go unhandled. */
function track(pending: Promise<unknown>): { readonly settled: () => boolean } {
  let settled = false;
  pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  return { settled: () => settled };
}

function setup(timeoutMs = BUDGET_MS) {
  const net = createFakeFetch();
  const cancel = new AbortController();
  const deadline = startDeadline({ timeoutMs, cancel: cancel.signal });
  const options = (extra: Partial<SendOptions> = {}): SendOptions => ({
    deadline,
    fetch: net.fetch,
    ...extra,
  });
  return { net, cancel, deadline, options };
}

beforeEach(() => {
  useFakeTime(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('send', () => {
  it('accepts any 2xx as success: 200, 204 and 299 (R03.26)', async () => {
    const { net, options } = setup();
    net
      .on(CHAT)
      .reply(
        jsonReply(openAiReply('fine')),
        jsonReply({ ignored: true }, { status: 204 }),
        textReply('accepted', { status: 299 }),
      );

    const first = await send(CHAT, POST, options());
    expect(first).toMatchObject({ status: 200, ok: true });
    expect(JSON.parse(first.text)).toEqual(openAiReply('fine'));
    expect(await send(CHAT, POST, options())).toEqual({ status: 204, ok: true, text: '' });
    expect(await send(CHAT, POST, options())).toEqual({ status: 299, ok: true, text: 'accepted' });
  });

  it('hands back other statuses with their body for the ladder to judge, without throwing', async () => {
    const { net, options } = setup();
    const busy = JSON.stringify(openAiError('Wire test: busy right now.'));
    net
      .on(CHAT)
      .reply(textReply(busy, { status: 503 }), textReply('no such model', { status: 404 }));

    expect(await send(CHAT, POST, options())).toEqual({ status: 503, ok: false, text: busy });
    expect(await send(CHAT, POST, options())).toEqual({
      status: 404,
      ok: false,
      text: 'no such model',
    });
  });

  it('sends the method, headers and body with an abort signal of its own', async () => {
    const { net, deadline, options } = setup();
    net.on(CHAT).reply(jsonReply({}));

    await send(
      CHAT,
      {
        ...POST,
        headers: { Authorization: 'Bearer wire-key-0001', 'Content-Type': 'application/json' },
      },
      options(),
    );
    expect(net.requests).toHaveLength(1);
    const [request] = net.requests;
    expect(request).toMatchObject({
      url: CHAT,
      method: 'POST',
      headers: { authorization: 'Bearer wire-key-0001', 'content-type': 'application/json' },
      body: { model: 'wire-test-model' },
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(request?.signal).not.toBe(deadline.signal);
  });

  it('caps a cloud attempt at 75 s as a timeout and leaves the deadline running', async () => {
    const { net, deadline, options } = setup();
    net.on(CHAT).reply(jsonReply({}, { delayMs: 100_000 }), jsonReply(openAiReply('standby ok')));

    const pending = send(CHAT, POST, options({ attemptCapMs: attemptCapFor('fixed') }));
    const failure = failureOf(pending);
    const state = track(pending);
    await advanceAsync(74_999);
    expect(state.settled()).toBe(false);

    await advanceAsync(1);
    expect(await failure).toEqual({ kind: 'timeout' });
    expect(Date.now()).toBe(75_000);
    expect(deadline.stoppedBy).toBeUndefined();
    expect(deadline.remainingMs()).toBe(105_000);

    // The same action goes on (a standby, a re-ask) within what is left.
    const next = await send(CHAT, POST, options({ attemptCapMs: attemptCapFor('fixed') }));
    expect(next.ok).toBe(true);
  });

  it('gives an attempt at a user server the whole remaining budget instead of the cap', async () => {
    const { net, deadline, options } = setup();
    net
      .on(CHAT)
      .reply(
        jsonReply(openAiReply('slow but fine'), { delayMs: 120_000 }),
        jsonReply({}, { delayMs: 100_000 }),
      );
    const userServer = options({ attemptCapMs: attemptCapFor('userServer') });

    const slow = send(CHAT, POST, userServer);
    await advanceAsync(120_000);
    expect((await slow).ok).toBe(true);
    expect(deadline.remainingMs()).toBe(60_000);

    const late = failureOf(send(CHAT, POST, userServer));
    await advanceAsync(60_000);
    expect(await late).toEqual({ kind: 'timeout' });
    expect(Date.now()).toBe(BUDGET_MS);
    expect(deadline.stoppedBy).toBe('deadline');
  });

  it('reports a Cancel during the body read as cancelled, not offline (R03.6)', async () => {
    const { net, cancel, options } = setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    net.on(CHAT).reply(jsonReply(openAiReply('never read'), { bodyDelayMs: 30_000 }));

    const failure = failureOf(send(CHAT, POST, options({ attemptCapMs: CLOUD_ATTEMPT_CAP_MS })));
    await advanceAsync(10_000);
    cancel.abort();
    expect(await failure).toEqual({ kind: 'cancelled' });
    expect(Date.now()).toBe(10_000);
    expect(net.requests[0]?.signal?.aborted).toBe(true);
  });

  it('reports a Cancel before the reply arrives as cancelled', async () => {
    const { net, cancel, options } = setup();
    net.on(CHAT).reply(jsonReply({}, { delayMs: 60_000 }));

    const failure = failureOf(send(CHAT, POST, options()));
    await advanceAsync(2_000);
    cancel.abort();
    expect(await failure).toEqual({ kind: 'cancelled' });
    expect(net.requests[0]?.signal?.aborted).toBe(true);
  });

  it('reports the deadline running out during the body read as a timeout', async () => {
    const { net, options } = setup(30_000);
    net.on(CHAT).reply(jsonReply({}, { delayMs: 20_000, bodyDelayMs: 20_000 }));

    const failure = failureOf(send(CHAT, POST, options()));
    await advanceAsync(30_000);
    expect(await failure).toEqual({ kind: 'timeout' });
  });

  it('reports a body cut off midway as a network failure', async () => {
    const { deadline } = setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const cutOff: Fetcher = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"choices":[{"mess'));
              controller.error(new TypeError('Wire test: the connection dropped'));
            },
          }),
          { status: 200 },
        ),
      );

    expect(await failureOf(send(CHAT, POST, { deadline, fetch: cutOff }))).toEqual({
      kind: 'connection',
    });
  });

  it('tells our own stops apart by the signal that fired, even when the browser only says TypeError', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    /** A browser that fails an aborted body read with an opaque TypeError, not the reason. */
    const opaque: Fetcher = (_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init.signal?.addEventListener('abort', () =>
                controller.error(new TypeError('Wire test: load failed')),
              );
            },
          }),
          { status: 200 },
        ),
      );
    const cancel = new AbortController();
    const forCancel = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });
    const forCap = startDeadline({ timeoutMs: BUDGET_MS });
    const forDeadline = startDeadline({ timeoutMs: 30_000 });

    const cancelled = failureOf(send(CHAT, POST, { deadline: forCancel, fetch: opaque }));
    const capped = failureOf(
      send(CHAT, POST, { deadline: forCap, fetch: opaque, attemptCapMs: 20_000 }),
    );
    const timedOut = failureOf(send(CHAT, POST, { deadline: forDeadline, fetch: opaque }));
    await advanceAsync(10_000);
    cancel.abort();
    await advanceAsync(20_000);

    expect(await cancelled).toEqual({ kind: 'cancelled' });
    expect(await capped).toEqual({ kind: 'timeout' });
    expect(forCap.stoppedBy).toBeUndefined();
    expect(await timedOut).toEqual({ kind: 'timeout' });
  });

  it('reports no reply as a connection failure, offline when the device says so', async () => {
    const { net, options } = setup();
    net.on(CHAT).reply(networkFailure(), networkFailure(), networkFailure());
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    expect(await failureOf(send(CHAT, POST, options()))).toEqual({ kind: 'connection' });
    expect(
      await failureOf(send(CHAT, POST, options({ provider: 'cerebras', keySent: true }))),
    ).toEqual({ kind: 'connection', keyMayBeRefused: true });
    onLine.mockReturnValue(false);
    expect(await failureOf(send(CHAT, POST, options()))).toEqual({ kind: 'offline' });
  });

  it('sends nothing once the action has stopped', async () => {
    const { net, cancel, options } = setup();
    net.on(CHAT).reply(jsonReply({}));
    cancel.abort();

    expect(await failureOf(send(CHAT, POST, options()))).toEqual({ kind: 'cancelled' });
    expect(net.requests).toHaveLength(0);
    expect(net.remaining()).toBe(1);
  });

  it('shares one deadline across sends, each starting with the budget left', async () => {
    const { net, deadline, options } = setup();
    net
      .on(CHAT)
      .reply(
        jsonReply({}, { delayMs: 50_000 }),
        jsonReply({}, { delayMs: 30_000 }),
        jsonReply({}, { delayMs: 100_000 }),
      );
    const adds = vi.spyOn(deadline.signal, 'addEventListener');
    const removes = vi.spyOn(deadline.signal, 'removeEventListener');

    const left: number[] = [];
    for (const step of [50_000, 30_000]) {
      const pending = send(CHAT, POST, options());
      await advanceAsync(step);
      await pending;
      left.push(deadline.remainingMs());
    }
    expect(left).toEqual([130_000, 100_000]);
    // Only the deadline's own timer is left; every attempt took its listener away again.
    expect(vi.getTimerCount()).toBe(1);
    expect(removes).toHaveBeenCalledTimes(adds.mock.calls.length);

    // The third would need 100 s with 100 s left: the deadline ends it, at 180 s exactly.
    const third = failureOf(send(CHAT, POST, options({ attemptCapMs: CLOUD_ATTEMPT_CAP_MS })));
    await advanceAsync(75_000);
    expect(await third).toEqual({ kind: 'timeout' });
    expect(Date.now()).toBe(155_000);
    expect(deadline.remainingMs()).toBe(25_000);
  });

  it('never logs headers or bodies', async () => {
    const { net, cancel, options } = setup();
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    net
      .on(CHAT)
      .reply(
        jsonReply(openAiReply('secret answer')),
        textReply('Wire test: key wire-key-0001 refused', { status: 401 }),
        networkFailure(),
        jsonReply({}, { delayMs: 5_000 }),
      );
    const init = { ...POST, headers: { Authorization: 'Bearer wire-key-0001' } };

    await send(CHAT, init, options());
    await send(CHAT, init, options());
    await failureOf(send(CHAT, init, options()));
    const cancelled = failureOf(send(CHAT, init, options()));
    cancel.abort();
    await cancelled;
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it('uses the browser fetch when none is given, called as a plain function', async () => {
    const { net, deadline } = setup();
    net.on(CHAT).reply(jsonReply({ from: 'global' }));
    const contexts: unknown[] = [];
    vi.stubGlobal('fetch', function (this: unknown, url: string, init: RequestInit) {
      contexts.push(this);
      return net.fetch(url, init);
    });

    expect((await send(CHAT, POST, { deadline })).text).toBe('{"from":"global"}');
    expect(contexts).toEqual([undefined]);
  });
});

describe('attemptCapFor', () => {
  it('gives a cloud provider 75 s and a user server the remaining budget', () => {
    expect(attemptCapFor('fixed')).toBe(75_000);
    expect(CLOUD_ATTEMPT_CAP_MS).toBe(75_000);
    expect(attemptCapFor('userServer')).toBeUndefined();
  });
});
