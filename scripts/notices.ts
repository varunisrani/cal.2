/**
 * The third-party notices of the app (P09-16, P10-14): `tsx scripts/notices.ts [--check]`.
 *
 * Lists every production dependency the way the licence check finds them (package.json
 * "dependencies" and "optionalDependencies", then theirs, each looked up through `node_modules`
 * as Node does) with its version, its licence id, its homepage and the text of the licence and
 * notice files it ships, plus the code some of them bundle under other licences (BUNDLED_CODE),
 * and writes the list twice: in full to src/generated/notices.json for the credits page, and as
 * the "Runtime dependencies" section of THIRD_PARTY_NOTICES.md (names, versions, licences and
 * project pages). The libraries the Android app's APK carries besides the web build (P11-05) come
 * from a hand-kept table (ANDROID_LIBRARIES), with the standard text of each of their licences
 * read once from scripts/licenses/; they go to the same two files, as an `android` list and an
 * "Android app" section. The build refreshes both files (vite.config.ts). The output holds no
 * dates and no paths, so the same installed packages always give the same bytes. `--check`
 * writes nothing and exits 1 when a file is missing or stale. Exit codes: 0 done, 1 stale
 * (`--check`), 2 setup problem.
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

/** The heading of the Android app's section, which this script writes after the dependencies. */
export const ANDROID_HEADING = '## Android app';

/**
 * The standard licence texts the Android list refers to, one `<SPDX id>.txt` each, next to this
 * script: the SPDX License List's plain-text files, release v3.29.0, unchanged
 * (https://raw.githubusercontent.com/spdx/license-list-data/v3.29.0/text/<id>.txt). The one
 * `LicenseRef-` file is ours: it names the terms Google publishes its Play services libraries
 * under and the open-source parts those libraries say they contain.
 */
export const LICENSE_TEXTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'licenses');

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
  /** The Android app's own libraries (ANDROID_LIBRARIES), sorted by name. */
  android: AndroidLibrary[];
  /** The standard text of each licence the `android` list names, once each, by SPDX id. */
  licenseTexts: Record<string, string>;
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

/**
 * A library the Android app's APK carries besides the web build (P11-05). Gradle, not
 * node_modules, decides which ones, so the list is written by hand from Gradle's report of the
 * app's runtime classpath (the release and debug ones are the same):
 *
 *   cd android && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath
 *
 * (add `--init-script ../scripts/android/mirror.init.gradle` with PLATEWISE_MAVEN_MIRROR=1 where
 * Maven Central refuses requests). Re-read it after any change under android/ that touches a
 * dependency. Licences and pages come from each library's POM, checked against its project.
 */
export interface AndroidLibrary {
  /** Maven `group:artifact`, or the npm package of Capacitor's own Android library. */
  name: string;
  version: string;
  /** Its SPDX licence id; LICENSE_TEXTS_DIR holds the text as `<id>.txt`. */
  license: string;
  homepage: string;
  /** The copyright line the MIT and BSD licences ask to keep with their text; null for the rest. */
  copyright: string | null;
}

const ANDROIDX = 'https://developer.android.com/jetpack/androidx/releases/';
const COROUTINES = 'https://github.com/Kotlin/kotlinx.coroutines';
const GUAVA = 'https://github.com/google/guava';
const PLAY_SERVICES = 'https://developers.google.com/android/guides/setup';

/** A Google Play services library, published under the Android SDK terms (LicenseRef-Android-SDK). */
const playServices = (name: string, version: string): AndroidLibrary => ({
  name,
  version,
  license: 'LicenseRef-Android-SDK',
  homepage: PLAY_SERVICES,
  copyright: null,
});

/** An Apache-2.0 library, which asks for no copyright line beside the licence text. */
const apache = (name: string, version: string, homepage: string): AndroidLibrary => ({
  name,
  version,
  license: 'Apache-2.0',
  homepage,
  copyright: null,
});

/**
 * What the APK carries, read from Gradle's report on 2026-10-27 (Capacitor 7.6.9, Health Connect
 * client 1.1.0, Kotlin 2.2.21) and again on 2026-10-28 for Play services auth 22.0.0 (Drive
 * backups, D-16.97; licence exception in tooling/checks/licenses.allow.json): every resolved module but the two BOMs (`kotlin-bom`,
 * `kotlinx-coroutines-bom`, version constraints with no code) and Capacitor's generated
 * `capacitor-cordova-android-plugins` module (empty: Platewise uses no Cordova plugin). Copyright
 * lines: Capacitor's from @capacitor/android's LICENSE; the protobuf runtime's from the protobuf
 * project's LICENSE (the jar ships the BSD text without it); jsr305's from the JSR 305 reference
 * implementation's LICENSE (its POM says Apache-2.0, the JSR 305 project publishes it under BSD);
 * checker-qual's from the jar's META-INF/LICENSE.txt.
 */
