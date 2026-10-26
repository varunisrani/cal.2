// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'scripts/lint-fixtures');

const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, 'eslint.config.js') });

const COPY_MESSAGE = 'put user-visible text in the catalogue';

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

/** Lints `code` as if it were the file at `virtualPath` (relative to the repository root). */
async function lint(code: string, virtualPath: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, virtualPath) });
  if (!result) throw new Error(`no lint result for ${virtualPath}`);
  return result.messages;
}

async function ruleIds(code: string, virtualPath: string): Promise<(string | null)[]> {
  return (await lint(code, virtualPath)).map((m) => m.ruleId);
}

const importOf = (source: string): string =>
  `import * as probe from '${source}';\nexport { probe };\n`;
const FETCH_CALL = 'export const load = (url: string) => fetch(url);\n';
const OPEN_DB = "export const open = () => indexedDB.open('probe');\n";

// The first run loads the config and the TypeScript parser, which takes a few seconds.
beforeAll(async () => {
  await lint('export {};\n', 'src/lib/warmUp.ts');
}, 60_000);

describe('lint fixtures', () => {
  it('keeps React out of the domain (rule 1)', async () => {
    const messages = await lint(fixture('domainImportsReact.ts'), 'src/domain/fixture.ts');
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
    expect(messages[0]?.message).toContain('Keep src/domain pure');
  });

  it('keeps repositories out of the screens (rule 2)', async () => {
    const messages = await lint(fixture('featureImportsRepo.tsx'), 'src/features/home/Fixture.tsx');
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
    expect(messages[0]?.message).toContain('Screens use data hooks and services');
  });

  it('keeps fetch out of the screens (rule 3)', async () => {
    const messages = await lint(fixture('featureFetch.tsx'), 'src/features/log/Fixture.tsx');
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-globals']);
    expect(messages[0]?.message).toContain('src/ai/client');
  });

  it('keeps IndexedDB out of the services (rule 4)', async () => {
    const messages = await lint(fixture('serviceOpensIndexedDb.ts'), 'src/services/backup.ts');
    expect(messages.map((m) => m.ruleId)).toEqual(['no-restricted-globals']);
    expect(messages[0]?.message).toContain('Only src/data talks to IndexedDB');
  });

  it.each(['src/features/home/Fixture.tsx', 'src/app/Fixture.tsx', 'src/ui/Fixture.tsx'])(
    'finds each of the ten planted strings of copy as %s (rule 5)',
    async (virtualPath) => {
      const messages = await lint(fixture('literalCopy.tsx'), virtualPath);
      expect(messages.map((m) => m.ruleId)).toEqual(Array(10).fill('no-restricted-syntax'));
      expect(new Set(messages.map((m) => m.message))).toEqual(new Set([COPY_MESSAGE]));
    },
  );

  it('passes a screen that takes its text from t()', async () => {
    expect(await lint(fixture('cleanFeature.tsx'), 'src/features/home/Fixture.tsx')).toEqual([]);
  });

  it('keeps the fixtures out of `pnpm lint` on the real tree', async () => {
    for (const name of [
      'domainImportsReact.ts',
      'featureImportsRepo.tsx',
      'featureFetch.tsx',
      'serviceOpensIndexedDb.ts',
      'literalCopy.tsx',
      'cleanFeature.tsx',
    ]) {
      expect(await eslint.isPathIgnored(join(FIXTURES, name)), name).toBe(true);
    }
  });
});

describe('rule 1: domain imports', () => {
  it.each([
    'react',
    'react-dom/client',
    'react/jsx-runtime',
    'dexie',
    '../data/repos/entries',
    '../ai/client',
    '../services/diary',
    '../features/home/Home',
    '../app/App',
    '../ui/Button',
    '../i18n/t',
  ])('rejects %s', async (source) => {
    expect(await ruleIds(importOf(source), 'src/domain/fixture.ts')).toEqual([
      'no-restricted-imports',
    ]);
  });

  it('holds for domain tests too', async () => {
    expect(await ruleIds(importOf('react'), 'src/domain/fixture.test.ts')).toEqual([
      'no-restricted-imports',
    ]);
  });

  it.each(['../lib/result', '../lib/clock', './dates/dayKey'])('allows %s', async (source) => {
    expect(await ruleIds(importOf(source), 'src/domain/fixture.ts')).toEqual([]);
  });

  it('lets domain tests use the shared test helpers', async () => {
    expect(await ruleIds(importOf('../test/time'), 'src/domain/fixture.test.ts')).toEqual([]);
  });
});

