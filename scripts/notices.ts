/**
 * The third-party notices of the app (P09-16, P10-14): `tsx scripts/notices.ts [--check]`.
 *
 * Lists every production dependency the way the licence check finds them (package.json
 * "dependencies" and "optionalDependencies", then theirs, each looked up through `node_modules`
 * as Node does) with its version, its licence id, its homepage and the text of the licence and
 * notice files it ships, plus the code some of them bundle under other licences (BUNDLED_CODE),
 * and writes the list twice: in full to src/generated/notices.json for the credits page, and as
 * the "Runtime dependencies" section of THIRD_PARTY_NOTICES.md (names, versions, licences and
 * project pages). The build refreshes both (vite.config.ts). The output holds no dates and no
 * paths, so the same installed packages always give the same bytes. `--check` writes nothing and
 * exits 1 when a file is missing or stale. Exit codes: 0 done, 1 stale (`--check`), 2 setup
 * problem.
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

/**
 * The notices file at the product root: the credit, written by hand, then the dependency list,
 * which this script writes from DEPENDENCY_HEADING to the end of the file.
 */
export const CREDIT_SOURCE = 'THIRD_PARTY_NOTICES.md';

/** The heading of the section of CREDIT_SOURCE this script writes. */
export const DEPENDENCY_HEADING = '## Runtime dependencies';

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

/**
 * Code a package carries inside its own files (here compiled into WebAssembly) under a licence of
 * its own, which no package.json declares. Each entry is written by hand from what the carrying
 * package says about it (its README) and names the version it was read from: an install of any
 * other version stops the script until someone reads that package again.
 */
export interface BundledCode {
  /** The package that carries the code, and the version this entry was read from. */
  carrier: { name: string; version: string };
  name: string;
  /** Its version as the carrying package records it; `?` when the package records none. */
  version: string;
  license: string;
  homepage: string;
  /** Where its licence text is, since the carrying package ships no copy of it. */
  licenseUrl: string;
}

/**
 * zxing-wasm 3.1.5 builds its barcode reader and writer from zxing-cpp (Apache-2.0), and its
 * writer from zint (BSD-3-Clause) as well; its README's "Licenses" section names both, with the
 * links below, and the package ships neither licence text. It exports the zxing-cpp commit as
 * ZXING_CPP_COMMIT; it records no zint version.
 */
export const BUNDLED_CODE: readonly BundledCode[] = [
  {
    carrier: { name: 'zxing-wasm', version: '3.1.5' },
    name: 'zxing-cpp',
    version: 'commit 2ecec3f',
    license: 'Apache-2.0',
    homepage: 'https://github.com/zxing-cpp/zxing-cpp',
    licenseUrl: 'https://github.com/zxing-cpp/zxing-cpp/blob/master/LICENSE',
  },
  {
    carrier: { name: 'zxing-wasm', version: '3.1.5' },
    name: 'zint',
    version: '?',
    license: 'BSD-3-Clause',
    homepage: 'https://sourceforge.net/projects/zint/',
    licenseUrl: 'https://sourceforge.net/p/zint/code/ci/master/tree/LICENSE',
  },
];

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
 * Every production package installed under `productRoot`, plus the code `bundled` says they
 * carry, sorted by name and then version. A required dependency that is not installed is a
 * NoticesError, and so is a carrying package installed at another version than its entry names;
 * a missing optional dependency is skipped, and so is an entry whose carrying package is absent.
 */
export function collectNotices(
  productRoot: string,
  bundled: readonly BundledCode[] = BUNDLED_CODE,
): Notices {
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
  packages.push(...bundledNotices(packages, bundled));
  packages.sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version));
  return { packages };
}

/** The entries of `bundled` whose carrying package is among `installed`, as notices. */
function bundledNotices(
  installed: readonly PackageNotice[],
  bundled: readonly BundledCode[],
): PackageNotice[] {
  const notices: PackageNotice[] = [];
  for (const code of bundled) {
    const carriers = installed.filter((pkg) => pkg.name === code.carrier.name);
    const other = carriers.find((pkg) => pkg.version !== code.carrier.version);
    if (other) {
      throw new NoticesError(
        `${other.name} ${other.version} is installed, but the entry for the ${code.name} code it ` +
          `bundles was read from ${code.carrier.version}: read that version's licence notes and ` +
          'update BUNDLED_CODE in scripts/notices.ts',
      );
    }
    if (carriers.length === 0) continue;
    const { name, version, license, homepage } = code;
    notices.push({ name, version, license, homepage, text: null });
  }
  return notices;
}

/** The entry of `bundled` a notice was made from, if it was made from one. */
function bundledEntry(
  notice: PackageNotice,
  bundled: readonly BundledCode[],
): BundledCode | undefined {
  return bundled.find(
    (code) => code.name === notice.name && code.version === notice.version && notice.text === null,
  );
}

