import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../test/time';
import { startDeadline } from './deadline';
import { failureMessage, isAiFailureError, type AiFailure } from './errors';
import { RETRY_WAITS_MS, sendWithRetry } from './retry';
import { createFakeFetch, jsonReply, networkFailure, textReply } from './testing/fakeFetch';
import {
  anthropicError,
  anthropicReply,
  geminiError,
  geminiReply,
  openAiError,
  openAiReply,
} from './testing/wire';
import { CLOUD_ATTEMPT_CAP_MS, type SendOptions } from './transport';

const CHAT = 'https://chat.example.test/v1/chat/completions';
const GEMINI = 'https://gemini.example.test/v1beta/models/wire-test-model:generateContent';
const MESSAGES = 'https://messages.example.test/v1/messages';
const POST = { method: 'POST', body: JSON.stringify({ model: 'wire-test-model' }) };
const BUDGET_MS = 180_000;

const busy = (status: number, init: { delayMs?: number; headers?: Record<string, string> } = {}) =>
  jsonReply(openAiError(`Wire test: busy (${status}).`), { status, ...init });

/** The failure a call rejected with; fails the test when it resolved instead. */
async function failureOf(pending: Promise<unknown>): Promise<AiFailure> {
  try {
    await pending;
  } catch (error) {
    if (isAiFailureError(error)) return error.failure;
    throw error;
  }
  throw new Error('expected the call to fail');
}

/** The failure a call rejected with, and the fake time at which it did. */
async function failureAndTime(pending: Promise<unknown>): Promise<[AiFailure, number]> {
  const failure = await failureOf(pending);
  return [failure, Date.now()];
}

function setup(timeoutMs = BUDGET_MS) {
  const net = createFakeFetch();
  const cancel = new AbortController();
  const deadline = startDeadline({ timeoutMs, cancel: cancel.signal });
  const options = (extra: Partial<SendOptions> = {}): SendOptions => ({
    deadline,
    fetch: net.fetch,
    attemptCapMs: CLOUD_ATTEMPT_CAP_MS,
    ...extra,
  });
  /** When each request went out, in ms of fake time. */
  const sentAt = () => net.requests.map((request) => request.at);
  return { net, cancel, deadline, options, sentAt };
}

beforeEach(() => {
  useFakeTime(0);
});

