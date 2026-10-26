# P00 · Foundations (remaining work)

**Weeks:** 1 · **Tracks:** tooling (CI, scripts, fake AI server); UI groundwork (tokens, theme, icons, catalogue) · **Depends on:** — · **Status:** ✅ done: the skeleton (Vite + React + TS, Vitest, Playwright) and the clean-room guards (`tooling/checks`) landed on 2026-10-26; all ten tasks below landed in waves 1 and 2 (2026-10-26)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

Finish the ground every later phase stands on. CI runs the full loop on every push, including `pnpm check --require-ref` against the pinned reference. The design tokens, the six accent presets (D-16.1) and our own icon exist. One English message catalogue and the Intl helpers are in place, so no feature ever hard-codes copy (R07.20 groundwork). Lint rules enforce the architecture's seams (pure domain, one AI seam, data access only through repositories). A scripted OpenAI-compatible fake provider on loopback lets every later e2e and parity run work without keys.

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1 = P00-08, P00-01, P00-10 (`vite.config.ts`, `package.json`, `scripts/{ci-local.sh,bundle-budget.ts}`, `src/lib/**`, `src/test/time.ts`, the CI workflow). P00-08 first: it owns every `vite.config.ts` edit of this phase.
- **Wave B:** S2 = P00-02, P00-03, P00-04 (`src/ui/tokens.*`, `src/ui/theme.ts`, `src/ui/contrast.ts`, `public/icons/**`, `scripts/render-icons.ts`) · S3 = P00-05, P00-06 (`src/i18n/**`) · S4 = P00-07 (`eslint.config.js`, `scripts/lint-fixtures/**`, `scripts/lint-rules.test.ts`) · S5 = P00-09 (`e2e/fake-ai/**`, `playwright.config.ts`).

