import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Route, Router, RouterState } from './router';

const RouterContext = createContext<Router | null>(null);

export interface RouterProviderProps {
  readonly router: Router;
  readonly children?: ReactNode;
}

/**
 * Hands the router to the app, follows the browser's history while mounted, and applies the
 * scroll a route change asked for once the new screen has been drawn.
 */
export function RouterProvider({ router, children }: RouterProviderProps) {
  useEffect(() => router.start(), [router]);
  const state = useSyncExternalStore(router.subscribe, router.current);
  useLayoutEffect(() => {
    router.applyScroll();
  }, [router, state]);
  return createElement(RouterContext.Provider, { value: router }, children);
}

export function useRouter(): Router {
  const router = useContext(RouterContext);
  if (!router) throw new Error('useRouter: no RouterProvider above this component');
  return router;
}

/** The route and the open sheets; re-renders when either changes. */
export function useRouterState(): RouterState {
  const router = useRouter();
  return useSyncExternalStore(router.subscribe, router.current);
}

/** The route on screen. */
export function useRoute(): Route {
  return useRouterState().route;
}

/** The open sheets, bottom first. */
export function useSheets(): readonly string[] {
  return useRouterState().sheets;
}

export interface SheetControl {
  /** The sheet is on the stack (it may be under another one). */
  readonly open: boolean;
  /** Opens it with its own history entry, so Back closes it. */
  show(): void;
  /** Closes it (and anything opened above it); wire it to the Sheet's `onClose`. */
  close(): void;
}

/** One sheet on the stack: `<Sheet open={s.open} onClose={s.close} …>`. */
export function useSheet(id: string): SheetControl {
  const router = useRouter();
  const open = useSheets().includes(id);
  return useMemo(
    () => ({ open, show: () => router.openSheet(id), close: () => router.closeSheet(id) }),
    [router, id, open],
  );
}