export const ANDROID_LIBRARIES: readonly AndroidLibrary[] = [
  {
    name: '@capacitor/android',
    version: '7.6.9',
    license: 'MIT',
    homepage: 'https://capacitorjs.com',
    copyright: 'Copyright (c) 2017-present Drifty Co.',
  },
  apache('androidx.activity:activity', '1.9.2', `${ANDROIDX}activity`),
  apache('androidx.annotation:annotation', '1.8.1', `${ANDROIDX}annotation`),
  apache('androidx.annotation:annotation-experimental', '1.4.1', `${ANDROIDX}annotation`),
  apache('androidx.annotation:annotation-jvm', '1.8.1', `${ANDROIDX}annotation`),
  apache('androidx.appcompat:appcompat', '1.7.0', `${ANDROIDX}appcompat`),
  apache('androidx.appcompat:appcompat-resources', '1.7.0', `${ANDROIDX}appcompat`),
  apache('androidx.arch.core:core-common', '2.2.0', `${ANDROIDX}arch-core`),
  apache('androidx.arch.core:core-runtime', '2.2.0', `${ANDROIDX}arch-core`),
  apache('androidx.collection:collection', '1.4.2', `${ANDROIDX}collection`),
  apache('androidx.collection:collection-jvm', '1.4.2', `${ANDROIDX}collection`),
  apache('androidx.concurrent:concurrent-futures', '1.1.0', `${ANDROIDX}concurrent`),
  apache('androidx.coordinatorlayout:coordinatorlayout', '1.2.0', `${ANDROIDX}coordinatorlayout`),
  apache('androidx.core:core', '1.15.0', `${ANDROIDX}core`),
  apache('androidx.core:core-ktx', '1.15.0', `${ANDROIDX}core`),
  apache('androidx.core:core-splashscreen', '1.0.1', `${ANDROIDX}core`),
  apache('androidx.cursoradapter:cursoradapter', '1.0.0', `${ANDROIDX}cursoradapter`),
  apache('androidx.customview:customview', '1.0.0', `${ANDROIDX}customview`),
  apache('androidx.drawerlayout:drawerlayout', '1.0.0', `${ANDROIDX}drawerlayout`),
  apache('androidx.emoji2:emoji2', '1.3.0', `${ANDROIDX}emoji2`),
  apache('androidx.emoji2:emoji2-views-helper', '1.3.0', `${ANDROIDX}emoji2`),
  apache('androidx.fragment:fragment', '1.8.4', `${ANDROIDX}fragment`),
  apache('androidx.health.connect:connect-client', '1.1.0', `${ANDROIDX}health-connect`),
  {
    name: 'androidx.health.connect:connect-client-external-protobuf',
    version: '1.1.0',
    license: 'BSD-3-Clause',
    homepage: `${ANDROIDX}health-connect`,
    copyright: 'Copyright 2008 Google Inc. All rights reserved.',
  },
  apache('androidx.health.connect:connect-client-proto', '1.1.0', `${ANDROIDX}health-connect`),
  apache('androidx.interpolator:interpolator', '1.0.0', `${ANDROIDX}interpolator`),
  apache('androidx.lifecycle:lifecycle-common', '2.6.2', `${ANDROIDX}lifecycle`),
  apache('androidx.lifecycle:lifecycle-livedata-core', '2.6.2', `${ANDROIDX}lifecycle`),
  apache('androidx.lifecycle:lifecycle-process', '2.6.2', `${ANDROIDX}lifecycle`),
  apache('androidx.lifecycle:lifecycle-runtime', '2.6.2', `${ANDROIDX}lifecycle`),
  apache('androidx.lifecycle:lifecycle-viewmodel', '2.6.2', `${ANDROIDX}lifecycle`),
  apache('androidx.lifecycle:lifecycle-viewmodel-savedstate', '2.6.2', `${ANDROIDX}lifecycle`),
  apache('androidx.loader:loader', '1.1.0', `${ANDROIDX}loader`),
  apache('androidx.profileinstaller:profileinstaller', '1.3.1', `${ANDROIDX}profileinstaller`),
  apache(
    'androidx.resourceinspection:resourceinspection-annotation',
    '1.0.1',
    `${ANDROIDX}resourceinspection`,
  ),
  apache('androidx.savedstate:savedstate', '1.2.1', `${ANDROIDX}savedstate`),
  apache('androidx.startup:startup-runtime', '1.1.1', `${ANDROIDX}startup`),
  apache('androidx.tracing:tracing', '1.2.0', `${ANDROIDX}tracing`),
  apache('androidx.vectordrawable:vectordrawable', '1.1.0', `${ANDROIDX}vectordrawable`),
  apache('androidx.vectordrawable:vectordrawable-animated', '1.1.0', `${ANDROIDX}vectordrawable`),
  apache(
    'androidx.versionedparcelable:versionedparcelable',
    '1.1.1',
    `${ANDROIDX}versionedparcelable`,
  ),
  apache('androidx.viewpager:viewpager', '1.0.0', `${ANDROIDX}viewpager`),
  apache('androidx.webkit:webkit', '1.12.1', `${ANDROIDX}webkit`),
  playServices('com.google.android.gms:play-services-auth', '22.0.0'),
  playServices('com.google.android.gms:play-services-auth-api-phone', '18.0.2'),
  playServices('com.google.android.gms:play-services-auth-base', '18.0.10'),
  playServices('com.google.android.gms:play-services-base', '18.5.0'),
  playServices('com.google.android.gms:play-services-basement', '18.9.0'),
  playServices('com.google.android.gms:play-services-fido', '20.0.1'),
  playServices('com.google.android.gms:play-services-tasks', '18.2.0'),
  {
    name: 'com.google.code.findbugs:jsr305',
    version: '3.0.2',
    license: 'BSD-3-Clause',
    homepage: 'https://findbugs.sourceforge.net/',
    copyright: 'Copyright (c) 2007-2009, JSR305 expert group. All rights reserved.',
  },
  apache('com.google.errorprone:error_prone_annotations', '2.11.0', 'https://errorprone.info/'),
  apache('com.google.guava:failureaccess', '1.0.1', GUAVA),
  apache('com.google.guava:guava', '31.1-android', GUAVA),
  apache('com.google.guava:listenablefuture', '9999.0-empty-to-avoid-conflict-with-guava', GUAVA),
  apache('com.google.j2objc:j2objc-annotations', '1.3', 'https://github.com/google/j2objc'),
  apache('org.apache.cordova:framework', '10.1.1', 'https://cordova.apache.org/'),
  {
    name: 'org.checkerframework:checker-qual',
    version: '3.12.0',
    license: 'MIT',
    homepage: 'https://checkerframework.org/',
    copyright: 'Copyright 2004-present by the Checker Framework developers',
  },
  apache('org.jetbrains.kotlin:kotlin-stdlib', '2.2.21', 'https://kotlinlang.org/'),
  apache('org.jetbrains.kotlinx:kotlinx-coroutines-android', '1.10.2', COROUTINES),
  apache('org.jetbrains.kotlinx:kotlinx-coroutines-core', '1.10.2', COROUTINES),
  apache('org.jetbrains.kotlinx:kotlinx-coroutines-core-jvm', '1.10.2', COROUTINES),
  apache('org.jetbrains.kotlinx:kotlinx-coroutines-guava', '1.10.2', COROUTINES),
  apache('org.jetbrains.kotlinx:kotlinx-coroutines-play-services', '1.10.2', COROUTINES),
  apache('org.jetbrains:annotations', '23.0.0', 'https://github.com/JetBrains/java-annotations'),
  apache('org.jspecify:jspecify', '1.0.0', 'https://jspecify.dev/'),
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
 * Then the Android app's libraries (`android`, see androidNotices).
 */
export function collectNotices(
  productRoot: string,
  bundled: readonly BundledCode[] = BUNDLED_CODE,
  android: readonly AndroidLibrary[] = ANDROID_LIBRARIES,
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
  return { packages, ...androidNotices(productRoot, android) };
}

/**
 * The `android` libraries sorted by name and then version, and the text of each licence they
 * name, read once from LICENSE_TEXTS_DIR. A licence without a text there is a NoticesError, and
 * so is an entry that names an npm package (Capacitor's Android library) installed under
 * `productRoot` at another version: the table was read for that one. An entry whose npm package
 * is not installed is kept as it is.
 */
function androidNotices(
  productRoot: string,
  android: readonly AndroidLibrary[],
): Pick<Notices, 'android' | 'licenseTexts'> {
  const libraries = android
    .map((library) => ({ ...library }))
    .sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version));
  for (const library of libraries) {
    // Maven coordinates hold a colon, which no npm package name does.
    const dir = library.name.includes(':') ? null : findInstalled(library.name, productRoot);
    const installed = dir === null ? library.version : readManifest(dir).version;
    if (installed !== library.version) {
      throw new NoticesError(
        `${library.name} ${String(installed)} is installed, but ANDROID_LIBRARIES lists it at ` +
          `${library.version}: re-read the Android app's libraries from Gradle and update ` +
          'ANDROID_LIBRARIES in scripts/notices.ts',
      );
    }
  }
  const licenseTexts: Record<string, string> = {};
  for (const id of [...new Set(libraries.map((library) => library.license))].sort(byCodePoint)) {
    const file = join(LICENSE_TEXTS_DIR, `${id}.txt`);
    const text = existsSync(file) ? tidy(readFileSync(file, 'utf8')) : '';
    if (!text) {
      const users = libraries.filter((library) => library.license === id).map((each) => each.name);
      throw new NoticesError(
        `no text for the ${id} licence of ${users.join(', ')}: add scripts/licenses/${id}.txt ` +
          "(the SPDX License List's text)",
      );
    }
    licenseTexts[id] = text;
  }
  return { android: libraries, licenseTexts };
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
    'Change the script, not this section or the next: the script writes the file from here on. -->',
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
 * The Android app's section of THIRD_PARTY_NOTICES.md (P11-05), which follows the dependency
 * section to the end of the file: one line per library of the `android` list, in its order, with
 * its version, licence, project page and, where its licence asks for one, its copyright line.
 * The same Prettier-proof shapes as the dependency section.
 */
