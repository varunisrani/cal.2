# Task: Traps ledger completion (P10-06) · Phase: 10 · Owner: builder (wt-p10s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The task maps our own trap rows to our own landed tests and
adds a script over our own ledger; nothing is rebuilt. Our docs read: the P10-06 row, the "How
rows change" paragraph of `docs/internals/traps-ledger.md`, the traps check
(`tooling/checks/traps.ts`, `tooling/checks/ledger.ts`), spec 05 §6 R05.18, spec 06 §3.18 and §6
R06.1 and R06.22, the inventory rows F13 and K9, and the task rows P07-03, P09-01 and P02-02.

What it does (own words): every trap row whose owner is a v1 task must point at a test by v1.0;
rows owned by later phases (L1–L5), v1.x items or not-planned features (N-ids) keep a `Review:`
line that says so. At 94031fd three rows still named a v1 task in a `Review:` line: R05.18 (the
fill-from-zero animation, given to P07-03 although the feature is v1.x F13), R06.1's banner part
(given to P09 for K9) and R06.22's settings screens part (given to P09-01). Each is settled by
what is really in the app: a landed test gets its `Test:` line, a feature that is v1.x says so,
and a part nobody built is called missing. A small script, `pnpm ledger:gaps`, then lists any row
owned by a v1 task with no `Test:` line, and any `Review:` line that still names a v1 task, so the
ledger cannot drift back.

Inputs → outputs: the ledger → `Test:` lines and honest `Review:` lines; `pnpm ledger:gaps` →
the list of v1-owned gaps (empty), exit 0, or the list and exit 1.

Files: changed `docs/internals/traps-ledger.md`, `package.json` (one script line); created
`scripts/ledger-gaps.ts`, `scripts/ledger-gaps.test.ts` and this note.

Edge cases / failure modes:
- A `Review:` line can name both a later owner and v1 groundwork ("owned by L1 (groundwork:
  P00-05, P00-07)"): the owner is the first owner token on the line, so that row is L1's.
- "P2" in "owned by v1.x item K8 (Compress photos, P2)" is a priority, not a task: a task id is
  `Pnn-mm` or a bare phase `Pnn`, two digits.
- "v1.x" must not be read as a v1 task, and "N-8 (not planned)" is an N-id.
- A row with no `Review:` line at all is owned by the v1 task that landed it, so it needs a test.
- The script reads the ledger with the same parser as `pnpm check:traps`, so the two agree on
  what a row and a coverage line are; it does not check that Test lines resolve (the traps check
  does).

Our design differences / decisions:
- R05.18: the fill animation is not built (P07-03's row says F13 is P2; no fill-from-zero code
  exists): the line says it is owned by v1.x item F13 and drops P07-03.
- R06.1: the banner is not in the app (`useUnreadableFlag` has no screen and no task built it):
  the line says so plainly and names no owner, and the gap is reported to the lead and listed
  under Known gaps in the acceptance map (P10-05).
- R06.22: the settings screens wait for the snapshot through the category frame (P09-01, tested)
  and the registry marks every category but About, Credits and the methods page to wait: those
  tests replace the `Review:` line.
- Exit codes: 0 none listed, 1 something listed, 2 the ledger is missing or an argument is wrong.

Tests we will write:
- `scripts/ledger-gaps.test.ts`: owner reading (L, v1.x, N-ids, task ids, the groundwork case,
  P2), a v1 row without a test listed, a later row without a test not listed, a v1 `Review:` line
  on a row with tests listed, and the real ledger listing none.

Compare checklist (filled after the rewrite; no reference reopened, see Read):
- [x] R05.18 says v1.x F13 (no test: not built)
- [x] R06.1 Test lines kept; the banner line says it is missing (reported)
- [x] R06.22 settings screens part mapped (tested in `src/features/settings/registry.test.ts`,
  `src/data/hooks.test.tsx`; the frame in `src/features/settings/CategoryPage.test.tsx`)
- [x] every other `Review:` line names L1–L5, a v1.x item or an N-id (checked one by one)
- [x] owner reading and the listing (tested in `scripts/ledger-gaps.test.ts`)
- [x] `pnpm ledger:gaps` lists none on the real ledger (tested in `scripts/ledger-gaps.test.ts`)
- Deliberate differences: none.
- Not taken: building the K9 banner or the F13 animation (out of scope).

## Decisions for the lead

- The K9 banner gap: see `docs/notes/P10/acceptance-strict-pass.md` (proposed N-9, or a small task).

## Status

Done (2026-10-27). No v1-owned trap row is without a Test line; `pnpm ledger:gaps` lists none.
