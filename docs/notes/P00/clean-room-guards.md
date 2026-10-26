# Task: clean-room guards (P00-02..P00-08) · Phase: 00 · Owner: builder (wt-guards)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read: none. This is tooling with no reference behaviour; the reference tree is only the input
data that the similarity and asset checks scan.

Task ids as assumed here (the phase file was not in this worktree): P00-02 runner, P00-03
similarity, P00-04 banned names, P00-05 assets, P00-06 licences, P00-07 traps ledger, P00-08
acceptance map.

What it does (own words): `pnpm check` runs six guards that show Platewise's code is its own and
that its plan is covered by tests. Similarity looks for long shared runs of code tokens, lines or
prose words between the product and the reference. Banned looks for the reference's names in
product files and paths. Assets looks for byte-identical images, fonts, sounds and videos.
Licences checks that production dependencies use allowed licences. Traps and acceptance check that
every declared trap and every P0/P1 feature points at a real test (or a review note). Every guard
runs even when another fails; the runner prints a table and exits with the worst code.

Inputs → outputs: product folder, reference folder (`--ref` > `PLATEWISE_REF` >
`~/reference/fud-ai`), JSON config under `tooling/checks/`, plan docs and ledgers → a summary
table (or `--json`), findings with file:line, exit 0 clean / 1 violations / 2 setup problem.

Files: created `tooling/checks/**` (runner, one module per check, shared helpers, tests, JSON
config), `docs/internals/checks.md`, this note. No changes outside the task's files.

Edge cases / failure modes:

- No reference on disk: similarity and assets warn and skip (exit 0); `--require-ref` makes it 2.
- Allow-list entry without a reason, unreadable config, bad regex, unknown `--only` name: exit 2.
- Prettier reformatting a copied block (quotes, semicolons, trailing commas, line breaks) must
  not hide it: tokens ignore whitespace, string quotes, `;`, and a comma before a closing bracket.
- Huge or binary reference files (localisation catalogues, images) are skipped by size/NUL sniff.
- The reference index is large (millions of windows): typed arrays, radix sort, binary cache file.
- Cache goes stale when the reference HEAD or the checker source changes: both are in the key.
- `pnpm` missing: licences fall back to walking `node_modules` from package.json dependencies.
- Ledger rows pointing at renamed or skipped tests; ledger missing while research exists.

Our design differences / decisions:

- Similarity indexes two window sizes per channel (gate size and probe size) as sorted 52-bit
  hashes with one reference location each. The gate asks "is this exact window in the
  reference"; `--closest` merges consecutive matching probe windows into regions, so its score is a
  ranking hint and can reach 1.00 when the reference pieces are not contiguous (marked when the
  gate actually fired).
- Token ids are a string hash of the token text, so the cache needs no token dictionary.
- The cache is `<key>.json` (metadata) plus `<key>.bin` (typed arrays), because the arrays are
  too big for a JSON string. The key also covers the reference path and a format number. Older
  cache files in that folder are deleted when a new one is written.
- Markdown, HTML, XML and text feed all three channels (Markdown and markup with `<!-- -->`
  stripped for code tokens); code files feed tokens, lines and prose (comments + strings).
- A meaningful line is identified by its tokens, so spacing, quote style and a trailing `;`
  inside a line do not matter either (stricter than "whitespace collapsed"). Lines made only of
  bare tags (`<div>`, `</div>`) count as bracket lines, so closing-tag runs in TSX do not match
  HTML boilerplate.
- A token window counts only when at least 20% of it is identifiers, numbers or strings
  (bare tag names do not count). Found on the first real run: a Prettier table rule in
  Markdown matched 76 dashes and pipes in a reference licence file.
- Prose takes string literals only when they contain a space (UI copy, prompts); keys, paths,
  URLs and import specifiers are not prose. Strings on import lines are dropped too.
- Assets compare sizes first and hash only same-size reference files, so no cache is needed.
  Empty files are ignored (nothing to copy).
- Banned, assets and similarity skip product `node_modules` anywhere, and `dist`, `coverage`,
  `test-results`, `playwright-report` only at the product root (a `src/**/dist` folder is
  still checked). Banned exemptions for README/AGENTS/CLAUDE/THIRD_PARTY_NOTICES apply at the
  root only.
- Licences: an exception matches one package name with one exact licence string; `X WITH Y`
  is judged by `X`; `X+` passes when `X` is allowed; a non-SPDX string fails. When pnpm fails
  (not only when it is missing), the fallback walk runs; an uninstalled production dependency
  is a setup error.
- Traps and acceptance share one resolver, so traps also fail on skipped/todo tests. A Test
  line needs at least one name after the path. Ledger rows for unknown ids are ignored by traps
  and listed as a note by acceptance.

Tests we will write:

- Scanner: comments stripped per family, strings normalised, whitespace/reformat invariance,
  meaningful-line filter, prose from comments + strings + Markdown.
- Similarity on temp dirs: 50-token copy caught, 49 not; 6 lines caught, 5 not; 12 words caught,
  11 not; allow-list with/without reason; cache reuse; `--closest` ranking.
- Banned: content and path hits with line:col, exemptions, bad pattern → setup error.
- Assets: identical file caught, different file of same size not; licences: SPDX expressions,
  exceptions, fallback walker; traps and acceptance: every pass/fail/skip rule.
- Runner: worst exit code, `--only`, missing reference with and without `--require-ref`.
- Real-reference detection (skipped when the reference is absent): planted ~60-token copy and a
  copied PNG, both in `os.tmpdir()`.

Compare checklist (filled after the rewrite; no reference files reopened, tooling):

- [x] Gates fire at exactly 50 tokens / 6 lines / 12 words and not one below (tested in
      `tooling/checks/similarity/check.test.ts`).
- [x] A Prettier-style reformat of a copy is still caught (same file).
- [x] Planted ~60-token copy of a real reference `.ts` file and a copied reference PNG are
      caught (tested in `tooling/checks/realRef.test.ts`, skipped without the reference).
- [x] Every check's pass/fail/skip/setup-error path (tests next to each module).
- Deliberate differences: n/a (no reference behaviour).
- Not taken: identifier renaming is not normalised, so a copy with every name changed is only
  caught by the line or prose gates if those still match.

## Decisions for the lead

- Revisit if wanted: traps fail on skipped tests; `--closest` scores are approximate; prose
  ignores strings without spaces; line identity ignores spacing and quotes; token windows need
  20% content; output folders are skipped at the product root only.
- Expected similarity hits later: a `THIRD_PARTY_NOTICES.md` that quotes the reference's MIT
  notice, or full licence texts (the reference ships third-party notices under `local-models/legal/`),
  will trip the 12-word prose gate; give such files an allow-list entry with a reason.
- `--closest` today ranks standard HTML head boilerplate in `index.html` highest (score 0.75,
  prose of the viewport meta tag). It is not a copy.

## Status

Done (2026-10-26). All six checks, the runner, config files, tests and `docs/internals/checks.md`
are in place. Nothing outside the task's files changed. Traps and acceptance skip until the lead
adds research specs, the feature inventory and the two ledgers.
