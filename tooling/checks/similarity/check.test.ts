// @vitest-environment node
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { contextFor, TempTrees, writeTree } from '../lib/tempTree';
import { ALLOW_FILE, compareProduct, loadAllowList, runSimilarity } from './check';
import { buildIndex, cacheKey, readHead } from './refIndex';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

/** `name10 name11 …` — distinct identifiers (or words) from `from` up to `to` (exclusive). */
const seq = (name: string, from: number, to: number): string =>
  Array.from({ length: to - from }, (_, i) => `${name}${from + i}`).join(' ');

const scoreFn = `export function scorePlate(items, goal) {
  let total = 0;
  for (const item of items) {
    total += item.calories * item.servings;
  }
  const ratio = total / goal.calories;
  return { total, ratio, over: ratio > 1, label: "plate score" };
}
`;

const reference = (): string =>
  trees.make({
    'web/tokens.ts': `${seq('tok', 0, 100)}\n`,
    'app/lines.kt': Array.from({ length: 10 }, (_, i) => `val name${i} = compute${i}(${i})`).join(
      '\n',
    ),
    'docs/guide.md': `# Guide\n\n${seq('lorem', 0, 20)}\n`,
    'web/score.ts': scoreFn,
    'config/settings.json': `{${Array.from({ length: 15 }, (_, i) => `"key${i}": ${i}`).join(', ')}}\n`,
    'node_modules/dep/index.js': `${seq('dep', 0, 80)}\n`,
  });

const compare = (refRoot: string, productRoot: string, closest: number | null = null) =>
  compareProduct(productRoot, buildIndex(refRoot), {
    allow: loadAllowList(productRoot).entries,
    closest,
  });

describe('similarity gates', () => {
  it('catches a shared run of 50 code tokens but not 49', () => {
    const product = trees.make({
      'src/copy50.ts': `mine1 mine2 ${seq('tok', 10, 60)} mine3\n`,
      'src/copy49.ts': `mine1 mine2 ${seq('tok', 10, 59)} mine3\n`,
    });
    const { findings } = compare(reference(), product);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: 'src/copy50.ts',
      line: 1,
      rule: 'tokens',
      ref: 'web/tokens.ts:1',
    });
    expect(findings[0]!.message).toContain('shared run of 50 code tokens');
    expect(findings[0]!.excerpt!.length).toBeLessThanOrEqual(120);
  });

  it('catches 6 consecutive meaningful lines but not 5', () => {
    const lines = (from: number, to: number) =>
      Array.from(
        { length: to - from },
        (_, i) => `val name${from + i} = compute${from + i}(${from + i})`,
      );
    const product = trees.make({
      'src/six.kt': ['fun mine() {', ...lines(2, 8), 'otherCall()'].join('\n'),
      'src/five.kt': ['fun mine() {', ...lines(2, 7), 'otherCall()'].join('\n'),
    });
    const { findings } = compare(reference(), product);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: 'src/six.kt',
      line: 2,
      rule: 'lines',
      ref: 'app/lines.kt:3',
    });
  });

  it('catches 12 prose words from strings and comments but not 11', () => {
    const product = trees.make({
      'src/copy.ts': `const copy = 'Intro ${seq('lorem', 3, 15)} outro';\n// ${seq('lorem', 5, 17)}\n`,
      'src/near.ts': `const copy = 'Intro ${seq('lorem', 3, 14)} outro';\n`,
      'docs/notes.md': `Our words. ${seq('lorem', 0, 12)}\n`,
    });
    const found = compare(reference(), product).findings.map(
      (f) => `${f.file}:${f.line}:${f.rule}`,
    );
    expect(found.sort()).toEqual([
      'docs/notes.md:1:prose',
      'src/copy.ts:1:prose',
      'src/copy.ts:2:prose',
    ]);
  });

  it('still catches a copy after reformatting, requoting and new comments', () => {
    const reformatted = `// Our own helper.
export function scorePlate(
  items,
  goal,
) {
  let total = 0
  for (const item of items) { total += item.calories * item.servings } /* sum */
  const ratio = total / goal.calories
  return {
    total,
    ratio,
    over: ratio > 1,
    label: 'plate score',
  }
}
`;
    const { findings } = compare(reference(), trees.make({ 'src/score.ts': reformatted }));
    expect(findings.map((f) => f.rule)).toContain('tokens');
    expect(findings.find((f) => f.rule === 'tokens')).toMatchObject({
      line: 2,
      ref: 'web/score.ts:1',
    });
  });

  it('does not count runs of bare punctuation or bare tags as code', () => {
    const ref = trees.make({
      'legal/notice.txt': `${'-'.repeat(120)}\n`,
      'web/page.html': `${'</div>\n'.repeat(20)}`,
    });
    const product = trees.make({
      'docs/table.md': `| ID | Name |\n| ${'-'.repeat(40)} | ${'-'.repeat(40)} |\n\n${'-'.repeat(100)}\n`,
      'src/View.tsx': `${'</div>\n'.repeat(20)}`,
    });
    expect(compare(ref, product).findings).toEqual([]);
  });

  it('skips reference node_modules and product fixtures, lockfile and generated folders', () => {
    const product = trees.make({
      'src/dep.ts': `${seq('dep', 0, 80)}\n`,
      'tooling/checks/x/fixtures/copy.ts': `${seq('tok', 0, 80)}\n`,
      'dist/copy.ts': `${seq('tok', 0, 80)}\n`,
      'coverage/copy.ts': `${seq('tok', 0, 80)}\n`,
    });
    expect(compare(reference(), product).findings).toEqual([]);
  });

  it('does not gate config files but ranks them with --closest', () => {
    const product = trees.make({
      'src/settings.json': `{${Array.from({ length: 15 }, (_, i) => `"key${i}": ${i}`).join(', ')}}\n`,
    });
    const out = compare(reference(), product, 5);
    expect(out.findings).toEqual([]);
    expect(out.closest[0]).toMatchObject({
      file: 'src/settings.json',
      channel: 'tokens',
      gate: false,
    });
    expect(out.closest[0]!.score).toBeGreaterThan(1);
  });
});

