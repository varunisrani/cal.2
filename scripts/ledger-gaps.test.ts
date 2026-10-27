// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { TempTrees } from '../tooling/checks/lib/tempTree';
import { LEDGER } from '../tooling/checks/traps';
import { findGaps, main, ownerOf } from './ledger-gaps';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const LEDGER_TEXT = [
  '# Traps ledger',
  '',
  '## R05 · Home',
  '',
  '- **R05.1** tested and done',
  '  - Test: src/a.test.ts > a > b',
  '- **R05.2** waiting for its v1 task',
  '  - Review: owned by P07-03',
  '- **R05.3** kept for a later phase',
  '  - Review: owned by L2',
  '- **R05.4** tested, with a part still given to a v1 phase',
  '  - Test: src/a.test.ts > a > c',
  '  - Review: the banner owned by P09 (K9)',
  '- **R05.5** a row nobody reviewed or tested',
  '- **R05.6** v1.x, though groundwork landed in a task',
  '  - Review: owned by v1.x item K8 (Compress photos, P2), groundwork in P02-02',
].join('\n');

describe('ownerOf', () => {
  it('reads L1–L5, v1.x items and N-ids as later owners', () => {
    expect(ownerOf('owned by L2')).toEqual({ token: 'L2', later: true });
    expect(ownerOf('owned by v1.x item F13 (fill from zero, P2)')).toEqual({
      token: 'v1.x',
      later: true,
    });
    expect(ownerOf('the size message is v1.x (E16)')?.later).toBe(true);
    expect(ownerOf('owned by N-8 (not planned)')).toEqual({ token: 'N-8', later: true });
  });

  it('reads a task or a phase as a v1 owner', () => {
    expect(ownerOf('owned by P07-03')).toEqual({ token: 'P07-03', later: false });
    expect(ownerOf('the banner owned by P09 (K9)')).toEqual({ token: 'P09', later: false });
  });

  it('takes the first owner named, so groundwork tasks after a later phase do not count', () => {
    expect(ownerOf('owned by L1 (groundwork: P00-05, P00-07)')?.token).toBe('L1');
    expect(ownerOf('owned by L4 (optional on-device speech model)')?.token).toBe('L4');
  });

  it('reads no owner from a tier, a feature id or plain words', () => {
    expect(ownerOf('a P2 feature, K9 and F13, missing from v1')).toBeNull();
    expect(ownerOf('L6 and P1')).toBeNull();
  });
});

describe('findGaps', () => {
  it('lists a v1 row with no Test line and a Review line still given to a v1 task (P10-06)', () => {
    const report = findGaps(LEDGER_TEXT);
    expect(report.gaps.map(({ id, kind }) => [id, kind])).toEqual([
      ['R05.2', 'no-test'],
      ['R05.4', 'v1-review'],
      ['R05.5', 'no-test'],
    ]);
    expect(report.gaps[1]).toMatchObject({ line: 13, text: 'the banner owned by P09 (K9)' });
    expect(report).toMatchObject({ rows: 6, later: 2 });
  });
});

describe('main', () => {
  it('lists no v1-owned trap row without a Test line in the real ledger (P10-06)', () => {
    const out: string[] = [];
    expect(main([], { write: (text) => out.push(text) })).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^ledger:gaps: none \(\d+ rows, \d+ kept for later owners\)$/);
  });

  it('prints each gap with its ledger line and exits 1', () => {
    const root = trees.make({ [LEDGER]: LEDGER_TEXT });
    const out: string[] = [];
    expect(main([], { productRoot: root, write: (text) => out.push(text) })).toBe(1);
    expect(out).toEqual([
      `${LEDGER}:7  R05.2  owned by a v1 task and has no Test: line (waiting for its v1 task)`,
      `${LEDGER}:13  R05.4  a Review: line still names a v1 task (the banner owned by P09 (K9))`,
      `${LEDGER}:14  R05.5  owned by a v1 task and has no Test: line (a row nobody reviewed or tested)`,
      'ledger:gaps: 3 found (6 rows, 2 kept for later owners)',
    ]);
  });

  it('exits 2 for a missing ledger or an argument', () => {
    const out: string[] = [];
    const write = (text: string) => out.push(text);
    expect(main([], { productRoot: trees.make(), write })).toBe(2);
    expect(main(['--all'], { write })).toBe(2);
    expect(out[0]).toBe(`ledger:gaps: ${LEDGER} is missing`);
    expect(out[1]).toContain('unknown argument "--all"');
  });
});
