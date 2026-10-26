# Task: number parsing, quantity formatting and amount expressions (P01-06) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/ServingAmountExpression.kt` (all),
`T/models/ServingAmountExpressionTest.kt` (all), `IT/ServingUnitEditorTests.swift` (the calculator
and decimal-parsing cases); to settle a conflict between the spec rule and the iOS test, the
quantity parse and format helpers in `A/models/ServingUnitOption.kt` (lines 100–130), the iOS
`parseDecimal` in `I/Views/ServingUnitEditor.swift` (lines 120–160) and
`A/models/MacroValueFormatter.kt`. Research spec `02-food-logging.md` §3.3 (decimal parsing,
quantity formatting, amount expressions), §6 R02.22; traps ledger rows owned by P01-06. No
Evidence ids.

What it does (own words): every number a person types or reads goes through one small module.
`numbers.ts` knows how a locale writes numbers (its decimal and grouping marks, taken from `Intl`),
reads typed text in two flavours (quantity fields, which try a dot, then a lone comma, then the
locale's own mark; and grouped amounts such as energy, which honour the locale's grouping), and
writes the plain texts the serving editor puts back into its fields (quantities and macro grams,
always with a dot so they read back in any locale). `servings/expression.ts` lets the amount
field act as a small calculator: `50+20×2` gives 90 with the usual precedence, unary signs, both
decimal marks and the Unicode operator glyphs; it never yields 0 or infinity from a broken
expression, and the calculator keys swap a trailing operator instead of stacking two.

Inputs → outputs:
- `numberMarks(locale)` → `{decimal, group}` (cached per tag; a tag `Intl` refuses reads as
  en-US).
- `parseDecimal(text, locale)` → number or null (sign allowed; callers decide on negatives).
- `parseLocaleNumber(text, locale)` → number or null: grouped locale form first, then a comma as
  the decimal mark (used by energy).
- `formatQuantity(n)` → "2", "2.35", "12.3"; `formatMacro(n)` → "12", "12.3", "12.0".
- `formatNumber(n, locale, maxDigits, minDigits)` → the locale's grouped text (used by the
  energy, weight and water formatters).
- `clamp(n, min, max)` and `WheelRange {min, max, step}` shared by the wheels of P01-03..05.
- `evalAmount(text, locale)` → number or null; `pushOperator(text, op)` → text;
  `hasOperation(text)` → boolean.

Files: created `src/domain/units/numbers.ts`, `src/domain/units/numbers.test.ts`,
`src/domain/servings/expression.ts`, `src/domain/servings/expression.test.ts`, this note.

Edge cases / failure modes:
- `parseDecimal` order (02 §3.3): (1) plain text with a dot, (2) when there is a comma and no dot,
  the comma is the decimal mark, (3) when the locale's decimal mark is not a dot and appears in
  the text, drop the locale's grouping mark and read its decimal mark. "1.000" is 1 everywhere
  (step 1 wins); "1,2,3" in de-DE and "1.2.3" in en-US are null; "-2.5" is −2.5.
- "Plain" means ASCII digits with at most one dot and an optional leading sign: no exponents, no
  `Infinity`/`NaN`, no hex, no inner spaces. A text so long that it overflows is null.
- Locales whose grouping mark is a space (fr-FR uses U+202F, ru-RU U+00A0): an ordinary typed
  space counts as that mark, since nobody can type a narrow no-break space.
- Grouped amounts: a grouping mark only counts in a grouping position (the first group 1–3
  digits, later groups 2–3 digits so Indian grouping works, the last group exactly 3). "8,368" in
  en-US is 8 368, but "418,4" in en-US is not 4 184: it falls back to the comma-as-decimal reading
  418.4. In de-DE "8368.4" is not 83 684 for the same reason; the fallback reads it as 8 368.4.
- An unknown or malformed locale tag never throws: the marks and formats fall back to en-US.
- Formatting rounds half away from zero on the shortest decimal form (as `Intl` does), so
  2.345 → "2.35", and never prints "-0".
