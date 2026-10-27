// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ZXING_CPP_COMMIT } from 'zxing-wasm/reader';
import { listFromNodeModules } from '../tooling/checks/licenses';
import { TempTrees } from '../tooling/checks/lib/tempTree';
import {
  BUNDLED_CODE,
  type BundledCode,
  collectNotices,
  CREDIT_SOURCE,
  DEPENDENCY_HEADING,
  dependencySection,
  formatNotices,
  licenseOf,
  main,
  NOTICES_FILE,
  NoticesError,
  PRODUCT_ROOT,
  readCredit,
  withDependencySection,
  writeNotices,
} from './notices';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const json = (value: unknown): string => JSON.stringify(value);

/** A hand-written notices file: a credit section, then the section the script writes. */
const MADE_UP_MARKDOWN = [
  '# Third-party notices',
  '',
  '## Design inspiration: Example Planner',
  '',
  'Inspired by **Example Planner** (https://example.org/planner), which says so:',
  '',
  '```',
  'Example licence',
  '```',
  '',
  DEPENDENCY_HEADING,
  '',
  'Written by hand, before the script.',
  '',
].join('\n');

/** Code that `alpha` 1.2.0 carries inside its own files, under a licence of its own. */
const INNER: BundledCode = {
  carrier: { name: 'alpha', version: '1.2.0' },
  name: 'inner',
  version: '?',
  license: 'BSD-3-Clause',
  homepage: 'https://inner.example',
  licenseUrl: 'https://inner.example/LICENSE',
};

/**
 * A made-up install: the root needs `zeta` and `alpha` and may use `ghost` (not installed);
 * both need `shared`, which `zeta` gets at its own version from a nested node_modules.
 */
function madeUpInstall(): string {
  return trees.make({
    [CREDIT_SOURCE]: MADE_UP_MARKDOWN,
    'package.json': json({
      name: 'host-app',
      version: '1.0.0',
      dependencies: { zeta: '^2.0.0', alpha: '^1.0.0' },
      optionalDependencies: { ghost: '^1.0.0' },
      devDependencies: { tooling: '^1.0.0' },
    }),
    'node_modules/alpha/package.json': json({
      name: 'alpha',
      version: '1.2.0',
      license: 'MIT',
      homepage: 'https://alpha.example',
      dependencies: { shared: '^1.0.0' },
    }),
    // CRLF line ends and trailing blank lines; a NOTICE after the licence, by file name.
    'node_modules/alpha/NOTICE': 'Alpha notice line.\r\n\r\n',
    'node_modules/alpha/LICENSE': 'Alpha licence, first line.\r\nSecond line.\r\n\r\n\r\n',
    'node_modules/alpha/README.md': 'Not a licence.',
    'node_modules/zeta/package.json': json({
      name: 'zeta',
      version: '2.0.0',
      license: { type: 'ISC' },
      homepage: 'http://insecure.example',
      dependencies: { shared: '^2.0.0' },
    }),
    'node_modules/zeta/license-one': 'One way.',
    'node_modules/zeta/license-two': 'Another way.',
    'node_modules/zeta/node_modules/shared/package.json': json({
      name: 'shared',
      version: '2.0.0',
      licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }],
    }),
    'node_modules/shared/package.json': json({ name: 'shared', version: '1.0.0' }),
    'node_modules/tooling/package.json': json({ name: 'tooling', version: '1.0.0' }),
  });
}

