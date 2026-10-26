// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUDGET_BYTES,
  BudgetSetupError,
  formatReport,
  isOverBudget,
  main,
  MANIFEST_FILE,
  measureBundle,
} from './bundle-budget';

/** Bytes that gzip cannot shrink (a seeded xorshift stream), so gzip size ≈ length. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

type Files = Record<string, Uint8Array>;

const reader =
  (files: Files) =>
  (file: string): Uint8Array => {
    const bytes = files[file];
    if (!bytes) throw new Error(`ENOENT: ${file}`);
    return bytes;
  };

// index.html → app → (vendor, shared); app ⇢ scanner ⇢ (decoder → shared); app ⇢ charts.
// `shared` is both static (via app) and dynamic (via the scanner's decoder).
const manifest = {
  'index.html': {
    file: 'assets/index-a1.js',
    src: 'index.html',
    isEntry: true,
    imports: ['_app-b2.js'],
    css: ['assets/index-c3.css'],
  },
  '_app-b2.js': {
    file: 'assets/app-b2.js',
    imports: ['_vendor-d4.js', '_shared-e5.js'],
    dynamicImports: ['src/scan.ts', 'src/charts.ts', '_shared-e5.js'],
  },
  '_vendor-d4.js': { file: 'assets/vendor-d4.js', imports: ['_shared-e5.js'] },
  '_shared-e5.js': { file: 'assets/shared-e5.js' },
  'src/scan.ts': {
    file: 'assets/scan-f6.js',
    isDynamicEntry: true,
    imports: ['_decoder-g7.js'],
  },
  '_decoder-g7.js': { file: 'assets/decoder-g7.js', imports: ['_shared-e5.js'] },
  'src/charts.ts': { file: 'assets/charts-h8.js', isDynamicEntry: true },
};

const COUNTED = [
  'assets/index-a1.js',
  'assets/app-b2.js',
  'assets/vendor-d4.js',
  'assets/shared-e5.js',
];

function build(sizes: Partial<Record<string, number>> = {}): Files {
  const files: Files = {};
  const all = [...COUNTED, 'assets/scan-f6.js', 'assets/decoder-g7.js', 'assets/charts-h8.js'];
  all.forEach((file, i) => {
    files[file] = noise(sizes[file] ?? 10_000, i + 1);
  });
  return files;
}

const text = JSON.stringify(manifest);

describe('measureBundle', () => {
  it('passes under budget, counting the entry and its static imports once each', () => {
    const report = measureBundle(text, reader(build()));
    expect(report.entry).toBe('index.html');
    expect(report.counted.map((f) => f.file)).toEqual(COUNTED);
    expect(report.total).toBe(report.counted.reduce((sum, f) => sum + f.gzip, 0));
    expect(report.total).toBeGreaterThanOrEqual(40_000);
    expect(report.total).toBeLessThan(BUDGET_BYTES);
    expect(isOverBudget(report)).toBe(false);
    expect(formatReport(report)).toMatch(/^PASS: initial JS is \d+\.\d\d kB gzip/m);
  });

  it('fails over budget and names every counted file', () => {
    const report = measureBundle(text, reader(build({ 'assets/vendor-d4.js': 260_000 })));
    expect(report.total).toBeGreaterThan(BUDGET_BYTES);
    expect(isOverBudget(report)).toBe(true);
    const out = formatReport(report);
    expect(out).toMatch(/^FAIL: initial JS is .* over the 250\.00 kB budget\.$/m);
    expect(out).toContain(`Counted files: ${COUNTED.join(', ')}`);
    expect(out).toMatch(/^headroom\s+-\d+\.\d\d kB$/m);
  });

  it('leaves dynamic imports out of the total and lists them as lazy', () => {
    const files = build({ 'assets/scan-f6.js': 400_000, 'assets/decoder-g7.js': 300_000 });
    const report = measureBundle(text, reader(files));
    expect(isOverBudget(report)).toBe(false);
    expect(report.lazy.map((f) => f.file)).toEqual([
      'assets/scan-f6.js',
      'assets/charts-h8.js',
      'assets/decoder-g7.js',
    ]);
    expect(report.counted.map((f) => f.file)).not.toContain('assets/scan-f6.js');
    const out = formatReport(report);
    const lazyTable = out.slice(out.indexOf('Lazy chunks'));
    expect(lazyTable).toContain('assets/decoder-g7.js');
    expect(lazyTable).not.toContain('assets/shared-e5.js');
  });

  it('counts a chunk that is imported both statically and dynamically, and never as lazy', () => {
    const report = measureBundle(text, reader(build()));
    expect(report.counted.map((f) => f.file)).toContain('assets/shared-e5.js');
    expect(report.lazy.map((f) => f.file)).not.toContain('assets/shared-e5.js');
  });

  it('passes exactly at the budget and fails one byte over', () => {
    const files = build();
    const { total } = measureBundle(text, reader(files));
    expect(isOverBudget(measureBundle(text, reader(files), total))).toBe(false);
    expect(isOverBudget(measureBundle(text, reader(files), total - 1))).toBe(true);
  });

  it('survives import cycles', () => {
    const cyclic = JSON.stringify({
      'index.html': { file: 'a.js', isEntry: true, imports: ['_b.js'] },
      '_b.js': { file: 'b.js', imports: ['index.html'] },
    });
    const report = measureBundle(cyclic, reader({ 'a.js': noise(10, 1), 'b.js': noise(10, 2) }));
    expect(report.counted.map((f) => f.file)).toEqual(['a.js', 'b.js']);
  });

  it('takes the only JS entry when there is no index.html entry', () => {
    const single = JSON.stringify({ 'src/main.ts': { file: 'main.js', isEntry: true } });
    expect(measureBundle(single, reader({ 'main.js': noise(10, 1) })).entry).toBe('src/main.ts');
  });

  it.each([
    ['malformed JSON', '{"index.html":', /not valid JSON/],
    ['a JSON array', '[]', /not a JSON object/],
    ['an entry without a file', '{"index.html":{"isEntry":true}}', /"index.html" is malformed/],
    ['no entry', '{"_a.js":{"file":"a.js"}}', /no entry chunk/],
    [
      'two entries and no index.html',
      '{"a.ts":{"file":"a.js","isEntry":true},"b.ts":{"file":"b.js","isEntry":true}}',
      /2 entry chunks and no "index.html": a.ts, b.ts/,
    ],
    [
      'an import that is not in the manifest',
      '{"index.html":{"file":"a.js","isEntry":true,"imports":["_gone.js"]}}',
      /"index.html" imports "_gone.js", which is not in the manifest/,
    ],
  ])('rejects %s as a setup error', (_case, input, message) => {
    expect(() => measureBundle(input, reader({ 'a.js': noise(10, 1) }))).toThrow(BudgetSetupError);
    expect(() => measureBundle(input, reader({ 'a.js': noise(10, 1) }))).toThrow(message);
  });

  it('treats a file named in the manifest but missing on disk as a setup error', () => {
    const files = build();
    delete files['assets/vendor-d4.js'];
    expect(() => measureBundle(text, reader(files))).toThrow(
      /cannot read assets\/vendor-d4\.js \(ENOENT/,
    );
  });
});

describe('main', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function dist(files: Record<string, string | Uint8Array>): string {
    const root = mkdtempSync(join(tmpdir(), 'platewise-budget-'));
    roots.push(root);
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), content);
    }
    return root;
  }

  function run(argv: string[]): { code: number; out: string } {
    const lines: string[] = [];
    const code = main(argv, { productRoot: dist({}), write: (t) => lines.push(t) });
    return { code, out: lines.join('\n') };
  }

  it('exits 2 when there is no manifest (no build yet)', () => {
    const { code, out } = run(['--dist', dist({ 'assets/x.js': 'x' })]);
    expect(code).toBe(2);
    expect(out).toMatch(/no build manifest at .*\.vite\/manifest\.json; run pnpm build first/);
  });

  it('exits 2 when the default dist folder does not exist', () => {
    expect(run([]).code).toBe(2);
  });

  it('prints the table and exits 0 under budget, 1 over budget', () => {
    const files = build();
    const under = dist({ [MANIFEST_FILE]: text, ...files });
    const passed = run([`--dist=${under}`]);
    expect(passed.code).toBe(0);
    expect(passed.out).toMatch(/^file\s+raw\s+gzip$/m);
    expect(passed.out).toMatch(/^assets\/index-a1\.js\s+10\.00 kB\s+\d+\.\d\d kB$/m);
    expect(passed.out).toMatch(/^budget\s+250\.00 kB$/m);

    const over = dist({ [MANIFEST_FILE]: text, ...build({ 'assets/app-b2.js': 300_000 }) });
    const failed = run(['--dist', over]);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain(`Counted files: ${COUNTED.join(', ')}`);
  });

  it('exits 2 when a file in the manifest is missing from the build', () => {
    const files: Files = build();
    delete files['assets/charts-h8.js'];
    const { code, out } = run(['--dist', dist({ [MANIFEST_FILE]: text, ...files })]);
    expect(code).toBe(2);
    expect(out).toContain('cannot read assets/charts-h8.js');
  });

  it('exits 2 on an unknown argument', () => {
    expect(run(['--budget', '300']).code).toBe(2);
  });
});
