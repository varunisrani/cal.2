# Task: lint boundaries and the copy rule (P00-07) · Phase: 00 · Owner: builder (wt-p00s4, slice S4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart: these
are lint rules over our own layout, so no reference file was opened. Sources: the P00-07 row of
`docs/plan/phases/P00-foundations.md`, the design rules of `docs/plan/04-architecture.md` §2 (pure
domain, one AI seam, data through repositories, thin UI), the Layers / IndexedDB / Network / Copy
rows of `docs/plan/phases/00-layout-and-conventions.md` §2, the lead's decisions in the task brief
and in `docs/HANDOFF.md` ("Notes for later waves"), and the installed ESLint 9.39 sources of
`no-restricted-imports` and `no-restricted-globals` (to learn their options).

What it does (own words): `pnpm lint` turns the architecture's seams into errors, so a builder
who crosses one finds out at once instead of in review. The domain stays pure: no React, no Dexie
and none of the other layers (only `src/lib`). Screens (`features`, `app`, `ui`) never reach the
database or the AI wire directly: no `dexie`, no `data/db`, no repositories, no AI adapters, no
transport. The network has two doors (`src/ai/transport.ts` for AI, `src/services/barcode/**` for
food databases, plus the service worker and the tooling); `fetch` anywhere else is an error, also
when written as `window.fetch` or `globalThis.fetch`. IndexedDB, the global or the `dexie`
package, belongs to `src/data/**`. Screens take their words from the catalogue: JSX text with a
letter in it, and a literal `aria-label`, `title`, `placeholder` or `alt`, fail with "put
user-visible text in the catalogue". A fixture per rule proves each rule fires, alone, under a
path in the folder it guards, and a clean screen using `t()` proves the rules leave good code
alone.

Inputs → outputs: a `.ts`/`.tsx` file and its path → ESLint messages with the rule id
`no-restricted-imports` (rules 1, 2 and the `dexie` half of 4), `no-restricted-globals` (rule 3
and the `indexedDB` half of 4) or `no-restricted-syntax` (rule 5), each with our own message.

Files: changed `eslint.config.js`; created `scripts/lint-fixtures/domainImportsReact.ts`,
`scripts/lint-fixtures/featureImportsRepo.tsx`, `scripts/lint-fixtures/featureFetch.tsx`,
`scripts/lint-fixtures/literalCopy.tsx`, `scripts/lint-fixtures/cleanFeature.tsx`,
`scripts/lint-rules.test.ts`; changed `src/app/App.tsx` (heading from `t('common.appName')`, the
developer paragraph dropped) and `src/app/App.test.tsx`. Shared: `tsconfig.node.json` gains
`"exclude": ["scripts/lint-fixtures"]` (its `include` takes all of `scripts/`, and the fixtures
import modules that do not exist and use JSX under a config without `jsx`, so they cannot
typecheck; they are lint input only).

Edge cases / failure modes:
- ESLint flat config replaces a rule's options when a later block sets the same rule for a file,
  so overlapping regions must be layered on purpose (a general block first, then narrower blocks
  that restate the full list for their folder), or the domain's list would wipe out the `dexie`
  ban, or the `fetch` exemption would wipe out the `indexedDB` ban.
- `window.fetch`, `globalThis.fetch`, `self.fetch` (and the same for `indexedDB`) dodge a plain
  global ban: turn on `checkGlobalObject`.
- `typeof fetch` in a type position is not a call; it must stay legal (P03 types an injected
  fetch that way).
- Relative imports climb a varying number of `../`, so folder bans match the path's segments
  (`**/data/repos`), not a fixed prefix; a folder import (`../data/repos`) and a file with an
  explicit extension (`../data/db.js`) must be caught too.
- `alt=""` marks a decorative image and must stay legal; whitespace, numbers and punctuation in
  JSX (`{' '}`, `·`, `/`) are not copy.
- `{'Hello'}` as a JSX child and `title={'Close'}` are the same literal copy in braces.
- `t('common.save')` contains a string literal with letters: only literals that are the direct
  value of a copy attribute or of a JSX child count, never one nested in a call.
- The fixtures themselves must not turn `pnpm lint` red: the folder is ignored by the config and
  linted only through the test, under virtual paths.

Our design differences / decisions:
- Only built-in rules: `no-restricted-imports` (`paths` for packages, gitignore-style `patterns`
  for folders), `no-restricted-globals` (with `checkGlobalObject`) and `no-restricted-syntax`.
- Test files are `**/*.test.{ts,tsx}` and `src/test/**`. They are exempt from rules 2 to 5 (a
  screen's test may seed data through a repository, stub `fetch`, open IndexedDB or assert on
  literal text). Rule 1 still applies to domain tests: a test of pure code has no reason to touch
  React, Dexie or another layer, and `src/test/**` stays importable.
