import { describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../test/time';
import { startDeadline, type Deadline } from './deadline';
import { failureMessages, type SingleFailure } from './errors';
import { RETRY_WAITS_MS, isRetryStatus, withRetries } from './retry';
import { fakeFetch, type FakeStep } from './testing/fakeFetch';
import { anthropicError, geminiError, openAiAnswer, openAiError } from './testing/wire';
import { send, type Reply } from './transport';
import type { Result } from '../lib/result';

const START = '2026-10-26T12:00:00Z';
const CHAT = 'https://chat.example.test/v1/chat/completions';
const GEMINI = 'https://models.example.test/v1beta/models/test-model:generateContent';

/** Tracks whether a promise has settled, without waiting for it. */
function watch<T>(promise: Promise<T>): { settled: () => boolean } {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  return { settled: () => done };
}

interface Run {
  readonly fake: ReturnType<typeof fakeFetch>;
  readonly deadline: Deadline;
  readonly cancel: AbortController;
  readonly result: Promise<Result<Reply, SingleFailure>>;
  /** Milliseconds after the start at which each request was sent. */
  readonly sentAt: number[];
}

/** Runs the ladder against one scripted route, each attempt capped at 75 s. */
function run(
  url: string,
  steps: readonly FakeStep[],
  options: { timeoutSeconds?: number; secrets?: readonly string[] } = {},
): Run {
  const start = Date.now();
  const cancel = new AbortController();
  const deadline = startDeadline({
    timeoutSeconds: options.timeoutSeconds ?? 180,
    cancel: cancel.signal,
  });
  const fake = fakeFetch().on(url, ...steps);
  const sentAt: number[] = [];
  const result = withRetries(
    () => {
      sentAt.push(Date.now() - start);
      return send(url, { method: 'POST', body: '{}' }, deadline, 75_000, { fetch: fake.fetch });
    },
    deadline,
    { secrets: options.secrets },
  );
  return { fake, deadline, cancel, result, sentAt };
}

const busy = (status: number): FakeStep => ({ status, json: openAiError('Busy, try later.') });

describe('withRetries: the ladder (03 §3.9, D-16.23)', () => {
  it('waits 1, 2 and 4 s and then returns the success', async () => {
    useFakeTime(START);
    const answer = openAiAnswer('{"name":"soup"}');
    const { fake, result, sentAt } = run(CHAT, [busy(429), busy(429), busy(429), { json: answer }]);
    const state = watch(result);

    await advanceAsync(999);
    expect(fake.requests).toHaveLength(1);
    await advanceAsync(1);
    expect(fake.requests).toHaveLength(2);
    await advanceAsync(1_999);
    expect(fake.requests).toHaveLength(2);
    await advanceAsync(1);
    expect(fake.requests).toHaveLength(3);
    await advanceAsync(3_999);
    expect(fake.requests).toHaveLength(3);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);

    expect(await result).toEqual({
      ok: true,
      value: { status: 200, ok: true, body: JSON.stringify(answer) },
    });
    expect(sentAt).toEqual([0, 1_000, 3_000, 7_000]);
    expect(RETRY_WAITS_MS).toEqual([1_000, 2_000, 4_000]);
  });

  it('gives the busy message after four 503 replies and no fifth request (ACC-E4-1)', async () => {
    useFakeTime(START);
    const { fake, result, sentAt } = run(CHAT, [busy(503), busy(503), busy(503), busy(503)]);
    await advanceAsync(60_000);

    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'overloaded', status: 503 } });
    if (outcome.ok) throw new Error('expected a failure');
    expect(failureMessages(outcome.error)).toEqual([{ key: 'ai.failure.overloaded' }]);
    expect(fake.requests).toHaveLength(4);
    expect(sentAt).toEqual([0, 1_000, 3_000, 7_000]);
  });

  it('treats 529 like 503, and four plain 429 replies as a rate limit', async () => {
    useFakeTime(START);
    const overloaded = anthropicError('overloaded_error', 'Overloaded');
    const anthropic = run(CHAT, Array<FakeStep>(4).fill({ status: 529, json: overloaded }));
    await advanceAsync(60_000);
    expect(await anthropic.result).toMatchObject({
      ok: false,
      error: { kind: 'overloaded', status: 529 },
    });
    expect(anthropic.fake.requests).toHaveLength(4);

    const limited = run(CHAT, Array<FakeStep>(4).fill(busy(429)));
    await advanceAsync(60_000);
    expect(await limited.result).toMatchObject({
      ok: false,
      error: { kind: 'rateLimit', status: 429 },
    });
    expect(limited.fake.requests).toHaveLength(4);
  });

  it('ignores Retry-After', async () => {
    useFakeTime(START);
    const later = { ...busy(429), headers: { 'retry-after': '30' } };
    const { result, sentAt } = run(CHAT, [later, later, { json: openAiAnswer('ok') }]);
    await advanceAsync(3_000);

    expect(await result).toMatchObject({ ok: true, value: { status: 200 } });
    expect(sentAt).toEqual([0, 1_000, 3_000]);
  });

  it('classifies from the last reply when the status changes between tries', async () => {
    useFakeTime(START);
    const { fake, result } = run(CHAT, [busy(503), { status: 404, json: openAiError('Gone.') }]);
    await advanceAsync(1_000);

    expect(await result).toMatchObject({ ok: false, error: { kind: 'model', status: 404 } });
    expect(fake.requests).toHaveLength(2);
  });
});