describe('rule 2: screen imports', () => {
  const screens = [
    'src/features/home/Fixture.tsx',
    'src/app/shell/Fixture.tsx',
    'src/ui/x/Fixture.tsx',
  ];

  it.each(
    screens.flatMap((path) =>
      [
        'dexie',
        '../../data/db',
        '../../data/db/schema',
        '../../data/repos',
        '../../data/repos/entries',
        '../../ai/adapters/chat',
        '../../ai/transport',
      ].map((source) => [path, source] as const),
    ),
  )('%s rejects %s', async (path, source) => {
    expect(await ruleIds(importOf(source), path)).toEqual(['no-restricted-imports']);
  });

  it.each([
    'react',
    '../../data/hooks',
    '../../services/diary',
    '../../ai/client',
    '../../ai/transportErrors',
    '../../i18n/t',
    '../../domain/model',
  ])('allows %s', async (source) => {
    expect(await ruleIds(importOf(source), 'src/features/home/Fixture.tsx')).toEqual([]);
  });

  it.each(['dexie', '../../data/repos/entries'])(
    'lets screen tests seed data through %s',
    async (source) => {
      expect(await ruleIds(importOf(source), 'src/features/home/Fixture.test.tsx')).toEqual([]);
    },
  );
});

describe('rule 3: fetch', () => {
  it.each([
    'src/data/db.ts',
    'src/services/diary.ts',
    'src/ai/client.ts',
    'src/ai/adapters/chat.ts',
    'src/app/App.tsx',
    'src/domain/fixture.ts',
    'src/lib/fixture.ts',
  ])('rejects fetch in %s', async (path) => {
    expect(await ruleIds(FETCH_CALL, path)).toEqual(['no-restricted-globals']);
  });

  it.each([
    'src/ai/transport.ts',
    'src/services/barcode/lookup.ts',
    'src/sw/worker.ts',
    'src/features/log/Capture.test.tsx',
    'src/test/network.ts',
    'e2e/fixture.ts',
    'scripts/fixture.ts',
    'tooling/fixture.ts',
  ])('allows fetch in %s', async (path) => {
    expect(await ruleIds(FETCH_CALL, path)).toEqual([]);
  });
});

describe('rule 4: IndexedDB and Dexie', () => {
  it.each([
    'src/services/backup.ts',
    'src/ai/transport.ts',
    'src/sw/worker.ts',
    'src/features/home/Home.tsx',
    'src/domain/fixture.ts',
  ])('rejects the indexedDB global in %s', async (path) => {
    expect(await ruleIds(OPEN_DB, path)).toEqual(['no-restricted-globals']);
  });

  it.each(['src/services/diary.ts', 'src/ai/client.ts', 'src/lib/fixture.ts', 'src/main.tsx'])(
    'rejects importing dexie in %s',
    async (path) => {
      expect(await ruleIds(importOf('dexie'), path)).toEqual(['no-restricted-imports']);
    },
  );

  it.each(['dexie/dist/dexie.mjs', 'dexie-react-hooks'])(
    'rejects importing %s outside src/data',
    async (source) => {
      expect(await ruleIds(importOf(source), 'src/services/diary.ts')).toEqual([
        'no-restricted-imports',
      ]);
    },
  );

  it.each([
    'src/data/db.ts',
    'src/data/repos/entries.ts',
    'src/services/diary.test.ts',
    'src/test/database.ts',
  ])('allows IndexedDB and dexie in %s', async (path) => {
    expect(await ruleIds(OPEN_DB, path)).toEqual([]);
    expect(await ruleIds(importOf('dexie'), path)).toEqual([]);
  });
});

describe('rule 5: copy', () => {
  it('exempts test files', async () => {
    expect(await lint(fixture('literalCopy.tsx'), 'src/features/home/Fixture.test.tsx')).toEqual(
      [],
    );
  });

  it('leaves files outside the screens alone', async () => {
    expect(await lint(fixture('literalCopy.tsx'), 'src/lib/fixture.tsx')).toEqual([]);
  });

  it('does not count the key inside t() as copy', async () => {
    const code =
      "import { t } from '../../i18n/t';\n" +
      "export const Close = () => <button title={t('common.close')}>{t('common.close')}</button>;\n";
    expect(await lint(code, 'src/features/home/Fixture.tsx')).toEqual([]);
  });
});
