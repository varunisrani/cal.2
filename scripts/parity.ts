/**
 * The parity runner (P10-03, docs/plan/02-rea-workflow.md §4): `pnpm parity` builds the app,
 * serves `dist/` with `vite preview` on a fixed loopback port, starts the fake AI provider
 * (e2e/fake-ai) on its own port, and runs every `parity/*.platewise.json` through the real REA
 * CLI (`~/rea-lab/rea capture-browser-scenario`), one scenario and one browser at a time. REA's
 * Evidence for each run lands in `~/rea-lab/parity/platewise/`, outside the repository. A run
 * passes when REA completed every step and the page threw no uncaught error; the table names the
 * first step that did not complete. Only the processes this runner started are stopped, by PID,
 * and a last check says whether any of them is still alive.
 *
 * A scenario file is REA's own input (REA refuses unknown keys), written with canonical
 * addresses: the app at 127.0.0.1:4173, the fake AI at 127.0.0.1:4320, the machine's Chromium.
 * The runner writes a copy with this run's addresses and its browser wrapper; the file in the
 * repository is never changed. What a flow needs besides its file (the fake AI's replies, the
 * files to pick) is in FIXTURES below, keyed by the scenario's name.
 *
 * REA's launch mode takes no browser flags and has no file or routing action, so the browser it
 * launches is a small wrapper the runner writes: the machine's Chromium with one more DevTools
 * port on loopback. Through that port the runner's fixture desk answers the browser's file
 * chooser with the flow's files and answers Open Food Facts and FoodData Central from
 * e2e/fixtures; every other request that leaves loopback is refused. The desk never clicks or
 * reads the page: every step is REA's.
 *
 *   pnpm parity [--dry-run] [--only a,b] [--no-build] [--port 4173] [--ai-port 4320]
 *               [--out <dir>] [--rea <path>] [--browser <path>]
 *   pnpm parity --ledger    REA's obligation ledger over parity/ledger and the newest captures
 *
 * Exit code: 0 when every scenario passed, 1 when one failed, 2 when the run could not start.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { OFF_PRODUCT_URL } from '../src/services/barcode/off';
import { FDC_SEARCH_URL } from '../src/services/barcode/fdc';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PARITY_DIR = join(PRODUCT_ROOT, 'parity');
export const LEDGER_DIR = join(PARITY_DIR, 'ledger');
const FIXTURE_DIR = join(PRODUCT_ROOT, 'e2e', 'fixtures');

/** `<name>.platewise.json`: a scenario file. */
export const SCENARIO_SUFFIX = '.platewise.json';
/** The scenario whose `browser`, `environment` and `capture` blocks every other one repeats. */
export const TEMPLATE_SCENARIO = 'walking-skeleton';

/** The addresses and browser the scenario files are written with. */
export const CANONICAL = {
  app: 'http://127.0.0.1:4173',
  ai: 'http://127.0.0.1:4320',
  browser: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
} as const;

const LAB = join(homedir(), 'rea-lab');

export interface Options {
  readonly dryRun: boolean;
  readonly ledger: boolean;
  readonly build: boolean;
  /** Scenario names to run; all when empty. */
  readonly only: readonly string[];
  readonly port: number;
  readonly aiPort: number;
  readonly out: string;
  readonly rea: string;
  readonly browser: string;
}

export const DEFAULT_OPTIONS: Options = {
  dryRun: false,
  ledger: false,
  build: true,
  only: [],
  port: 4173,
  aiPort: 4320,
  out: join(LAB, 'parity', 'platewise'),
  rea: join(LAB, 'rea'),
  browser: CANONICAL.browser,
};

// ---- What each flow needs from the runner ------------------------------------------------------

/** A file the desk gives the browser's file chooser: one of ours, or a backup made for the run. */
export type PickedFile = { readonly fixture: string } | { readonly backup: true };

export interface Fixtures {
  /** Fake AI scripts (e2e/fake-ai/scripts), their replies joined in this order. */
  readonly ai: readonly string[];
  /** One file per file chooser the flow opens, in order. */
  readonly files: readonly PickedFile[];
}

const MEAL_PHOTO: PickedFile = { fixture: 'meal.jpg' };
const NO_FIXTURES: Fixtures = { ai: [], files: [] };

/** Every scenario's needs; a scenario file without an entry fails the static check. */
export const FIXTURES: Readonly<Record<string, Fixtures>> = {
  'walking-skeleton': NO_FIXTURES,
  onboarding: { ai: ['plan-ok'], files: [] },
  'log-manual': NO_FIXTURES,
  'log-photo': { ai: ['plan-ok', 'food-ok'], files: [MEAL_PHOTO] },
  'log-describe': { ai: ['plan-ok', 'food-ok'], files: [] },
  'log-barcode': { ai: ['plan-ok', 'food-ok'], files: [MEAL_PHOTO] },
  reuse: NO_FIXTURES,
  'edit-combine-copy': NO_FIXTURES,
  'water-fasting': NO_FIXTURES,
  'home-days': NO_FIXTURES,
  progress: NO_FIXTURES,
  coach: { ai: ['plan-ok', 'coach-tool', 'coach-slow'], files: [] },
  settings: NO_FIXTURES,
  data: { ai: [], files: [MEAL_PHOTO, { backup: true }] },
};

// ---- Arguments ---------------------------------------------------------------------------------

const PORT_FLAGS = { '--port': 'port', '--ai-port': 'aiPort' } as const;
const PATH_FLAGS = { '--out': 'out', '--rea': 'rea', '--browser': 'browser' } as const;