- `formatMacro`: within 0.0001 of a whole number → no decimals; otherwise exactly one decimal,
  so 12.04 reads "12.0" (the reference's rule, kept).
- Expressions: empty or blank → null; a trailing operator ("50+") → null; a lone sign → null;
  letters or any other character → null; two numbers side by side ("1 5", "1.2.3") → null; a
  divisor whose magnitude is at most `Number.EPSILON` → null; any non-finite result (overflow,
  NaN) → null. Whitespace between tokens is ignored. Unary signs may repeat ("--5" = 5) and may
  follow × or ÷ ("5×-3" = −15). Decimal marks: a dot always, plus the locale's decimal mark (so
  in de-DE both "1,5" and "1.5" are 1.5; grouping marks are never accepted in an expression).
- `pushOperator` on empty or blank text returns it unchanged (no leading operator from the
  keys); it trims trailing spaces before deciding.
- `hasOperation` is true once an operator follows the first non-space character, so a leading
  minus alone ("-5") shows no "= result" preview.

Our design differences / decisions:
- Names are ours (`evalAmount`, `pushOperator`, `hasOperation`, `parseDecimal`,
  `parseLocaleNumber`).
- The evaluator is a tokeniser plus a single loop that keeps a running sum and the current
  product term, not a recursive-descent parser class.
- The plain-number grammar is stricter than the platforms' number readers (no exponent, no
  `Infinity`); nobody types those into a food amount, and it keeps non-finite values out.
- `parseDecimal` follows the spec's three steps, so "0,5" in en-US reads 0.5 (the Android
  behaviour; the iOS test treats it as invalid). Decision for the lead.
- Grouped parsing checks group positions (see above) instead of a lenient reader that would turn
  "418,4" into 4 184. Decision for the lead.
- Only ASCII digits are read; locales with native digits (ar-EG, fa-IR, bn-BD) can still type
  ASCII digits. Follow-up if needed.

Tests we will write:
- numbers: marks for en-US, de-DE, fr-FR (space-like group) and a bad tag; `parseDecimal`
  integer, decimal, "1.000" → 1, "0.500", "-2.5", de-DE and fr-FR comma decimals, a dot in
  de-DE, "0,5" in en-US → 0.5, two marks → null, "", "abc", an emoji, "1e3", "Infinity" → null,
  a grouped fr-FR value with a typed space; `parseLocaleNumber` en-US "8,368" → 8368, de-DE
  "8.368" → 8368 and "418,4" → 418.4, "418,4" in en-US → 418.4, Indian grouping, misplaced
  groups; `formatQuantity` 2 → "2", 2.345 → "2.35", 12.34 → "12.3", 0.5, 9.999 → "10", 1234.56
  without grouping, −0.001 → "0"; every formatted quantity parses back in de-DE; `formatMacro`
  whole, near-whole, one decimal; `formatNumber` grouped en-US/de-DE and fixed one decimal;
  `clamp`.
- expression: the Verify table (50+20, 200−35, 80×2, 300÷3, 50+20×2, "1,5+0,5" in de-DE, "-3+5");
  ASCII operators; whitespace; unary chains; decimals with either mark; precedence with division
  and subtraction; nulls for "50+", "abc", "food+20", "5/0", "5÷0.0", "", "   ", "+", "1 5",
  "1.2.3", "1,5" in en-US, overflow; `pushOperator` appends, replaces (`×` onto "50+" gives
  "50×"), trims, ignores empty text; `hasOperation` for "50", "-5", "50+", "50+20".

Compare checklist (filled after the rewrite; reopened `A/models/ServingAmountExpression.kt`,
`T/models/ServingAmountExpressionTest.kt`, `IT/ServingUnitEditorTests.swift`, the quantity helpers
in `A/models/ServingUnitOption.kt` and `A/models/MacroValueFormatter.kt`):
- [x] The four operators with their glyphs and ASCII forms, standard precedence
  (`src/domain/servings/expression.test.ts > evalAmount > adds, subtracts, multiplies and divides
  with the calculator glyphs`, `> accepts the ASCII operators too`, `> multiplies and divides before
  adding and subtracting, left to right`).
- [x] Unary signs, repeatable and after × ÷ (`expression.test.ts > evalAmount > reads unary
  signs`).
