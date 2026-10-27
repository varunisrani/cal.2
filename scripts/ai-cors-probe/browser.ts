/**
 * The browser side of the CORS probe (P03-19): the built app served by Vite's preview server on
 * 127.0.0.1, Chromium from Playwright on its root page, and `page.ts` bundled by Vite's build API
 * in memory and added to that page as a script served from the app's own origin (its CSP refuses
 * inline scripts). Each request is one `page.evaluate` call: the key enters the page only as its
 * argument, never in an address, a file or a log line. Meanwhile the page's `requestfailed` and
 * `console` events for the request's address are kept as clues, so a CORS refusal can be told
 * from a proxy, DNS or TLS failure (the page itself sees one TypeError for all of them).
 */
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, type Browser, type ConsoleMessage, type Request } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import type { Attempt, NetworkClue, ProbeSession } from '../ai-cors-probe';
import type { PageOutcome, PageRequest } from './page';

/** The global the bundle defines; its `run` is `page.ts`'s export. */
export const PROBE_GLOBAL = 'platewiseCorsProbe';

const PAGE_ENTRY = 'scripts/ai-cors-probe/page.ts';
/** The address on the app's origin where the bundle is served (only the probe answers it). */
const PROBE_SCRIPT_PATH = '/__platewise-cors-probe.js';
const HOST = '127.0.0.1';
/** How long to wait for Chromium's failure event when the page saw no reply before it came. */
const CLUE_WAIT_MS = 1_000;

interface ProbeGlobal {
  run(request: PageRequest): Promise<PageOutcome>;
}

/** The built app: `dist/` as it is, or a fresh `vite build` when there is none. */
async function ensureAppBuilt(productRoot: string, log: (line: string) => void): Promise<void> {
  if (existsSync(join(productRoot, 'dist', 'index.html'))) return;
  log('dist/ has no build: building the app with Vite.');
  await build({ root: productRoot, logLevel: 'silent' });
}

/** `page.ts` and the app modules it imports, as one classic script, never written to disk. */
async function bundlePageScript(productRoot: string): Promise<string> {
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
        name: PROBE_GLOBAL,
        fileName: () => 'cors-probe.js',
      },
    },
  });
  const outputs = Array.isArray(output) ? output : [output];
  for (const result of outputs) {
    if (!('output' in result)) continue;
    const entry = result.output.find((file) => file.type === 'chunk' && file.isEntry);
    if (entry !== undefined && entry.type === 'chunk') return entry.code;
  }
  throw new Error(`bundling ${PAGE_ENTRY} gave no script`);
}

async function startPreview(
  productRoot: string,
): Promise<{ server: PreviewServer; origin: string }> {
  const server = await preview({
    configFile: false,
    root: productRoot,
    logLevel: 'silent',
    // Port 0: any free port, so a running `pnpm preview` or e2e server is not disturbed.
    preview: { host: HOST, port: 0, strictPort: true, open: false },
  });
  const address = server.httpServer.address() as AddressInfo | string | null;
  if (address === null || typeof address === 'string') {
    await server.close();
    throw new Error('the preview server has no TCP address');
  }
  return { server, origin: `http://${HOST}:${address.port}` };
}

export async function openSession(
  productRoot: string,
  log: (line: string) => void,
): Promise<ProbeSession> {
  await ensureAppBuilt(productRoot, log);
  const script = await bundlePageScript(productRoot);
  const { server, origin } = await startPreview(productRoot);
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    // The built app's CSP runs only scripts from its own origin, so the bundle is served there.
    await page.route(`${origin}${PROBE_SCRIPT_PATH}`, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: script }),
    );
    await page.goto(`${origin}/`);
    await page.addScriptTag({ url: PROBE_SCRIPT_PATH });
    const loaded = await page.evaluate(
      (name) => typeof (globalThis as Record<string, unknown>)[name] === 'object',
      PROBE_GLOBAL,
    );
    if (!loaded) throw new Error('the probe script did not load in the page');

    // The events of the request in flight; requests run one at a time.
    let failures: Request[] = [];
    let messages: ConsoleMessage[] = [];
    page.on('requestfailed', (request) => failures.push(request));
    page.on('console', (message) => messages.push(message));

    const clueFor = (url: string): NetworkClue => {
      const failed = failures.find((request) => request.url() === url);
      const cors = messages
        .map((message) => message.text())
        .find((text) => text.includes(url) && text.includes('CORS policy'));
      return {
        ...(failed?.failure()?.errorText === undefined
          ? {}
          : { errorText: failed.failure()!.errorText }),
        ...(cors === undefined ? {} : { corsMessage: cors }),
      };
    };

    const openBrowser = browser;
    return {
      origin,
      browser: `Chromium ${browser.version()}`,
      async send(request: PageRequest): Promise<Attempt> {
        failures = [];
        messages = [];
        const outcome = await page.evaluate(
          ([name, input]) =>
            (globalThis as unknown as Record<string, ProbeGlobal>)[name]!.run(input),
          [PROBE_GLOBAL, request] as const,
        );
        if (outcome.kind === 'noReply' && !failures.some((r) => r.url() === outcome.url)) {
          await page
            .waitForEvent('requestfailed', {
              predicate: (r) => r.url() === outcome.url,
              timeout: CLUE_WAIT_MS,
            })
            .catch(() => undefined);
        }
        return { outcome, clue: clueFor(outcome.url) };
      },
      async close(): Promise<void> {
        try {
          await openBrowser.close();
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
