/**
 * The app's own hash router (architecture §4 row 6): routes in the URL hash, a stack of sheets
 * above the current screen, and a memory per tab.
 *
 * History shape. Home is the bottom of the app's history: leaving Home pushes an entry, moving
 * between two other tabs replaces it, and choosing Home steps back to the Home entry. Nested
 * Settings pages are pushed over their tab, and each open sheet owns one entry over the screen it
 * covers. So the browser Back closes the top sheet first, then walks up a nested page, then goes
 * to Home, then leaves the app. Every entry carries a small record in `history.state` saying how
 * it got there; that is what lets a tab switch step back over the right number of entries.
 */

export const TABS = ['home', 'progress', 'coach', 'settings'] as const;

export type TabId = (typeof TABS)[number];

export interface TabRoute {
  readonly kind: 'tab';
  readonly tab: TabId;
  /** Path segments below the tab: `['units']` for `#/settings/units`. Only Settings has them. */
  readonly nested: readonly string[];
}

export interface OnboardingRoute {
  readonly kind: 'onboarding';
}

export type Route = TabRoute | OnboardingRoute;

export function tabRoute(tab: TabId, ...nested: string[]): TabRoute {
  return { kind: 'tab', tab, nested };
}

export const HOME_ROUTE: TabRoute = tabRoute('home');
export const ONBOARDING_ROUTE: OnboardingRoute = { kind: 'onboarding' };

/** How many segments each tab takes below it: `#/settings/<page>/<sub>`. */
const NESTING: Readonly<Record<TabId, number>> = { home: 0, progress: 0, coach: 0, settings: 2 };

/** A page id: lower-case words joined by single hyphens (`tab-bar`, `units`). */
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

/**
 * The route a hash names, or `null` when it names none (unknown tab, bad segment, too deep). An
 * empty hash is Home; one trailing slash is allowed.
 */
export function parseHash(hash: string): Route | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  if (body === '' || body === '/') return HOME_ROUTE;
  if (!body.startsWith('/')) return null;
  const parts = body.slice(1).split('/');
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  const [head, ...nested] = parts;
  if (head === 'onboarding') return nested.length === 0 ? ONBOARDING_ROUTE : null;
  if (!isTabId(head)) return null;
  if (nested.length > NESTING[head] || !nested.every((part) => SEGMENT.test(part))) return null;
  return tabRoute(head, ...nested);
}

/** The canonical hash of a route: `#/home`, `#/settings/units`. */
export function routeHash(route: Route): string {
  const parts = route.kind === 'onboarding' ? ['onboarding'] : [route.tab, ...route.nested];
  return `#/${parts.join('/')}`;
}

export function sameRoute(a: Route, b: Route): boolean {
  return routeHash(a) === routeHash(b);
}

/** The part of the browser the router uses; `windowHost()` is the real one. */
export interface HistoryHost {
  hash(): string;
  state(): unknown;
  /** How many entries the session history holds (`history.length`). */
  length(): number;
  push(state: unknown, hash: string): void;
  replace(state: unknown, hash: string): void;
  go(delta: number): void;
  /** Calls `onMove` when the person moves through history or edits the hash. Returns a stop. */
  listen(onMove: () => void): () => void;
  scrollY(): number;
  scrollTo(y: number): void;
}

/** The real browser: `location.hash`, `history` and the window's scroll. */
export function windowHost(win: Window = window): HistoryHost {
  return {
    hash: () => win.location.hash,
    state: () => win.history.state as unknown,
    length: () => win.history.length,
    push: (state, hash) => win.history.pushState(state, '', hash),
    replace: (state, hash) => win.history.replaceState(state, '', hash),
    go: (delta) => win.history.go(delta),
    listen(onMove) {
      // The router puts each tab's scroll back itself; the browser's own restoration would
      // scroll the page before the new screen is drawn.
      const before = win.history.scrollRestoration;
      win.history.scrollRestoration = 'manual';
      win.addEventListener('popstate', onMove);
      win.addEventListener('hashchange', onMove);
      return () => {
        win.removeEventListener('popstate', onMove);
        win.removeEventListener('hashchange', onMove);
        win.history.scrollRestoration = before;
      };
    },
    scrollY: () => win.scrollY,
    scrollTo: (y) => win.scrollTo(0, y),
  };
}

export interface RouterState {
  readonly route: Route;
  /** Open sheets, bottom first. */
  readonly sheets: readonly string[];
}

export interface NavigateOptions {
  /** Replace the current entry instead of adding one (redirects). */
  readonly replace?: boolean;
}

export interface Router {
  current(): RouterState;
  subscribe(onChange: () => void): () => void;
  /** Starts following the browser's history; returns the stop. */
  start(): () => void;
  /** Goes to `route`; a different tab is entered as a tab switch. */
  navigate(route: Route, options?: NavigateOptions): void;
  /** What a tap on a tab does, re-tap rules included. */
  selectTab(tab: TabId): void;
  /** Opens a sheet above the current screen; a sheet already open stays as it is. */
  openSheet(id: string): void;
  /** Closes the sheet `id` and every sheet above it, or the top sheet without an id. */
  closeSheet(id?: string): void;
  /** Applies the scroll the last route change asked for; call it once the screen is drawn. */
  applyScroll(): void;
  /** The route the tab showed last (its root if it was never shown). */
  lastRoute(tab: TabId): TabRoute;
}

