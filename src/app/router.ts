// The app's addresses live in the URL hash, so the app works on any static host and offline.
//
// The browser history is kept equal to the route's trail (`trailOf`) plus one entry per open
// sheet. Every move walks back to the deepest entry the old and new trails share and pushes the
// rest, so Back from a tab lands on Home, Back from a Settings page goes up one level, and Back
// with sheets open closes the top sheet first. Sheets are in memory; their entries carry only a
// count in `history.state`, which is how Back knows how many are left.

/** The tabs of the bar, in their fixed order. */
export const TAB_IDS = ['home', 'progress', 'coach', 'settings'] as const;
export type TabId = (typeof TAB_IDS)[number];

export type Route =
  | { readonly name: 'home' | 'progress' | 'coach' | 'onboarding' }
  | { readonly name: 'settings'; readonly page?: string; readonly sub?: string };

export const HOME_ROUTE: Route = Object.freeze({ name: 'home' });

/** A Settings page or sub-page name: lower-case letters and digits, words joined by hyphens. */
const PAGE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The route a hash names, or null for anything that is not one of ours. */
export function parseRoute(hash: string): Route | null {
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!path.startsWith('/')) return null;
  const parts = path.slice(1).split('/');
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  const [name, page, sub, ...more] = parts;
  switch (name) {
    case 'home':
    case 'progress':
    case 'coach':
    case 'onboarding':
      return parts.length === 1 ? { name } : null;
    case 'settings': {
      if (more.length > 0) return null;
      if (page === undefined) return { name };
      if (!PAGE_NAME.test(page)) return null;
      if (sub === undefined) return { name, page };
      return PAGE_NAME.test(sub) ? { name, page, sub } : null;
    }
    default:
      return null;
  }
}

/** The hash of a route, e.g. `#/settings/units`. */
export function routeHash(route: Route): string {
  if (route.name !== 'settings' || route.page === undefined) return `#/${route.name}`;
  return route.sub === undefined
    ? `#/settings/${route.page}`
    : `#/settings/${route.page}/${route.sub}`;
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}

/** The tab a route belongs to; onboarding belongs to none. */
export function tabOf(route: Route): TabId | null {
  return route.name === 'onboarding' ? null : route.name;
}

/**
 * The stack under a route, bottom first, ending with the route: Home under every other tab,
 * the Settings hub under its pages. Onboarding stands alone, so Back from it leaves the app.
 */
export function trailOf(route: Route): readonly Route[] {
  switch (route.name) {
    case 'home':
    case 'onboarding':
      return [route];
    case 'progress':
    case 'coach':
      return [HOME_ROUTE, route];
    case 'settings': {
      const trail: Route[] = [HOME_ROUTE, { name: 'settings' }];
      if (route.page !== undefined) trail.push({ name: 'settings', page: route.page });
      if (route.sub !== undefined) trail.push(route);
      return trail;
    }
  }
}

export interface RouterState {
  readonly route: Route;
  /** Ids of the open sheets, bottom first. */
  readonly sheets: readonly string[];
}

export interface Router {
  current(): RouterState;
  /** Calls `listener` after every change of `current()`. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
  /** Shows `route` fresh (scrolled to the top); open sheets close first. */
  navigate(route: Route): void;
  /** Shows a tab at the address it last showed, scrolled where it was left. */
  showTab(tab: TabId): void;
  /** Opens a sheet over the current screen; Back closes it. Opening an open sheet does nothing. */
  openSheet(id: string): void;
  /** Closes the top sheet, or the sheet `id` and every sheet above it. */
  closeSheet(id?: string): void;
  /**
   * How to read the scroll position of the screen on show (the shell's content area). It is read
   * at the moment a screen is left, so a shorter next screen cannot clip the remembered value.
   */
  setScrollReader(read: (() => number) | null): void;
  /** How far a screen was scrolled when it was last left; 0 for a fresh one. */
  scrollOf(route: Route): number;
  /** Stops listening to the browser. */
  stop(): void;
}

/** What a router needs of `window`. */
export type RouterWindow = Pick<
  Window,
  'history' | 'location' | 'addEventListener' | 'removeEventListener'
>;

/** The key of our mark in `history.state`. */
const MARK = 'platewise';

interface EntryMark {
  /** How many sheets were open when this entry was current. */
  readonly sheets: number;
}

function markOf(state: unknown): EntryMark | null {
  if (typeof state !== 'object' || state === null) return null;
  const mark = (state as Record<string, unknown>)[MARK];
  if (typeof mark !== 'object' || mark === null) return null;
  const sheets = (mark as Record<string, unknown>).sheets;
  return Number.isInteger(sheets) && (sheets as number) >= 0 ? { sheets: sheets as number } : null;
}

function sharedLength(a: readonly Route[], b: readonly Route[]): number {
  let n = 0;
  while (n < a.length && n < b.length && sameRoute(a[n] as Route, b[n] as Route)) n += 1;
  return n;
}

