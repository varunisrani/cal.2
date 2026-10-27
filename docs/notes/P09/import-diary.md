# Task: import diary (P09-11) · Phase: 09 · Owner: builder (wt-p09s10, slice S3a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/export/DiaryImporter.kt` (all: the document shape, the checks,
the replace-range merge, water), `I/Services/DiaryImporter.swift` (the same plus the size limit,
the DST round trip for water times, duplicate stored ids, what a match keeps),
`A/ui/settings/ImportDiarySheet.kt` (preview rows, the two actions, dismissal blocked while
importing) and the two callers (`SettingsScreen.kt` import launcher and apply, `ImportDiaryView`
load and apply); tests `T/export/DiaryImporterTest.kt`, `IT/DiaryImporterTests.swift` (round trip
keeps the photo, legacy food-only file keeps water, add mode mints ids). Research spec
`06-settings-data.md` §3.14, traps R06.16 and R06.2 (merge inside the write), R06.18 (photo
cleanup), D-16.2. Acceptance ACC-K2-1, ACC-K2-2.

What it does (own words): Settings › Your data › Import diary opens a sheet where the person picks
a diary file this app exported. A file over 20 MiB is refused before it is read. The whole file is
checked before anything changes; one bad value anywhere (a negative number, an unknown meal, a
time that does not exist on that day because the clocks went forward, another app's format)
refuses the whole file with a message saying what is wrong, and the diary stays as it was. A good
file shows a preview: how many foods and water logs, and which dates. "Replace these dates" makes
those dates look like the file: an entry already on those dates that matches a food in the file
keeps its id and photos and takes the file's values; entries on those dates that match nothing
are removed; other dates are not touched. "Add as new" keeps the diary and adds every food and
water log of the file as new ones. Water is changed only when the file has water lists, so an
older food-only file never erases water. All of one import is one transaction (the merge is
computed inside it), and photos no entry uses any more are cleaned up afterwards. While the import
runs the sheet cannot be closed.

Inputs → outputs:
- `src/services/transfer/importDiary.ts`: `MAX_IMPORT_BYTES` (20 MiB);
  `readDiaryFile(text)` → `{ok: true, file}` | `{ok: false, problem}` (pure, every check);
  `previewOf(file)` → counts and range; `planImport(file, mode, stored, newId)` → what to write
  (pure merge); `importDiary(deps, file, mode)` → `{food, water}` counts.
- `src/services/transfer/transfer.ts`: `readImport(blob)` (size first, then the text, then the
  checks) and `importDiary(file, mode)`.
- `src/data/repos/transferRepo.ts`: `rewriteDays(first, last, plan)`: one read-write transaction
  over entries, water and the guard tables; `plan` sees the stored entries and water logs of those
  days and every id stored elsewhere, and returns what to put and delete; the repository refuses
  any write outside the days; returns the photo ids the write dropped.
- `src/features/settings/data/ImportSheet.tsx`: props `open`, `onClose`.

Files: created `importDiary.ts` (+ test), `ImportSheet.tsx` (+ test); `transferRepo.ts`,
`transfer.ts`, the CSS and the `transfer` partition are shared with P09-10; this note.

Edge cases / failure modes:
- Not JSON, not an object, another format id, no `days` list → "not a Platewise diary". Version
  with a major other than 1 (or not a version) → "made by a newer version".
- Range dates or a day date that is not a real date, or a day outside the range → refused. A range
  written end first is swapped.
- Unknown meal; blank name; any number missing where required, not finite or below 0 (also
  nutrients, extras, lines and water); a time that is not `HH:mm`; a time that does not exist on
  that day (02:30 on the spring-forward day); an id that is not a UUID; a water log of 0 ml or
  without a UUID id → refused, naming the day and the food where it can.
- Nothing to import (no food and no water) → refused.
- Unknown keys anywhere are ignored, so a later 1.x file still reads.
- Ids are compared in lower case. Two items in one file with the same id: the second gets a new
  one (no crash); the same for water.
- An id a file item brings that an entry outside the dates already uses → a new id. An id an
  unreadable stored row holds → a new id too, and the unreadable row is left as it is.
- A matched entry keeps id, photos, product details, emoji, serving units; it takes name, values,
  nutrients, extras, time, meal, note, parts and weight from the file; its unit choice is kept only
  when the weight did not change. Parts keep their photos when the stored entry had a part of the
  same name. Source: `manual` from the file → manual; `ai` keeps the stored source unless it was
  manual (then text); an unmatched `ai` item → text.
- The write fails (storage) → nothing changed; the sheet says so and the person may try again.
- The photo cleanup fails → logged, the import still counts as done.

Our design differences / decisions:
- Our format only (D-16.2); the format id must match exactly.
- Matching runs in two passes: every item first by id, then the rest by (day, minute, meal,
  trimmed lower-case name with inner spaces collapsed). The reference does both in one pass in file
  order, where an earlier item's key match can take the entry a later item names by id.
- The merge runs inside the write's transaction (R06.2), through `transferRepo.rewriteDays`.
- Photo cleanup releases the photos the import dropped (`photoRepo.releaseIfUnused`), not a full
  sweep.
- A running fast does not refuse an import: an import restores history, it does not log a meal now
  (R05.1 covers logging). Noted for the lead.
- Success: the sheet closes and a toast says how many foods and water logs came in.
- Water times are checked like food times (the DST gap refused for both).

Tests we will write:
- `importDiary.test.ts`: round trip of our own export reads back every value; refusals (each with
  nothing written when applied through the service): negative value (ACC-K2-1), another format id,
  version 2, bad date, day outside range, unknown meal, blank name, not-a-UUID id, water 0 ml,
  water without id, 02:30 on 2026-03-08 in New York (R06.16), not JSON, empty file; size limit;
  replace keeps a matched entry's photos and id and takes the file's values (ACC-K2-2), matches by
  key when the id differs, each stored entry matched once, unmatched in-range entries removed and
  their photos cleaned up, other dates untouched, an id used outside the range gets a new id, a
  duplicate id in the file does not crash; add-as-new doubles the count with new ids; a food-only
  file leaves water untouched; replace replaces in-range water and keeps other days'.
- `transferRepo.test.ts`: `rewriteDays` refuses a write outside the days and changes nothing;
  the plan sees taken ids; returns the dropped photo ids.
- `ImportSheet.test.tsx`: choose a file → preview with counts and dates; a bad file → the message
  and nothing changed; a file over 20 MiB refused before reading; Replace and Add as new import and
  close with a toast; while importing the sheet cannot be closed (Escape, scrim, Done).

Compare checklist (filled after the rewrite; reopened `A/export/DiaryImporter.kt`,
`I/Services/DiaryImporter.swift`, `A/ui/settings/ImportDiarySheet.kt`, the two callers and both
test files):
- [x] Over 20 MiB refused before reading (`src/services/transfer/importDiary.test.ts >
  readPickedFile > refuses a file over 20 MiB without reading it`;
  `src/features/settings/data/ImportSheet.test.tsx > ImportSheet > refuses a file over 20 MiB
  before reading it`)
- [x] The whole file checked first; one bad value refuses all and nothing changes (ACC-K2-1,
  R06.16) (`importDiary.test.ts > readDiaryFile > refuses the whole file for %s (R06.16)` (25
  cases: negative, not a number, missing, nutrient, extra, part, blank name, id, note, meal, time,
  dates, range, water 0 ml, water without id, water time, another format id, not JSON, version,
  empty); `importDiary.test.ts > importing into the diary (the transfer service) > changes nothing
  when one value of the file is invalid (ACC-K2-1)`; `ImportSheet.test.tsx > ImportSheet > refuses
  a file with one invalid value, says why, and changes nothing (ACC-K2-1)`, `> refuses another
  app's file`)
- [x] A time the clocks skip is refused, food and water (R06.16) (`importDiary.test.ts >
  readDiaryFile > refuses 02:30 on the spring-forward day, food or water, and takes 03:30
  (R06.16)`)
- [x] Our own export reads back; any 1.x; meal case; range end first; ids optional, lower case
  (`importDiary.test.ts > readDiaryFile > reads our own export back, every value`, `> takes any
  1.x version, a meal in capitals, a range given end first and no ids`, `> reads ids in lower
  case`)
- [x] Preview: food and water counts and the range (`importDiary.test.ts > previewOf > counts the
  foods and water logs and gives the range`; `ImportSheet.test.tsx > ImportSheet > shows how many
  foods and water logs a picked file holds and its days`)
- [x] Replace: a match keeps id and photos (and product, emoji, source kind) and takes the file's
  values (ACC-K2-2, R06.16) (`importDiary.test.ts > importing into the diary (the transfer service)
  > keeps a matched entry's id and photos and takes the file's values (ACC-K2-2, R06.16)`;
  `ImportSheet.test.tsx > ImportSheet > replaces the dates, keeps a matched entry's photos, then
  closes and says so (ACC-K2-2)`)
- [x] Matching: by id first for every food, then by day, minute, meal and normalised name; each
  stored entry once; a file id repeated gets a new id (`importDiary.test.ts > planImport > matches
  every food by id before any by key, each stored entry once`, `> matches by day, minute, meal and
  a name in other case and spacing`, `> gives a second food with the same id a new one, without
  trouble`; `> importing into the diary (the transfer service) > matches by day, minute, meal and
  name when the file brings another id`, `> matches each stored entry once; a second food with the
  same key is added`)
- [x] Unmatched entries on those dates removed, their photos cleaned up, other dates untouched
  (`importing into the diary (the transfer service) > removes what matches nothing on those dates,
  cleans up its photos and leaves other dates alone`)
- [x] An id used outside the dates → a new id (R06.16) (`importing into the diary (the transfer
  service) > gives a food a new id when an entry on another date already has it (R06.16)`)
- [x] Add as new mints every id and doubles the day (R06.16) (`importing into the diary (the
  transfer service) > adds every food and water log as new with Add as new, doubling the day
  (R06.16)`; `ImportSheet.test.tsx > ImportSheet > adds every food and water log as new with Add
  as new`)
- [x] Water only when the file has water lists; replace swaps the dates' water and keeps other
  days' (R06.16) (`importing into the diary (the transfer service) > leaves water alone for a
  food-only file (R06.16)`, `> replaces the dates' water with the file's and keeps other dates'
  water`)
- [x] Sources: `manual` → manual, `ai` → text for new foods (`> files a new estimated food as text
  and a manual one as manual`); unit choice and part photos (`> keeps the unit choice while the
  weight is the same, and part photos by name`)
- [x] One transaction, merge inside it, nothing outside the days changed
  (`src/data/repos/transferRepo.test.ts > rewriteDays > shows the plan the days and every id used
  elsewhere, then stores its write`, `> refuses %s and changes nothing` (6 cases), `> releases the
  photos a replaced entry no longer names, its parts' included`)
- [x] The sheet cannot be closed while importing; a failed import says so and may be retried
  (`ImportSheet.test.tsx > ImportSheet > cannot be closed while the import runs`, `> says so when
  the import fails, and the file can be imported again`)
- Mutation checks: matching by key without the id pass fails `planImport > matches every food by
  id before any by key, each stored entry once`; touching water for a food-only file fails
  `> leaves water alone for a food-only file (R06.16)`.
- Deliberate differences: our format only, the id compared exactly (D-16.2); two matching passes
  (id for every food, then key) instead of one pass in file order; an invalid id refuses the file
  on both counts (one reference platform swaps it for a new id silently); water times checked for
  the DST gap like food times; a matched entry keeps its unit choice only while its weight is the
  same and keeps part photos by part name; photo cleanup releases the dropped photos rather than
  sweeping; the merge runs inside the write (R06.2); success closes the sheet with a toast giving
  foods and water logs separately; a failed write keeps the preview with a message.
- Not taken: duplicate stored ids (IndexedDB keys are unique, so it cannot happen here; duplicates
  inside a file are handled); the health-store side effects (later phase).

## Decisions for the lead

- A running fast does not refuse an import (it restores history; R05.1 is about logging food).
  Easy to change: `rewriteDays` can read the fasts in its transaction if the lead wants the same
  refusal as the diary's writes.
- `transferRepo.rewriteDays` (new file, see the export note) is the one-transaction write; it
  leaves unreadable rows on those days alone and treats their ids as taken.
- An invalid value names where it was in the message (`{detail}`: the food and its date, the date,
  the meal, or the date and time); the copy is in `transfer.import.problem.*`.
- Data-ui: `importDiary`, `.choose`, `.file`, `.reading`, `.problem`, `.preview`, `.foods`,
  `.water`, `.days`, `.replace`, `.add`, `.failed`.
- Ledger lines: R06.16 → the R06.16-tagged tests above; ACC-K2-1 → `importDiary.test.ts >
  importing into the diary (the transfer service) > changes nothing when one value of the file is
  invalid (ACC-K2-1)` and `ImportSheet.test.tsx > ImportSheet > refuses a file with one invalid
  value, says why, and changes nothing (ACC-K2-1)`; ACC-K2-2 → `importDiary.test.ts > importing
  into the diary (the transfer service) > keeps a matched entry's id and photos and takes the
  file's values (ACC-K2-2, R06.16)` and `ImportSheet.test.tsx > ImportSheet > replaces the dates,
  keeps a matched entry's photos, then closes and says so (ACC-K2-2)`.

## Status

Done (2026-10-27). Created `src/services/transfer/importDiary.ts` (+ test),
`src/features/settings/data/ImportSheet.tsx` (+ test), this note; shares `transferRepo.ts`,
`transfer.ts`, `data.module.css` and the `transfer` partition with P09-10. Handed on: mounting
the sheet on the Your data page (P09-15).
