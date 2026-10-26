# Task: number parsing, quantity formatting and amount expressions (P01-06) · Phase: 01 · Owner: builder (wt-p01b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/models/ServingAmountExpression.kt` (all),
`T/models/ServingAmountExpressionTest.kt`, `IT/ServingUnitEditorTests.swift` (calculator and
decimal parsing cases); research spec `02-food-logging.md` §3.3 (quantity formatting, decimal
parsing, amount expressions, calculator row) and §6 R02.22; traps ledger row R02.22. No Evidence
ids.

What it does (own words): numeric text fields across the app (serving amounts, manual nutrition,
water, energy) need one way to read what a person typed in their locale, and the serving amount
field also accepts a little arithmetic ("50+20", "300÷3"). `numbers.ts` finds a locale's grouping
and decimal marks once (from `Intl.NumberFormat(locale).formatToParts`), reads plain numbers,
reads numbers written the locale's way, and reads a decimal the forgiving way the spec records: a
plain dot first, then a comma when the text has no dot, then the locale's marks. It also writes a
serving quantity back into the field (whole numbers bare, below 10 up to two decimals, otherwise
up to one, no trailing zeros) and a macro amount (whole or one decimal). `expression.ts` evaluates
an amount expression with `+ − × ÷` (and `+ - * /`), multiplication and division before addition
and subtraction, unary signs, a dot or the locale's decimal mark, spaces ignored and no
parentheses. Anything incomplete or unsafe has no value: empty text, a trailing operator, letters,
a divisor that is zero or within machine epsilon of it, or a result that is not finite (R02.22).
Operator keys replace a trailing operator instead of stacking a second one, and the "= result"
preview shows only when the text holds an operation.

Inputs → outputs:
- `numberMarks(locale)` → `{group, decimal}` (cached; en marks for an unusable tag).
- `readPlainNumber(text)` → number or `null` (optional sign, digits, optional dot fraction).
- `parseLocaleNumber(text, locale)` → number or `null` (locale grouping between digit groups,
  locale decimal mark).
- `parseDecimal(text, locale)` → number or `null`.
- `formatQuantity(n, locale?)`, `formatMacro(n, locale?)` → field / display text with the locale's
  decimal mark (a dot without a locale), never grouped.
- `formatFixed(n, digits, locale)` → grouped text with exactly `digits` decimals (weights, water).
- `clamp(n, min, max)`, `StepRange` (shared by the wheels in energy and water).
- `evalAmount(text, locale)` → number or `null`; `pushOperator(text, op)` → text;
  `hasOperation(text)` → boolean; `AMOUNT_OPERATORS`, `AmountOperator`.

Files: created `src/domain/units/numbers.ts`, `numbers.test.ts`,
`src/domain/servings/expression.ts`, `expression.test.ts`, this note.

Edge cases / failure modes:
- `parseDecimal`: `"0.5"` anywhere is 0.5; `"1,5"` is 1.5 even in en-US (comma with no dot);
  `"1.000"` is 1 (dot first) even in de-DE; `"1.234,5"` in de-DE is 1 234.5 (locale step);
  `"1.2.3"`, `"1,2,3"`, `""`, `"abc"`, an emoji → `null`; `"-2.5"` → −2.5 (signs allowed here,
  callers decide).
- The locale step never throws on a bad tag; a space-like grouping mark (fr-FR) accepts a plain
  space as well; grouping marks only count between digit groups with a three-digit last group.
- `formatQuantity`: 2 → "2", 2.345 → "2.35", 12.34 → "12.3", 9.996 → "10", 0.5 → "0.5", −0 and
  tiny negatives that round to zero → "0", non-finite → "".
- `formatMacro`: 12 → "12", 12.34 → "12.3", 12.04 → "12" (rounded to a tenth first), 12.96 → "13".
- Expressions: 50+20 = 70; 200−35 = 165; 80×2 = 160; 300÷3 = 100; 50+20×2 = 90; 10−2×3 = 4;
  "1,5+0,5" in de-DE = 2 but `null` in en-US (comma is not a decimal mark there); "-3+5" = 2;
  "5×−2" = −10; " 50 + 20 " = 70; "1 000" = 1 000 (spaces removed before reading); "5." = 5;
  ".5" = 0.5; "50+", "abc", "food+20", "5/0", "5÷0.0", "", "+", "1.2.3", "(1+2)" → `null`;
  a 400-digit number → `null` (not finite). A result of −0 comes back as 0.
- `pushOperator`: "50" + "+" → "50+"; "50+" + "×" → "50×"; "50 + " + "÷" → "50 ÷"; empty text
  stays empty (no operator at the start); ASCII operators count as trailing too ("50*" + "−" →
  "50−").
- `hasOperation`: "50+20" true, "50+" true (the preview then has no value), "-5" false (a leading
  sign is not an operation), "5" false.

Our design differences / decisions:
- Names are ours: `evalAmount`, `pushOperator`, `hasOperation` as the phase row names them; the
  evaluator is our own two-step design (a tokenizer, then a fold that closes a term at each
  `+`/`−`), not a recursive-descent copy.
- Spaces are removed before reading, so a space inside a number ("1 000") does not break it.
- `parseDecimal` follows the plan's order exactly, so `"0,5"` in en-US is 0.5 (the reference's
  iOS test expects no value) and `"1,000"` in en-US is 1 (see Decisions for the lead).