/** The file's text: two-space JSON and a final newline, a shape Prettier leaves alone. */
export function formatNotices(notices: Notices): string {
  return `${JSON.stringify(notices, null, 2)}\n`;
}

/**
 * The dependency section of THIRD_PARTY_NOTICES.md, from DEPENDENCY_HEADING to the end of the
 * file: one line per notice, in the list's order. Only list items, code spans and `<https:…>`
 * links, which Prettier leaves as they are.
 */
export function dependencySection(
  notices: Notices,
  bundled: readonly BundledCode[] = BUNDLED_CODE,
): string {
  const lines = notices.packages.map((pkg) => {
    const version = pkg.version === '?' ? '(version not recorded)' : pkg.version;
    const page = pkg.homepage === null ? '' : `, <${pkg.homepage}>`;
    const code = bundledEntry(pkg, bundled);
    const note = code
      ? `; bundled in \`${code.carrier.name}\` ${code.carrier.version}, which ships no copy of ` +
        `this licence text (it is at <${code.licenseUrl}>)`
      : pkg.text === null
        ? '; ships no licence text of its own'
        : '';
    return `- \`${pkg.name}\` ${version}: ${pkg.license}${page}${note}`;
  });
  return [
    DEPENDENCY_HEADING,
    '',
    '<!-- Written by scripts/notices.ts from the installed packages (pnpm build runs it too).',
    'Change the script, not this section: it runs to the end of the file. -->',
    '',
    'The packages that ship in the app, with their licences. The licence and notice texts each',
    "package ships are in `src/generated/notices.json` and on the app's Licences and credits page;",
    '`pnpm check:licenses` checks every licence against `tooling/checks/licenses.allow.json`. Code',
    'that a package bundles under a licence of its own is listed under its own name.',
    '',
    ...lines,
    '',
  ].join('\n');
}

/**
 * `markdown` with its dependency section, from DEPENDENCY_HEADING to the end, replaced by
 * `section`; everything above the heading is kept. A file without the heading is a NoticesError.
 */
export function withDependencySection(markdown: string, section: string): string {
  const text = markdown.replace(/\r\n?/g, '\n');
  const heading = new RegExp(`^${DEPENDENCY_HEADING}[ \\t]*$`, 'm').exec(text);
  if (!heading) {
    throw new NoticesError(`${CREDIT_SOURCE} has no "${DEPENDENCY_HEADING}" section`);
  }
  return text.slice(0, heading.index) + section;
}

/** Each file this script writes, relative to the product root, with the text it should hold. */
function expectedFiles(
  productRoot: string,
  bundled: readonly BundledCode[],
): Array<{ file: string; text: string }> {
  const notices = collectNotices(productRoot, bundled);
  const markdownPath = join(productRoot, CREDIT_SOURCE);
  if (!existsSync(markdownPath)) throw new NoticesError(`${CREDIT_SOURCE} is missing`);
  const markdown = readFileSync(markdownPath, 'utf8');
  return [
    { file: NOTICES_FILE, text: formatNotices(notices) },
    {
      file: CREDIT_SOURCE,
      text: withDependencySection(markdown, dependencySection(notices, bundled)),
    },
  ];
}

/**
 * Writes the notices of the packages installed under `productRoot` to NOTICES_FILE and to the
 * dependency section of CREDIT_SOURCE, each only when its bytes would change; returns the files
 * it wrote. The build calls this before anything reads them.
 */
export function writeNotices(
  productRoot: string,
  bundled: readonly BundledCode[] = BUNDLED_CODE,
): string[] {
  const written: string[] = [];
  for (const { file, text } of expectedFiles(productRoot, bundled)) {
    const path = join(productRoot, file);
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    written.push(file);
  }
  return written;
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
  bundled?: readonly BundledCode[];
  write?: (text: string) => void;
}

export function main(argv: string[], overrides: MainOverrides = {}): number {
  const write = overrides.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const root = overrides.productRoot ?? PRODUCT_ROOT;
  const bundled = overrides.bundled ?? BUNDLED_CODE;
  const unknown = argv.find((arg) => arg !== '--check');
  if (unknown !== undefined) {
    write(`unknown argument "${unknown}"\n${USAGE}`);
    return 2;
  }
  const both = `${NOTICES_FILE} and ${CREDIT_SOURCE}`;
  try {
    if (!argv.includes('--check')) {
      const written = writeNotices(root, bundled);
      write(
        written.length > 0
          ? `notices: wrote ${written.join(' and ')}`
          : `notices: ${both} are up to date`,
      );
      return 0;
    }
    const stale = expectedFiles(root, bundled).flatMap(({ file, text }) => {
      const path = join(root, file);
      if (!existsSync(path)) return [`${file} is missing`];
      return readFileSync(path, 'utf8') === text ? [] : [`${file} is stale`];
    });
    if (stale.length === 0) {
      write(`notices: ${both} are up to date`);
      return 0;
    }
    write(`notices: ${stale.join('; ')}; run tsx scripts/notices.ts (pnpm build does it too)`);
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
