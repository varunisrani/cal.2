import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppStateContext, createAppState, useAppState } from './appState';

describe('createAppState', () => {
  it('starts with no overlay and today selected', () => {
    expect(createAppState().getSnapshot()).toEqual({ analysisOverlay: false, selectedDay: null });
  });

  it('raises and lowers the analysis overlay flag, telling listeners each time', () => {
    const store = createAppState();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setAnalysisOverlay(true);
    expect(store.getSnapshot().analysisOverlay).toBe(true);
    store.setAnalysisOverlay(false);
    expect(store.getSnapshot().analysisOverlay).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('holds a selected day and goes back to today with null', () => {
    const store = createAppState();
    store.selectDay('2026-10-24');
    expect(store.getSnapshot().selectedDay).toBe('2026-10-24');
    store.selectDay(null);
    expect(store.getSnapshot().selectedDay).toBeNull();
  });

  it('keeps the same snapshot and stays quiet when nothing changes', () => {
    const store = createAppState({ selectedDay: '2026-10-24' });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setAnalysisOverlay(false);
    store.selectDay('2026-10-24');
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops telling a listener that unsubscribed', () => {
    const store = createAppState();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    stop();
    store.setAnalysisOverlay(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('useAppState', () => {
  it('re-renders a component when the flag changes', () => {
    const store = createAppState();
    const wrapper = ({ children }: { children?: ReactNode }) =>
      createElement(AppStateContext.Provider, { value: store }, children);
    const { result } = renderHook(() => useAppState(), { wrapper });
    expect(result.current.analysisOverlay).toBe(false);
    act(() => store.setAnalysisOverlay(true));
    expect(result.current.analysisOverlay).toBe(true);
  });
});
