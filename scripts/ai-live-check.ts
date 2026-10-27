/**
 * The live provider check (P10-12): `PLATEWISE_LIVE=1 pnpm exec tsx scripts/ai-live-check.ts`.
 * Before a release, with real keys, it sends one small meal photo through the app's food task on
 * each wire format family (Gemini, Anthropic, OpenAI-compatible) and asks the app's Coach engine
 * one question, from the built app in a real Chromium page (`ai-live-check/browser.ts`), and
 * prints one row per check: `pass` with timings and what the answer held, `fail` with the failure
 * kind, or `skipped` with what to set.
 *
 * Opt-in: without `PLATEWISE_LIVE=1` it prints "skipped" and sends nothing; with the flag and no
 * keys it prints the plan and "skipped: no keys". `--dry-run` prints the plan and starts nothing.
 * Keys come only from the environment, under the CORS probe's names (`PLATEWISE_PROBE_KEY_<ID>`,
 * `PLATEWISE_PROBE_URL_OLLAMA` / `_CUSTOM`, `PLATEWISE_PROBE_MODEL_<ID>`), so one set serves both
 * runs. `PLATEWISE_LIVE_GEMINI`, `_ANTHROPIC` and `_OPENAI` pick the provider of a family and
 * `PLATEWISE_LIVE_COACH` the Coach's; otherwise the first provider of the catalogue that is set
 * up is used. Every printed line goes through the probe's `redact`, and the page returns facts
 * only, never a provider's text. Exit code: 0 whatever the results, 1 when the script failed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PROVIDER_IDS,
  PROVIDERS,
  isProviderId,
  type ProviderId,
  type WireFormat,
} from '../src/ai/catalog/providers';
import { defaultModel } from '../src/ai/catalog/presets';
import { envName, planProbes, probeSecrets, redact, type Env } from './ai-cors-probe';
import type { CheckResult, LiveCheck } from './ai-live-check/page';
import type { LiveSession } from './ai-live-check/browser';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const FLAG = 'PLATEWISE_LIVE';
export const DRY_RUN = '--dry-run';
/** The meal photo every photo check sends: our own e2e fixture. */
export const PHOTO_FILE = 'e2e/fixtures/meal.jpg';
/** The app's time limit for each check, in seconds. */
export const CHECK_TIMEOUT_SECONDS = 120;

/** The four checks, in the order they run. */
export const CHECK_IDS = ['photo-gemini', 'photo-anthropic', 'photo-openai', 'coach'] as const;
export type CheckId = (typeof CHECK_IDS)[number];

const FAMILY: Readonly<Record<Exclude<CheckId, 'coach'>, WireFormat>> = {
  'photo-gemini': 'gemini',
  'photo-anthropic': 'anthropic',
  'photo-openai': 'openai',
};

const FAMILY_NAME: Readonly<Record<WireFormat, string>> = {
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  openai: 'OpenAI-compatible',
};

/** `PLATEWISE_LIVE_GEMINI`, `PLATEWISE_LIVE_COACH`, … */
export function pickVariable(check: CheckId): string {
  return check === 'coach' ? `${FLAG}_COACH` : `${FLAG}_${FAMILY[check].toUpperCase()}`;
}

// ---- The plan ----------------------------------------------------------------------------------

export interface PlannedCheck {
  readonly kind: 'run';
  readonly check: CheckId;
  readonly provider: ProviderId;
  readonly baseUrl: string;
  readonly model: string;
  readonly key?: string;
}

export interface SkippedCheck {
  readonly kind: 'skip';
  readonly check: CheckId;
  readonly reason: string;
  /** The provider asked for, when one was named. */
  readonly provider?: ProviderId;
}

export type PlanStep = PlannedCheck | SkippedCheck;

/** A provider that is set up (key or server address), with its address and key. */
interface Ready {
  readonly baseUrl: string;
  readonly key?: string;
}

/** The key variable to set for a check: the family's one provider, or any of a kind. */
function keyHint(check: CheckId): string {
  if (check === 'coach') return 'PLATEWISE_PROBE_KEY_<ID> of any provider';
  const family = PROVIDER_IDS.filter((id) => unfit(check, id) === null);
  return family.length === 1
    ? envName('KEY', family[0]!)
    : `PLATEWISE_PROBE_KEY_<ID> of an ${FAMILY_NAME[FAMILY[check]]} provider`;
}

