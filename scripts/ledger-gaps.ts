/**
 * Trap rows still waiting for a v1 test (P10-06): `tsx scripts/ledger-gaps.ts`.
 *
 * Reads docs/internals/traps-ledger.md with the parser of `pnpm check:traps` and lists every row
 * owned by a v1 task that has no `Test:` line, and every `Review:` line whose owner is still a v1
 * task (part of a row left without its test). The owner of a `Review:` line is the first owner it
 * names: a task (`P07-03`) or a phase (`P09`) is v1; a later phase (`L1`–`L5`), a v1.x item or a
 * not-planned decision (`N-8`) is later. A row is a later owner's when one of its `Review:` lines
 * is; every other row, including one with no `Review:` line, is a v1 task's. Whether the `Test:`
 * lines resolve is the traps check's job, not this one's.
 * Exit codes: 0 nothing listed, 1 something listed, 2 setup problem.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLedger } from '../tooling/checks/ledger';
import { LEDGER } from '../tooling/checks/traps';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A task (`P07-03`), a phase (`P09`), a later phase, a v1.x item or an N-id. "P2" is a tier. */
const OWNER = /(?<![\w.-])(P\d{2}(?:-\d{2})?|L[1-5]|v1\.x|N-\d+)(?![\w-])/;

export interface Owner {
  /** As written: `P07-03`, `P09`, `L2`, `v1.x`, `N-8`. */
  token: string;
  /** True for L1–L5, v1.x and N-ids; false for a v1 task or phase. */
  later: boolean;
}

/** The first owner a `Review:` line names, or null when it names none. */
export function ownerOf(review: string): Owner | null {
  const token = OWNER.exec(review)?.[1];
  if (token === undefined) return null;
  return { token, later: !token.startsWith('P') };
}

export interface Gap {
  id: string;
  /** Line in the ledger: the row's for `no-test`, the `Review:` line's for `v1-review`. */
  line: number;
  kind: 'no-test' | 'v1-review';
  /** The row's summary, or the `Review:` line. */
  text: string;
}

export interface GapReport {
  rows: number;
  /** Rows kept for a later phase, a v1.x item or an N-id. */
  later: number;
  gaps: Gap[];
}

export function findGaps(ledger: string): GapReport {
  const rows = parseLedger(ledger);
  const gaps: Gap[] = [];
  let later = 0;
  for (const row of rows) {
    const reviews = row.coverage.filter((cov) => cov.kind === 'review');
    const tested = row.coverage.some((cov) => cov.kind === 'test');
    if (reviews.some((cov) => ownerOf(cov.value)?.later === true)) {
      later += 1;
    } else if (!tested) {
      gaps.push({ id: row.id, line: row.line, kind: 'no-test', text: row.summary });
      continue;
    }
    for (const cov of reviews) {
      if (ownerOf(cov.value)?.later !== false) continue;
      gaps.push({ id: row.id, line: cov.line, kind: 'v1-review', text: cov.value });
    }
  }
  return { rows: rows.length, later, gaps };
}

export function formatGap(gap: Gap): string {
  const what =
    gap.kind === 'no-test'
      ? `owned by a v1 task and has no Test: line (${gap.text})`
      : `a Review: line still names a v1 task (${gap.text})`;
  return `${LEDGER}:${gap.line}  ${gap.id}  ${what}`;
}

const USAGE = 'usage: tsx scripts/ledger-gaps.ts';

export interface MainOverrides {
  productRoot?: string;
  write?: (text: string) => void;
}

export function main(argv: string[], overrides: MainOverrides = {}): number {
  const write = overrides.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const root = overrides.productRoot ?? PRODUCT_ROOT;
  if (argv.length > 0) {
    write(`unknown argument "${argv[0]}"\n${USAGE}`);
    return 2;
  }
  const path = join(root, LEDGER);
  if (!existsSync(path)) {
    write(`ledger:gaps: ${LEDGER} is missing`);
    return 2;
  }
  const report = findGaps(readFileSync(path, 'utf8'));
  for (const gap of report.gaps) write(formatGap(gap));
  const counts = `${report.rows} rows, ${report.later} kept for later owners`;
  if (report.gaps.length === 0) {
    write(`ledger:gaps: none (${counts})`);
    return 0;
  }
  write(`ledger:gaps: ${report.gaps.length} found (${counts})`);
  return 1;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}
