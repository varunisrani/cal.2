/**
 * Runs the clean-room checks: `tsx tooling/checks/runAll.ts [flags]`.
 * Every selected check runs even when an earlier one fails. Exit code is the worst of
 * them: 0 clean (pass or skip), 1 violations, 2 setup problem.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAcceptance } from './acceptance';
import { runAssets } from './assets';
import { runBanned } from './banned';
import { runLicenses } from './licenses';
import { refExists, resolveRefPath } from './lib/ref';
import {
  CHECK_NAMES,
  result,
  type CheckContext,
  type CheckName,
  type CheckResult,
  type Status,
} from './lib/types';
import { runSimilarity } from './similarity/check';
import { runTraps } from './traps';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type CheckFn = (ctx: CheckContext) => Promise<CheckResult>;

export const CHECKS: Record<CheckName, CheckFn> = {
  similarity: runSimilarity,
  banned: runBanned,
  assets: runAssets,
  licenses: runLicenses,
  traps: runTraps,
  acceptance: runAcceptance,
};

export interface Options {
  only: CheckName[];
  requireRef: boolean;
  ref?: string;
  strict: boolean;
  closest: number | null;
  json: boolean;
}

const USAGE = `usage: tsx tooling/checks/runAll.ts [--only <name>]... [--require-ref] [--ref <path>]
       [--strict] [--closest <n>] [--json]
checks: ${CHECK_NAMES.join(', ')}`;

export function parseArgs(argv: string[]): Options | { error: string } {
  const options: Options = {
    only: [],
    requireRef: false,
    strict: false,
    closest: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s) : [arg];
    const value = (): string | undefined => inline ?? argv[++i];
    switch (flag) {
      case '--only': {
        const v = value();
        if (!v) return { error: '--only needs a check name' };
        for (const name of v.split(',')) {
          if (!(CHECK_NAMES as readonly string[]).includes(name)) {
            return { error: `unknown check "${name}"` };
          }
          if (!options.only.includes(name as CheckName)) options.only.push(name as CheckName);
        }
        break;
      }
      case '--require-ref':
        options.requireRef = true;
        break;
      case '--ref': {
        const v = value();
        if (!v) return { error: '--ref needs a path' };
        options.ref = v;
        break;
      }
      case '--strict':
        options.strict = true;
        break;
      case '--closest': {
        const v = value();
        const n = Number(v);
        if (!v || !Number.isInteger(n) || n < 1) {
          return { error: '--closest needs a whole number ≥ 1' };
        }
        options.closest = n;
        break;
      }
      case '--json':
        options.json = true;
        break;
      default:
        return { error: `unknown argument "${arg}"` };
    }
  }
  return options;
}

export function exitCodeOf(status: Status): number {
  return status === 'fail' ? 1 : status === 'error' ? 2 : 0;
}

export interface TimedResult extends CheckResult {
  ms: number;
}

export async function runChecks(
  names: CheckName[],
  ctx: CheckContext,
  checks: Record<CheckName, CheckFn> = CHECKS,
): Promise<TimedResult[]> {
  const out: TimedResult[] = [];
  for (const name of names) {
    const started = Date.now();
    let res: CheckResult;
    try {
      res = await checks[name](ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res = result(name, 'error', `crashed: ${message}`, {
        notes: [err instanceof Error && err.stack ? err.stack : message],
      });
    }
    out.push({ ...res, ms: Date.now() - started });
  }
  return out;
}

const MAX_PRINTED = 50;

export function formatText(results: TimedResult[], ctx: CheckContext): string {
  const lines: string[] = [];
  lines.push(
    `Platewise clean-room checks · product ${ctx.productRoot} · reference ${ctx.refRoot ?? `${ctx.refPath} (missing)`}`,
  );
  for (const r of results) {
    if (r.findings.length === 0 && r.notes.length === 0 && r.report.length === 0) continue;
    lines.push('', `[${r.name}] ${r.status.toUpperCase()}: ${r.summary}`);
    for (const note of r.notes) lines.push(`  ${note}`);
    for (const f of r.findings.slice(0, MAX_PRINTED)) {
      const at =
        f.line === undefined && f.col !== undefined
          ? `${f.file} (path, col ${f.col})`
          : [f.file, f.line, f.col].filter((x) => x !== undefined).join(':');
      lines.push(`  ${at}  [${f.rule}] ${f.message}`);
      if (f.ref) lines.push(`      reference: ${f.ref}`);
      if (f.excerpt) lines.push(`      "${f.excerpt}"`);
    }
    if (r.findings.length > MAX_PRINTED) {
      lines.push(`  … and ${r.findings.length - MAX_PRINTED} more (use --json for all)`);
    }
    for (const line of r.report) lines.push(`  ${line}`);
  }
  const rows = results.map((r) => [
    r.name,
    r.status.toUpperCase(),
    String(r.findings.length),
    `${(r.ms / 1000).toFixed(1)}s`,
    r.summary,
  ]);
  const head = ['check', 'status', 'findings', 'time', 'summary'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const fmt = (row: string[]): string =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!)))
      .join('  ')
      .trimEnd();
  lines.push('', fmt(head), fmt(widths.map((w) => '-'.repeat(Math.min(w, 60)))));
  for (const row of rows) lines.push(fmt(row));
  const code = Math.max(0, ...results.map((r) => exitCodeOf(r.status)));
  const meaning = ['clean', 'violations', 'setup problem'][code];
  lines.push('', `exit ${code} (${meaning})`);
  return lines.join('\n');
}

export interface MainOverrides {
  productRoot?: string;
  checks?: Record<CheckName, CheckFn>;
  write?: (text: string) => void;
}

export async function main(
  argv: string[],
  env: NodeJS.ProcessEnv,
  overrides: MainOverrides = {},
): Promise<number> {
  const write = overrides.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    write(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const productRoot = overrides.productRoot ?? PRODUCT_ROOT;
  const refPath = resolveRefPath(parsed.ref, env);
  const ctx: CheckContext = {
    productRoot,
    refRoot: refExists(refPath) ? refPath : null,
    refPath,
    requireRef: parsed.requireRef,
    strict: parsed.strict,
    closest: parsed.closest,
    cacheDir: join(productRoot, 'node_modules', '.cache', 'platewise-similarity'),
  };
  const names = parsed.only.length > 0 ? parsed.only : [...CHECK_NAMES];
  const results = await runChecks(names, ctx, overrides.checks);
  const code = Math.max(0, ...results.map((r) => exitCodeOf(r.status)));
  if (parsed.json) {
    write(
      JSON.stringify(
        { product: productRoot, reference: ctx.refRoot, exitCode: code, checks: results },
        null,
        2,
      ),
    );
  } else {
    write(formatText(results, ctx));
  }
  return code;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      console.error(err);
      process.exitCode = 2;
    },
  );
}
