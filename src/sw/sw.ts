/**
 * Platewise's service worker (architecture §4 row 14). The build emits this file as `sw.js` next
 * to `index.html` (the plugin in vite.config.ts), with no imports and no exports in its output,
 * so it runs as a classic worker. What it does:
 *
 * - install: stores the app shell of this build (the list the plugin writes in) in one cache
 *   named after the build's version, fetched past the HTTP cache. It never takes over by itself.
 * - activate: deletes every other `platewise-` cache and takes control of open pages.
 * - fetch: a same-origin file of the shell or of the build's hashed assets folder comes from the
 *   cache first; a page navigation goes to the network first, with the stored `index.html` when
 *   the network fails (the page is stored again only when the cache lost it). Every other request, and every request to another origin (AI providers,
 *   Open Food Facts, FoodData Central, a local model server), is left alone: never answered from
 *   or written to a cache.
 * - message: `skipWaiting()` only when a page asks, after the person pressed Reload (P09-17).
 */

/** Every cache the app owns starts with this (`OWNED_PREFIX` in src/data/wipe.ts). */
export const CACHE_PREFIX = 'platewise-';

/** What a page posts to let a waiting worker take over (`swRegistration.ts` sends it). */
export const SKIP_WAITING = 'platewise:skip-waiting';

/** What the build writes into the worker: see `readBuild`. */
export interface ShellBuild {
  /** Changes whenever any shell file changes; names the cache. */
  readonly version: string;
  /** The shell's files, relative to the worker's folder: `index.html`, `assets/index-….js`. */
  readonly files: readonly string[];
  /** The build's folder of content-hashed files, relative to the worker's folder. */
  readonly assetsDir: string;
}

/** The parts of a lifecycle event the worker uses. */
export interface LifecycleEvent {
  waitUntil(promise: Promise<unknown>): void;
}

/** The parts of a fetch event the worker uses. */
export interface RequestEvent extends LifecycleEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

/** The parts of a message event the worker uses. */
export interface PageMessageEvent extends LifecycleEvent {
  readonly data: unknown;
}

interface WorkerEvents {
  install: LifecycleEvent;
  activate: LifecycleEvent;
  fetch: RequestEvent;
  message: PageMessageEvent;
}

/** What the worker uses of its global scope; tests hand in a fake. */
export interface WorkerScope {
  readonly location: { readonly href: string; readonly origin: string };
  readonly caches: CacheStorage;
  readonly clients: { claim(): Promise<void> };
  fetch(request: Request): Promise<Response>;
  skipWaiting(): Promise<void>;
  addEventListener<K extends keyof WorkerEvents>(
    type: K,
    listener: (event: WorkerEvents[K]) => void,
  ): void;
}

/** The cache one build's shell lives in. */
export function cacheNameFor(version: string): string {
  return `${CACHE_PREFIX}shell-${version}`;
}

/** Reads the build the plugin wrote in; throws when it is missing or malformed. */
export function readBuild(text: string): ShellBuild {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Platewise worker: the build list was not written in');
  }
  const build = value as Partial<ShellBuild> | null;
  const valid =
    typeof build === 'object' &&
    build !== null &&
    typeof build.version === 'string' &&
    build.version !== '' &&
    typeof build.assetsDir === 'string' &&
    Array.isArray(build.files) &&
    build.files.every((file) => typeof file === 'string' && file !== '');
  if (!valid) throw new Error('Platewise worker: the build list is malformed');
  return build as ShellBuild;
}

/** True for the page's go-ahead message. */
function isSkipWaiting(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null && (data as { type?: unknown }).type === SKIP_WAITING
  );
}

/**
 * How a stored file is looked up. A server may answer `Vary: Origin` (Vite's preview does), and a
 * page's module scripts are requested with an Origin header the worker's own install requests
 * lack; the shell's files are the same for every origin, so the header is not compared.
 */
const LOOKUP: CacheQueryOptions = { ignoreVary: true };