## Tasks (10)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P00-01 | **CI workflow.** Add one GitHub Actions workflow that runs the full run-until-green loop on every push and pull request that touches `platewise/**` (path filter), with `concurrency` cancelling superseded runs and `permissions: contents: read`. Location: the repository root `.github/workflows/platewise.yml`, the only file outside `platewise/` (Proposed D-16.54; until the lead confirms, keep the identical file at `platewise/ci/platewise.yml` and do not create the root copy). Steps, each with `working-directory: platewise`: checkout; Node 22 (exact minor); pnpm (exact version) via its official action pinned by commit SHA; `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm fmt:check`; `pnpm typecheck`; `pnpm test`; `pnpm build`; `pnpm check:bundle`; `pnpm exec playwright install --with-deps chromium`; `pnpm e2e`; then fetch the reference outside the workspace (`git clone --filter=blob:none` into `$RUNNER_TEMP/ref`, `git checkout 10e14b67116c52b515d2389621266e32b3a99840`, fail unless `git rev-parse HEAD` equals that SHA) and run `PLATEWISE_REF=$RUNNER_TEMP/ref pnpm check --require-ref`. Upload the Playwright report only on failure. Add `scripts/ci-local.sh` that runs the same commands in the same order with `set -euo pipefail` so a builder can reproduce CI. Every third-party action is pinned to a full commit SHA with the version in a comment. | none (tooling; no reference counterpart) | `ci/platewise.yml`, `scripts/ci-local.sh` | `bash scripts/ci-local.sh` exits 0 on a clean checkout; removing a test file's `expect` target makes it exit non-zero at the test step; the SHA guard fails when the checkout is moved to another commit (try with a throwaway clone); every `uses:` line carries a 40-hex SHA (grep). |
| P00-02 | **Design tokens.** Write `src/ui/tokens.css`: every colour, radius, space, type size, shadow, motion duration and z-layer as a CSS custom property on `:root`, with a dark set (default; a deep green-black neutral base) under `[data-theme=dark]` and a light set under `[data-theme=light]`. Colour roles: page, card, raised, sheet, line, text, text-muted, text-inverse, danger, success (used for goal lines), focus. Six accent presets under `[data-accent=<id>]` with ids `basil` (default), `saffron`, `lagoon`, `beet`, `ember`, `ink` (D-16.1): each sets `--accent`, `--accent-ink` (text on accent) and `--accent-soft` (a translucent wash for tracks); solid colours only, no gradients. Radii: control 12, card 18, sheet 24, pill 999. Spacing 4/8/12/16/20/24/32. Type: the system font stack (no web fonts), sizes 11 to 48. Safe-area insets as variables. Choose every value yourself; never sample the reference's palette. Export the preset ids and their i18n label keys from `src/ui/tokens.ts` for the accent picker. | `A/ui/theme/Color.kt` [86: only to confirm none of our values or preset names match it, after writing] | `src/ui/tokens.css`, `src/ui/tokens.ts`, `src/ui/tokens.test.ts` | Covered by the contrast test of P00-03 (each theme × accent); `tokens.test.ts`: six ids, default `basil`, every id has a `[data-accent=…]` block in the CSS file. |
| P00-03 | **Theme runtime and contrast check.** `src/ui/theme.ts`: `applyTheme({appearance, accent}, root, media)` sets `data-theme` (System follows `prefers-color-scheme` and keeps listening; Light and Dark are fixed) and `data-accent`, and updates `<meta name=theme-color>` to the page colour; returns an unsubscribe. `src/ui/contrast.ts`: WCAG relative luminance and contrast ratio for hex colours. The test parses `tokens.css` and checks, in both themes and for every accent: text on page and on card ≥ 7:1, muted text ≥ 4.5:1, accent against card ≥ 3:1, accent-ink on accent ≥ 4.5:1, danger on card ≥ 4.5:1. The values must pass without exceptions (L9). | none | `src/ui/theme.ts`, `src/ui/theme.test.ts`, `src/ui/contrast.ts`, `src/ui/contrast.test.ts` | `theme.test.ts`: System follows a mocked media query change live; Light/Dark ignore it; theme-color meta updated; unsubscribe stops updates. `contrast.test.ts`: #000/#fff = 21; known pairs; the token sweep described in the task. |
| P00-04 | **Brand icon set.** Draw our own mark as SVG (a plate seen from above with a small leaf; our own geometry, solid colours from the Basil preset). Produce `public/icons/mark.svg`, a maskable variant with a safe zone, and PNGs at 192, 512 and maskable 512 plus a 180 px touch icon and a 32 px favicon, rendered by `scripts/render-icons.ts` (Playwright Chromium screenshots of the SVG, deterministic). Nothing is taken or traced from the reference's icons or store art. | none (do not open the reference's `appicon.png` or store graphics) | `public/icons/mark.svg`, `public/icons/mark-maskable.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/touch-180.png`, `public/icons/favicon-32.png`, `scripts/render-icons.ts` | `pnpm exec tsx scripts/render-icons.ts` twice gives byte-identical PNGs; `pnpm check:assets` passes (no file identical to any reference asset); each PNG has the stated size (read the IHDR in a small check inside the script). |
| P00-05 | **Message catalogue and t().** One English catalogue, exported from `src/i18n/en.ts`, composed of per-area partitions under `src/i18n/en/` so parallel slices never edit the same file (Proposed D-16.55; only the lead adds a partition import to `en.ts` when a slice lands). This task creates `en.ts` and the `common` partition (app name, tab names, Save, Cancel, Done, Delete, Back, Retry, Close, Edit, Add). `src/i18n/t.ts`: `t(key, params?)` with keys typed from the catalogue (dotted paths), `{name}` interpolation and an ICU-like plural subset `{count, plural, one {…} other {…}}` using `Intl.PluralRules`; an unknown key throws in tests and returns the key in production. `src/i18n/lint.ts`: checks every message parses, placeholders are well-formed and no key is defined twice (R06.23 groundwork; the same lint will compare translations with English in L1). | none (copy is written by us; never open the reference's string tables) | `src/i18n/en.ts`, `src/i18n/en/common.ts`, `src/i18n/t.ts`, `src/i18n/t.test.ts`, `src/i18n/lint.ts`, `src/i18n/lint.test.ts` | `t.test.ts`: interpolation; plural one/other for 1 and 2 in `en`; unknown key throws; params missing throws. `lint.test.ts`: the real catalogue passes; a fixture with `{count, plural, one {x}` (unclosed) fails; a duplicate key across two partitions fails. |
| P00-06 | **Intl format helpers.** `src/i18n/format.ts`: number, integer, percent, date, time and date-range formatting through `Intl`, with the locale injected (`src/i18n/locale.ts` returns the browser's `navigator.language`, falling back to `en`). UI text stays English in v1 but numbers and dates follow the browser locale (01 §3.2: grouped with the locale's separators). Helpers: `formatInt(n)`, `formatDecimal(n, maxDigits)`, `formatDay(dayKey, style)`, `formatTime(ms)`, `formatPeriod(firstKey, lastKey, todayKey)` ("Oct 11 – 17" style; year shown only when an end is outside the current year, 05 §3.5.2), `formatDuration`. Cache `Intl` instances per locale. | none | `src/i18n/format.ts`, `src/i18n/format.test.ts`, `src/i18n/locale.ts` | `format.test.ts`: 8368 → "8,368" (en-US) and "8.368" (de-DE); period labels within one month, across months, across years; time in en-US vs en-GB; instances cached (same object on second call). |
| P00-07 | **Lint boundaries and the copy rule.** Extend `eslint.config.js` so the architecture is enforced, not just described: (1) `src/domain/**` may not import React, Dexie or any of `src/{data,ai,services,features,app,ui}`; (2) `src/features/**`, `src/app/**` and `src/ui/**` may not import `dexie`, `**/data/db`, `**/data/repos/**`, `**/ai/adapters/**` or `**/ai/transport`; (3) the global `fetch` is restricted outside `src/ai/transport.ts`, `src/services/barcode/**`, `src/sw/**`, tests and `e2e/**`; (4) the global `indexedDB` and the `dexie` import are restricted outside `src/data/**` and tests; (5) in `src/{app,ui,features}/**/*.tsx`, JSX text containing a letter and string literals in `aria-label`, `title`, `placeholder` and `alt` are errors (`no-restricted-syntax`), with the message "put user-visible text in the catalogue". Use only built-in rules and the plugins already installed. | none | `scripts/lint-fixtures/domainImportsReact.ts`, `scripts/lint-fixtures/featureImportsRepo.tsx`, `scripts/lint-fixtures/featureFetch.tsx`, `scripts/lint-fixtures/literalCopy.tsx`, `scripts/lint-rules.test.ts` | `lint-rules.test.ts` lints each fixture under a virtual path inside the guarded folder and expects exactly the intended rule id; a clean feature file using `t()` passes; `pnpm lint` stays green on the real tree. |
| P00-08 | **Clock, ids and test time helpers.** `src/lib/clock.ts`: a `Clock` interface (`now()` epoch ms, `timeZone()` IANA id) with `systemClock` and `fixedClock(ms, tz)`; services take a Clock, the domain takes plain values. `src/lib/ids.ts`: `newId()` (`crypto.randomUUID`) with `withIdSequence(prefix)` for deterministic tests. `src/lib/result.ts`: a small `Result<T, E>` (`ok`, `err`, `isOk`). `src/test/time.ts`: helpers around Vitest fake timers (`useFakeTime(at)`, `advance(ms)`, `runPending()`) and `inTimeZone(tz, fn)` that switches `process.env.TZ` for one test and restores it. Update `vite.config.ts` once for the whole phase: `test.env.TZ = 'America/New_York'` (a zone with DST), include `e2e/fake-ai/**/*.test.ts` (node environment via a per-file comment) and `build.manifest = true` (needed by P00-10). | none | `src/lib/clock.ts`, `src/lib/clock.test.ts`, `src/lib/ids.ts`, `src/lib/ids.test.ts`, `src/lib/result.ts`, `src/lib/result.test.ts`, `src/test/time.ts`, `src/test/time.test.ts` | `clock.test.ts`: fixed clock returns its values. `ids.test.ts`: UUID shape; sequence `a-1`, `a-2`. `time.test.ts`: `advance(1000)` fires a 1 s timer without real waiting; `inTimeZone('Asia/Tokyo')` changes `new Date(0).getHours()` and restores it afterwards. |
| P00-09 | **Fake AI provider server.** A scripted OpenAI-compatible HTTP server for e2e and parity runs (02-rea-workflow §4 step 2), bound to 127.0.0.1 on a port from `PLATEWISE_FAKE_AI_PORT` (default 4320). It serves `POST /v1/chat/completions` from a loaded script: an ordered list of replies `{status, body, delayMs?}`; answers CORS preflights and adds `Access-Control-Allow-Origin: *` to every reply; records each request (headers without `authorization`, and the JSON body). Control routes: `POST /__script` (load a named script from `e2e/fake-ai/scripts/` or an inline one), `GET /__requests`, `POST /__reset`. Ship starter scripts: a valid food reply, a 429 then success, a cut-off reply (`finish_reason: length`) then success, a Coach tool call then text, a malformed reply. Playwright starts and stops it through `globalSetup`. The app reaches it as the Custom provider at `http://127.0.0.1:4320/v1`, which the loopback rule allows (D-16.26). All reply text in the scripts is ours. | none | `e2e/fake-ai/server.ts`, `e2e/fake-ai/server.test.ts`, `e2e/fake-ai/global-setup.ts`, `e2e/fake-ai/scripts/food-ok.json`, `e2e/fake-ai/scripts/busy-then-ok.json`, `e2e/fake-ai/scripts/cut-then-ok.json`, `e2e/fake-ai/scripts/coach-tool.json`, `e2e/fake-ai/scripts/garbage.json` | `server.test.ts` (node env): preflight returns 204 with the CORS headers; a 429-then-200 script answers in order; `/__requests` lists both bodies without the key; `delayMs` is honoured with fake timers; an empty script answers 500 with a clear message. |
| P00-10 | **Bundle budget script.** `scripts/bundle-budget.ts` reads `dist/.vite/manifest.json`, follows the entry's static imports (not dynamic ones), gzips each JS file and fails when the total exceeds 250 KB (architecture §6). It prints a table of files and sizes and the headroom. Add `"check:bundle": "tsx scripts/bundle-budget.ts"` to `package.json`. Lazy chunks (barcode decoder, charts, Markdown) are reported separately and never counted. | none | `scripts/bundle-budget.ts`, `scripts/bundle-budget.test.ts` | `bundle-budget.test.ts` with a fixture manifest and fixture files: under budget passes; over budget fails with the file list; dynamic imports excluded; a missing manifest is a setup error (exit 2). |

**Deviation (lead, 2026-10-26, P00-01).** The package moved out of the Ai1 monorepo into its own
repository (`varunisrani/cal.2`), so D-16.54 is applied as: one workflow at the repository root,
`.github/workflows/ci.yml` (it existed already), with no path filter and no `working-directory`. The
task refined it (actions pinned by SHA, Node 22.22.0, `check:bundle`, report upload on failure)
and added `scripts/ci-local.sh`. No `ci/platewise.yml` exists.

## Files to create (49)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `.github/workflows/ci.yml` | The workflow (already at the repo root; refined, not created: see the deviation note under Tasks) | P00-01 |
| `scripts/ci-local.sh` | Runs the CI commands locally in CI order | P00-01 |
| `src/ui/tokens.css` | Design tokens, both themes, six accents | P00-02 |
| `src/ui/tokens.ts` | Accent preset ids, default accent, label keys | P00-02 |
| `src/ui/tokens.test.ts` | Tests for `tokens.ts`: the Verify cases of P00-02 | P00-02 |
| `src/ui/theme.ts` | Applies appearance and accent to the document | P00-03 |
| `src/ui/theme.test.ts` | Tests for `theme.ts`: the Verify cases of P00-03 | P00-03 |
| `src/ui/contrast.ts` | WCAG contrast maths | P00-03 |
| `src/ui/contrast.test.ts` | Tests for `contrast.ts`: the Verify cases of P00-03 | P00-03 |
| `public/icons/mark.svg` | Platewise mark | P00-04 |
| `public/icons/mark-maskable.svg` | Mark with maskable safe zone | P00-04 |
| `public/icons/icon-192.png` | Rendered icon | P00-04 |
| `public/icons/icon-512.png` | Rendered icon | P00-04 |
| `public/icons/icon-maskable-512.png` | Rendered maskable icon | P00-04 |
| `public/icons/touch-180.png` | Home-screen icon for iOS | P00-04 |
| `public/icons/favicon-32.png` | Favicon | P00-04 |
| `scripts/render-icons.ts` | Renders the PNGs from the SVGs | P00-04 |
| `src/i18n/en.ts` | The catalogue: aggregates the partitions | P00-05 |
| `src/i18n/en/common.ts` | Shared words: app name, tabs, generic buttons | P00-05 |
| `src/i18n/t.ts` | Typed lookup, interpolation, plurals | P00-05 |
| `src/i18n/t.test.ts` | Tests for `t.ts`: the Verify cases of P00-05 | P00-05 |
| `src/i18n/lint.ts` | Catalogue lint | P00-05 |
| `src/i18n/lint.test.ts` | Tests for `lint.ts`: the Verify cases of P00-05 | P00-05 |
| `src/i18n/format.ts` | Intl wrappers | P00-06 |
| `src/i18n/format.test.ts` | Tests for `format.ts`: the Verify cases of P00-06 | P00-06 |
| `src/i18n/locale.ts` | Current locale accessor | P00-06 |
| `scripts/lint-fixtures/domainImportsReact.ts` | Fixture that must fail rule 1 | P00-07 |
| `scripts/lint-fixtures/featureImportsRepo.tsx` | Fixture that must fail rule 2 | P00-07 |
| `scripts/lint-fixtures/featureFetch.tsx` | Fixture that must fail rule 3 | P00-07 |
| `scripts/lint-fixtures/literalCopy.tsx` | Fixture that must fail rule 5 | P00-07 |
| `scripts/lint-rules.test.ts` | Runs ESLint's API over the fixtures | P00-07 |
| `src/lib/clock.ts` | Clock interface, system and fixed clocks | P00-08 |
| `src/lib/clock.test.ts` | Tests for `clock.ts`: the Verify cases of P00-08 | P00-08 |
| `src/lib/ids.ts` | Id generation | P00-08 |
| `src/lib/ids.test.ts` | Tests for `ids.ts`: the Verify cases of P00-08 | P00-08 |
| `src/lib/result.ts` | Result helpers | P00-08 |
| `src/lib/result.test.ts` | Tests for `result.ts`: the Verify cases of P00-08 | P00-08 |
| `src/test/time.ts` | Fake-time and time-zone helpers | P00-08 |
| `src/test/time.test.ts` | Tests for `time.ts`: the Verify cases of P00-08 | P00-08 |
| `e2e/fake-ai/server.ts` | Scripted OpenAI-compatible server | P00-09 |
| `e2e/fake-ai/server.test.ts` | Tests for `server.ts`: the Verify cases of P00-09 | P00-09 |
| `e2e/fake-ai/global-setup.ts` | Starts/stops the server for Playwright | P00-09 |
| `e2e/fake-ai/scripts/food-ok.json` | One valid food reply | P00-09 |
| `e2e/fake-ai/scripts/busy-then-ok.json` | 429 then a valid reply | P00-09 |
| `e2e/fake-ai/scripts/cut-then-ok.json` | Cut-off reply then a valid one | P00-09 |
| `e2e/fake-ai/scripts/coach-tool.json` | Tool call round then a text answer | P00-09 |
| `e2e/fake-ai/scripts/garbage.json` | Unparseable reply | P00-09 |
| `scripts/bundle-budget.ts` | Initial-JS gzip budget | P00-10 |
| `scripts/bundle-budget.test.ts` | Tests for `bundle-budget.ts`: the Verify cases of P00-10 | P00-10 |

## Files to update (6)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `vite.config.ts` | Test TZ, e2e/fake-ai test include, `build.manifest` | P00-08 |
| `package.json` | `check:bundle` script | P00-10 |
| `eslint.config.js` | Boundary, fetch, indexedDB and copy rules | P00-07 |
| `playwright.config.ts` | `globalSetup` for the fake AI server | P00-09 |
| `src/test/setup.ts` | Restore real timers and TZ after each test | P00-08 |
| `index.html` | Favicon and touch-icon links | P00-04 |

## Migrations and fixtures (2)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `e2e/fake-ai/scripts/*.json` | Scripted provider replies (five starters) | P00-09 |
| `scripts/lint-fixtures/*` | Files that must break each lint rule | P00-07 |

## Task notes (10)

`docs/notes/P00/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P00/ci-workflow.md` (P00-01)
- `docs/notes/P00/design-tokens.md` (P00-02)
- `docs/notes/P00/theme-runtime-and-contrast-check.md` (P00-03)
- `docs/notes/P00/brand-icon-set.md` (P00-04)
- `docs/notes/P00/message-catalogue-and-t.md` (P00-05)
- `docs/notes/P00/intl-format-helpers.md` (P00-06)
- `docs/notes/P00/lint-boundaries-and-the-copy-rule.md` (P00-07)
- `docs/notes/P00/clock-ids-and-test-time-helpers.md` (P00-08)
- `docs/notes/P00/fake-ai-provider-server.md` (P00-09)
- `docs/notes/P00/bundle-budget-script.md` (P00-10)

## Run until green

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Phase additions, inside the same loop:

```bash
pnpm check:bundle
pnpm exec tsx scripts/render-icons.ts && git diff --exit-code public/icons   # deterministic
bash scripts/ci-local.sh
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Token values and preset names checked against `A/ui/theme/Color.kt` and `I/Views/Theme.swift`: nothing matches (D-16.1).
- [ ] No reference brand string, colour or icon shape anywhere in `public/` or `src/ui/` (`pnpm check` banned + assets green).
- [ ] The catalogue holds only copy we wrote; no string table of the reference was opened.
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

CI (`.github/workflows/ci.yml`, reproduced locally by `scripts/ci-local.sh`) runs every step green, including `pnpm check --require-ref`. The token contrast sweep, catalogue lint, lint-rule fixtures, fake AI server tests and bundle budget all pass. **Demo M0:** `pnpm dev` shows the placeholder app in dark and light with the Basil accent and our favicon; `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref` prints a green table.
