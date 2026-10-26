import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { systemClock } from '../lib/clock';
import { advance, useFakeTime } from '../test/time';
import { TodayProvider, useToday } from './TodayProvider';

function Today() {
  return <p data-testid="today">{useToday()}</p>;
}

function renderToday() {
  return render(
    <TodayProvider clock={systemClock}>
      <Today />
    </TodayProvider>,
  );
}

const shown = (): string | null => screen.getByTestId('today').textContent;

/** The page's visibility as the browser reports it. */
function setVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
}

describe('TodayProvider', () => {
  it('moves to the new day at 23:59:59 plus one second', () => {
    useFakeTime('2026-10-26T23:59:59');
    renderToday();
    expect(shown()).toBe('2026-10-26');
    act(() => advance(999));
    expect(shown()).toBe('2026-10-26');
    act(() => advance(1));
    expect(shown()).toBe('2026-10-27');
  });

  it('arms the timer again for the night after', () => {
    useFakeTime('2026-10-26T23:59:59');
    renderToday();
    act(() => advance(1000));
    act(() => advance(24 * 60 * 60 * 1000));
    expect(shown()).toBe('2026-10-28');
  });

  it('turns over at midnight after a 23-hour day', () => {
    // New York skips 02:00 on 8 March 2026, so that day has 23 hours.
    useFakeTime('2026-03-08T00:00:00');
    renderToday();
    act(() => advance(23 * 60 * 60 * 1000 - 1));
    expect(shown()).toBe('2026-03-08');
    act(() => advance(1));
    expect(shown()).toBe('2026-03-09');
  });

  it('checks the date again when the page becomes visible after a date change', () => {
    useFakeTime('2026-10-26T21:00:00');
    renderToday();
    // The device slept through midnight: the clock moved, the timer has not fired.
    vi.setSystemTime(new Date('2026-10-27T07:30:00'));
    expect(shown()).toBe('2026-10-26');

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shown()).toBe('2026-10-27');
  });

  it('checks the date again when the page is shown from the back-forward cache', () => {
    useFakeTime('2026-10-26T21:00:00');
    renderToday();
    vi.setSystemTime(new Date('2026-10-28T09:00:00'));
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(shown()).toBe('2026-10-28');
  });

  it('waits while the page is hidden', () => {
    useFakeTime('2026-10-26T21:00:00');
    renderToday();
    vi.setSystemTime(new Date('2026-10-27T07:30:00'));
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shown()).toBe('2026-10-26');
  });

  it('stops its timer when unmounted', () => {
    useFakeTime('2026-10-26T21:00:00');
    const { unmount } = renderToday();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('needs a TodayProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useToday())).toThrow(/TodayProvider/);
  });
});
