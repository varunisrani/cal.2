# Task: Chat engine (P08-08) · Phase: 08 · Owner: builder (wt-p08s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/ChatService.kt` (`sendMessage` and `runProvider`
for the order of the steps: provider choice, key check, the fallback around the whole run, the
proposal reset per attempt; the OpenAI loop only for where the round cap and its error sit),
`I/Services/ChatService.swift` (the fallback block: cancel never falls back, the fallback's error
is surfaced), `I/Services/AIRequestErrorPolicy.swift` (which error is shown when both fail), then
`T/services/ai/RetryPolicyThreadingTest.kt` (cancel while headers or body are pending stops the
call; retries that run out still classify the last error body; a body cut midway is a connection
failure). Research spec `04-coach.md` §1, §3.6, §3.11, §3.12, §6 traps R04.1, R04.11, R04.19,
R04.22; decisions D-16.22, D-16.23, D-16.31, D-16.32; acceptance ACC-I8-1, ACC-I8-2, ACC-I12-1.
Landed parts read as our own API: `src/ai/chat/{types,round}.ts` (P08-05..07),
`src/ai/client.ts` (P03-17: roles, the not-set-up refusal, the standby rule, `withDeadline`),
`src/services/coach/{context,tools,limiter,history,snapshot}.ts` (P08-01..04).

What it does (own words): one Coach question becomes one turn. The engine picks who answers (a
question with a photo goes to the primary; one without goes to the text provider when it is on,
else the primary) and refuses at once, before anything is sent, when that provider is not set up.
The photo, if any, is redrawn as a fresh JPEG at the Coach's model size. The system text is built
once from the data snapshot taken when the person pressed Send, with the notes for the AI at its
end. Then the turn runs as rounds on the provider's wire: each round sends the whole conversation
so far; when the model asks for tools they run locally against that same snapshot (never the live
stores, R04.22), every result is cut by the 60 000-character limiter, and the next round carries
the calls and their results. A turn may send at most six rounds, the answer round included
(R04.19); a sixth reply that still asks for tools ends the turn as `roundLimit`, its own failure
kind with its own message (R04.11). A reply cut off twice in one round is `truncated` (inside
`askRound`). Every request shares the turn's one deadline and the retry ladder (D-16.23). When an
attempt fails for any reason but Cancel or the deadline, and a standby is set up for this kind of
question, the whole turn starts again from round one on the standby, with a fresh conversation in
its own format: nothing the failed attempt sent or received is reused (R04.1). The result is the
answer text, or one failure with its kind and the provider's message (keys removed) for Details.

Inputs → outputs:
- `runTurn({messages, question: {id, text}, image?, snapshot}, deps)` →
  `Result<string, AiFailure>`; `deps` are the client's `AiDeps` (settings, keys, fetch, an optional
  deadline or Cancel signal, an optional image backend).
- `messages` is the stored conversation; the engine builds the history per attempt with
  `coachHistory(messages, question, format)` (P08-04), so the standby gets its own role names.
- `MAX_ROUNDS = 6`.

Files: created `src/services/coach/engine.ts`, `src/services/coach/engine.test.ts`, this note.

Edge cases / failure modes:
- Role not set up (no key where one is needed, Custom without model or address) → `noKey`,
  `model` or `invalidUrl` before any request, and no standby (the client's rule, P03-17).
- A photo that cannot be prepared → `imageConversion` before any request, no standby.
- Round 6 asks for tools → `roundLimit`; its tools are not run and no seventh request goes out.
- Two tool rounds then text → the answer, three requests.
- A wire or tool that throws → `generic` (or `cancelled`/`timeout` when the deadline stopped).
- An empty answer → `invalidResponse` (the wires already give it; the engine checks again).
- Cancel at any point → `cancelled`, no standby, no further request.
- The deadline runs out → `timeout`, no standby (it would only be cut off).
- Primary fails, standby answers → the standby's answer; its first request holds only the
  history and the question, never the primary's tool calls or results (R04.1).
- Both fail → `bothFailed` naming both providers with the standby's failure; a cancelled standby
  stays a silent `cancelled`.
- A tool result over 60 000 characters → cut by the limiter before it is sent (D-16.32).
- Data stored while the turn runs is not seen: tools only read `input.snapshot` (R04.22).
- Every stored key is cut out of a failure's detail (all keys, not only the one used).

Our design differences / decisions:
- Names and structure are ours: one `runTurn` over the landed round contract; an attempt is a
  plain loop over `askRound` and `continueWith`, so a standby attempt cannot see the first one's
  transcript (no shared collector to reset).
- A round is one `askRound`: the retry ladder and the one compact re-ask after a cut stay inside
  it, as in the reference, where the re-ask did not use up a round. "At most 6 requests" in the
  row is read as six rounds.
- A role that is not set up fails without trying the standby, as every other AI request does
  (P03-17). The reference let the fallback try after a missing primary key.
- The deadline is the client's `withDeadline`: one per turn from the timeout setting and the
  Cancel signal, or the caller's own.
- The system text is built once per turn and shared by both attempts; the history is rebuilt per
  attempt for the attempt's format.
- When both fail the engine returns `bothFailed` like the client; the session decides what to
  store (P08-09).

Tests we will write (`engine.test.ts`, fake fetch only, fake time):
- Two tool rounds then text → the answer; three requests; the second and third carry the calls
  and limited results (ACC-I8-1).
- Six tool rounds → `roundLimit`, exactly six requests, the sixth round's tools not run (R04.19,
  R04.11, ACC-I8-2).
- A cut-off reply asked again inside its round does not use up a round.
- Primary 401 → the standby re-runs from round one: its first request holds no tool message
  from the primary's attempt and the answer is the standby's (R04.1, ACC-I12-1); a standby on
  another format gets the history in its own role names.
