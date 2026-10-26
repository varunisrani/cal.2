# Task: JSON extraction (P03-11) · Phase: 03 · Owner: builder (wt-p03s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/FoodAnalysis.kt` (the JSON extraction function
only: fence handling, the brace scan, what is returned when nothing balances). The reference has
no test of its own for this function (searched both test folders). Research spec
`03-ai-providers.md` §3.6 (JSON extraction) and trap R03.13; acceptance ACC-E8-1.

What it does (own words): models are asked for one JSON object and nothing else, but they often
wrap it in a code fence, put a sentence before or after it, or both. Every reply reader starts
here: trim the text; when it holds a fenced block (a `json` fence in any letter case wins,
otherwise any triple-backtick fence) keep only what is inside; then take the first `{…}` whose
braces balance, ignoring braces inside strings (a food named `Jam {strawberry}` or with an escaped
quote must not end the object early). If there is no `{` at all the whole text is parsed (a bare
number or array). The value is returned as `unknown` for the reader that knows its shape; text
that does not parse is an invalid answer, which lets the standby run (D-16.22). A greedy match from
the first `{` to the last `}` is never used: it would glue two objects, or an object and prose with
a brace, into text that does not parse.

Inputs → outputs: `parseModelJson(text)` → `Result<unknown, SingleFailure>` (failure `{ kind:
'invalidResponse' }`). Two small readers for untrusted values that every reply reader needs:
`isRecord(value)` and `readNumber(value)` (a finite number, or a string holding only a decimal
number).

Files: created `src/ai/parse/json.ts`, `src/ai/parse/json.test.ts`, this note.

Edge cases / failure modes:
- Prose, then the object, then prose → the object.
- ```` ```json ```` fence (also ```` ```JSON ````) and a bare ```` ``` ```` fence with or without a
  language word → the inside.
- A string value holding `}` or `{` → ignored by the scan; an escaped quote `\"` inside a string
  does not end the string; an escaped backslash before a closing quote does end it.
- Two objects one after the other → the first only.
- Nested objects and arrays → the outer object whole.
- No `{` → the whole text is parsed: `42` → 42, `[1,2]` → the array, `hello` → invalid.
- An object that never closes (a cut-off reply) → invalid.
- The first balanced object is not valid JSON (single quotes, trailing comma) → invalid; we do not
  go looking for a later object.
- A stray closing fence after a plain object (```` {…}``` ````) → the object is still found (our
  addition: an empty fence inside falls back to the whole text).
- Empty or whitespace-only text → invalid.

Our design differences / decisions:
- Escapes are tracked only inside strings (outside a string a backslash is just text); the result
  is the same for valid JSON.
- A fence whose inside holds no `{` while the whole text does is ignored, so a reply that ends with
  a stray closing fence still parses; the reference would cut the object away.
- The reader returns the parsed value instead of the cut text, so no caller parses twice and no
  caller throws.
- `readNumber` accepts only plain decimal strings (`"250"`, `" 12.5 "`, `"1e3"`); `""`, `"0x10"`,
  `"12 g"`, `"Infinity"` and booleans are not numbers (JavaScript's `Number()` would take some).
- Names are ours (`parseModelJson`, `isRecord`, `readNumber`).

Tests we will write (`json.test.ts`):
- prose + object + prose; a `json` fence (both cases); a bare fence with a language word.
- a name holding `}`; an escaped quote; an escaped backslash at the end of a string.
- two objects → the first; nested objects and arrays kept whole.
- no object → the whole text: a number parses, plain prose is invalid.
- cut-off object → invalid; malformed first object → invalid; empty text → invalid.
- stray closing fence after an object.
- `readNumber` and `isRecord` cases.

Compare checklist (filled after the rewrite; reopened the extraction function in
`FoodAnalysis.kt` and the iOS twin at the top of `GeminiService.swift` lines 1436–1700):
- [x] Trim, then a `json` fence (any case) wins over a plain fence; text after the opening marker
  up to the last closing fence (`src/ai/parse/json.test.ts > parseModelJson: answers wrapped in
  prose or a fence (R03.13, ACC-E8-1) > reads the inside of a json fence, in any letter case`,
  `> reads an answer wrapped in prose and a plain fence with a language word`)
- [x] Prose around the object (`> reads an object with a sentence before and after it`)
- [x] First balanced object, braces in strings ignored, escapes tracked (`parseModelJson: the first
  balanced object, aware of strings (R03.13) > ignores braces inside a string`, `> keeps an escaped
  quote inside a string`, `> ends a string at a quote that follows an escaped backslash`)
- [x] Never greedy: two objects → the first (`> takes the first of two objects, never a span from
  the first { to the last }`); nested kept whole (`> keeps nested objects and arrays whole`)
- [x] No `{` → the whole text is parsed (`> parses the whole text when there is no object`)
- [x] Unbalanced or unparsable → invalid (`> refuses an object that never closes, as from a cut-off
  answer`, `> refuses a first object that is not valid JSON instead of looking further`,
  `> refuses an empty answer`)
- Mutation check: a greedy first-to-last-brace cut fails 2 tests; dropping string tracking fails 2.
- Deliberate differences: escapes counted only inside strings; a fence with no object inside falls
  back to the whole text (`> still finds the object when a stray closing fence follows it`); the
  parsed value (or an invalid-answer failure) is returned instead of the cut text.
- Not taken: nothing else; the reference function has no tests of its own.

## Decisions for the lead

- `isRecord` and `readNumber` live in `json.ts` and are exported for P03-13 and P03-14
  (`readNumber` = a JSON number or a plain decimal string, finite; units.ts must still refuse
  strings for count and grams each, R03.16, so it should check `typeof value === 'number'` itself).

## Status

Done (2026-10-26). Created `src/ai/parse/json.ts`, `src/ai/parse/json.test.ts` (16 tests), this
note. Nothing changed outside the task's files.
