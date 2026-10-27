# Task: export diary (P09-10) · Phase: 09 · Owner: builder (wt-p09s10, slice S3a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/export/DiaryExporter.kt` (all: formats, ranges, the per-day
document, the Markdown and CSV writers, quoting), `I/Services/DiaryExporter.swift` (the same on
the other platform: day loop, week from the locale calendar, items newest first),
`A/ui/settings/ExportDiarySheet.kt` (range and format chips, custom From/To, error under the
button, share sheet); tests `T/export/DiaryExporterTest.kt` and `IT/DiaryExporterTests.swift`
(kcal for kJ readers, the CSV header, water-only days, every nutrient present). Research spec
`06-settings-data.md` §3.13, traps R06.14 and R06.17, D-16.2 (our own format, not compatible).
Acceptance ACC-K1-2 (and ACC-K1-1 is P09-19's e2e).

What it does (own words): Settings › Your data › Export diary opens a sheet where the person picks
which days (Today, This week, This month, All time, Custom From/To) and a file kind (JSON,
Markdown, CSV), then taps Export. The days with any food or water in that span become one file,
which goes to the browser's share sheet when it can share files, else downloads. The file always
holds kcal, never kJ, so two exports compare and an import never converts twice; a kJ reader's
Markdown says so in one line and the CSV's energy column names kcal. "This week" begins on the
app's own week start (Monday or Sunday), not a fixed Monday (R06.17). When nothing is logged in
the chosen days the sheet says so and makes no file. The JSON is our own format (D-16.2) and is
exactly what the import (P09-11) reads back.

Inputs → outputs:
- `src/services/transfer/exportDiary.ts`: `resolveRange(choice, today, weekStart, firstDay)` →
  `{start, end}` (pure); `buildDays(entries, water, targets)` → the per-day records; `toJson`;
  `diaryFileName(range, format)`; `createDiaryExport({entries, water, range, targets, format,
  energyUnit})` → `{name, type, text}` or null when no day has food or water; `deliverFile(file,
  browser)` → `shared | downloaded | cancelled`.
- `src/services/transfer/exportFormats.ts`: `toMarkdown(doc, energyUnit)` and `toCsv(doc)`
  (+ `csvField`, the RFC 4180 quoting).
- `src/services/transfer/transfer.ts`: the `TransferService` screens call (`exportDiary`,
  `deliver`, and the import's calls), which loads the modules above on first use.
- `src/data/repos/transferRepo.ts`: `read(first, last)` → entries and water logs of those days in
  one read; `firstDay()` → the earliest day with food or water (for All time).
- `src/features/settings/data/ExportSheet.tsx`: props `open`, `onClose`.

Files: created the five above (+ tests), `src/features/settings/data/data.module.css`,
`src/i18n/en/transfer.ts`, this note. Shared, additive: `transfer` in `Services`
(`src/services/context.tsx`), its wiring in `src/main.tsx`, one line in `src/i18n/en.ts`.

Edge cases / failure modes:
- Nothing in the days → `empty`: the sheet shows the message, no file, nothing shared.
- A water-only day is a day of the file (food totals 0, its water listed).
- Custom From after To → the two are swapped. All time with an empty diary → today..today, which
  is then empty.
- No profile, or an unreadable one → targets 0 (left is then 0 too).
- Left is never below 0 (eaten more than the target → 0).
- A name with a comma, a quote or a line break → quoted in the CSV, quotes doubled; a `|` in a
  Markdown cell is escaped so the table keeps its columns; a line break in a cell becomes a space.
- Sharing refused because the browser cannot share that kind of file (`canShare` false), or the
  share fails for a reason other than the person closing it → download instead. The person closing
  the share sheet → nothing else happens and the sheet stays open.
- The All-time read on a big diary: one indexed range read, no per-day loop over the database.

Our design differences / decisions:
- Our own JSON (D-16.2): `{format: 'platewise-diary', version: '1.0', range: {start, end}, days}`;
  a day is `{date, totals, targets, left, meals: [{meal, items}], water: [{id, time, ml}],
  waterTotalMl}`; totals/targets/left are `{kcal, protein, carbs, fat}`. An item is `{id, name,
  grams?, kcal, protein, carbs, fat, nutrients, extras, time, source, note?, lines}`; nutrient and
  extra keys carry their unit (`fibreG`, `sodiumMg`, `vitaminB12Mcg`, `creatineG`); absent values
  are left out (never null, never 0). Sources: `manual` for manual entries, `ai` for every other
  source. Lines are `{name, grams, kcal, protein, carbs, fat}`.
- Rounding: kcal whole; grams, macros and nutrients to 1 decimal; extras to 3 decimals (they are
  grams of small compounds, where 1 decimal would turn 11 mg into 0).
- Order: meals in the fixed order (breakfast, lunch, dinner, snack, other), items oldest first
  inside a meal, water oldest first.
- CSV: our own columns, one header for every row kind: `date, time, kind, meal, name, grams,
  energy_kcal, protein_g, carbs_g, fat_g`, the 23 nutrients and 8 extras as `<name>_<unit>`,
  `source, note, parts, water_ml, day_water_ml`. Kinds are `food`, `water` (one row per log) and
  `day_water` (one per day, always, also 0). The energy header is `energy_kcal` for everyone, so a
  kJ reader's header names kcal (R06.14) and no reader is told something that differs by setting.
- Markdown: our own layout and words from the catalogue: a title, the days, a line that it was
  made with Platewise, the kcal line for kJ readers; per day a short list of eaten vs target for
  energy and the three macros, water (total and the logs with times); then one table per meal
  with time, food, weight, kcal, the macros, the other nutrients in one cell ("Fibre 3.3 g ·
  Sodium 820 mg"), parts, source and note. The reference's 32-column table is not copied.
- File name `platewise-diary-<start>_to_<end>.<ext>` (`json`, `md`, `csv`); types
  `application/json`, `text/markdown`, `text/csv`.
- Delivery: Web Share Level 2 with a file when `navigator.canShare({files})` says yes, else a
  download through an object URL (revoked later). The reference only shares.
- The sheet's Custom From/To are native date fields (max today); default today−7 … today.
- Targets: the targets in effect (`useTargets`), read by the sheet and passed to the service, the
  same numbers Home shows.

Tests we will write:
- `exportDiary.test.ts`: This week with a Sunday start begins on Sunday and with a Monday start on
  Monday (R06.17); Today, This month, All time (earliest food or water day; empty → today),
  Custom swapped; a water-only day is included and a day with nothing is not; nothing → null and
  no file; JSON shape: format, version, range, days in order, meals in the fixed order, items
  oldest first, every nutrient with its unit key, extras, lines, note, source `manual`/`ai`,
  numbers rounded, left ≥ 0, targets 0 without a profile; a kJ reader's JSON still holds kcal
  (R06.14); file names; `deliverFile` shares when possible, downloads when it cannot, stays quiet
  when the share is closed, downloads when the share fails otherwise.
- `exportFormats.test.ts`: CSV header (one), `energy_kcal`, food rows, a row per water log and one
  day-water row per day (also 0), every row the header's width, a name with a comma and a quote
  quoted (RFC 4180), a line break quoted; Markdown title, days, kJ line only for kJ readers
  (R06.14), totals vs targets, water, one table per meal, `|` escaped.
- `transferRepo.test.ts`: `read` returns both kinds for the days asked only; `firstDay`.
- `ExportSheet.test.tsx`: defaults This week + JSON; nothing logged → the message and no file;
  export JSON shares a file named for the week; CSV for a kJ reader holds kcal (ACC-K1-2);
  Custom shows From/To and exports those days; download when sharing is not possible.

Compare checklist (filled after the rewrite; reopened `A/export/DiaryExporter.kt`,
`I/Services/DiaryExporter.swift`, `A/ui/settings/ExportDiarySheet.kt` and both test files):
- [x] Ranges Today, This week, This month, All time (earliest food or water day, today when
  none), Custom swapped when reversed (`src/services/transfer/exportDiary.test.ts > resolveRange >
  covers today alone, and this month from its first day`, `> runs All time from the earliest day
  with food or water, or today when there is none`, `> swaps a custom pair given end first`;
  `exportDiary.test.ts > exporting from the diary (the transfer service) > starts All time on the
  first day with water when water came first`)
- [x] This week from the app's week start, Sunday start → Sunday (R06.17) (`exportDiary.test.ts >
  resolveRange > starts This week on the app week start: Sunday for a Sunday start (R06.17)`;
  `> exporting from the diary (the transfer service) > exports This week from a Sunday start with
  a water-only day (R06.17)`; `src/features/settings/data/ExportSheet.test.tsx > ExportSheet >
  shares this week from a Sunday week start, with a water-only day, and closes (R06.17)`)
- [x] Days with food or water only; a water-only day included; outside the range left out
  (`exportDiary.test.ts > buildDocument > writes our own format: id, version, range and the days
  with food or water only`, `> leaves out what falls outside the range`)
- [x] Nothing in the range → empty, no file (`exportDiary.test.ts > exporting from the diary (the
  transfer service) > says empty, and makes no file, when no day of the range has food or water`;
  `ExportSheet.test.tsx > ExportSheet > says there is nothing to export and makes no file when the
  days are empty`)
- [x] Our JSON shape, every nutrient with its unit key, extras at milligram precision, parts,
  note, source, numbers rounded, kcal whole (`exportDiary.test.ts > buildDocument > writes every
  value of an item: nutrients and extras keyed with their unit, parts, note`, `> leaves out what
  is unknown: no weight for a servings basis, no blank note, no nutrient`, `> round-trips through
  JSON text unchanged`)
- [x] Meals in the fixed order, items oldest first (`buildDocument > lists meals in the fixed
  order and each meal oldest first`)
- [x] Totals, targets (0 without a profile), left never below 0 (`buildDocument > adds up the
  day, compares it with the targets and never leaves less than 0`, `> writes targets of 0 without
  a profile`)
- [x] kcal always; kJ readers: Markdown line, CSV header in kcal, values unchanged (R06.14,
  ACC-K1-2) (`exportDiary.test.ts > exporting from the diary (the transfer service) > keeps kcal
  in a kJ reader's file (R06.14, ACC-K1-2)`; `src/services/transfer/exportFormats.test.ts > toCsv >
  is the same for a kJ reader: the header names kcal and values stay kcal (R06.14, ACC-K1-2)`;
  `exportFormats.test.ts > toMarkdown > tells a kJ reader the energy is in kcal and keeps the kcal
  numbers (R06.14, ACC-K1-2)`; `ExportSheet.test.tsx > ExportSheet > keeps kcal in a kJ reader's
  CSV and names the column in kcal (R06.14, ACC-K1-2)`)
- [x] CSV: one header, food rows, a row per water log, a water total per day (0 included), every
  row the header's width, RFC 4180 quoting (`exportFormats.test.ts > csvField > quotes a field with
  a comma, a quote or a line break and doubles its quotes (RFC 4180)`, `> toCsv > has one header
  with the energy column named in kcal, then rows of its width`, `> writes food rows, a row per
  water log and one water total per day, 0 included`, `> quotes a name with a comma and a quote,
  and a note with a line break, so they read back`)
- [x] Markdown: title, days, where from, totals vs targets, water, a table per meal, `|` escaped
  (`exportFormats.test.ts > toMarkdown > has a title, the days and where it came from, and no kcal
  line for a kcal reader`, `> gives each day its totals against the targets, its water and a table
  per meal`, `> escapes a bar in a name so the row keeps its columns`; `> markdownCell > escapes the
  column bar and backslashes and keeps a cell on one line`)
- [x] File names and media types (`exportDiary.test.ts > diaryFileName > names the file after its
  days and format`; `exportFormats.test.ts > diaryFile > names and types each format`)
- [x] Share sheet with a file when possible, else download; closing the share changes nothing
  (`exportDiary.test.ts > handOver > *` (4 tests); `ExportSheet.test.tsx > ExportSheet > downloads
  when the browser cannot share the file, and says so`, `> stays open when the person closes the
  share sheet`)
- [x] Sheet: chips with defaults This week and JSON, Custom From/To (today−7 … today)
  (`ExportSheet.test.tsx > ExportSheet > opens on This week and JSON, with the five ranges and
  three formats`, `> exports the Custom days picked in From and To`)
- Mutation check: the week from a fixed Monday fails the three R06.17 tests.
- Deliberate differences: our own format (D-16.2) with unit-keyed nutrient names and `manual`/
  `ai` sources; extras at milligram precision instead of a separate amino-acid rule; CSV columns
  of our own (`kind` food / water / day_water, `energy_kcal` for every reader, no "Water" name on
  water rows); Markdown of our own (nutrients in one cell instead of 23 columns, water logs on one
  line, `|` escaped rather than replaced by `/`, dates as long day names); weight to 1 decimal
  everywhere; CRLF line ends in the CSV (RFC 4180); a download when the browser cannot share; the
  sheet stays open when the share sheet is closed; a short hint per format.
- Not taken: the reference's 32-column Markdown table; its share-only hand-over; the iOS
  newest-first item order and locale week.

## Decisions for the lead

- The catalogue partition is `src/i18n/en/transfer.ts` (as the task says), not the phase file's
  `data.ts`; P09-15 may add its own `data` partition for the Your data page.
- New repository file `src/data/repos/transferRepo.ts` (+ tests): `read(first, last)` and
  `firstDay()` for the export (the water repository has no range read, and All time needs the
  earliest food or water day), and `rewriteDays` for the import. Shared, additive: `toRow` in
  `src/data/repos/diaryRepo.ts` is now exported (one word) so the new repository stores entries
  exactly as the diary does.
- `TransferService` lives in `src/services/transfer/transfer.ts`; it loads exportDiary,
  exportFormats and importDiary on first use (each its own chunk: 1.82, 1.72, 2.73 kB gzip).
  Initial JS after this slice: 215.47 kB gzip (the partition is in the start-up catalogue).
- CSV energy header `energy_kcal` for every reader (R06.14 is met for kJ readers; nothing in the
  file differs by setting).
- Markdown words come from the catalogue (`transfer.markdown.*`, meal and nutrient names from
  `log.meal.*` and `review.*`); CSV headers and JSON keys are fixed ids, not copy.
- The sheets are components with `open`/`onClose`; nothing mounts them yet (P09-15). Data-ui:
  `exportDiary`, `.range.<range>`, `.format.<format>`, `.from`, `.to`, `.formatHint`, `.export`,
  `.empty`, `.failed`.
- Ledger lines: R06.14 → the four kJ tests above; R06.17 → the three week tests above; ACC-K1-2 →
  `ExportSheet.test.tsx > ExportSheet > keeps kcal in a kJ reader's CSV and names the column in
  kcal (R06.14, ACC-K1-2)` and the three service/format tests tagged ACC-K1-2.

## Status

Done (2026-10-27). Created `src/services/transfer/{exportDiary,exportFormats,transfer}.ts`
(+ tests), `src/data/repos/transferRepo.ts` (+ test), `src/features/settings/data/ExportSheet.tsx`
(+ test), `src/features/settings/data/data.module.css`, `src/i18n/en/transfer.ts`, this note.
Shared, additive: `transfer` in `Services` (`src/services/context.tsx`) and its wiring in
`src/main.tsx`; `transfer` registered in `src/i18n/en.ts`; `export` on `toRow` in
`src/data/repos/diaryRepo.ts`. Handed on: mounting the sheet on the Your data page (P09-15), the
CSV e2e (P09-19).