- [x] Decimals with a dot or the locale's mark, including German "1,5+0,5" (`expression.test.ts >
  evalAmount > reads decimals with a dot or the locale mark`).
- [x] Whitespace between tokens (`expression.test.ts > evalAmount > ignores spaces between
  tokens`).
- [x] Trailing operator, letters, division by ≤ epsilon, malformed and non-finite → null
  (`expression.test.ts > evalAmount > rejects a trailing operator, letters and division by about
  zero (R02.22)`, `> divides by a small number that is still above machine epsilon`, `> rejects
  empty and malformed text`, `> rejects a result that is not finite`).
- [x] Operator keys append or replace, never stack; empty text unchanged (`expression.test.ts >
  pushOperator > appends an operator to a number`, `> replaces a trailing operator instead of
  stacking one (R02.22)`, `> leaves empty text alone`, `> offers the four calculator keys`).
- [x] Operation detection for the preview (`expression.test.ts > hasOperation > is true once an
  operator follows the first character`, `> is false for a plain number, even with a leading
  sign`).
- [x] Decimal parsing: dot first, lone comma, then the locale mark without its grouping; the C
  locale and de/fr cases of the iOS tests; two marks and junk refused
  (`src/domain/units/numbers.test.ts > parseDecimal > reads plain numbers with a dot in any
  locale`, `> reads a dot
  first, so "1.000" is one in every locale`, `> keeps the sign and trims surrounding spaces`,
  `> reads a comma as the decimal mark when the text has no dot`, `> reads the locale's decimal
  mark after removing its grouping mark`, `> refuses text with more than one decimal mark`,
  `> refuses empty, non-numeric and non-finite text`).
- [x] Quantity and macro texts (`numbers.test.ts > formatQuantity > writes whole numbers without
  decimals`, `> keeps up to two decimals below 10 and one from 10 up, without trailing zeros`,
  `> never writes "-0"`, `> writes text that parseDecimal reads back in a comma locale`;
  `formatMacro > writes whole grams without decimals and anything else with one decimal`).
- [x] Locale marks and grouped reading shared with energy and water (`numbers.test.ts >
  numberMarks > reads the decimal and grouping marks of a locale from Intl`, `> falls back to en-US
  marks for a tag Intl refuses instead of throwing`; `parseLocaleNumber > reads the locale's
  grouping and decimal marks`, `> accepts Indian grouping`, `> falls back to a comma as the decimal
  mark when the grouping is out of place`, `> trims, keeps signs and refuses trailing junk`;
  `formatNumber > groups and rounds in the locale`, `> uses en-US for a tag Intl refuses`;
  `plainText > writes a dot, no grouping and no trailing zeros`; `clamp > holds a value to its
  bounds and reads NaN as the minimum`).
- Deliberate differences: "0,5" in en-US reads 0.5 (spec rule; the iOS test calls it invalid); the
  plain-number grammar refuses exponents, `Infinity`, `NaN` and hex; `hasOperation` ignores leading
  spaces, so " -5" is not an operation; only ASCII digits are read.
- Not taken: the optional manual-nutrition reader of the iOS tests (P06, built on
  `parseDecimal`); the calculator row itself and the blur/revert behaviour of the field (P06 UI).

## Decisions for the lead

- `parseDecimal` follows the phase row's three steps exactly, so a lone comma is a decimal mark in
  every locale ("1,000" in en-US is 1 in a quantity field, as on Android). Energy fields use the
  grouped reader instead, where "8,368" is 8 368.
- A space-like grouping mark (fr-FR U+202F, ru-RU U+00A0) also matches typed spaces.
- `formatQuantity`, `formatMacro` and `plainText` write a dot and no grouping (they seed input
  fields); screens that only display use `formatNumber` or `src/i18n/format.ts`.
- Extra exports beyond the phase row: `NumberMarks`, `numberMarks`, `WheelRange`, `clamp`,
  `parseLocaleNumber`, `plainText`, `formatNumber`, `AMOUNT_OPERATORS`, `AmountOperator`.
- Follow-up: native digits (ar-EG, fa-IR, bn-BD) are not read; such locales can type ASCII digits.

## Status

Done (2026-10-26). `src/domain/units/numbers.ts` (22 tests) and
`src/domain/servings/expression.ts` (17 tests) are in place, all passing. Nothing outside the
slice's files changed. Trap covered: R02.22.
