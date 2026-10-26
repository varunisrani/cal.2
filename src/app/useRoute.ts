// React bindings for the router: the current route and sheets, and the router's actions.

import { createContext, useContext, useSyncExternalStore } from 'react';
import { appRouter, type Router, type RouterState } from './router';

/** The router screens use; tests provide their own. Without a provider: the page's router. */
export const RouterContext = createContext<Router | null>(null);

export function useRouter(): Router {
  return useContext(RouterContext) ?? appRouter();
}

export type RouteView = RouterState &
  Pick<Router, 'navigate' | 'showTab' | 'openSheet' | 'closeSheet'>;

/** The route and open sheets, re-rendering on every change, with the router's actions. */
export function useRoute(): RouteView {
  const router = useRouter();
  const state = useSyncExternalStore(router.subscribe, router.current);
  return {
    ...state,
    navigate: router.navigate,
    showTab: router.showTab,
    openSheet: router.openSheet,
    closeSheet: router.closeSheet,
  };
}

export interface SheetControl {
  /** True while the sheet is on the stack; Back makes it false. */
  readonly open: boolean;
  show(): void;
  hide(): void;
}

/** One sheet's place on the stack: pass `open` and `hide` to the Sheet primitive. */
export function useSheet(id: string): SheetControl {
  const { sheets, openSheet, closeSheet } = useRoute();
  return {
    open: sheets.includes(id),
    show: () => openSheet(id),
    hide: () => closeSheet(id),
  };
}