/** The address without its fragment, as Cache Storage compares them. */
function withoutHash(url: URL): string {
  return url.href.slice(0, url.href.length - url.hash.length);
}

/** Puts the worker's listeners on `scope` for one build. */
export function startWorker(scope: WorkerScope, build: ShellBuild): void {
  const cacheName = cacheNameFor(build.version);
  const shellUrls = build.files.map((file) => new URL(file, scope.location.href));
  const shellSet = new Set(shellUrls.map(withoutHash));
  const indexUrl = new URL('index.html', scope.location.href).href;
  const assetsPath = new URL(`${build.assetsDir.replace(/\/+$/, '')}/`, scope.location.href)
    .pathname;

  const precache = async (): Promise<void> => {
    // Every file first, then the cache: a file the server no longer has fails the install,
    // and the worker already running keeps serving its own complete cache.
    const fetched = await Promise.all(
      shellUrls.map(async (url) => {
        const request = new Request(url.href, { cache: 'reload' });
        const response = await scope.fetch(request);
        if (!response.ok) {
          throw new Error(`Platewise worker: ${url.pathname} answered ${response.status}`);
        }
        // A host may redirect (index.html → ./); a navigation must not be answered with a
        // redirected response, so the body is kept without that mark.
        if (response.redirected) {
          return { request, response: new Response(await response.blob(), response) };
        }
        return { request, response };
      }),
    );
    const cache = await scope.caches.open(cacheName);
    await Promise.all(fetched.map(({ request, response }) => cache.put(request, response)));
  };

  const dropOldCaches = async (): Promise<void> => {
    const names = await scope.caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName)
        .map((name) => scope.caches.delete(name)),
    );
    await scope.clients.claim();
  };

  const cacheFirst = async (event: RequestEvent): Promise<Response> => {
    const cache = await scope.caches.open(cacheName);
    const kept = await cache.match(event.request, LOOKUP);
    if (kept) return kept;
    const response = await scope.fetch(event.request);
    // Only a plain success is kept (an opaque answer is never ok); the page gets whatever came.
    if (response.ok && !response.redirected) {
      event.waitUntil(cache.put(event.request, response.clone()));
    }
    return response;
  };

  const restoreShell = async (page: Response): Promise<void> => {
    const cache = await scope.caches.open(cacheName);
    if (!(await cache.match(indexUrl, LOOKUP))) await cache.put(indexUrl, page);
  };

  const networkFirst = async (event: RequestEvent): Promise<Response> => {
    let response: Response;
    try {
      response = await scope.fetch(event.request);
    } catch (error) {
      const cache = await scope.caches.open(cacheName);
      const shell = await cache.match(indexUrl, LOOKUP);
      if (shell) return shell;
      throw error;
    }
    // The stored page stays the one whose scripts this version holds. It is only put back when
    // the cache lost it (Erase everything deletes the app's caches), so offline opens again.
    if (response.ok && !response.redirected) event.waitUntil(restoreShell(response.clone()));
    return response;
  };

  scope.addEventListener('install', (event) => {
    event.waitUntil(precache());
  });

  scope.addEventListener('activate', (event) => {
    event.waitUntil(dropOldCaches());
  });

  scope.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== scope.location.origin) return;
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(event));
      return;
    }
    if (shellSet.has(withoutHash(url)) || url.pathname.startsWith(assetsPath)) {
      event.respondWith(cacheFirst(event));
    }
  });

  scope.addEventListener('message', (event) => {
    if (isSkipWaiting(event.data)) event.waitUntil(scope.skipWaiting());
  });
}

// The plugin in vite.config.ts replaces this literal with the build's JSON; it stays as it is in
// tests, where nothing below runs.
const BUILD_TEXT = '__PLATEWISE_SW_BUILD__';

if (typeof ServiceWorkerGlobalScope === 'function' && self instanceof ServiceWorkerGlobalScope) {
  // The real scope has more than the parts named in WorkerScope, with the browser's own types.
  startWorker(self as unknown as WorkerScope, readBuild(BUILD_TEXT));
}
