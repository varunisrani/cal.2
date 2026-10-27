import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppStateContext, createAppState, type AppStateStore } from '../../app/appState';
import { TodayProvider } from '../../app/TodayProvider';
import { fixedClock, systemClock, type Clock } from '../../lib/clock';
import { ServicesProvider, type Services } from '../../services/context';
import { FACTORY_NOW } from '../../test/factories';
import { advance, useFakeTime } from '../../test/time';
import { useSelectedDay } from './useSelectedDay';

/** Monday 26 October 2026, 12:30:41.250 in New York. */
const NOW = FACTORY_NOW + 41_250;

function servicesWith(clock: Clock): Services {
  return {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    clock,
  };
}

/** The hook over `store` (a fresh start of the app by default), as Home calls it. */
function renderSelection(
  store: AppStateStore = createAppState(),
  clock: Clock = fixedClock(NOW, 'America/New_York'),
) {
  const services = servicesWith(clock);
  const wrapper = ({ children }: { children?: ReactNode }) =>
    createElement(
      ServicesProvider,
      { services },
      createElement(
        AppStateContext.Provider,
        { value: store },
        createElement(TodayProvider, { clock }, children),
      ),
    );
  return { store, ...renderHook(() => useSelectedDay(), { wrapper }) };
}

describe('useSelectedDay', () => {
  it('shows today when nothing is picked', () => {
    const { result } = renderSelection();
    expect(result.current).toMatchObject({ day: '2026-10-26', today: '2026-10-26', isToday: true });
  });

  it('shows a picked day and keeps it in the shared state, where the review reads it', () => {
    const { result, store } = renderSelection();
    act(() => result.current.select('2026-10-25'));
    expect(result.current).toMatchObject({ day: '2026-10-25', isToday: false });
    expect(store.getSnapshot().selectedDay).toBe('2026-10-25');
  });

  it('follows today again when today or a later day is picked', () => {
    const { result, store } = renderSelection(createAppState({ selectedDay: '2026-10-19' }));
    expect(result.current.day).toBe('2026-10-19');
    act(() => result.current.select('2026-10-26'));
    expect(store.getSnapshot().selectedDay).toBeNull();
    act(() => result.current.select('2026-10-19'));
    act(() => result.current.select('2026-10-27'));
    expect(store.getSnapshot().selectedDay).toBeNull();
    expect(result.current.day).toBe('2026-10-26');
  });

  it('goes back to today on reset, as a way in from outside does', () => {
    const { result, store } = renderSelection(createAppState({ selectedDay: '2026-10-19' }));
    act(() => result.current.reset());
    expect(store.getSnapshot().selectedDay).toBeNull();
    expect(result.current.isToday).toBe(true);
  });

  it('stamps today at now and another day at the current clock time (P01-02 stampForDay)', () => {
    const { result } = renderSelection();
    expect(result.current.stamp()).toBe(NOW);
    act(() => result.current.select('2026-10-25'));
    expect(result.current.stamp()).toBe(Date.parse('2026-10-25T12:30:41.250-04:00'));
    act(() => result.current.select('2026-03-01'));
    // Before the clocks went forward: the same wall-clock time, another offset.
    expect(result.current.stamp()).toBe(Date.parse('2026-03-01T12:30:41.250-05:00'));
  });

  it('moves on with today at midnight when today is shown, and keeps a picked day', () => {
    useFakeTime('2026-10-26T23:59:59');
    const shown = renderSelection(createAppState(), systemClock);
    const picked = renderSelection(createAppState({ selectedDay: '2026-10-20' }), systemClock);
    act(() => advance(1_000));
    expect(shown.result.current).toMatchObject({ day: '2026-10-27', isToday: true });
    expect(picked.result.current).toMatchObject({ day: '2026-10-20', today: '2026-10-27' });
  });

  it('opens on today after a fresh start, and keeps the day when Home is opened again', () => {
    const store = createAppState();
    const first = renderSelection(store);
    act(() => first.result.current.select('2026-10-22'));
    first.unmount();

    // Another tab and back: the same app state.
    expect(renderSelection(store).result.current.day).toBe('2026-10-22');
    // A reload: a new app state.
    expect(renderSelection().result.current.day).toBe('2026-10-26');
  });
});
