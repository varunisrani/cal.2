import { describe, expect, it } from 'vitest';
import { claimOnce, EMPTY_DEVICE, nextStreak, readDevice, SENT_KEPT_MS } from './device';

describe('the notification bookkeeping (P17-02)', () => {
  it('records a onceKey once, forgetting old ones', () => {
    const first = claimOnce(EMPTY_DEVICE, 'a', 1_000);
    expect(first.sent).toEqual({ a: 1_000 });
    expect(claimOnce(first, 'a', 2_000)).toBe(first);
    expect(claimOnce(first, 'b', 1_000 + SENT_KEPT_MS).sent).toEqual({ b: 1_000 + SENT_KEPT_MS });
  });

  it('counts each new failure time once, and starts again after a success', () => {
    const one = nextStreak(EMPTY_DEVICE.fails.auto, 10);
    expect(one).toEqual({ at: 10, count: 1 });
    expect(nextStreak(one, 10)).toBe(one);
    expect(nextStreak(one, 20)).toEqual({ at: 20, count: 2 });
    expect(nextStreak(one, null)).toEqual({ at: null, count: 0 });
    expect(nextStreak(EMPTY_DEVICE.fails.auto, null)).toBe(EMPTY_DEVICE.fails.auto);
  });

  it('reads a stored record field by field', () => {
    expect(
      readDevice({
        sent: { a: 1, b: 'never' },
        cardDone: 'yes',
        fails: { auto: { at: 5, count: 2 }, drive: { at: -1, count: 1.5 } },
      }),
    ).toEqual({
      sent: { a: 1 },
      cardDone: false,
      fails: { auto: { at: 5, count: 2 }, drive: { at: null, count: 0 } },
    });
    expect(readDevice(null)).toBe(EMPTY_DEVICE);
  });
});