describe('collectNotices', () => {
  it('lists exactly the production packages the licence check judges, with their licences', () => {
    // Bundled code has no package.json, so the licence check cannot see it: leave it out here.
    const notices = collectNotices(PRODUCT_ROOT, []).packages;
    const checked = listFromNodeModules(PRODUCT_ROOT);
    expect(checked.missing).toEqual([]);
    const key = (p: { name: string; version: string; license: string }) =>
      `${p.name}@${p.version} ${p.license}`;
    expect(notices.map(key).sort()).toEqual(checked.pkgs.map(key).sort());
    // The app's own runtime packages are among them, each with a licence text.
    for (const name of ['react', 'react-dom', 'dexie', 'zxing-wasm']) {
      expect(notices.find((p) => p.name === name)?.text).toEqual(expect.stringMatching(/\S/));
    }
  });

  it('walks dependencies of dependencies, sorted by name and version, skipping dev and absent optional ones', () => {
    // The default table names zxing-wasm, which this tree lacks: its entries add nothing.
    const notices = collectNotices(madeUpInstall()).packages;
    expect(notices.map((p) => `${p.name}@${p.version}`)).toEqual([
      'alpha@1.2.0',
      'shared@1.0.0',
      'shared@2.0.0',
      'zeta@2.0.0',
    ]);
  });

  it('reads licence and notice files in file-name order, with Unix line ends and no trailing blank lines', () => {
    const [alpha, shared1, shared2, zeta] = collectNotices(madeUpInstall()).packages;
    expect(alpha).toEqual({
      name: 'alpha',
      version: '1.2.0',
      license: 'MIT',
      homepage: 'https://alpha.example',
      text: 'Alpha licence, first line.\nSecond line.\n\nAlpha notice line.',
    });
    expect(zeta).toMatchObject({
      license: 'ISC',
      homepage: null,
      text: 'One way.\n\nAnother way.',
    });
    // No licence field and no licence file: listed all the same.
    expect(shared1).toMatchObject({ license: 'UNKNOWN', homepage: null, text: null });
    expect(shared2).toMatchObject({ license: '(MIT OR Apache-2.0)', text: null });
  });

  it('adds the code a package bundles, pinned to the version it was read from, with no text', () => {
    const notices = collectNotices(madeUpInstall(), [INNER]).packages;
    expect(notices.map((p) => `${p.name}@${p.version}`)).toEqual([
      'alpha@1.2.0',
      'inner@?',
      'shared@1.0.0',
      'shared@2.0.0',
      'zeta@2.0.0',
    ]);
    expect(notices[1]).toEqual({
      name: 'inner',
      version: '?',
      license: 'BSD-3-Clause',
      homepage: 'https://inner.example',
      text: null,
    });
  });

  it('refuses a carrying package at another version than the table was read from', () => {
    const stale: BundledCode = { ...INNER, carrier: { name: 'alpha', version: '1.1.0' } };
    expect(() => collectNotices(madeUpInstall(), [stale])).toThrow(NoticesError);
    expect(() => collectNotices(madeUpInstall(), [stale])).toThrow(
      /alpha 1\.2\.0 is installed, but the entry for the inner code it bundles was read from 1\.1\.0/,
    );
  });

  it('lists zxing-cpp and zint, bundled in zxing-wasm, which ships neither licence text', () => {
    const notices = collectNotices(PRODUCT_ROOT).packages;
    const carrier = notices.find((p) => p.name === 'zxing-wasm');
    for (const name of ['zxing-cpp', 'zint']) {
      const code = BUNDLED_CODE.find((each) => each.name === name);
      expect(code?.carrier).toEqual({ name: 'zxing-wasm', version: carrier?.version });
      expect(notices.find((p) => p.name === name)).toEqual({
        name,
        version: code?.version,
        license: code?.license,
        homepage: code?.homepage,
        text: null,
      });
    }
    // The commit the table names is the one the installed package says it was built from.
    const zxingCpp = BUNDLED_CODE.find((each) => each.name === 'zxing-cpp')!;
    expect(ZXING_CPP_COMMIT.startsWith(zxingCpp.version.replace(/^commit /, ''))).toBe(true);
  });

  it('refuses an install that lacks a required package', () => {
    const root = trees.make({
      'package.json': json({ name: 'host-app', dependencies: { absent: '^1.0.0' } }),
    });
    expect(() => collectNotices(root)).toThrow(NoticesError);
    expect(() => collectNotices(root)).toThrow(/not installed: absent/);
  });
});

describe('licenseOf', () => {
  it.each([
    [{ license: ' MIT ' }, 'MIT'],
    [{ license: { type: 'BSD-3-Clause' } }, 'BSD-3-Clause'],
    [{ licenses: ['ISC'] }, 'ISC'],
    [{ licenses: [{ type: 'MIT' }, 'Apache-2.0'] }, '(MIT OR Apache-2.0)'],
    [{ license: '' }, 'UNKNOWN'],
    [{}, 'UNKNOWN'],
  ])('reads %j as %s', (manifest, expected) => {
    expect(licenseOf(manifest)).toBe(expected);
  });
});

