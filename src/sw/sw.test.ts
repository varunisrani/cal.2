import { describe, expect, it, vi } from 'vitest';
import { SKIP_WAITING_MESSAGE } from '../app/swRegistration';
import { OWNED_PREFIX } from '../data/wipe';
import {
  CACHE_PREFIX,
  cacheNameFor,
  readBuild,
  SKIP_WAITING,
  startWorker,
  type LifecycleEvent,
  type PageMessageEvent,
  type RequestEvent,
  type ShellBuild,
  type WorkerScope,
} from './sw';

const ORIGIN = 'https://platewise.test';

const BUILD: ShellBuild = {
  version: 'v2',
  files: ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'icons/icon-192.png'],
  assetsDir: 'assets',
};

/** What the fake server holds: path → body. */
const SITE: Record<string, string> = {
  '/index.html': '<html>shell v2</html>',
  '/assets/index-abc.js': 'console.log("app")',
  '/assets/index-abc.css': 'body{}',
  '/icons/icon-192.png': 'png',
  '/assets/zxing_reader-xyz.wasm': 'wasm',
};

/**
 * Cache Storage in memory, keyed like the browser's: by address without the fragment. Like the
 * browser it honours `Vary: Origin` unless asked to ignore Vary.
 */
function fakeCaches() {
  interface Entry {
    readonly response: Response;
    readonly origin: string | null;
  }
  const store = new Map<string, Map<string, Entry>>();
  const keyOf = (request: RequestInfo | URL): string => {
    const url = new URL(
      typeof request === 'string' || request instanceof URL ? request : request.url,
    );
    url.hash = '';
    return url.href;
  };
  const originOf = (request: RequestInfo | URL): string | null =>
    typeof request === 'string' || request instanceof URL ? null : request.headers.get('origin');
  const cacheFor = (entries: Map<string, Entry>) => ({
    async match(request: RequestInfo | URL, options?: CacheQueryOptions) {
      const entry = entries.get(keyOf(request));
      if (!entry) return undefined;
      const variesByOrigin = /\borigin\b/i.test(entry.response.headers.get('vary') ?? '');
      if (variesByOrigin && !options?.ignoreVary && originOf(request) !== entry.origin) {
        return undefined;
      }
      return entry.response.clone();
    },
    async put(request: RequestInfo | URL, response: Response) {
      entries.set(keyOf(request), { response, origin: originOf(request) });
    },
    has: (url: string) => entries.has(url),
    text: (url: string) => entries.get(url)!.response.clone().text(),
  });
  const caches = {
    open: vi.fn(async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      return cacheFor(store.get(name)!);
    }),
    keys: vi.fn(async () => [...store.keys()]),
    delete: vi.fn(async (name: string) => store.delete(name)),
    has: async (name: string) => store.has(name),
  };
  /** The cache `name` as the test sees it: what it holds, by address. */
  const peek = (name: string) => {
    const entries = store.get(name);
    return entries ? cacheFor(entries) : undefined;
  };
  return { caches, store, peek };
}

type Listeners = { [K in 'install' | 'activate' | 'fetch' | 'message']?: (event: never) => void };

/** A worker scope at https://platewise.test/sw.js with a fake network and Cache Storage. */
function setUp({
  online = true,
  site = SITE,
}: { online?: boolean; site?: Record<string, string> } = {}) {
  const listeners: Listeners = {};
  const { caches, store, peek } = fakeCaches();
  const network = { online };
  const fetch = vi.fn(async (request: Request) => {
    if (!network.online) throw new TypeError('Failed to fetch');
    const url = new URL(request.url);
    const body = url.origin === ORIGIN ? site[url.pathname] : undefined;
    // Like Vite's preview server, every answer varies by Origin.
    const headers = { Vary: 'Origin' };
    return body === undefined
      ? new Response('missing', { status: 404, headers })
      : new Response(body, { status: 200, headers });
  });
  const scope = {
    location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
    caches: caches as unknown as CacheStorage,
    clients: { claim: vi.fn(async () => undefined) },
    fetch,
    skipWaiting: vi.fn(async () => undefined),
    addEventListener(type: keyof Listeners, listener: (event: never) => void) {
      listeners[type] = listener;
    },
  } satisfies WorkerScope;
  startWorker(scope, BUILD);

  /** Fires a lifecycle event and waits for what it asked the browser to wait for. */
  const lifecycle = async (type: 'install' | 'activate'): Promise<void> => {
    const pending: Promise<unknown>[] = [];
    const event: LifecycleEvent = { waitUntil: (promise) => void pending.push(promise) };
    (listeners[type] as (event: LifecycleEvent) => void)(event);
    await Promise.all(pending);
  };

  /** Fires a fetch event: the worker's answer, or `undefined` when it left the request alone. */
  const request = async (input: Request): Promise<Response | undefined> => {
    const pending: Promise<unknown>[] = [];
    let answer: Promise<Response> | undefined;
    const event: RequestEvent = {
      request: input,
      respondWith: (response) => {
        answer = response;
      },
      waitUntil: (promise) => void pending.push(promise),
    };
    (listeners.fetch as (event: RequestEvent) => void)(event);
    if (!answer) return undefined;
    const response = await answer;
    await Promise.all(pending);
    return response;
  };

  const message = (data: unknown): Promise<unknown[]> => {
    const pending: Promise<unknown>[] = [];
    const event: PageMessageEvent = { data, waitUntil: (promise) => void pending.push(promise) };
    (listeners.message as (event: PageMessageEvent) => void)(event);
    return Promise.all(pending);
  };

  return { scope, fetch, caches, store, peek, network, lifecycle, request, message };
}

