/**
 * The initial-JS budget: `tsx scripts/bundle-budget.ts [--dist <dir>]`, after `pnpm build`.
 * Counts the entry chunk in dist/.vite/manifest.json plus every chunk it imports statically,
 * gzipped. Chunks reached only through dynamic imports load on demand: they are listed apart and
 * never counted. Exit code: 0 within budget, 1 over budget, 2 setup problem (no build, a bad
 * manifest, a file missing).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 250 kB of gzip, with 1 kB = 1000 bytes as in Vite's own build report (architecture §6). */
export const BUDGET_BYTES = 250_000;

/** Where Vite writes the manifest inside the output folder (`build.manifest = true`). */
export const MANIFEST_FILE = '.vite/manifest.json';

/** The app's page entry; preferred when a manifest holds more than one entry. */
const PAGE_ENTRY = 'index.html';

/** The fields of a Vite manifest chunk this script uses. */
interface Chunk {
  file: string;
  isEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}

type Manifest = Record<string, Chunk>;

export interface SizedFile {
  file: string;
  raw: number;
  gzip: number;
}

export interface BudgetReport {
  /** Manifest key of the entry chunk. */
  entry: string;
  /** The entry and its static imports, in discovery order: the start-up download. */
  counted: SizedFile[];
  /** Chunks reached only through dynamic imports; never counted. */
  lazy: SizedFile[];
  /** Sum of the counted gzip sizes, in bytes. */
  total: number;
  budget: number;
}