/** What a provider lacks for `check`, or null when it can serve it. */
function unfit(check: CheckId, id: ProviderId): string | null {
  const entry = PROVIDERS[id];
  if (check === 'coach') return null;
  if (entry.format !== FAMILY[check]) return `${entry.name} speaks the ${entry.format} format`;
  if (!entry.vision) return `${entry.name} does not read photos`;
  return null;
}

function modelFor(env: Env, check: CheckId, id: ProviderId): string {
  const chosen = env[envName('MODEL', id)]?.trim();
  return chosen || defaultModel(id, check === 'coach' ? 'text' : 'image');
}

/**
 * What each check will do: the provider named for it, or the first provider of the catalogue
 * (of the check's family, reading photos for a photo check) that is set up and has a model.
 */
export function planChecks(env: Env): PlanStep[] {
  const ready = new Map<ProviderId, Ready | string>();
  for (const step of planProbes(env)) {
    ready.set(
      step.id,
      step.kind === 'probe'
        ? { baseUrl: step.baseUrl, ...(step.key === undefined ? {} : { key: step.key }) }
        : step.reason,
    );
  }

  const planFor = (check: CheckId, id: ProviderId): PlanStep => {
    const problem = unfit(check, id);
    if (problem !== null) return { kind: 'skip', check, provider: id, reason: problem };
    const setUp = ready.get(id)!;
    if (typeof setUp === 'string') return { kind: 'skip', check, provider: id, reason: setUp };
    const model = modelFor(env, check, id);
    if (model === '') {
      return {
        kind: 'skip',
        check,
        provider: id,
        reason: `no ${check === 'coach' ? 'text' : 'photo'} model (set ${envName('MODEL', id)})`,
      };
    }
    return { kind: 'run', check, provider: id, model, ...setUp };
  };

  return CHECK_IDS.map((check): PlanStep => {
    const named = env[pickVariable(check)]?.trim();
    if (named) {
      if (!isProviderId(named)) {
        return { kind: 'skip', check, reason: `${pickVariable(check)} names no provider` };
      }
      return planFor(check, named);
    }
    for (const id of PROVIDER_IDS) {
      const step = planFor(check, id);
      if (step.kind === 'run') return step;
    }
    return { kind: 'skip', check, reason: `no keys: set ${keyHint(check)}` };
  });
}

/** The page's input for a planned check. */
export function checkInput(step: PlannedCheck, photo: string): LiveCheck {
  const base = {
    provider: step.provider,
    baseUrl: step.baseUrl,
    model: step.model,
    ...(step.key === undefined ? {} : { key: step.key }),
    timeoutSeconds: CHECK_TIMEOUT_SECONDS,
  };
  return step.check === 'coach' ? { kind: 'coach', ...base } : { kind: 'photo', ...base, photo };
}

// ---- Results -----------------------------------------------------------------------------------

