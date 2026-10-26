export const CHECK_NAMES = [
  'similarity',
  'banned',
  'assets',
  'licenses',
  'traps',
  'acceptance',
] as const;

export type CheckName = (typeof CHECK_NAMES)[number];

/** pass and skip exit 0, fail exits 1, error (a setup problem) exits 2. */
export type Status = 'pass' | 'skip' | 'fail' | 'error';

export interface Finding {
  /** Path relative to the product root, with forward slashes. */
  file: string;
  line?: number;
  col?: number;
  /** What fired: a gate, a pattern id, a licence, a ledger rule. */
  rule: string;
  message: string;
  /** Where the match is in the reference, as `path:line`. */
  ref?: string;
  excerpt?: string;
}

export interface CheckResult {
  name: CheckName;
  status: Status;
  /** One line for the summary table. */
  summary: string;
  findings: Finding[];
  /** Warnings and setup errors, printed under the check. */
  notes: string[];
  /** Extra report lines (for example the `--closest` ranking). */
  report: string[];
}

export interface CheckContext {
  productRoot: string;
  /** The reference folder when it exists, otherwise null. */
  refRoot: string | null;
  /** The reference path that was asked for, for messages. */
  refPath: string;
  requireRef: boolean;
  strict: boolean;
  closest: number | null;
  cacheDir: string;
}

export function result(
  name: CheckName,
  status: Status,
  summary: string,
  parts: Partial<Pick<CheckResult, 'findings' | 'notes' | 'report'>> = {},
): CheckResult {
  return {
    name,
    status,
    summary,
    findings: parts.findings ?? [],
    notes: parts.notes ?? [],
    report: parts.report ?? [],
  };
}

/** A missing reference skips the check, or is a setup error under `--require-ref`. */
export function missingRef(name: CheckName, ctx: CheckContext): CheckResult {
  const why = `reference not found at ${ctx.refPath}`;
  return ctx.requireRef
    ? result(name, 'error', `${why} (--require-ref)`, { notes: [why] })
    : result(name, 'skip', `${why}; skipped`, {
        notes: [`warning: ${why}; set PLATEWISE_REF or --ref to run this check`],
      });
}