/** A router on `win`'s history; it starts listening at once. */
export function createRouter(win: RouterWindow = window): Router {
  const listeners = new Set<() => void>();
  const lastByTab = new Map<TabId, Route>();
  const scrolls = new Map<string, number>();
  /** Runs once the `history.go()` under way has landed. */
  let afterTraversal: (() => void) | null = null;
  /** Commands that came in while a traversal was under way. */
  const waiting: (() => void)[] = [];
  let readScroll: (() => number) | null = null;
  let state: RouterState;

  const publish = (next: RouterState): void => {
    if (readScroll && !sameRoute(next.route, state.route)) {
      scrolls.set(routeHash(state.route), readScroll());
    }
    state = next;
    const tab = tabOf(next.route);
    if (tab !== null) lastByTab.set(tab, next.route);
    for (const listener of [...listeners]) listener();
  };

  const write = (how: 'push' | 'replace', route: Route, sheets: number): void => {
    const mark = { [MARK]: { sheets } };
    if (how === 'push') win.history.pushState(mark, '', routeHash(route));
    else win.history.replaceState(mark, '', routeHash(route));
  };

  /** Moves `delta` entries through history, then runs `then` (at once when delta is 0). */
  const travel = (delta: number, then: () => void = () => {}): void => {
    if (delta === 0) {
      then();
      return;
    }
    afterTraversal = then;
    win.history.go(delta);
  };

  /** Rebuilds the history for `route` on the current entry: its trail, bottom entry replaced. */
  const plant = (route: Route): void => {
    trailOf(route).forEach((step, i) => write(i === 0 ? 'replace' : 'push', step, 0));
  };

  const whenSettled = (command: () => void): void => {
    if (afterTraversal) waiting.push(command);
    else command();
  };

  const go = (target: Route, fresh: boolean): void => {
    const here = state;
    if (sameRoute(here.route, target) && here.sheets.length === 0) return;
    const from = trailOf(here.route);
    const to = trailOf(target);
    const shared = sharedLength(from, to);
    const at = from.length - 1 + here.sheets.length;
    // Nothing shared (onboarding ↔ the tabs): walk to the bottom entry and replace it.
    const landing = Math.max(shared, 1) - 1;
    const rest = shared === 0 ? to : to.slice(shared);
    if (fresh) for (const step of rest) scrolls.delete(routeHash(step));
    publish({ route: target, sheets: [] });
    travel(landing - at, () => {
      rest.forEach((step, i) => write(shared === 0 && i === 0 ? 'replace' : 'push', step, 0));
    });
  };

  /** The person moved through history (Back, Forward, a typed address). */
  const onMove = (): void => {
    if (afterTraversal) {
      const then = afterTraversal;
      afterTraversal = null;
      then();
      while (!afterTraversal && waiting.length > 0) waiting.shift()?.();
      return;
    }
    const route = parseRoute(win.location.hash);
    const mark = markOf(win.history.state);
    if (route === null || mark === null) {
      // An address typed or linked into this page: take it over with a trail of our own.
      const target = route ?? HOME_ROUTE;
      plant(target);
      publish({ route: target, sheets: [] });
      return;
    }
    const same = sameRoute(route, state.route);
    if (same && mark.sheets <= state.sheets.length) {
      if (mark.sheets < state.sheets.length) {
        publish({ route: state.route, sheets: state.sheets.slice(0, mark.sheets) });
      }
      return;
    }
    // An entry of a sheet that is no longer open (Forward, or a reload): step back to its screen.
    const kept = same ? state.sheets.length : 0;
    if (mark.sheets > kept) travel(kept - mark.sheets);
    if (!same) publish({ route, sheets: [] });
  };

  /** Fragment changes also fire popstate first; this catches browsers that do not. */
  const onHashChange = (): void => {
    if (!afterTraversal && win.location.hash !== routeHash(state.route)) onMove();
  };

  // Start: take over the entry the page was opened on.
  const opened = parseRoute(win.location.hash);
  const openedMark = markOf(win.history.state);
  if (opened !== null && openedMark !== null) {
    state = { route: opened, sheets: [] };
    if (openedMark.sheets > 0) travel(-openedMark.sheets);
  } else {
    const route = opened ?? HOME_ROUTE;
    plant(route);
    state = { route, sheets: [] };
  }
  const startTab = tabOf(state.route);
  if (startTab !== null) lastByTab.set(startTab, state.route);

  win.addEventListener('popstate', onMove);
  win.addEventListener('hashchange', onHashChange);

  return {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate: (route) => whenSettled(() => go(route, true)),
    showTab: (tab) => whenSettled(() => go(lastByTab.get(tab) ?? { name: tab }, false)),
    openSheet: (id) =>
      whenSettled(() => {
        if (state.sheets.includes(id)) return;
        const sheets = [...state.sheets, id];
        write('push', state.route, sheets.length);
        publish({ route: state.route, sheets });
      }),
    closeSheet: (id) =>
      whenSettled(() => {
        const from = id === undefined ? state.sheets.length - 1 : state.sheets.indexOf(id);
        if (from < 0) return;
        const closing = state.sheets.length - from;
        publish({ route: state.route, sheets: state.sheets.slice(0, from) });
        travel(-closing);
      }),
    setScrollReader: (read) => {
      readScroll = read;
    },
    scrollOf: (route) => scrolls.get(routeHash(route)) ?? 0,
    stop() {
      win.removeEventListener('popstate', onMove);
      win.removeEventListener('hashchange', onHashChange);
      listeners.clear();
    },
  };
}

let shared: Router | null = null;

/** The page's router, created on first use. */
export function appRouter(): Router {
  shared ??= createRouter(window);
  return shared;
}
