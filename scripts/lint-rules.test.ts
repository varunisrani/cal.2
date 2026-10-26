// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COPY_MESSAGE = 'put user-visible text in the catalogue';

let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({ cwd: ROOT, overrideConfigFile: `${ROOT}eslint.config.js` });
  // Loads the config and the TypeScript parser once, outside the per-test timeout.
  await eslint.lintText('', { filePath: 'src/features/warmUp.tsx' });
}, 60_000);

const fixture = (name: string): string =>
  readFileSync(`${ROOT}scripts/lint-fixtures/${name}`, 'utf8');

/** Lints `code` as if it were the file at `filePath` (relative to the root); every message. */
async function lintAs(code: string, filePath: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

/** The distinct rule ids reported for `code` at `filePath`, in order of first report. */
async function ruleIdsAt(code: string, filePath: string): Promise<(string | null)[]> {
  return [...new Set((await lintAs(code, filePath)).map((message) => message.ruleId))];
}

describe('lint fixtures', () => {
  it.each([
    ['domainImportsReact.ts', 'src/domain/meals/viewedDay.ts', 'no-restricted-imports'],
    ['featureImportsRepo.tsx', 'src/features/home/ClearDayButton.tsx', 'no-restricted-imports'],
    ['featureFetch.tsx', 'src/features/log/LookUpButton.tsx', 'no-restricted-globals'],
    ['literalCopy.tsx', 'src/features/settings/NameField.tsx', 'no-restricted-syntax'],
  ])('%s, linted as %s, fails with %s and nothing else', async (name, filePath, ruleId) => {
    expect(await ruleIdsAt(fixture(name), filePath)).toEqual([ruleId]);
  });

  it('reports each of the five literals in the copy fixture with the catalogue message', async () => {
    const messages = await lintAs(
      fixture('literalCopy.tsx'),
      'src/features/settings/NameField.tsx',
    );
    expect(messages.map((message) => message.message)).toEqual(Array(5).fill(COPY_MESSAGE));
  });

  it('passes the clean screen that takes its text from t()', async () => {
    expect(await lintAs(fixture('cleanFeature.tsx'), 'src/features/home/TotalBadge.tsx')).toEqual(
      [],
    );
  });

  it('keeps the fixtures folder out of pnpm lint', async () => {
    expect(await eslint.isPathIgnored('scripts/lint-fixtures/literalCopy.tsx')).toBe(true);
    expect(await eslint.isPathIgnored('scripts/lint-rules.test.ts')).toBe(false);
  });
});

describe('layer boundaries', () => {
  it.each(['../../lib/result', '../../test/time', '../model', './dayKey'])(
    'lets the domain import %s',
    async (source) => {
      const code = `import * as allowed from '${source}';\nexport const used = allowed;\n`;
      expect(await ruleIdsAt(code, 'src/domain/dates/sample.ts')).toEqual([]);
    },
  );

  it.each([
    'react',
    'react-dom/client',
    'dexie',
    '../../i18n/t',
    '../../i18n',
    '../../data/hooks',
    '../../ai/client',
    '../../services/diary',
    '../../features/home/HomePage',
    '../../app/App',
    '../../ui/tokens',
  ])('keeps %s out of the domain, its tests included', async (source) => {
    const code = `import * as banned from '${source}';\nexport const used = banned;\n`;
    expect(await ruleIdsAt(code, 'src/domain/dates/sample.ts')).toEqual(['no-restricted-imports']);
    expect(await ruleIdsAt(code, 'src/domain/dates/sample.test.ts')).toEqual([
      'no-restricted-imports',
    ]);
  });

  it.each(['src/features/home', 'src/app', 'src/ui/sheets'])(
    'keeps the database and the AI wire out of %s, but not out of its tests',
    async (folder) => {
      const banned = [
        'dexie',
        '../../data/db',
        '../data/db.js',
        '../../data/repos/diaryRepo',
        '../../data/repos',
        '../../ai/adapters/gemini',
        '../../ai/transport',
      ];
      for (const source of banned) {
        const code = `import * as banned from '${source}';\nexport const used = banned;\n`;
        expect(await ruleIdsAt(code, `${folder}/Sample.tsx`), source).toEqual([
          'no-restricted-imports',
        ]);
        expect(await ruleIdsAt(code, `${folder}/Sample.test.tsx`), source).toEqual([]);
      }
    },
  );

  it.each(['../../data/hooks', '../../services/diary', '../../domain/model', '../../i18n/t'])(
    'lets a screen import %s',
    async (source) => {
      const code = `import * as allowed from '${source}';\nexport const used = allowed;\n`;
      expect(await ruleIdsAt(code, 'src/features/home/Sample.tsx')).toEqual([]);
    },
  );
});

describe('network and storage seams', () => {
  const callsFetch = "export const load = (url: string) => fetch(url, { method: 'GET' });\n";
  const opensDatabase = "export const open = () => indexedDB.open('sample');\n";
  const importsDexie = "import { Dexie } from 'dexie';\nexport const db = new Dexie('sample');\n";

  it.each([
    'src/ai/transport.ts',
    'src/services/barcode/lookup.ts',
    'src/sw/sw.ts',
    'src/services/diary.test.ts',
    'src/test/fakeServer.ts',
    'e2e/fake-ai/global-setup.ts',
    'scripts/sample.ts',
    'tooling/checks/sample.ts',
  ])('allows fetch in %s', async (filePath) => {
    expect(await ruleIdsAt(callsFetch, filePath)).toEqual([]);
  });

  it.each([
    'src/ai/client.ts',
    'src/ai/adapters/gemini.ts',
    'src/services/diary.ts',
    'src/data/db.ts',
    'src/domain/food/barcode.ts',
    'src/features/log/Sample.tsx',
    'src/app/Boot.tsx',
    'src/main.tsx',
  ])('refuses fetch in %s', async (filePath) => {
    expect(await ruleIdsAt(callsFetch, filePath)).toEqual(['no-restricted-globals']);
  });

  it.each(['window.fetch', 'globalThis.fetch', 'self.fetch', 'window.indexedDB'])(
    'refuses %s in a screen',
    async (callee) => {
      const code = `export const reach = () => ${callee};\n`;
      expect(await ruleIdsAt(code, 'src/features/log/Sample.tsx')).toEqual([
        'no-restricted-globals',
      ]);
    },
  );

  it('allows typeof fetch in a type, which calls nothing', async () => {
    const code = 'export type FetchLike = typeof fetch;\n';
    expect(await ruleIdsAt(code, 'src/ai/client.ts')).toEqual([]);
  });

  it.each(['src/data/db.ts', 'src/data/repos/diaryRepo.ts', 'src/services/diary.test.ts'])(
    'allows IndexedDB and dexie in %s',
    async (filePath) => {
      expect(await ruleIdsAt(opensDatabase, filePath)).toEqual([]);
      expect(await ruleIdsAt(importsDexie, filePath)).toEqual([]);
    },
  );

  it.each([
    'src/services/backup/restore.ts',
    'src/ai/transport.ts',
    'src/sw/sw.ts',
    'src/features/settings/Sample.tsx',
    'src/domain/model.ts',
    'scripts/sample.ts',
  ])('refuses IndexedDB and dexie in %s', async (filePath) => {
    expect(await ruleIdsAt(opensDatabase, filePath)).toEqual(['no-restricted-globals']);
    expect(await ruleIdsAt(importsDexie, filePath)).toEqual(['no-restricted-imports']);
  });
});

describe('copy rule', () => {
  const copyIn = (jsx: string) =>
    `import { t } from '../i18n/t';\nexport const View = () => (\n  ${jsx}\n);\nexport const keep = t;\n`;

  it.each([
    '<p>Today</p>',
    "<p>{'Today'}</p>",
    '<p>{`Today, ${t("common.appName")}`}</p>',
    '<>Today</>',
    '<svg><title>Plate</title></svg>',
    '<button title={"Close"} />',
    '<button aria-label={`Close ${t("common.appName")}`} />',
    '<input placeholder="Grams" />',
    '<p>Énergie</p>',
  ])('refuses %s in every screen folder', async (jsx) => {
    for (const folder of ['src/features/home', 'src/app', 'src/ui']) {
      const messages = await lintAs(copyIn(jsx), `${folder}/Sample.tsx`);
      expect(messages.map((message) => message.message)).toEqual([COPY_MESSAGE]);
    }
  });

  it.each([
    '<img src="/icons/mark.svg" alt="" />',
    "<p>{t('common.save')} · 2 / 3 {' '}%</p>",
    "<button aria-label={t('common.close')} title={t('common.close')} />",
    '<input placeholder="0" />',
    '<p data-ui="home.total" className="total">{t(\'common.done\')}</p>',
  ])('allows %s', async (jsx) => {
    expect(await lintAs(copyIn(jsx), 'src/features/home/Sample.tsx')).toEqual([]);
  });

  it('leaves tests and files outside the screens alone', async () => {
    const code = copyIn('<p>Today</p>');
    expect(await lintAs(code, 'src/features/home/Sample.test.tsx')).toEqual([]);
    expect(await lintAs(code, 'src/services/sample.tsx')).toEqual([]);
  });
});
