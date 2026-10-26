import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globToRegExp, isGeneratedProductDir, matchesAny, readText, walkFiles } from './lib/files';
import { result, type CheckContext, type CheckResult, type Finding } from './lib/types';

export const PATTERNS_FILE = 'tooling/checks/banned-patterns.json';

/** Files that may name the reference: credits, agent notes and the plan docs. */
const EXEMPT = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/**',
  'pnpm-lock.yaml',
  PATTERNS_FILE,
].map(globToRegExp);

export interface BannedPattern {
  id: string;
  pattern: string;
  flags?: string;
  hint?: string;
}

interface Compiled extends BannedPattern {
  re: RegExp;
}

export function loadPatterns(productRoot: string): { patterns: Compiled[]; errors: string[] } {
  const file = join(productRoot, PATTERNS_FILE);
  if (!existsSync(file)) return { patterns: [], errors: [`${PATTERNS_FILE} is missing`] };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return {
      patterns: [],
      errors: [`${PATTERNS_FILE}: not valid JSON (${(err as Error).message})`],
    };
  }
  if (!Array.isArray(data)) {
    return { patterns: [], errors: [`${PATTERNS_FILE}: expected an array`] };
  }
  const patterns: Compiled[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const [i, raw] of data.entries()) {
    const p = (raw ?? {}) as Partial<BannedPattern>;
    const where = `${PATTERNS_FILE}[${i}]`;
    if (typeof p.id !== 'string' || !p.id.trim()) {
      errors.push(`${where}: "id" is missing`);
      continue;
    }
    if (ids.has(p.id)) {
      errors.push(`${where}: duplicate id "${p.id}"`);
      continue;
    }
    ids.add(p.id);
    if (typeof p.pattern !== 'string' || !p.pattern) {
      errors.push(`${where} (${p.id}): "pattern" is missing`);
      continue;
    }
    if (p.flags !== undefined && typeof p.flags !== 'string') {
      errors.push(`${where} (${p.id}): "flags" must be a string`);
      continue;
    }
    // Always global so every match is found; sticky would stop at the first miss.
    const flags = `${(p.flags ?? '').replace(/[gy]/g, '')}g`;
    try {
      patterns.push({ ...(p as BannedPattern), re: new RegExp(p.pattern, flags) });
    } catch (err) {
      errors.push(`${where} (${p.id}): bad pattern (${(err as Error).message})`);
    }
  }
  return { patterns, errors };
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function lineColOf(starts: number[], offset: number): { line: number; col: number } {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, col: offset - starts[lo]! + 1 };
}

function* matches(re: RegExp, text: string): Generator<RegExpExecArray> {
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    yield m;
    if (m[0] === '') re.lastIndex++;
  }
}

export function scanBanned(productRoot: string, patterns: Compiled[]): Finding[] {
  const findings: Finding[] = [];
  const files = walkFiles(productRoot, { skipDir: isGeneratedProductDir });
  for (const file of files) {
    if (matchesAny(file.rel, EXEMPT)) continue;
    for (const p of patterns) {
      for (const m of matches(p.re, file.rel)) {
        findings.push({
          file: file.rel,
          col: m.index + 1,
          rule: p.id,
          message: `file path matches "${m[0]}"${p.hint ? `: ${p.hint}` : ''}`,
        });
      }
    }
    const text = readText(file.abs);
    if (text === null) continue;
    let starts: number[] | null = null;
    for (const p of patterns) {
      for (const m of matches(p.re, text)) {
        starts ??= lineStarts(text);
        const { line, col } = lineColOf(starts, m.index);
        findings.push({
          file: file.rel,
          line,
          col,
          rule: p.id,
          message: `"${m[0]}"${p.hint ? `: ${p.hint}` : ''}`,
        });
      }
    }
  }
  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0),
  );
}

export async function runBanned(ctx: CheckContext): Promise<CheckResult> {
  const { patterns, errors } = loadPatterns(ctx.productRoot);
  if (errors.length > 0) {
    return result('banned', 'error', 'pattern file is invalid', { notes: errors });
  }
  const findings = scanBanned(ctx.productRoot, patterns);
  const n = findings.length;
  return result(
    'banned',
    n > 0 ? 'fail' : 'pass',
    n > 0
      ? `${n} banned name${n === 1 ? '' : 's'} in product files or paths`
      : `no banned names (${patterns.length} patterns)`,
    { findings },
  );
}
