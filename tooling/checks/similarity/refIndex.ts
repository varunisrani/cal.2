import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extOf, readText, walkFiles } from '../lib/files';
import { radixOrder, rollWindows, keyOf } from './hash';
import { familyOf, scanText, TEXT_EXTENSIONS, type ScanResult } from './scan';

export const CHANNELS = ['tokens', 'lines', 'prose'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Gate sizes: a shared run this long fails the check. */
export const GATE: Record<Channel, number> = { tokens: 50, lines: 6, prose: 12 };
/** Smaller windows probed by `--closest` to rank near misses. */
export const PROBE: Record<Channel, number> = { tokens: 20, lines: 3, prose: 6 };
export const UNIT: Record<Channel, string> = {
  tokens: 'code tokens',
  lines: 'lines',
  prose: 'words',
};

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
const REF_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  '.gradle',
  'Pods',
  'DerivedData',
]);
// Thousands of exercise images; the asset check covers that folder.
const REF_SKIP_PATHS = new Set(['shared/workout-vectors']);

/** Bump when the index layout or the scanner rules change in a way the source hash misses. */
const FORMAT = 1;

export type Size = 'gate' | 'probe';
export type TableName = `${Channel}:${Size}`;

/** Sorted window keys with the reference file and line of each key's first window. */
export interface Table {
  keys: Float64Array;
  file: Uint32Array;
  line: Uint32Array;
}

export interface RefIndex {
  files: string[];
  tables: Record<TableName, Table>;
}

const TABLE_NAMES: TableName[] = CHANNELS.flatMap(
  (c) => [`${c}:gate`, `${c}:probe`] as TableName[],
);

export function windowSize(name: TableName): number {
  const [channel, size] = name.split(':') as [Channel, Size];
  return size === 'gate' ? GATE[channel] : PROBE[channel];
}

export function listRefFiles(refRoot: string): string[] {
  return walkFiles(refRoot, {
    skipDir: (rel, name) => REF_SKIP_DIRS.has(name) || REF_SKIP_PATHS.has(rel),
  })
    .map((f) => f.rel)
    .filter((rel) => TEXT_EXTENSIONS.has(extOf(rel)));
}

/** Growable parallel arrays of (h1, h2, file, line). */
class Pairs {
  h1 = new Uint32Array(1 << 16);
  h2 = new Uint32Array(1 << 16);
  file = new Uint32Array(1 << 16);
  line = new Uint32Array(1 << 16);
  n = 0;

  push(h1: number, h2: number, file: number, line: number): void {
    if (this.n === this.h1.length) this.grow();
    const k = this.n++;
    this.h1[k] = h1;
    this.h2[k] = h2;
    this.file[k] = file;
    this.line[k] = line;
  }

  private grow(): void {
    const size = this.h1.length * 2;
    const next = (a: Uint32Array): Uint32Array<ArrayBuffer> => {
      const b = new Uint32Array(size);
      b.set(a);
      return b;
    };
    this.h1 = next(this.h1);
    this.h2 = next(this.h2);
    this.file = next(this.file);
    this.line = next(this.line);
  }

  /** Sorts by key and keeps the first (earliest) location of each key. */
  toTable(): Table {
    const order = radixOrder(this.h1, this.h2, this.n);
    const keys = new Float64Array(this.n);
    const file = new Uint32Array(this.n);
    const line = new Uint32Array(this.n);
    let m = 0;
    let prev = -1;
    for (let k = 0; k < this.n; k++) {
      const idx = order[k]!;
      const key = keyOf(this.h1[idx]!, this.h2[idx]!);
      if (key === prev) continue;
      prev = key;
      keys[m] = key;
      file[m] = this.file[idx]!;
      line[m] = this.line[idx]!;
      m++;
    }
    return { keys: keys.slice(0, m), file: file.slice(0, m), line: line.slice(0, m) };
  }
}

export function scanFile(rel: string, text: string): ScanResult | null {
  const family = familyOf(extOf(rel));
  return family ? scanText(text, family) : null;
}

export function buildIndex(refRoot: string): RefIndex {
  const files = listRefFiles(refRoot);
  const pairs = Object.fromEntries(TABLE_NAMES.map((t) => [t, new Pairs()])) as Record<
    TableName,
    Pairs
  >;
  const kept: string[] = [];
  for (const rel of files) {
    const text = readText(join(refRoot, rel), MAX_FILE_BYTES);
    if (text === null) continue;
    const scan = scanFile(rel, text);
    if (!scan) continue;
    const fileNo = kept.length;
    kept.push(rel);
    for (const channel of CHANNELS) {
      const stream = scan[channel];
      for (const size of ['gate', 'probe'] as const) {
        const name: TableName = `${channel}:${size}`;
        const sink = pairs[name];
        rollWindows(stream.ids, windowSize(name), (s, h1, h2) =>
          sink.push(h1, h2, fileNo, stream.lines[s]!),
        );
      }
    }
  }
  const tables = {} as Record<TableName, Table>;
  for (const name of TABLE_NAMES) tables[name] = pairs[name].toTable();
  return { files: kept, tables };
}

// ---- cache -------------------------------------------------------------------------

