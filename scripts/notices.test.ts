// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listFromNodeModules } from '../tooling/checks/licenses';
import { TempTrees } from '../tooling/checks/lib/tempTree';
import {
  collectNotices,
  CREDIT_SOURCE,
  formatNotices,
  licenseOf,
  main,
  NOTICES_FILE,
  NoticesError,
  PRODUCT_ROOT,
  readCredit,
  writeNotices,
} from './notices';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const json = (value: unknown): string => JSON.stringify(value);

/**
 * A made-up install: the root needs `zeta` and `alpha` and may use `ghost` (not installed);
 * both need `shared`, which `zeta` gets at its own version from a nested node_modules.
 */
function madeUpInstall(): string {
  return trees.make({
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
    const notices = collectNotices(PRODUCT_ROOT).packages;
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

  it('is written only when its bytes change', () => {
    const root = madeUpInstall();
    expect(writeNotices(root)).toBe(true);
    const text = readFileSync(join(root, NOTICES_FILE), 'utf8');
    expect(JSON.parse(text).packages).toHaveLength(4);
    expect(writeNotices(root)).toBe(false);
  });
});

describe('main', () => {
  it('writes the file, then --check finds it up to date', () => {
    const root = madeUpInstall();
    const out: string[] = [];
    const write = (text: string) => out.push(text);
    expect(main(['--check'], { productRoot: root, write })).toBe(1);
    expect(existsSync(join(root, NOTICES_FILE))).toBe(false);
    expect(out.at(-1)).toMatch(/is missing/);

    expect(main([], { productRoot: root, write })).toBe(0);
    expect(existsSync(join(root, NOTICES_FILE))).toBe(true);
    expect(main(['--check'], { productRoot: root, write })).toBe(0);
    expect(out.at(-1)).toMatch(/up to date/);
  });

  it('calls a file from other packages stale, and leaves it as it was', () => {
    const root = madeUpInstall();
    main([], { productRoot: root, write: () => undefined });
    const path = join(root, NOTICES_FILE);
    const stale = readFileSync(path, 'utf8').replace('1.2.0', '1.1.0');
    writeFileSync(path, stale);
    const out: string[] = [];
    expect(main(['--check'], { productRoot: root, write: (text) => out.push(text) })).toBe(1);
    expect(out.at(-1)).toMatch(/is stale/);
    expect(readFileSync(path, 'utf8')).toBe(stale);
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