/** The options `argv` asks for, or the first problem with it. */
export function parseArgs(argv: readonly string[]): Options | { readonly problem: string } {
  const options: { -readonly [K in keyof Options]: Options[K] } = { ...DEFAULT_OPTIONS };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index] ?? '';
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--ledger') options.ledger = true;
    else if (flag === '--no-build') options.build = false;
    else if (flag === '--only' || flag in PORT_FLAGS || flag in PATH_FLAGS) {
      const value = argv[++index];
      if (value === undefined || value.startsWith('--'))
        return { problem: `${flag} needs a value` };
      if (flag === '--only') {
        options.only = value.split(',').map((name) => name.trim());
      } else if (flag in PORT_FLAGS) {
        const port = Number(value);
        if (!/^\d+$/.test(value) || port < 1 || port > 65_535) {
          return { problem: `${flag} must be a port number, not "${value}"` };
        }
        options[PORT_FLAGS[flag as keyof typeof PORT_FLAGS]] = port;
      } else {
        options[PATH_FLAGS[flag as keyof typeof PATH_FLAGS]] = resolve(value);
      }
    } else {
      return { problem: `unknown argument "${flag}"` };
    }
  }
  if (options.port === options.aiPort) return { problem: 'the app and the fake AI need two ports' };
  return options;
}

// ---- Scenario files ----------------------------------------------------------------------------

/** A scenario file as read: REA's input, kept as plain JSON. */
export type Scenario = Record<string, unknown>;

interface Step {
  readonly step_id?: unknown;
  readonly action?: unknown;
  readonly timeout_ms?: unknown;
  readonly locator?: unknown;
  readonly destination?: unknown;
}

/** The names of the scenario files in `dir`, sorted. */
export function scenarioNames(dir = PARITY_DIR): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(SCENARIO_SUFFIX))
    .map((file) => file.slice(0, -SCENARIO_SUFFIX.length))
    .sort();
}

export function readScenario(name: string, dir = PARITY_DIR): Scenario {
  return JSON.parse(readFileSync(join(dir, `${name}${SCENARIO_SUFFIX}`), 'utf8')) as Scenario;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The steps of a scenario; none when `actions` is not a list. */
export function stepsOf(scenario: Scenario): Step[] {
  return Array.isArray(scenario.actions) ? scenario.actions.filter(isRecord) : [];
}

/** A selector that starts at one of our hooks: `[data-ui="x"]`, `[data-ui^="x."]`, … */
const HOOK_SELECTOR = /^\[data-ui(?:[\^$*~|]?)="[^"]+"\]/;
const STEP_ID = /^[A-Za-z][A-Za-z0-9._-]*$/;
const SHARED_BLOCKS = ['browser', 'environment', 'capture', 'start_url'] as const;
const TOP_LEVEL = new Set(['browser', 'start_url', 'environment', 'actions', 'capture']);

/**
 * What is wrong with a scenario file, against the template's shared blocks: every step needs a
 * unique `step_id` and its own `timeout_ms`; every locator is a CSS selector that starts at a
 * `data-ui` hook; a `goto` stays on the app; no fixed sleeps; the browser, environment, capture
 * and start address are the template's; nothing REA would refuse at the top level.
 */
export function checkScenario(name: string, scenario: Scenario, template: Scenario): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(scenario)) {
    if (!TOP_LEVEL.has(key)) problems.push(`${name}: unexpected top-level key "${key}"`);
  }
  for (const block of SHARED_BLOCKS) {
    if (!isDeepStrictEqual(scenario[block], template[block])) {
      problems.push(`${name}: "${block}" differs from ${TEMPLATE_SCENARIO}'s`);
    }
  }
  const steps = stepsOf(scenario);
  if (!Array.isArray(scenario.actions) || steps.length === 0) problems.push(`${name}: no steps`);
  if (steps.length !== (Array.isArray(scenario.actions) ? scenario.actions.length : 0)) {
    problems.push(`${name}: a step is not an object`);
  }
  const seen = new Set<string>();
  steps.forEach((step, index) => {
    const id = typeof step.step_id === 'string' ? step.step_id : '';
    const where = `${name} step ${index + 1}${id ? ` (${id})` : ''}`;
    if (!STEP_ID.test(id)) problems.push(`${where}: no valid step_id`);
    else if (seen.has(id)) problems.push(`${where}: step_id used twice`);
    seen.add(id);
    const timeout = step.timeout_ms;
    if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 1) {
      problems.push(`${where}: no timeout_ms`);
    }
    if (step.action === 'wait_for_timeout') problems.push(`${where}: a fixed sleep`);
    if (step.locator !== undefined) {
      const locator = isRecord(step.locator) ? step.locator : {};
      const selector = typeof locator.selector === 'string' ? locator.selector : '';
      if (locator.kind !== 'css' || !HOOK_SELECTOR.test(selector)) {
        problems.push(`${where}: the locator must be a CSS selector that starts at a data-ui hook`);
      }
    }
    if (step.action === 'goto') {
      const url = isRecord(step.destination) ? step.destination.url : undefined;
      if (typeof url !== 'string' || !url.startsWith(`${CANONICAL.app}/`)) {
        problems.push(`${where}: a goto must stay on ${CANONICAL.app}`);
      }
    }
  });
  return problems;
}

/** Where this run serves the app and the fake AI, and the browser REA launches. */
export interface RunAddresses {
  readonly app: string;
  readonly ai: string;
  readonly browser: string;
}

function rewrite(value: unknown, addresses: RunAddresses): unknown {
  if (typeof value === 'string') {
    return value.split(CANONICAL.app).join(addresses.app).split(CANONICAL.ai).join(addresses.ai);
  }
  if (Array.isArray(value)) return value.map((item) => rewrite(item, addresses));
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewrite(item, addresses)]),
  );
}

/**
 * The scenario as this run gives it to REA: every canonical app and fake-AI address replaced by
 * this run's, and the browser set to `addresses.browser`. Nothing else changes.
 */
export function resolveScenario(scenario: Scenario, addresses: RunAddresses): Scenario {
  const resolved = rewrite(scenario, addresses) as Scenario;
  const browser = isRecord(resolved.browser) ? resolved.browser : {};
  return { ...resolved, browser: { ...browser, executable_path: addresses.browser } };
}

