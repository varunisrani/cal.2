// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { INVENTORY, MAP, parseInventory, runAcceptance } from './acceptance';
import { contextFor, TempTrees } from './lib/tempTree';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const inventory = `# Feature inventory

| ID | Feature | Tier | Notes |
|---|---|---|---|
| F1 | Photo logging | P0 | |
| F2 | Barcode | P1 (P0 on phones) | |
| F3 | Voice | P2 | |
| **F4** | Coach chat | P1 | |
| F5 | Export | P1 | |
| F6 | Widgets | P3 | |
| X | Not an id | P0 | |

| ID | Tier | Feature |
|:--|:-:|--:|
| G1 | P0 | Goals |
`;

const photoTest = `describe('photo', () => {
  it('logs items from a photo', () => {});
  it.todo('retries later');
});
`;

const map = `# Acceptance map

- **ACC-F1-1** A plate photo gives items
  - Test: src/photo.test.ts > photo > logs items from a photo
- **ACC-F1-2** Camera permission
  - Review: checked by hand on a phone, P02-03
- **ACC-F2-1** Barcode lookup
  - Test: src/barcode.test.ts > barcode > reads EAN-13
- **ACC-F4-1** Coach answers
- **ACC-Z9-1** Not in the inventory
  - Review: stale
- **ACC-G1-1** Goals
  - Test: src/photo.test.ts > photo > retries later
`;

describe('parseInventory', () => {
  it('reads ID, feature and the first P-tier, using a header named Tier when present', () => {
    const features = parseInventory(inventory);
    expect(features.map((f) => `${f.id}:${f.tier}`)).toEqual([
      'F1:P0',
      'F2:P1',
      'F3:P2',
      'F4:P1',
      'F5:P1',
      'F6:P3',
      'G1:P0',
    ]);
    expect(features[4]).toMatchObject({ name: 'Export', line: 9 });
  });
});

describe('acceptance check', () => {
  it('skips while the inventory does not exist', async () => {
    const res = await runAcceptance(contextFor(trees.make()));
    expect(res.status).toBe('skip');
  });

  it('fails every P0/P1 feature when the map is missing', async () => {
    const res = await runAcceptance(contextFor(trees.make({ [INVENTORY]: inventory })));
    expect(res.status).toBe('fail');
    expect(res.findings.map((f) => f.rule)).toEqual(Array(5).fill('no-acc-row'));
    expect(res.notes).toContain(`${MAP} is missing`);
  });

  it('fails a missing row, a row with no coverage, an unresolved test and a todo test', async () => {
    const root = trees.make({ [INVENTORY]: inventory, [MAP]: map, 'src/photo.test.ts': photoTest });
    const res = await runAcceptance(contextFor(root));
    expect(res.status).toBe('fail');
    expect(res.findings.map((f) => `${f.rule} ${f.message}`)).toEqual([
      'test-unresolved ACC-F2-1: src/barcode.test.ts does not exist',
      'no-coverage ACC-F4-1 has no Test: or Review: line',
      `no-acc-row F5 (P1) "Export" has no ACC-F5-<n> row in ${MAP}`,
      'test-unresolved ACC-G1-1: "retries later" in src/photo.test.ts is skipped or a todo',
    ]);
    expect(res.notes).toEqual([
      'rows for features not in the inventory: Z9',
      '1 Review: line(s); --strict fails them',
    ]);
  });

  it('fails Review: rows under --strict', async () => {
    const root = trees.make({ [INVENTORY]: inventory, [MAP]: map, 'src/photo.test.ts': photoTest });
    const res = await runAcceptance(contextFor(root, { strict: true }));
    expect(res.findings.map((f) => f.rule)).toContain('review-strict');
    expect(res.findings).toHaveLength(5);
  });

  it('passes when every P0/P1 feature has covered rows', async () => {
    const reviewed = ['F2', 'F4', 'F5', 'G1'].map(
      (id) => `- **ACC-${id}-1** b\n  - Review: P09-01 owns it\n`,
    );
    const good = `- **ACC-F1-1** a\n  - Test: src/photo.test.ts > photo > logs items from a photo\n${reviewed.join('')}`;
    const root = trees.make({
      [INVENTORY]: inventory,
      [MAP]: good,
      'src/photo.test.ts': photoTest,
    });
    const res = await runAcceptance(contextFor(root));
    expect(res.status).toBe('pass');
    expect((await runAcceptance(contextFor(root, { strict: true }))).status).toBe('fail');
  });
});
