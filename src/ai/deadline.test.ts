import { describe, expect, it, vi } from 'vitest';
import { advance, advanceAsync, useFakeTime } from '../test/time';
import { startDeadline } from './deadline';
import { isAiFailureError, type AiFailure } from './errors';

const BUDGET_MS = 180_000;

/** The failure `throwIfStopped` throws, or `undefined` when it does not throw. */
function thrownFailure(run: () => void): AiFailure | undefined {
  try {
    run();
  } catch (error) {
    if (isAiFailureError(error)) return error.failure;
    throw error;
  }
  return undefined;
}

describe('startDeadline', () => {
  it('counts the budget down with time and reports none left once stopped', () => {
    useFakeTime(0);
    const deadline = startDeadline({ timeoutMs: BUDGET_MS });
    expect(deadline.remainingMs()).toBe(180_000);

    advance(61_000);
    expect(deadline.remainingMs()).toBe(119_000);
    expect(deadline.stoppedBy).toBeUndefined();
    expect(deadline.signal.aborted).toBe(false);

    advance(119_000);
    expect(deadline.remainingMs()).toBe(0);
  });

  it('fires at the end of the budget, as a deadline with a TimeoutError reason', () => {
    useFakeTime(0);
    const deadline = startDeadline({ timeoutMs: 30_000 });

    advance(29_999);
    expect(deadline.signal.aborted).toBe(false);
    advance(1);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.stoppedBy).toBe('deadline');
    expect(deadline.signal.reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('stops at once on Cancel, as a cancel with an AbortError reason', () => {
    useFakeTime(0);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });

    advance(5_000);
    cancel.abort();
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.stoppedBy).toBe('cancel');
    expect(deadline.signal.reason).toMatchObject({ name: 'AbortError' });
    expect(deadline.remainingMs()).toBe(0);
  });

  it('starts stopped when Cancel was pressed before the action began', () => {
    useFakeTime(0);
    const cancel = new AbortController();
    cancel.abort();
    const deadline = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });

    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.stoppedBy).toBe('cancel');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the first stop: a Cancel after the deadline fired changes nothing', () => {
    useFakeTime(0);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutMs: 30_000, cancel: cancel.signal });

    advance(30_000);
    cancel.abort();
    expect(deadline.stoppedBy).toBe('deadline');
    expect(deadline.signal.reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('keeps the first stop: the timer after a Cancel changes nothing', () => {
    useFakeTime(0);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutMs: 30_000, cancel: cancel.signal });

    cancel.abort();
    advance(60_000);
    expect(deadline.stoppedBy).toBe('cancel');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses a budget that is not a positive number of milliseconds', () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => startDeadline({ timeoutMs })).toThrow(RangeError);
    }
  });
});

describe('pause', () => {
  it('resolves after its time while the deadline runs', async () => {
    useFakeTime(0);
    const deadline = startDeadline({ timeoutMs: BUDGET_MS });
    let outcome: string | undefined = 'pending';
    const pausing = deadline.pause(2_000).then((stop) => (outcome = stop));

    await advanceAsync(1_999);
    expect(outcome).toBe('pending');
    await advanceAsync(1);
    await pausing;
    expect(outcome).toBeUndefined();
    expect(deadline.remainingMs()).toBe(178_000);
  });

  it('ends early with the reason when the person cancels', async () => {
    useFakeTime(0);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });
    const pausing = deadline.pause(4_000);

    advance(500);
    cancel.abort();
    expect(await pausing).toBe('cancel');
    expect(Date.now()).toBe(500);
  });

  it('ends early with the reason when the budget runs out', async () => {
    useFakeTime(0);
    const deadline = startDeadline({ timeoutMs: 30_000 });
    const pausing = deadline.pause(60_000);

    advance(30_000);
    expect(await pausing).toBe('deadline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves at once on a stopped deadline', async () => {
    useFakeTime(0);
    const cancel = new AbortController();
    cancel.abort();
    const deadline = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });

    expect(await deadline.pause(1_000)).toBe('cancel');
    expect(Date.now()).toBe(0);
  });
});

describe('throwIfStopped', () => {
  it('throws a silent cancel or a timeout, and nothing while the action runs', () => {
    useFakeTime(0);
    const cancel = new AbortController();
    const cancelled = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });
    const timed = startDeadline({ timeoutMs: 30_000 });

    expect(thrownFailure(() => cancelled.throwIfStopped())).toBeUndefined();
    cancel.abort();
    expect(thrownFailure(() => cancelled.throwIfStopped())).toEqual({ kind: 'cancelled' });

    advance(30_000);
    expect(thrownFailure(() => timed.throwIfStopped())).toEqual({ kind: 'timeout' });
  });
});

describe('dispose', () => {
  it('leaves no timer behind and stops listening to Cancel', () => {
    useFakeTime(0);
    const cancel = new AbortController();
    const deadline = startDeadline({ timeoutMs: BUDGET_MS, cancel: cancel.signal });
    expect(vi.getTimerCount()).toBe(1);

    deadline.dispose();
    expect(vi.getTimerCount()).toBe(0);
    cancel.abort();
    advance(BUDGET_MS);
    expect(deadline.stoppedBy).toBeUndefined();
    expect(deadline.signal.aborted).toBe(false);
  });
});
