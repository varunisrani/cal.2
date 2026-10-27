import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { coach } from '../../i18n/en/coach';
import { advance, useFakeTime } from '../../test/time';
import { TYPING_STEP_MS, TypingDots } from './TypingDots';

/** Which of the three dots is lit, by position. */
function litDots(): boolean[] {
  const dots = document.querySelectorAll('[data-ui="coach.typing"] > [aria-hidden="true"]');
  return Array.from(dots).map((dot) => dot.hasAttribute('data-on'));
}

describe('TypingDots (P08-10)', () => {
  it('shows three dots with the first lit, and says the Coach is writing (ACC-I1-2)', () => {
    render(<TypingDots />);

    expect(litDots()).toEqual([true, false, false]);
    expect(screen.getByRole('status')).toHaveTextContent(coach.coach.typing);
  });

  it('moves the lit dot on every 350 ms and back to the first after the third (ACC-I1-2)', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    render(<TypingDots />);
    expect(TYPING_STEP_MS).toBe(350);

    act(() => advance(TYPING_STEP_MS - 1));
    expect(litDots()).toEqual([true, false, false]);

    act(() => advance(1));
    expect(litDots()).toEqual([false, true, false]);

    act(() => advance(TYPING_STEP_MS));
    expect(litDots()).toEqual([false, false, true]);

    act(() => advance(TYPING_STEP_MS));
    expect(litDots()).toEqual([true, false, false]);
  });

  it('stops its timer when it goes away', () => {
    useFakeTime('2026-10-26T12:30:00-04:00');
    const { unmount } = render(<TypingDots />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
