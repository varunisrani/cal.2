# Task: bundle budget script (P00-10) · Phase: 00 · Owner: builder (wt-p00s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart. Read
`docs/plan/phases/P00-foundations.md` (P00-10 row), `docs/plan/04-architecture.md` §6
(Performance: initial JS ≤ 250 KB gzip; barcode decoder and charts lazy), Vite's `ManifestChunk`
type in `node_modules/vite`, and `tooling/checks/runAll.ts` for the house style of a CLI script.

What it does (own words): after `pnpm build`, `pnpm check:bundle` measures what a phone must
download before the app can start: the entry chunk plus every chunk it imports statically, each
gzipped, added up. Over 250 KB the check fails and names the files. Chunks that load only on
demand (the barcode decoder, charts, Markdown) are listed in their own table and never counted,
so making something lazy is the way to win headroom back. It reads Vite's build manifest
(`dist/.vite/manifest.json`, turned on by P00-08) rather than guessing from file names.

Inputs → outputs: `dist/.vite/manifest.json` and the files it names (or `--dist <dir>`) → a
table of counted files (raw and gzip sizes), the total, the budget and the headroom, then a
table of lazy chunks; exit 0 under or at the budget, 1 over it (with the counted file list), 2
for a setup error (no manifest, unreadable or malformed manifest, no entry, an import key or a
file missing).

Files: created `scripts/bundle-budget.ts`, `scripts/bundle-budget.test.ts`; changed
`package.json` (the `check:bundle` script line only).

Edge cases / failure modes:
- No build yet (manifest missing): exit 2 with "run pnpm build first", not a budget failure.
- Several entries in the manifest: take the `index.html` entry; with no `index.html`, exactly
  one JS entry is required, otherwise exit 2 listing them.
- A chunk imported both statically and dynamically: it is part of the start-up download, so it
  is counted and not listed as lazy.
- Shared chunks reached along two paths (a diamond) and import cycles: counted once.
- An `imports` key that is not in the manifest, or a listed file missing on disk: exit 2 (the
  manifest and `dist/` are out of step, so any number would be wrong).
- Exactly at the budget passes; one byte over fails ("exceeds").
- CSS and assets are not JavaScript and are not counted (the budget is initial JS).

Our design differences / decisions:
- The core is a pure function over (manifest JSON text, read-file callback), so tests need no
  real build; the CLI only finds `dist/`, reads files and prints.
- 250 KB means 250 000 bytes (Vite's own build report uses 1 kB = 1000 bytes, so the numbers
  line up with `vite build` output, and it is the stricter reading).
- gzip at zlib's default level (6), what most static hosts serve when compressing on the fly;
  level 9 would flatter us by a few percent.
- Exit codes follow `tooling/checks`: 0 clean, 1 violation, 2 setup problem.

Tests we will write (`scripts/bundle-budget.test.ts`, node environment, in-memory fixtures and
one temp dir; incompressible fixture bytes so gzip sizes are predictable):
- Under budget passes; the entry's transitive static imports are all counted, once each.
- Over budget fails, exit 1, and the report names every counted file.
- A large dynamic import (and its own imports) is excluded from the total and listed as lazy;
  a chunk that is both static and dynamic is counted, not lazy.
- Missing manifest (CLI on an empty temp `dist`) → exit 2; malformed JSON, no entry, an unknown
  import key and a missing file → setup errors.
- Exactly at the budget passes.

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart):
- [x] Under budget passes, static imports counted once each (tested in
      `scripts/bundle-budget.test.ts > measureBundle > passes under budget, counting the entry and
      its static imports once each`)
- [x] Over budget fails with the file list (`measureBundle > fails over budget and names every
      counted file`; CLI exit 1 in `main > prints the table and exits 0 under budget, 1 over
      budget`)
- [x] Dynamic imports excluded and listed as lazy (`measureBundle > leaves dynamic imports out of
      the total and lists them as lazy`; `> counts a chunk that is imported both statically and
      dynamically, and never as lazy`)
- [x] Missing manifest is a setup error, exit 2 (`main > exits 2 when there is no manifest (no
      build yet)`); other setup errors in `measureBundle > rejects %s as a setup error` and
      `> treats a file named in the manifest but missing on disk as a setup error`
- [x] Budget boundary (`measureBundle > passes exactly at the budget and fails one byte over`)
- [x] Real build: `pnpm build && pnpm check:bundle` printed 68.00 kB gzip for one counted file
      (`assets/index-48tBoFR3.js`, 219.81 kB raw), headroom 182.00 kB, no lazy chunks, exit 0.
- Deliberate differences: n/a (no reference behaviour).
- Not taken: counting CSS or a separate CSS budget.

## Decisions for the lead

- 250 KB = 250 000 bytes, gzip at zlib's default level 6. Vite's own build line shows 68.74 kB
  for the same file (its compressor differs from Node's zlib by about 1 %); ours prints 68.00 kB.
- `--dist <dir>` lets the script measure another output folder; the default is `dist/`.
- When a manifest has several entries, the `index.html` entry is the one measured.
- ACC-L10-1 can point at `scripts/bundle-budget.test.ts > measureBundle > passes under budget,
  counting the entry and its static imports once each` and `> fails over budget and names every
  counted file` (plus the CI step).

## Status

Done (2026-10-26). Created `scripts/bundle-budget.ts` and its test; `package.json` gained the
`check:bundle` line (the previous last script line gained a comma). Uses `build.manifest` from
P00-08.
