// @vitest-environment node
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultRefPath, resolveRefPath } from './lib/ref';
import { contextFor, TempTrees } from './lib/tempTree';
import { result, type CheckName } from './lib/types';
import { CHECKS, exitCodeOf, formatText, main, parseArgs, runChecks, type CheckFn } from './runAll';

const trees = new TempTrees();
afterEach(() => trees.cleanup());

const fake = (overrides: Partial<Record<CheckName, CheckFn>>): Record<CheckName, CheckFn> => {
  const pass =
    (name: CheckName): CheckFn =>
    async () =>
      result(name, 'pass', 'ok');
  return {
    similarity: pass('similarity'),
    banned: pass('banned'),
    assets: pass('assets'),
    licenses: pass('licenses'),
    traps: pass('traps'),
    acceptance: pass('acceptance'),
    ...overrides,
  };
};

async function run(argv: string[], checks = fake({}), env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const code = await main(argv, env, {
    productRoot: trees.make(),
    checks,
    write: (t) => out.push(t),
  });
  return { code, text: out.join('\n') };
}

describe('parseArgs', () => {
  it('reads every flag, with repeatable --only', () => {
    expect(
      parseArgs([
        '--only',
        'banned',
        '--only=assets',
        '--require-ref',
        '--ref',
        '/r',
        '--strict',
        '--closest',
        '7',
        '--json',
      ]),
    ).toEqual({
      only: ['banned', 'assets'],
      requireRef: true,
      ref: '/r',
      strict: true,
      closest: 7,
      json: true,
    });
  });

  it('rejects unknown checks, flags and bad numbers', () => {
    expect(parseArgs(['--only', 'nope'])).toEqual({ error: 'unknown check "nope"' });
    expect(parseArgs(['--fast'])).toEqual({ error: 'unknown argument "--fast"' });
    expect(parseArgs(['--closest', '0'])).toHaveProperty('error');
    expect(parseArgs(['--ref'])).toHaveProperty('error');
  });
});

describe('reference path', () => {
  it('prefers --ref, then PLATEWISE_REF, then ~/reference/<name>', () => {
    expect(resolveRefPath('/a', { PLATEWISE_REF: '/b' })).toBe('/a');
    expect(resolveRefPath(undefined, { PLATEWISE_REF: '/b' })).toBe('/b');
    expect(resolveRefPath(undefined, {})).toBe(defaultRefPath());
    expect(defaultRefPath('/home/x')).toMatch(/^\/home\/x\/reference\/\w+-\w+$/);
  });
});

describe('runner', () => {
  it('maps statuses to exit codes', () => {
    expect([
      exitCodeOf('pass'),
      exitCodeOf('skip'),
      exitCodeOf('fail'),
      exitCodeOf('error'),
    ]).toEqual([0, 0, 1, 2]);
  });

  it('runs every check even when one fails or throws, and exits with the worst code', async () => {
    const seen: string[] = [];
    const track =
      (name: CheckName, status: 'pass' | 'fail'): CheckFn =>
      async () => {
        seen.push(name);
        return result(name, status, status);
      };
    const checks = fake({
      similarity: track('similarity', 'fail'),
      banned: async () => {
        seen.push('banned');
        throw new Error('boom');
      },
      acceptance: track('acceptance', 'pass'),
    });
    const { code, text } = await run([], checks);
    expect(seen).toEqual(['similarity', 'banned', 'acceptance']);
    expect(code).toBe(2);
    expect(text).toMatch(/banned\s+ERROR\s+0\s+[\d.]+s\s+crashed: boom/);
    expect(text).toContain('exit 2 (setup problem)');
  });

  it('runs only the checks named by --only', async () => {
    const { code, text } = await run(['--only', 'licenses', '--only', 'traps'], fake({}));
    expect(code).toBe(0);
    expect(text).toMatch(/licenses\s+PASS/);
    expect(text).not.toMatch(/similarity\s+PASS/);
  });

  it('exits 2 on bad arguments', async () => {
    const { code, text } = await run(['--only', 'nope']);
    expect(code).toBe(2);
    expect(text).toContain('usage:');
  });

  it('prints JSON with --json', async () => {
    const checks = fake({
      assets: async () =>
        result('assets', 'fail', 'copied', {
          findings: [{ file: 'a.png', rule: 'x', message: 'm' }],
        }),
    });
    const { code, text } = await run(['--json', '--only', 'assets'], checks);
    expect(code).toBe(1);
    const parsed = JSON.parse(text) as {
      exitCode: number;
      checks: Array<{ name: string; findings: unknown[] }>;
    };
    expect(parsed.exitCode).toBe(1);
    expect(parsed.checks.map((c) => c.name)).toEqual(['assets']);
    expect(parsed.checks[0]!.findings).toHaveLength(1);
  });

  it('skips similarity and assets without a reference, and exits 2 with --require-ref', async () => {
    const missing = join(trees.make(), 'nowhere');
    const real = { ...fake({}), similarity: CHECKS.similarity, assets: CHECKS.assets };
    const soft = await run(['--only', 'similarity', '--only', 'assets', '--ref', missing], real);
    expect(soft.code).toBe(0);
    expect(soft.text).toMatch(/similarity\s+SKIP/);
    expect(soft.text).toContain('warning: reference not found');
    const hard = await run(['--only', 'similarity', '--only', 'assets', '--require-ref'], real, {
      PLATEWISE_REF: missing,
    });
    expect(hard.code).toBe(2);
    expect(hard.text).toMatch(/assets\s+ERROR/);
  });

  it('prints findings with location, reference and excerpt', async () => {
    const ctx = contextFor('/p');
    const results = await runChecks(
      ['similarity'],
      ctx,
      fake({
        similarity: async () =>
          result('similarity', 'fail', '1 shared region', {
            findings: [
              {
                file: 'src/a.ts',
                line: 3,
                rule: 'tokens',
                message: 'shared run',
                ref: 'web/b.ts:9',
                excerpt: 'x = 1',
              },
            ],
          }),
      }),
    );
    const text = formatText(results, ctx);
    expect(text).toContain('src/a.ts:3  [tokens] shared run');
    expect(text).toContain('reference: web/b.ts:9');
    expect(text).toContain('"x = 1"');
    expect(text).toContain('exit 1 (violations)');
  });
});