/** How long REA may take in all: every step's own limit, plus start-up and capture time. */
export function overallLimitMs(scenario: Scenario): number {
  const steps = stepsOf(scenario);
  const sum = steps.reduce((total, step) => total + Number(step.timeout_ms ?? 0), 0);
  return sum + 120_000;
}

// ---- The fake AI's replies ---------------------------------------------------------------------

export interface AiScript {
  readonly description: string;
  readonly replies: readonly unknown[];
}

/** The named scripts' replies joined in order, as one inline script for `POST /__script`. */
export function joinScripts(
  names: readonly string[],
  read: (name: string) => { readonly replies: readonly unknown[] },
): AiScript {
  return {
    description: `Parity replies: ${names.join(' + ') || 'none'}.`,
    replies: names.flatMap((name) => read(name).replies),
  };
}

// ---- REA's verdict -----------------------------------------------------------------------------

export interface Verdict {
  readonly pass: boolean;
  readonly evidenceId: string | null;
  /** Steps REA completed, the start included, and the steps it should have run. */
  readonly completed: number;
  readonly expected: number;
  /** The first step that did not complete, with REA's reason. */
  readonly failedStep: string | null;
  readonly reason: string | null;
  readonly pageErrors: readonly string[];
  readonly durationMs: number | null;
  /** Hosts off loopback the page asked for (routed fixtures included). */
  readonly hosts: readonly string[];
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function hostOf(url: unknown): string | null {
  const raw = isRecord(url) ? url.url : url;
  if (typeof raw !== 'string') return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * What a REA result says about a run of `expectedSteps` steps: pass when every step (and the
 * start) completed and no page error was recorded. A result that is not REA's record fails.
 */
export function verdictOf(result: unknown, expectedSteps: number): Verdict {
  const base = {
    evidenceId: null,
    completed: 0,
    expected: expectedSteps + 1,
    pageErrors: [],
    durationMs: null,
    hosts: [],
  };
  if (!isRecord(result) || !isRecord(result.normalized_result)) {
    return { ...base, pass: false, failedStep: null, reason: 'REA returned no capture' };
  }
  const normalized = result.normalized_result;
  const steps = Array.isArray(normalized.steps) ? normalized.steps.filter(isRecord) : [];
  const done = steps.filter((step) => step.status === 'completed');
  const failed = steps.find((step) => step.status !== 'completed');
  const events =
    isRecord(normalized.events) && Array.isArray(normalized.events.items)
      ? normalized.events.items.filter(isRecord)
      : [];
  const pageErrors = events
    .filter((event) => event.kind === 'page-error')
    .map((event) => String(event.message ?? ''));
  const hosts = [
    ...new Set(
      events
        .filter((event) => event.kind === 'request')
        .map((event) => hostOf(event.url))
        .filter(
          (host): host is string => host !== null && !LOOPBACK_HOSTS.has(host.split(':')[0] ?? ''),
        ),
    ),
  ].sort();
  const allDone = failed === undefined && done.length === expectedSteps + 1;
  let reason: string | null = null;
  if (failed) reason = typeof failed.error === 'string' ? failed.error : String(failed.status);
  else if (!allDone) reason = `REA ran ${steps.length} of ${expectedSteps + 1} steps`;
  else if (pageErrors.length > 0) reason = `page error: ${pageErrors[0]}`;
  return {
    pass: allDone && pageErrors.length === 0,
    evidenceId: typeof result.evidence_id === 'string' ? result.evidence_id : null,
    completed: done.length,
    expected: expectedSteps + 1,
    failedStep: failed && typeof failed.step_id === 'string' ? failed.step_id : null,
    reason,
    pageErrors,
    durationMs: typeof normalized.duration_ms === 'number' ? normalized.duration_ms : null,
    hosts,
  };
}

/** The first line of `text`, at most `max` characters. */
function firstLine(text: string, max = 110): string {
  const line =
    text
      .split('\n')
      .find((part) => part.trim() !== '')
      ?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export interface Row {
  readonly name: string;
  readonly verdict: Verdict;
}

/** One line per scenario: steps, time, page errors, hosts off loopback, and pass or the failure. */
export function formatTable(rows: readonly Row[]): string {
  const width = Math.max(8, ...rows.map((row) => row.name.length));
  const lines = [`${'scenario'.padEnd(width)}  steps    time     errors  result`];
  for (const { name, verdict } of rows) {
    const steps = `${verdict.completed}/${verdict.expected}`.padEnd(7);
    const time = verdict.durationMs === null ? '—' : `${(verdict.durationMs / 1000).toFixed(1)} s`;
    const result = verdict.pass
      ? 'pass'
      : `FAIL${verdict.failedStep ? ` at ${verdict.failedStep}` : ''}: ${firstLine(verdict.reason ?? '')}`;
    lines.push(
      `${name.padEnd(width)}  ${steps}  ${time.padEnd(7)}  ${String(verdict.pageErrors.length).padEnd(6)}  ${result}`,
    );
  }
  const passed = rows.filter((row) => row.verdict.pass).length;
  lines.push(`${passed}/${rows.length} passed`);
  return lines.join('\n');
}

// ---- Processes ---------------------------------------------------------------------------------

/** True while a process with `pid` exists. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The PIDs of `pids` that `alive` still finds. */
export function stillAlive(
  pids: readonly number[],
  alive: (pid: number) => boolean = isAlive,
): number[] {
  return pids.filter((pid) => alive(pid));
}

/** Every PID this run started (process group leaders and the browsers), in order. */
const started: number[] = [];

/** Stops the process group led by `pid` (TERM, then KILL after a grace period). */
async function stopGroup(pid: number, graceMs = 5_000): Promise<void> {
  const signal = (name: NodeJS.Signals): void => {
    try {
      process.kill(-pid, name);
    } catch {
      try {
        process.kill(pid, name);
      } catch {
        // Already gone.
      }
    }
  };
  if (!isAlive(pid)) return;
  signal('SIGTERM');
  const until = Date.now() + graceMs;
  while (isAlive(pid) && Date.now() < until) await pause(100);
  if (isAlive(pid)) signal('SIGKILL');
}

function pause(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** A child in its own process group, so the runner can stop it and all it started. */
function startChild(command: string, args: readonly string[], log: string): ChildProcess {
  const fd = openSync(log, 'w');
  try {
    const child = spawn(command, args, {
      cwd: PRODUCT_ROOT,
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    if (child.pid !== undefined) started.push(child.pid);
    return child;
  } finally {
    closeSync(fd);
  }
}

function exited(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((done) => child.once('exit', (code) => done(code)));
}

async function startPreview(port: number, out: string): Promise<ChildProcess> {
  const vite = join(PRODUCT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  const child = startChild(process.execPath, args, join(out, 'preview.log'));
  const gone = exited(child).then(() => 'gone' as const);
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    const ready = await Promise.race([
      fetch(`http://127.0.0.1:${port}/`).then(
        (reply) => reply.ok,
        () => false,
      ),
      gone,
    ]);
    if (ready === 'gone') {
      throw new Error(`vite preview stopped (is port ${port} in use?); see ${out}/preview.log`);
    }
    if (ready) return child;
    await pause(200);
  }
  throw new Error(`vite preview did not answer on port ${port} within 30 s`);
}

// ---- The fixture desk --------------------------------------------------------------------------

/** What the desk does with one request the page sends. */
export type DeskAnswer =
  | { readonly kind: 'continue' }
  | { readonly kind: 'refuse' }
  | {
      readonly kind: 'fulfil';
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: Uint8Array;
    };

/** The food databases' answers, as e2e/support.ts gives them to the specs. */
export interface FoodFixtures {
  /** The code our product fixture answers for, its reply, the not-found reply, a photo. */
  readonly productCode: string;
  readonly product: Uint8Array;
  readonly notFound: Uint8Array;
  readonly photo: Uint8Array;
}

/** The code `e2e/fixtures/off-product.json` holds. */
export const OFF_PRODUCT_CODE = '2001234567893';

const OFF_PRODUCT = new URL(OFF_PRODUCT_URL);
const OFF_IMAGE_HOST = 'images.openfoodfacts.org';
const FDC_SEARCH = new URL(FDC_SEARCH_URL);
const CORS = { 'access-control-allow-origin': '*' };
const JSON_TYPE = { 'content-type': 'application/json' };

/**
 * The desk's answer to a request: loopback goes on to its server; Open Food Facts' product API
 * answers from our fixtures (our product, else not found with a 404), its image host with our
 * photo, FoodData Central's search with no hits; anything else is refused.
 */
export function foodDatabaseAnswer(url: URL, method: string, fixtures: FoodFixtures): DeskAnswer {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'continue' };
  if (LOOPBACK_HOSTS.has(url.hostname)) return { kind: 'continue' };
  if (url.host === OFF_PRODUCT.host && url.pathname.startsWith(OFF_PRODUCT.pathname)) {
    const code = url.pathname.slice(OFF_PRODUCT.pathname.length).replace(/\.json$/, '');
    const found = code === fixtures.productCode;
    return {
      kind: 'fulfil',
      status: found ? 200 : 404,
      headers: { ...CORS, ...JSON_TYPE },
      body: found ? fixtures.product : fixtures.notFound,
    };
  }
  if (url.host === OFF_IMAGE_HOST && method === 'GET') {
    return {
      kind: 'fulfil',
      status: 200,
      headers: { ...CORS, 'content-type': 'image/jpeg' },
      body: fixtures.photo,
    };
  }
  if (url.host === FDC_SEARCH.host && url.pathname === FDC_SEARCH.pathname) {
    if (method === 'OPTIONS') {
      return {
        kind: 'fulfil',
        status: 204,
        headers: {
          ...CORS,
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'content-type, x-api-key',
        },
        body: new Uint8Array(),
      };
    }
    const none = new TextEncoder().encode(JSON.stringify({ totalHits: 0, foods: [] }));
    return { kind: 'fulfil', status: 200, headers: { ...CORS, ...JSON_TYPE }, body: none };
  }
  return { kind: 'refuse' };
}

/** What the desk did during one run. */
export interface DeskReport {
  /** Files given to file choosers, in order. */
  readonly picked: string[];
  /** File choosers opened after the flow's files ran out. */
  unanswered: number;
  /** `METHOD url` answered from fixtures, and refused. */
  readonly routed: string[];
  readonly refused: string[];
  /** Why the desk could not attach, if it could not. */
  problem: string | null;
}

interface Desk {
  readonly report: DeskReport;
  /** Closes the desk's connection; resolves when it is closed. */
  stop(): Promise<void>;
}

/**
 * The browser wrapper REA launches: notes the browser's PID and profile folder for the runner,
 * then starts the real browser with a DevTools port of its own (port 0: the browser picks a free
 * one and writes it into the profile's `DevToolsActivePort`).
 */
export function browserWrapper(browser: string, dir: string): string {
  const quote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;
  return [
    '#!/bin/sh',
    '# Written by scripts/parity.ts for one parity run: the browser REA launches, with a DevTools',
    "# port for the runner's fixture desk. Notes the browser's PID and profile folder first.",
    'for arg in "$@"; do',
    '  case "$arg" in',
    `    --user-data-dir=*) printf '%s\\n' "\${arg#--user-data-dir=}" > ${quote(join(dir, 'browser.profile'))} ;;`,
    '  esac',
    'done',
    `printf '%s\\n' "$$" > ${quote(join(dir, 'browser.pid'))}`,
    `exec ${quote(browser)} --remote-debugging-port=0 "$@"`,
    '',
  ].join('\n');
}

/** The browser's DevTools WebSocket address, once the wrapper has started it; null if stopped. */
async function deskAddress(dir: string, stopped: () => boolean): Promise<string | null> {
  while (!stopped()) {
    const profileFile = join(dir, 'browser.profile');
    if (existsSync(profileFile)) {
      const activePort = join(readFileSync(profileFile, 'utf8').trim(), 'DevToolsActivePort');
      if (existsSync(activePort)) {
        const [port, path] = readFileSync(activePort, 'utf8').split('\n');
        if (port && path) return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
      }
    }
    await pause(50);
  }
  return null;
}

type CdpMessage = {
  readonly id?: number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly sessionId?: string;
  readonly error?: { readonly message?: string };
  readonly result?: Record<string, unknown>;
};

/**
 * Opens the desk for one run: waits for the browser REA launches through the wrapper, attaches
 * to each of its pages, answers file choosers with `files` in order and requests with `answer`.
 */
function openDesk(
  dir: string,
  files: readonly string[],
  answer: (url: URL, method: string) => DeskAnswer,
): Desk {
  const report: DeskReport = { picked: [], unanswered: 0, routed: [], refused: [], problem: null };
  let stopped = false;
  let socket: WebSocket | null = null;
  let closed: Promise<void> = Promise.resolve();
  const queue = [...files];
  let nextId = 0;
  const waiting = new Map<number, (message: CdpMessage) => void>();
  const attached = new Set<string>();

  const send = (method: string, params: object, sessionId?: string): Promise<CdpMessage> =>
    new Promise((done) => {
      const id = ++nextId;
      waiting.set(id, done);
      socket?.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });

  const attach = async (targetId: string): Promise<void> => {
    attached.add(targetId);
    const reply = await send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = reply.result?.sessionId;
    if (typeof sessionId !== 'string') return;
    await send('Page.enable', {}, sessionId);
    await send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
  };

  const paused = async (params: Record<string, unknown>, sessionId: string): Promise<void> => {
    const request = isRecord(params.request) ? params.request : {};
    const method = String(request.method ?? 'GET');
    const href = String(request.url ?? '');
    const requestId = params.requestId;
    let decision: DeskAnswer;
    try {
      decision = answer(new URL(href), method);
    } catch {
      decision = { kind: 'continue' };
    }
    if (decision.kind === 'continue') {
      await send('Fetch.continueRequest', { requestId }, sessionId);
    } else if (decision.kind === 'refuse') {
      report.refused.push(`${method} ${href}`);
      await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }, sessionId);
    } else {
      report.routed.push(`${method} ${href}`);
      await send(
        'Fetch.fulfillRequest',
        {
          requestId,
          responseCode: decision.status,
          responseHeaders: Object.entries(decision.headers).map(([name, value]) => ({
            name,
            value,
          })),
          body: Buffer.from(decision.body).toString('base64'),
        },
        sessionId,
      );
    }
  };

  const chooser = async (params: Record<string, unknown>, sessionId: string): Promise<void> => {
    const file = queue.shift();
    if (file === undefined) {
      report.unanswered++;
      return;
    }
    report.picked.push(file);
    await send(
      'DOM.setFileInputFiles',
      { files: [file], backendNodeId: params.backendNodeId },
      sessionId,
    );
  };

  const onMessage = (message: CdpMessage): void => {
    if (message.id !== undefined) {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
      return;
    }
    const params = message.params ?? {};
    if (
      message.method === 'Target.targetCreated' ||
      message.method === 'Target.targetInfoChanged'
    ) {
      const info = isRecord(params.targetInfo) ? params.targetInfo : {};
      if (
        info.type === 'page' &&
        typeof info.targetId === 'string' &&
        !attached.has(info.targetId)
      ) {
        void attach(info.targetId);
      }
    } else if (message.method === 'Fetch.requestPaused' && message.sessionId) {
      void paused(params, message.sessionId);
    } else if (message.method === 'Page.fileChooserOpened' && message.sessionId) {
      void chooser(params, message.sessionId);
    }
  };

  const ready = (async () => {
    const address = await deskAddress(dir, () => stopped);
    if (address === null) return;
    const ws = new WebSocket(address);
    socket = ws;
    closed = new Promise((done) => ws.addEventListener('close', () => done()));
    ws.addEventListener('message', (event) =>
      onMessage(JSON.parse(String(event.data)) as CdpMessage),
    );
    ws.addEventListener('open', () => void send('Target.setDiscoverTargets', { discover: true }));
    ws.addEventListener('error', () => {
      report.problem ??= 'the DevTools connection failed';
    });
  })().catch((error: unknown) => {
    report.problem = error instanceof Error ? error.message : String(error);
  });

  return {
    report,
    async stop() {
      stopped = true;
      await ready;
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      await Promise.race([closed, pause(2_000)]);
    },
  };
}

// ---- Fixture files -----------------------------------------------------------------------------

function readFoodFixtures(): FoodFixtures {
  return {
    productCode: OFF_PRODUCT_CODE,
    product: readFileSync(join(FIXTURE_DIR, 'off-product.json')),
    notFound: readFileSync(join(FIXTURE_DIR, 'off-not-found.json')),
    photo: readFileSync(join(FIXTURE_DIR, 'meal.jpg')),
  };
}

/** The day key of `ms` in UTC, the zone the scenarios' browser runs in. */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * A backup file made by our own backup writer for the restore flow: a finished setup with one
 * entry today (in UTC, the scenarios' zone), named "Restored porridge" at 320 kcal, and a weigh-in.
 */
async function makeRestoreFile(out: string, now: number): Promise<string> {
  const [{ makeBackup }, factories, { fixedClock }] = await Promise.all([
    import('../src/services/backup/backup'),
    import('../src/test/factories'),
    import('../src/lib/clock'),
  ]);
  const today = utcDayKey(now);
  const tables: Record<string, unknown[]> = {
    profile: [factories.makeProfileRow()],
    entries: [
      factories.makeEntry({
        id: 'restored-1',
        name: 'Restored porridge',
        kcal: 320,
        protein: 11,
        carbs: 52,
        fat: 7,
        loggedAt: now,
        dayKey: today,
        meal: 'breakfast',
        source: 'manual',
      }),
    ],
    weighIns: [factories.makeWeighIn({ id: 'restored-weigh', at: now, kg: 64 })],
    settings: [{ key: 'onboarding.done', value: true }],
  };
  const made = await makeBackup({
    backupRepo: {
      read: async (names) =>
        Object.fromEntries(names.map((name) => [name, tables[name] ?? []])) as never,
    },
    clock: fixedClock(now, 'UTC'),
    appVersion: 'parity',
  });
  if (!made.ok) throw new Error(`the restore fixture could not be made: ${made.error}`);
  const path = join(out, 'restore-fixture.zip');
  writeFileSync(path, new Uint8Array(await made.value.file.arrayBuffer()));
  return path;
}

async function pickedFiles(fixtures: Fixtures, out: string): Promise<string[]> {
  const paths: string[] = [];
  for (const file of fixtures.files) {
    paths.push(
      'fixture' in file ? join(FIXTURE_DIR, file.fixture) : await makeRestoreFile(out, Date.now()),
    );
  }
  return paths;
}

// ---- One scenario ------------------------------------------------------------------------------

interface RunContext {
  readonly options: Options;
  readonly aiOrigin: string;
  readonly wrapper: string;
  readonly food: FoodFixtures;
}

async function control(origin: string, path: string, body?: unknown): Promise<void> {
  const reply = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: JSON_TYPE,
    body: JSON.stringify(body ?? {}),
  });
  if (!reply.ok) throw new Error(`fake AI ${path}: ${reply.status} ${await reply.text()}`);
}

async function runScenario(
  name: string,
  context: RunContext,
): Promise<{ verdict: Verdict; desk: DeskReport }> {
  const { options } = context;
  const scenario = readScenario(name);
  const fixtures = FIXTURES[name] ?? NO_FIXTURES;
  const { readNamedScript } = await import('../e2e/fake-ai/server');
  await control(context.aiOrigin, '/__reset');
  await control(
    context.aiOrigin,
    '/__script',
    joinScripts(fixtures.ai, (script) => readNamedScript(script)),
  );

  const resolved = resolveScenario(scenario, {
    app: `http://127.0.0.1:${options.port}`,
    ai: context.aiOrigin,
    browser: context.wrapper,
  });
  const input = join(options.out, `${name}.scenario.json`);
  const output = join(options.out, `${name}.result.json`);
  const errors = join(options.out, `${name}.err`);
  writeFileSync(input, `${JSON.stringify(resolved, null, 2)}\n`);
  for (const note of ['browser.pid', 'browser.profile'])
    rmSync(join(options.out, note), { force: true });

  const files = await pickedFiles(fixtures, options.out);
  const desk = openDesk(options.out, files, (url, method) =>
    foodDatabaseAnswer(url, method, context.food),
  );
  const out = openSync(output, 'w');
  const err = openSync(errors, 'w');
  let child: ChildProcess;
  try {
    child = spawn(options.rea, ['capture-browser-scenario', input, '--format', 'json'], {
      cwd: PRODUCT_ROOT,
      detached: true,
      stdio: ['ignore', out, err],
    });
  } finally {
    closeSync(out);
    closeSync(err);
  }
  if (child.pid !== undefined) started.push(child.pid);
  const limit = overallLimitMs(scenario);
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    exited(child).then(() => false),
    new Promise<boolean>((done) => {
      timer = setTimeout(() => done(true), limit);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut && child.pid !== undefined) await stopGroup(child.pid);
  await desk.stop();

  // The browser REA launched: REA stops it; if it is still there, this run caused it, so stop it.
  const pidFile = join(options.out, 'browser.pid');
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      started.push(pid);
      await stopGroup(pid, 2_000);
    }
  }

  let result: unknown = null;
  try {
    result = JSON.parse(readFileSync(output, 'utf8'));
  } catch {
    result = null;
  }
  let verdict = verdictOf(result, stepsOf(scenario).length);
  if (result === null) {
    const tail = readFileSync(errors, 'utf8').trim().split('\n').slice(-3).join(' ');
    verdict = {
      ...verdict,
      reason: timedOut ? `REA ran past ${limit} ms` : tail || 'REA wrote nothing',
    };
  }
  if (desk.report.problem !== null && verdict.pass) {
    verdict = { ...verdict, pass: false, reason: `fixture desk: ${desk.report.problem}` };
  }
  if (desk.report.unanswered > 0 && verdict.pass) {
    verdict = { ...verdict, pass: false, reason: 'a file chooser opened with no file left for it' };
  }
  return { verdict, desk: desk.report };
}

// ---- REA's obligation ledger (P10-04) ----------------------------------------------------------

/** How a difference from the reference observation is classified (02-rea-workflow §4.4). */
export const DIVERGENCE_KINDS = ['intended', 'bug', 'reference-gap', 'unknown'] as const;

/** One difference: `ref` is the D-id (intended) or the test that failed first (bug). */
export interface Divergence {
  readonly kind: (typeof DIVERGENCE_KINDS)[number];
  readonly ref?: string;
  readonly what: string;
}

/** One claim of `parity/ledger/obligations.json`. */
export interface Obligation {
  readonly id: string;
  readonly acc: string;
  readonly claim: string;
  readonly flow: string;
  /** The flow's step ids that show the claim; none for a blocked claim. */
  readonly steps: readonly string[];
  readonly spec: string;
  readonly status: 'verified' | 'blocked';
  /** Why no run here can show a blocked claim. */
  readonly blockedBy?: string;
  readonly divergences: readonly Divergence[];
}

/** One binding of `parity/ledger/manifest.json`. */
export interface Binding {
  readonly id: string;
  readonly module: string;
  readonly symbol: string;
  /** The acceptance map's `Test:` lines for the claim's ACC id. */
  readonly tests: readonly string[];
  /** Its `Review:` lines, while the id has no test yet. */
  readonly review?: readonly string[];
}

export interface LedgerFiles {
  readonly obligations: readonly Obligation[];
  readonly bindings: readonly Binding[];
}

export function readLedger(dir = LEDGER_DIR): LedgerFiles {
  const obligations = JSON.parse(readFileSync(join(dir, 'obligations.json'), 'utf8')) as {
    claims: Obligation[];
  };
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
    bindings: Binding[];
  };
  return { obligations: obligations.claims, bindings: manifest.bindings };
}

