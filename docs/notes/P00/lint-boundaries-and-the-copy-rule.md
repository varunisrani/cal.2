# Task: lint boundaries and the copy rule (P00-07) · Phase: 00 · Owner: builder (wt-p00s4, slice S4)

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart and
lint configuration has no reference behaviour to match. Read `docs/plan/phases/P00-foundations.md`
(P00-07 row), `docs/plan/04-architecture.md` §2 (pure domain, one AI seam, thin UI) and §3 (the
folders), the lead's decisions in the task brief and `docs/HANDOFF.md` (domain → lib allowed), and
the current `eslint.config.js`, `src/i18n/t.ts` and `src/app/App.tsx`.

What it does (own words): `pnpm lint` turns the architecture's seams into errors instead of
prose. The domain stays pure: it cannot pull in React, Dexie, the catalogue or any app layer. The
screens (app shell, ui primitives, features) cannot reach the database, a repository, an AI adapter
or the raw transport: they go through data hooks, services and `src/ai/client`. The network
(`fetch`) is only called from the AI transport, the barcode service and the service worker;
IndexedDB (the global and the `dexie` package) only from `src/data`. In screen code every piece of
text a person sees or hears must come from the catalogue: JSX text with a letter in it, and string
values of `aria-label`, `title`, `placeholder` and `alt`, are errors with the message "put
user-visible text in the catalogue". Tests are exempt where they need to be (seeding data,
stubbing the network, asserting on copy). Fixtures that break each rule prove the rules work,
and a test runs them through ESLint's API.

Inputs → outputs: a source file at a path under `src/` → ESLint messages with rule ids
`no-restricted-imports`, `no-restricted-globals` or `no-restricted-syntax` and a message that names
the way to do it instead; nothing for code that keeps to the seams.

