# Task: release prep (P10-14) · Phase: 10 · Owner: builder (wt-p10s7)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row's "Read in reference" column says none: release notes,
a version number, notices and a gate list have no counterpart in the reference to read. Read
instead: the P10-14 row, "Files to update" and the goal of
`docs/plan/phases/P10-hardening-and-release.md`; `docs/HANDOFF.md` (the Done rows for what each
phase shipped, the follow-ups for Known issues); `docs/plan/16-what-we-change.md` (§2.3–§2.8, only
to point at it); `docs/user/*.md` (what a person can do, in the words we already use);
`docs/internals/{parity-report,security-review,similarity-report,provider-check}-v1.0.md` (the
results to link); `scripts/notices.ts` and its test; `src/features/about/CreditsPage.tsx` (the
shape the generated list must keep); `vite.config.ts` (`__PLATEWISE_VERSION__`, the notices
plugin); `node_modules/zxing-wasm` (its files, its README's licence section, its exports).

What it does (own words): gets the repository ready to be tagged 1.0.0 when the user asks.
- `CHANGELOG.md` at the root: one 1.0.0 entry dated 2026-10-27, grouped by what a person can do,
  then Known issues (the HANDOFF follow-ups still open, said plainly) and a pointer to the page of
  intended differences. It credits the app that inspired Platewise without naming it (the banned
  check runs on the file), by pointing at `THIRD_PARTY_NOTICES.md`, which names it.
- `package.json` version 1.0.0. The About page shows `APP_VERSION`, which `vite.config.ts` reads
  from `package.json`, and `AboutPage.test.tsx` compares it with `package.json`, so it follows.
  New backups record the new version in their `appVersion` field.
- The notices script also writes the "Runtime dependencies" section of `THIRD_PARTY_NOTICES.md`
  (until now a hand-written pointer to `pnpm licenses list`), from the same list it writes to
  `src/generated/notices.json`, and `--check` checks both files.
- Code that zxing-wasm compiles into its WebAssembly under other licences (zxing-cpp, Apache-2.0;
  zint, BSD-3-Clause) is not visible to a walk over `package.json` files. The script gets a small
  hand-written table of such bundled code, pinned to the version of the package it was read from,
  and lists each entry next to the packages, in both outputs.
- `docs/internals/release-checklist-v1.0.md`: one row per gate with the command, the result and
  the date, then the release steps.

Inputs → outputs: the installed production packages and the bundled-code table →
`src/generated/notices.json` (same shape as before, two more rows) and the generated section of
`THIRD_PARTY_NOTICES.md`; gate runs → the checklist; HANDOFF and the plan → the changelog.

Files: created `CHANGELOG.md`, `docs/internals/release-checklist-v1.0.md`, this note. Changed
`package.json` (version only), `scripts/notices.ts`, `scripts/notices.test.ts`,
`THIRD_PARTY_NOTICES.md` (the generated section), `src/generated/notices.json` (regenerated).

Edge cases / failure modes:
- The licence texts of zxing-cpp and zint are not in the installed package (it ships one LICENSE,
  its own MIT text, and its README names the other licences with links); nothing else on this
  machine holds them. No text is invented: the rows carry `text: null`, the Credits page then says
  the package ships no licence text of its own, and the Markdown names where the text lives.
- A newer zxing-wasm may bundle other code or another commit: the table names the version it was
  read from, and the script stops with a setup error (exit 2, and the build fails) when the
  installed version differs, until someone reads the new README and updates the table.
- The table must not depend on zxing-wasm being installed in a test's made-up tree: an entry
  whose carrying package is absent adds nothing.
- The licence check walks `package.json` files only, so the existing test that the notices list
  equals the licence check's list must leave the bundled rows out.
- `THIRD_PARTY_NOTICES.md` is checked by Prettier (only `docs/` is ignored): the generated section
  must be text Prettier leaves alone (plain list items, code spans, `<https://…>` links, no
  tables to align). Its credit section stays hand-written, and `readCredit` still reads it.
- The section is found by its heading and runs to the end of the file; a missing heading is a
  setup error, never a silent append.
- Line ends: the file is read with any line ends and written with `\n`.
- `writeNotices` runs in every build (vite plugin), so a build keeps both files fresh, as it
  already did for the JSON.

Our design differences / decisions:
- The Markdown lists packages (name, version, licence, project page) and points at
  `src/generated/notices.json` and the Credits page for the full texts, instead of copying about
  40 kB of licence texts into the root file; the similarity allow-list's reason for the file
  ("the rest of the file is our own text") stays true.
- The JSON shape is unchanged (`name`, `version`, `license`, `homepage`, `text`): `CreditsPage.tsx`
  types it and is outside this task. A bundled row's `version` is what the carrying package records
  for it: zxing-cpp's commit as `commit 2ecec3f` (zxing-wasm exports the full id as
  `ZXING_CPP_COMMIT`); zint's version is not recorded anywhere in the package, so it is `?`, the
  script's existing mark for a package with no version.
- zint is listed although the app loads only zxing-wasm's reader build, whose WebAssembly holds no
  zint code (no `zint` string in `zxing_reader.wasm`; 36 in the writer and full builds): listing it
  is the conservative reading of "bundled in the package we install". Decision for the lead.
- The licence URLs are the ones the package's README gives (zxing-cpp's at `master`), not URLs
  we built from the commit.
- Unit and e2e counts in the checklist come from the lead's last full loop (this task may not run
  the full suites); the release commit's loop replaces them.

