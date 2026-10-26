// @vitest-environment node
/**
 * Detection proof against the real reference, when it is on disk (PLATEWISE_REF or the
 * default folder). The planted copies live in os.tmpdir() only, never in the repo.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { findCopiedAssets } from './assets';
import { extOf, walkFiles } from './lib/files';
import { refExists, resolveRefPath } from './lib/ref';
import { TempTrees } from './lib/tempTree';
import { compareProduct } from './similarity/check';
import { listRefFiles, loadOrBuildIndex } from './similarity/refIndex';
import { scanText } from './similarity/scan';

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const refRoot = resolveRefPath(undefined, process.env);
const trees = new TempTrees();
afterEach(() => trees.cleanup());

/** About 60 tokens of whole lines, starting at a top-level statement in a reference .ts file. */
function plantableSnippet(): { file: string; snippet: string } {
  for (const rel of listRefFiles(refRoot).filter((f) => f.endsWith('.ts'))) {
    const lines = readFileSync(join(refRoot, rel), 'utf8').split('\n');
    for (let start = Math.floor(lines.length / 2); start < lines.length; start++) {
      if (!/^(export |const |function |async function )/.test(lines[start]!)) continue;
      for (let end = start + 1; end <= lines.length; end++) {
        const snippet = lines.slice(start, end).join('\n');
        if (scanText(snippet, 'c').tokens.ids.length >= 60) return { file: rel, snippet };
      }
    }
  }
  throw new Error('no reference .ts file has a 60-token top-level statement');
}

describe.skipIf(!refExists(refRoot))('against the real reference', () => {
  // Cold, this builds the full reference index (a few seconds alone, longer on a busy
  // machine); the shared cache folder makes later runs fast.
  it('catches a planted ~60-token copy of a reference .ts file', { timeout: 120_000 }, () => {
    const { file, snippet } = plantableSnippet();
    const product = trees.make({
      'src/planted.ts': `// Our own file.\nconst mine = 1\n${snippet}\n`,
    });
    const { index } = loadOrBuildIndex(
      refRoot,
      join(productRoot, 'node_modules', '.cache', 'platewise-similarity'),
    );
    const { findings } = compareProduct(product, index, { allow: [], closest: null });
    const hit = findings.find((f) => f.rule === 'tokens' && f.file === 'src/planted.ts');
    expect(hit, `planted from ${file}`).toBeDefined();
    expect(hit!.ref).toMatch(/:\d+$/);
  });

  it('catches a copied reference PNG by its hash', { timeout: 60_000 }, async () => {
    const pngs = walkFiles(refRoot, { skipDir: (_rel, name) => name === '.git' })
      .filter((f) => extOf(f.rel) === 'png')
      .map((f) => ({ ...f, size: statSync(f.abs).size }))
      .filter((f) => f.size > 0)
      .sort((a, b) => a.size - b.size);
    expect(pngs.length).toBeGreaterThan(0);
    const product = trees.make();
    mkdirSync(join(product, 'public', 'icons'), { recursive: true });
    copyFileSync(pngs[0]!.abs, join(product, 'public', 'icons', 'plate.png'));
    const { findings } = await findCopiedAssets(product, refRoot);
    expect(findings.map((f) => f.file)).toEqual(['public/icons/plate.png']);
    expect(findings[0]!.rule).toBe('identical-asset');
  });
});
