// @vitest-environment node
import { mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOW_FILE,
  judge,
  listFromNodeModules,
  listWithPnpm,
  loadPolicy,
  parseSpdx,
  runLicenses,
  spdxAllowed,
  type LicensePolicy,
} from './licenses';
import { contextFor, TempTrees, writeTree } from './lib/tempTree';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const allowed = new Set(['MIT', 'ISC', 'Apache-2.0', 'CC0-1.0']);
const policy: LicensePolicy = { allowed: [...allowed], exceptions: [] };

describe('SPDX expressions', () => {
  it('passes OR when any side is allowed and AND only when all are', () => {
    expect(spdxAllowed('MIT', allowed)).toBe(true);
    expect(spdxAllowed('(MIT OR CC0-1.0)', allowed)).toBe(true);
    expect(spdxAllowed('GPL-3.0-only OR MIT', allowed)).toBe(true);
    expect(spdxAllowed('MIT AND GPL-3.0-only', allowed)).toBe(false);
    expect(spdxAllowed('MIT AND (ISC OR GPL-3.0-only)', allowed)).toBe(true);
    expect(spdxAllowed('(MIT AND GPL-3.0-only) OR ISC', allowed)).toBe(true);
    expect(spdxAllowed('Apache-2.0 WITH LLVM-exception', allowed)).toBe(true);
    expect(spdxAllowed('GPL-3.0-only', allowed)).toBe(false);
    expect(spdxAllowed('UNKNOWN', allowed)).toBe(false);
  });

  it('rejects expressions it cannot parse', () => {
    expect(() => parseSpdx('(MIT OR ISC')).toThrow();
    expect(() => parseSpdx('MIT OR')).toThrow();
    expect(() => parseSpdx('MIT ISC')).toThrow();
    expect(spdxAllowed('(MIT', allowed)).toBe(false);
    expect(spdxAllowed('', allowed)).toBe(false);
  });

  it('gives AND a tighter bind than OR', () => {
    expect(parseSpdx('A OR B AND C')).toEqual({
      op: 'or',
      items: [
        { op: 'id', id: 'A' },
        {
          op: 'and',
          items: [
            { op: 'id', id: 'B' },
            { op: 'id', id: 'C' },
          ],
        },
      ],
    });
  });
});

describe('policy', () => {
  it('fails a disallowed licence unless an exception names the package and licence', () => {
    const pkgs = [
      { name: 'ok', version: '1.0.0', license: 'MIT' },
      { name: 'copyleft', version: '2.0.0', license: 'GPL-3.0-only' },
      { name: 'excepted', version: '3.0.0', license: 'LGPL-3.0-only' },
    ];
    const findings = judge(pkgs, {
      ...policy,
      exceptions: [
        { package: 'excepted', license: 'LGPL-3.0-only', reason: 'dynamic link, reviewed' },
        { package: 'copyleft', license: 'GPL-2.0-only', reason: 'older licence' },
      ],
    });
    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'GPL-3.0-only',
        message: expect.stringContaining('copyleft@2.0.0'),
      }),
    ]);
  });

  it('is a setup error when an exception has no reason', () => {
    const root = trees.make({
      [ALLOW_FILE]: JSON.stringify({
        allowed: ['MIT'],
        exceptions: [{ package: 'x', license: 'GPL-3.0-only' }],
      }),
    });
    expect(loadPolicy(root).errors[0]).toContain('"reason" is mandatory');
    expect(loadPolicy(trees.make()).errors[0]).toContain('is missing');
  });

  it('ships an allow-list with the agreed starting licences', () => {
    const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const { policy: real, errors } = loadPolicy(productRoot);
    expect(errors).toEqual([]);
    expect(real.allowed).toEqual([
      'MIT',
      'MIT-0',
      'ISC',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'Apache-2.0',
      '0BSD',
      'BlueOak-1.0.0',
      'CC0-1.0',
      'Unlicense',
      'Python-2.0',
    ]);
  });
});

/** A small pnpm-style layout: top-level links into `.pnpm/<name>@<version>/node_modules`. */
function pnpmTree(): string {
  const root = trees.make({
    'package.json': JSON.stringify({
      dependencies: { app: '1.0.0' },
      optionalDependencies: { gone: '1.0.0' },
      devDependencies: { tooling: '1.0.0' },
    }),
    [ALLOW_FILE]: JSON.stringify(policy),
    'node_modules/.pnpm/app@1.0.0/node_modules/app/package.json': JSON.stringify({
      name: 'app',
      version: '1.0.0',
      license: 'MIT',
      dependencies: { helper: '^2' },
    }),
    'node_modules/.pnpm/helper@2.1.0/node_modules/helper/package.json': JSON.stringify({
      name: 'helper',
      version: '2.1.0',
      licenses: [{ type: 'GPL-3.0-only' }],
    }),
    'node_modules/.pnpm/tooling@1.0.0/node_modules/tooling/package.json': JSON.stringify({
      name: 'tooling',
      version: '1.0.0',
      license: 'GPL-3.0-only',
    }),
  });
  const link = (target: string, at: string) => {
    mkdirSync(dirname(join(root, at)), { recursive: true });
    symlinkSync(join(root, target), join(root, at), 'dir');
  };
  link('node_modules/.pnpm/app@1.0.0/node_modules/app', 'node_modules/app');
  link('node_modules/.pnpm/tooling@1.0.0/node_modules/tooling', 'node_modules/tooling');
  link(
    'node_modules/.pnpm/helper@2.1.0/node_modules/helper',
    'node_modules/.pnpm/app@1.0.0/node_modules/helper',
  );
  return root;
}

describe('listing production dependencies', () => {
  it('walks node_modules from package.json dependencies, transitively, without dev ones', () => {
    const { pkgs, missing } = listFromNodeModules(pnpmTree());
    expect(pkgs).toEqual([
      { name: 'app', version: '1.0.0', license: 'MIT' },
      { name: 'helper', version: '2.1.0', license: 'GPL-3.0-only' },
    ]);
    expect(missing).toEqual([]);
  });

  it('fails on a transitive licence outside the policy (fallback path)', async () => {
    const res = await runLicenses(contextFor(pnpmTree()), { usePnpm: false });
    expect(res.status).toBe('fail');
    expect(res.findings.map((f) => f.message)).toEqual([expect.stringContaining('helper@2.1.0')]);
  });

  it('is a setup error when a production dependency is not installed', async () => {
    const root = trees.make({
      'package.json': JSON.stringify({ dependencies: { absent: '1.0.0' } }),
      [ALLOW_FILE]: JSON.stringify(policy),
    });
    const res = await runLicenses(contextFor(root), { usePnpm: false });
    expect(res.status).toBe('error');
    expect(res.notes.join(' ')).toContain('absent');
  });

  it('falls back to node_modules when pnpm cannot list licences', async () => {
    const root = pnpmTree();
    writeTree(root, { 'pnpm-lock.yaml': 'not: [a valid lockfile' });
    const res = await runLicenses(contextFor(root));
    expect(res.notes[0]).toContain('walked node_modules instead');
    expect(res.findings).toHaveLength(1);
  });

  it('reads pnpm licenses output for the real product', () => {
    const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const { pkgs } = listWithPnpm(productRoot);
    if (pkgs === null) return; // pnpm missing on this machine: the fallback tests cover it.
    expect(pkgs.map((p) => p.name)).toContain('react');
    expect(pkgs.every((p) => p.license.length > 0)).toBe(true);
  });
});
