# 15 · Roadmap

Nine milestones take Platewise from the landed skeleton to v1.0. Each one has acceptance criteria that
tests can check and a demo a person can run. Tiers come from `03-feature-inventory.md`: P0 lands by
M3, P1 by M8; P2 and P3 wait until after v1.0 unless the user moves them. Phases are in
`18-phase-wise-build-plan.md` and `phases/`.

Calendar weeks assume 3–5 builder sub-agents in parallel worktrees and one lead landing slices. Two
tracks run side by side: the **domain/data/AI track** and the **UI track**; the UI track builds its
primitives early on fakes and joins the data layer at the walking skeleton.

## Milestones

| # | Name | Phases | Weeks | Ends with |
|---|---|---|---|---|
| M0 | Foundations | P00 | 1 | CI and guards green, tokens, catalogue, fake AI server |
| M1 | Cores | P01, P02, P03 | 1–4 | Domain, data and AI layers tested without a UI |
| M2 | Walking skeleton | P04 | 2–4 | Demo 1: a manual entry on Home survives a reload |
| M3 | Onboarding and goals | P05 | 4–5 | Demo 2: wizard with an AI plan and the formula fallback |
| M4 | Logging | P06 | 6–8 | Demo 3: photo, describe, barcode, reuse, edit, combine |
| M5 | Day view and Progress | P07 | 8–10 | Demo 4: week bar, water, fasting, weight, recap |
| M6 | Coach | P08 | 10–11 | Demo 5: the Coach answers from the log with tools |
| M7 | Settings, data and platform | P09 | 11–13 | Demo 6: install, offline, export, backup and restore |
| M8 | v1.0 | P10 | 13–14 | Release checklist walked live |

### M0 · Foundations

- **Acceptance:** `bash scripts/ci-local.sh` (and the CI workflow once D-16.54 is confirmed) runs
  lint, format, typecheck, unit tests, build, bundle budget, e2e and `pnpm check --require-ref`
  green; the token contrast sweep passes for 2 themes × 6 accents; the catalogue lint passes; the
  fake AI server answers scripted replies with CORS headers; lint rejects a domain file importing
  React, a feature importing a repository, a stray `fetch` and literal JSX copy.
- **Demo:** `pnpm dev` shows the placeholder app in dark and light with the Basil accent and our
  icon; `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref` prints an all-green table.

### M1 · Cores (domain, data, AI)

- **Acceptance:** every module of `src/domain/`, `src/data/` and `src/ai/` has passing tests next to
  it, including the research vectors: the default plan (2 452 kcal, 112 / 406 / 42 g), the plan
  validator cases, kJ round trips, meal classification, unknown-weight servings, the fast that blocks
  food inside the writing transaction, quarantine of unreadable records, cross-tab updates, the
  retry ladder within the deadline, the standby rescuing an unusable answer, the compact re-ask, and
  silent cancel. No `dexie` import outside `src/data`, no AI `fetch` outside `src/ai/transport.ts`.
  The trap rows owned by P01–P03 carry `Test:` lines.
- **Demo:** `pnpm test src/domain src/data src/ai --reporter=verbose` lists those cases by name.

### M2 · Walking skeleton

- **Acceptance:** `e2e/walking-skeleton.spec.ts` passes three times in a row in the Pixel 7
  viewport; no Home number renders before the profile is read; the tab bar never shows a hidden
  tab; ACC rows A1, A2, A10, D2, D26, F3, F7 (by meal), F10 have tests.
- **Demo 1:** start with defaults, add "Toast, 250 kcal" by hand, see it under its meal with the
  gauge at 250, reload, delete it with confirmation.

### M3 · Onboarding and goals

- **Acceptance:** `e2e/onboarding.spec.ts` passes (AI plan, unusable reply → formula plan with the
  note, Set up later, rebuild from Settings); the tune-up runs once per due week; every P0 row has a
  test; ACC rows of B and C have tests.
- **Demo 2:** a fresh browser walks the wizard with the fake provider, edits protein on Plan Ready,
  lands on Home with those targets, then rebuilds from Settings; a second run without AI ends on the
  formula plan.

### M4 · Logging

- **Acceptance:** `e2e/logging.spec.ts` passes; every D-row ACC id has a test; the WASM barcode
  decoder is not in the initial bundle; drafts reopen after a reload.
- **Demo 3:** photo → review → 1.5 servings → log; type a barcode → log the product; log yesterday's
  breakfast again from Recent; edit an entry's calories; combine two entries; reload mid-review.

### M5 · Day view and Progress

- **Acceptance:** `e2e/home-progress.spec.ts` passes; F, G and H ACC ids have tests; Progress charts
  load lazily.