export function androidSection(notices: Notices): string {
  const lines = notices.android.map((library) => {
    const copyright = library.copyright === null ? '' : `; ${library.copyright}`;
    return (
      `- \`${library.name}\` ${library.version}: ${library.license}, <${library.homepage}>` +
      copyright
    );
  });
  return [
    ANDROID_HEADING,
    '',
    '<!-- Written by scripts/notices.ts from its ANDROID_LIBRARIES table (pnpm build runs it too). -->',
    '',
    'The Android app (`app.platewise.android`) is the web app above in a Capacitor shell. Its APK',
    'also carries these libraries, as Gradle resolves them for it (`scripts/notices.ts` names the',
    'command). The standard texts of their licences are in `scripts/licenses/`, unchanged from the',
    'SPDX License List, and once each in `src/generated/notices.json`. The MIT and BSD-3-Clause',
    'licences also ask for the copyright notice, given after the project page. The Android app',
    'adds these libraries to its Licences and credits page, each with its licence text.',
    '',
    ...lines,
    '',
  ].join('\n');
}

/** Everything this script writes into CREDIT_SOURCE, from DEPENDENCY_HEADING to the end. */
export function generatedSections(
  notices: Notices,
  bundled: readonly BundledCode[] = BUNDLED_CODE,
): string {
  return `${dependencySection(notices, bundled)}\n${androidSection(notices)}`;
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
  android: readonly AndroidLibrary[],
): Array<{ file: string; text: string }> {
  const notices = collectNotices(productRoot, bundled, android);
  const markdownPath = join(productRoot, CREDIT_SOURCE);
  if (!existsSync(markdownPath)) throw new NoticesError(`${CREDIT_SOURCE} is missing`);
  const markdown = readFileSync(markdownPath, 'utf8');
  return [
    { file: NOTICES_FILE, text: formatNotices(notices) },
    {
      file: CREDIT_SOURCE,
      text: withDependencySection(markdown, generatedSections(notices, bundled)),
    },
  ];
}

