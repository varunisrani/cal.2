# Task: fake fetch and wire fixtures (P03-02) · Phase: 03 · Owner: builder (wt-p03a)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The phase row lists no reference reading: this is our own
test tooling, and the reference's tests use platform mock servers we do not copy. Read the P03-02
row and the rows that will use it (P03-05..09, P03-17, P03-18), research spec `03-ai-providers.md`
§2 (vendor wire names) and §3.2 (reply shapes, finish and stop reasons), §3.8 (truncation),
§3.9 (abort during the body read), §3.15 (error bodies per vendor), the P00-07 lint boundary
(only `src/ai/transport.ts` may call the global `fetch`), and the P00-09 note (the e2e fake
server, which this does not replace). All sample text in the fixtures is ours.

What it does (own words): every AI and Coach unit test needs to answer HTTP requests without a
network or a key, in a fixed order, and then check what was sent. `fakeFetch()` builds a function
with `fetch`'s signature that the test injects into the code under test (the code takes `fetch`
as a dependency; the global is never read, replaced or stubbed). The test lists, per URL pattern,
the replies to give in order: a status, headers, a JSON or text body, an optional delay that runs
on the (fake) timers, an optional delay for the body itself, or a network failure (a thrown
`TypeError`). Every request is recorded (URL, method, headers, parsed body). It honours
`AbortSignal` the way browsers do: an aborted signal rejects with the signal's reason (an
`AbortError` for a plain `abort()`), before the reply, during a delay, or while the body is still
arriving. A request that no pattern matches, or one more than the script holds, is a bug in the
test, so it fails the test even when the code under test catches the rejection.
`wire.ts` builds valid reply bodies for the three formats (Gemini, OpenAI-compatible, Anthropic),
with thought / reasoning parts and finish / stop reasons, and the vendors' error bodies, so
adapter and client tests do not hand-write vendor JSON.

Inputs → outputs:
- `fakeFetch()` → `{ fetch, on(pattern, ...steps), requests, pending(), takeUnscripted() }`. `pattern` is a string
  (the URL equals it or starts with it) or a `RegExp`; the first route whose pattern matches
  takes the request. A step is a reply `{ status = 200, headers, json | text, delayMs,
  bodyDelayMs }` or a failure `{ fail: 'network', delayMs }`. `on` returns the fake so calls chain;
  calling `on` again for the same pattern appends to that route's queue.
- `fetch(input, init)` → a `Response` built from the step (JSON bodies get
  `content-type: application/json` unless the step sets it; text bodies `text/plain`); statuses
  without a body (204, 205, 304) get none. `requests[n]` = `{ url, method, headers (lower-case
  names), body (JSON-parsed when it is JSON text, else the text, else undefined), signal }`.
- `pending()` → how many scripted steps are not used yet (lets a test assert the script was used
  up).
- Unscripted request: the promise rejects with an error naming the method, URL and the patterns
  that exist, and the current test is failed at its end (`onTestFinished`), so a `catch` in the
  code under test cannot hide it. `takeUnscripted()` returns those messages and forgets them, for
  a test that expects one.
- A malformed step (status outside 200–599, a negative or non-finite delay, both `json` and
  `text`, `json: undefined`) throws when it is scripted, not when it is used.
- `wire.ts`: `geminiAnswer(texts, {thoughts, finishReason})`, `geminiBlocked(reason)`,
  `openAiAnswer(content, {finishReason, reasoning, reasoningContent, reasoningDetails})` (content
  a string, `null`, or a list of text parts), `anthropicAnswer(texts, {thinking, stopReason,
  extraBlocks})`, and error bodies
  `geminiError(code, status, message, {quotaId})`, `openAiError(message, {type, code})`,
  `anthropicError(type, message)`, `stringError(message)` (xAI, Hugging Face), `detailError(message)`
  (Mistral). An in-body error of the OpenAI family is `openAiError(…)` sent with status 200.
  Plain-text error bodies need no builder (`{ text: '…' }`).

Files: created `src/ai/testing/fakeFetch.ts`, `src/ai/testing/fakeFetch.test.ts`,
`src/ai/testing/wire.ts`, `src/ai/testing/wire.test.ts`, this note.

Edge cases / failure modes:
- Signal already aborted when `fetch` is called: rejects at once, nothing is answered, the
  request is still recorded (the code did send it).
- Abort during `delayMs`: rejects at abort time with the reason; the timer is cleared, the step is
  used up (a real request would have reached the server).