- **Demo 4:** pick last Tuesday in the week bar and log water there; start a fast, see food paused,
  End fast and log; log a back-dated weight and see it on the 1M chart; open last week's recap.

### M6 · Coach

- **Acceptance:** `e2e/coach.spec.ts` passes; I ACC ids have tests; tool results never exceed
  60 000 characters; a late reply after Reset is never stored.
- **Demo 5:** ask "what did I eat yesterday?" with the fake provider and see the answer built from a
  `food_log` call; send a chip; retry a failed turn; Reset during a slow reply.

### M7 · Settings, data and platform

- **Acceptance:** `e2e/settings-data.spec.ts` passes in both Playwright projects (service workers
  blocked and allowed); J, K and L ACC ids have tests; backups contain no key (planted-key test);
  the CSP test passes.
- **Demo 6:** install the built app, go offline and reopen it; export this week as CSV; back up,
  erase everything, restore from Welcome and find the same diary, photos, saved meals and chat.

### M8 · v1.0

- **Acceptance:** `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref --strict` green (every
  P0/P1 ACC id mapped to a passing test; every v1-owned trap row has a test); the REA parity report
  has no unclassified divergence; axe finds no serious or critical issue on the main screens in both
  themes; initial JS ≤ 250 KB gzip; security, similarity, browser-matrix and provider-check reports
  written; user docs in `docs/user/`; release checklist complete. Tags and releases only when the user
  asks.
- **Demo:** the release checklist walked live: install, onboard with a real or fake provider, log by
  photo, barcode and hand, check Progress, ask the Coach, back up and restore.

## After v1.0

L1 i18n → L2 workouts core and rest timer → L3 AI text workouts and Coach workout tools → L4
speech-to-text and direct meal-share links → L5 live-voice spike (order from research 07 §5.2, as the
lead set it on 2026-10-26; see Proposed D-16.53). P2 rows (A7, A12, D29, E15, E16, F13, K8, L8 and the
full ingredient-label split of D23) form a v1.x backlog that can interleave with L1. Backend
features (short share links, weekly challenge, hosted AI) are not planned (N-8).

## Risks and ways out

| # | Risk | Likelihood / impact | Early signal | Way out |
|---|---|---|---|---|
| 1 | A provider stops allowing browser CORS (D-04.1) or strips CORS on success replies | Medium / high for that provider | P03-19 probe or P10-12 live check fails | Mark the provider `unsupported` in the catalogue; people use the Custom provider with their own relay (D-16.26); keep the other 15 |
| 2 | iOS Safari evicts IndexedDB after 7 days without use | High / high (data loss) | Persistence status "not persistent" in the storage card | Persistence request (D-16.8), install nudge, backup reminders (P09-15); restore from file always works |
| 3 | Barcode scanning is weak without `BarcodeDetector` (iOS Safari) | High / medium | Browser matrix rows | Lazy zxing-wasm decoder plus typed digits (D-16.18) |
| 4 | Reminders do not fire while the app is closed | Certain / medium | — (platform limit) | Shown on next open and stated in the UI (D-16.5); a push relay is a later decision |
| 5 | Our prompts give worse answers than the reference's (we may not copy them) | Medium / high | Parse failures and standby use in the live check | Strict validators and the standby (D-16.22); iterate prompts from the spec's described intent, measured in P10-12 |
| 6 | Similarity hits from recalled reference code or prose | Medium / medium | `pnpm check` on every slice | Rewrite from the task note (01 §6); never allow-list without a reason |
| 7 | Parallel builders collide on shared files | Medium / medium | Merge conflicts at land time | Slices own disjoint paths; catalogue partitions (Proposed D-16.55); one owner per updated file per phase |
| 8 | The initial bundle passes 250 KB | Medium / low | `pnpm check:bundle` in CI from P00 | Lazy-load the decoder, charts, Markdown and settings pages |
| 9 | HEIC photos fail outside Safari | High / low | Browser matrix | Clear refusal message (D-16.21); a WASM decoder only if users ask |
| 10 | Large 10-photo requests exceed vendor limits | Medium / medium | 400/413 in the live check | Size estimate and a clear message (E16, R03.29); fewer photos per request |
| 11 | Dexie or fake-indexeddb behaviour differs from real browsers (transactions, BroadcastChannel) | Low / medium | e2e failures that unit tests miss | Every repository flow also exercised in Playwright; cross-tab test in a real browser (P09-19) |
| 12 | Model presets go stale between plan and release | High / low | Vendor model lists | Curated data file refreshed in P10-12 (D-16.25); free-form ids always allowed; the versioned upgrade hook (E15) |
| 13 | Scope creep into P2/P3 | Medium / high | Tasks citing P2/P3 inventory rows | Tiers are binding; the lead moves rows only with the user |