/** The reference HEAD commit, read from `.git` directly; falls back to `git rev-parse`. */
export function readHead(refRoot: string): string | null {
  try {
    let gitDir = join(refRoot, '.git');
    if (statSync(gitDir).isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitDir, 'utf8'));
      if (m?.[1]) gitDir = resolve(refRoot, m[1].trim());
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40,64}$/.test(head)) return head;
    const ref = /^ref:\s*(\S+)$/.exec(head)?.[1];
    if (ref) {
      const common = existsSync(join(gitDir, 'commondir'))
        ? resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim())
        : gitDir;
      for (const dir of [gitDir, common]) {
        const loose = join(dir, ref);
        if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
      }
      const packed = join(common, 'packed-refs');
      if (existsSync(packed)) {
        for (const line of readFileSync(packed, 'utf8').split('\n')) {
          const [sha, name] = line.trim().split(/\s+/);
          if (name === ref && sha) return sha;
        }
      }
    }
  } catch {
    // Fall through to git.
  }
  const git = spawnSync('git', ['-C', refRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const sha = git.status === 0 ? git.stdout.trim() : '';
  return sha || null;
}

/** Hash of the checker's own source, so a scanner change rebuilds the cache. */
function sourceHash(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const h = createHash('sha256');
  for (const dir of [here, join(here, '..', 'lib')]) {
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      h.update(name).update(readFileSync(join(dir, name)));
    }
  }
  return h.digest('hex');
}

/** Without a commit, the key falls back to the size and mtime of every indexed file. */
function treeSignature(refRoot: string): string {
  const h = createHash('sha256');
  for (const rel of listRefFiles(refRoot)) {
    const st = statSync(join(refRoot, rel));
    h.update(`${rel}\0${st.size}\0${st.mtimeMs}\n`);
  }
  return `tree-${h.digest('hex').slice(0, 16)}`;
}

export function cacheKey(refRoot: string): string {
  const head = readHead(refRoot) ?? treeSignature(refRoot);
  return createHash('sha256')
    .update(`${FORMAT}\0${resolve(refRoot)}\0${head}\0${sourceHash()}`)
    .digest('hex')
    .slice(0, 24);
}

interface Meta {
  format: number;
  key: string;
  refRoot: string;
  createdAt: string;
  files: string[];
  counts: Record<TableName, number>;
}

export function loadIndex(cacheDir: string, key: string): RefIndex | null {
  const metaPath = join(cacheDir, `${key}.json`);
  const binPath = join(cacheDir, `${key}.bin`);
  if (!existsSync(metaPath) || !existsSync(binPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Meta;
    if (meta.format !== FORMAT || meta.key !== key) return null;
    const raw = readFileSync(binPath);
    const expected = TABLE_NAMES.reduce((sum, t) => sum + meta.counts[t] * 16, 0);
    if (raw.byteLength !== expected) return null;
    // Float64Array views need an 8-byte aligned offset.
    const buf =
      raw.byteOffset % 8 === 0
        ? raw.buffer
        : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    let off = raw.byteOffset % 8 === 0 ? raw.byteOffset : 0;
    const tables = {} as Record<TableName, Table>;
    for (const name of TABLE_NAMES) {
      const n = meta.counts[name];
      const keys = new Float64Array(buf, off, n);
      off += n * 8;
      const file = new Uint32Array(buf, off, n);
      off += n * 4;
      const line = new Uint32Array(buf, off, n);
      off += n * 4;
      tables[name] = { keys, file, line };
    }
    return { files: meta.files, tables };
  } catch {
    return null;
  }
}

export function saveIndex(cacheDir: string, key: string, refRoot: string, index: RefIndex): void {
  mkdirSync(cacheDir, { recursive: true });
  // One reference index is enough; drop the ones an older key left behind.
  for (const name of readdirSync(cacheDir)) {
    if (/\.(json|bin)$/.test(name) && !name.startsWith(`${key}.`)) {
      rmSync(join(cacheDir, name), { force: true });
    }
  }
  const counts = {} as Record<TableName, number>;
  const parts: Uint8Array[] = [];
  for (const name of TABLE_NAMES) {
    const t = index.tables[name];
    counts[name] = t.keys.length;
    parts.push(new Uint8Array(t.keys.buffer, t.keys.byteOffset, t.keys.byteLength));
    parts.push(new Uint8Array(t.file.buffer, t.file.byteOffset, t.file.byteLength));
    parts.push(new Uint8Array(t.line.buffer, t.line.byteOffset, t.line.byteLength));
  }
  writeFileSync(join(cacheDir, `${key}.bin`), Buffer.concat(parts));
  const meta: Meta = {
    format: FORMAT,
    key,
    refRoot: resolve(refRoot),
    createdAt: new Date().toISOString(),
    files: index.files,
    counts,
  };
  // The metadata is written last: a half-written cache has no .json and is rebuilt.
  writeFileSync(join(cacheDir, `${key}.json`), JSON.stringify(meta));
}

export interface LoadedIndex {
  index: RefIndex;
  cached: boolean;
  key: string;
}

export function loadOrBuildIndex(refRoot: string, cacheDir: string): LoadedIndex {
  const key = cacheKey(refRoot);
  const cached = loadIndex(cacheDir, key);
  if (cached) return { index: cached, cached: true, key };
  const index = buildIndex(refRoot);
  try {
    saveIndex(cacheDir, key, refRoot, index);
  } catch {
    // A read-only cache folder only costs speed.
  }
  return { index, cached: false, key };
}
