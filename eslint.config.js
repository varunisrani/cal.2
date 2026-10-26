import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// The architecture's seams as lint rules (P00-07, 04-architecture §2). When two blocks set the
// same rule for a file, the later block's options replace the earlier ones, so each narrower
// block below restates the whole list for its folder.

const TESTS = ['**/*.test.{ts,tsx}', 'src/test/**'];
const SCREENS = ['src/features/**', 'src/app/**', 'src/ui/**'];

const STORAGE_MESSAGE = 'IndexedDB is reached only through the repositories in src/data.';
const NETWORK_MESSAGE =
  'Network calls go through src/ai/transport.ts (AI) or src/services/barcode (food databases).';
const DOMAIN_MESSAGE =
  'src/domain is pure: no React, Dexie or other layers (src/lib is fine; use Intl directly).';
const SCREEN_MESSAGE = 'Screens read through src/data/hooks and act through src/services.';
const COPY_MESSAGE = 'put user-visible text in the catalogue';

/** `no-restricted-globals` for the named globals, also reached as window.x, globalThis.x, self.x. */
const restrictGlobals = (...names) => [
  'error',
  {
    checkGlobalObject: true,
    globals: names.map((name) => ({
      name,
      message: name === 'fetch' ? NETWORK_MESSAGE : STORAGE_MESSAGE,
    })),
  },
];

// Copy: JSX text holding a letter, or a string or template literal holding a letter that is the
// direct value of a copy attribute or of a JSX child in braces. A literal inside a call
// (t('a.b')) is not copy, and neither is alt="" (a decorative image).
const LETTER = '/\\p{L}/u';
const COPY_ATTRIBUTE = 'JSXAttribute[name.name=/^(?:aria-label|title|placeholder|alt)$/]';
const IN_BRACES = `:matches(${COPY_ATTRIBUTE}, JSXElement, JSXFragment) > JSXExpressionContainer`;
const COPY_SELECTORS = [
  `JSXText[value=${LETTER}]`,
  `${COPY_ATTRIBUTE} > Literal[value=${LETTER}]`,
  `${IN_BRACES} > Literal[value=${LETTER}]`,
  `${IN_BRACES} > TemplateLiteral:has(> TemplateElement[value.raw=${LETTER}])`,
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'test-results',
      'playwright-report',
      // Files that must break the rules; scripts/lint-rules.test.ts lints them under virtual paths.
      'scripts/lint-fixtures',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Rules 3 and 4: fetch and IndexedDB stay behind their seams. Tests are free.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: TESTS,
    rules: { 'no-restricted-globals': restrictGlobals('fetch', 'indexedDB') },
  },
  {
    files: ['src/data/**'],
    ignores: TESTS,
    rules: { 'no-restricted-globals': restrictGlobals('fetch') },
  },
  {
    files: [
      'src/ai/transport.ts',
      'src/services/barcode/**',
      'src/sw/**',
      'e2e/**',
      'scripts/**',
      'tooling/**',
    ],
    ignores: TESTS,
    rules: { 'no-restricted-globals': restrictGlobals('indexedDB') },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/data/**', ...TESTS],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: STORAGE_MESSAGE }],
          patterns: [{ group: ['dexie/*'], message: STORAGE_MESSAGE }],
        },
      ],
    },
  },

  // Rule 1: the domain is pure, its tests included. src/lib and src/test stay reachable.
  {
    files: ['src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'dexie'].map((name) => ({
            name,
            message: DOMAIN_MESSAGE,
          })),
          patterns: [
            {
              group: [
                'react/*',
                'react-dom/*',
                'dexie/*',
                '**/data',
                '**/ai',
                '**/services',
                '**/features',
                '**/app',
                '**/ui',
                '**/i18n',
              ],
              message: DOMAIN_MESSAGE,
            },
          ],
        },
      ],
    },
  },

  // Rule 2: screens never touch the database or the AI wire directly. Their tests may.
  {
    files: SCREENS,
    ignores: TESTS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: SCREEN_MESSAGE }],
          patterns: [
            {
              group: [
                'dexie/*',
                '**/data/db',
                '**/data/db.*',
                '**/data/repos',
                '**/ai/adapters',
                '**/ai/transport',
                '**/ai/transport.*',
              ],
              message: SCREEN_MESSAGE,
            },
          ],
        },
      ],
    },
  },

  // Rule 5: screens take their words from the catalogue (src/i18n/en.ts).
  {
    files: SCREENS.map((folder) => `${folder}/*.tsx`),
    ignores: TESTS,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...COPY_SELECTORS.map((selector) => ({ selector, message: COPY_MESSAGE })),
      ],
    },
  },
);
