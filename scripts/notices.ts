/**
 * The third-party notices of the app (P09-16): `tsx scripts/notices.ts [--check]`.
 *
 * Lists every production dependency the way the licence check finds them (package.json
 * "dependencies" and "optionalDependencies", then theirs, each looked up through `node_modules`
 * as Node does) with its version, its licence id, its homepage and the text of the licence and
 * notice files it ships, and writes the list to src/generated/notices.json for the credits page.
 * The build refreshes the file too (vite.config.ts). The output holds no dates and no paths, so
 * the same installed packages always give the same bytes. `--check` writes nothing and exits 1
 * when the file is missing or stale. Exit codes: 0 done, 1 stale (`--check`), 2 setup problem.
 *
 * `readCredit` reads the credit to the app that inspired Platewise out of THIRD_PARTY_NOTICES.md;
 * the build turns it into a constant, so that app's name and notice never sit in product code.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the list goes, relative to the product root. */
export const NOTICES_FILE = 'src/generated/notices.json';

/** The file that holds the credit, relative to the product root. */
export const CREDIT_SOURCE = 'THIRD_PARTY_NOTICES.md';

/** One package as the credits page lists it. */
export interface PackageNotice {
  name: string;
  version: string;
  /** The SPDX expression from its package.json, or `UNKNOWN`. */
  license: string;
  /** Its `https:` homepage, when package.json gives one. */
  homepage: string | null;
  /** Its licence and notice files, in file-name order, or null when it ships none. */
  text: string | null;
}

export interface Notices {
  packages: PackageNotice[];
}

/** The app that inspired Platewise, as THIRD_PARTY_NOTICES.md credits it. */
export interface Credit {
  name: string;
  url: string;
  /** Its licence notice, exactly as reproduced there. */
  notice: string;
}

/** The installed packages or the notices file cannot give a right answer. */
export class NoticesError extends Error {
  override name = 'NoticesError';
}

type Manifest = Record<string, unknown>;

/** Licence and notice files: LICENSE, LICENCE.md, license-mit, COPYING, NOTICE.txt, … */
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-._][\w.-]*)?$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readManifest(dir: string): Manifest {
  const file = join(dir, 'package.json');
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new NoticesError(`cannot read ${file} (${(error as Error).message})`);
  }
  if (!isRecord(data)) throw new NoticesError(`${file} is not a JSON object`);
  return data;
}

/** The names a manifest needs at run time, required ones first; each with whether it may be absent. */
function runtimeDependencies(manifest: Manifest): Array<[name: string, optional: boolean]> {
  const names = (field: string): string[] =>
    isRecord(manifest[field]) ? Object.keys(manifest[field]) : [];
  const optional = new Set(names('optionalDependencies'));
  const required = names('dependencies').filter((name) => !optional.has(name));
  return [
    ...required.map((name): [string, boolean] => [name, false]),
    ...[...optional].map((name): [string, boolean] => [name, true]),
  ];
}

/** Node's lookup: `<dir>/node_modules/<name>` from `from` upwards; the real folder, or null. */
function findInstalled(name: string, from: string): string | null {
  let dir = from;
  for (;;) {
    if (basename(dir) !== 'node_modules') {
      const candidate = join(dir, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The SPDX expression a manifest declares, in any of the forms npm has accepted. */
export function licenseOf(manifest: Manifest): string {
  const field = manifest.license;
  if (typeof field === 'string' && field.trim()) return field.trim();
  if (isRecord(field) && typeof field.type === 'string') return field.type;
  const types = (Array.isArray(manifest.licenses) ? manifest.licenses : []).flatMap(
    (entry: unknown) =>
      typeof entry === 'string'
        ? [entry]
        : isRecord(entry) && typeof entry.type === 'string'
          ? [entry.type]
          : [],
  );
  if (types.length > 1) return `(${types.join(' OR ')})`;
  return types[0] ?? 'UNKNOWN';
}

/** Text with Unix line ends and no trailing blank space. */
const tidy = (text: string): string => text.replace(/\r\n?/g, '\n').trimEnd();

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The package's licence and notice files, joined in file-name order; null when there are none. */
function licenseText(dir: string): string | null {
  const files = readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file) && statSync(join(dir, file)).isFile())
    .sort(byCodePoint);
  const texts = files.map((file) => tidy(readFileSync(join(dir, file), 'utf8'))).filter(Boolean);
  return texts.length > 0 ? texts.join('\n\n') : null;
}

function noticeOf(dir: string, manifest: Manifest, fallbackName: string): PackageNotice {
  const homepage = manifest.homepage;
  return {
    name: typeof manifest.name === 'string' ? manifest.name : fallbackName,
    version: typeof manifest.version === 'string' ? manifest.version : '?',
    license: licenseOf(manifest),
    homepage: typeof homepage === 'string' && homepage.startsWith('https://') ? homepage : null,
    text: licenseText(dir),
  };
}

/**
 * Every production package installed under `productRoot`, sorted by name and then version. A
 * required dependency that is not installed is a NoticesError; a missing optional one is skipped.
 */
export function collectNotices(productRoot: string): Notices {
  const pending: Array<{ name: string; from: string; optional: boolean }> = runtimeDependencies(
    readManifest(productRoot),
  ).map(([name, optional]) => ({ name, from: productRoot, optional }));
  const visited = new Set<string>();
  const packages: PackageNotice[] = [];
  const missing: string[] = [];
  for (let next = pending.shift(); next; next = pending.shift()) {
    const dir = findInstalled(next.name, next.from);
    if (dir === null) {
      if (!next.optional) missing.push(next.name);
      continue;
    }
    if (visited.has(dir)) continue;
    visited.add(dir);
    const manifest = readManifest(dir);
    packages.push(noticeOf(dir, manifest, next.name));
    for (const [name, optional] of runtimeDependencies(manifest)) {
      pending.push({ name, from: dir, optional });
    }
  }
  if (missing.length > 0) {
    throw new NoticesError(`not installed: ${[...new Set(missing)].sort().join(', ')}`);
  }
  packages.sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version));
  return { packages };
}

