import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOW_SLACK_PX,
  distanceToEnd,
  isNearEnd,
  jumpBehaviour,
  prefersReducedMotion,
  unseenAfter,
} from './followEnd';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('followEnd: where the reader is (P13)', () => {
  const box = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 });

  it('measures how far below the visible part the end is, never below 0', () => {
    expect(distanceToEnd(box(600))).toBe(0);
    expect(distanceToEnd(box(500))).toBe(100);
    expect(distanceToEnd(box(650))).toBe(0);
  });

  it('counts the end and the 80 px above it as at the end, not beyond', () => {
    expect(FOLLOW_SLACK_PX).toBe(80);
    expect(isNearEnd(box(600))).toBe(true);
    expect(isNearEnd(box(600 - FOLLOW_SLACK_PX))).toBe(true);
    expect(isNearEnd(box(600 - FOLLOW_SLACK_PX - 1))).toBe(false);
    expect(isNearEnd({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(true);
  });
});

describe('followEnd: what arrived meanwhile (P13)', () => {
  const messages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('counts the messages after the newest one the person saw', () => {
    expect(unseenAfter(messages, 'd')).toBe(0);
    expect(unseenAfter(messages, 'b')).toBe(2);
  });

  it('counts every message when the one seen is gone, and none when nothing was seen', () => {
    expect(unseenAfter(messages, 'dropped-by-the-cap')).toBe(4);
    expect(unseenAfter(messages, null)).toBe(0);
  });
});

describe('followEnd: motion (P13)', () => {
  it('glides, or jumps at once when motion is reduced', () => {
    expect(jumpBehaviour(false)).toBe('smooth');
    expect(jumpBehaviour(true)).toBe('instant');
  });

  it('reads reduced motion from the device, and none without matchMedia', () => {
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    expect(prefersReducedMotion()).toBe(true);
  });
});
