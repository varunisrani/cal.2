# Task: tool-result limiter (P08-03) · Phase: 08 · Owner: builder (wt-p08s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../services/ai/ToolResultLimiter.kt` (all) and its test
`android/.../test/.../services/ai/ToolResultLimiterTest.kt` (all, for the edge cases). Research
spec `04-coach.md` §3.10 (algorithm), §6 traps R04.9 and R04.10; decision D-16.32 (every provider,
newest rows kept); acceptance ACC-I9-1.

What it does (own words): a tool result can be huge (a year of food entries with their nutrients
runs to hundreds of kilobytes), which would blow the model's context and the person's bill. Every
tool result, on every provider, goes through the limiter before it is sent back. A result of at
most 60 000 characters passes unchanged. A longer one is read as a JSON object; its biggest list
(the array field with the longest JSON text) is cut down to its newest rows, which are the last
ones because tool lists are oldest first. The cut is as small as possible: a binary search finds
the largest number of rows that, together with `truncated: true`, the count of rows left out and a
note asking for a narrower date range, still fits. Everything else in the object stays as it was,
so `count` still reports how many rows the tool found. When the text is not an object, has no
list, or does not fit even with an empty list, the whole result becomes a small error object with
the same advice.

Inputs → outputs: `limitToolResult(text, maxChars = 60 000)` → text of at most `maxChars`
characters (JavaScript string length).

Files: created `src/services/coach/limiter.ts`, `src/services/coach/limiter.test.ts`, this note.

Edge cases / failure modes:
- Exactly 60 000 characters → unchanged.
- Not JSON, a JSON array, a string, a number or null over the cap → the error object.
- An object over the cap with no array field (one huge string) → the error object.
- Several arrays → only the longest (by serialised text) is cut; the others stay whole.
- Keys the result already had are kept in place; `truncated`, `omittedItems` and `note` are added
  (or replaced) after them.
- k = 0 still too large (the other fields alone exceed the cap) → the error object.
- The search range is 0…n − 1, so at least one row is always left out when it cuts.

Our design differences / decisions:
- Applied to every result on every provider (D-16.32, R04.9); the reference only limited the
  hosted Gemini path and the voice assistant.
- Keeps the newest rows, the tail of an oldest-first list (D-16.32, R04.10); the reference kept
  the leading (oldest) ones.
- Marker keys are ours: `truncated`, `omittedItems`, `note`; the error is
  `{error: "result too large", note}`. The tool's own limit markers (`limited`, `omittedOlder`)
  use other keys so neither overwrites the other.
- A pure function on text: the engine (P08-08) calls it on each `runCoachTool` result.

Tests we will write:
- small results come back unchanged (the same string), and a result of exactly the cap too;
- 2 000 items → fits under 60 000, `count` still 2 000, the kept items are the last ones and
  in order, `truncated` and `omittedItems = 2 000 − kept` and the note present (ACC-I9-1, R04.9);
- the cut is the largest that fits (one more row would not fit);
- only the longest of two arrays is cut;
- a string, an array, invalid JSON and an object without an array over the cap → the error;
- an object whose other fields alone exceed the cap → the error;
- a year of real `food_log` output (365 days of several entries with nutrients) → fits and keeps
  the newest days (ACC-I9-1).

Compare checklist (filled after the rewrite; reopened `ToolResultLimiter.kt` and
`ToolResultLimiterTest.kt`):
- [x] At or under the cap → unchanged (`src/services/coach/limiter.test.ts > limitToolResult: within
  the cap > returns a small result unchanged`, `> returns a result of exactly 60 000 characters
  unchanged, even when it is not JSON`)
- [x] Not an object / no array → the error (`limiter.test.ts > limitToolResult: what cannot be cut
  > replaces a long text that is not a JSON object with the error`, `> replaces a long object
  without a list with the error`)
- [x] Longest array by serialised text; other fields untouched (`limiter.test.ts > limitToolResult:
  cutting a long list (R04.9, D-16.32) > cuts only the longest of two lists and keeps the fields in
  their places`)
- [x] Binary search for the largest k in [0, n − 1] with the markers (`limiter.test.ts > … > keeps
  as many rows as fit: one more would go over the cap`)
- [x] `count` keeps the untrimmed total, markers present, 2 000 rows fit (`limiter.test.ts > … >
  fits 2 000 rows under 60 000, keeping count and the newest rows, with the markers`)
- [x] k = 0 still too large → the error (`limiter.test.ts > limitToolResult: what cannot be cut >
  replaces an object whose other fields alone are over the cap with the error`)
- [x] A year of real `food_log` output keeps the newest days (`limiter.test.ts > … > trims a year
  of food_log output and keeps the newest days (ACC-I9-1)`)
- Gaps found on reopening: none.
- Deliberate differences: keeps the tail (newest rows) instead of the head (D-16.32); our marker
  key `omittedItems` and our note texts; meant for every provider (R04.9), wired by P08-08.
- Not taken: nothing.
- Mutation check: cutting to the head instead of the tail fails 2 limiter tests; a tool limit that
  keeps the oldest rows fails 1 tool test.

## Status

Done (2026-10-27). Created `src/services/coach/limiter.ts` and its test (9 tests). Nothing changed
outside the slice's files. P08-08 passes every tool result through `limitToolResult`.
