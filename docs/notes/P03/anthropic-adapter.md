# Task: Anthropic adapter (P03-09) · Phase: 03 · Owner: builder (wt-p03s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/AnthropicClient.kt` (all: the headers, the body,
the reply parser and its cut-off rule), then `IT/AnthropicResponseParsingTests.swift` and
`T/services/ai/AnthropicResponseParserTest.kt` (a thinking block before the text, a cut-off reply
with no text block). Research spec `03-ai-providers.md` §2 and §3.2 M, §3.8, §3.15 (the browser
probe of 2026-10-26); trap R03.1; decision D-16.24.

What it does (own words): turns one model request into an Anthropic Messages call and the reply
into text or one failure. Anthropic answers a browser only when the request opts in with
`anthropic-dangerous-direct-browser-access: true`: without it even the error reply carries no CORS
header, so the page sees a bare network failure (R03.1). That header therefore goes on every
request, next to the key (`x-api-key`) and the API version (`anthropic-version: 2023-06-01`). The
body names the model and the answer limit (`max_tokens`, required by this API), puts our system
text with the person's notes in `system` (D-16.24), and sends one user turn: image blocks (base64
JPEG) first, then the prompt as a text block. The reply's text blocks are trimmed, blanks dropped
and joined with newlines; other blocks (thinking, tool use) are ignored. A `max_tokens` stop is
cut off (the client re-asks once); no text at all is unusable.

Inputs → outputs:
- `buildAnthropic(input)` → `{ url, init }`: `POST {base}/messages`.
- `readAnthropic(status, bodyText, { secrets }?)` → `Result<string, SingleFailure>`.

Files: created `src/ai/adapters/anthropic.ts`, `src/ai/adapters/anthropic.test.ts`, this note;
shares `src/ai/adapters/request.ts` with P03-07 and P03-08.

Edge cases / failure modes:
- The browser header is present with and without photos, with and without a system text.
- Blank system text → no `system` field.
- A thinking block before the text → only the text; a `tool_use` block → ignored.
- `max_tokens` stop with only a thinking block, or with partial text → truncated.
- `content` missing or not a list, a non-JSON body, text blocks that are all blank → unusable.
- An error status handed to the reader → classified (Anthropic's `error.message` shape).

Our design differences / decisions:
- The direct-browser header is always sent (R03.1, 03 §3.15); the native apps never needed it.
- `system` carries the notes on every request (D-16.24); the reference's Android food call sent
  no system text.
- Names are ours (`buildAnthropic`, `readAnthropic`, `ANTHROPIC_VERSION`).

Tests we will write (`anthropic.test.ts`):
- Every request shape sent through `transport.send` and `fakeFetch` carries the browser header,
  the key and the version (ACC-E2-1, R03.1).
- Body: model, `max_tokens`, `system`, image blocks before the text block.
- Reader: two text blocks joined; non-text blocks ignored; `max_tokens` → truncated; empty →
  invalidResponse; an error status → classified, detail redacted.

Compare checklist (filled after the rewrite; reopened `AnthropicClient.kt`,
`AnthropicResponseParsingTests.swift`, `AnthropicResponseParserTest.kt`):
- [x] The browser-access header, the key and the version on every request shape: photos, text
  only, no system text, prose, another model, a trailing slash (R03.1, ACC-E2-1)
  (`src/ai/adapters/anthropic.test.ts > buildAnthropic: headers (R03.1) > sends the
  browser-access header, the key and the version on every request (ACC-E2-1)`); `{base}/messages`
  with the key only in a header (`> posts to {base}/messages and keeps the key out of the
  address`)
- [x] Body: model, `max_tokens`, `system`, image blocks before the text block (`buildAnthropic:
  body > sends the model, the limit, the system text and the photos before the text`); notes in
  `system`, none when blank (`> carries the notes for the AI in system (D-16.24), and no system
  for a blank text`); text only (`> sends a text-only request as one text block`)
- [x] Text blocks trimmed and joined with newlines (`readAnthropic > joins two text blocks with a
  newline, each trimmed`); thinking, tool use and other typed blocks skipped (`> ignores thinking
  and other non-text blocks, even one holding text`)
- [x] `max_tokens` stop → cut off, with partial text or with no text block (`> reads a max_tokens
  stop as cut off, with part of an answer or with no text block`)
- [x] Unusable: not JSON, no content list, no blocks, blank texts, thinking only (`> reads %s as
  unusable`); an error status classified with the key redacted (`> classifies an error status and
  keeps the key out of the detail`); the reply read after `transport.send` (`> reads the reply the
  transport brought back`)
- Mutation check: the browser header removed (1 test fails); any block type read as text (1).
- Deliberate differences: the direct-browser header on every request (R03.1); `system` with the
  notes on every request (D-16.24); a key is trimmed and a blank one sends no `x-api-key`; a
  `max_tokens` stop is cut off even when `content` is missing (the reference read that as
  unusable).
- Not taken: the compact re-ask (P03-17); the Coach chat call (P08).

## Status

Done (2026-10-26). Created `src/ai/adapters/anthropic.ts`, `anthropic.test.ts` (15 tests), this
note; shares `src/ai/adapters/request.ts` (P03-07). Nothing changed outside the task's files.
