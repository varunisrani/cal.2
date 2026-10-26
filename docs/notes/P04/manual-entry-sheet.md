# Task: Manual entry sheet (P04-11) · Phase: 04 · Owner: builder (wt-p04s5, slice S5)

Read (reference @ `10e14b67`): `I/Views/ManualEntryView.swift` (the form: fields, which are
required, how each is read, the meal default, the single-submission gate, no swipe-away),
`A/ui/home/HomeScreen.kt` lines 3054–3229 (the manual part: the same form on Android, digit
filtering of the energy field, how the optional fibre value is read), `T/ui/home/ManualEntryInputTest.kt`
(blank, decimal-comma, negative and junk fibre). Research spec `02-food-logging.md` §3.8, with
§3.1 (record shape, energy stored in kcal), §3.2 (meal for a time of day) and §3.4 (single
submission, the fasting refusal); traps R02.11, R02.12. Decisions D-16.16 (meal follows the
entry's time), the glossary's "Enter manually" and "Fast in progress". Acceptance id ACC-D2-2.

What it does (own words): a bottom sheet for adding food with no AI. The person types a name
(required; spaces around it are dropped), the energy in their own unit (kcal or kJ; a required
whole number), and optionally protein, carbs and fat in grams (decimals; left empty they count as
0) and fibre (left empty, or negative, it stays unknown rather than 0). The meal starts on the meal
the meal times give for the entry's time and can be changed. Save logs the entry straight into the
diary (no review): at the viewed day's stamp (today: now), source manual, energy converted to kcal,
no serving data and no photo, through the diary service. Save is off until the form is complete and
busy while the save runs, so a double tap writes one entry (R02.11). If a fast is running the
service refuses (R02.12): the sheet stays open and a short message says logging waits for the fast
(the paused dialog with "End fast and log" is P07). The sheet cannot be closed by Escape, the scrim
or a pull: only Cancel and Save close it (and the browser's Back, which closes the top sheet).

Inputs → outputs: `open`, `onClose`, `dayKey` (the viewed day) → `useServices().diary.logEntry(draft,
{loggedAt, meal, source: 'manual'})`; the energy unit and meal times from `useSettings`; now from
the services' clock.

Files: created `src/features/log/ManualSheet.tsx`, `ManualSheet.test.tsx`,
`src/features/log/log.module.css`, `src/features/log/meals.ts` (meal name keys, shared with the
diary), `src/i18n/en/log.ts` (also holds the meal names Home uses).

Edge cases / failure modes:
- Name of spaces only → Save stays off.
- Energy "250.5", "-5", "abc" → an error line ("a whole number") and Save off; "2,093" in en-US
  reads 2 093 (the energy reader knows grouping); "0" is allowed.
- 2 093 kJ → 500 kcal (whole kcal, the energy rules' rounding) (ACC-D2-2).
- Macro text that does not read as a number, or a negative macro → an error line and Save off
  (a negative would make the stored entry unreadable; see "decisions").
- Fibre: blank or negative → unknown; "7,5" → 7.5; text that does not read → error, Save off.
- A second Save while the first runs → ignored (busy button plus our own in-flight flag, plus the
  service's gate).
- The service answers `fastActive` → message, nothing written, sheet stays; `ignored` → nothing;
  a storage failure → "didn't save" message, sheet stays, Save works again.
- Settings not read yet → the sheet shows its title and Cancel only, then the form.

Our design differences / decisions:
- The form is our own layout: Cancel at the start of the title row, Save at its end (stays in view
  above a phone keyboard), fields in a two-column grid for the macros, the meal as a row that opens
  the list picker (a routed sheet, so Back closes the picker first). Enter in any field saves when
  the form is complete.
- Text that cannot be read in a macro or fibre field blocks Save with an error, instead of being
  saved silently as 0 or unknown (the reference filters keystrokes; a web field cannot rely on the
  keyboard). Negative macros are refused the same way. Recorded for the lead.
- The meal list offers all five meals, Other included, as the reference does.
- No success toast: the sheet closes and the entry appears in its meal section.

Tests we will write (`ManualSheet.test.tsx`, real settings over a test database, fake diary
service):
- blank name blocks Save; a name of spaces too.
- 2 093 kJ saves 500 kcal (ACC-D2-2); 250 kcal saves 250.
- blank protein, carbs and fat save 0; "12,5" protein saves 12.5.
- fibre −1 saves unknown; blank saves unknown; 4.5 saves 4.5.
- meal defaults to lunch at 12:30 and dinner at 19:00; picking Breakfast logs breakfast.
- double tap saves once (R02.11).
- logs at the viewed day's stamp with source manual, no photos, servings basis.
- fastActive keeps the sheet open with the message; a failed save shows the error.
- Escape and the scrim do nothing; Cancel closes without logging.
- energy "250.5" shows the whole-number error.

Compare checklist (filled after the rewrite; reopened `ManualEntryView.swift`, `HomeScreen.kt`
3054–3229, `ManualEntryInputTest.kt`):
- [x] Save only with a non-blank name and a whole energy; the name is trimmed
      (`ManualSheet.test.tsx > ManualSheet > keeps Save off until there is a name and a whole
      energy`, `> logs the trimmed name and energy at now, as a manual entry with no serving data or
      photo`)
- [x] Energy typed in the person's unit and stored in kcal (`> saves 2 093 kJ as 500 kcal
      (ACC-D2-2)`); a decimal or junk energy refused (`> refuses an energy that is not a whole
      number, and a macro that is not a number`)
- [x] Protein, carbs and fat optional decimals, blank → 0, a decimal comma read (`> saves blank
      protein, carbs and fat as 0 and reads a decimal comma`)
- [x] Fibre optional: blank or negative → unknown, "7,5"-style decimals read (`> saves fibre "" as
      {} (blank or negative is unknown)`, `> saves fibre "-1" as {} …`, `> saves fibre "4.5" as
      {"fibre":4.5} …`, `> saves fibre "0" as {"fibre":0} …`)
- [x] Meal defaults to the meal for the entry's time; all five meals offered (`> defaults the meal
      to lunch at 12:30 and to dinner at 19:00`, `> logs the meal picked from the list`)
- [x] Logged at the viewed day's stamp, source manual, no serving data, no photo (`> logs the
      trimmed name and energy at now, as a manual entry with no serving data or photo`, `> logs on
      another day at the current clock time`)
- [x] One save per tap burst (R02.11) (`> saves once for a double tap (R02.11)`); a running fast
      writes nothing and keeps the sheet (`> stays open with a short message while a fast is
      running`); a storage failure keeps the sheet and what was typed (`> stays open and says so when
      the save fails`)
- [x] Not dismissable by swipe, scrim or Escape; Cancel closes without logging (`> closes only
      through Cancel or Save: Escape and the scrim do nothing`)
- [x] Words in the `log` partition, lint-clean merged with the rest (`> the home, log and settings
      partitions > pass the catalogue lint merged with the other partitions`); hooks and focus (`>
      opens with the name field focused and every control hooked for tests`)
- Deliberate differences: unreadable macro or fibre text and negative macros block Save with an
  error line instead of saving 0 or unknown (a web field cannot rely on a digits-only keyboard; a
  negative macro would make the stored entry unreadable); Save sits in the sheet's title row; the
  meal is a row opening the list picker, a routed sheet so Back closes it first; the fasting
  answer is a short message until P07's dialog.
- Not taken: the reference's 340 × 460 floating card (we use our bottom sheet); the iOS keyboard
  Done key (Enter saves instead).

## Decisions for the lead

- Unreadable macro or fibre text and negative macros block Save with an error line (see above).

## Status

Done (2026-10-26). The sheet, its tests and the `log` partition are in. Handed on: the paused
dialog with "End fast and log" (P07-07, D-16.35).