describe('the notices file', () => {
  it('comes out byte for byte the same on every run', () => {
    const first = formatNotices(collectNotices(PRODUCT_ROOT));
    const second = formatNotices(collectNotices(PRODUCT_ROOT));
    expect(second).toBe(first);
    expect(first.endsWith('}\n')).toBe(true);
    // Nothing that differs between machines or days.
    expect(first).not.toContain(PRODUCT_ROOT);
    expect(first).not.toContain('node_modules');
  });

  it('matches the installed packages as committed (tsx scripts/notices.ts or a build refreshes it)', () => {
    const committed = readFileSync(join(PRODUCT_ROOT, NOTICES_FILE), 'utf8');
    expect(committed).toBe(formatNotices(collectNotices(PRODUCT_ROOT)));
  });

  it('the committed THIRD_PARTY_NOTICES.md matches the installed packages, under the hand-written credit', () => {
    const committed = readFileSync(join(PRODUCT_ROOT, CREDIT_SOURCE), 'utf8');
    const section = dependencySection(collectNotices(PRODUCT_ROOT));
    expect(committed).toBe(withDependencySection(committed, section));
    expect(committed.endsWith(`\n${section}`)).toBe(true);
    for (const name of ['react', 'dexie', 'zxing-wasm', 'zxing-cpp', 'zint']) {
      expect(section).toContain(`- \`${name}\` `);
    }
  });

  it('is written only when its bytes change, one file at a time', () => {
    const root = madeUpInstall();
    expect(writeNotices(root)).toEqual([NOTICES_FILE, CREDIT_SOURCE]);
    const text = readFileSync(join(root, NOTICES_FILE), 'utf8');
    expect(JSON.parse(text).packages).toHaveLength(4);
    expect(writeNotices(root)).toEqual([]);

    writeFileSync(join(root, CREDIT_SOURCE), MADE_UP_MARKDOWN);
    expect(writeNotices(root)).toEqual([CREDIT_SOURCE]);
  });
});

describe('dependencySection', () => {
  const notices = () => collectNotices(madeUpInstall(), [INNER]);

  it('lists every notice on one line: name, version, licence, project page, and what it lacks', () => {
    const section = dependencySection(notices(), [INNER]);
    expect(section.startsWith(`${DEPENDENCY_HEADING}\n\n<!-- Written by scripts/notices.ts`)).toBe(
      true,
    );
    expect(section.split('\n').filter((line) => line.startsWith('- '))).toEqual([
      '- `alpha` 1.2.0: MIT, <https://alpha.example>',
      '- `inner` (version not recorded): BSD-3-Clause, <https://inner.example>; bundled in ' +
        '`alpha` 1.2.0, which ships no copy of this licence text (it is at ' +
        '<https://inner.example/LICENSE>)',
      '- `shared` 1.0.0: UNKNOWN; ships no licence text of its own',
      '- `shared` 2.0.0: (MIT OR Apache-2.0); ships no licence text of its own',
      '- `zeta` 2.0.0: ISC',
    ]);
    // Nothing Prettier would realign or rewrap, and one final newline.
    expect(section).not.toMatch(/^\|/m);
    expect(section.endsWith(': ISC\n')).toBe(true);
  });

  it('replaces the file from its heading to the end, keeping the credit above it', () => {
    const section = dependencySection(notices(), [INNER]);
    const markdown = `${MADE_UP_MARKDOWN}## Later\n\nAlso replaced.\n`.replace(/\n/g, '\r\n');
    const next = withDependencySection(markdown, section);
    const head = MADE_UP_MARKDOWN.slice(0, MADE_UP_MARKDOWN.indexOf(DEPENDENCY_HEADING));
    expect(next).toBe(head + section);
    expect(readCredit(next)).toEqual(readCredit(MADE_UP_MARKDOWN));
    expect(withDependencySection(next, section)).toBe(next);
  });

  it('refuses a file without the heading', () => {
    const markdown = MADE_UP_MARKDOWN.replace(DEPENDENCY_HEADING, '## Packages');
    expect(() => withDependencySection(markdown, 'x')).toThrow(NoticesError);
    expect(() => withDependencySection(markdown, 'x')).toThrow(/no "## Runtime dependencies"/);
  });
});

