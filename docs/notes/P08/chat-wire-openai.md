# Task: Chat wire: OpenAI-compatible with tools (P08-05) · Phase: 08 · Owner: builder (wt-p08s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/ChatService.kt` (the OpenAI-compatible tool loop:
message list, body extras, the compact re-ask, the tool-call branch), `A/services/ai/
OpenAICompatibleClient.kt` lines 157–196 (Qwen switch, token-limit name, the GPT-6 tool rule),
`A/models/OpenRouterReasoningEffort.kt` (how the chat round and its re-ask form `reasoning`), and
for comparison `I/Services/ChatService.swift` (its OpenAI-compatible loop); then
`T/services/ai/OpenAITokenLimitParameterTest.kt` (`onlyDirectSolAndLunaToolRequestsDisableReasoning`)
and `T/services/ai/OpenRouterReasoningEffortTest.kt`. Research spec `04-coach.md` §2 (protocol
names), §3.11 (common rules and the OpenAI-compatible block), §6 traps R04.12, R04.18, R04.19;
`03-ai-providers.md` §3.2 O via the landed adapter note `docs/notes/P03/openai-compatible-adapter.md`.
Vendor check on 2026-10-27: OpenAI's Chat Completions reference (tool entry `{type: "function",
function: {name, description, parameters}}`, `tool_choice` `"auto"`, assistant `tool_calls[{id,
type, function: {name, arguments}}]`, tool message `{role: "tool", tool_call_id, content}`,
`finish_reason` `length`/`tool_calls`, `max_completion_tokens`, `reasoning_effort` including
`none`); OpenRouter's reasoning page (`reasoning.effort`, `exclude` hides the reasoning but the model
still reasons; reasoning should be passed back during tool use).

What it does (own words): the Coach talks to fourteen providers through `chat/completions`. A turn
is a list of messages that grows round by round. The first round sends our Coach system text with
the person's notes (D-16.24) as a `system` message, the earlier messages as plain user/assistant
strings, and the new question: a string, or with a photo an image part then a text part. Every
round also sends the six tools as functions with `tool_choice: "auto"`, the answer limit under the
name P03-08 picks (`max_completion_tokens` for OpenAI and for Custom gpt-5/6, o1/o3/o4 ids), and the
provider extras: Qwen thinking off, OpenRouter's reasoning from the effort setting, and
`reasoning_effort: "none"` for OpenAI's GPT-6 Sol and Luna (directly or on a Custom server), whose
tool calls need non-reasoning mode. A reply that asks for tools wins over any text in it: the
assistant message goes back into the list as it came, then one `tool` message per call id, in the
model's order; arguments that are not a JSON object read as `{}`, and a call with an id but no name
is answered with an error result so that every id has its answer (R04.12). A reply cut at the
limit (`length`), or one with reasoning but neither text nor tool calls, is asked again once in
compact form; only OpenRouter's body changes on the re-ask (reasoning hidden, low effort, R04.18);
a second cut is `truncated`. Otherwise the trimmed text is the answer.

Inputs → outputs:
- `openAiChat.open({history, text, image?})` → the transcript (messages without the system one).
- `openAiChat.build(setup, transcript, compact)` → `{url, init}`: `POST {base}/chat/completions`.
- `openAiChat.read(status, body, context?)` → `Result<RoundReply, SingleFailure>`: `{kind: answer,
  text}` or `{kind: tools, calls, echo}`; failures `truncated`, `invalidResponse` or classified.
- `openAiChat.continueWith(transcript, round, run)` → the transcript plus the echo and the results.
- Shared (`src/ai/chat/round.ts`): `askRound(wire, setup, transcript, deps)` sends one round on the
  retry ladder inside the turn's deadline and re-asks once in compact form after a cut.

Files: created `src/ai/chat/types.ts` (shared with P08-06/07), `src/ai/chat/round.ts`,
`src/ai/chat/round.test.ts`, `src/ai/chat/openaiChat.ts`, `src/ai/chat/openaiChat.test.ts`,
`src/ai/testing/toolWire.ts` (tool-call reply builders for all three formats), this note.
Shared edits (additive, no behaviour change): `src/ai/adapters/openaiCompat.ts` exports its
header builder and its reasoning/error-envelope checks; `src/ai/adapters/request.ts` `keyOf` takes
any object with a `key`.

Edge cases / failure modes:
- Two tool calls → two `tool` messages, in the calls' order, after the echoed assistant message.
- `arguments` not JSON, JSON but not an object, missing, or already an object → `{}` / the object.
- A call with an id and no (or a blank) name → error result, the tool runner is not called.
- A call without an id cannot be answered and is left out; a tools reply where no call has an id
  → `invalidResponse` (the next round could only be refused).
- Tool calls next to text → tools (text ignored). `finish_reason: length` with tool calls →
  truncated (the arguments may be cut).
- Reasoning-only reply (any of `reasoning`, `reasoning_content`, `reasoning_details`) → truncated.
- In-body error without choices, `finish_reason: "error"` → classified with status 0.
- Blank system text → no system message; an empty tool list → no `tools`, no `tool_choice`.
- GPT-6 rule: `gpt-6-sol`, `gpt-6-luna` and their `-…` variants after trimming, lower-casing and
  the last `/` segment, only for OpenAI and Custom; `gpt-6-solar`, `gpt-6.1-sol` and OpenRouter's
  `openai/gpt-6-luna` get nothing.

Our design differences / decisions:
- Names and structure are ours: a wire is four pure functions (`open`, `build`, `read`,
  `continueWith`) plus the shared `askRound`; the engine (P08-08) owns the 6-round loop, the tools,
  the limiter, the standby and the `roundLimit` failure.
- R04.12: a nameless call with an id gets an error result instead of being skipped.
- The photo goes before the text in the user message (the landed adapter's order; the reference's
  Android chat put the text first).
- OpenRouter on a normal round sends `reasoning: {effort}` (none for auto) without `exclude`, so
  the reasoning comes back inside the message we echo (OpenRouter asks for it back during tool
  use); the compact re-ask sends `{exclude: true, effort: "low"}`. The food adapter (P03-08) keeps
  excluding always: its replies are never echoed.
- The re-ask sends the same body otherwise: no compact note is added to the conversation (unlike
  the single-call client, P03-17), because the last message of a later round is a tool result.
- The assistant message is echoed as it came; only a missing `role` is filled in.
- A tools reply with no answerable call → `invalidResponse` (the reference looped and the next
  request would fail).

Tests we will write (`openaiChat.test.ts`, `round.test.ts`):
- Body: system, history strings, user string / image-then-text, tools as functions, `tool_choice`,
  token field per P03-08, Qwen, OpenRouter reasoning, `reasoning_effort: none` for gpt-6-luna and
  sol variants only on OpenAI and Custom, headers.
- Reader: two calls in order with the echo verbatim; precedence over text; malformed arguments;
  nameless call kept with its id; idless calls left out; length and reasoning-only → truncated;
  answers; in-body errors.
- `continueWith`: two `tool` messages in order; a nameless call gets the error result (R04.12).
- `askRound`: `length` → one compact retry → answer; twice → truncated; OpenRouter retry body has
  `effort: low` and `exclude: true`; another provider's retry body is identical (R04.18).
- A two-round exchange through the fake fetch: the second request carries the echo and the results.
- `round.test.ts`: a 503 is retried inside the round; a key in an error reply is redacted; Cancel →
  cancelled with no re-ask; the wire for each provider's format.

Compare checklist (filled after the rewrite; reopened `A/services/ai/ChatService.kt` OpenAI loop,
`A/services/ai/OpenAICompatibleClient.kt` 157–196, `A/models/OpenRouterReasoningEffort.kt`,
`I/Services/ChatService.swift` OpenAI loop, `T/services/ai/OpenAITokenLimitParameterTest.kt`,
`T/services/ai/OpenRouterReasoningEffortTest.kt`):
- [x] System message, history as plain strings, the new message as a string
  (`src/ai/chat/openaiChat.test.ts > openAiChat.build: body > sends the system text, the history as
  strings, the question, the tools and auto choice`); with a photo, image part then text part
  (`> sends a photo as an image part before the text part`)
- [x] Tools as functions with `tool_choice: "auto"` (same test); none sent for an empty list (`>
  leaves out the system message when the system text is blank, and the tools when none`)
- [x] Token cap name per P03-08 (`> names the token cap as P03-08 does: %s %s → %s (R03.10)`)
- [x] Qwen `enable_thinking: false` (`> turns Qwen thinking off`); Bearer key, OpenRouter
  attribution, no key for Ollama (`> sends the key as a Bearer token, OpenRouter attribution, and
  no key for Ollama`)
- [x] `reasoning_effort: none` for gpt-6-sol/luna and `-…` variants on OpenAI and Custom only
  (`openAiChat.build: reasoning switches > sends reasoning_effort none to %s %j so it can call
  tools`, `> sends no reasoning_effort to %s %j`)
- [x] OpenRouter: effort on a normal round, nothing for auto (`> names the OpenRouter effort on a
  normal round and leaves the reasoning in the reply`); `{exclude: true, effort: low}` on the
  re-ask (`> hides OpenRouter reasoning and asks for low effort on the compact re-ask (R04.18)`);
  every other provider's re-ask body identical (`> sends the same body on the re-ask to every
  provider but OpenRouter (R04.18)`)
- [x] In-body error and `finish_reason: "error"` classified; error status classified; key
  redacted (`openAiChat.read > classifies an error inside a success reply and an error status,
  without the key`); unusable shapes (`> finds nothing usable in blank content, a missing message
  or a body that is not JSON`)
- [x] Compact re-ask on `length` (`askRound on the OpenAI-compatible wire (R04.18) > asks again
  once after a length stop and takes the second reply`) and on a reasoning-only reply (`> asks
  again once after a reply that only reasoned`); second cut → truncated, no third request (`>
  gives truncated after a second cut, with no third request`); OpenRouter retry body (`> changes
  only OpenRouter’s reasoning on the re-ask: hidden, low effort`)
- [x] `length` read as cut off even with tool calls (`openAiChat.read > reads a length stop as cut
  off, even with tool calls`); reasoning-only → cut off (`> reads a reply that only reasoned as cut
  off`)
- [x] Tool calls win over text (`> lets tool calls win over text in the same reply`); calls in
  order with the message echoed as it came (`> reads two tool calls in order, with the assistant
  message as it came`); malformed and missing arguments → `{}` (`> reads arguments given as %s as
  {}`, `> reads missing arguments as {}`)
- [x] Echo then one `tool` message per id, in order (R04.12) (`openAiChat.continueWith (R04.12) >
  appends the assistant message as it came, then one tool message per call, in order`); nameless
  call with an id → error result, not run (`> answers a call with an id but no name with an error
  result, without running it`, `openAiChat.read > keeps a call that has an id but no name, so its
  id can be answered (R04.12)`)
- [x] A call without an id left out; none answerable → unusable (`> leaves out a call without an
  id, and finds nothing usable when no call has one`)
- [x] Two rounds through the fake fetch, the second carrying the echo and both results (`askRound
  on the OpenAI-compatible wire (R04.18) > runs a tool round then an answer round, the second
  carrying the echo and the results`)
- [x] Shared round: 503 retried inside the round (`src/ai/chat/round.test.ts > askRound > retries
  a busy provider inside the round on the shared ladder (D-16.23)`), refused key redacted and not
  re-asked (`> classifies a refused key with the key cut out of the detail, and does not
  re-ask`), Cancel silent (`> stops silently on Cancel, with no re-ask`), key flag for the
  refused-key hint (`> tells the transport whether a key went along, for the refused-key hint
  (R03.2)`), wire per format (`chatWireFor > gives each provider the wire of its format`)
- Mutation check (each change made alone, then reverted): nameless call run anyway (1 test
  fails), no OpenRouter compact body (2), GPT-6 rule as a bare prefix (1), `length` not read (4),
  a tools reply with no answerable call accepted (1), no re-ask in `askRound` (8).
- Deliberate differences: a nameless call with an id is answered with an error (R04.12); a tools
  reply with no answerable call is unusable; the photo goes first; OpenRouter's normal rounds keep
  the reasoning in the reply (no `exclude`), which matches the reference's chat and differs from
  our food adapter; a reasoning-only reply cut twice ends as `truncated` (the reference ended it
  as an unreadable reply, as P03-08 already decided for single calls); a blank system text sends
  no system message; an empty tool list sends no `tools`; arguments that arrive as an object are
  taken as they are; a missing `role` on the echoed message is filled in.
- Not taken: the round loop, the six-round cap and the round-limit failure, running the tools,
  the result limiter, the standby and the key check (engine, P08-08); the reference's OpenRouter
  attribution values (ours are Platewise's).

## Decisions for the lead

- Note slugs follow the task prompt (`chat-wire-openai.md`, `chat-wire-anthropic.md`,
  `chat-wire-gemini.md`); the phase file lists `chat-wire-*-with-tools.md`. Update the phase list
  if the prompt's names stay.
- The round contract for P08-08 (`src/ai/chat/types.ts`, `round.ts`): `chatWireFor(provider)`
  gives a `ChatWire`; `wire.open({history, text, image?})` starts a transcript;
  `askRound(wire, setup, transcript, {fetch, deadline, secrets})` sends one round (retry ladder,
  attempt cap, one compact re-ask) and returns `{kind: answer, text}`, `{kind: tools, calls,
  echo}` or a `SingleFailure`; `wire.continueWith(transcript, reply, run)` appends the echo and
  one result per call, calling `run(call)` (the engine's tool runner, limiter included) once per
  named call in order. The engine keeps the 6-request cap, `roundLimit`, the key check, the photo
  preparation (`COACH_PHOTO`), the notes (`withNotes`) and the standby, which re-opens a fresh
  transcript on its own wire (R04.1).
- History roles: `PastMessage.role` accepts `user`, `assistant` and `model` (read as the
  assistant), so P08-04 may hand over either naming.
- OpenRouter chat rounds send `reasoning: {effort}` without `exclude` (none at all for auto), so
  the reasoning stays in the message we echo; the re-ask sends `{exclude: true, effort: "low"}`.
- Gemini chat rounds also send the landed adapter's thinking level (R03.8) next to
  `maxOutputTokens`: the limit includes thought tokens. Tool schemas go in `parameters` as the
  research spec names it; `parametersJsonSchema` is the vendor's field if a P08-02 schema needs
  keywords outside Gemini's schema subset.
- The compact re-ask adds no note to the conversation on any format (the single-call client
  adds one to its prompt): only OpenRouter's body changes (R04.18).
- A tools reply in which no call can be answered (no ids on OpenAI/Anthropic, no names on Gemini)
  reads as `invalidResponse`.
- Shared edits, additive and without behaviour change: `src/ai/adapters/openaiCompat.ts` exports
  `headersFor` (now typed on `provider` and `key` only), `carriesError` and `hasReasoning`;
  `src/ai/adapters/request.ts` `keyOf` takes any object with a `key`.

## Status

Done (2026-10-27). P08-05 built and compared; the shared round contract (`types.ts`, `round.ts`)
and the tool-call reply builders (`src/ai/testing/toolWire.ts`) serve P08-06/07 and the engine
(P08-08). Lines changed outside the task's files: the exports listed under "Decisions for the
lead". Handed on to P08-08: the loop, tools, limiter, standby and round limit.