/** What an entry of the app's history records about itself. */
interface EntryRecord {
  readonly sheets: readonly string[];
  /** Entries pushed over this tab's first entry (nested pages). */
  readonly depth: number;
  /** This tab visit was pushed directly over a Home entry. */
  readonly overHome: boolean;
  /** The page's scroll when a nested page was pushed over this entry. */
  readonly scroll?: number;
  /** The address of the page this nested page was pushed over (going up to it steps back). */
  readonly from?: string;
}

const STATE_KEY = 'platewise';

const FRESH: EntryRecord = { sheets: [], depth: 0, overHome: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads an entry's record, or `null` when it carries none of ours; bad fields read as fresh. */
function readRecord(state: unknown): EntryRecord | null {
  const raw = isRecord(state) ? state[STATE_KEY] : undefined;
  if (!isRecord(raw)) return null;
  const sheets = Array.isArray(raw.sheets)
    ? raw.sheets.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];
  const depth = typeof raw.depth === 'number' && Number.isInteger(raw.depth) ? raw.depth : 0;
  const scroll = typeof raw.scroll === 'number' && raw.scroll >= 0 ? raw.scroll : undefined;
  const from = typeof raw.from === 'string' ? raw.from : undefined;
  return {
    sheets,
    depth: Math.max(0, depth),
    overHome: raw.overHome === true,
    ...(scroll === undefined ? {} : { scroll }),
    ...(from === undefined ? {} : { from }),
  };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function commonStart(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < a.length && i < b.length && a[i] === b[i]; i += 1) out.push(a[i] as string);
  return out;
}

