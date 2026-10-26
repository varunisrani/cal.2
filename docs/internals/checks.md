# Clean-room checks

`pnpm check` runs six guards that show Platewise's code is its own and that the plan is covered
by tests. The code lives in `tooling/checks/`; `runAll.ts` is the entry point.

```sh
pnpm check                                  # every check
pnpm check --require-ref                    # what CI and builders run
pnpm check:similarity                       # one check (also :banned, :assets, :licenses, :traps, :acceptance)
pnpm check --only similarity --closest 20   # rank the 20 regions nearest to the gate
```

Every selected check runs, even after one fails. The runner prints the findings, then a table,
and exits with the worst result: **0** clean (pass or skip), **1** violations, **2** setup
problem (missing reference with `--require-ref`, a broken config file, a crash).

| Flag            | Meaning                                                                      |
| --------------- | ---------------------------------------------------------------------------- |
| `--only <name>` | Run just this check; repeat it (or use commas) for more.                     |
| `--ref <path>`  | Reference folder. Otherwise `PLATEWISE_REF`, otherwise `~/reference/<name>`. |
| `--require-ref` | A missing reference is exit 2 instead of a warning and a skip.               |
| `--strict`      | Acceptance also fails rows covered only by `Review:`.                        |
| `--closest <n>` | Similarity also prints the `n` nearest regions. A ranking, never a gate.     |
| `--json`        | Print the full results as JSON instead of the table.                         |

## similarity

Compares product text with the reference tree in three ways. A shared run at or over a gate
fails: **50 code tokens**, **6 meaningful lines** or **12 prose words**.

- **Code tokens**: identifiers, numbers, string literals and punctuation, with comments and
  whitespace removed. String quotes, semicolons and a comma before a closing bracket do not
  count, so running Prettier over a copy does not hide it. A window needs at least 20%
  identifiers, numbers or strings to count, so table rules, dashed lines and runs of closing
  tags are not mistaken for code.
- **Meaningful lines**: a line's tokens. Blank lines, comment-only lines, imports and
  package lines, and lines of only brackets, punctuation or bare tags (`</div>`) are left out.
- **Prose**: lower-case words from Markdown and text files, from comments, and from string
  literals that contain a space (UI copy and AI prompts; keys, paths and URLs are skipped).

Each finding gives the product file and line, the reference file and line, and an excerpt.
Product JSON/YAML/TOML config is only ranked by `--closest`, never gated. Skipped: product
`node_modules` and the root output folders (`dist`, `coverage`, `test-results`,
`playwright-report`), `pnpm-lock.yaml`, `tooling/checks/**/fixtures/**`; in the reference
`.git`, `node_modules`, `build`, `dist`, `.gradle`, `Pods`, `DerivedData`,
`shared/workout-vectors`, files over 3 MB and binary files.

`--closest` probes smaller windows (20 tokens, 3 lines, 6 words), joins neighbouring hits into
regions and scores each as run length ÷ gate. A score of 1.00 or more would fail the gate; `*`
marks regions where the gate did fire. Neighbouring hits may come from different reference
places, so the score is a hint for where to rewrite first.

**Allow-list**: `tooling/checks/similarity/allow.json`, empty by default:

```json
[{ "path": "THIRD_PARTY_NOTICES.md", "reason": "keeps the reference's licence notice" }]
```

`path` is a file, a folder or a glob (`*`, `**`). An entry without a reason is a setup error.

**Cache**: the reference index is saved in `node_modules/.cache/platewise-similarity/` as
`<key>.json` (file list) and `<key>.bin` (the hash tables). The key covers the reference HEAD
commit, the reference path and the checker's own source, so a new reference commit or a
scanner change rebuilds it. Delete the folder to force a rebuild. Measured on the 4-core dev
machine: a cold `pnpm check --require-ref` takes about 3 s, a cached one under 1 s.

## banned

Searches every product text file and every file path for the patterns in
`tooling/checks/banned-patterns.json`:

```json
[{ "id": "product-name", "pattern": "…", "flags": "i", "hint": "the product is Platewise" }]
```

Add a pattern by adding an entry; no code change is needed. Findings give file:line:col (or
the column in the path), the pattern id and its hint. Exempt: `README.md`, `AGENTS.md`,
`CLAUDE.md`, `THIRD_PARTY_NOTICES.md` at the root, `docs/**`, `pnpm-lock.yaml`, the pattern
file, `node_modules` and the root output folders. Tests that need a banned word build it from
pieces (`['ab', 'c'].join('')`) so they pass the check themselves.

## assets

Fails when a product image, icon, font, sound or video (`png jpg jpeg gif webp avif svg ico
icns ttf otf woff woff2 mp3 wav m4a aac ogg mp4 mov webm`) is byte-identical (SHA-256) to any
file with those extensions anywhere in the reference, store screenshots and exercise images
included. Only reference files with the same size as a product asset are hashed. Empty files
are ignored.

## licenses

Lists production dependencies with `pnpm licenses list --prod --json` (or, when pnpm fails,
walks `node_modules` from package.json `dependencies`). Each licence must pass
`tooling/checks/licenses.allow.json`:

```json
{
  "allowed": ["MIT", "ISC", "…"],
  "exceptions": [{ "package": "x", "license": "…", "reason": "…" }]
}
```

SPDX expressions work: `A OR B` passes if either is allowed, `A AND B` needs both, parentheses
group. An exception matches one package with one exact licence string and needs a reason.

## traps

Declared traps come from `docs/plan/research/<nn>-*.md` (the numbered items under the heading
that starts with `## 6`) and from `docs/plan/*.md` (`## Traps`). An item's id is the explicit
`R<nn>.<k>` / `T<nn>.<k>` in its text, or else the file's number and the item's number.

Each one needs a row in `docs/internals/traps-ledger.md`:

```md
- **R01.3** Midnight rollover uses the device's local day
  - Test: src/log/dayKey.test.ts > dayKey > rolls over at local midnight
  - Review: why a test cannot cover it, and which task owns it
```

A `Test:` line resolves when the file exists and contains the describe and test names (text
search; no tests run) and the test is not `.skip` or `.todo`. The check fails on a trap with no
row, a row with no coverage line, or a `Test:` line that does not resolve. It skips while no
research specs exist and fails if they exist but the ledger does not.

## acceptance

Reads feature rows `| <ID> | <Feature> | <Tier> | … |` from
`docs/plan/03-feature-inventory.md` (ID: a letter and a number; tier: the first `P0`–`P3` in
the tier cell). Every P0 and P1 feature needs at least one row in
`docs/internals/acceptance-map.md`:

```md
- **ACC-F12-1** A plate photo lists the foods with calories
  - Test: src/log/photo.test.ts > photo logging > lists foods from a photo
```

It fails on a P0/P1 feature without an `ACC-<ID>-<n>` row, a row with no coverage line, or a
`Test:` line that does not resolve or is skipped; `--strict` also fails `Review:` lines. It
skips while the inventory does not exist.
