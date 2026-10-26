# Task: Gemini adapter (P03-07) · Phase: 03 · Owner: builder (wt-p03s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/GeminiClient.kt` (all: the request body, the
generation settings, the thinking-level rule, how the reply parts are read and when a reply is
cut off or unusable), `I/Services/GeminiRequestConfiguration.swift` (the same rules on iOS: the
model id split by hand instead of a pattern, an empty settings object left out), then
`T/services/ai/GeminiClientTest.kt` and `IT/GeminiRequestConfigurationTests.swift` (the model ids
of the thinking table, the `models/` prefix and odd casing, pre-3 and unknown ids, prose versus
JSON settings, thought parts, cut-off replies with and without text, the unusable bodies).
Research spec `03-ai-providers.md` §2 (wire names) and §3.2 G, §3.3 (instructions), §3.8;
traps R03.7, R03.8, R03.9; decision D-16.24. Vendor check on 2026-10-26: the Gemini thinking page
lists `minimal` for 3.6 Flash, 3.5 Flash-Lite and 3 Flash preview only, and `x-goog-api-key` as
the key header.

What it does (own words): turns one model request into a Gemini `generateContent` call and turns
the reply back into text or one failure. The key travels only in the `x-goog-api-key` header, so
it never appears in a URL that a proxy or a server log could keep. The body holds one user turn:
the photos first (inline JPEG data), then the prompt; the system channel (`systemInstruction`)
carries our system text, which already holds the person's notes for the AI (D-16.24). The
generation settings always carry the answer token limit (R03.9: Gemini answers are capped even
though the reference hid that setting), ask for JSON only when the request wants JSON, and pick a
thinking level from the model id, because Gemini 3 thinks for a long time by default and some
models refuse the fastest level. The reply can hold several parts, some of them thought summaries:
every non-thought part is joined, so a split answer is not lost (R03.7). A reply stopped by the
token limit is "cut off" (the client re-asks once); an empty reply is unusable.

Thinking level (R03.8), from the model id lower-cased with any `vendor/` prefix removed:
- `gemini-flash-lite-latest` → minimal; `gemini-flash-latest` → low (aliases that may point at
  any Gemini 3 model, so they get a level every one of them accepts).
- Otherwise read `gemini-<major>[.<minor>]-<variant>`; an id that does not have this shape, or a
  major below 3, gets no level at all (older models only take a thinking budget).
- Variant starting `flash-lite` → minimal; variant starting `flash` → low from 3.7 on (major
  above 3, or minor 7 and up) and minimal before; any other variant (Pro and the rest) → low.

Inputs → outputs:
- `buildGemini(input)` → `{ url, init }` for `transport.send`: `POST {base}/models/{model}:generateContent`.
- `readGemini(status, bodyText, { secrets }?)` → `Result<string, SingleFailure>`: the joined text,
  or `truncated`, `invalidResponse`, or the classified failure for an error status.
- `geminiThinkingLevel(model)` → `'minimal' | 'low' | undefined`.

Files: created `src/ai/adapters/gemini.ts`, `src/ai/adapters/gemini.test.ts`, the shared input
file `src/ai/adapters/request.ts` with `request.test.ts` (with P03-08/09), this note.

Edge cases / failure modes:
- A blank system text sends no `systemInstruction` (an empty part list is refused by the API).
- No photos: one text part only. Ten photos: ten image parts, then the text.
- Prose request (fit check): no `responseMimeType`; the token limit and level are still sent.
- A token limit that is not a whole number ≥ 1 (should not happen; the settings clamp it) falls
  back to the 1 024 default (D-16.65) rather than sending `null`.
- Thought parts only, with `STOP` → unusable; with `MAX_TOKENS` → cut off.
- Partial text with `MAX_TOKENS` → cut off (the partial text is thrown away; the re-ask replaces it).
- No candidates (blocked prompt), an empty candidate list, a non-JSON body → unusable.
- An error status handed to the reader → classified from status and body (the retry ladder
  normally does this first; the reader is total so the client cannot misuse it).
- A trailing slash on the base address does not give `//models`.

Our design differences / decisions:
- Notes for the AI go in `systemInstruction` on every request (D-16.24), not in the prompt.
- The token limit is always sent (R03.9; the setting is shown for every provider, P09-07).
- The adapter is two pure functions; retries, deadline, re-ask and standby live in the client
  (P03-17), so the compact re-ask prompt is not part of this task.
- The single user turn carries `role: "user"` (the API accepts it with or without).
- Names are ours (`buildGemini`, `readGemini`, `geminiThinkingLevel`, `AdapterInput`).

