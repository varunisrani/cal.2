# Task: Coach replies stream live (P18-02, D-16.106) · Phase: 18 · Owner: builder (wt-p18s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): nothing. The reference never streams (04 §1 "Replies are not
streamed", 04 Q6); D-16.106 is our own change, replacing D-16.47. Read instead: phase file P18
(D-16.106), 04 §1, §3.11–3.12 and R04.1, R04.11, R04.12, R04.13, R04.18, 03 R03.11 (Qwen),
16 D-16.23, D-16.31, D-16.60, D-16.99, our `src/ai/chat/**`, `src/ai/{transport,retry,deadline,
errors}.ts`, `src/ai/adapters/request.ts`, `src/services/coach/{engine,session}.ts`,
`src/features/coach/**`, `e2e/fake-ai/**`, `e2e/coach.spec.ts`. The vendors' public streaming
formats (Anthropic Messages SSE, OpenAI chat completions chunks, Gemini `streamGenerateContent`
with `alt=sse`) are protocol facts.

What it does (own words): every Coach round asks its provider for a streamed answer and the chat
shows the words as they arrive, in the pending bubble with a small working mark where the copy
button will be, so nothing moves when the reply lands. A round that asks for tools streams any text
it writes first, then its tools run once the round is over and the next round starts; its text
stays in view until the next round's text replaces it. The reply is stored only when it is
complete, as one message, exactly as before. A server that answers whole (an older Custom or Ollama
server, a JSON answer) is read whole as today; a server that refuses to stream (a 4xx that names
streaming, such as OpenAI's "organization must be verified to stream") is asked once more without
streaming, and the app remembers that for the rest of its run. A failure in the middle of a reply
keeps the question's error and Retry (I11), stores nothing partial, and the standby (I12) starts
the whole turn again. Thinking is never shown. The time limit and the 75 s attempt cap cover the
wait for the first byte and every silence between pieces, not a long reply that keeps coming.
Switching chats leaves the reply running (D-16.99); opening its chat shows it live.

Inputs → outputs:
- `src/ai/chat/sse.ts`: `readEvents(stream, onBytes?)` → async events `{ event, data }` over a
  `ReadableStream<Uint8Array>`; `parseEvents(text)` for a whole body. Pure: chunk boundaries
  anywhere (inside a line, a CRLF or a UTF-8 character), LF, CR and CRLF, comments, multi-line
  data, a last event without its blank line.
- `src/ai/chat/stream.ts` (lazy, with the engine): `sendStreamed(url, init, deadline, capMs,
  onEvent, options)` → `Result<Reply, SingleFailure>`: like `transport.send`, but a 2xx
  `text/event-stream` answer is read event by event (`Reply.streamed`), the time limit held while
  bytes keep coming, the cap restarted by every chunk; anything else read whole.
- Each chat wire gains `build(…, stream)` (Anthropic and OpenAI `stream: true`; Gemini
  `:streamGenerateContent?alt=sse`) and `stream(context)` → a `RoundStream`: `take(event)`,
  `text()` (the answer so far, as shown), `done()`, `finish()` → the same `RoundReply` as `read`
  (answer, or calls with their `echo` rebuilt in the wire's own shape) or one failure.
- `round.ts`: `askRound(…, { onText })` streams unless the provider is marked or refused, falls
  back on a whole answer, re-asks once without streaming after a refusal.
- `engine.ts`: `TurnInput.onText(text)` gets the text so far of the request streaming in; `''`
  when an attempt failed and the standby starts.
- `session.ts`: `CoachSessionState.live` — the text so far per chat; cleared when its turn ends.
- `MessageList.tsx`: `live` prop; the live bubble (`coach.live`), held until the stored reply or
  the failure replaces it; follows the end while the person is there.
- `e2e/fake-ai/server.ts`: a reply may be `events` (sent as server-sent events, `eventDelayMs`
  apart, `cutAfter` to break off); routes for the three formats.

Files: created `src/ai/chat/{sse,stream,anthropicStream,openaiStream,geminiStream}.ts` (+ tests),
`src/ai/testing/streamWire.ts` (recorded streams), `e2e/fake-ai/scripts/coach-stream.json`, this
note. Changed `src/ai/chat/{types,round,anthropicChat,openaiChat,geminiChat}.ts`,
`src/ai/deadline.ts` (`hold`), `src/services/coach/{engine,session}.ts`,
`src/features/coach/{CoachPage,MessageList,Bubble}.tsx`, `coach.module.css`, `followEnd.ts`,
`e2e/fake-ai/server.ts`, `e2e/coach.spec.ts`, `docs/user/coach.md`, tests. Shared:
`src/ai/testing/fakeFetch.ts` (a reply in timed chunks).

Edge cases / failure modes:
- A chunk boundary inside a line, inside `\r\n` or inside a multi-byte character; comments
  (`: ping`), `event:` names, `data:` over several lines, a stream whose last event has no blank
  line.
- Anthropic: `ping`; thinking and redacted thinking blocks never shown but kept for the echo (a
  thinking model's tool round must send them back); `input_json_delta` pieces joined and parsed at
  the end (none or malformed → `{}`); `stop_reason` `max_tokens` → cut off; an `error` event →
  classified by its error type (overloaded → `overloaded`, rate limit → `rateLimit`, …), status 0.
- OpenAI-compatible: `delta.content` text; `delta.tool_calls` pieces by `index` (id and name in
  the first, arguments in many); reasoning pieces (`reasoning`, `reasoning_content`,
  `reasoning_details`) kept for the echo and the reasoning-only rule; `finish_reason` `length` → cut
  off, `error` → classified; `[DONE]`; an error object in a data line.
- Gemini: each event a whole response with new parts; text parts not flagged as thoughts; whole
  `functionCall` parts; `finishReason` `MAX_TOKENS` → cut off; no candidate (blocked) → unusable;
  an `error` object → classified; a JSON array (the endpoint without `alt=sse`) read as events.
- A stream that ends before its end mark (no `message_stop`/stop reason, no `finish_reason`/
  `[DONE]`, no `finishReason`) → `connection`; a network drop mid-stream → `connection`/`offline`;
  silence longer than the cap → `timeout`; Cancel (Delete chat) → silent `cancelled`.
- A 2xx answer that is not `text/event-stream` → read whole by `read` (and a body that is plainly
  server-sent events under another content type is read as a stream).
- A cut reply streamed text, then the compact re-ask: the re-ask's text replaces it.
- The standby: the first attempt's text goes (`''`) before the standby starts; nothing of it is
  stored.
- Tool rounds: text of the round shown; calls run after the round; the next round's text replaces.
- The turn's end: the session drops the live text before the stored reply reaches the screen; the
  list keeps the last text until the reply (or the failure) arrives, so there is no gap.
- Screen readers: the growing text is inert (not read, not focusable, links included); the working
  mark is the status; the stored reply is announced once, when it is added.

Our design differences / decisions:
- `onText` hands up the whole text so far of the request now streaming (not bare deltas): a new
  round, the compact re-ask and the standby simply replace it.
- The time limit (the person's timeout) is held while bytes keep arriving (`Deadline.hold`); the
  attempt cap (75 s for clouds, the time left for Ollama and Custom) then measures each silence.
  Before the first byte both run as today.
- Refused streams: a 4xx (not 401, 403, 404, 408 or 429) whose provider message names streaming
  is asked again once without streaming; remembered per provider, address and model while the
  app runs.
- Marked as not streamed: Cerebras (its error replies carry no CORS header, so a refused stream
  would look like a network failure, R03.2). Every other provider is asked to stream.
- A stream cut before its end mark is a `connection` failure (no new kind, no new words).
- A failure inside a stream is not put on the retry ladder: the person may have seen text, and the
  standby or Retry starts afresh.
- Thinking blocks and reasoning pieces are rebuilt into the echo so tool rounds keep working on
  thinking models; they are never shown.
- The live bubble is the stored bubble's twin (Markdown, same padding); the working mark sits where
  the copy button comes, so the reply lands without a jump.
- Food analysis and every JSON task stay unstreamed (`client.ts`, `tasks/**` untouched).

Tests we will write:
- `sse.test.ts`: every boundary split of a recorded stream gives the same events; CRLF, CR,
  comments, multi-line data, ids/retry ignored, no blank line at the end, `parseEvents`.
- `anthropicStream.test.ts`, `openaiStream.test.ts`, `geminiStream.test.ts`: recorded streams for
  text, tool calls (pieces), thinking skipped, stop reasons (cut off), an error event, a cut
  stream; echoes that continue the transcript.
- `stream.test.ts`: event-stream read live with the time limit held, silence → timeout, the cap
  restarted by chunks, Cancel mid-stream, a non-stream answer read whole, an error status.
- `round.test.ts`: streamed text reaches `onText`; JSON fallback; refused stream re-asked once
  without streaming and remembered; Cerebras never streamed; compact re-ask after a streamed cut.
- `deadline.test.ts`: `hold` stops the count and resumes it; Cancel during a hold.
- `engine.test.ts`: text per round; tools run after a streamed tool round (set_reminder
  included); a mid-reply failure → standby from scratch with the text cleared.
- `session.test.ts`: `live` per chat while streaming, cleared at the end; nothing stored on a
  mid-reply failure; a reply streaming in another chat.
- `MessageList.test.tsx`/`CoachPage.test.tsx`: the live bubble, the working mark, held until the
  stored reply, inert, follows the end only at the end.
- `server.test.ts`: the fake streams in the three formats, with delays and a cut.
- `e2e/coach.spec.ts`: the text grows in the pending bubble, the reply is stored and survives a
  reload; a reply streaming in another chat shows live when opened.

Compare checklist (filled after the rewrite; no reference to reopen: it never streams, 04 §1 and
Q6; compared instead against D-16.106, the task's list and the vendors' published stream formats):
- [x] The SSE reader: any cut, LF/CR/CRLF, comments, multi-line data, no blank line at the end
  (`src/ai/chat/sse.test.ts`, every cut of a recorded stream; one byte at a time with CRLF)
- [x] Anthropic: text deltas, thinking never shown but echoed with its signature, `input_json_delta`
  pieces, `max_tokens` cut off, an `error` event classified by type, a cut stream
  (`src/ai/chat/anthropicStream.test.ts`)
- [x] OpenAI-compatible: content deltas, tool-call pieces by index and by id, reasoning kept for the
  echo and the reasoning-only rule, `length`, an error object, `finish_reason: error`, `[DONE]`
  missing, a cut stream (`src/ai/chat/openaiStream.test.ts`)
- [x] Gemini: `streamGenerateContent?alt=sse`, text and whole `functionCall` parts, thoughts never
  shown, `MAX_TOKENS`, blocked, an `error` object, a cut stream (`src/ai/chat/geminiStream.test.ts`)
- [x] A non-stream answer read whole; a stream under another content type; a refused stream asked
  again whole and remembered; Cerebras never asked; the compact re-ask streamed; a busy reply
  retried before its stream, a failed stream never (`src/ai/chat/round.test.ts > askRound: streamed
  replies (D-16.106)`; the Gemini and Anthropic round tests answer whole on the streamed requests)
- [x] First byte under the time limit and the cap; the limit held while pieces come; each silence
  capped; Cancel and a network drop mid-stream (`src/ai/chat/stream.test.ts`,
  `src/ai/deadline.test.ts > Deadline.hold`)
- [x] Text per round, tools run after their round (set_reminder included), the standby afresh with
  the words cleared, a cut stream without standby (`src/services/coach/engine.test.ts > runTurn:
  replies that stream in (D-16.106)`)
- [x] Live text per chat in the session, nothing stored before the end, nothing partial on failure,
  a chat deleted mid-stream (`src/services/coach/session.test.ts > createCoachSession: replies that
  stream in (D-16.106)`)
- [x] The live bubble, its mark in the copy button's place, inert words, held until the stored reply,
  gone for the banner, the dots again for the standby, following the end only at the end
  (`src/features/coach/MessageList.test.tsx > MessageList: a reply streaming in (D-16.106)`); a reply
  streaming in another chat shows when opened (`CoachPage.test.tsx`)
- [x] The fake serves streams on the three routes, with waits and a cut (`e2e/fake-ai/server.test.ts
  > streamed replies (D-16.106)`); the Coach e2e sees the words grow and the reply stored, in its
  own chat too (`e2e/coach.spec.ts > replies that stream in (P18, D-16.106)`)
- Deliberate differences: the reference has no streaming at all (D-16.106 replaces D-16.47).
- Not taken: a retry of a stream that failed before its first word (follow-up); a dedicated failure
  message for a reply cut midway (it reads as `connection`); throttling redraws to animation frames.

## Status

Done (2026-10-29). Shared lines outside the task's files: `src/ai/testing/fakeFetch.ts` (a reply in
timed pieces, `chunks`), `src/ai/transport.ts` (the `Reply.streamed` type only), `src/ai/deadline.ts`
(`hold`). Handed to the lead: the inventory line for I13 (P1) and its ACC rows, the CHANGELOG lines.
