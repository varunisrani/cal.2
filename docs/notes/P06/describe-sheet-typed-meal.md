# Task: describe sheet, typed meal (P06-05) · Phase: 06 · Owner: builder (wt-p06s1b, slice S1b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `I/Views/TextFoodInputView.swift` (all: the field, the rotating
examples, the Analyze rule, Cancel). Research spec `02-food-logging.md` §3.11. Acceptance: no id
of its own (ACC-D6-1 is the e2e of P06-20); the sheet feeds the text analysis of P06-04.

What it does (own words): a sheet where the person types what they ate. The field takes a few
lines (it starts at three and grows to five, then scrolls) and has focus as soon as the sheet
opens. While it is empty its placeholder shows one of four example meals, changing every two
seconds, so the person sees the kind of detail that helps; once they type, the examples stop
moving (they start again if the field is emptied). Analyse is enabled only when the text holds
something other than spaces and line breaks; it starts a text analysis with the trimmed text and
closes the sheet (the analysis overlay takes over). Cancel closes it.

Inputs → outputs: props `open`, `onClose()` → `analysis.start('text', {text: trimmed})`, then
`onClose()`.

Files: created `src/features/log/DescribeSheet.tsx`, `src/features/log/DescribeSheet.test.tsx`
(styles in `src/features/log/analysis.module.css`), words in `src/i18n/en/capture.ts`, this note.

Edge cases / failure modes:
- Spaces, tabs and line breaks only: Analyse stays off.
- Text with spaces around it: sent trimmed.
- Typing stops the rotation; clearing the field starts it again from where it was.
- The sheet closes only through its buttons (Escape and the scrim do nothing), so a long
  description is not lost by a stray tap.
- Each opening starts empty (the text is not kept after Cancel).

Our design differences / decisions:
- Names and the four examples are ours.
- Whitespace includes line breaks (the reference only trims spaces), and the text is sent trimmed.
- A bottom sheet with a labelled field instead of a small centred card; Analyse sits in the sheet's
  title row like the capture sheet's.
- The placeholder change is not animated (a plain swap); nothing moves under reduced motion.

Tests we will write:
- `DescribeSheet.test.tsx` (a stand-in analysis service, fake timers): the field has focus on
  open; the placeholder changes after 2 s and cycles through four; it stops once typing starts and
  starts again when the field is emptied; whitespace-only keeps Analyse disabled; Analyse calls
  the service with the trimmed text and closes; Cancel closes without starting; the field is
  multi-line (3 rows); copy from the catalogue.

Compare checklist (filled after the rewrite; reopened `TextFoodInputView.swift`):
- [x] Multi-line field focused on open (the reference grows 2–5 lines; ours 3–5 as the spec says)
  (`src/features/log/DescribeSheet.test.tsx > DescribeSheet > opens with a three-line field that
  has focus`)
- [x] Four examples, one more every 2 s, only while empty, carrying on from where they were when
  the field is emptied again (`> shows a new example meal every 2 s while the field is empty, all
  four in turn`, `> stops the examples once typing starts, and goes on when the field is emptied`)
- [x] Analyse off for blank text (`> keeps Analyse off while the text is only spaces and line
  breaks`)
- [x] Analyse hands the text on and the sheet goes; Cancel closes (`> starts a text analysis with
  the trimmed text and closes`, `> closes on Cancel without starting anything, and only then`)
- [x] Fresh each opening (`> starts empty each time it opens`, `> renders nothing while closed`);
  copy from the catalogue (`> draws its words from a catalogue partition that passes the lint`)
- Mutation check: letting the examples move while text is typed fails 1 test, sending the text
  untrimmed 1.
- Deliberate differences: line breaks count as blank and the text is sent trimmed (the reference
  trims spaces only to decide, and sends the text as typed); a bottom sheet with a labelled field
  and Analyse in its title row instead of a small card; Escape and the scrim do not close it; the
  examples swap without an animation; the examples are our own meals.
- Not taken: switching autocorrection off (the browser's spelling help stays on); voice input
  (later phase).

## Status

Done (2026-10-26). Created `src/features/log/DescribeSheet.tsx` (+ 9 tests, fake timers for the
examples), styles in `src/features/log/analysis.module.css`, words `capture.describe.*` in
`src/i18n/en/capture.ts`, this note. Props `open`, `onClose`; data-ui `describe`,
`describe.text`, `describe.analyse`, `describe.cancel`. The add menu (P06-01) opens it.
