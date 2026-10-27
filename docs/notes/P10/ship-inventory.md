# Task: bundle budget and shipped inventory (P10-08) · Phase: 10 · Owner: builder (wt-p10s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row says none: this records what our own build ships.
Read instead: `docs/plan/02-rea-workflow.md` §3 (inventory of what ships), `docs/plan/04-architecture.md`
§6 (privacy: the only hosts; performance: the budget), `scripts/bundle-budget.ts` (what is counted:
the entry chunk and its static imports, gzip, 1 kB = 1000 bytes; lazy chunks listed apart),
`docs/notes/P10/lazy-loading-groundwork.md` (what was moved out of the start), `index.html` (CSP),
`src/sw/sw.ts`, `src/data/{schema,wipe}.ts`, `src/services/reminders/ports.ts`,
`src/app/InstallPrompt.tsx`, `src/ai/catalog/*`, `src/services/barcode/{off,fdc}.ts`,
`tooling/checks/banned.ts` and `banned-patterns.json`.

What it does (own words): proves the release build is small at start and talks only to the hosts
we promise. `pnpm check:bundle` after `pnpm build` gives the start-up JavaScript (gzip) and the
lazy chunks; the barcode decoder (zxing WASM and its reader), the charts (inside the Progress
chunk) and the Markdown renderer (inside the Coach chunk) must be lazy. REA's
`analyze-javascript-application` over `dist/` gives the shipped routes, storage, network
endpoints and workers, which `docs/internals/ship-inventory-v1.0.md` records next to what the code
says, with the Evidence id. The banned-names check is run once over `dist/` to show no reference
name ships.

Inputs → outputs: `dist/` → the chunk table, the inventory page, the Evidence id
(`~/rea-lab/evidence/platewise-v1.0.json`, outside the repo) and the banned result.

Files: created `docs/internals/ship-inventory-v1.0.md`, `e2e/hosts.spec.ts` (added on the second
resume, for ACC-L6-2), this note. No product code change; the budget script and the banned check
stay as they are.

Edge cases / failure modes:
- The budget counts only the static closure of the entry: a lazy chunk that the entry also
  imports statically would show in the counted table; the table is read for `ProgressPage`,
  `CoachPage`, `wasmReader` and the `.wasm` file, which must be absent from it.
- REA reads source maps if they are present; the inventory names what is in the shipped `.js`
  files, and says which hosts come from the provider catalogue (data, not code paths).
- A host the person types (Custom provider, Ollama) is not in the bundle: the inventory says
  connect-src allows any https host and loopback http for that reason.
- The banned check walks the repository by default; for `dist/` it is run as a one-off over the
  folder, without changing the check, and the command is recorded.

Our design differences / decisions:
- The Evidence file stays outside the repository (02-rea-workflow §1); the page cites its id.
- Hosts are grouped: the AI providers (from the catalogue), Open Food Facts (product API and its
  image host), FoodData Central (search API); anything else is "unexpected" and would fail the
  task.

Tests we will write: `pnpm check:bundle` (already tested in `scripts/bundle-budget.test.ts`) and
the one-off banned run are the gates; the inventory is a document. Added on the second resume,
because ACC-L6-2 needs a test and static analysis cannot see into the entry chunk: one e2e test
(`e2e/hosts.spec.ts`) that records every request of a session touching the AI, both food
databases and every screen, and expects exactly the app's origin, the provider and the three
food-database hosts, written out in the test.

Compare checklist (filled after the rewrite; no reference to reopen; compared with the row's
Verify column and 04-architecture §6 instead):
- [x] initial JS ≤ 250 kB gzip with the decoder, charts and Markdown lazy: `pnpm check:bundle`
      PASS at 235.60 kB (14.40 kB headroom) on base `71e9727` and again on `68a1456`; the source
      maps place the charts in the Progress chunk, the Markdown renderer in the Coach chunk and
      zxing in `wasmReader-*.js`, none counted
- [x] the inventory lists routes, storage, network endpoints and workers, and no unexpected host
      (`docs/internals/ship-inventory-v1.0.md`; every address in the shipped files is accounted
      for: requested hosts are the providers, Open Food Facts and FoodData Central, the rest are
      links, licence texts, library error messages and one header value)
- [x] no reference name in `dist/` beyond the credit read from `THIRD_PARTY_NOTICES.md` (the
      banned check's own code over `dist/`, one-off: 6 findings, all in the credit chunk; the same
      on `68a1456`)
- [x] at run time the app contacts only its own origin, the provider and the food databases
      (`e2e/hosts.spec.ts > the hosts the built app contacts (ACC-L6-2) > only its own origin, the
      AI provider and the food databases, across every screen`)
- Deliberate differences: none.
- Not taken: a permanent banned check over `dist/` (the task says one-off; the lead decides).

## Decisions for the lead

- The credit chunk (`aboutPage.module-*.js`) carries the inspiring app's name, address and MIT
  notice by design (P09-16). A future check over `dist/` needs that chunk on its allow-list.
- ACC-L6-2 ("the built app contacts no host outside the providers and food databases"): its
  Test line is `e2e/hosts.spec.ts > the hosts the built app contacts (ACC-L6-2) > only its own
  origin, the AI provider and the food databases, across every screen`; this inventory is its
  static evidence. The fake AI on loopback stands for the provider: no test calls a real one.
- REA ran on `dist/` without its source maps and Vite's manifest (they are not code the browser
  runs, and the first attempt with them timed out on the entry chunk at REA's default 300 s).
  The entry chunk (609 kB) did not finish even alone, at 1,200 s with lowered semantic limits
  (run 3); a later REA, or a split of the entry chunk, may get further.

## Status

Done (2026-10-27, base `68a1456`): `pnpm check:bundle` PASS at 235.60 kB; the chunk table,
routes, storage, endpoints and workers recorded; REA runs 1 and 2 on `71e9727`'s build (same
product files), run 3 on this base's entry chunk (stopped at its deadline); the banned run over
`dist/` repeated on this base (6 findings, all the credit); every address in the shipped files
re-scanned on this base, none new. `e2e/hosts.spec.ts` 2/2 with `--repeat-each=2` after
`pnpm build`, and in the whole e2e folder once. It failed once on purpose (a stray `fetch` to an
unused loopback port, removed again).
