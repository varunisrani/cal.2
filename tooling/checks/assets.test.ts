// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { findCopiedAssets, runAssets } from './assets';
import { contextFor, TempTrees } from './lib/tempTree';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const bytes = (...values: number[]) => new Uint8Array(values);

describe('assets', () => {
  it('fails on a byte-identical image, font or sound, wherever it sits in the reference', async () => {
    const ref = trees.make({
      'store/screenshots/home.png': bytes(1, 2, 3, 4),
      'shared/workout-vectors/squat.png': bytes(9, 9, 9),
      'web/fonts/brand.woff2': bytes(5, 6, 7),
      'web/logo.svg': '<svg viewBox="0 0 1 1"/>',
    });
    const product = trees.make({
      'public/home.png': bytes(1, 2, 3, 4),
      'public/fonts/ours.woff2': bytes(5, 6, 7),
      'src/assets/squat.png': bytes(9, 9, 9),
      'public/logo.svg': '<svg viewBox="0 0 1 1"/>',
    });
    const res = await runAssets(contextFor(product, { refRoot: ref }));
    expect(res.status).toBe('fail');
    expect(res.findings.map((f) => `${f.file} ~ ${f.ref}`)).toEqual([
      'public/fonts/ours.woff2 ~ web/fonts/brand.woff2',
      'public/home.png ~ store/screenshots/home.png',
      'public/logo.svg ~ web/logo.svg',
      'src/assets/squat.png ~ shared/workout-vectors/squat.png',
    ]);
  });

  it('passes files of the same size with different bytes, other extensions and empty files', async () => {
    const ref = trees.make({ 'a.png': bytes(1, 2, 3), 'notes.txt': 'same', 'empty.png': '' });
    const product = trees.make({
      'public/a.png': bytes(1, 2, 4),
      'src/notes.txt': 'same',
      'public/empty.png': '',
    });
    const out = await findCopiedAssets(product, ref);
    expect(out.findings).toEqual([]);
    expect(out.productCount).toBe(1);
  });

  it('ignores product node_modules and dist', async () => {
    const ref = trees.make({ 'a.png': bytes(1, 2, 3) });
    const product = trees.make({
      'node_modules/x/a.png': bytes(1, 2, 3),
      'dist/a.png': bytes(1, 2, 3),
    });
    expect((await findCopiedAssets(product, ref)).findings).toEqual([]);
  });

  it('warns and skips without a reference, or fails setup with --require-ref', async () => {
    const product = trees.make({ 'public/a.png': bytes(1) });
    const skipped = await runAssets(contextFor(product));
    expect(skipped.status).toBe('skip');
    expect(skipped.notes[0]).toContain('warning: reference not found');
    expect((await runAssets(contextFor(product, { requireRef: true }))).status).toBe('error');
  });
});
