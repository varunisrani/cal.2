# Task: serving card and amount field (P06-07) · Phase: 06 · Owner: builder (wt-p06s2a, slice S2a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/home/FoodSheetPrimitives.kt` (the serving quantity card: the
field, finalising on blur, the clear button, the unit menu and its labels, the calculator row and
its keys, the total-grams line), `I/Views/ServingUnitEditor.swift` (all: the iOS field, unit menu,
re-sync on a unit change, finalising, quantity text and the picker list rules), and the serving
parts of `A/ui/home/FoodResultSheet.kt` (where the card is wired). Research spec
`02-food-logging.md` §3.3, §6 R02.1, R02.2, R02.22. Domain already built: `src/domain/servings/`
(`units.ts`, `scale.ts`, `expression.ts`). Ledger rows naming P06-07: ACC-D8-1, ACC-D8-2, ACC-D9-2,
ACC-J2-2.

What it does (own words): the serving card is where the person says how much they ate. A number
field takes the amount and a unit picker its unit. With a known weight the picker offers grams
first and then up to four named units of the food (slice, cup, serving of a split recipe); with an
unknown weight it offers only a count of servings and grams never appear (R02.1). For a named unit
with a known weight a line under it says roughly how many grams that is. Switching unit keeps the
weight and rewrites the count (2 slices of 30 g → 60 g). The field is also a small calculator: it
reads + − × ÷ with the usual precedence, and while it has focus a row of keys offers C, the four
operators (an operator replaces one already at the end, so "50+" then × gives "50×") and = (which
shows "= 70" once there is an operation and then writes 70). Every value above 0 the text reads as
updates the amount at once, so the nutrition follows while typing; when the field is left, a valid
value is tidied ("70.00" → "70") and anything else (empty, "50+", letters, ÷ 0) goes back to the
current amount. A clear button empties the field. The grams-first setting opens the sheet in grams
when the weight is known.

Inputs → outputs: `ServingCard` takes the picker units (`pickerUnits(basis, units)`), the shown
amount (`ShownAmount`) and `onChange(next: ShownAmount)`; `AmountField` takes the current count,
`onChange(count)` for every valid count above 0, a label and a hook. The sheet picks the opening
amount with `initialAmount(draft, gramsFirst)`.

Files: created `src/features/log/review/ServingCard.tsx` (+ `ServingCard.test.tsx`),
`src/features/log/review/AmountField.tsx` (+ `AmountField.test.tsx`), styles in
`src/features/log/review/review.module.css`, words in `src/i18n/en/review.ts`, this note.

Edge cases / failure modes:
- "50+" or "" or "abc" or "5÷0" while typing: the amount stays where it was; on leaving the field
  the text goes back to it (R02.22).
- "0" or a negative result: not above 0, so ignored and reverted the same way.
- A locale with a decimal comma: "1,5+0,5" reads as 2 (the expression reader handles it).
- An operator key on an empty field does nothing; C empties it; = with nothing valid leaves the
  text as it is.
- The keys must not take focus away from the field (a tap on a key keeps the field focused), and
  leaving the field for one of its own keys does not count as leaving it.
- Unknown weight: one unit (servings), no picker, no "≈ g" line.
- Only grams known (no named units): no picker either, just the unit word.

Our design differences / decisions:
- Names and words are ours ("Amount", "Unit", "≈ 60 g", "Clear amount").
- The unit picker is a native select (the phone's own list, labelled for assistive tech); the
  reference uses a drop-down menu.
- On leaving the field, empty text also goes back to the current amount (the phase row says
  "anything else reverts"; both references leave the field empty).
- The "≈ g" line shows only for a named unit; for grams it would repeat the field.
- The selected unit's label follows the count (slice / slices); the other entries show the
  singular, as the reference does.

Tests we will write:
- `AmountField.test.tsx`: 50+20 calls `onChange(70)` while typing (ACC-D8-1); "50+" on blur goes
  back to the current amount and calls nothing (ACC-D8-2); × after + gives "50×"; = shows "= 70"
  only once there is an operation and writes 70; C and the clear button empty the field; the row
  shows only while focused; letters and ÷ 0 are refused; a decimal comma reads.
- `ServingCard.test.tsx`: grams first then the named units; unknown weight → servings only, no ≈
  line (R02.1); switching from 2 slices of 30 g to grams shows 60 (ACC-D9-2); the ≈ line for a
  named unit; typing in the field changes the shown amount live.
- `ReviewSheet.test.tsx`: grams-first opens the review in grams (ACC-J2-2), otherwise in the
  draft's chosen unit.

Compare checklist (filled after the rewrite; reopened `FoodSheetPrimitives.kt`,
`ServingUnitEditor.swift`):
- [x] Every valid value above 0 updates the amount while typing
  (`src/features/log/review/AmountField.test.tsx > AmountField > sets the amount to 70 while
  50+20 is typed (ACC-D8-1)`, `> reads × and ÷ before + and −`;
  `src/features/log/review/ServingCard.test.tsx > ServingCard > moves the amount live while an
  expression is typed in grams`)
- [x] Leaving the field: valid → tidied, anything else → back to the amount (`AmountField.test.tsx
  > AmountField > puts an unfinished 50+ back to the amount on leaving the field (ACC-D8-2,
  R02.22)`, `> puts empty text, letters and a division by 0 back the same way`, `> tidies a valid
  amount on leaving the field`)
- [x] Calculator row while focused; operator replaces a trailing one; = shows and writes the
  result; C; clear button (`> shows the keys only while the field has focus, and they keep the
  focus in it`, `> replaces an operator at the end: × after + gives 50×`, `> shows = 70 on the
  equals key once there is an operation, and writes 70`, `> empties the field with C and with the
  clear button, leaving the amount as it was`)
- [x] Picker: grams first then named units; unknown weight → servings only, no ≈ line; one unit →
  no picker (`ServingCard.test.tsx > ServingCard > offers grams first and then the named units when
  the weight is known`, `> offers only servings, with no grams and no ≈ line, when the weight is
  unknown (R02.1)`)
- [x] Switching unit keeps the grams; ≈ line for named units (`> keeps the weight when switching
  from 2 slices of 30 g to grams, which shows 60 (ACC-D9-2)`, `> says about how many grams a named
  unit comes to, in any unit`, `> counts named units by the weight: typing 3 slices makes 90 g`)
- [x] Grams-first picks the opening unit (`src/features/log/review/ReviewSheet.test.tsx >
  ReviewSheet > opens in grams when grams come first, else in the unit the draft chose
  (ACC-J2-2)`)
- Deliberate differences: empty text also reverts on leaving the field (both references leave it
  empty); a native select for the unit instead of a drop-down menu; the ≈ line only for named
  units; Enter leaves the field; the keys keep the focus in the field (a press does not take it).
- Not taken: the iOS keyboard toolbar (the key row is ours, under the field); scrolling the field
  into view (the browser does it).

## Status

Done (2026-10-27). Created `src/features/log/review/ServingCard.tsx` (+ 6 tests),
`src/features/log/review/AmountField.tsx` (+ 9 tests; exports `readAmount`), styles in
`review.module.css`, words `review.serving.*` and `review.unit.*`, this note. Hooks:
`review.serving`, `review.amount`, `review.amount.clear`, `review.amount.keys`,
`review.amount.keys.{clear,plus,minus,times,divide,equals}`, `review.unit`, `review.grams`. No lines
changed outside the slice's files for this task.