- Abort after the headers but during `bodyDelayMs`: `response.text()` rejects with the reason
  (P03-05's "Cancel during the body read").
- A reason that is not an AbortError (our deadline's `TimeoutError`): rejected with that reason,
  as browsers do.
- `delayMs` honoured only by fake time: nothing settles before `advance(delayMs)`.
- Two routes that both match: the first registered wins; its empty queue is a loud failure, never
  a silent fall-through to the next route.
- Request body that is not JSON text: recorded as the raw text. A `Request` object as input: its
  URL, method and headers are read; its body is read before the reply is produced.
- A network-failure step: rejects with a `TypeError` (our own message), after its delay if any.

Our design differences / decisions:
- No reference counterpart; names are ours (`on`, `pending`, `fail: 'network'`).
- The fake never touches `globalThis.fetch`; tests inject `fake.fetch`. Types (`typeof fetch`,
  `Request`, `Response`, `Headers`) are used; the lint rule only blocks calls to the global.
- Unmatched or excess requests fail the test from `onTestFinished` as well as rejecting.
- Headers are recorded with lower-case names so tests do not depend on how the adapter spells
  them; values are kept as sent (tests check that a key is in a header, not in the URL).
- Wire builders return bodies only (JSON values); the test picks the status, so one builder
  serves success and failure cases and parser tests can use bodies without a fetch.
- Vendor field names follow §2 of the spec (`candidates`, `content.parts`, `thought`,
  `finishReason`, `choices`, `message.content`, `finish_reason`, `reasoning`,
  `reasoning_content`, `reasoning_details`, `content[]`, `stop_reason`, `error.message`,
  `details[].quotaId`). The adapter builders (P03-07..09) re-check them against the vendor docs.

Tests we will write:
- `fakeFetch.test.ts`: queued replies come back in order, per route, with status, headers and
  body; JSON and text bodies; 204 has no body; requests recorded (URL, method, lower-case headers,
  parsed JSON body, raw text body); a `Request` input; an already-aborted signal rejects with an
  AbortError; abort during the delay; abort during the body; a TimeoutError reason passes through;
  a 5 s delay resolves only after `advance(5000)` (not at 4 999 ms); a network step rejects with a
  TypeError; an unmatched URL and an excess request reject naming the URL, and fail the test even
  when the rejection is caught (an expected-failure test); `pending()` counts what is left; the
  global `fetch` is untouched.
- `wire.test.ts`: each builder's output has the vendor field names in the right places (thought
  parts flagged, finish and stop reasons, reasoning fields, content parts, error shapes with the
  quota id), and round-trips through `fakeFetch` as JSON.

Compare checklist (filled after the rewrite; no reference files reopened: tooling without a
counterpart; checked against the P03-02 Verify cases and the rows that will use it):
- [x] Queued replies in order (tested in `src/ai/testing/fakeFetch.test.ts > fakeFetch: scripted
  replies > answers queued replies in order, per route`, `> appends to a route when the same
  pattern is scripted again`)
- [x] Status, headers, JSON or text body, no body for 204 (`> sends the status, the headers and
  a JSON or a text body`); URL patterns (`> matches a string pattern as a prefix and gives a
  request to the first matching route`)
- [x] An aborted signal rejects with an AbortError (`fakeFetch: AbortSignal > rejects with an
  AbortError when the signal is already aborted, using no reply`, `> rejects at the moment of
  the abort while the reply is delayed`, `> fails the body read when the abort comes while the
  body is arriving`, `> rejects with the signal's own reason, such as a deadline's TimeoutError`,
  `> ignores an abort after the whole reply has arrived`)
- [x] A 5 s delay resolves only after `advance(5000)` (`fakeFetch: delays on fake timers >
  resolves a reply with a 5 s delay only after advance(5000)`, not at 4 999 ms; `> delivers a
  slow body only after its body delay`); a mutation that ignores `delayMs` fails 4 tests
- [x] A thrown TypeError (`fakeFetch: scripted replies > rejects with a TypeError for a network
  step, after its delay`)
- [x] Every request recorded (`fakeFetch: recorded requests > records the URL, method, headers in
  lower case and the parsed JSON body`, `> records a body that is not JSON as sent, and no body
  as undefined`, `> reads a Request object: its URL, method, headers and body`, `> records the
  request before its reply arrives`)
- [x] Unmatched URL fails the test loudly (`fakeFetch: requests the script does not cover >
  rejects an unmatched URL, naming it and the scripted patterns`, `> rejects a request beyond the
  script instead of falling through to another route`, and the expected-failure tests `> fails
  the test when the code under test swallows an unmatched request`, `> fails the test when the
  code under test swallows a request beyond the script`); with the `onTestFinished` check
  disabled those two report as failed
- [x] The global `fetch` is untouched (`fakeFetch: recorded requests > never touches the global
  fetch`)
- [x] Wire builders: thought parts, finish and stop reasons, reasoning fields, text parts, error
  shapes with the quota id, JSON round trip (`src/ai/testing/wire.test.ts`, 12 tests)
- Deliberate differences: n/a (no reference behaviour).
- Not taken: streaming replies (the AI layer sends no `stream: true`); per-request matching on
  method or body (tests read `requests` instead); `response.url` (not set on a constructed
  `Response`; nothing reads it yet).

## Decisions for the lead

- jsdom's `AbortController` makes `DOMException`s of another realm: check `error.name`
  (`AbortError`, `TimeoutError`), never `instanceof DOMException`, in code and tests.
- An already-aborted signal: the request is recorded but uses no scripted step (a browser never
  sends it). An abort during `delayMs` uses the step (the request was sent).
- `onTestFinished` comes from `vitest`, so `fakeFetch.ts` must stay out of app code (it is under
  `src/ai/testing/`; nothing in the app imports it). If you want that enforced, a lint rule
  blocking `**/testing/*` imports from non-test files would do it (not added: `eslint.config.js`
  is not mine).
- The wire builders return bodies only (`JsonObject`); the test picks the status. Model name
  `test-model`, ids and token counts are ours. Field names are from spec 03 §2; the adapter
  builders (P03-07..09) re-check them against the vendors' current API references.
- Added `src/ai/testing/wire.test.ts` (allowed by the task: "a wire test if you add one").

## Status

Done (2026-10-26). Created `src/ai/testing/fakeFetch.ts`, `fakeFetch.test.ts` (20 tests + 2
expected failures), `wire.ts`, `wire.test.ts` (12 tests). Nothing changed outside the task's
files.