/**
 * Writes the notices of the packages installed under `productRoot` and of the Android app's
 * libraries to NOTICES_FILE and to the generated sections of CREDIT_SOURCE, each only when its
 * bytes would change; returns the files it wrote. The build calls this before anything reads them.
 */
export function writeNotices(
  productRoot: string,
  bundled: readonly BundledCode[] = BUNDLED_CODE,
  android: readonly AndroidLibrary[] = ANDROID_LIBRARIES,
): string[] {
  const written: string[] = [];
  for (const { file, text } of expectedFiles(productRoot, bundled, android)) {
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
  android?: readonly AndroidLibrary[];
  write?: (text: string) => void;
}

export function main(argv: string[], overrides: MainOverrides = {}): number {
  const write = overrides.write ?? ((text: string) => process.stdout.write(`${text}\n`));
  const root = overrides.productRoot ?? PRODUCT_ROOT;
  const bundled = overrides.bundled ?? BUNDLED_CODE;
  const android = overrides.android ?? ANDROID_LIBRARIES;
  const unknown = argv.find((arg) => arg !== '--check');
  if (unknown !== undefined) {
    write(`unknown argument "${unknown}"\n${USAGE}`);
    return 2;
  }
  const both = `${NOTICES_FILE} and ${CREDIT_SOURCE}`;
  try {
    if (!argv.includes('--check')) {
      const written = writeNotices(root, bundled, android);
      write(
        written.length > 0
          ? `notices: wrote ${written.join(' and ')}`
          : `notices: ${both} are up to date`,
      );
      return 0;
    }
    const stale = expectedFiles(root, bundled, android).flatMap(({ file, text }) => {
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
