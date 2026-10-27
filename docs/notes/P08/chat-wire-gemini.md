# Task: Chat wire: Gemini with tools (P08-07) · Phase: 08 · Owner: builder (wt-p08s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/ChatService.kt` (the Gemini tool loop: body without
`generationConfig`, history roles, the `functionCall` branch and the response parts, the text
join), `I/Services/ChatService.swift` (the function-response helper only), then
`IT/AIModelRegistryTests.swift` lines 355–382 (id echoed when the call had one, omitted otherwise,
no part when the name is missing). Research spec `04-coach.md` §2 (protocol names), §3.11 (Gemini
block), §6 traps R04.13 and R04.15; the landed adapter note `docs/notes/P03/gemini-adapter.md`
(key header, thinking level, thought parts). Vendor check on 2026-10-27: Gemini API reference
(`FunctionCall` has an optional `id` and a required `name`; `FunctionResponse` requires `name` and
`response`; `Part.thought` and `Part.thoughtSignature`; `finishReason` `MAX_TOKENS`,
`MALFORMED_FUNCTION_CALL`; `promptFeedback.blockReason` with no candidates), thinking guide
(signatures ride on parts and must go back as received; the output limit includes thought tokens).

What it does (own words): a Coach turn on Gemini's `generateContent`. Every round sends our system
text with the notes as `systemInstruction`, the conversation as `contents` (earlier messages as
`user` and `model` text parts, then the new question: the photo as an `inlineData` part first, then
the text), the six tools as `functionDeclarations`, and `generationConfig` with
`maxOutputTokens` = the person's answer limit (the reference sent no limit for chat, R04.15) and
the thinking level the landed adapter picks for the model. When any part of the reply is a
`functionCall`, the model's turn goes back as `{role: model, parts}` with the parts exactly as they
came, so thought signatures survive; then one `user` turn holds a `functionResponse` per call:
`{name, response: {content: <the result object>}}`, plus the call's `id` when it had one (Gemini 3
pairs results by id) and no `id` field when it had none. Tool results are JSON object texts; one
that is not becomes a string under `content`, so `response` is always an object and nothing is
lost (R04.13). Otherwise the text parts that are not thoughts are joined and trimmed; nothing left,
or no candidate at all (a blocked prompt), is `invalidResponse`. `MAX_TOKENS` is asked again once
with the same body; a second cut is `truncated`.

Inputs → outputs:
- `geminiChat.open({history, text, image?})` → the `contents` so far.
- `geminiChat.build(setup, transcript, compact)` → `POST {base}/models/{model}:generateContent`
  with the key in `x-goog-api-key`; `compact` changes nothing on this format.
- `geminiChat.read(status, body, context?)` → answer, tools (`calls`, `echo`) or a failure.
- `geminiChat.continueWith(transcript, round, run)` → contents + model turn + function responses.

Files: created `src/ai/chat/geminiChat.ts`, `src/ai/chat/geminiChat.test.ts`, this note; uses
`src/ai/chat/types.ts`, `round.ts` and `src/ai/testing/toolWire.ts` (P08-05).

Edge cases / failure modes:
- Call with id → the response echoes it; without id → no `id` key at all.
- A `functionCall` without a name → no response part (`FunctionResponse.name` is required); a
  reply whose calls all lack a name → `invalidResponse`.
- `args` missing or not an object → `{}`.
- Parts with `thoughtSignature`, thought parts and text parts next to calls → echoed unchanged.
- Result text that is not a JSON object (an array, a number, not JSON) → `{content: <value or
  text>}`; an object → `{content: <object>}`.
- `MAX_TOKENS` with or without parts → truncated. Blocked prompt (no candidates), a candidate with
  no `content` or no `parts`, only thought parts, blank text → `invalidResponse`.
- History role `assistant` (or already `model`) → `model`.
- Blank system → no `systemInstruction`; empty tool list → no `tools`.

Our design differences / decisions:
- R04.15: `maxOutputTokens` is always sent and `MAX_TOKENS` is detected and re-asked once.
- R04.13: a result that does not parse as an object keeps its text under `content` instead of
  becoming `{}`.
- The thinking level of the landed adapter (R03.8) is sent on chat rounds too: the output limit
  includes thought tokens, so without it a Gemini 3 model could think its way into a cut.
- `parameters` carries our JSON Schema as the research spec names it; if a P08-02 schema ever needs
  keywords outside Gemini's schema subset, `parametersJsonSchema` is the vendor's field for that.