describe('sendWithRetry', () => {
  it('waits 1, 2 and 4 s between tries: 429, 429, 429, then 200 succeeds', async () => {
    const { net, options, sentAt } = setup();
    net.on(CHAT).reply(busy(429), busy(429), busy(429), jsonReply(openAiReply('at last')));

    const pending = sendWithRetry(CHAT, POST, options());
    await advanceAsync(7_000);
    const reply = await pending;

    expect(reply.ok).toBe(true);
    expect(JSON.parse(reply.text)).toEqual(openAiReply('at last'));
    expect(RETRY_WAITS_MS).toEqual([1_000, 2_000, 4_000]);
    expect(sentAt()).toEqual([0, 1_000, 3_000, 7_000]);
  });

  it('retries a busy provider three times, then shows the busy message (ACC-E4-1)', async () => {
    const { net, options, sentAt } = setup();
    net.on(CHAT).reply(busy(503), busy(503), busy(503), busy(503), jsonReply({}));

    const failure = failureOf(sendWithRetry(CHAT, POST, options()));
    await advanceAsync(60_000);

    const result = await failure;
    expect(result.kind).toBe('overloaded');
    expect(failureMessage(result)).toBe(failureMessage({ kind: 'overloaded' }));
    expect(net.requests).toHaveLength(4);
    expect(sentAt()).toEqual([0, 1_000, 3_000, 7_000]);
    expect(net.remaining()).toBe(1);
  });

  it('retries 529 like 503', async () => {
    const { net, options } = setup();
    net.on(CHAT).reply(busy(529), busy(503), jsonReply({}));

    const pending = sendWithRetry(CHAT, POST, options());
    await advanceAsync(3_000);
    expect((await pending).ok).toBe(true);
    expect(net.requests).toHaveLength(3);
  });

  it('never retries any other status: one request, classified from its body', async () => {
    const cases: [status: number, kind: string][] = [
      [400, 'generic'],
      [401, 'keyRejected'],
      [402, 'credits'],
      [404, 'model'],
      [418, 'generic'],
      [500, 'generic'],
      [502, 'generic'],
      [504, 'generic'],
    ];
    for (const [status, kind] of cases) {
      const { net, options } = setup();
      net.on(CHAT).reply(textReply('Wire test: private provider words', { status }), busy(503));

      const failure = await failureOf(sendWithRetry(CHAT, POST, options()));
      expect(failure.kind, `status ${status}`).toBe(kind);
      expect(net.requests, `status ${status}`).toHaveLength(1);
      expect(failureMessage(failure)).not.toContain('private provider');
    }
  });

  it('never retries a request that got no reply, even after a busy reply', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const first = setup();
    first.net.on(CHAT).reply(networkFailure(), jsonReply({}));
    expect(await failureOf(sendWithRetry(CHAT, POST, first.options()))).toEqual({
      kind: 'connection',
    });
    expect(first.net.requests).toHaveLength(1);

    const second = setup();
    second.net.on(CHAT).reply(busy(429), networkFailure({ delayMs: 500 }), jsonReply({}));
    const failure = failureOf(sendWithRetry(CHAT, POST, second.options()));
    await advanceAsync(2_000);
    expect(await failure).toEqual({ kind: 'connection' });
    expect(second.net.requests).toHaveLength(2);
    expect(second.net.remaining()).toBe(1);
  });

  it('never retries an attempt that ran past its 75 s cap', async () => {
    const { net, deadline, options } = setup();
    net.on(CHAT).reply(jsonReply({}, { delayMs: 90_000 }), jsonReply({}));

    const failure = failureOf(sendWithRetry(CHAT, POST, options()));
    await advanceAsync(80_000);
    expect(await failure).toEqual({ kind: 'timeout' });
    expect(net.requests).toHaveLength(1);
    expect(deadline.stoppedBy).toBeUndefined();
  });

  it('ignores Retry-After and keeps its own waits', async () => {
    const { net, options, sentAt } = setup();
    net
      .on(CHAT)
      .reply(
        busy(429, { headers: { 'retry-after': '30' } }),
        busy(503, { headers: { 'retry-after': '0' } }),
        jsonReply({}),
      );

    const pending = sendWithRetry(CHAT, POST, options());
    await advanceAsync(3_000);
    expect((await pending).ok).toBe(true);
    expect(sentAt()).toEqual([0, 1_000, 3_000]);
  });

  it('keeps the daily quota of the last reply through four tries (R03.18)', async () => {
    const { net, options } = setup();
    const dailyQuota = geminiError({
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Wire test: allowance used up.',
      quotaId: 'WireTestRequestsPerDayPerModel',
    });
    net
      .on(GEMINI)
      .reply(...Array.from({ length: 4 }, () => jsonReply(dailyQuota, { status: 429 })));

    const failure = failureOf(sendWithRetry(GEMINI, POST, options()));
    await advanceAsync(10_000);
    expect((await failure).kind).toBe('dailyQuota');
    expect(net.requests).toHaveLength(4);
  });

  it('reads the kind from the last reply, not the first', async () => {
    const { net, options } = setup();
    const dailyQuota = geminiError({
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'Wire test: allowance used up.',
      quotaId: 'WireTestRequestsPerDayPerModel',
    });
    net.on(GEMINI).reply(busy(503), busy(429), busy(503), jsonReply(dailyQuota, { status: 429 }));

    const failure = failureOf(sendWithRetry(GEMINI, POST, options()));
    await advanceAsync(10_000);
    expect((await failure).kind).toBe('dailyQuota');
  });

  it('works the same for every wire format', async () => {
    const { net, options } = setup();
    net.on(GEMINI).reply(
      jsonReply(geminiError({ code: 503, status: 'UNAVAILABLE', message: 'Wire test: busy.' }), {
        status: 503,
      }),
      jsonReply(geminiReply('{"ok":true}')),
    );
    net
      .on(MESSAGES)
      .reply(
        jsonReply(anthropicError('overloaded_error', 'Wire test: busy.'), { status: 529 }),
        jsonReply(anthropicReply('{"ok":true}')),
      );
    net.on(CHAT).reply(busy(429), jsonReply(openAiReply('{"ok":true}')));

    const replies = [GEMINI, MESSAGES, CHAT].map((url) => sendWithRetry(url, POST, options()));
    await advanceAsync(1_000);
    for (const reply of await Promise.all(replies)) expect(reply.ok).toBe(true);
    expect(net.requests).toHaveLength(6);
  });

  it('stops at once when the person cancels during a wait', async () => {
    const { net, cancel, options } = setup();
    net.on(CHAT).reply(busy(503), jsonReply({}));

    const failure = failureOf(sendWithRetry(CHAT, POST, options()));
    await advanceAsync(500);
    cancel.abort();
    expect(await failure).toEqual({ kind: 'cancelled' });
    expect(Date.now()).toBe(500);
    expect(failureMessage(await failure)).toBeNull();

    await advanceAsync(10_000);
    expect(net.requests).toHaveLength(1);
  });

  it('stops early with the last error when a wait would pass the deadline', async () => {
    const { net, options } = setup(30_000);
    net.on(CHAT).reply(busy(503), busy(429, { delayMs: 27_500 }), jsonReply({}));

    const outcome = failureAndTime(sendWithRetry(CHAT, POST, options()));
    await advanceAsync(40_000);
    // Tries at 0 s and 1 s; the 429 lands at 28.5 s with 1.5 s left, less than the 2 s wait.
    const [failure, at] = await outcome;
    expect(failure.kind).toBe('rateLimit');
    expect(at).toBe(28_500);
    expect(net.requests).toHaveLength(2);
  });

  it('gives the last error, not a timeout, when the deadline ends during a wait', async () => {
    // A throttled background tab can run the wait's timer after the deadline's.
    const { net, deadline, options } = setup();
    net.on(CHAT).reply(busy(529), jsonReply({}));
    const lateTimers = { ...deadline, pause: () => Promise.resolve('deadline' as const) };

    const failure = await failureOf(sendWithRetry(CHAT, POST, options({ deadline: lateTimers })));
    expect(failure.kind).toBe('overloaded');
    expect(net.requests).toHaveLength(1);
  });

  it('ends a ladder of slow busy replies from a user server at the 180 s deadline (ACC-E4-2)', async () => {
    // No 75 s cap, and each busy reply takes a minute: the third try is still running at 180 s.
    const { net, options, sentAt } = setup();
    net
      .on(CHAT)
      .reply(
        busy(503, { delayMs: 60_000 }),
        busy(503, { delayMs: 60_000 }),
        busy(503, { delayMs: 60_000 }),
        busy(503),
      );
    const outcome = failureAndTime(sendWithRetry(CHAT, POST, options({ attemptCapMs: undefined })));
    await advanceAsync(300_000);
    expect(await outcome).toEqual([{ kind: 'timeout' }, BUDGET_MS]);
    expect(sentAt()).toEqual([0, 61_000, 123_000]);
  });

  it('ends a four-try cloud ladder at the 180 s deadline, never later (ACC-E4-2)', async () => {
    // Every busy reply takes 50 s; the fourth try starts at 157 s and the deadline cuts it.
    const { net, options, sentAt } = setup();
    net.on(CHAT).reply(...Array.from({ length: 4 }, () => busy(503, { delayMs: 50_000 })));
    const outcome = failureAndTime(sendWithRetry(CHAT, POST, options()));
    await advanceAsync(300_000);
    expect(await outcome).toEqual([{ kind: 'timeout' }, BUDGET_MS]);
    expect(sentAt()).toEqual([0, 51_000, 103_000, 157_000]);
  });

  it('gives each try at a user server the budget still left', async () => {
    const { net, deadline, options } = setup();
    net.on(CHAT).reply(busy(503, { delayMs: 100_000 }), jsonReply({}, { delayMs: 78_000 }));

    const pending = sendWithRetry(CHAT, POST, options({ attemptCapMs: undefined }));
    await advanceAsync(179_000);
    expect((await pending).ok).toBe(true);
    expect(deadline.remainingMs()).toBe(1_000);
  });
});