/** A REA Evidence record of one parity capture, as the runner saved it. */
export type EvidenceRecord = Record<string, unknown> & { readonly evidence_id: string };

/**
 * REA's `build_reconstruction_obligation_ledger` input from our ledger and the captures. The
 * reference cannot run here, so every claim has no original-side case: it goes in `blocked` with
 * runtime authority unavailable, and the capture of its flow is the review Evidence.
 */
export function reaLedgerInput(
  ledger: LedgerFiles,
  captures: Readonly<Record<string, EvidenceRecord>>,
  ownerHash: (module: string) => string,
): Record<string, unknown> {
  // REA authenticates the bundle against its own canonical form: records by evidence id, each
  // manifest de-duplicated and sorted by its JSON text, scenarios for controlled replays only.
  const records = Object.values(captures).sort((left, right) =>
    left.evidence_id < right.evidence_id ? -1 : left.evidence_id > right.evidence_id ? 1 : 0,
  );
  const uniqueSorted = (values: readonly unknown[]): unknown[] =>
    [...new Map(values.map((value) => [JSON.stringify(value), value])).entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, value]) => value);
  const bindingOf = new Map(ledger.bindings.map((binding) => [binding.id, binding]));
  return {
    evidence_bundle: {
      artifacts: [],
      providers: uniqueSorted(records.map((record) => record.provider)),
      environments: uniqueSorted(records.map((record) => record.environment).filter(isRecord)),
      scenarios: records
        .filter((record) => record.authority === 'controlled-replay')
        .map((record) => ({
          evidence_id: record.evidence_id,
          operation: record.operation,
          authority: 'controlled-replay',
        })),
      captures: [],
      unknowns: [],
      records,
    },
    reviewed_obligations: ledger.obligations.map((claim) => {
      // A blocked claim was still reviewed on its flow's capture.
      const capture = captures[claim.flow];
      return {
        obligation_id: claim.id,
        obligation_version: 1,
        title: claim.claim,
        application_layer: 'application',
        family: claim.flow,
        target: {
          artifact_sha256: null,
          application_node_id: null,
          semantic_node_id: null,
          location: bindingOf.get(claim.id)?.module ?? claim.flow,
        },
        required: true,
        required_case_kinds: ['positive'],
        required_original_authority: 'runtime',
        required_fixture_authority: 'renderer',
        required_verifier_authority: 'renderer',
        requires_parser_type: false,
        dependency_obligation_ids: [],
        residual_unknown_ids: [],
        unavailable_authority: ['runtime'],
        required_next_evidence: [
          `a runtime capture of the reference's ${claim.flow} flow (no build of it can run here)`,
          ...(claim.blockedBy ? [`a product capture: ${claim.blockedBy}`] : []),
        ],
        disposition: 'blocked',
        review_evidence_ids: capture ? [capture.evidence_id] : [],
      };
    }),
    manifest: {
      bindings: ledger.obligations.map((claim) => {
        const binding = bindingOf.get(claim.id);
        const capture = claim.status === 'verified' ? captures[claim.flow] : undefined;
        const module = binding?.module ?? '';
        return {
          obligation_id: claim.id,
          owner: {
            module_path: module,
            symbol: binding?.symbol ?? '',
            owner_sha256: ownerHash(module),
          },
          parser_type: null,
          original_cases: [],
          fixtures: capture
            ? [
                {
                  fixture_id: `parity.${claim.flow}`,
                  case_kind: 'positive',
                  authority: 'renderer',
                  evidence_ids: [capture.evidence_id],
                },
              ]
            : [],
          verifier: capture
            ? {
                verifier_id: 'pnpm-parity',
                claim_id: claim.id,
                command: `pnpm parity --only ${claim.flow}`,
                authority: 'renderer',
                status: 'pass',
                result_evidence_id: capture.evidence_id,
                enumerated_obligation_ids: [claim.id],
                nondeterminism: {
                  mode: 'total-order',
                  specification: 'one scenario, one browser, steps in file order',
                },
              }
            : null,
        };
      }),
      contradictions: [],
    },
  };
}

