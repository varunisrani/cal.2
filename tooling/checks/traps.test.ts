// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { contextFor, TempTrees } from './lib/tempTree';
import { declaredTraps, LEDGER, numberedItems, runTraps } from './traps';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const research01 = `# 01 · Food log

## 5. Rules

1. Not a trap.

## 6. Traps

1. Midnight rollover uses local time.
2. **R01.7** A barcode with a leading zero
   loses it when stored as a number.
3. Double tap logs twice.
4. Units mix grams and ounces.
5. Daylight saving moves the day.

### 6.1 More

6. A sub-heading stays in the section.

\`\`\`
7. inside a code block
\`\`\`

## 7. Next

1. Not a trap either.
`;

const research02 = `## 6 Traps\n\n1. The provider times out.\n\n## 60 Other\n\n1. Not this one.\n`;

const plan04 = `# Phase 04\n\n## Traps\n\n1. T04.9 Explicit plan trap.\n2. Implicit plan trap.\n`;

const dayTest = `import { describe, it } from 'vitest';
describe('dayKey', () => {
  it('rolls over at local midnight', () => {});
  it.skip(
    'handles daylight saving later',
    () => {},
  );
});
`;

const ledger = `# Traps ledger

- **R01.1** Midnight rollover
  - Test: src/log/day.test.ts > dayKey > rolls over at local midnight
- **R01.7** Leading zero
  - Review: the barcode parser review in P05-02 owns it
- **R01.3** Double tap
- **R01.4** Units
  - Test: src/log/units.test.ts > units > converts grams
- **R01.5** Daylight saving
  - Test: src/log/day.test.ts > dayKey > handles daylight saving later
- **R01.6** Sub-heading
  - Test: src/log/day.test.ts > dayKey > rolls over at local midnight
- **T04.9** Explicit
  - Review: P04-01 owns it
- **T04.2** Implicit
  - Test: src/log/day.test.ts > dayKey > does not exist
`;

const docs = (extra: Record<string, string> = {}) =>
  trees.make({
    'docs/plan/research/01-food-log.md': research01,
    'docs/plan/research/02-ai.md': research02,
    'docs/plan/research/README.md': '## 6. Traps\n\n1. Not a numbered research file.\n',
    'docs/plan/04-phase.md': plan04,
    'src/log/day.test.ts': dayTest,
    ...extra,
  });

describe('declared traps', () => {
  it('reads numbered items of "## 6" in research and "## Traps" in plan files', () => {
    const { traps, researchFiles } = declaredTraps(docs());
    expect(researchFiles).toBe(2);
    expect(traps.map((t) => t.id)).toEqual([
      'R01.1',
      'R01.7',
      'R01.3',
      'R01.4',
      'R01.5',
      'R01.6',
      'R02.1',
      'T04.9',
      'T04.2',
    ]);
    expect(traps[1]).toMatchObject({ file: 'docs/plan/research/01-food-log.md', line: 10 });
    expect(traps[1]!.text).toContain('loses it when stored');
  });

  it('only takes items indented at most three spaces', () => {
    expect(numberedItems('## 6\n1. top\n    2. nested code\n', /^## 6/).map((i) => i.k)).toEqual([
      1,
    ]);
  });
});

describe('traps check', () => {
  it('skips while there are no research specs', async () => {
    const res = await runTraps(contextFor(trees.make({ 'docs/plan/00-decisions.md': '# x' })));
    expect(res.status).toBe('skip');
  });

  it('fails when research exists but the ledger does not', async () => {
    const res = await runTraps(contextFor(docs()));
    expect(res.status).toBe('fail');
    expect(res.findings).toEqual([
      expect.objectContaining({ file: LEDGER, rule: 'ledger-missing' }),
    ]);
  });

  it('fails on a missing row, a row with no coverage, and unresolved or skipped tests', async () => {
    const res = await runTraps(contextFor(docs({ [LEDGER]: ledger })));
    expect(res.status).toBe('fail');
    expect(res.findings.map((f) => `${f.rule} ${f.message}`)).toEqual([
      'no-coverage R01.3 has no Test: or Review: line',
      'test-unresolved R01.4: src/log/units.test.ts does not exist',
      'test-unresolved R01.5: "handles daylight saving later" in src/log/day.test.ts is skipped or a todo',
      `no-row R02.1 has no row in ${LEDGER}`,
      'test-unresolved T04.2: "does not exist" is not in src/log/day.test.ts',
    ]);
    expect(res.findings[3]).toMatchObject({ file: 'docs/plan/research/02-ai.md', line: 3 });
  });

  it('passes when every declared trap has a resolving test or a review', async () => {
    const fixed = ledger
      .replace('- **R01.3** Double tap', '- **R01.3** Double tap\n  - Review: P03-02 owns it')
      .replace(
        'src/log/units.test.ts > units > converts grams',
        'src/log/day.test.ts > dayKey > rolls over at local midnight',
      )
      .replace('> handles daylight saving later', '> rolls over at local midnight')
      .replace('> does not exist', '> rolls over at local midnight');
    const res = await runTraps(
      contextFor(docs({ [LEDGER]: `${fixed}- **R02.1** Timeout\n  - Review: P06 owns it\n` })),
    );
    expect(res.findings).toEqual([]);
    expect(res.status).toBe('pass');
  });
});
