// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadPatterns, PATTERNS_FILE, runBanned } from './banned';
import { contextFor, TempTrees } from './lib/tempTree';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const realPatterns = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'banned-patterns.json'),
  'utf8',
);

// Banned words are built from pieces so this file passes its own check.
const NAME = ['F', 'ud', ' ', 'AI'].join('');
const SHORT = ['f', 'ud'].join('');
const AUTHOR = ['apo', 'orv'].join('');
const PKG_PATH = ['calorie', 'tracker'].join('');
const PKG_ID = ['com.', AUTHOR, 'darshan'].join('');

const product = (files: Record<string, string>) =>
  trees.make({ [PATTERNS_FILE]: realPatterns, ...files });

describe('banned names', () => {
  it('reports file, line, column, pattern id and hint for content hits', async () => {
    const root = product({
      'src/app.ts': `const ok = 1;\nconst title = 'Welcome to ${NAME}';\n`,
      'src/ids.kt': `package ${PKG_ID}.${PKG_PATH}\n// by ${AUTHOR}\nval x = "${SHORT}"\n`,
    });
    const res = await runBanned(contextFor(root));
    expect(res.status).toBe('fail');
    const got = res.findings.map((f) => `${f.file}:${f.line}:${f.col} ${f.rule}`);
    expect(got).toEqual([
      'src/app.ts:2:27 product-name',
      'src/app.ts:2:27 product-short-name',
      'src/ids.kt:1:9 package-id',
      'src/ids.kt:1:13 author-handle',
      'src/ids.kt:1:27 package-path',
      'src/ids.kt:2:7 author-handle',
      'src/ids.kt:3:10 product-short-name',
    ]);
    expect(res.findings[0]!.message).toContain('the product is Platewise');
    expect(res.findings.find((f) => f.rule === 'package-path')!.message).toContain('diary or log');
  });

  it('checks file paths too', async () => {
    const root = product({ [`src/${PKG_PATH}/Main.ts`]: 'export {}\n' });
    const res = await runBanned(contextFor(root));
    expect(res.findings).toEqual([
      expect.objectContaining({ file: `src/${PKG_PATH}/Main.ts`, col: 5, rule: 'package-path' }),
    ]);
    expect(res.findings[0]!.line).toBeUndefined();
  });

  it('is case-insensitive and catches separators', async () => {
    const root = product({
      'src/a.ts': `${SHORT.toUpperCase()}_ai ${SHORT}.ai ${SHORT}-AI ${SHORT}ai\n`,
    });
    const res = await runBanned(contextFor(root));
    expect(res.findings.filter((f) => f.rule === 'product-name')).toHaveLength(4);
  });

  it('exempts credits, agent notes, docs, the lockfile, the pattern file and generated folders', async () => {
    const root = product({
      'README.md': NAME,
      'AGENTS.md': NAME,
      'CLAUDE.md': NAME,
      'THIRD_PARTY_NOTICES.md': NAME,
      'docs/plan/00-decisions.md': NAME,
      [`docs/${SHORT}.md`]: NAME,
      'pnpm-lock.yaml': NAME,
      '.github/workflows/ci.yml': NAME,
      '.github/dependabot.yml': NAME,
      'node_modules/x/index.js': NAME,
      'dist/app.js': NAME,
      'src/README.md': NAME,
      'src/dist/app.ts': NAME,
    });
    const res = await runBanned(contextFor(root));
    // Output folders are skipped at the product root only.
    // Only workflow files are exempt under .github/ (they must name the reference to fetch it).
    expect([...new Set(res.findings.map((f) => f.file))].sort()).toEqual([
      '.github/dependabot.yml',
      'src/README.md',
      'src/dist/app.ts',
    ]);
  });

  it('skips binary files but still checks their paths', async () => {
    const root = trees.make({
      [PATTERNS_FILE]: realPatterns,
      [`public/${SHORT}.png`]: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, ...Buffer.from(NAME)]),
    });
    const res = await runBanned(contextFor(root));
    expect(res.findings.map((f) => `${f.file}:${f.line ?? '-'}`)).toEqual([
      `public/${SHORT}.png:-`,
    ]);
  });

  it('passes a clean product', async () => {
    const res = await runBanned(
      contextFor(product({ 'src/app.ts': "export const name = 'Platewise';\n" })),
    );
    expect(res.status).toBe('pass');
  });

  it('loads new patterns from data only', async () => {
    const root = trees.make({
      [PATTERNS_FILE]: JSON.stringify([
        { id: 'old-name', pattern: 'snackbook', flags: 'i', hint: 'renamed' },
      ]),
      'src/a.ts': 'const SnackBook = 1\n',
    });
    const res = await runBanned(contextFor(root));
    expect(res.findings).toEqual([expect.objectContaining({ rule: 'old-name', line: 1, col: 7 })]);
  });

  it('is a setup error when the pattern file is broken', async () => {
    const bad = (body: unknown) =>
      loadPatterns(trees.make({ [PATTERNS_FILE]: JSON.stringify(body) })).errors;
    expect(bad([{ id: 'x', pattern: '(' }])[0]).toContain('bad pattern');
    expect(bad([{ pattern: 'x' }])[0]).toContain('"id" is missing');
    expect(
      bad([
        { id: 'a', pattern: 'x' },
        { id: 'a', pattern: 'y' },
      ])[0],
    ).toContain('duplicate id');
    expect(bad({})[0]).toContain('expected an array');
    expect(loadPatterns(trees.make()).errors[0]).toContain('is missing');
    const res = await runBanned(
      contextFor(trees.make({ [PATTERNS_FILE]: '[{"id":"x","pattern":"["}]' })),
    );
    expect(res.status).toBe('error');
  });

  it('loads the real pattern file cleanly', () => {
    const root = trees.make({ [PATTERNS_FILE]: realPatterns });
    const { patterns, errors } = loadPatterns(root);
    expect(errors).toEqual([]);
    const ids = patterns.map((p) => p.id);
    // The core identity patterns must always be there; more can be added as data.
    expect(ids).toEqual(
      expect.arrayContaining([
        'product-name',
        'product-short-name',
        'author-handle',
        'package-path',
        'package-id',
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of patterns) expect(p.hint ?? '').not.toBe('');
  });
});