/** The file's text: two-space JSON and a final newline, a shape Prettier leaves alone. */
export function formatNotices(notices: Notices): string {
  return `${JSON.stringify(notices, null, 2)}\n`;
}

/**
 * Writes the notices of the packages installed under `productRoot` to NOTICES_FILE when its bytes
 * would change; true when it wrote. The build calls this before anything reads the file.
 */
export function writeNotices(productRoot: string): boolean {
  const text = formatNotices(collectNotices(productRoot));
  const path = join(productRoot, NOTICES_FILE);
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

/**
 * The credit section of THIRD_PARTY_NOTICES.md: the name after "## Design inspiration:", the
 * first `https:` link under it, and the first fenced block under it (the licence notice).
 * Throws a NoticesError when a part is missing, so no build goes out without the credit.
 */
export function readCredit(markdown: string): Credit {
  const text = markdown.replace(/\r\n?/g, '\n');
  const heading = /^## Design inspiration:[ \t]*(\S.*)$/m.exec(text);
  if (!heading) {
    throw new NoticesError(`${CREDIT_SOURCE} has no "## Design inspiration: <name>" section`);
  }
  const after = text.slice(heading.index + heading[0].length);
  const end = after.search(/^## /m);
  const section = end < 0 ? after : after.slice(0, end);
  const url = /\((https:\/\/[^\s)]+)\)/.exec(section)?.[1];
  if (!url) throw new NoticesError(`${CREDIT_SOURCE}: the credit section links no https: address`);
  const fence = /^```[^\n]*\n([\s\S]*?)^```[ \t]*$/m.exec(section);
  const notice = fence ? tidy(fence[1]!) : '';
  if (!notice) throw new NoticesError(`${CREDIT_SOURCE}: the credit section has no fenced notice`);
  return { name: heading[1]!.trim(), url, notice };
}

const USAGE = 'usage: tsx scripts/notices.ts [--check]';

export interface MainOverrides {
  productRoot?: string;
  write?: (text: string) => void;
}

export function main(argv: string[], overrides: MainOverrides = {}): number {
  const write = overrides.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const root = overrides.productRoot ?? PRODUCT_ROOT;
  const unknown = argv.find((arg) => arg !== '--check');
  if (unknown !== undefined) {
    write(`unknown argument "${unknown}"\n${USAGE}`);
    return 2;
  }
  try {
    if (!argv.includes('--check')) {
      const wrote = writeNotices(root);
      write(wrote ? `notices: wrote ${NOTICES_FILE}` : `notices: ${NOTICES_FILE} is up to date`);
      return 0;
    }
    const path = join(root, NOTICES_FILE);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === formatNotices(collectNotices(root))) {
      write(`notices: ${NOTICES_FILE} is up to date`);
      return 0;
    }
    write(
      `notices: ${NOTICES_FILE} is ${current === null ? 'missing' : 'stale'}; ` +
        'run tsx scripts/notices.ts (pnpm build does it too)',
    );
    return 1;
  } catch (error) {
    if (!(error instanceof NoticesError)) throw error;
    write(`notices: ${error.message}`);
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