- Both fail → `bothFailed` with the standby's failure; the stored key is not in the detail.
- Cancel during a round → `cancelled`, no standby request.
- Data written to the diary while a turn runs is not in the tool result (R04.22).
- No key → `noKey`, nothing sent; Custom without address → `invalidUrl`.
- A photo question goes to the primary with the photo at the Coach size; a text question goes to
  the text provider when it is on.
- The system text carries the snapshot's context and the notes once; the tools are the six.
- A huge tool result is limited before it is sent (R04.9 through the engine).

Compare checklist (filled after the rewrite; reopened `A/services/ai/ChatService.kt`
`sendMessage`, `runProvider`, the ends of the three loops and `MAX_TOOL_ROUNDS`;
`I/Services/ChatService.swift` fallback block; `I/Services/AIRequestErrorPolicy.swift`;
`T/services/ai/RetryPolicyThreadingTest.kt`):
- [x] Text with a text provider on → that provider; a photo → the primary (tested in
  `src/services/coach/engine.test.ts` > runTurn: what a request carries > sends a question without
  a photo to the text provider when it is on; > sends a photo question to the primary with the
  photo at the Coach size, though a text provider is on)
- [x] Key check before any request (`> runTurn: before any request > refuses without a key for
  the provider in use, and the standby is not tried`; `> refuses a Custom server without an
  address`); unreadable photo (`> refuses a photo the browser cannot read, sending nothing`)
- [x] Tool calls answered locally and carried into the next round; text ends the turn (`> runTurn:
  rounds (04 §3.11, R04.19) > answers after two tool rounds, each round carrying the calls and
  their results (ACC-I8-1)`)
- [x] Six rounds, the answer's included; a sixth tool reply → `roundLimit`, no seventh request
  (`> ends with roundLimit when the sixth round still asks for tools, and sends no seventh
  (R04.11, ACC-I8-2)`; `> counts the answer round among the six: five tool rounds and the answer
  fit (R04.19)`)
- [x] The compact re-ask stays inside its round (`> keeps the re-ask after a cut-off reply inside
  its round, so it uses up no round`); cut twice → `truncated`, its own kind (`> gives truncated,
  its own kind, for a reply cut off twice (R04.11)`)
- [x] Fallback re-runs the whole turn from scratch; nothing from the failed attempt goes with it
  (`> runTurn: the standby (R04.1, D-16.22) > re-runs the whole turn on the standby after the
  primary fails, with nothing from the first attempt (ACC-I12-1)`); any failure sends it in, a
  round limit included (`> also sends the standby in after a round limit`)
- [x] Cancel never falls back (`> stops silently on Cancel and never starts the standby`); the
  deadline neither (`> gives timeout when the turn’s time runs out, with no standby (D-16.23)`)
- [x] When both fail the standby's failure is what the person can act on, here inside
  `bothFailed` naming both (`> names both providers when both fail, keeping the standby’s failure
  without any stored key`); single failure redacted (`> gives the primary’s failure, detail
  redacted, when no standby is set up`)
- [x] Retries per round on the shared ladder, a cancel mid-request stops the call, an exhausted
  ladder still classifies the last body (covered by the landed `src/ai/chat/round.test.ts` and
  `src/ai/retry.test.ts`; the engine only calls `askRound`)
- [x] Notes once, the six tools, history then question (`> runTurn: what a request carries >
  sends the facts of the snapshot, the notes once, the six tools and the history`)
- [x] Every result through the limiter on every provider (`> cuts every tool result to the 60
  000-character limit before sending it (R04.9, D-16.32)`)
- [x] Tools read only the snapshot of Send (`src/services/coach/session.test.ts` >
  createCoachSession: send (04 §3.6) > runs the tools on the data as it stood at Send, not on
  what is logged meanwhile (R04.22))
- Mutation check (each made alone, then reverted): round limit off by one (2 tests fail); no
  limiter (1); the standby continuing the primary's transcript (1); standby tried after Cancel or
  the deadline (1: the timeout test; after Cancel the stopped deadline already sends nothing).
- Deliberate differences: a role that is not set up fails without the standby (as the client,
  P03-17; the reference let the fallback try); the sixth round's tools are not run before the
  round-limit failure (the reference ran them and threw away the results: no visible change);
  both failing gives `bothFailed` (D-16.22) where the reference showed the fallback's error; a
  Gemini or Anthropic cut-off is detected (R04.15, in the wires); every provider gets the
  limiter (D-16.32); the round limit has its own kind (R04.11).
- Not taken: the on-device and hosted paths (later phases), the per-attempt proposal collector
  (workouts, L3), the tool-free prompt variant (on-device only).

## Decisions for the lead

- Note slugs follow the task prompt (`chat-engine.md`, `coach-session.md`); the phase file lists
  `coach-session-service.md` for P08-09.
- A round is one `askRound` call: the retry ladder and the one compact re-ask run inside it, so
  "at most 6 requests" in the row means six rounds (as the reference counted).
- A primary that is not set up (no key, Custom without model or address) fails at once without
  the standby, as every other AI request (P03-17). The reference tried the fallback then.
- `runTurn` takes the client's `AiDeps` and uses `withDeadline`; the session passes its Cancel
  signal, so one deadline from the timeout setting covers the whole turn and the standby.
- The engine exports `MAX_ROUNDS`; the system text is built once per turn, the history once per
  attempt for that attempt's format.

## Status

Done (2026-10-27). `src/services/coach/engine.ts` and its 18 tests. Nothing changed outside the
slice's files for this task. P08-09 (same slice) loads it with a dynamic import at send time.
