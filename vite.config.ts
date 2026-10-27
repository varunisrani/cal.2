/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { CREDIT_SOURCE, readCredit, writeNotices } from './scripts/notices.js';

/** The product root: this file's folder. */
const ROOT = dirname(fileURLToPath(import.meta.url));

/** The service worker's source, and its file at the root of the build (its address and scope). */
const WORKER_SOURCE = 'src/sw/sw.ts';
const WORKER_FILE = 'sw.js';
/** The placeholder literal in sw.ts, with whatever quotes the minifier gave it. */
const BUILD_LITERAL = /(["'`])__PLATEWISE_SW_BUILD__\1/g;
/**
 * Build files the shell never needs: source maps, Vite's manifest, and the barcode decoder's
 * WebAssembly, which the worker keeps the first time a scan fetches it.
 */
const NOT_SHELL = /\.map$|^\.vite\/|\.wasm$/;
/** The CSP meta of index.html (P09-18). */
const CSP_META = /\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i;

/** Every file under `dir`, as `/`-separated paths relative to it; dot files left out. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? filesUnder(dir, path) : [path];
    });
}

/**
 * Our own service-worker build (P09-17): emits src/sw/sw.ts as `sw.js`, then writes into it the
 * app shell's file list (every output file but the ones above, plus `public/`) and a version
 * hashed from those files' names and bytes, so any change to the app changes the worker and the
 * browser sees an update. In `vite dev` it only takes the CSP meta out of index.html: the dev
 * server injects an inline script and `<style>` tags the policy forbids.
 */
function platewiseWorker(): Plugin[] {
  let publicDir = '';
  let assetsDir = 'assets';
  return [
    {
      name: 'platewise:worker',
      apply: 'build',
      enforce: 'post',
      configResolved(config) {
        publicDir = config.publicDir;
        assetsDir = config.build.assetsDir;
      },
      buildStart() {
        // Its own entry, never imported by the app: nothing of it reaches the initial JS.
        this.emitFile({
          type: 'chunk',
          id: WORKER_SOURCE,
          fileName: WORKER_FILE,
          preserveSignature: false,
        });
      },
      generateBundle(_options, bundle) {
        const worker = bundle[WORKER_FILE];
        if (!worker || worker.type !== 'chunk') return this.error(`${WORKER_FILE} was not built`);
        if (worker.imports.length + worker.dynamicImports.length + worker.exports.length > 0) {
          return this.error(`${WORKER_FILE} must stand alone: no imports, no exports`);
        }
        const shell: Array<[file: string, bytes: string | Uint8Array]> = [];
        for (const output of Object.values(bundle)) {
          if (output.fileName === WORKER_FILE || NOT_SHELL.test(output.fileName)) continue;
          shell.push([output.fileName, output.type === 'chunk' ? output.code : output.source]);
        }
        for (const file of publicDir ? filesUnder(publicDir) : []) {
          shell.push([file, readFileSync(join(publicDir, file))]);
        }
        shell.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const hash = createHash('sha256');
        for (const [file, bytes] of shell) {
          hash.update(file).update('\0').update(bytes).update('\0');
        }
        const build = {
          version: hash.digest('hex').slice(0, 16),
          files: shell.map(([file]) => file),
          assetsDir,
        };
        const found = worker.code.match(BUILD_LITERAL)?.length ?? 0;
        if (found !== 1) {
          return this.error(`${WORKER_FILE}: expected one build placeholder, found ${found}`);
        }
        // A JS string holding the JSON: the worker reads it with readBuild.
        worker.code = worker.code.replace(BUILD_LITERAL, () =>
          JSON.stringify(JSON.stringify(build)),
        );
      },
    },
    {
      name: 'platewise:dev-without-csp',
      apply: 'serve',
      transformIndexHtml: (html) => html.replace(CSP_META, ''),
    },
  ];
}

/**
 * P09-16, P10-14: refreshes src/generated/notices.json (the credits page's list of third-party
 * licences) and the runtime-dependencies section of THIRD_PARTY_NOTICES.md from the installed
 * packages at the start of every build, before anything reads them.
 */
function platewiseNotices(): Plugin {
  return {
    name: 'platewise:notices',
    apply: 'build',
    buildStart() {
      writeNotices(ROOT);
    },
  };
}

/** This build's version, from package.json. */
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

export default defineConfig({
  plugins: [react(), platewiseWorker(), platewiseNotices()],
  // P09-16: build constants, typed in src/config/constants.d.ts and read through src/config. The
  // credit is read out of THIRD_PARTY_NOTICES.md, so product code never names that app.
  define: {
    __PLATEWISE_VERSION__: JSON.stringify(VERSION),
    __PLATEWISE_CREDIT__: JSON.stringify(
      readCredit(readFileSync(join(ROOT, CREDIT_SOURCE), 'utf8')),
    ),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // dist/.vite/manifest.json, read by scripts/bundle-budget.ts.
    manifest: true,
  },
  test: {
    environment: 'jsdom',
    // A zone with DST, so day and hour maths meet both offsets; other zones via inTimeZone().
    env: { TZ: 'America/New_York' },
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'tooling/**/*.test.ts',
      'scripts/**/*.test.ts',
      // Node-side tests of the fake AI server; each file sets its environment in a comment.
      'e2e/fake-ai/**/*.test.ts',
    ],
    restoreMocks: true,
  },
});