Tests we will write:
- `scripts/notices.test.ts`: bundled code is listed after its carrying package's walk, with no
  text, sorted with the rest; an installed version other than the table's stops the script with a
  NoticesError naming both versions; an absent carrying package adds nothing; the real install
  lists zxing-cpp and zint, and the table's zxing-cpp commit is the one the installed package
  exports; the licence-check comparison leaves the bundled rows out.
- The Markdown: the section is rebuilt from the heading to the end of the file, the credit above it
  is kept byte for byte, `readCredit` still reads the result, Prettier-safe output (no table), a
  file without the heading is refused; bundled rows name the carrying package and the licence URL;
  a missing version reads "version not recorded"; the committed `THIRD_PARTY_NOTICES.md` equals the
  generated one.
- `main`: `--check` reports which of the two files is stale or missing and writes nothing;
  a plain run writes only the files whose bytes change.

Compare checklist (filled after the rewrite; no reference file reopened, none was read):
- [x] Bundled code listed with no text, sorted with the rest (tested in `scripts/notices.test.ts >
  collectNotices > adds the code a package bundles, pinned to the version it was read from, with no
  text`)
- [x] A different installed version of the carrying package is a setup error naming both versions
  (same file, `collectNotices > refuses a carrying package at another version than the table was
  read from`; a mutation that skips the check fails it)
- [x] An absent carrying package adds nothing (same file, `collectNotices > walks dependencies of
  dependencies…`: the default table names zxing-wasm and the made-up tree has none)
- [x] The real install lists zxing-cpp and zint without texts, and the table's commit is the one the
  installed package exports as `ZXING_CPP_COMMIT` (same file, `collectNotices > lists zxing-cpp
  and zint, bundled in zxing-wasm, which ships neither licence text`; a mutation of the commit
  fails it and both committed-file tests)
- [x] The licence-check comparison leaves bundled rows out (same file, `collectNotices > lists
  exactly the production packages the licence check judges, with their licences`)
- [x] One line per notice, bundled rows naming their carrier and licence URL, "version not
  recorded" for `?`, nothing Prettier would realign (same file, `dependencySection > lists every
  notice on one line…`)
- [x] The section is rebuilt from its heading to the end with any line ends, the credit kept,
  `readCredit` still reads it, a file without the heading refused (same file, `dependencySection >
  replaces the file from its heading to the end, keeping the credit above it` and `> refuses a
  file without the heading`)
- [x] The committed `THIRD_PARTY_NOTICES.md` equals the generated one (same file, `the notices file
  > the committed THIRD_PARTY_NOTICES.md matches the installed packages, under the hand-written
  credit`)
- [x] Each file written only when its bytes change (same file, `the notices file > is written only
  when its bytes change, one file at a time`)
- [x] `--check` names each stale or missing file and writes nothing; a missing notices file or
  heading exits 2; the table can be passed in (same file, `main > writes both files, then --check
  finds them up to date`, `> calls a file from other packages stale…`, `> checks the bundled-code
  table it is given`, `> exits 2 when the notices file or its heading is missing`)
- [x] The version follows to About (`src/features/about/AboutPage.test.tsx > shows the mark, the
  name and the version of this build, which is package.json’s`, unchanged, run on 1.0.0); the
  built bundle carries `1.0.0`
- Deliberate differences: none from the reference (no reference behaviour involved).
- Not taken: copying the full licence texts into `THIRD_PARTY_NOTICES.md` (they are in the JSON
  and on the Credits page); fetching the zxing-cpp and zint licence texts from the web (the task
  says not to invent one; the lead can vendor them); changing the backup tests' `appVersion:
  '0.1.0'` fixtures (they stand for a backup made by an older version; restore does not compare
  versions, and no test pins the app's own version).

Decisions for the lead:
- The generated part of `THIRD_PARTY_NOTICES.md` is a list, not the texts (see above).
- zint is listed although the shipped reader build holds no zint code; drop its `BUNDLED_CODE`
  entry if you read "bundled" as "shipped".
- zxing-cpp's version shows as `commit 2ecec3f` and zint's as `?` on the Credits page (the JSON
  shape is unchanged, so there is no field for "bundled in"; the Markdown says it).
- A zxing-wasm upgrade now stops `pnpm build` and the notices script with a setup error until
  `BUNDLED_CODE` is re-read and updated; that is on purpose.
- `vite.config.ts`'s comment on the notices plugin still names only the JSON; the plugin now
  refreshes `THIRD_PARTY_NOTICES.md`'s generated section too (file not touched, outside the task).
- Found while recording the similarity gate: `pnpm check --only similarity --closest 30` now ranks
  `docs/internals/similarity-report-v1.0.md:117` first at 1.08 (no gate fired; the check passes):
  the report's own table row quoting `index.html`'s viewport `<meta>`. The report's "every region
  below 1.00" predates the report file. Not this task's file.

## Status

Done (2026-10-27), uncommitted in `/root/wt/wt-p10s7`. The checklist's rows for
`check:acceptance --strict`, the a11y spec and the browser matrix say "pending P10-07/08/11: the
lead fills this on the release commit", with the lead's numbers from the loop on `6a678e4`
recorded beside them (strict green, a11y 20/20 over two repeats, e2e 47 + 1 skipped by design,
bundle 235.6 kB; WebKit and Firefox not run, manual device rows open). Unit and e2e counts are the
lead's last full loops and are re-run on the release commit. The CHANGELOG's Known issues include
the two moderate a11y findings and the untested engines from the lead's note. Nothing changed
outside the task's files.