export function createRouter(host: HistoryHost): Router {
  const listeners = new Set<() => void>();
  const memory = new Map<TabId, { route: TabRoute; scroll: number }>();
  let pendingScroll: number | null = null;
  /** What to do once a `go()` has landed; `null` when no step back is under way. */
  let onLanded: (() => void) | null = null;

  const record = (): EntryRecord => readRecord(host.state()) ?? FRESH;
  const write = (mode: 'push' | 'replace', route: Route, entry: EntryRecord): void => {
    host[mode]({ [STATE_KEY]: entry }, routeHash(route));
  };

  const remember = (route: Route): void => {
    if (route.kind !== 'tab') return;
    memory.set(route.tab, { route, scroll: memory.get(route.tab)?.scroll ?? 0 });
  };
  const keepScrollOf = (route: Route): void => {
    if (route.kind !== 'tab') return;
    memory.set(route.tab, { route: memory.get(route.tab)?.route ?? route, scroll: host.scrollY() });
  };
  const savedScroll = (tab: TabId): number => memory.get(tab)?.scroll ?? 0;
  const lastRoute = (tab: TabId): TabRoute => memory.get(tab)?.route ?? tabRoute(tab);

  /** Reads the entry on screen, rewriting it when it is unknown, not canonical or stale. */
  const settle = (previous: RouterState | null): RouterState => {
    const parsed = parseHash(host.hash());
    const route = parsed ?? HOME_ROUTE;
    const stored = parsed ? readRecord(host.state()) : null;
    const entry = stored ?? FRESH;
    // Sheets never come back by themselves (after a reload or a forward step their content is
    // gone): an entry keeps only the sheets that are open on the same screen right now.
    const sheets =
      previous && sameRoute(previous.route, route)
        ? commonStart(entry.sheets, previous.sheets)
        : [];
    if (!stored || routeHash(route) !== host.hash() || !sameList(sheets, entry.sheets)) {
      write('replace', route, { ...entry, sheets });
    }
    return { route, sheets };
  };

  let state: RouterState = settle(null);
  remember(state.route);

  const commit = (route: Route, sheets: readonly string[], scroll: number | null): void => {
    remember(route);
    if (scroll !== null) pendingScroll = scroll;
    if (sameRoute(state.route, route) && sameList(state.sheets, sheets)) return;
    state = { route, sheets };
    for (const listener of [...listeners]) listener();
  };

  /** Steps back `steps` entries, then runs `then` (at once when there is nothing to step over). */
  const stepBack = (steps: number, then: () => void): void => {
    if (steps <= 0 || steps > host.length() - 1) {
      then();
      return;
    }
    onLanded = then;
    host.go(-steps);
  };

  /** The person moved through history (Back, Forward, an edited address). */
  const arrive = (): void => {
    const before = state;
    const next = settle(before);
    let scroll: number | null = null;
    if (!sameRoute(before.route, next.route)) {
      const sameTab =
        before.route.kind === 'tab' &&
        next.route.kind === 'tab' &&
        before.route.tab === next.route.tab;
      if (sameTab) scroll = record().scroll ?? 0;
      else {
        keepScrollOf(before.route);
        scroll = next.route.kind === 'tab' ? savedScroll(next.route.tab) : 0;
      }
    }
    commit(next.route, next.sheets, scroll);
  };

  const onMove = (): void => {
    const then = onLanded;
    onLanded = null;
    (then ?? arrive)();
  };

  /** After stepping back: make sure the entry shows `route`, then show it. */
  const land = (
    route: Route,
    scroll: (entry: EntryRecord) => number,
    entry?: EntryRecord,
  ): void => {
    const here = record();
    const next = entry ?? { ...here, sheets: [] };
    const shown = parseHash(host.hash());
    if (entry || !shown || !sameRoute(shown, route) || here.sheets.length > 0) {
      write('replace', route, next);
    }
    commit(route, [], scroll(here));
  };

  const switchTab = (to: TabRoute): void => {
    const from = state.route;
    if (from.kind !== 'tab') return;
    keepScrollOf(from);
    const here = record();
    const unwind = state.sheets.length + here.depth;
    const restore = (): number => savedScroll(to.tab);
    if (to.tab === 'home') {
      if (here.overHome) stepBack(unwind + 1, () => land(HOME_ROUTE, restore));
      else stepBack(unwind, () => land(HOME_ROUTE, restore, FRESH));
      return;
    }
    const overHome = from.tab === 'home' || here.overHome;
    stepBack(unwind, () => {
      const root = tabRoute(to.tab);
      write(from.tab === 'home' ? 'push' : 'replace', root, { ...FRESH, overHome });
      if (to.nested.length > 0) write('push', to, { sheets: [], depth: 1, overHome });
      commit(to, [], restore());
    });
  };

  const navigate = (to: Route, options: NavigateOptions = {}): void => {
    const from = state.route;
    const open = state.sheets.length;
    if (options.replace || from.kind === 'onboarding' || to.kind === 'onboarding') {
      const sameTab = from.kind === 'tab' && to.kind === 'tab' && from.tab === to.tab;
      keepScrollOf(from);
      stepBack(open, () => {
        const entry = sameTab ? { ...record(), sheets: [] } : FRESH;
        write('replace', to, entry);
        const scroll = to.kind === 'tab' && !sameTab ? savedScroll(to.tab) : 0;
        commit(to, [], sameRoute(from, to) ? null : scroll);
      });
      return;
    }
    if (from.kind !== 'tab' || to.kind !== 'tab') return;
    if (from.tab !== to.tab) {
      switchTab(to);
      return;
    }
    if (sameRoute(from, to)) {
      stepBack(open, arrive);
      return;
    }
    if (to.nested.length === 0) {
      // Up to the tab's first page: step back over the nested pages instead of adding one.
      stepBack(open + record().depth, () => land(to, (entry) => entry.scroll ?? 0));
      return;
    }
    if (open === 0 && record().from === routeHash(to)) {
      // Up to the page this one was opened from (a Settings sub-page's parent): step back to it.
      stepBack(1, () => land(to, (entry) => entry.scroll ?? 0));
      return;
    }
    stepBack(open, () => {
      const here = record();
      write('replace', from, { ...here, sheets: [], scroll: host.scrollY() });
      write('push', to, {
        sheets: [],
        depth: here.depth + 1,
        overHome: here.overHome,
        from: routeHash(from),
      });
      commit(to, [], 0);
    });
  };

  return {
    current: () => state,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    start() {
      const stop = host.listen(onMove);
      // Catch up with anything that moved before the router was listening.
      arrive();
      return () => {
        stop();
        onLanded = null;
      };
    },
    navigate,
    selectTab(tab) {
      const from = state.route;
      if (from.kind !== 'tab') return;
      if (tab !== from.tab) {
        switchTab(lastRoute(tab));
        return;
      }
      // Re-tapping Settings anywhere inside Settings goes back to its hub; any other re-tap
      // does nothing.
      if (tab === 'settings' && from.nested.length > 0) navigate(tabRoute('settings'));
    },
    openSheet(id) {
      if (id === '') throw new TypeError('openSheet: a sheet needs an id');
      if (state.sheets.includes(id)) return;
      const sheets = [...state.sheets, id];
      const here = record();
      write('push', state.route, { sheets, depth: here.depth, overHome: here.overHome });
      commit(state.route, sheets, null);
    },
    closeSheet(id) {
      const index = id === undefined ? state.sheets.length - 1 : state.sheets.indexOf(id);
      if (index < 0) return;
      const steps = state.sheets.length - index;
      // The sheet goes at once; the history catches up when the step back lands.
      commit(state.route, state.sheets.slice(0, index), null);
      stepBack(steps, arrive);
    },
    applyScroll() {
      if (pendingScroll === null) return;
      const y = pendingScroll;
      pendingScroll = null;
      host.scrollTo(y);
    },
    lastRoute,
  };
}
