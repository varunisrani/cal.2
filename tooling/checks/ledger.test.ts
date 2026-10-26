// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { parseLedger, TestResolver } from './ledger';
import { TempTrees } from './lib/tempTree';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

describe('parseLedger', () => {
  it('reads rows and their indented Test and Review lines', () => {
    const rows = parseLedger(
      [
        '# Ledger',
        '- **R01.1** first',
        '  - Test: a.test.ts > d > t',
        '  - Review: why',
        '',
        '* **R01.2** second',
        'A paragraph ends the row.',
        '  - Test: orphan.test.ts > d > t',
      ].join('\n'),
    );
    expect(rows).toEqual([
      {
        id: 'R01.1',
        summary: 'first',
        line: 2,
        coverage: [
          { kind: 'test', value: 'a.test.ts > d > t', line: 3 },
          { kind: 'review', value: 'why', line: 4 },
        ],
      },
      { id: 'R01.2', summary: 'second', line: 6, coverage: [] },
    ]);
  });
});

describe('TestResolver', () => {
  const root = () =>
    trees.make({
      'src/a.test.ts': [
        "describe('meals', () => {",
        "  it('adds a meal', () => {});",
        "  test.skip('removes a meal', () => {});",
        '});',
        "describe.skip('later', () => {",
        "  it('works', () => {});",
        '});',
        "it.skip('one-liner', () => {});",
        "it('runs after a skipped one-liner', () => {});",
        'it.skip(',
        "  'wrapped by the formatter',",
        '  () => {},',
        ');',
      ].join('\n'),
    });

  it('resolves a file that contains every name', () => {
    expect(new TestResolver(root()).check('src/a.test.ts > meals > adds a meal')).toBeNull();
    expect(new TestResolver(root()).check('`src/a.test.ts` > "meals" > adds a meal')).toBeNull();
  });

  it('explains what does not resolve', () => {
    const r = new TestResolver(root());
    expect(r.check('src/a.test.ts')).toContain('should read');
    expect(r.check('src/b.test.ts > meals > adds a meal')).toContain('does not exist');
    expect(r.check('../outside.test.ts > x > y')).toContain('outside the product folder');
    expect(r.check('src/a.test.ts > meals > edits a meal')).toContain('"edits a meal" is not in');
    expect(r.check('src/a.test.ts > meals > removes a meal')).toContain('skipped');
    expect(r.check('src/a.test.ts > later > works')).toContain('"later"');
    expect(r.check('src/a.test.ts > wrapped by the formatter')).toContain('skipped');
  });

  it('does not blame a test for the skipped one-liner above it', () => {
    expect(
      new TestResolver(root()).check('src/a.test.ts > runs after a skipped one-liner'),
    ).toBeNull();
  });
});
