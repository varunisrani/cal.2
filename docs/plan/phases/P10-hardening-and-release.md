# P10 · Hardening and release

**Weeks:** 2 · **Tracks:** all hands: parity, ledgers, quality, security, docs · **Depends on:** P00–P09 · **Status:** planned

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`, `I/` = `ios/calorietracker/`, `T/` = `android/app/src/test/java/com/apoorvdarshan/calorietracker/`, `IT/` = `ios/calorietrackerTests/`. A number in brackets is the file's length in lines; read only the named part of a big file. Read the research spec section first, then the reference, then its tests.

## Goal

Prove v1.0: every P0/P1 feature has passing acceptance tests (`pnpm check:acceptance --strict`), every trap has a test or a reasoned review line, the REA parity pass has classified every divergence, accessibility and the bundle budget pass, the security review is written, live provider checks are recorded, user docs exist, and the release is prepared (tagging only when the user asks).

## Slices and waves

Each slice owns its files; no two slices in a wave touch the same path. A builder takes one slice, runs Read → note → Rewrite → Compare for each task, then the loop until green. The lead lands one commit per slice and writes any deviation back into this file.

- **Wave A:** S1 = P10-01..04 (`parity/**`, `scripts/parity.ts`, `docs/internals/parity-report-v1.0.md`) · S3 = P10-07, P10-08, P10-11 (`e2e/a11y.spec.ts`, `playwright.config.ts`, `docs/internals/{ship-inventory,browser-matrix}-v1.0.md`) · S4 = P10-09, P10-10, P10-12 (`docs/internals/{security-review,similarity-report,provider-check}-v1.0.md`, `scripts/ai-live-check.ts`) · S5 = P10-13 (`docs/user/**`).
- **Wave B:** S2 = P10-05, P10-06 (`docs/internals/{acceptance-map,traps-ledger}.md`, gap tests in their owning modules).
- **Wave C:** P10-14 (release files).

## Tasks (14)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P10-01 | **Parity scenarios: food and Home.** REA `capture-browser-scenario` inputs (02-rea-workflow §4) for: onboarding with the fake provider, manual entry, photo logging, describe, barcode by typed digits (routed OFF fixture), reuse from recent, edit an entry, combine, copy a day, water, start/end a fast with the paused dialog, week bar and day swipe. Each uses `data-ui` hooks, a `timeout_ms` on every step, identical environment and capture blocks. | the reference observations in `~/rea-lab/parity/fud-ai/<flow>.md` (outside the repo) and the store screenshots they cite | `parity/onboarding.platewise.json`, `parity/log-manual.platewise.json`, `parity/log-photo.platewise.json`, `parity/log-describe.platewise.json`, `parity/log-barcode.platewise.json`, `parity/reuse.platewise.json`, `parity/edit-combine-copy.platewise.json`, `parity/water-fasting.platewise.json`, `parity/home-days.platewise.json` | each scenario completes through the real REA CLI against `vite preview` (P10-03) with no uncaught page error. |
| P10-02 | **Parity scenarios: Progress, Coach, settings and data.** Scenarios for: log weight (back-dated) and history delete, ranges and periods, recap, body fat, a Coach turn with a tool call, Coach reset during a pending reply, settings units and accent, AI providers page with a standby, export CSV, backup and restore, erase everything. | as P10-01 | `parity/progress.platewise.json`, `parity/coach.platewise.json`, `parity/settings.platewise.json`, `parity/data.platewise.json` | as P10-01. |
| P10-03 | **Parity runner.** `scripts/parity.ts`: builds the app, starts `vite preview` on a fixed port and the fake AI server, runs each scenario through REA one at a time (`~/rea-lab/rea`), stores captures under `~/rea-lab/parity/platewise/`, and prints a pass/fail table (pass = every step completed and no uncaught page error); stops only the processes it started, by PID. `package.json` script `parity`. | `02-rea-workflow.md` §4 (our doc) | `scripts/parity.ts` | a dry-run flag lists the scenarios without starting anything; a scenario with a missing hook fails with the step named; processes are gone after the run (PID check). |
| P10-04 | **Obligations ledger and parity report.** `parity/ledger/obligations.json` (observable claims in our words, one per ACC row of the parity flows) and `manifest.json` (claim → owning module and tests); run REA `build-reconstruction-obligation-ledger` over the exported Evidence; classify every divergence as intended (D-id), bug (fixed with a failing-first test), reference gap (why), or unknown (lead decides). Write `docs/internals/parity-report-v1.0.md` and add any new intended difference to 16-what-we-change §2.7 through the lead. | the reference observations and Evidence ids (cite ids only) | `parity/ledger/obligations.json`, `parity/ledger/manifest.json`, `docs/internals/parity-report-v1.0.md` | no unclassified divergence; every bug divergence links its new test. |
| P10-05 | **Acceptance strict pass.** Turn every `Review:` line of `docs/internals/acceptance-map.md` into `Test:` lines pointing at real, unskipped tests (unit or e2e); write any missing test in the owning module; `pnpm check:acceptance --strict` green. Gaps with no planned task go to Known gaps with their N-id. | none | — (updates only; see Files to update) | `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref --strict` green. |
| P10-06 | **Traps ledger completion.** Every trap row of `docs/internals/traps-ledger.md` owned by a v1 task has at least one `Test:` line; rows owned by later phases (L1–L5), v1.x items or not-planned features (N-ids) keep a `Review:` line that says so. | none | — (updates only; see Files to update) | `pnpm check:traps` green; a script lists any v1-owned row still without a Test line (must be none). |
| P10-07 | **Accessibility pass.** Add `@axe-core/playwright` (exact version, dev dependency, licence checked) and `e2e/a11y.spec.ts` covering Home, review, Progress, Coach, Settings pages and the wizard in both themes; fix every serious or critical finding; a keyboard-only walk through logging a manual entry and a weight; gauge, pillars and charts expose values as text (L9); focus is visible everywhere; reduced motion respected. | none | `e2e/a11y.spec.ts` | axe reports no serious or critical violations on the listed screens in both themes; the keyboard walk passes. |
| P10-08 | **Bundle budget and shipped inventory.** Confirm initial JS ≤ 250 KB gzip with the barcode decoder, charts and Markdown lazy; run REA `analyze-javascript-application` on `dist/` and record routes, storage, network endpoints and workers in `docs/internals/ship-inventory-v1.0.md`: only provider, Open Food Facts and FoodData Central hosts; no reference name in the bundle (banned check on `dist` as a one-off). | none | `docs/internals/ship-inventory-v1.0.md` | `pnpm check:bundle` green; the inventory lists no unexpected host. |
| P10-09 | **Security review.** Write `docs/internals/security-review-v1.0.md`: threat model for a local-first BYOK web app; CSP verified in the built app; no third-party scripts or fonts; keys never in logs, exports, backups or error details (tests that search outputs for a planted key); loopback-only HTTP; import and restore path and size limits; Markdown link sanitising; user strings never injected as HTML; `pnpm audit` results with decisions. | none | `docs/internals/security-review-v1.0.md` | planted-key tests pass for export, backup, Coach details and console output; audit has no unaddressed high finding. |
| P10-10 | **Similarity report.** Run `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref` and `pnpm check --only similarity --closest 30`, plus the 9-word overlap tool over `docs/`; rewrite any region near a gate; write `docs/internals/similarity-report-v1.0.md` with the numbers and every allow-list entry with its reason. | none | `docs/internals/similarity-report-v1.0.md` | every check green; the closest regions all score below 1.00. |
| P10-11 | **Browser matrix.** Add Playwright WebKit and Firefox projects for a smoke subset (walking skeleton, manual log, Progress, settings); record manual checks on iOS Safari (installed and not), Android Chrome and desktop Chrome/Firefox/Safari: install, offline, HEIC handling, barcode (BarcodeDetector vs WASM), notifications in an installed app, storage persistence status. Results in `docs/internals/browser-matrix-v1.0.md`. | none | `docs/internals/browser-matrix-v1.0.md` | the smoke subset passes on the three engines; every manual row has a result and a date. |
| P10-12 | **Live provider check (gated).** With real keys supplied by the user through environment variables only, run `scripts/ai-cors-probe.ts` and a new `scripts/ai-live-check.ts` (one small photo analysis per format family and one Coach turn) from a built app; recheck D-04.1; refresh the curated presets (D-16.25) and the build date; record results without keys in `docs/internals/provider-check-v1.0.md`. Skipped (and said so) when no keys are given. | spec 03 §3.15 | `scripts/ai-live-check.ts`, `docs/internals/provider-check-v1.0.md` | without keys the script exits 0 with "skipped"; output never contains a key. |
| P10-13 | **User docs.** `docs/user/`: getting started (install, first plan), AI keys (where to get one per provider, cost notes, Ollama on the same device or behind HTTPS, D-16.26), privacy and storage (what stays on the device, persistence, backups), logging tips, Coach, and backup/restore. Our words; linked from About. | none | `docs/user/getting-started.md`, `docs/user/ai-keys.md`, `docs/user/privacy-and-storage.md`, `docs/user/backup.md` | similarity and overlap checks green on `docs/user`; every link in About resolves. |
| P10-14 | **Release prep.** `CHANGELOG.md` (1.0.0), version 1.0.0 in `package.json`, `THIRD_PARTY_NOTICES.md` refreshed from the notices script, `docs/internals/release-checklist-v1.0.md` (every gate with its result and date), `docs/HANDOFF.md` updated. Tags, releases and PRs only when the user asks. | none | `CHANGELOG.md`, `docs/internals/release-checklist-v1.0.md` | the full loop plus `--strict` acceptance green on the release commit; checklist complete. |

## Files to create (30)

| Path (under `platewise/`) | What it holds | Task |
|---|---|---|
| `parity/onboarding.platewise.json` | Scenario | P10-01 |
| `parity/log-manual.platewise.json` | Scenario | P10-01 |
| `parity/log-photo.platewise.json` | Scenario | P10-01 |
| `parity/log-describe.platewise.json` | Scenario | P10-01 |
| `parity/log-barcode.platewise.json` | Scenario | P10-01 |
| `parity/reuse.platewise.json` | Scenario | P10-01 |
| `parity/edit-combine-copy.platewise.json` | Scenario | P10-01 |
| `parity/water-fasting.platewise.json` | Scenario | P10-01 |
| `parity/home-days.platewise.json` | Scenario | P10-01 |
| `parity/progress.platewise.json` | Scenario | P10-02 |
| `parity/coach.platewise.json` | Scenario | P10-02 |
| `parity/settings.platewise.json` | Scenario | P10-02 |
| `parity/data.platewise.json` | Scenario | P10-02 |
| `scripts/parity.ts` | Runs every parity scenario through REA | P10-03 |
| `parity/ledger/obligations.json` | Claims in our words | P10-04 |
| `parity/ledger/manifest.json` | Claims bound to modules and tests | P10-04 |
| `docs/internals/parity-report-v1.0.md` | Parity result and classified divergences | P10-04 |
| `e2e/a11y.spec.ts` | Automated and keyboard accessibility checks | P10-07 |
| `docs/internals/ship-inventory-v1.0.md` | What ships, per REA | P10-08 |
| `docs/internals/security-review-v1.0.md` | Security review | P10-09 |
| `docs/internals/similarity-report-v1.0.md` | Similarity report | P10-10 |
| `docs/internals/browser-matrix-v1.0.md` | Browser results | P10-11 |
| `scripts/ai-live-check.ts` | Opt-in live calls per format family | P10-12 |
| `docs/internals/provider-check-v1.0.md` | Live check results | P10-12 |
| `docs/user/getting-started.md` | Install and first plan | P10-13 |
| `docs/user/ai-keys.md` | Providers and keys | P10-13 |
| `docs/user/privacy-and-storage.md` | What is stored where | P10-13 |
| `docs/user/backup.md` | Backup and restore | P10-13 |
| `CHANGELOG.md` | Release notes | P10-14 |
| `docs/internals/release-checklist-v1.0.md` | Gate results | P10-14 |

## Files to update (6)

| Path (under `platewise/`) | Change | Task |
|---|---|---|
| `docs/internals/acceptance-map.md` | Review lines → Test lines | P10-05 |
| `docs/internals/traps-ledger.md` | Review lines → Test lines | P10-06 |
| `playwright.config.ts` | WebKit and Firefox smoke projects | P10-11 |
| `package.json` | `parity` script, version 1.0.0, axe dev dependency | P10-03 |
| `THIRD_PARTY_NOTICES.md` | Refreshed notices | P10-14 |
| `docs/HANDOFF.md` | State at release | P10-14 |

## Migrations and fixtures (0)

None. The IndexedDB schema stays at version 1 until a later phase needs an upgrade step (P02-01 registry).

## Task notes (14)

`docs/notes/P10/<slug>.md`, one per task, from `docs/notes/_template.md`, written before the code:

- `docs/notes/P10/parity-scenarios-food-and-home.md` (P10-01)
- `docs/notes/P10/parity-scenarios-progress-coach-settings-and-data.md` (P10-02)
- `docs/notes/P10/parity-runner.md` (P10-03)
- `docs/notes/P10/obligations-ledger-and-parity-report.md` (P10-04)
- `docs/notes/P10/acceptance-strict-pass.md` (P10-05)
- `docs/notes/P10/traps-ledger-completion.md` (P10-06)
- `docs/notes/P10/accessibility-pass.md` (P10-07)
- `docs/notes/P10/bundle-budget-and-shipped-inventory.md` (P10-08)
- `docs/notes/P10/security-review.md` (P10-09)
- `docs/notes/P10/similarity-report.md` (P10-10)
- `docs/notes/P10/browser-matrix.md` (P10-11)
- `docs/notes/P10/live-provider-check-gated.md` (P10-12)
- `docs/notes/P10/user-docs.md` (P10-13)
- `docs/notes/P10/release-prep.md` (P10-14)

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
pnpm parity                                   # REA parity pass (lead machine)
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref --strict
```

On any failure, fix the cause and run the whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason, or edit a recorded fixture to make a test pass. Real waits are banned in tests: use fake timers (`vi.useFakeTimers()`) and the clock helpers in `src/test/time.ts`.

## Compare checklist (reopen the reference after writing)

- [ ] Every parity divergence classified (intended with a D-id, bug fixed with a test, reference gap with a reason).
- [ ] Every 16-what-we-change D-id that changes visible behaviour has at least one acceptance test.
- [ ] No reference name, text, colour or asset in `dist/` (banned and assets checks on the build output).
- [ ] Every task note's compare section is ticked, each tick naming its test.
- [ ] Trap rows owned by this phase in `docs/internals/traps-ledger.md` now carry `Test:` lines (the lead updates the ledger at land time).
- [ ] Acceptance rows owned by this phase in `docs/internals/acceptance-map.md` now carry `Test:` lines.

## Done when

`pnpm check --require-ref --strict` green, parity report with no unclassified divergence, accessibility and bundle gates green, security and similarity reports written, user docs published in the repo. **Demo (M8, v1.0):** the release checklist walked live: install, onboard with a real or fake provider, log by photo, barcode and hand, check Progress, ask the Coach, back up and restore.
