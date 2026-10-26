import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, inTimeZone, useFakeTime } from '../test/time';
import { TodayProvider, useToday } from './TodayProvider';

afterEach(cleanup);

function ShowToday() {
  return <p data-testid="today">{useToday()}</p>;
}

function shownDay(): string | null {
  return screen.getByTestId('today').textContent;
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

afterEach(() => {
  // Back to jsdom's own getter.
  delete (document as { visibilityState?: unknown }).visibilityState;
});

function renderToday() {
  return render(
    <TodayProvider>
      <ShowToday />
    </TodayProvider>,
  );
}

describe('TodayProvider', () => {
  it('moves to the new day one second after 23:59:59 (ACC-A11-1, R05.14)', () => {
    useFakeTime('2026-10-26T23:59:59');
    renderToday();
    expect(shownDay()).toBe('2026-10-26');
    act(() => advance(999));
    expect(shownDay()).toBe('2026-10-26');
    act(() => advance(1));
    expect(shownDay()).toBe('2026-10-27');
  });

  it('keeps moving at every following midnight', () => {
    useFakeTime('2026-10-26T23:00:00');
    renderToday();
    act(() => advance(60 * 60 * 1000));
    expect(shownDay()).toBe('2026-10-27');
    act(() => advance(24 * 60 * 60 * 1000));
    expect(shownDay()).toBe('2026-10-28');
  });

  it('finds the midnight after a 25-hour day when the clocks go back', () => {
    // New York leaves daylight saving on 2026-11-01: that day lasts 25 hours.
    useFakeTime('2026-11-01T00:00:00');
    renderToday();
    act(() => advance(24 * 60 * 60 * 1000));
    expect(shownDay()).toBe('2026-11-01');
    act(() => advance(60 * 60 * 1000));
    expect(shownDay()).toBe('2026-11-02');
  });

  it('updates on visibilitychange after the date changed while timers were asleep', () => {
    useFakeTime('2026-10-26T22:00:00');
    renderToday();
    // The device slept: the clock moved on, but no timer ran.
    vi.setSystemTime(new Date('2026-10-27T07:30:00'));
    expect(shownDay()).toBe('2026-10-26');
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shownDay()).toBe('2026-10-26');
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(shownDay()).toBe('2026-10-27');
  });

  it('updates when the page is shown again from the back-forward cache', () => {
    useFakeTime('2026-10-26T22:00:00');
    renderToday();
    vi.setSystemTime(new Date('2026-10-28T09:00:00'));
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(shownDay()).toBe('2026-10-28');
  });

  it('follows the local day of the zone it runs in', () => {
    inTimeZone('Asia/Tokyo', () => {
      useFakeTime(Date.UTC(2026, 9, 26, 15, 30));
      renderToday();
      expect(shownDay()).toBe('2026-10-27');
    });
  });

  it('leaves no timer or listener behind when it unmounts', () => {
    useFakeTime('2026-10-26T12:00:00');
    const view = renderToday();
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refuses to be read without a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ShowToday />)).toThrow(/TodayProvider/);
  });
});
