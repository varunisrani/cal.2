# Task: Acceptance strict pass (P10-05) · Phase: 10 · Owner: builder (wt-p10s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. This task maps our own acceptance ids to our own landed tests;
no behaviour is rebuilt, so there is nothing of the reference to read. Our docs read: the P10-05
row, the rules paragraph at the top of `docs/internals/acceptance-map.md`, the acceptance check
(`tooling/checks/acceptance.ts`, `tooling/checks/ledger.ts`), the inventory rows B11, B13, C12 and
K9 (`docs/plan/03-feature-inventory.md`), spec 06 §3.18 and R06.1, and the owning task rows
(P01-03, P01-04, P05-13, P02-02).

What it does (own words): v1.0 is gated on `pnpm check:acceptance --strict`, which fails while any
acceptance id is covered only by a `Review:` line. At 94031fd five ids were review-only. Three of
them (ACC-B11-1, ACC-B13-1, ACC-C12-2) belong to tasks that landed long ago and whose behaviour is
already proved by tests that never got their `Test:` line; the pass finds those tests and writes
the lines, so the map points at real, unskipped tests. The other two (ACC-L6-2, ACC-L9-1) belong to
the P10-07/08 builder and stay as they are. While checking K9 the pass found part of a P1 feature
missing from the app (the damaged-data banner): that goes under Known gaps, not into a new id.

Inputs → outputs: the map's review-only ids + the landed tests → `Test:` lines on those ids and a
Known gaps entry for the missing banner; `--strict` then fails only on ACC-L6-2 and ACC-L9-1.

Files: changed `docs/internals/acceptance-map.md`; created this note.

Edge cases / failure modes:
- A `Test:` line resolves by plain substring search of each name in the file, so each line is
  copied from the test source exactly (curly apostrophes kept; no escaped quotes).
- A test proving the behaviour may use other numbers than the row (ACC-C12-2 says 2 000 kcal; the
  page tests use 2 452 kcal): the domain test with 2 000 kcal is listed first, the screen tests
  after it.
- A row's behaviour may not be in the app at all: then no test is written and no feature is built;
  it is reported and, with no planned task, goes under Known gaps.

Our design differences / decisions:
- ACC-B11-1 maps to the unit-defaults tests (en-US imperial; en-GB among the tags that start
  metric) and the first-run seeding test; no new test, because en-GB is already in the metric list.
- ACC-B13-1 maps to the Plan ready sheet test and the Settings registration test (the methods page
  opened from the hub), plus the Goals page link.
- ACC-C12-2 maps to the three R06.20 tests (domain, Plan ready, Goals page).
- The K9 banner gap has no N-id in `16-what-we-change.md` and no task: the Known gaps entry calls
  it a proposed N-9 and leaves the choice (record N-9, or schedule a small task) to the lead.

Tests we will write:
- None expected: every review-only id this task owns is already proved by a landed test.

Compare checklist (filled after the rewrite; no reference reopened, see Read):
- [x] ACC-B11-1: en-US lb and ft-in, en-GB kg and cm (tested in `src/domain/units/defaults.test.ts`,
  `src/domain/profile/profile.test.ts`)
- [x] ACC-B13-1: the methods page from Plan ready and from Settings (tested in
  `src/features/onboarding/steps/PlanReady.test.tsx`, `src/features/about/MethodsPage.test.tsx`,
  `src/features/settings/goals/GoalsPage.test.tsx`)
- [x] ACC-C12-2: the kJ wheel saved unchanged keeps the kcal goal (tested in
  `src/domain/units/energy.test.ts`, `src/features/settings/goals/GoalsPage.test.tsx`,
  `src/features/onboarding/steps/PlanReady.test.tsx`)
- [x] `pnpm check:acceptance --strict` fails only on ACC-L6-2 and ACC-L9-1 (owned by the P10-07/08
  builder)
- Deliberate differences: none.
- Not taken: building the K9 banner (out of this task's scope; see Decisions for the lead).

## Decisions for the lead

- The damaged-data banner of K9 (P1) is not in the app: `meta.unreadableData` is set by the guard
  and `useUnreadableFlag` (`src/data/hooks.ts`) reads it, but no screen uses the hook, and no task
  of P09 built it (nothing in the phase files owns it after P02-02). Choose one: record it as N-9 in
  `16-what-we-change.md` §2.8 (the Known gaps entry already calls it "proposed N-9"), or schedule a
  small task (a notice in the app shell reading the hook, with a test, and a dismiss that clears
  the flag, which HANDOFF also lists as missing).

## Status

Done (2026-10-27). ACC-B11-1, ACC-B13-1 and ACC-C12-2 carry `Test:` lines; the K9 banner is under
Known gaps as a proposed N-9. ACC-L6-2 and ACC-L9-1 are left to the P10-07/08 builder.