Files: changed `eslint.config.js`, `src/app/App.tsx` (heading from `t('common.appName')`, the
placeholder paragraph dropped, so no new partition and no change to `src/i18n/en.ts`); created
`scripts/lint-fixtures/domainImportsReact.ts`, `featureImportsRepo.tsx`, `featureFetch.tsx`,
`literalCopy.tsx`, `serviceOpensIndexedDb.ts` (rule 4, beyond the row's list), `cleanFeature.tsx`,
`scripts/lint-rules.test.ts`. Shared: `tsconfig.node.json` gains one `exclude` line for the
fixtures folder, because `tsc -b` type-checks `scripts/**` and the fixtures import modules that do
not exist yet and use JSX, which the node project does not compile.

Edge cases / failure modes:
- Flat config replaces a rule's options when two config objects set the same rule for one file, so
  overlapping zones would silently drop restrictions (a feature file must get both the screen list
  and the Dexie ban; a file in `src/data` must keep the `fetch` ban but lose the `indexedDB` one).
  Each rule is therefore given exactly one config object per file: zones are made disjoint with
  `ignores`, and each zone lists everything that applies to it.
- `no-restricted-imports` matches the import string as written, not the resolved file: relative
  imports climb with `../`, so folder patterns are written `**/data/db` style (any depth). A
  gitignore-style pattern without a trailing `/**` also covers everything below it, so
  `**/data/repos` catches both `../data/repos` (an index) and `../data/repos/entries`.
- JSX text with only spaces, punctuation, digits or symbols (`·`, `%`, `{' '}`) is not copy and
  passes; an HTML entity is judged by its decoded value (`&times;` is a symbol; `&nbsp;` is a
  space), not its raw spelling.
- `alt=""` marks a decorative image and must stay legal, so attribute strings are errors only when
  they contain a letter (the same test as JSX text).
- `title={t('common.close')}` holds a string literal (the key) one level down: only literals that
  are the attribute's value, sit directly in its `{…}`, or are a branch of `a ? 'x' : 'y'` /
  `a ?? 'x'` there count; arguments of a call never do.
- Text written as a string or template in a child expression (`<p>{'Hello'}</p>`,
  `<p>{ok ? 'Yes' : 'No'}</p>`) is the same copy in another spelling, so it is caught too.
- The fixtures folder must not fail `pnpm lint` on the real tree: it is ignored in the config and
  only linted through the test, under virtual paths.
- Non-letters in other scripts: "a letter" means any Unicode letter (`\p{L}`), not only ASCII.

Our design differences / decisions:
- Scope: all app boundaries apply to `src/**` only. `scripts/`, `tooling/`, `e2e/` and root config
  files are not the app and keep no boundaries (they may call `fetch`, per the brief).
- Tests: `**/*.test.{ts,tsx}` and `src/test/**`. Rules 2–5 exempt them (a feature test may seed
  data through a repository or Dexie, stub `fetch`, and assert on literal copy). Rule 1 still holds
  for domain tests: a pure function's test has no use for React, Dexie or the app layers.
- Rule 1 (domain): bans `react`, `react-dom`, `dexie` (and `dexie-*` add-ons), and the folders
  `data`, `ai`, `services`, `features`, `app`, `ui` and `i18n` (lead decision: the domain is
  locale-free and uses `Intl` directly). `src/lib` stays allowed, as do domain-internal imports and
  `src/test` helpers in tests.
- Rule 2 (screens: `src/{app,ui,features}/**`): bans `dexie`, `**/data/db`, `**/data/repos`,
  `**/ai/adapters`, `**/ai/transport` (each covering the folder or module and anything below it).
- Rule 3: `fetch` is a restricted global in `src/**` except `src/ai/transport.ts`,
  `src/services/barcode/**`, `src/sw/**` and tests.
- Rule 4: `indexedDB` is a restricted global and `dexie` a restricted import in `src/**` except
  `src/data/**` and tests.
- Rule 5: `no-restricted-syntax` in `src/{app,ui,features}/**/*.tsx` (tests exempt) with selectors
  for JSX text, attribute values of the four attributes (literal, template literal, or a
  conditional / `??` / `||` / `&&` branch inside `{…}`) and the same string forms as JSX children.
- Only the global names are guarded (`fetch`, `indexedDB`); `window.fetch` / `globalThis.indexedDB`
  are not (follow-up: `no-restricted-properties` if it ever matters).
- Copy in our own components' props (`label="…"` on a future `Button`) is not caught: the rule
  names the four DOM attributes. Follow-up for the ui builder: add text props of the primitives to
  the attribute list when they exist.
- Messages name the way forward ("go through a repository", "through src/ai/client"), short and
  plain; the copy rule's message is exactly "put user-visible text in the catalogue".
- `src/app/App.tsx`: the heading reads `t('common.appName')`; the "walking skeleton" paragraph is
  dropped rather than given a new partition (it carries no information, and dropping it avoids a
  shared edit to `src/i18n/en.ts`).

Tests we will write (`scripts/lint-rules.test.ts`, node environment, ESLint API with the real
config, `lintText` under virtual paths):
- Each fixture under a virtual path inside its guarded folder yields only the intended rule id,
  with the intended message: `domainImportsReact.ts` as `src/domain/…` → `no-restricted-imports`;
  `featureImportsRepo.tsx` as `src/features/…` → `no-restricted-imports`; `featureFetch.tsx` as
  `src/features/…` → `no-restricted-globals`; `serviceOpensIndexedDb.ts` as `src/services/…` →
  `no-restricted-globals`; `literalCopy.tsx` as a feature, an app and a ui file → only
  `no-restricted-syntax`, one message per planted string.
- `cleanFeature.tsx` (text through `t()`, `alt=""`, punctuation, numbers, non-copy attributes)
  passes with no messages.
- A table of one-line imports from a domain file and a screen file: each banned target is flagged,
  `src/lib`, domain-internal imports and `src/test` helpers are not.
- `fetch` allowed in the transport, the barcode service, the service worker and tests; banned in
  `src/data`, a service, the app. `indexedDB` / `dexie` allowed in `src/data` and tests; banned
  elsewhere in `src/`.
- `literalCopy.tsx` as a `.test.tsx` passes (tests are exempt).
- The fixtures folder is ignored by the config (so `pnpm lint` on the real tree stays green).

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart;
compared against the P00-07 row's Verify column and the lead's decisions):
- [x] Rule 1: React out of the domain (tested in `scripts/lint-rules.test.ts > lint fixtures >
      keeps React out of the domain (rule 1)`); every banned target incl. `i18n` (`rule 1: domain
      imports > rejects %s`, 11 cases); domain tests too (`> holds for domain tests too`);
      `src/lib`, domain-internal and `src/test` imports allowed (`> allows %s`, `> lets domain
      tests use the shared test helpers`)
- [x] Rule 2: a repository out of a feature (`lint fixtures > keeps repositories out of the
      screens (rule 2)`); each banned target from a feature, app and ui file (`rule 2: screen
      imports > %s rejects %s`, 21 cases); hooks, services, `src/ai/client`, i18n, domain allowed
      (`> allows %s`); screen tests may seed data (`> lets screen tests seed data through %s`)
