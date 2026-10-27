/**
 * The browser side of the live provider check (P10-12). It serves the built app (`dist/`, built
 * with Vite's build API first when there is none) on 127.0.0.1 and a free port, opens Chromium
 * from Playwright on the app's root page with its CSP in force, and loads `page.ts` there: Vite
 * bundles it in memory into one classic script, and the script is answered from an address on
 * the app's own origin, because the CSP runs no inline script. Each check is one `page.evaluate`
 * call; a key enters the page only as that call's argument, never in an address, a file or a log.
 */
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import type { CheckResult, LiveCheck } from './page';

/** The global the bundle defines; its `run` is `page.ts`'s export. */
export const LIVE_GLOBAL = 'platewiseLiveCheck';
/** The address on the app's origin that answers with the bundle; nothing else serves it. */
export const LIVE_SCRIPT_PATH = '/__platewise-live-check.js';

const PAGE_ENTRY = 'scripts/ai-live-check/page.ts';
const HOST = '127.0.0.1';

/** A page of the built app with the check loaded. */
export interface LiveSession {
  /** Where the app is served, e.g. `http://127.0.0.1:41234`. */
  readonly origin: string;
  readonly browser: string;
  run(check: LiveCheck): Promise<CheckResult>;
  close(): Promise<void>;
}

interface LiveGlobal {
  run(check: LiveCheck): Promise<CheckResult>;
}

/** Leaves `dist/` as it is when it holds a build; otherwise runs Vite's build into it. */
async function builtApp(productRoot: string, log: (line: string) => void): Promise<void> {
  if (existsSync(join(productRoot, 'dist', 'index.html'))) return;
  log('dist/ holds no build: building the app with Vite.');
  await build({ root: productRoot, logLevel: 'silent' });
}

/** `page.ts` and everything it imports as one classic script, kept in memory. */
async function pageScript(productRoot: string): Promise<string> {
  const output = await build({
    configFile: false,
    root: productRoot,
    logLevel: 'silent',
    publicDir: false,
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
      target: 'es2022',
      lib: {
        entry: join(productRoot, PAGE_ENTRY),
        formats: ['iife'],
        name: LIVE_GLOBAL,
        fileName: () => 'live-check.js',
      },
    },
  });
  for (const result of Array.isArray(output) ? output : [output]) {
    if (!('output' in result)) continue;
    for (const file of result.output) {
      if (file.type === 'chunk' && file.isEntry) return file.code;
    }
  }
  throw new Error(`bundling ${PAGE_ENTRY} gave no script`);
}

async function serve(productRoot: string): Promise<{ server: PreviewServer; origin: string }> {
  const server = await preview({
    configFile: false,
    root: productRoot,
    logLevel: 'silent',
    // Any free port: a running preview, e2e or probe server is left alone.
    preview: { host: HOST, port: 0, strictPort: true, open: false },
  });
  const address = server.httpServer.address() as AddressInfo | string | null;
  if (address === null || typeof address === 'string') {
    await server.close();
    throw new Error('the preview server has no TCP address');
  }
  return { server, origin: `http://${HOST}:${address.port}` };
}

export async function openLiveSession(
  productRoot: string,
  log: (line: string) => void,
): Promise<LiveSession> {
  await builtApp(productRoot, log);
  const script = await pageScript(productRoot);
  const { server, origin } = await serve(productRoot);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route(`${origin}${LIVE_SCRIPT_PATH}`, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: script }),
    );
    await page.goto(`${origin}/`);
    await page.addScriptTag({ url: LIVE_SCRIPT_PATH });
    const loaded = await page.evaluate(
      (name) => typeof (globalThis as Record<string, unknown>)[name] === 'object',
      LIVE_GLOBAL,
    );
    if (!loaded) throw new Error('the check script did not load in the page');

    const open = browser;
    return {
      origin,
      browser: `Chromium ${open.version()}`,
      // The app's own time limit ends every check; `evaluate` waits for it.
      async run(check) {
        return page.evaluate(
          ([name, input]) =>
            (globalThis as unknown as Record<string, LiveGlobal>)[name]!.run(input),
          [LIVE_GLOBAL, check] as const,
        );
      },
      async close() {
        try {
          await open.close();
        } finally {
          await server.close();
        }
      },
    };
  } catch (error) {
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    throw error;
  }
}
