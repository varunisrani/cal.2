import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { createRouter, HOME_ROUTE, type Router } from './router';
import { RouterContext, useRoute, useRouter, useSheet } from './useRoute';

function routerAt(hash: string): Router {
  window.history.replaceState(null, '', hash);
  const router = createRouter(window);
  onTestFinished(() => router.stop());
  return router;
}

function withRouter(router: Router) {
  return ({ children }: { children: ReactNode }) =>
    createElement(RouterContext.Provider, { value: router }, children);
}

function moved(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

afterEach(cleanup);

describe('useRoute', () => {
  it('gives the router from the context', () => {
    const router = routerAt('#/home');
    const { result } = renderHook(() => useRouter(), { wrapper: withRouter(router) });
    expect(result.current).toBe(router);
  });

  it('re-renders with the new route and parses page and sub-page', () => {
    const router = routerAt('#/home');
    const { result } = renderHook(() => useRoute(), { wrapper: withRouter(router) });
    expect(result.current.route).toEqual(HOME_ROUTE);
    act(() => result.current.navigate({ name: 'settings', page: 'units' }));
    expect(result.current.route).toEqual({ name: 'settings', page: 'units' });
    expect(window.location.hash).toBe('#/settings/units');
  });

  it('follows the browser Back button', async () => {
    const router = routerAt('#/home');
    const { result } = renderHook(() => useRoute(), { wrapper: withRouter(router) });
    act(() => result.current.showTab('coach'));
    expect(result.current.route).toEqual({ name: 'coach' });
    const done = moved();
    window.history.back();
    await act(() => done);
    expect(result.current.route).toEqual(HOME_ROUTE);
  });
});

describe('useSheet', () => {
  it('is open while its sheet is on the stack, and Back closes it', async () => {
    const router = routerAt('#/home');
    const { result } = renderHook(() => useSheet('manual'), { wrapper: withRouter(router) });
    expect(result.current.open).toBe(false);
    act(() => result.current.show());
    expect(result.current.open).toBe(true);
    const done = moved();
    window.history.back();
    await act(() => done);
    expect(result.current.open).toBe(false);
  });

  it('hides its sheet and removes its history entry', async () => {
    const router = routerAt('#/home');
    const { result } = renderHook(() => useSheet('manual'), { wrapper: withRouter(router) });
    act(() => result.current.show());
    const done = moved();
    act(() => result.current.hide());
    expect(result.current.open).toBe(false);
    await act(() => done);
    expect(router.current().sheets).toEqual([]);
  });
});
