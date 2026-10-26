import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRouter, HOME_ROUTE, routeHash, tabRoute, type Router } from './router';
import { memoryHost, type MemoryHost } from './testing/memoryHost';
import { RouterProvider, useRoute, useRouter, useRouterState, useSheet } from './useRoute';

function harness(initialHash: string): { host: MemoryHost; router: Router; wrapper: typeof Wrap } {
  const host = memoryHost(initialHash);
  const router = createRouter(host);
  function Wrap({ children }: { children?: ReactNode }) {
    return createElement(RouterProvider, { router }, children);
  }
  return { host, router, wrapper: Wrap };
}

describe('useRoute', () => {
  it('shows Home for an unknown address', () => {
    const { host, wrapper } = harness('#/somewhere/else');
    const { result } = renderHook(() => useRoute(), { wrapper });
    expect(result.current).toEqual(HOME_ROUTE);
    expect(host.hash()).toBe('#/home');
  });

  it('follows navigation and the browser Back', () => {
    const { host, router, wrapper } = harness('#/home');
    const { result } = renderHook(() => useRoute(), { wrapper });
    act(() => router.selectTab('settings'));
    act(() => router.navigate(tabRoute('settings', 'units')));
    expect(routeHash(result.current)).toBe('#/settings/units');
    act(() => host.back());
    expect(routeHash(result.current)).toBe('#/settings');
    act(() => host.back());
    expect(result.current).toEqual(HOME_ROUTE);
  });

  it('applies the tab scroll after the new screen is drawn', () => {
    const { host, router, wrapper } = harness('#/home');
    renderHook(() => useRoute(), { wrapper });
    host.setScroll(510);
    act(() => router.selectTab('progress'));
    expect(host.scrollY()).toBe(0);
    act(() => router.selectTab('home'));
    expect(host.scrollY()).toBe(510);
  });

  it('stops following the history when unmounted', () => {
    const { host, router, wrapper } = harness('#/home');
    const { unmount } = renderHook(() => useRoute(), { wrapper });
    act(() => router.selectTab('coach'));
    unmount();
    host.back();
    expect(routeHash(router.current().route)).toBe('#/coach');
  });

  it('needs a RouterProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useRouter())).toThrow(/RouterProvider/);
  });
});

describe('useSheet', () => {
  it('opens a sheet with its own history entry, and Back closes only the top one', () => {
    const { host, wrapper } = harness('#/home');
    const { result } = renderHook(
      () => ({ add: useSheet('add'), manual: useSheet('manual'), state: useRouterState() }),
      { wrapper },
    );
    act(() => result.current.add.show());
    act(() => result.current.manual.show());
    expect(result.current.add.open).toBe(true);
    expect(result.current.manual.open).toBe(true);
    expect(result.current.state.sheets).toEqual(['add', 'manual']);

    act(() => host.back());
    expect(result.current.manual.open).toBe(false);
    expect(result.current.add.open).toBe(true);

    act(() => result.current.add.close());
    expect(result.current.add.open).toBe(false);
    expect(host.entries().index).toBe(0);
  });

  it('keeps the same controls while nothing changes', () => {
    const { wrapper } = harness('#/home');
    const { result, rerender } = renderHook(() => useSheet('manual'), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
