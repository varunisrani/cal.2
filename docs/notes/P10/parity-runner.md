# Task: Parity runner (P10-03) · Phase: 10 · Owner: builder (wt-p10s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none; the row reads only our own `02-rea-workflow.md` §4 (and §5
rules). Also read: Demo 1's REA runs and the wave-9 notes in `docs/HANDOFF.md` (how the walking
skeleton was run by hand: `vite preview --host 127.0.0.1 --port 4173 --strictPort`, then
`~/rea-lab/rea capture-browser-scenario <file> --format json`), the two captures it left in
`~/rea-lab/parity/platewise/` (the shape of a result: `normalized_result.steps[].status`,
`.error`, `normalized_result.events.items[].kind`), REA's schema for the tool, the fake AI
(`e2e/fake-ai/server.ts`: `startFakeAiServer`, `readNamedScript`, `/__script`, `/__reset`), the
e2e helpers that route the food databases (`e2e/support.ts`), and the other scripts' shape
(`scripts/bundle-budget.ts`, `scripts/ai-cors-probe.ts`: exported pure parts, a `main`, run only
when invoked).

What it does (own words): `pnpm parity` proves every flow in `parity/*.platewise.json` through the
real REA, one at a time, against a fresh build of the app. It builds, serves `dist/` with
`vite preview` on a fixed loopback port, starts the fake AI on its own port, and for each scenario
loads the AI replies that flow needs, writes the scenario with this run's addresses and browser
into the capture folder, runs REA on it, and keeps REA's Evidence there. A run passes when REA
completed every step and the page threw nothing uncaught. It prints one table row per scenario
(steps, time, page errors, the first failed step and REA's reason) and stops only what it started,
by PID, checking afterwards that those processes are gone. `--dry-run` lists the scenarios and what
each needs, and checks the files, without starting anything.

Inputs → outputs: `parity/*.platewise.json`, flags (`--dry-run`, `--only`, `--no-build`, ports,
paths) → `~/rea-lab/parity/platewise/<name>.{scenario,result}.json` (+ `.err`) and a table;
exit 0 when all pass, 1 when any fails, 2 when the run could not start.

Files: created `scripts/parity.ts`, `scripts/parity.test.ts`, this note; `package.json` gets one
line (`"parity": "tsx scripts/parity.ts"`).

Edge cases / failure modes:
- REA's launch mode takes no browser flags, but the browser path is ours to give: the runner
  writes a small wrapper next to the captures that starts the machine's Chromium with one extra
  loopback DevTools port. Through it the runner's fixture desk answers the file chooser with the
  scenario's files (REA has no file action) and fulfils requests to Open Food Facts, its image
  host and FoodData Central from `e2e/fixtures` (REA has no routing); any other request off
  loopback is refused. The desk only answers; it never clicks or reads the page.
- A port already in use (another preview, an e2e run): `--strictPort` makes preview fail at once;
  the runner says which port and stops before running anything.
- A hung step: every step has its own `timeout_ms`; the REA process also gets an overall limit
  (the sum of the step timeouts plus a margin) after which the runner stops its process group.
- REA writes nothing or broken JSON: the scenario fails with REA's stderr tail as the reason.
- A missing hook: REA's `wait_for`/`click` times out on that step; the table names the step id.
- Ctrl+C or a failure mid-run: the started processes are stopped in a `finally`, and the PID check
  still runs.
- Canonical addresses in the files (`127.0.0.1:4173` app, `127.0.0.1:4320` fake AI, the machine's
  Chromium) are rewritten to this run's ports and wrapper, so another port never needs a file
  edit; the file on disk is never changed.

Our design differences / decisions:
- The fake AI runs in the runner's own process (`startFakeAiServer`), so it stops with the runner;
  the child processes (preview, each REA run) are started in their own process groups and stopped
  by their PIDs.
- Fake AI replies per scenario: named scripts from `e2e/fake-ai/scripts/` joined in order into one
  inline script (the wizard's plan first, then the flow's own), loaded after a `/__reset`.
- The pure parts are exported and unit-tested: argument parsing, the static scenario check, the
  address rewrite, the reply join, the verdict from a REA result, the table.
- REA's own obligation ledger run (P10-04) is a second mode of the same script (`--ledger`): it
  turns our ledger files and the latest captures into REA's input and runs it.

Tests we will write (`scripts/parity.test.ts`, node environment):
- `--dry-run` lists every scenario file and starts nothing (main with injected spawners).
- A scenario with a step that failed (a missing hook) fails with that step's id named.
- A page error fails a run whose steps all completed.
- The static check refuses a step without `timeout_ms`, a non-`data-ui` locator, a duplicate step
  id, and blocks that differ from the template; every file in `parity/` passes it.
- The address rewrite changes every canonical address and the browser path, nothing else.
- The PID check reports a PID still alive.

Compare checklist (filled after the rewrite; reopened `02-rea-workflow.md` §4–5 and the Demo 1
notes in `docs/HANDOFF.md`):
- [x] Builds, serves `dist/` on a fixed loopback port with `--strictPort`, starts the fake AI, runs
      each scenario through REA one at a time (final run: 14 flows, one browser each).
- [x] A dry run lists the scenarios and starts nothing (`scripts/parity.test.ts > main > lists
      every scenario on --dry-run and starts nothing`).
- [x] A missing hook fails with the step named (`scripts/parity.test.ts > verdictOf > fails a
      scenario with a missing hook at that step, with REA's reason`; also seen with real REA on a
      scratch copy of the walking skeleton with one hook renamed: `FAIL at wizard.no-such-hook:
      locator.click: Timeout 3000ms exceeded.`).
- [x] A page error fails a run whose steps completed (`verdictOf > fails a run whose steps all
      completed when the page threw an uncaught error`).
- [x] Only started processes are stopped, by PID, and checked gone afterwards (every run printed
      "all N started processes are gone"; `processes > reports the PIDs still alive`).
- [x] Canonical addresses rewritten, the file on disk untouched (`resolveScenario > puts this run's
      addresses and browser in place of the canonical ones, and nothing else`).
- Deliberate differences: the fixture desk (a second DevTools client that only answers file
  choosers and food-database requests) stands in for REA's missing file and routing actions; the
  fake AI runs inside the runner's process.
- Not taken: parallel runs (02 §5: one scenario, one browser at a time).

## Status

Done (2026-10-27). `scripts/parity.ts`, `scripts/parity.test.ts` (28 tests), `package.json`
script `parity` (one line). For the lead: run on the canonical ports with `pnpm parity`; this
builder ran on 4183/4333 (`--port 4183 --ai-port 4333`) so other builders' e2e on 4173/4320 were
never in the way.