- `fetch` allowed in `src/ai/transport.ts`, `src/services/barcode/**`, `src/sw/**`, tests,
  `e2e/**`, `scripts/**`, `tooling/**` (lead's decision). `indexedDB` and `dexie` allowed only in
  `src/data/**` and tests (lead's decision; `e2e/**`, `scripts/**` and `tooling/**` are not tests
  for this purpose).
- Rule 1 bans `react`, `react-dom`, `dexie` (and their subpaths) and the folders `data`, `ai`,
  `services`, `features`, `app`, `ui` and `i18n` (the domain stays locale-free and may use `Intl`
  directly); `src/lib` and `src/test` stay allowed.
- Copy rule selectors: JSX text with a Unicode letter (`\p{L}`); a string literal with a letter as
  the direct value of `aria-label`, `title`, `placeholder` or `alt`, written bare or in braces; a
  template literal with a letter in the same place; a string literal with a letter as a JSX child
  in braces. Only `.tsx` files in `src/{app,ui,features}/**`.
- Messages are ours and name the way out ("… go through src/ai/transport.ts …").
- App placeholder: the heading reads `t('common.appName')`; the paragraph "Walking skeleton…" is
  dropped instead of becoming a throwaway `shell` partition (P04 replaces the placeholder anyway),
  so `src/i18n/en.ts` stays untouched.

Tests we will write (`scripts/lint-rules.test.ts`, node environment, one `ESLint` instance over
the real `eslint.config.js`, `lintText` under virtual paths):
- Each of the four fixtures fails with exactly its rule id; the copy fixture reports every planted
  literal with the catalogue message; the clean fixture passes with no message at all.
- The fixtures folder is ignored by the config (`isPathIgnored`).
- Boundaries: the domain may import `src/lib` and `src/test`, not `src/i18n`, React, Dexie or the
  other layers; `features`, `app` and `ui` may import hooks, services, domain and i18n but not
  `dexie`, `data/db`, repositories, adapters or transport (also a folder import and a `.js` path);
  a screen's test may.
- Network and storage: `fetch` passes in each allowed place and fails elsewhere, also through
  `window`/`globalThis`/`self`; `typeof fetch` in a type passes; `indexedDB` and `dexie` pass in
  `src/data/**` and tests and fail elsewhere (including the transport).
- Copy: braces variants and SVG `<title>` text fail in all three folders; `alt=""`, punctuation,
  `t()` values and test files pass; a `.ts` file is out of scope.
- `src/app/App.test.tsx`: the heading is the catalogue's app name and the placeholder shows no
  other text.

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart;
compared against the P00-07 row, the conventions table and the lead's decisions):
- [x] Rule 1: the domain fixture fails with `no-restricted-imports` only (tested in
      `scripts/lint-rules.test.ts > lint fixtures > domainImportsReact.ts, linted as
      src/domain/meals/viewedDay.ts, fails with no-restricted-imports and nothing else`); React,
      Dexie, `i18n` and the six layers refused, in domain tests too (`> layer boundaries > keeps %s
      out of the domain, its tests included`, 11 cases); `src/lib`, `src/test` and the domain's own
      files allowed (`> lets the domain import %s`, 4 cases)
- [x] Rule 2: the screen fixture fails with `no-restricted-imports` only (`> lint fixtures >
      featureImportsRepo.tsx, linted as src/features/home/ClearDayButton.tsx, …`); `dexie`,
      `data/db` (also `db.js`), repositories (also the folder), adapters and transport refused in
      `src/features`, `src/app` and `src/ui`, allowed in their tests (`> layer boundaries > keeps
      the database and the AI wire out of %s, but not out of its tests`, 3 cases); hooks, services,
      domain and i18n allowed (`> lets a screen import %s`, 4 cases)
- [x] Rule 3: the fetch fixture fails with `no-restricted-globals` only (`> lint fixtures >
      featureFetch.tsx, linted as src/features/log/LookUpButton.tsx, …`); allowed in the eight
      places of the decision (`> network and storage seams > allows fetch in %s`), refused in eight
      others (`> refuses fetch in %s`), also as `window.`/`globalThis.`/`self.fetch` (`> refuses %s
      in a screen`); `typeof fetch` in a type passes (`> allows typeof fetch in a type, which calls
      nothing`)
- [x] Rule 4: `indexedDB` and `dexie` allowed in `src/data/**` and tests (`> allows IndexedDB and
      dexie in %s`, 3 cases), refused elsewhere, the transport and the service worker included
      (`> refuses IndexedDB and dexie in %s`, 6 cases; `> refuses window.indexedDB in a screen`)
- [x] Rule 5: the copy fixture fails with `no-restricted-syntax` only (`> lint fixtures >
      literalCopy.tsx, linted as src/features/settings/NameField.tsx, …`), each of its five
      literals reported with "put user-visible text in the catalogue" (`> reports each of the five
      literals in the copy fixture with the catalogue message`); braces, template, fragment, SVG
      title and non-Latin variants refused in all three folders (`> copy rule > refuses %s in every
      screen folder`, 9 cases); `alt=""`, punctuation, numbers and `t()` values allowed (`> allows
      %s`, 5 cases); tests and files outside the screens untouched (`> leaves tests and files
      outside the screens alone`)
- [x] Clean fixture passes with no message at all (`> lint fixtures > passes the clean screen that
      takes its text from t()`)
- [x] Fixtures out of `pnpm lint` (`> lint fixtures > keeps the fixtures folder out of pnpm
      lint`); `pnpm lint` on the real tree: clean
- [x] App placeholder obeys the copy rule (`src/app/App.test.tsx > App > renders the product
      name`, `> shows only text from the catalogue`)
- [x] The tests bite: with `checkGlobalObject` off, 4 tests fail; with `**/data/repos` narrowed to
      `**/data/repos/**`, 3 fail (config restored byte for byte afterwards)
- Deliberate differences: n/a (no reference behaviour).
- Not taken: dynamic `import('dexie')` and `import('../data/repos/x')` are not caught (the built-in
  `no-restricted-imports` sees only static imports and re-exports; a `no-restricted-syntax`
  selector on `ImportExpression` would have to be merged into the copy rule's list for screens);
  `aria-valuetext`, `aria-description` and `aria-roledescription` are not copy attributes yet;
  `src/sw`, `src/config` and `src/generated` are not banned from the domain (the row lists six
  layers plus the decided `i18n`).

## Decisions for the lead

- Test files (`**/*.test.{ts,tsx}`, `src/test/**`) are exempt from rules 2 to 5: a screen's test
  may seed data through a repository, open IndexedDB, stub `fetch` and assert on literal text.
  Rule 1 still applies to domain tests (they may import `src/test/**`). One glob, `TESTS`, in
  `eslint.config.js`.
- `indexedDB`/`dexie`: `e2e/**`, `scripts/**` and `tooling/**` are not "tests" for this rule
  (read literally from the decision). If an e2e spec ever needs `page.evaluate(() =>
  indexedDB…)`, exempt `e2e/**` like the tests in the storage blocks of `eslint.config.js`.
- `no-restricted-globals` runs with `checkGlobalObject: true` (an option of the installed ESLint 9.39 rule), so
  `window.fetch`, `globalThis.fetch` and `self.fetch` are the same error as `fetch`. Type positions
  (`typeof fetch`) are never reported, so P03 can type an injected fetch without an exemption.
- Rule 2 also catches a folder import (`../data/repos`) and an explicit `.js` extension
  (`../data/db.js`, `../ai/transport.js`); type-only imports are refused like any other import.
- Copy rule: a literal counts only when it holds a Unicode letter (`\p{L}`), so `alt=""`, `{' '}`,
  `·`, `/`, `%` and `placeholder="0"` stay legal. Besides the row's two cases it also refuses a
  string or template literal written in braces, as a JSX child or as a copy attribute's value.
  Literals nested deeper (a call's argument, a ternary branch) are not checked, so `t('a.b')` is
  never a false positive.
- App placeholder: the paragraph "Walking skeleton. Features land phase by phase." was dropped
  rather than kept in a new `shell` partition, so `src/i18n/en.ts` is untouched. The page shows the
  heading only; the smoke e2e checks only the heading.
- Shared file: `tsconfig.node.json` gains `"exclude": ["scripts/lint-fixtures"]`; its `include`
  takes all of `scripts/`, and the fixtures import modules that do not exist and use JSX under a
  config without `jsx`, so `pnpm typecheck` failed on them (15 errors) before the exclude.
- Follow-ups for other builders: P01 domain units may not import `src/i18n` (use `Intl`
  directly); P03-02's `src/ai/testing/fakeFetch.ts` is not in the fetch allow-list, so it should
  take fetch by injection (or the lead adds `src/ai/testing/**`); every `.tsx` in `src/ui/**`
  (P00-02..04, P04 primitives) is under the copy rule.

## Status

Done (2026-10-26). Rules 1 to 5 in `eslint.config.js`, five fixtures, `scripts/lint-rules.test.ts`
(74 tests) and the App placeholder on the catalogue (2 tests). Outside the task's files:
`tsconfig.node.json` (one `exclude` line; the `include` line gained a comma). Trap R07.20
groundwork: copy rule in place.