/** A request from the page, as a module script's: CORS mode, with an Origin header. */
function fromPage(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, { mode: 'cors', headers: { Origin: ORIGIN }, ...init });
}

/** A page navigation (a Request cannot be built with mode `navigate` outside a browser). */
function navigation(path: string): Request {
  return { url: `${ORIGIN}${path}`, method: 'GET', mode: 'navigate' } as Request;
}

const shellCache = cacheNameFor(BUILD.version);

describe('install', () => {
  it('stores every shell file in the cache of its version, past the HTTP cache, and waits', async () => {
    const worker = setUp();
    await worker.lifecycle('install');

    expect([...worker.store.keys()]).toEqual([shellCache]);
    expect([...worker.store.get(shellCache)!.keys()].sort()).toEqual(
      BUILD.files.map((file) => `${ORIGIN}/${file}`).sort(),
    );
    const requested = worker.fetch.mock.calls.map(([request]) => [request.url, request.cache]);
    expect(requested).toHaveLength(BUILD.files.length);
    for (const [, cache] of requested) expect(cache).toBe('reload');
    // A new version never takes over by itself.
    expect(worker.scope.skipWaiting).not.toHaveBeenCalled();
  });

  it('fails without caching anything when a shell file is missing on the server', async () => {
    const site = { ...SITE };
    delete site['/assets/index-abc.css'];
    const worker = setUp({ site });

    await expect(worker.lifecycle('install')).rejects.toThrow('index-abc.css answered 404');
    expect(worker.store.size).toBe(0);
  });

  it('keeps a page the host redirected to without the redirect mark', async () => {
    const worker = setUp();
    worker.fetch.mockImplementation(async (request: Request) => {
      const body = SITE[new URL(request.url).pathname] ?? '';
      const response = new Response(body, { status: 200 });
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    });
    await worker.lifecycle('install');

    const kept = (await worker.peek(shellCache)!.match(`${ORIGIN}/index.html`))!;
    expect(kept.redirected).toBe(false);
    expect(await kept.text()).toBe(SITE['/index.html']);
  });
});

describe('activate', () => {
  it('deletes the other platewise- caches, keeps the current one and others, and takes control', async () => {
    const worker = setUp();
    await worker.caches.open(cacheNameFor('v1'));
    await worker.caches.open(`${CACHE_PREFIX}shell-v0`);
    await worker.caches.open(shellCache);
    await worker.caches.open('someone-else');

    await worker.lifecycle('activate');

    expect([...worker.store.keys()].sort()).toEqual([shellCache, 'someone-else']);
    expect(worker.scope.clients.claim).toHaveBeenCalledTimes(1);
  });
});

