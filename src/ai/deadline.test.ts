import { describe, expect, it, vi } from 'vitest';
import { advanceAsync, useFakeTime } from '../test/time';
import { CLOUD_ATTEMPT_CAP_MS, attemptCapMs, startDeadline, type Deadline } from './deadline';
import { withRetries } from './retry';
import { fakeFetch } from './testing/fakeFetch';
import { send } from './transport';

const START = '2026-10-26T12:00:00Z';
const CHAT = 'https://chat.example.test/v1/chat/completions';
const SERVER = 'http://localhost:11434/v1/chat/completions';

/** Tracks whether a promise has settled, without waiting for it. */
function watch<T>(promise: Promise<T>): { settled: () => boolean } {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  return { settled: () => done };
}

/** The error name of an abort reason (jsdom makes DOMExceptions of another realm). */
const nameOf = (reason: unknown): unknown => (reason as { name?: unknown } | undefined)?.name;

describe('Deadline: the time limit and Cancel', () => {
  it('counts the time left down with the clock and stops at the limit', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 180 });
    expect(deadline.remainingMs()).toBe(180_000);
    expect(deadline.stoppedBy()).toBeUndefined();

    await advanceAsync(30_000);
    expect(deadline.remainingMs()).toBe(150_000);
    await advanceAsync(149_999);
    expect(deadline.remainingMs()).toBe(1);
    expect(deadline.signal.aborted).toBe(false);

    await advanceAsync(1);
    expect(deadline.signal.aborted).toBe(true);
    expect(nameOf(deadline.signal.reason)).toBe('TimeoutError');
    expect(deadline.stoppedBy()).toBe('deadline');
    expect(deadline.remainingMs()).toBe(0);
  });

  it('stops at once when the person cancels, with an AbortError', async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutSeconds: 180, cancel: cancel.signal });
    await advanceAsync(10_000);

    cancel.abort();
    expect(deadline.signal.aborted).toBe(true);
    expect(nameOf(deadline.signal.reason)).toBe('AbortError');
    expect(deadline.stoppedBy()).toBe('cancel');
    expect(deadline.remainingMs()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts stopped when Cancel was already pressed', () => {
    useFakeTime(START);
    const cancel = new AbortController();
    cancel.abort();
    const deadline = startDeadline({ timeoutSeconds: 60, cancel: cancel.signal });
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.stoppedBy()).toBe('cancel');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the first cause when Cancel comes after the limit', async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutSeconds: 30, cancel: cancel.signal });
    await advanceAsync(30_000);
    cancel.abort();
    expect(deadline.stoppedBy()).toBe('deadline');
    expect(nameOf(deadline.signal.reason)).toBe('TimeoutError');
  });

  it('lets go of the timer and of Cancel when the action ends', async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutSeconds: 30, cancel: cancel.signal });
    expect(vi.getTimerCount()).toBe(1);

    deadline.end();
    deadline.end();
    expect(vi.getTimerCount()).toBe(0);
    cancel.abort();
    await advanceAsync(60_000);
    expect(deadline.signal.aborted).toBe(false);
    expect(deadline.stoppedBy()).toBeUndefined();
  });

  it('refuses a timeout that is not a positive number', () => {
    for (const timeoutSeconds of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => startDeadline({ timeoutSeconds })).toThrow(RangeError);
    }
  });
});