describe('main', () => {
  it('writes both files, then --check finds them up to date', () => {
    const root = madeUpInstall();
    const out: string[] = [];
    const write = (text: string) => out.push(text);
    expect(main(['--check'], { productRoot: root, write })).toBe(1);
    expect(existsSync(join(root, NOTICES_FILE))).toBe(false);
    expect(readFileSync(join(root, CREDIT_SOURCE), 'utf8')).toBe(MADE_UP_MARKDOWN);
    expect(out.at(-1)).toBe(
      `notices: ${NOTICES_FILE} is missing; ${CREDIT_SOURCE} is stale; ` +
        'run tsx scripts/notices.ts (pnpm build does it too)',
    );

    expect(main([], { productRoot: root, write })).toBe(0);
    expect(out.at(-1)).toBe(`notices: wrote ${NOTICES_FILE} and ${CREDIT_SOURCE}`);
    expect(existsSync(join(root, NOTICES_FILE))).toBe(true);
    expect(main(['--check'], { productRoot: root, write })).toBe(0);
    expect(out.at(-1)).toMatch(/are up to date/);
    expect(main([], { productRoot: root, write })).toBe(0);
    expect(out.at(-1)).toMatch(/are up to date/);
  });

  it('calls a file from other packages stale, and leaves it as it was', () => {
    const root = madeUpInstall();
    main([], { productRoot: root, write: () => undefined });
    const path = join(root, NOTICES_FILE);
    const stale = readFileSync(path, 'utf8').replace('1.2.0', '1.1.0');
    writeFileSync(path, stale);
    const out: string[] = [];
    expect(main(['--check'], { productRoot: root, write: (text) => out.push(text) })).toBe(1);
    expect(out.at(-1)).toMatch(new RegExp(`^notices: ${NOTICES_FILE} is stale; run`));
    expect(readFileSync(path, 'utf8')).toBe(stale);
  });

  it('checks the bundled-code table it is given', () => {
    const root = madeUpInstall();
    const write = () => undefined;
    main([], { productRoot: root, write });
    expect(main(['--check'], { productRoot: root, write, bundled: [INNER] })).toBe(1);
    expect(main([], { productRoot: root, write, bundled: [INNER] })).toBe(0);
    expect(readFileSync(join(root, CREDIT_SOURCE), 'utf8')).toContain('- `inner` ');
  });

  it('exits 2 when the notices file or its heading is missing', () => {
    const out: string[] = [];
    const write = (text: string) => out.push(text);
    const bare = trees.make({ 'package.json': json({ name: 'host-app' }) });
    expect(main(['--check'], { productRoot: bare, write })).toBe(2);
    expect(out.at(-1)).toBe(`notices: ${CREDIT_SOURCE} is missing`);

    const headless = madeUpInstall();
    writeFileSync(join(headless, CREDIT_SOURCE), '# Third-party notices\n');
    expect(main([], { productRoot: headless, write })).toBe(2);
    expect(out.at(-1)).toMatch(/has no "## Runtime dependencies" section/);
    expect(existsSync(join(headless, NOTICES_FILE))).toBe(false);
  });

  it('exits 2 on a missing package or an unknown argument', () => {
    const root = trees.make({
      'package.json': json({ name: 'host-app', dependencies: { absent: '^1.0.0' } }),
    });
    const out: string[] = [];
    const write = (text: string) => out.push(text);
    expect(main([], { productRoot: root, write })).toBe(2);
    expect(out.at(-1)).toMatch(/not installed: absent/);
    expect(main(['--fix'], { productRoot: root, write })).toBe(2);
    expect(out.at(-1)).toMatch(/unknown argument "--fix"/);
  });
});

describe('readCredit', () => {
  const NOTICE = 'Example licence\n\nCopyright (c) 2026 Someone\n\nPermission text, line one.';
  const markdown = [
    '# Third-party notices',
    '',
    '## Design inspiration: Example Planner',
    '',
    'Inspired by **Example Planner** (https://example.org/planner), which says so:',
    '',
    '```',
    NOTICE,
    '```',
    '',
    '## Runtime dependencies',
    '',
    '```',
    'not this block',
    '```',
  ].join('\r\n');

  it('takes the name, the first https link and the fenced notice of the credit section', () => {
    expect(readCredit(markdown)).toEqual({
      name: 'Example Planner',
      url: 'https://example.org/planner',
      notice: NOTICE,
    });
  });

  it('reads the real credit out of THIRD_PARTY_NOTICES.md', () => {
    const credit = readCredit(readFileSync(join(PRODUCT_ROOT, CREDIT_SOURCE), 'utf8'));
    expect(credit.name).toMatch(/\S/);
    expect(credit.url).toMatch(/^https:\/\/github\.com\//);
    expect(credit.notice).toMatch(/^MIT License\n\nCopyright \(c\) 2026 /);
    expect(credit.notice).toContain('Permission is hereby granted');
    expect(credit.notice.endsWith('SOFTWARE.')).toBe(true);
  });

  it.each([
    ['no credit section', markdown.replace('## Design inspiration: Example Planner', '## Other')],
    ['no https link in it', markdown.replace('https://example.org/planner', 'example.org')],
    ['no fenced notice in it', markdown.replace(/```\r\nExample[\s\S]*?```/, 'gone')],
    ['an empty fenced notice', markdown.replace(NOTICE, '')],
  ])('refuses a file with %s', (_case, text) => {
    expect(() => readCredit(text)).toThrow(NoticesError);
  });
});
