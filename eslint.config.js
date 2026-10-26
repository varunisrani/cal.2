import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Architecture boundaries (docs/plan/04-architecture.md §2), checked in src/ only. Flat config
// replaces a rule's options when two objects set it for the same file, so each rule below has
// exactly one object per file: the zones are disjoint, and each lists everything that applies.
// scripts/lint-rules.test.ts proves every rule on the files in scripts/lint-fixtures/.

/** Tests and shared test helpers: they may seed data, stub the network and assert on copy. */
const TESTS = ['**/*.test.{ts,tsx}', 'src/test/**'];
/** The code that draws screens. */
const SCREENS = ['src/app/**', 'src/ui/**', 'src/features/**'];
/** The only modules that call the network. */
const NETWORK = ['src/ai/transport.ts', 'src/services/barcode/**', 'src/sw/**'];
/** The only folder that talks to IndexedDB. */
const DATA = ['src/data/**'];

// Import patterns are gitignore-style and match the import as written, so `**/data/repos`
// catches `../data/repos` and everything below it, at any depth.
const DEXIE = {
  group: ['dexie', 'dexie-*'],
  message: 'Only src/data uses Dexie: go through a repository.',
};
const DOMAIN = {
  group: [
    'react',
    'react-dom',
    'dexie',
    'dexie-*',
    ...['data', 'ai', 'services', 'features', 'app', 'ui', 'i18n'].map((folder) => `**/${folder}`),
  ],
  message:
    'Keep src/domain pure: it imports only itself and src/lib (no React, Dexie, i18n or app).',
};
const SCREEN = {
  group: ['**/data/db', '**/data/repos', '**/ai/adapters', '**/ai/transport'],
  message: 'Screens use data hooks and services for data, and src/ai/client for AI.',
};

const FETCH = {
  name: 'fetch',
  message: 'Call AI through src/ai/client and food lookups through src/services/barcode.',
};
const INDEXED_DB = {
  name: 'indexedDB',
  message: 'Only src/data talks to IndexedDB: go through a repository.',
};

// The copy rule: text a person sees or hears comes from the catalogue. A string counts as copy
// when it holds a letter, so `alt=""`, `·` and `{' '}` stay legal.
const COPY_MESSAGE = 'put user-visible text in the catalogue';
const LETTER = '/\\p{L}/u';
const COPY_ATTRIBUTE = 'JSXAttribute[name.name=/^(aria-label|title|placeholder|alt)$/]';
/** Strings inside a `{…}`: a literal, a template, or a branch of `?:`, `??`, `||` or `&&`. */
const stringsIn = (container) => [
  `${container} > Literal[value=${LETTER}]`,
  `${container} > TemplateLiteral > TemplateElement[value.cooked=${LETTER}]`,
  `${container} > :matches(ConditionalExpression, LogicalExpression) > Literal[value=${LETTER}]`,
];
const COPY_SELECTORS = [
  `JSXText[value=${LETTER}]`,
  `${COPY_ATTRIBUTE} > Literal[value=${LETTER}]`,
  ...stringsIn(`${COPY_ATTRIBUTE} > JSXExpressionContainer`),
  ...stringsIn(':matches(JSXElement, JSXFragment) > JSXExpressionContainer'),
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'test-results',
      'playwright-report',
      // They break the rules on purpose; scripts/lint-rules.test.ts lints them under virtual paths.
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

  // Imports: the domain is pure, its tests included (rule 1); screens never reach storage or the
  // AI wire (rule 2); Dexie stays in src/data (rule 4).
  {
    name: 'boundaries/domain-imports',
    files: ['src/domain/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [DOMAIN] }] },
  },
  {
    name: 'boundaries/screen-imports',
    files: SCREENS,
    ignores: TESTS,
    rules: { 'no-restricted-imports': ['error', { patterns: [SCREEN, DEXIE] }] },
  },
  {
    name: 'boundaries/dexie-imports',
    files: ['src/**'],
    ignores: ['src/domain/**', ...SCREENS, ...DATA, ...TESTS],
    rules: { 'no-restricted-imports': ['error', { patterns: [DEXIE] }] },
  },

  // Globals: fetch only in the network modules (rule 3), indexedDB only in src/data (rule 4).
  {
    name: 'boundaries/globals',
    files: ['src/**'],
    ignores: [...NETWORK, ...DATA, ...TESTS],
    rules: { 'no-restricted-globals': ['error', FETCH, INDEXED_DB] },
  },
  {
    name: 'boundaries/network-globals',
    files: NETWORK,
    ignores: TESTS,
    rules: { 'no-restricted-globals': ['error', INDEXED_DB] },
  },
  {
    name: 'boundaries/data-globals',
    files: DATA,
    ignores: TESTS,
    rules: { 'no-restricted-globals': ['error', FETCH] },
  },

  // Copy (rule 5): screens show catalogue text only.
  {
    name: 'boundaries/copy',
    files: ['src/{app,ui,features}/**/*.tsx'],
    ignores: TESTS,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...COPY_SELECTORS.map((selector) => ({ selector, message: COPY_MESSAGE })),
      ],
    },
  },
);
