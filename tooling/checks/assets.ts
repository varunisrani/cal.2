import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { extOf, isGeneratedProductDir, walkFiles, type WalkedFile } from './lib/files';
import { missingRef, result, type CheckContext, type CheckResult, type Finding } from './lib/types';

export const ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'icns',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'mp4',
  'mov',
  'webm',
]);

const REF_SKIP_DIRS = new Set(['.git', 'node_modules']);

interface Sized extends WalkedFile {
  size: number;
}

/** Asset files with their sizes; empty files hold nothing to copy and are left out. */
function listAssets(root: string, skipDir: (rel: string, name: string) => boolean): Sized[] {
  return walkFiles(root, { skipDir })
    .filter((f) => ASSET_EXTENSIONS.has(extOf(f.rel)))
    .map((f) => ({ ...f, size: statSync(f.abs).size }))
    .filter((f) => f.size > 0);
}

function sha256(abs: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const h = createHash('sha256');
    createReadStream(abs)
      .on('data', (chunk) => h.update(chunk))
      .on('error', reject)
      .on('end', () => resolveHash(h.digest('hex')));
  });
}

async function hashAll(files: Sized[]): Promise<Map<string, Sized[]>> {
  const byHash = new Map<string, Sized[]>();
  const queue = [...files];
  const worker = async (): Promise<void> => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const digest = await sha256(f.abs);
      const list = byHash.get(digest);
      if (list) list.push(f);
      else byHash.set(digest, [f]);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return byHash;
}

/**
 * Finds product assets that are byte-identical to a reference asset. Identical files have
 * equal sizes, so only reference files whose size matches a product asset are hashed.
 */
export async function findCopiedAssets(
  productRoot: string,
  refRoot: string,
): Promise<{
  findings: Finding[];
  productCount: number;
  hashedRef: number;
}> {
  const product = listAssets(productRoot, isGeneratedProductDir);
  if (product.length === 0) return { findings: [], productCount: 0, hashedRef: 0 };
  const sizes = new Set(product.map((f) => f.size));
  const candidates = listAssets(refRoot, (_rel, name) => REF_SKIP_DIRS.has(name)).filter((f) =>
    sizes.has(f.size),
  );
  const refByHash = await hashAll(candidates);
  const candidateSizes = new Set(candidates.map((f) => f.size));
  const productByHash = await hashAll(product.filter((f) => candidateSizes.has(f.size)));
  const findings: Finding[] = [];
  for (const [digest, files] of productByHash) {
    const refs = refByHash.get(digest);
    if (!refs) continue;
    for (const f of files) {
      findings.push({
        file: f.rel,
        rule: 'identical-asset',
        message: `byte-identical to a reference asset (sha256 ${digest.slice(0, 12)}…)`,
        ref:
          refs.length > 3
            ? `${refs
                .slice(0, 3)
                .map((r) => r.rel)
                .join(', ')} and ${refs.length - 3} more`
            : refs.map((r) => r.rel).join(', '),
      });
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file));
  return { findings, productCount: product.length, hashedRef: candidates.length };
}

export async function runAssets(ctx: CheckContext): Promise<CheckResult> {
  if (!ctx.refRoot) return missingRef('assets', ctx);
  const { findings, productCount, hashedRef } = await findCopiedAssets(
    ctx.productRoot,
    ctx.refRoot,
  );
  const n = findings.length;
  return result(
    'assets',
    n > 0 ? 'fail' : 'pass',
    n > 0
      ? `${n} product asset${n === 1 ? '' : 's'} identical to the reference`
      : `${productCount} product assets, none identical (${hashedRef} same-size reference files hashed)`,
    { findings },
  );
}