describe('fetch', () => {
  it.each([
    ['Gemini', 'https://generativelanguage.googleapis.com/v1beta/models/m:generateContent', 'POST'],
    ['Gemini (GET)', 'https://generativelanguage.googleapis.com/v1beta/models', 'GET'],
    ['Open Food Facts', 'https://world.openfoodfacts.org/api/v2/product/737628064502', 'GET'],
    ['FoodData Central', 'https://api.nal.usda.gov/fdc/v1/foods/search?query=x', 'GET'],
    ['a local Ollama', 'http://localhost:11434/v1/chat/completions', 'POST'],
    ['another host, at a path of our shell', 'https://cdn.example.test/assets/index-abc.js', 'GET'],
  ])('leaves a request to %s alone: no answer, no cache (ACC-L2-2)', async (_name, url, method) => {
    const worker = setUp();
    await worker.lifecycle('install');
    worker.fetch.mockClear();
    worker.caches.open.mockClear();

    const body = method === 'POST' ? '{}' : undefined;
    expect(await worker.request(new Request(url, { method, body }))).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it('leaves same-origin requests outside the shell alone, and every non-GET one', async () => {
    const worker = setUp();
    await worker.lifecycle('install');

    expect(await worker.request(new Request(`${ORIGIN}/version.json`))).toBeUndefined();
    const post = new Request(`${ORIGIN}/assets/index-abc.js`, { method: 'POST', body: 'x' });
    expect(await worker.request(post)).toBeUndefined();
  });

  it('serves a shell file from the cache without the network, whatever Origin it varies by', async () => {
    const worker = setUp();
    await worker.lifecycle('install');
    worker.fetch.mockClear();
    worker.network.online = false;

    // The page's module script carries an Origin header the install requests had not.
    const response = await worker.request(fromPage('/assets/index-abc.js'));
    expect(await response?.text()).toBe(SITE['/assets/index-abc.js']);
    const icon = await worker.request(new Request(`${ORIGIN}/icons/icon-192.png#x`));
    expect(await icon?.text()).toBe('png');
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it('fetches a build asset missing from the cache once, then keeps it', async () => {
    const worker = setUp();
    await worker.lifecycle('install');
    worker.fetch.mockClear();
    const wasm = `${ORIGIN}/assets/zxing_reader-xyz.wasm`;

    expect(await (await worker.request(fromPage(wasm.slice(ORIGIN.length))))?.text()).toBe('wasm');
    worker.network.online = false;
    expect(await (await worker.request(new Request(wasm)))?.text()).toBe('wasm');
    expect(worker.fetch).toHaveBeenCalledTimes(1);
  });

  it('passes an error answer on without keeping it', async () => {
    const worker = setUp();
    await worker.lifecycle('install');
    const missing = `${ORIGIN}/assets/gone-123.js`;

    expect((await worker.request(new Request(missing)))?.status).toBe(404);
    expect(worker.peek(shellCache)!.has(missing)).toBe(false);
  });

  it('answers a navigation from the network when it can, keeping the stored page', async () => {
    const worker = setUp({ site: { ...SITE, '/': '<html>shell v3</html>' } });
    await worker.lifecycle('install');

    const response = await worker.request(navigation('/'));
    expect(await response?.text()).toBe('<html>shell v3</html>');
    expect(await worker.peek(shellCache)!.text(`${ORIGIN}/index.html`)).toBe(SITE['/index.html']);
    expect(worker.peek(shellCache)!.has(`${ORIGIN}/`)).toBe(false);
  });

  it('puts the page back when its cache lost it, so offline opens again', async () => {
    const worker = setUp({ site: { ...SITE, '/': '<html>shell v2, served at /</html>' } });
    await worker.lifecycle('install');
    // Erase everything deletes every cache the app owns.
    await worker.caches.delete(shellCache);

    await worker.request(navigation('/'));
    worker.network.online = false;
    const response = await worker.request(navigation('/'));
    expect(await response?.text()).toBe('<html>shell v2, served at /</html>');
  });

  it('answers a navigation offline with the cached shell', async () => {
    const worker = setUp();
    await worker.lifecycle('install');
    worker.network.online = false;

    const response = await worker.request(navigation('/#/settings/units'));
    expect(await response?.text()).toBe(SITE['/index.html']);
  });

  it('fails an offline navigation as the browser would when no shell is cached yet', async () => {
    const worker = setUp({ online: false });

    await expect(worker.request(navigation('/'))).rejects.toThrow('Failed to fetch');
  });
});

describe('message', () => {
  it('skips waiting only when a page asks', async () => {
    const worker = setUp();

    await worker.message({ type: 'something-else' });
    await worker.message('platewise:skip-waiting');
    expect(worker.scope.skipWaiting).not.toHaveBeenCalled();

    await worker.message({ type: SKIP_WAITING });
    expect(worker.scope.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe('readBuild', () => {
  it('reads the list the build writes in', () => {
    expect(readBuild(JSON.stringify(BUILD))).toEqual(BUILD);
  });

  it.each([
    ['the placeholder, never replaced', '__PLATEWISE_SW_BUILD__'],
    ['no version', JSON.stringify({ ...BUILD, version: '' })],
    ['a file that is not a name', JSON.stringify({ ...BUILD, files: ['index.html', 3] })],
    ['no assets folder', JSON.stringify({ version: 'v', files: [] })],
    ['null', 'null'],
  ])('refuses %s', (_name, text) => {
    expect(() => readBuild(text)).toThrow(/Platewise worker/);
  });
});

describe('constants shared with the page', () => {
  it('match the page message and the prefix of owned caches', () => {
    expect(SKIP_WAITING_MESSAGE).toEqual({ type: SKIP_WAITING });
    expect(CACHE_PREFIX).toBe(OWNED_PREFIX);
    expect(cacheNameFor('abc')).toBe(`${OWNED_PREFIX}shell-abc`);
  });
});
