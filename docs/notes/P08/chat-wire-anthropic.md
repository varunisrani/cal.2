# Task: Chat wire: Anthropic with tools (P08-06) · Phase: 08 · Owner: builder (wt-p08s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/ChatService.kt` (the Anthropic tool loop: body,
history, the `tool_use` branch, the answer rule), `I/Services/ChatService.swift` (its Anthropic
loop: same shape, image block first, first text block as the answer). No reference test covers
this loop. Research spec `04-coach.md` §2 (protocol names), §3.11 (common rules and the Anthropic
block), §6 traps R04.12 and R04.15; the landed adapter note `docs/notes/P03/anthropic-adapter.md`
(browser header, R03.1). Vendor check on 2026-10-27: Anthropic's "Define tools" and "Handle tool
calls" pages (tool `{name, description, input_schema}`; `tool_use` blocks `{id, name, input}`;
results in one `user` message as `tool_result {tool_use_id, content, is_error?}` that must
immediately follow the assistant turn and come first in its content; every `tool_use` id needs its
result).

What it does (own words): a Coach turn on Anthropic's Messages API. Every round sends the model,
`max_tokens` (the person's answer limit), our system text with the notes in `system`, the six
tools with their schemas under `input_schema`, and the conversation: earlier messages as plain
user/assistant strings, then the new question as a string, or with a photo an image block then a
text block. Requests carry the key, the API version and the direct-browser-access header, exactly
as the landed adapter sends them (without that header a browser sees no reply at all). When the
reply holds `tool_use` blocks, the assistant turn goes back into the conversation with its content
array exactly as returned (text, thinking and tool blocks alike), followed by one user message that
answers every `tool_use` id with a `tool_result` block, in the model's order. Otherwise the first
text block that is not blank is the answer. A reply stopped by the limit (`stop_reason:
max_tokens`) is not taken as complete: it is asked again once with the same body, and a second cut
is `truncated` (R04.15).

Inputs → outputs:
- `anthropicChat.open({history, text, image?})` → the transcript.
- `anthropicChat.build(setup, transcript, compact)` → `POST {base}/messages`; `compact` changes
  nothing on this format.
- `anthropicChat.read(status, body, context?)` → `{kind: answer, text}`, `{kind: tools, calls,
  echo}` or a failure (`truncated`, `invalidResponse`, classified).
- `anthropicChat.continueWith(transcript, round, run)` → transcript + echo + one results message.

Files: created `src/ai/chat/anthropicChat.ts`, `src/ai/chat/anthropicChat.test.ts`, this note;
uses `src/ai/chat/types.ts`, `round.ts` and `src/ai/testing/toolWire.ts` (P08-05).

Edge cases / failure modes:
- Two `tool_use` ids → one user message with two `tool_result` blocks, same order.
- Text and thinking blocks beside `tool_use` → tools; the echo keeps every block untouched.
- `tool_use` with an id but no name → `tool_result` with an error text and `is_error: true`
  (R04.12); without an id → cannot be answered, left out; no answerable call → `invalidResponse`.
- `input` missing or not an object → `{}`.
- `max_tokens` stop, with or without text or tool blocks → truncated (a cut `tool_use` has partial
  input).
- `content` missing or not a list, only blank text, a body that is not JSON → `invalidResponse`;
  an error status → classified, key redacted.
- Blank system → no `system` field; empty tool list → no `tools` field.

Our design differences / decisions:
- R04.15: `stop_reason: max_tokens` is detected and re-asked once; the reference ignored it.
- R04.12: a nameless call with an id is answered with an error result (`is_error: true`) instead of
  being skipped.
- The direct-browser-access header on every round (R03.1), like the landed adapter.
- The answer is the first non-blank text block (as the phase row says), not every text block
  joined (the food adapter's rule): a tool-using reply may carry a preamble block.
- Image block before the text block (the reference's iOS order; Android put the text first).

Tests we will write (`anthropicChat.test.ts`):
- Headers: browser header, key, version on every round; body: model, `max_tokens` = cap,
  `system`, tools with `input_schema`, history strings, user string or image-then-text.
- Reader: two `tool_use` ids → calls in order with the echo as returned; tools win over text;
  first non-blank text block is the answer; `max_tokens` → truncated even with a `tool_use`;
  unusable shapes; error status classified.
- `continueWith`: echo then one user message with two results; nameless call → error result with
  `is_error`.
- `askRound`: `max_tokens` → one re-ask with the same body → answer; twice → truncated (R04.15).

Compare checklist (filled after the rewrite; reopened `A/services/ai/ChatService.kt` Anthropic
loop and `I/Services/ChatService.swift` Anthropic loop):
- [x] Browser-access header, key and version on every round, re-ask included (R03.1)
  (`src/ai/chat/anthropicChat.test.ts > anthropicChat.build > sends the browser-access header, the
  key and the version on every round (R03.1)`; on the wire: `askRound on the Anthropic wire
  (R04.15) > asks again once with the same body after a max_tokens stop`)
- [x] Model, `max_tokens` = cap, `system`, tools with `input_schema`, history as strings, the
  question (`anthropicChat.build > sends the model, the cap as max_tokens, the system text, the
  tools and the conversation`); photo as image block then text block (`> sends a photo as an image
  block before the text block`); blank system and empty tools left out, same body on the re-ask
  (`> leaves out a blank system text and an empty tool list, and sends the same body on a re-ask`)
- [x] `tool_use` blocks in order, the content array echoed as it came, thinking and text blocks
  kept (`anthropicChat.read > reads two tool_use blocks in order, with the content array as it
  came`); `input` not an object → `{}` (`> reads input that is missing or not an object as {}`)
- [x] Nameless `tool_use` with an id kept; no id anywhere → unusable (`> keeps a tool_use with an
  id but no name; finds nothing usable when no block has an id`)
- [x] First non-blank text block is the answer (`> takes the first text block that is not blank as
  the answer, trimmed`); unusable shapes (`> finds nothing usable in blank text, missing content or
  a body that is not JSON`); error status classified and redacted (`> classifies an error status
  without the key`)
- [x] `max_tokens` → cut off, with text or a `tool_use` (R04.15) (`> reads a max_tokens stop as cut
  off, with text or with a tool_use (R04.15)`); one re-ask then the answer (`askRound on the
  Anthropic wire (R04.15) > asks again once with the same body after a max_tokens stop`); second
  cut → truncated (`> gives truncated after a second max_tokens stop`)
- [x] Echo, then one user message with a `tool_result` per id in order (R04.12)
  (`anthropicChat.continueWith (R04.12) > appends the assistant turn, then one user message with a
  result per id, in order`); nameless call → error result with `is_error`, not run (`> answers a
  tool_use without a name with an error result, without running it`)
- [x] Two rounds through the fake fetch (`askRound on the Anthropic wire (R04.15) > runs a tool
  round then an answer round, the second carrying the turn and the results`)
- Mutation check: `max_tokens` not read (3 tests fail), browser header dropped (2), `is_error`
  dropped (1).
- Deliberate differences: `max_tokens` detected and re-asked (R04.15); nameless calls with an id
  answered with an error (R04.12); a tools reply with no answerable call is unusable; the browser
  header (R03.1); image block first (iOS order); no key → no `x-api-key` header (the engine's key
  check runs first, as the reference's no-key error did); blank system and empty tools left out.
- Not taken: the loop, round limit, tools and standby (P08-08).

## Status

Done (2026-10-27). Uses the shared round contract of P08-05 (`src/ai/chat/types.ts`,
`round.ts`, `src/ai/testing/toolWire.ts`); nothing changed outside the slice's files for this task.
