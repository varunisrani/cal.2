import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  excerptLines,
  extOf,
  globToRegExp,
  isGeneratedProductDir,
  matchesAny,
  readText,
  walkFiles,
} from '../lib/files';
import {
  missingRef,
  result,
  type CheckContext,
  type CheckResult,
  type Finding,
} from '../lib/types';
import { findKey, windowKeys } from './hash';
import {
  CHANNELS,
  GATE,
  loadOrBuildIndex,
  MAX_FILE_BYTES,
  PROBE,
  scanFile,
  UNIT,
  type Channel,
  type RefIndex,
  type Table,
} from './refIndex';
import { CONFIG_EXTENSIONS, TEXT_EXTENSIONS, type Stream } from './scan';

export const ALLOW_FILE = 'tooling/checks/similarity/allow.json';

const PRODUCT_SKIP_FILES = [
  globToRegExp('pnpm-lock.yaml'),
  globToRegExp('tooling/checks/**/fixtures/**'),
];

export interface AllowEntry {
  path: string;
  reason: string;
}

/** Reads the allow-list; an entry without a path or a reason is a setup error. */
export function loadAllowList(productRoot: string): { entries: AllowEntry[]; errors: string[] } {
  const file = join(productRoot, ALLOW_FILE);
  if (!existsSync(file)) return { entries: [], errors: [] };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { entries: [], errors: [`${ALLOW_FILE}: not valid JSON (${(err as Error).message})`] };
  }
  if (!Array.isArray(data)) return { entries: [], errors: [`${ALLOW_FILE}: expected an array`] };
  const entries: AllowEntry[] = [];
  const errors: string[] = [];
  data.forEach((raw: unknown, i) => {
    const e = (raw ?? {}) as Partial<AllowEntry>;
    if (typeof e.path !== 'string' || !e.path.trim()) {
      errors.push(`${ALLOW_FILE}[${i}]: "path" is missing`);
    } else if (typeof e.reason !== 'string' || !e.reason.trim()) {
      errors.push(`${ALLOW_FILE}[${i}] (${e.path}): "reason" is mandatory`);
    } else {
      entries.push({ path: e.path, reason: e.reason });
    }
  });
  return { entries, errors };
}

export interface ProductFile {
  rel: string;
  abs: string;
  /** JSON/YAML/TOML config: ranked by `--closest`, never gated. */
  config: boolean;
}

export function listProductFiles(productRoot: string): ProductFile[] {
  return walkFiles(productRoot, { skipDir: isGeneratedProductDir })
    .filter((f) => TEXT_EXTENSIONS.has(extOf(f.rel)) && !matchesAny(f.rel, PRODUCT_SKIP_FILES))
    .map((f) => ({ ...f, config: CONFIG_EXTENSIONS.has(extOf(f.rel)) }));
}

/** A product stretch whose consecutive windows all occur in the reference. */
export interface Region {
  file: string;
  channel: Channel;
  startLine: number;
  endLine: number;
  /** Length in units (tokens, lines or words). */
  length: number;
  ref: string;
  excerpt: string;
}

/** Share of identifiers, numbers and strings a token window needs to count as code. */
export const MIN_CONTENT_SHARE = 0.2;

/** True for windows with enough content; streams without content flags always pass. */
function contentFilter(stream: Stream, w: number): (start: number) => boolean {
  const flags = stream.content;
  if (!flags) return () => true;
  const prefix = new Uint32Array(flags.length + 1);
  for (let i = 0; i < flags.length; i++) prefix[i + 1] = prefix[i]! + flags[i]!;
  const need = Math.ceil(w * MIN_CONTENT_SHARE);
  return (start) => prefix[start + w]! - prefix[start]! >= need;
}

/** Merges consecutive matching windows of one stream into regions (excerpt left empty). */
export function matchRegions(
  stream: Stream,
  w: number,
  table: Table,
  index: RefIndex,
  file: string,
  channel: Channel,
): Region[] {
  const keys = windowKeys(stream.ids, w);
  const enough = contentFilter(stream, w);
  const lookup = (s: number): number => (enough(s) ? findKey(table.keys, keys[s]!) : -1);
  const regions: Region[] = [];
  let k = 0;
  while (k < keys.length) {
    const hit = lookup(k);
    if (hit < 0) {
      k++;
      continue;
    }
    let end = k;
    while (end + 1 < keys.length && lookup(end + 1) >= 0) end++;
    regions.push({
      file,
      channel,
      startLine: stream.lines[k]!,
      endLine: stream.lines[end + w - 1]!,
      length: end - k + w,
      ref: `${index.files[table.file[hit]!]}:${table.line[hit]}`,
      excerpt: '',
    });
    k = end + 2;
  }
  return regions;
}

