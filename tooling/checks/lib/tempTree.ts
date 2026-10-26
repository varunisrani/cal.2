/** Test helpers: throwaway folders under the OS temp dir, never inside the repo. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { CheckContext } from './types';

export function writeTree(root: string, files: Record<string, string | Uint8Array>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

export class TempTrees {
  private readonly roots: string[] = [];

  make(files: Record<string, string | Uint8Array> = {}): string {
    const root = mkdtempSync(join(tmpdir(), 'platewise-checks-'));
    this.roots.push(root);
    writeTree(root, files);
    return root;
  }

  cleanup(): void {
    for (const root of this.roots.splice(0)) rmSync(root, { recursive: true, force: true });
  }
}

export function contextFor(
  productRoot: string,
  overrides: Partial<CheckContext> = {},
): CheckContext {
  return {
    productRoot,
    refRoot: null,
    refPath: join(productRoot, 'no-reference-here'),
    requireRef: false,
    strict: false,
    closest: null,
    cacheDir: join(productRoot, 'node_modules', '.cache', 'platewise-similarity'),
    ...overrides,
  };
}