describe('Deadline.hold: a reply streaming in (D-16.106)', () => {
  it('stops the count while held and counts on from there when let go', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 30 });
    await advanceAsync(10_000);
    const release = deadline.hold();
    await advanceAsync(120_000);
    expect(deadline.remainingMs()).toBe(20_000);
    expect(deadline.signal.aborted).toBe(false);

    release();
    release();
    await advanceAsync(19_999);
    expect(deadline.remainingMs()).toBe(1);
    await advanceAsync(1);
    expect(deadline.stoppedBy()).toBe('deadline');
  });

  it('counts again only when the last of nested holds lets go', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 30 });
    const outer = deadline.hold();
    const inner = deadline.hold();
    await advanceAsync(60_000);
    inner();
    await advanceAsync(60_000);
    expect(deadline.remainingMs()).toBe(30_000);
    outer();
    await advanceAsync(5_000);
    expect(deadline.remainingMs()).toBe(25_000);
    deadline.end();
  });

  it('still stops at once for Cancel while held', async () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutSeconds: 30, cancel: cancel.signal });
    const release = deadline.hold();
    await advanceAsync(40_000);
    cancel.abort();
    expect(deadline.stoppedBy()).toBe('cancel');
    release();
    expect(deadline.remainingMs()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts no timer again for a hold let go after the action ended', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 30 });
    const release = deadline.hold();
    deadline.end();
    release();
    expect(vi.getTimerCount()).toBe(0);
    expect(deadline.hold()).toBeTypeOf('function');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('attemptCapMs: the limit of one attempt (D-16.60)', () => {
  it('gives a fixed cloud provider 75 s, or less when less is left', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 180 });
    expect(CLOUD_ATTEMPT_CAP_MS).toBe(75_000);
    expect(attemptCapMs(deadline, false)).toBe(75_000);
    await advanceAsync(130_000);
    expect(attemptCapMs(deadline, false)).toBe(50_000);
  });

  it('gives a self-hosted server whatever is left of the budget', async () => {
    useFakeTime(START);
    const deadline = startDeadline({ timeoutSeconds: 600 });
    expect(attemptCapMs(deadline, true)).toBe(600_000);
    await advanceAsync(100_000);
    expect(attemptCapMs(deadline, true)).toBe(500_000);
  });

  it('gives nothing once the action has stopped', () => {
    useFakeTime(START);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutSeconds: 180, cancel: cancel.signal });
    cancel.abort();
    expect(attemptCapMs(deadline, false)).toBe(0);
    expect(attemptCapMs(deadline, true)).toBe(0);
  });
});

describe('one time limit for the whole action (D-16.23, R03.6, ACC-E4-2)', () => {
  /** A ladder of sends to `url`, each attempt capped as the provider kind says. */
  const ladder = (
    fetchImpl: typeof fetch,
    deadline: Deadline,
    url: string,
    selfHosted: boolean,
    caps: number[] = [],
  ) =>
    withRetries(() => {
      const cap = attemptCapMs(deadline, selfHosted);
      caps.push(cap);
      return send(url, { method: 'POST', body: '{}' }, deadline, cap, { fetch: fetchImpl });
    }, deadline);

  it('ends a four-attempt ladder early, at 180 s exactly', async () => {
    const start = useFakeTime(START);
    // Each busy reply takes 70 s: requests at 0, 71 and 143 s; the third is cut at 180 s.
    const busy = { status: 503, delayMs: 70_000, text: 'busy' };
    const fake = fakeFetch().on(CHAT, busy, busy, busy, busy);
    const deadline = startDeadline({ timeoutSeconds: 180 });

    const result = ladder(fake.fetch, deadline, CHAT, false);
    const state = watch(result);
    await advanceAsync(179_999);
    expect(state.settled()).toBe(false);
    await advanceAsync(1);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(Date.now() - start).toBe(180_000);
    expect(fake.requests).toHaveLength(3);
    expect(fake.pending()).toBe(1);
  });

  it('accounts the time left across attempts and waits', async () => {
    useFakeTime(START);
    // A self-hosted server that is busy for 50 s each time: each attempt may use what is left.
    const busy = { status: 503, delayMs: 50_000, text: 'busy' };
    const fake = fakeFetch().on(SERVER, busy, busy, busy, busy);
    const deadline = startDeadline({ timeoutSeconds: 180 });
    const caps: number[] = [];

    const result = ladder(fake.fetch, deadline, SERVER, true, caps);
    await advanceAsync(180_000);

    // Requests at 0, 51 s (50 + 1), 103 s (101 + 2) and 157 s (153 + 4).
    expect(caps).toEqual([180_000, 129_000, 77_000, 23_000]);
    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(fake.requests).toHaveLength(4);
  });

  it('stops a provider that never answers at the limit, never later', async () => {
    const start = useFakeTime(START);
    const fake = fakeFetch().on(SERVER, { delayMs: 3_600_000, text: 'too late' });
    const deadline = startDeadline({ timeoutSeconds: 30 });

    const result = ladder(fake.fetch, deadline, SERVER, true);
    await advanceAsync(30_000);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(Date.now() - start).toBe(30_000);
    expect(fake.requests).toHaveLength(1);
  });

  it('stops a stuck cloud request at 75 s, well inside a long limit', async () => {
    const start = useFakeTime(START);
    const fake = fakeFetch().on(CHAT, { delayMs: 3_600_000, text: 'too late' });
    const deadline = startDeadline({ timeoutSeconds: 600 });

    const result = ladder(fake.fetch, deadline, CHAT, false);
    await advanceAsync(75_000);

    expect(await result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(Date.now() - start).toBe(75_000);
    expect(deadline.remainingMs()).toBe(525_000);
    expect(fake.requests).toHaveLength(1);
  });
});