function sha256Of(path: string): string {
  return createHash('sha256')
    .update(readFileSync(join(PRODUCT_ROOT, path)))
    .digest('hex');
}

function runLedger(options: Options, print: (line: string) => void): number {
  const ledger = readLedger();
  const captures: Record<string, EvidenceRecord> = {};
  for (const flow of new Set(ledger.obligations.map((claim) => claim.flow))) {
    const file = join(options.out, `${flow}.result.json`);
    if (!existsSync(file)) {
      print(`no capture of ${flow} in ${options.out}: run pnpm parity first`);
      return 2;
    }
    captures[flow] = JSON.parse(readFileSync(file, 'utf8')) as EvidenceRecord;
  }
  const dir = join(options.out, 'ledger');
  mkdirSync(dir, { recursive: true });
  const input = join(dir, 'input.json');
  writeFileSync(input, JSON.stringify(reaLedgerInput(ledger, captures, sha256Of)));
  const output = join(dir, 'result.json');
  const run = spawnSync(
    options.rea,
    ['build-reconstruction-obligation-ledger', input, '--format', 'json'],
    {
      cwd: PRODUCT_ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  writeFileSync(output, run.stdout ?? '');
  writeFileSync(join(dir, 'result.err'), run.stderr ?? '');
  print(`REA ledger: exit ${run.status}; input ${input}; result ${output}`);
  if (run.status !== 0) return 1;
  print(ledgerSummary(JSON.parse(run.stdout) as unknown));
  return 0;
}

/** One line from REA's ledger result: its Evidence id, closure digest and counts by status. */
export function ledgerSummary(result: unknown): string {
  const record = isRecord(result) ? result : {};
  const ledger = isRecord(record.normalized_result) ? record.normalized_result : {};
  const summary = isRecord(ledger.summary) ? ledger.summary : {};
  const reports = isRecord(ledger.reports) ? ledger.reports : {};
  const counts = (Array.isArray(summary.by_status) ? summary.by_status : [])
    .filter(isRecord)
    .filter((entry) => Number(entry.count) > 0)
    .map((entry) => `${String(entry.key)} ${String(entry.count)}`);
  const noVerifier = Array.isArray(reports.missing_verifier_obligation_ids)
    ? reports.missing_verifier_obligation_ids.length
    : 0;
  return [
    `REA ledger ${String(record.evidence_id)}: ${String(ledger.status)}`,
    `closure ${String(ledger.closure_digest)}`,
    `${String(summary.total)} obligations (${counts.join(', ')})`,
    `${noVerifier} without a verifier`,
  ].join('; ');
}

// ---- Main --------------------------------------------------------------------------------------

/** The static problems of every scenario `names` lists, and of a scenario with no fixtures. */
export function checkAll(names: readonly string[], dir = PARITY_DIR): string[] {
  const template = readScenario(TEMPLATE_SCENARIO, dir);
  return names.flatMap((name) => {
    const problems = checkScenario(name, readScenario(name, dir), template);
    if (!(name in FIXTURES)) problems.push(`${name}: no FIXTURES entry in scripts/parity.ts`);
    return problems;
  });
}

/** The dry run: every scenario with its steps and needs, then any static problem. */
export function dryRun(
  names: readonly string[],
  dir = PARITY_DIR,
): { lines: string[]; ok: boolean } {
  const lines = names.map((name) => {
    const steps = stepsOf(readScenario(name, dir)).length;
    const fixtures = FIXTURES[name] ?? NO_FIXTURES;
    const files = fixtures.files.map((file) =>
      'fixture' in file ? file.fixture : 'a made backup',
    );
    return `${name}: ${steps} steps; fake AI ${fixtures.ai.join(' + ') || 'none'}; files ${files.join(', ') || 'none'}`;
  });
  const problems = checkAll(names, dir);
  lines.push(
    ...problems,
    `${names.length} scenarios; ${problems.length} problems; nothing was started`,
  );
  return { lines, ok: problems.length === 0 };
}

export async function main(
  argv: readonly string[],
  print = (line: string) => console.log(line),
): Promise<number> {
  const parsed = parseArgs(argv);
  if ('problem' in parsed) {
    print(`parity: ${parsed.problem}`);
    return 2;
  }
  const options = parsed;
  const all = scenarioNames();
  const unknown = options.only.filter((name) => !all.includes(name));
  if (unknown.length > 0) {
    print(`parity: no scenario named ${unknown.join(', ')} (scenarios: ${all.join(', ')})`);
    return 2;
  }
  const names = options.only.length > 0 ? [...options.only] : all;
  if (options.dryRun) {
    const { lines, ok } = dryRun(names);
    lines.forEach((line) => print(line));
    return ok ? 0 : 1;
  }
  mkdirSync(options.out, { recursive: true });
  if (options.ledger) return runLedger(options, print);

  const problems = checkAll(names);
  if (problems.length > 0) {
    problems.forEach((line) => print(line));
    return 2;
  }
  if (!existsSync(options.rea)) {
    print(`parity: REA is not at ${options.rea} (see docs/plan/02-rea-workflow.md §1)`);
    return 2;
  }
  if (options.build) {
    print('parity: building the app');
    const build = spawnSync('pnpm', ['build'], { cwd: PRODUCT_ROOT, stdio: 'inherit' });
    if (build.status !== 0) return 2;
  }

  const wrapper = join(options.out, 'browser.sh');
  writeFileSync(wrapper, browserWrapper(options.browser, options.out), { mode: 0o755 });
  const { startFakeAiServer } = await import('../e2e/fake-ai/server');
  let preview: ChildProcess | null = null;
  let fakeAi: { close(): Promise<void> } | null = null;
  const rows: Row[] = [];
  try {
    preview = await startPreview(options.port, options.out);
    const server = await startFakeAiServer({ port: options.aiPort });
    fakeAi = server;
    const context: RunContext = {
      options,
      aiOrigin: server.url,
      wrapper,
      food: readFoodFixtures(),
    };
    print(
      `parity: app ${CANONICAL.app.replace('4173', String(options.port))}, fake AI ${server.url}`,
    );
    for (const name of names) {
      const { verdict, desk } = await runScenario(name, context);
      rows.push({ name, verdict });
      const extra = [
        desk.picked.length ? `picked ${desk.picked.length}` : '',
        desk.routed.length ? `routed ${desk.routed.length}` : '',
        desk.refused.length ? `refused ${desk.refused.join(', ')}` : '',
      ].filter(Boolean);
      print(
        `${name}: ${verdict.pass ? 'pass' : 'FAIL'} ${verdict.evidenceId ?? ''} ${extra.join('; ')}`.trim(),
      );
    }
  } catch (error) {
    print(`parity: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  } finally {
    await fakeAi?.close();
    if (preview?.pid !== undefined) await stopGroup(preview.pid);
    const alive = stillAlive(started);
    print(
      alive.length === 0
        ? `parity: all ${started.length} started processes are gone (${started.join(', ')})`
        : `parity: still running: ${alive.join(', ')}`,
    );
    writeFileSync(
      join(options.out, 'summary.json'),
      `${JSON.stringify({ at: new Date().toISOString(), rows, pids: started, alive }, null, 2)}\n`,
    );
  }
  print(formatTable(rows));
  return rows.every((row) => row.verdict.pass) ? 0 : 1;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 2;
    },
  );
}
