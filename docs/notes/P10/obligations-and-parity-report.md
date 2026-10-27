# Task: Obligations ledger and parity report (P10-04) · Phase: 10 · Owner: builder (wt-p10s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): the reference observations written for P10-01/02 in
`~/rea-lab/parity/fud-ai/<flow>.md` (outside the repo; each names the reference files and tests at
the pin and the spec section it rests on), and through them the reference files they cite, only
where a capture of ours showed something the observation did not settle. Our docs:
`02-rea-workflow.md` §4.4–4.6, `docs/internals/acceptance-map.md` (the ACC rows of the flows and
their tests), `16-what-we-change.md` (D-ids), the research specs' traps, REA's
`build_reconstruction_obligation_ledger` input schema (rea-agents 6.8.0, outside the repo).
Evidence: the parity captures of this task (`ev_…` ids, cited only).

What it does (own words): turns the parity pass into a ledger a reviewer can check. Each ACC row a
parity flow touches becomes one observable claim, written in our words ("a typed barcode that Open
Food Facts knows opens its product in the review"), with the flow and steps that show it.
`manifest.json` binds each claim to the module that owns it and the tests that prove it (the
acceptance map's `Test:` lines). The report then walks every flow: what our capture shows, what
the reference observation says, and every place they differ, each classified as intended (a
D-id), a bug (fixed here with a test that failed first), a reference gap (the reference cannot show
it here, and why), or unknown (for the lead). REA's own ledger tool gets the same claims, the
bindings and the Evidence of our runs, and its verdict is recorded beside ours.

Inputs → outputs: captures + observations + acceptance map → `parity/ledger/obligations.json`,
`parity/ledger/manifest.json`, `docs/internals/parity-report-v1.0.md`, a REA ledger result in
`~/rea-lab/parity/platewise/ledger/` (outside the repo; its digest cited).

Files: created the three above and this note; a new D-16.xx row in `docs/plan/16-what-we-change.md`
§2.7 only if the comparison finds an intended difference with no id yet.

Edge cases / failure modes:
- The reference cannot run here (native apps, no emulator, 02 §2): every reference side is an
  observation from source and spec, never a capture. A claim is `verified` when our steps complete
  and the observation agrees or differs only where a D-id says so; `blocked` when the observation
  could not settle it.
- A divergence that is not ours to judge (a visible choice with no D-id) is `unknown` with a
  proposal, never left unclassified.
- REA's ledger is strict by design (it wants reference-side Evidence for each claim, which cannot
  exist here): its claims come out blocked on the reference side; the report says so and why,
  and our own ledger is the progress bar (02 §4.6).
- Claims cite tests by `file > describe > test` exactly as the acceptance map does; a claim with
  no test yet says so (the P10-05 strict pass adds them).
- Reference names stay out of `parity/` (banned check): observations are cited by flow name and
  spec section, never by reference file text.

Our design differences / decisions:
- Claim ids are `PC-<ACC id>` (one per ACC row), so the ledger and the acceptance map line up.
- The REA ledger input is generated, not hand-written: `pnpm parity --ledger` reads our two
  files, hashes each owner module, and takes the newest capture of each flow.

Tests we will write:
- A unit test that every claim in `obligations.json` names an ACC id of the acceptance map, a
  scenario file that exists and step ids that file has; that every claim has one manifest
  binding whose module exists; and that the REA input builder turns them into the shape REA
  takes (in `scripts/parity.test.ts`).
- For each bug divergence: a failing-first test in the owning module, named in the report.

Compare checklist (filled after the rewrite; reopened the reference files the observations
name where a capture did not settle a point: the sort order default on both platforms, the meal
schedule, key masking, the + menu during a fast, the water and fasting defaults):
- [x] One claim per ACC row of the parity flows, each on steps its flow has
      (`scripts/parity.test.ts > parity ledger > holds one claim per ACC row of a parity flow, each
      on steps its flow has`).
- [x] No unclassified divergence; intended ones cite a D-id; the bug cites a test that exists
      (`parity ledger > classifies every divergence: intended with its D-id, a bug with the test
      that failed first`).
- [x] Every claim bound to an owner module that exports its symbol and to the acceptance map's
      tests (`parity ledger > binds each claim to its owner module and the acceptance map's tests
      for its ACC row`).
- [x] REA's ledger accepts the generated input (`parity ledger > gives REA its ledger input in
      REA's canonical bundle form, every claim blocked on the reference side`; the real run's
      Evidence id and closure digest are in the report).
- [x] The bug found by the pass is fixed with a test that failed first (`src/features/log/reuse/
      ReuseSheet.test.tsx > ReuseSheet: Saved > keeps the sheet hook for the sheet alone: each
      saved row has its own (P10-04 parity)`: failed with three elements, passes with the rename).
- Deliberate differences: two new ones, recorded by the lead as D-16.86 and D-16.87 (§2.7); the platform splits where we
  follow one platform (Plan Ready rebalance as iOS under D-16.12 and inventory B8; diary sort
  default as Android) are noted, not counted as differences.
- Not taken: the duplicate "Remove" control of saved rows is reported with a proposal (a choice
  between two controls, for P10-07), not fixed here.

## Status

Done (2026-10-27). Lines changed outside the task's files: `src/features/log/reuse/ReuseSheet.tsx`
(one attribute) and its test (one new test), for the bug; two new rows in
`docs/plan/16-what-we-change.md` §2.7, numbered D-16.86 and D-16.87 by the lead.