describe('--closest ranking', () => {
  it('merges probe windows into regions and scores them against the gate', () => {
    const product = trees.make({
      'src/near.ts': `mine1 ${seq('tok', 40, 70)} mine2\n`,
      'src/far.ts': `mine1 ${seq('tok', 80, 100)} mine2\n`,
    });
    const out = compare(reference(), product, 1);
    expect(out.findings).toEqual([]);
    expect(out.closest).toHaveLength(1);
    expect(out.closest[0]).toMatchObject({
      file: 'src/near.ts',
      channel: 'tokens',
      length: 30,
      score: 0.6,
    });
  });

  it('marks a region where the gate fired', () => {
    const out = compare(reference(), trees.make({ 'src/a.ts': `${seq('tok', 0, 60)}\n` }), 3);
    expect(out.closest[0]).toMatchObject({ gate: true, score: 1.2 });
  });
});

describe('allow-list', () => {
  it('leaves out allowed files and lists them', () => {
    const product = trees.make({
      'src/copy.ts': `${seq('tok', 0, 60)}\n`,
      [ALLOW_FILE]: JSON.stringify([{ path: 'src/*.ts', reason: 'licence text we must keep' }]),
    });
    const out = compare(reference(), product);
    expect(out.findings).toEqual([]);
    expect(out.allowed).toEqual(['src/copy.ts']);
  });

  it('is a setup error when an entry has no reason', async () => {
    const product = trees.make({ [ALLOW_FILE]: JSON.stringify([{ path: 'src/a.ts' }]) });
    expect(loadAllowList(product).errors[0]).toContain('"reason" is mandatory');
    const res = await runSimilarity(contextFor(product, { refRoot: reference() }));
    expect(res.status).toBe('error');
  });
});

describe('runSimilarity', () => {
  it('warns and skips without a reference, or fails setup with --require-ref', async () => {
    const product = trees.make({ 'src/a.ts': 'x' });
    expect((await runSimilarity(contextFor(product))).status).toBe('skip');
    expect((await runSimilarity(contextFor(product, { requireRef: true }))).status).toBe('error');
  });

  it('builds the index once and then reads it from the cache', async () => {
    const ref = reference();
    const product = trees.make({ 'src/copy.ts': `${seq('tok', 0, 60)}\n` });
    const ctx = contextFor(product, { refRoot: ref, cacheDir: join(trees.make(), 'cache') });
    const first = await runSimilarity(ctx);
    const second = await runSimilarity(ctx);
    expect(first.notes[0]).toMatch(/built/);
    expect(second.notes[0]).toMatch(/cached/);
    expect(second.status).toBe('fail');
    expect(second.findings).toEqual(first.findings);
  });

  it('prints the closest ranking as report lines', async () => {
    const product = trees.make({ 'src/near.ts': `mine1 ${seq('tok', 40, 70)} mine2\n` });
    const res = await runSimilarity(
      contextFor(product, { refRoot: reference(), closest: 5, cacheDir: join(trees.make(), 'c') }),
    );
    expect(res.status).toBe('pass');
    expect(res.report.join('\n')).toMatch(/0\.60\s+tokens src\/near\.ts:1 ~ web\/tokens\.ts:1/);
  });
});

describe('cache key', () => {
  const sha = (c: string) => c.repeat(40);

  it('reads HEAD from a branch ref, packed refs or a detached commit', () => {
    const ref = trees.make({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/refs/heads/main': `${sha('a')}\n`,
    });
    expect(readHead(ref)).toBe(sha('a'));
    const packed = trees.make({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/packed-refs': `# pack-refs\n${sha('b')} refs/heads/main\n`,
    });
    expect(readHead(packed)).toBe(sha('b'));
    const detached = trees.make({ '.git/HEAD': `${sha('c')}\n` });
    expect(readHead(detached)).toBe(sha('c'));
  });

  it('changes when the reference moves to another commit', () => {
    const ref = trees.make({ '.git/HEAD': `${sha('a')}\n`, 'a.ts': 'x' });
    const before = cacheKey(ref);
    writeTree(ref, { '.git/HEAD': `${sha('d')}\n` });
    expect(cacheKey(ref)).not.toBe(before);
  });
});
