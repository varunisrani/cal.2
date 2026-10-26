import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppStateContext, INITIAL_APP_STATE, createAppState, useAppState } from './appState';

afterEach(cleanup);

describe('createAppState', () => {
  it('starts with the overlay down and Home following today', () => {
    expect(createAppState().get()).toEqual({ analysisOverlay: false, selectedDay: null });
    expect(INITIAL_APP_STATE).toEqual({ analysisOverlay: false, selectedDay: null });
  });

  it('changes only the values it is given and tells its listeners', () => {
    const state = createAppState();
    let heard = 0;
    state.subscribe(() => {
      heard += 1;
    });
    state.set({ analysisOverlay: true });
    expect(state.get()).toEqual({ analysisOverlay: true, selectedDay: null });
    state.set({ selectedDay: '2026-10-25' });
    expect(state.get()).toEqual({ analysisOverlay: true, selectedDay: '2026-10-25' });
    expect(heard).toBe(2);
  });

  it('stays quiet when nothing really changed', () => {
    const state = createAppState();
    const before = state.get();
    let heard = 0;
    const stop = state.subscribe(() => {
      heard += 1;
    });
    state.set({ analysisOverlay: false });
    expect(state.get()).toBe(before);
    stop();
    state.set({ analysisOverlay: true });
    expect(heard).toBe(0);
  });
});

describe('useAppState', () => {
  it('re-renders with new values and sets them', () => {
    const state = createAppState();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AppStateContext.Provider, { value: state }, children);
    const { result } = renderHook(() => useAppState(), { wrapper });
    expect(result.current.analysisOverlay).toBe(false);
    act(() => result.current.set({ analysisOverlay: true }));
    expect(result.current.analysisOverlay).toBe(true);
    act(() => state.set({ analysisOverlay: false }));
    expect(result.current.analysisOverlay).toBe(false);
  });
});