- `formatQuantity` / `formatMacro` take an optional locale for the decimal mark only; they never
  group, so the text always reads back through `parseDecimal` and `evalAmount`.

Tests we will write:
- `numberMarks` for en-US, de-DE, fr-FR, de-CH and a bad tag.
- `parseDecimal` table (C-like, de-DE, fr-FR, rejects, signs).
- `formatQuantity` / `formatMacro` tables, locale decimal mark, and a round trip through
  `parseDecimal`.
- `evalAmount`: the Verify values, precedence, unary signs, locale marks, whitespace, the rejects
  and the divisor-near-zero case (R02.22); `pushOperator` and `hasOperation` (R02.22).

Compare checklist (filled after the rewrite; reopened `A/models/ServingAmountExpression.kt`,
`T/models/ServingAmountExpressionTest.kt`, `IT/ServingUnitEditorTests.swift`):
- [x] 50+20, 200−35, 80×2, 300÷3 (tested in `src/domain/servings/expression.test.ts > evalAmount >
  adds, subtracts, multiplies and divides with the shown symbols`); ASCII forms (`> accepts the
  ASCII forms of the operators`).
- [x] Precedence 50+20×2 = 90 (`evalAmount > multiplies and divides before adding and
  subtracting`).
- [x] Locale decimals "1,5+0,5" de-DE = 2, "1.5+0.25" en-US = 1.75 (`evalAmount > reads decimals
  with a dot or the locale decimal mark`); a comma is not a mark in en-US (`> does not take a
  comma as a decimal mark where the locale uses a dot`).
- [x] Unary plus and minus, repeated (`evalAmount > reads unary signs where a number is
  expected`).
- [x] R02.22: "50+", "50÷0", "food+20" and a divisor within machine epsilon have no value
  (`evalAmount > has no value for a trailing operator, letters or division by about zero
  (R02.22)`); empty and incomplete text (`> has no value for empty or incomplete text`); non-finite
  results (`> has no value when the result is not finite`).
- [x] R02.22: operator keys replace a trailing operator, "50" + "+" → "50+", "50+" + "×" → "50×"
  (`pushOperator > appends an operator after a number`, `> replaces a trailing operator instead of
  stacking a second one (R02.22)`); empty text unchanged (`> leaves an empty field empty`).
- [x] Operation detection ignores a leading sign (`hasOperation > is true once an operator follows
  the first character`, `> is false for a plain number or a leading sign`).
- [x] Decimal parsing, C-like: "5", "0.5", "1.5", "1000", "1.000" → 1, "0.500", "-2.5"
  (`src/domain/units/numbers.test.ts > parseDecimal > reads a plain dot first, in any locale`,
  `> keeps a sign for the caller to judge`); de-DE "0,5", "1,5", "0.5"; fr-FR "1,5" (`> then reads
  a comma as the decimal mark when there is no dot`); "", "abc", an emoji, "1.2.3" en-US,
  "1,2,3" de-DE → null (`> gives null for text that is not one number`).
- [x] Locale marks from `Intl` (`numbers.test.ts > numberMarks > finds the grouping and decimal
  marks of a locale`, `> falls back to en marks for a tag Intl cannot use`; `parseLocaleNumber >
  reads the grouping and decimal marks of the locale`, `> accepts a typed space or apostrophe for
  a no-break space or curly apostrophe group`, `> only counts group marks between whole digit
  groups`).
- [x] Quantity and macro text (`numbers.test.ts > formatQuantity > writes whole numbers bare, below
  10 up to two decimals and otherwise up to one`, `> never writes -0, and writes nothing for a value
  that is not finite`, `> uses the locale decimal mark without grouping, so the text reads back`;
  `formatMacro > writes a whole number bare and anything else with one decimal`).
- Deliberate differences: "0,5" in en-US reads 0.5 (the plan's comma step; the reference's iOS
  test expects no value); spaces inside a number are removed ("1 000" = 1 000, the reference
  stops at the space and has no value); a leading space before a sign is not an operation.
- Not taken: the optional manual nutrition reader (blank stays unknown, negatives refused): that
  is the manual entry sheet's rule (P06), built on `parseDecimal`; non-ASCII digits are not read
  (English-only v1).

## Decisions for the lead

- `parseDecimal` follows the plan's order exactly, so in en-US "1,000" reads as 1 and "0,5" as
  0.5 (tested in `numbers.test.ts > parseDecimal > then reads a comma as the decimal mark when
  there is no dot`). If a grouped thousand should win for dot-decimal locales, the comma step
  could run only when the locale's decimal mark is a comma, or after the locale step; say which.
- Locale grouping is only accepted in the right places (first group 1–3 digits, later groups 2–3,
  last group 3), so "1,5" in en-US never reads 15.
- `formatQuantity` and `formatMacro` take an optional locale for the decimal mark only and never
  group; `formatMacro` rounds to a tenth before dropping ".0" (12.04 → "12", not "12.0").
- `formatQuantity` / `formatMacro` return "" for a non-finite value.
- Extra exports beyond the phase row: `numberMarks`, `NumberMarks`, `readPlainNumber`,
  `parseLocaleNumber`, `formatTrimmed`, `formatFixed`, `clamp`, `StepRange` (shared by the
  energy, body and water modules), `AMOUNT_OPERATORS`, `AmountOperator`.

## Status

Done (2026-10-26). `numbers.ts` (19 tests) and `expression.ts` (17 tests), all passing; nothing
outside the slice's files changed. Trap covered: R02.22.