describe('withRetries: daily-quota details survive the retries (R03.18)', () => {
  it('reads a Gemini daily quota from the fourth 429 after four requests', async () => {
    useFakeTime(START);
    const daily = geminiError(429, 'RESOURCE_EXHAUSTED', 'Resource exhausted for key test-key.', {
      quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
    });
    const { fake, result } = run(GEMINI, Array<FakeStep>(4).fill({ status: 429, json: daily }), {
      secrets: ['test-key'],
    });
    await advanceAsync(7_000);

    const outcome = await result;
    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'dailyQuota',
        status: 429,
        detail: 'Resource exhausted for key •••.',
      },
    });
    expect(fake.requests).toHaveLength(4);
  });
});

describe('withRetries: what is never retried', () => {
  it.each([
    [500, 'generic'],
    [404, 'model'],
    [401, 'keyRejected'],
    [402, 'credits'],
    [400, 'generic'],
  ])('gives up after one request on %i (%s)', async (status, kind) => {
    useFakeTime(START);
    const { fake, result } = run(CHAT, [{ status, text: 'private provider text' }]);
    await advanceAsync(10_000);

    const outcome = await result;
    expect(outcome).toMatchObject({ ok: false, error: { kind, status } });
    if (outcome.ok) throw new Error('expected a failure');
    expect(JSON.stringify(failureMessages(outcome.error))).not.toContain('private');
    expect(fake.requests).toHaveLength(1);
    expect(isRetryStatus(status)).toBe(false);
  });

  it('does not resend a request that got no reply (TypeError)', async () => {
    useFakeTime(START);
    const { fake, result } = run(CHAT, [{ fail: 'network' }, { json: openAiAnswer('ok') }]);
    await advanceAsync(10_000);

    expect(await result).toEqual({ ok: false, error: { kind: 'connection' } });
    expect(fake.requests).toHaveLength(1);
    expect(fake.pending()).toBe(1);
  });

  it('does not resend an attempt that hit its cap', async () => {
    useFakeTime(START);
    const { fake, result } = run(CHAT, [{ delayMs: 90_000, json: {} }, { json: {} }]);
    await advanceAsync(75_000);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(fake.requests).toHaveLength(1);
  });

  it('retries only 429, 503 and 529', () => {
    const retried = [400, 408, 409, 429, 500, 502, 503, 504, 529, 599].filter(isRetryStatus);
    expect(retried).toEqual([429, 503, 529]);
  });
});

describe('withRetries: inside the deadline (D-16.23, R03.6)', () => {
  it('stops early with the last error when a wait would pass the deadline', async () => {
    const start = useFakeTime(START);
    // Busy replies after 58 s: requests at 0, 59 and 119 s; the third reply comes at 177 s,
    // and a 4 s wait would end at 181 s, past the 180 s limit.
    const slow = { ...busy(503), delayMs: 58_000 };
    const { fake, result, deadline } = run(CHAT, [slow, slow, slow, slow]);
    const state = watch(result);
    await advanceAsync(176_999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);

    expect(await result).toMatchObject({ ok: false, error: { kind: 'overloaded', status: 503 } });
    expect(Date.now() - start).toBe(177_000);
    expect(fake.requests).toHaveLength(3);
    expect(deadline.stoppedBy()).toBeUndefined();
  });

  it('does not start a wait that would end exactly at the deadline', async () => {
    useFakeTime(START);
    // The busy reply comes at 29 s of a 30 s limit: the 1 s wait would end on the limit.
    const { fake, result } = run(CHAT, [{ ...busy(429), delayMs: 29_000 }, busy(429)], {
      timeoutSeconds: 30,
    });
    await advanceAsync(29_000);

    expect(await result).toMatchObject({ ok: false, error: { kind: 'rateLimit', status: 429 } });
    expect(fake.requests).toHaveLength(1);
    expect(fake.pending()).toBe(1);
  });

  it('stops at once when the person cancels during a wait', async () => {
    useFakeTime(START);
    const { fake, result, cancel, deadline } = run(CHAT, [busy(503), busy(503)]);
    const state = watch(result);
    await advanceAsync(400);
    expect(state.settled()).toBe(false);

    cancel.abort();
    await advanceAsync(0);
    expect(state.settled()).toBe(true);
    expect(await result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(fake.requests).toHaveLength(1);

    deadline.end();
    expect(vi.getTimerCount()).toBe(0);
    await advanceAsync(10_000);
    expect(fake.requests).toHaveLength(1);
  });

  it('sends nothing when Cancel was pressed before the first request', async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    cancel.abort();
    const deadline = startDeadline({ timeoutSeconds: 180, cancel: cancel.signal });
    const attempt = vi.fn();

    expect(await withRetries(attempt, deadline)).toEqual({
      ok: false,
      error: { kind: 'cancelled' },
    });
    expect(attempt).not.toHaveBeenCalled();
  });
});