/** The manifest and the build output do not fit together, so no number would be right. */
export class BudgetSetupError extends Error {
  override name = 'BudgetSetupError';
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function parseManifest(text: string): Manifest {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new BudgetSetupError(`the manifest is not valid JSON (${(error as Error).message})`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BudgetSetupError('the manifest is not a JSON object');
  }
  for (const [key, raw] of Object.entries(data)) {
    const chunk = (raw ?? {}) as Record<string, unknown>;
    const fieldsOk =
      typeof chunk.file === 'string' &&
      (chunk.imports === undefined || isStringArray(chunk.imports)) &&
      (chunk.dynamicImports === undefined || isStringArray(chunk.dynamicImports));
    if (!fieldsOk) throw new BudgetSetupError(`manifest entry "${key}" is malformed`);
  }
  return data as Manifest;
}

function findEntry(manifest: Manifest): string {
  if (manifest[PAGE_ENTRY]?.isEntry) return PAGE_ENTRY;
  const entries = Object.keys(manifest).filter((key) => {
    const chunk = manifest[key]!;
    return chunk.isEntry === true && /\.m?js$/.test(chunk.file);
  });
  if (entries.length === 1) return entries[0]!;
  if (entries.length === 0) throw new BudgetSetupError('the manifest has no entry chunk');
  throw new BudgetSetupError(
    `the manifest has ${entries.length} entry chunks and no "${PAGE_ENTRY}": ${entries.join(', ')}`,
  );
}

/**
 * Measures the start-up JavaScript of a build. Pure apart from `readFile`, which returns the bytes
 * of a file named in the manifest (a path relative to the output folder) and may throw.
 * Throws a BudgetSetupError when the manifest is unusable or a file cannot be read.
 */
export function measureBundle(
  manifestText: string,
  readFile: (file: string) => Uint8Array,
  budget: number = BUDGET_BYTES,
): BudgetReport {
  const manifest = parseManifest(manifestText);
  const entry = findEntry(manifest);
  const chunkAt = (key: string, from: string): Chunk => {
    const chunk = manifest[key];
    if (!chunk) {
      throw new BudgetSetupError(`"${from}" imports "${key}", which is not in the manifest`);
    }
    return chunk;
  };

  // Static closure of the entry: everything the browser fetches before the app can start.
  const staticKeys: string[] = [];
  const isStatic = new Set<string>();
  const pending: Array<[key: string, from: string]> = [[entry, entry]];
  while (pending.length > 0) {
    const [key, from] = pending.pop()!;
    if (isStatic.has(key)) continue;
    const chunk = chunkAt(key, from);
    isStatic.add(key);
    staticKeys.push(key);
    for (const next of [...(chunk.imports ?? [])].reverse()) pending.push([next, key]);
  }

  // Everything reachable from there through a dynamic import that is not already static.
  const lazyKeys: string[] = [];
  const isLazy = new Set<string>();
  const queue: Array<[key: string, from: string]> = staticKeys.flatMap((key) =>
    (manifest[key]!.dynamicImports ?? []).map((next): [string, string] => [next, key]),
  );
  while (queue.length > 0) {
    const [key, from] = queue.shift()!;
    if (isStatic.has(key) || isLazy.has(key)) continue;
    const chunk = chunkAt(key, from);
    isLazy.add(key);
    lazyKeys.push(key);
    for (const next of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
      queue.push([next, key]);
    }
  }

  const sized = (key: string): SizedFile => {
    const file = manifest[key]!.file;
    let bytes: Uint8Array;
    try {
      bytes = readFile(file);
    } catch (error) {
      throw new BudgetSetupError(`cannot read ${file} (${(error as Error).message})`);
    }
    return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
  };
  const counted = staticKeys.map(sized);
  const lazy = lazyKeys.map(sized);
  const total = counted.reduce((sum, f) => sum + f.gzip, 0);
  return { entry, counted, lazy, total, budget };
}

export function isOverBudget(report: BudgetReport): boolean {
  return report.total > report.budget;
}

const kB = (bytes: number): string => `${(bytes / 1000).toFixed(2)} kB`;

function table(rows: SizedFile[], footer: Array<[label: string, gzip: string]> = []): string[] {
  const body = rows.map((f) => [f.file, kB(f.raw), kB(f.gzip)]);
  const all = [['file', 'raw', 'gzip'], ...body, ...footer.map(([label, g]) => [label, '', g])];
  const widths = [0, 1, 2].map((i) => Math.max(...all.map((row) => row[i]!.length)));
  const line = (row: string[]): string =>
    [row[0]!.padEnd(widths[0]!), row[1]!.padStart(widths[1]!), row[2]!.padStart(widths[2]!)]
      .join('  ')
      .trimEnd();
  return all.map(line);
}

export function formatReport(report: BudgetReport): string {
  const headroom = report.budget - report.total;
  const lines = [
    `Initial JS: entry ${report.entry} and its static imports (gzip, 1 kB = 1000 bytes)`,
    ...table(report.counted, [
      ['total', kB(report.total)],
      ['budget', kB(report.budget)],
      ['headroom', kB(headroom)],
    ]),
    '',
    'Lazy chunks (dynamic imports; loaded on demand, not counted)',
    ...(report.lazy.length > 0 ? table(report.lazy) : ['(none)']),
    '',
  ];
  if (isOverBudget(report)) {
    lines.push(
      `FAIL: initial JS is ${kB(report.total)} gzip, ${kB(-headroom)} over the ${kB(report.budget)} budget.`,
      `Counted files: ${report.counted.map((f) => f.file).join(', ')}`,
      'Load the heavy part on demand (a dynamic import) or drop it.',
    );
  } else {
    lines.push(
      `PASS: initial JS is ${kB(report.total)} gzip, ${kB(headroom)} under the ${kB(report.budget)} budget.`,
    );
  }
  return lines.join('\n');
}

const USAGE = 'usage: tsx scripts/bundle-budget.ts [--dist <dir>]   (default: dist)';

export interface MainOverrides {
  productRoot?: string;
  write?: (text: string) => void;
}

export function main(argv: string[], overrides: MainOverrides = {}): number {
  const write = overrides.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  let distDir = join(overrides.productRoot ?? PRODUCT_ROOT, 'dist');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [flag, inline] = arg.startsWith('--dist=') ? ['--dist', arg.slice(7)] : [arg];
    if (flag !== '--dist') {
      write(`unknown argument "${arg}"\n${USAGE}`);
      return 2;
    }
    const value = inline ?? argv[++i];
    if (!value) {
      write(`--dist needs a folder\n${USAGE}`);
      return 2;
    }
    distDir = resolve(value);
  }

  const manifestPath = join(distDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    write(
      `bundle budget: no build manifest at ${manifestPath}; run pnpm build first ` +
        '(vite.config.ts needs build.manifest = true)',
    );
    return 2;
  }
  try {
    const report = measureBundle(readFileSync(manifestPath, 'utf8'), (file) =>
      readFileSync(join(distDir, file)),
    );
    write(formatReport(report));
    return isOverBudget(report) ? 1 : 0;
  } catch (error) {
    if (!(error instanceof BudgetSetupError)) throw error;
    write(`bundle budget: ${error.message} (in ${manifestPath})`);
    return 2;
  }
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