Tests we will write (`gemini.test.ts`):
- URL shape with no `key=`, header present, sent through `transport.send` and `fakeFetch`.
- Thinking table: every Verify id plus the reference-test edge ids (prefixes, casing, pre-3,
  unknown, `gemini-`, empty).
- Body: images before text, `image/jpeg`, system channel, JSON versus prose, cap at the default.
- Reader: parts joined without the thought; MAX_TOKENS → truncated (with and without text);
  unusable bodies → invalidResponse; an error status → classified, detail redacted.

Compare checklist (filled after the rewrite; reopened `GeminiClient.kt`,
`GeminiRequestConfiguration.swift`, `GeminiClientTest.kt`, `GeminiRequestConfigurationTests.swift`):
- [x] Every branch of the thinking table (R03.8): Flash-Lite, Flash before and from 3.7 (3.10 read
  as a number, not text), major above 3, Pro and other variants
  (`src/ai/adapters/gemini.test.ts > geminiThinkingLevel (R03.8) > gives %s the level %s`); the
  two `-latest` aliases, with a prefix and odd casing (`> gives the -latest aliases a level every
  Gemini 3 model accepts`); `models/` and `vendor/` prefixes, spaces, capitals (`> reads the id
  lower-cased, trimmed and without a vendor/ prefix`); pre-3 models (`> sends no level to %s, a
  model before Gemini 3`); ids that do not parse, `gemini-`, `gemini-3` and empty (`> sends no
  level to %j, an id that does not parse`)
- [x] Key in `x-goog-api-key` only, never `key=` in the address
  (`buildGemini: address and key > puts the key in the x-goog-api-key header and never in the
  address`)
- [x] Body: inline JPEG parts before the one text part (`buildGemini: body > sends the photos
  first, as JPEG inline data, then the prompt in one user turn`); text only (`> sends a text-only
  request as one text part`)
- [x] Generation settings: limit, JSON and level at the default (`> sends the answer limit even
  at the default, with JSON and the thinking level`); prose leaves out the JSON type
  (`> leaves out responseMimeType for a prose request but keeps the limit and level`); no level
  before Gemini 3 (`> sends no thinkingConfig to a model before Gemini 3`)
- [x] Notes in `systemInstruction` (D-16.24) (`> carries the system text with the notes for the
  AI in systemInstruction (D-16.24)`, `> sends no systemInstruction for a blank system text`)
- [x] Reply parts joined with no separator, thoughts skipped, trimmed (R03.7) (`readGemini
  (R03.7) > joins every text part and skips the thought part`, `> trims the joined answer`)
- [x] `MAX_TOKENS` is cut off with partial text and with thoughts only (`> reads MAX_TOKENS as cut
  off, with part of an answer or with thoughts only`)
- [x] Unusable bodies: not JSON, blocked prompt, no candidates, no parts, an empty part list,
  thoughts only, blank text (`> reads %s as unusable`)
- [x] An error status is classified with the key redacted (`> classifies an error status from its
  body and keeps the key out of the detail`); the reply read after `transport.send` (`> reads the
  reply the transport brought back`)
- Mutation check: `minor > 7` (2 tests fail), thoughts kept (2), parts joined with `\n` (2), the
  `MAX_TOKENS` rule removed (1).
- Deliberate differences: notes in the system channel on every request (D-16.24); the token
  limit is always sent, so `generationConfig` is never left out (R03.9); `role: "user"` on the one
  turn; an unusable limit falls back to 1 024 rather than being left out.
- Not taken: the compact re-ask prompt and the re-ask itself (P03-15, P03-17); the one 1.5 s
  "interactive" retry (D-16.23: one ladder, P03-06); the Coach multi-turn chat call (P08).

## Decisions for the lead

- The adapter input (`AdapterInput` in `src/ai/adapters/request.ts`) holds one `system` text: the
  client (P03-17) appends the notes for the AI before calling any adapter, so all three formats
  and every role get the same text (R03.23). A blank system text sends no system channel.
- `ProviderId` in `request.ts` lists the sixteen ids of glossary 17 §1.1 because the catalogue
  (P03-03) landed in parallel; at land time it can become an import from `src/ai/catalog`.
- `read(status, bodyText, context?)` takes the optional `ReplyContext` of P03-01 so a classified
  detail has the stored key cut out; it also classifies a non-2xx status itself, so it is total.
- `readGemini` returns `truncated` for any `MAX_TOKENS` stop and drops the partial text; the
  client re-asks.

## Status

Done (2026-10-26). Created `src/ai/adapters/gemini.ts`, `gemini.test.ts` (45 tests), the shared
`src/ai/adapters/request.ts` with `request.test.ts` (6 tests), this note. Nothing changed outside
the task's files.