export interface SimilarityOutcome {
  findings: Finding[];
  closest: Array<Region & { score: number; gate: boolean }>;
  allowed: string[];
  scanned: number;
}

/** Compares product files with a reference index. Pure apart from reading product files. */
export function compareProduct(
  productRoot: string,
  index: RefIndex,
  options: { allow: AllowEntry[]; closest: number | null },
): SimilarityOutcome {
  const allowRes = options.allow.map((e) => globToRegExp(e.path));
  const findings: Finding[] = [];
  const probes: Region[] = [];
  const gateRegions: Region[] = [];
  const allowed: string[] = [];
  // Excerpts need the file text; probes only get one if they make the top n.
  const textOf = new Map<string, () => string[]>();
  let scanned = 0;
  for (const file of listProductFiles(productRoot)) {
    if (matchesAny(file.rel, allowRes)) {
      allowed.push(file.rel);
      continue;
    }
    if (file.config && options.closest === null) continue;
    const text = readText(file.abs, MAX_FILE_BYTES);
    if (text === null) continue;
    const scan = scanFile(file.rel, text);
    if (!scan) continue;
    scanned++;
    let split: string[] | null = null;
    const textLines = (): string[] => (split ??= text.split('\n'));
    textOf.set(file.rel, textLines);
    for (const channel of CHANNELS) {
      const stream = scan[channel];
      if (!file.config) {
        const table = index.tables[`${channel}:gate`];
        for (const r of matchRegions(stream, GATE[channel], table, index, file.rel, channel)) {
          r.excerpt = excerptLines(textLines(), r.startLine, r.endLine);
          gateRegions.push(r);
          findings.push({
            file: r.file,
            line: r.startLine,
            rule: channel,
            message: `shared run of ${r.length} ${UNIT[channel]} (gate ${GATE[channel]}), lines ${r.startLine}-${r.endLine}`,
            ref: r.ref,
            excerpt: r.excerpt,
          });
        }
      }
      if (options.closest !== null) {
        const table = index.tables[`${channel}:probe`];
        probes.push(...matchRegions(stream, PROBE[channel], table, index, file.rel, channel));
      }
    }
  }
  const closest = probes
    .map((r) => ({
      ...r,
      score: r.length / GATE[r.channel],
      gate: gateRegions.some(
        (g) =>
          g.file === r.file &&
          g.channel === r.channel &&
          g.startLine <= r.endLine &&
          r.startLine <= g.endLine,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.startLine - b.startLine)
    .slice(0, options.closest ?? 0);
  for (const r of closest) r.excerpt = excerptLines(textOf.get(r.file)!(), r.startLine, r.endLine);
  return { findings, closest, allowed, scanned };
}

export async function runSimilarity(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.refRoot) return missingRef('similarity', ctx);
  const allow = loadAllowList(ctx.productRoot);
  if (allow.errors.length > 0) {
    return result('similarity', 'error', 'allow-list is invalid', { notes: allow.errors });
  }
  const started = Date.now();
  const loaded = loadOrBuildIndex(ctx.refRoot, ctx.cacheDir);
  const indexMs = Date.now() - started;
  const outcome = compareProduct(ctx.productRoot, loaded.index, {
    allow: allow.entries,
    closest: ctx.closest,
  });
  const notes = [
    `reference index: ${loaded.index.files.length} files, ${loaded.cached ? 'cached' : 'built'} in ${(indexMs / 1000).toFixed(1)}s`,
  ];
  if (outcome.allowed.length > 0) {
    notes.push(`allow-listed (not compared): ${outcome.allowed.join(', ')}`);
  }
  const report: string[] = [];
  if (ctx.closest !== null) {
    report.push(
      `closest regions (probe ${PROBE.tokens} tokens / ${PROBE.lines} lines / ${PROBE.prose} words; score = run ÷ gate, 1.00 or more would fail; * = gate fired):`,
    );
    if (outcome.closest.length === 0) report.push('  none: no probe window is shared');
    outcome.closest.forEach((r, i) => {
      const lines = r.startLine === r.endLine ? `${r.startLine}` : `${r.startLine}-${r.endLine}`;
      report.push(
        `  ${String(i + 1).padStart(2)}. ${r.score.toFixed(2)}${r.gate ? '*' : ' '} ${r.channel.padEnd(6)} ${r.file}:${lines} ~ ${r.ref}  "${r.excerpt}"`,
      );
    });
  }
  const n = outcome.findings.length;
  return result(
    'similarity',
    n > 0 ? 'fail' : 'pass',
    n > 0
      ? `${n} shared region${n === 1 ? '' : 's'} at or over a gate`
      : `${outcome.scanned} product files under every gate (${GATE.tokens} tokens / ${GATE.lines} lines / ${GATE.prose} words)`,
    { findings: outcome.findings, notes, report },
  );
}