- [x] Rule 3: `fetch` out of a feature (`lint fixtures > keeps fetch out of the screens (rule
      3)`); rejected in data, services, AI client and adapters, app, domain, lib (`rule 3: fetch >
      rejects fetch in %s`); allowed in the transport, barcode service, service worker, tests,
      `src/test`, `e2e`, `scripts`, `tooling` (`> allows fetch in %s`)
- [x] Rule 4: `indexedDB` out of a service (`lint fixtures > keeps IndexedDB out of the services
      (rule 4)`); the global and the `dexie` import (with sub-paths and `dexie-*` add-ons) rejected
      outside `src/data` (`rule 4: IndexedDB and Dexie > rejects …`); allowed in `src/data` and
      tests (`> allows IndexedDB and dexie in %s`)
- [x] Rule 5: ten planted strings found, only `no-restricted-syntax`, all with the message "put
      user-visible text in the catalogue", in a feature, app and ui file (`lint fixtures > finds
      each of the ten planted strings of copy as %s (rule 5)`); tests exempt (`rule 5: copy >
      exempts test files`); other folders untouched (`> leaves files outside the screens alone`);
      the key inside `t('…')` is not copy (`> does not count the key inside t() as copy`)
- [x] Clean fixture passes with no messages (`lint fixtures > passes a screen that takes its text
      from t()`)
- [x] Fixtures ignored by the config (``lint fixtures > keeps the fixtures out of `pnpm lint` on
      the real tree``); `pnpm lint` on the real tree: clean. It flagged the old `App.tsx` (heading
      and paragraph) before the fix, which is the rule working on real code.
- [x] Non-TS files in the guarded folders are not pulled into linting by the zone globs (checked
      by hand with a throwaway `.css` / `.json` under `src/features` and `src/domain`, removed).
- Deliberate differences: n/a (no reference behaviour).
- Not taken: `window.fetch` / `globalThis.indexedDB` (would need `no-restricted-properties`);
  copy in our own components' text props; copy reached through variables or deeper expressions
  (`const label = 'Save'`), which a syntax rule cannot see; dynamic `import('dexie')`.

## Decisions for the lead

- All boundaries apply to `src/**` only; `scripts/`, `tooling/`, `e2e/` and root configs keep none.
- Tests (`**/*.test.{ts,tsx}`, `src/test/**`) are exempt from rules 2–5 (a screen test may seed
  data through a repository or Dexie). Rule 1 still holds in domain tests.
- Folder patterns cover the folder itself and everything below it (`**/data/repos` also catches an
  index import of `data/repos`; `**/data/db` also `data/db/schema`), wider than the row's
  `**/data/repos/**` and `**/ai/adapters/**`. `dexie-*` add-ons (e.g. `dexie-react-hooks`) count
  as Dexie.
- The copy rule counts a string as copy only when it holds a Unicode letter, for attribute values
  too, so `alt=""` (decorative image), `×`, `·` and numbers stay legal. Beyond JSX text and the four
  attributes, it also catches the same strings written as `{'…'}`, a template, or a branch of
  `?:` / `??` / `||` / `&&` directly inside the `{…}`, both as attribute values and as children.
- Messages start with a capital and end with a period ("Only src/data talks to IndexedDB: go
  through a repository."), since ESLint prefixes its own sentence; the copy message is exactly the
  brief's "put user-visible text in the catalogue".
- `tsconfig.node.json` (shared, one line): `"exclude": ["scripts/lint-fixtures"]`. `tsc -b`
  type-checks `scripts/**` with the node project, which has no JSX and cannot resolve the fixtures'
  virtual imports (`../../i18n/t` from `scripts/`), so `pnpm typecheck` failed with them included.
- `src/app/App.tsx`: the placeholder paragraph is dropped; no `shell` partition, no change to
  `src/i18n/en.ts`. `App.test.tsx` and the e2e smoke test still check the heading "Platewise"
  (now from `t('common.appName')`), unchanged.
- Follow-ups: (1) when the ui primitives exist, add their text props (e.g. `label`) and
  `aria-valuetext` (ring and bar values) to the copy rule's attribute list; (2) if `window.fetch`
  or `globalThis.indexedDB` ever show up, add `no-restricted-properties` per zone.

## Status

Done (2026-10-26). `eslint.config.js` enforces the five rules with built-in rules only; six
fixtures and `scripts/lint-rules.test.ts` prove them. `src/app/App.tsx` reads its heading from the
catalogue. Outside the task's files: `tsconfig.node.json` (one `exclude` line, shared).