- The model turn is echoed as `{role: "model", parts}` with the returned parts untouched.

Tests we will write (`geminiChat.test.ts`):
- Body: `systemInstruction`, history roles user/model, new user parts image first, tools as
  `functionDeclarations`, `generationConfig.maxOutputTokens` = cap, thinking level, key header.
- Reader: function calls → calls with ids and args; returned parts echoed unchanged (thought
  signature kept); a nameless call left out; text join without thoughts; blocked prompt and
  missing parts → invalidResponse; `MAX_TOKENS` → truncated.
- `continueWith`: id echoed when present, absent otherwise; `response.content` is the result
  object; a non-object result kept as text (R04.13).
- `askRound`: `MAX_TOKENS` once → re-ask → answer; twice → truncated (R04.15).

Compare checklist (filled after the rewrite; reopened `A/services/ai/ChatService.kt` Gemini loop,
`I/Services/ChatService.swift` Gemini loop and function-response helper,
`IT/AIModelRegistryTests.swift` 355–382):
- [x] `systemInstruction`, history as user/model text parts, tools as `functionDeclarations`,
  `generationConfig.maxOutputTokens` = cap (R04.15), key in `x-goog-api-key`
  (`src/ai/chat/geminiChat.test.ts > geminiChat.build > sends the system text, user/model history,
  the tools and the cap (R04.15)`); thinking level (`> sends the thinking level the food adapter
  picks, and none for models before 3`); photo part first, `model` history role (`> sends the
  photo part before the text part, and reads a past model message as model`); blank system and
  empty tools left out, same body on the re-ask (`> leaves out a blank system text and an empty
  tool list, and sends the same body on a re-ask`)
- [x] Function calls read with ids and args; returned parts echoed unchanged, thought signature
  kept (R04.13) (`geminiChat.read > reads function calls with their ids and echoes the returned
  parts unchanged (R04.13)`)
- [x] A call without a name gets no response part; none named → unusable (`> leaves out a call
  without a name, and finds nothing usable when every call lacks one`)
- [x] Text parts joined without thoughts, trimmed (`> joins the text parts that are not thoughts,
  trimmed`); blocked prompt, missing parts, only thoughts, blank text, not JSON → unusable (`>
  finds nothing usable in a blocked prompt, missing parts, only thoughts or blank text`); error
  status classified and redacted (`> classifies an error status without the key`)
- [x] `MAX_TOKENS` → cut off, with text or calls (`> reads a MAX_TOKENS stop as cut off, with text
  or with calls (R04.15)`); one re-ask then the answer (`askRound on the Gemini wire (R04.15) > asks
  again once with the same body after a MAX_TOKENS stop`); twice → truncated (`> gives truncated
  after a second MAX_TOKENS stop`)
- [x] Function responses `{name, response: {content}}`, id echoed when the call had one, no `id`
  key otherwise (`geminiChat.continueWith (R04.13) > appends the model turn, then one user turn of
  function responses, ids echoed when given`); a non-object result still inside an object response
  (`> keeps a result that is not a JSON object inside an object response`)
- [x] Two rounds through the fake fetch, the second echoing the parts with their signature and the
  responses (`askRound on the Gemini wire (R04.15) > runs a tool round then an answer round, the
  second echoing the parts and the responses`)
- Mutation check: id not echoed (2 tests fail), cap dropped (1), `MAX_TOKENS` not read (3), parts
  rewritten instead of echoed (2).
- Deliberate differences: the cap and the thinking level are sent and `MAX_TOKENS` is re-asked
  (R04.15; the reference sent no `generationConfig` for chat); thought parts are not part of the
  answer (the reference's text join took every part with text, thought summaries included; our
  food adapter already skips them, R03.7); a non-object result keeps its value or text under
  `content` instead of becoming `{}` (R04.13); a reply whose calls all lack a name is unusable; the
  key header is written as our food adapter writes it (`x-goog-api-key`; header names are not case
  sensitive).
- Not taken: the hosted path and its limiter placement (later phase; the limiter runs in the
  engine's `run` for every provider, P08-08); `parametersJsonSchema` (kept `parameters`, see the
  decisions above).

## Status

Done (2026-10-27). Uses the shared round contract of P08-05 (`src/ai/chat/types.ts`,
`round.ts`, `src/ai/testing/toolWire.ts`); nothing changed outside the slice's files for this task.