export interface Row {
  readonly check: CheckId;
  readonly provider: string;
  readonly model: string;
  readonly result: 'pass' | 'fail' | 'skipped' | 'planned';
  readonly detail: string;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** One row for a check that ran, from the facts the page returned. */
export function judge(step: PlannedCheck, result: CheckResult): Row {
  const name = PROVIDERS[step.provider].name;
  const sent = plural(result.requests, 'request');
  const statuses = result.statuses.length > 0 ? ` (HTTP ${result.statuses.join(', ')})` : '';
  if (!result.ok) {
    const status = result.failureStatus === undefined ? '' : ` at HTTP ${result.failureStatus}`;
    return {
      check: step.check,
      provider: name,
      model: step.model,
      result: 'fail',
      detail: `${result.failure ?? 'unknown'}${status}; ${sent}${statuses}; ${result.ms} ms`,
    };
  }
  const answer =
    step.check === 'coach'
      ? `answered in ${plural(result.answerChars ?? 0, 'character')}, ${plural(
          Math.max(result.requests - 1, 0),
          'tool round',
        )}`
      : `parsed: ${result.kcal ?? 0} kcal, ${plural(result.parts ?? 0, 'part')}`;
  return {
    check: step.check,
    provider: name,
    model: step.model,
    result: 'pass',
    detail: `${answer}; ${sent}${statuses}; ${result.ms} ms`,
  };
}

/** The row of a step that has not run: skipped, or (in a dry run) planned. */
export function unrun(step: PlanStep): Row {
  if (step.kind === 'run') {
    return {
      check: step.check,
      provider: PROVIDERS[step.provider].name,
      model: step.model,
      result: 'planned',
      detail: step.baseUrl,
    };
  }
  return {
    check: step.check,
    provider: step.provider === undefined ? '-' : PROVIDERS[step.provider].name,
    model: '-',
    result: 'skipped',
    detail: step.reason,
  };
}

export function formatTable(rows: readonly Row[]): string {
  const cells = [
    ['check', 'provider', 'model', 'result', 'detail'],
    ...rows.map((row) => [row.check, row.provider, row.model, row.result, row.detail]),
  ];
  const widths = [0, 1, 2, 3].map((i) => Math.max(...cells.map((line) => line[i]!.length)));
  return cells
    .map((line) =>
      line
        .map((cell, i) => (i < 4 ? cell.padEnd(widths[i]!) : cell))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

// ---- Running -----------------------------------------------------------------------------------

/** Builds and serves the app and opens Chromium; `log` prints progress lines. */
export type OpenSession = (log: (line: string) => void) => Promise<LiveSession>;

export interface MainOptions {
  readonly write?: (text: string) => void;
  readonly writeError?: (text: string) => void;
  readonly open?: OpenSession;
  /** The photo as base64; the fixture file by default. */
  readonly photo?: () => string;
}

const openBrowserSession: OpenSession = async (log) => {
  const { openLiveSession } = await import('./ai-live-check/browser');
  return openLiveSession(PRODUCT_ROOT, log);
};

const fixturePhoto = (): string => readFileSync(join(PRODUCT_ROOT, PHOTO_FILE)).toString('base64');

export async function main(
  env: Env,
  args: readonly string[] = [],
  options: MainOptions = {},
): Promise<number> {
  const secrets = probeSecrets(env);
  const out = options.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const outError = options.writeError ?? ((text: string) => process.stderr.write(`${text}\n`));
  const print = (text: string): void => out(redact(text, secrets));
  const printError = (text: string): void => outError(redact(text, secrets));
  const dryRun = args.includes(DRY_RUN);

  if (env[FLAG] !== '1' && !dryRun) {
    print(
      `Live provider check skipped: set ${FLAG}=1 to run it (or pass ${DRY_RUN} to see the ` +
        'plan). It sends one meal photo per wire format and one Coach question, with the keys ' +
        'in PLATEWISE_PROBE_KEY_<ID>.',
    );
    return 0;
  }

  const plan = planChecks(env);
  const planned = plan.filter((step): step is PlannedCheck => step.kind === 'run');
  if (dryRun || planned.length === 0) {
    const closing = dryRun
      ? `Dry run: ${plural(planned.length, 'check')} would run; nothing was sent.`
      : 'Live provider check skipped: no keys. Nothing was sent.';
    print(`${formatTable(plan.map(unrun))}\n\n${closing}`);
    return 0;
  }

  const rows = new Map<CheckId, Row>(
    plan.flatMap((step) => (step.kind === 'skip' ? [[step.check, unrun(step)] as const] : [])),
  );
  let session: LiveSession | undefined;
  let failed = false;
  try {
    const photo = (options.photo ?? fixturePhoto)();
    session = await (options.open ?? openBrowserSession)(print);
    print(
      `Running ${plural(planned.length, 'check')} from ${session.origin} in ${session.browser}.`,
    );
    for (const step of planned) {
      rows.set(step.check, judge(step, await session.run(checkInput(step, photo))));
    }
  } catch (error) {
    printError(`Live provider check failed: ${describe(error)}`);
    failed = true;
  }
  try {
    await session?.close();
  } catch (error) {
    printError(`Live provider check could not close the browser or the server: ${describe(error)}`);
    failed = true;
  }
  if (failed) return 1;

  print(formatTable(CHECK_IDS.map((check) => rows.get(check)!)));
  return 0;
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main(process.env, process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${redact(String(error), probeSecrets(process.env))}\n`);
      process.exitCode = 1;
    },
  );
}
