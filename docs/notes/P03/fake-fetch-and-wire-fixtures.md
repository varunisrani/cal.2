# Task: fake fetch and wire fixtures (P03-02) · Phase: 03 · Owner: builder (wt-p03a, wave A)

Read (reference @ `10e14b67`): none. The phase row lists no reference counterpart: this is our own
test plumbing, and the reference's test doubles (an OkHttp mock server, a URL protocol stub) are
not a model for it. Read `docs/plan/phases/P03-ai-layer.md` (P03-02 row and the Verify cases of
P03-05, P03-06, P03-07..09, P03-17 that will use it), spec `03-ai-providers.md` §3.2 (reply shapes
per wire format), §3.9 (retry statuses) and §3.15 (browser failures), and the lint rule 3 in
`eslint.config.js` (only the network modules and tests may touch the global `fetch`). Vendor reply
shapes are third-party protocols: the Gemini `GenerateContentResponse` (candidates, parts with
`thought`, `finishReason` values, `usageMetadata` names) was checked against Google's API
reference on 2026-10-26, the Anthropic error shape against Anthropic's error reference the same
day; the OpenAI chat-completion shape is written from the public API shape (`choices[].message`,
`finish_reason`, `usage`). All text inside the fixtures is ours.

What it does (own words): unit tests of the AI layer never touch the network and never hold a
real key. Instead, each test builds a fake `fetch`, tells it which replies to give for which
addresses, hands the function to the code under test, and afterwards reads back every request the
code made. The fake behaves like the browser's `fetch` where our code depends on it: a reply can
arrive late (the delay runs on Vitest's fake timers, so a test moves time forward instead of
waiting), the body itself can arrive late, a reply can be a network failure (the browser's opaque
`TypeError`), and an `AbortSignal` stops it at any of those points with the signal's reason. A
request that no reply was queued for is a mistake in the test, so it fails the test even when the
code under test swallows the error. `wire.ts` builds realistic success replies of the three wire
formats and the error bodies vendors send, so adapter, retry, client and Coach tests share one set
of shapes.

Inputs → outputs:
- `createFakeFetch()` → `{ fetch, requests, on(pattern), remaining(), takeProblems() }`.
- `on(pattern)` (a URL substring or a RegExp) → a route; `route.reply(...replies)` queues
  replies used in order. A request takes the next reply of the first matching route that still
  has one.
- Reply builders: `jsonReply(body, init?)`, `textReply(text, init?)`, `networkFailure(init?)`;
  init: `{ status?, headers?, delayMs?, bodyDelayMs? }`.
- `requests[i]` → `{ url, method, headers (lower-cased), body (parsed JSON, else the text), at
  (fake-clock ms when it arrived), signal }`.
- `wire.ts`: `geminiReply(parts, options)` with `geminiPart.text/thought/call`; `openAiReply(
  content, options)` (string, parts or null content, reasoning field, tool calls, finish reason,
  in-choice error) with `openAiPart.text`; `anthropicReply(blocks, options)` with
  `anthropicBlock.text/thinking/toolUse`; error bodies `geminiError`, `openAiError`,
  `anthropicError`, `stringError`, `detailError`.

Files: created `src/ai/testing/fakeFetch.ts`, `src/ai/testing/fakeFetch.test.ts`,
`src/ai/testing/wire.ts`, `src/ai/testing/wire.test.ts`.

Edge cases / failure modes:
- Signal already aborted when `fetch` is called: rejects at once with the signal's reason, records
  nothing and uses no reply (a browser sends nothing either).
- Abort while the reply is delayed: the timer is cleared and the promise rejects with the reason
  (an `AbortError` for a plain `abort()`, our own reason when one is given, e.g. a deadline's
  `TimeoutError`).
- Abort while the body is still arriving (`bodyDelayMs`): the response has resolved, and reading
  the body rejects with the reason (needed by P03-05: Cancel during the body read).
- The delay timer must be set inside the `fetch` call itself (no `await` before it), so a test can
  call `advance()` right after `fetch()`.
- Statuses that cannot have a body (204, 205, 304) get none; any status 200–599 is allowed.
- No matching route, or a matching route with no reply left: the promise rejects with an `Error`
  naming the method and URL, the problem is kept, and the running test fails when it finishes even
  if the code swallowed the rejection. `takeProblems()` lets a test that expects the problem
  collect it.
- A `Request` object instead of a URL: refused loudly (the AI layer always calls with a URL and an
  init; reading a `Request` body is async and would hide the timer).
- Request bodies: JSON text is parsed; other text is kept as text; no body is `undefined`.
- The fake must not use the global `fetch` (lint rule 3): it is a function passed in.

Our design differences / decisions:
- Everything is ours (no counterpart). The fake is created per test and holds no module state.
- The loud failure uses Vitest's `onTestFinished` registered at the first problem, so the fake
  can be created anywhere (in a test, in `beforeEach`); outside a running test only the
  rejection remains.
- Routes match a substring of the URL, not the whole URL, so tests can write
  `':generateContent'` or `'/chat/completions'`.
- `at` on each request lets retry tests check the waits between attempts (1 s, 2 s, 4 s) without
  spying on timers.
- `wire.ts` fills the fields a real reply carries (ids, `usage`, `modelVersion`, `role`) with
  fixed made-up values, so adapters are tested against full shapes, not minimal ones; the text is
  always the caller's.
- Tool-call parts (Gemini `functionCall`, OpenAI `tool_calls`, Anthropic `tool_use`) are included
  because Coach tests (P08) use the same builders.

Tests we will write:
- `fakeFetch.test.ts`: queued replies come back in order (status, JSON and text bodies, headers);
  two routes keep their own queues; an aborted signal rejects with an AbortError (already aborted,
  and aborted during the delay, and with a custom reason); a delay of 5 s resolves only after
  `advance(5000)`; a body delay and abort during the body read; a network failure is a
  `TypeError`; every request is recorded (URL, method, headers, parsed body, arrival time); 204
  has no body; an unmatched URL rejects, is collected by `takeProblems()`, and fails the test
  loudly when swallowed (`it.fails`); a used-up route; a `Request` input refused.
- `wire.test.ts`: each builder's output has the vendor field names (candidates/parts/thought and
  finishReason; choices/message/finish_reason with string, parts and reasoning; content blocks and
  stop_reason); error bodies have the shapes the classifier reads, and P03-01's `classify` reads
  them to the expected kinds.

Compare checklist (filled after the rewrite; no reference files reopened: the row says none, so
the comparison is against the row's Verify cases and the uses planned by P03-05..09 and P03-17).
Test names are in `src/ai/testing/fakeFetch.test.ts > createFakeFetch` unless another file is
named.
- [x] Queued replies come back in order with status, headers and body (`gives queued replies back
      in order, with their status, headers and body`); one queue per route, URL part or RegExp
      (`keeps one queue per route and matches a URL part or a RegExp`, `moves on to the next
      matching route once the first is used up`)
- [x] An aborted signal rejects with an AbortError: before sending (`rejects with an AbortError
      when the signal is already aborted, sending nothing`), during the delay (`rejects with an
      AbortError when the signal aborts during the delay`), with the caller's own reason (`rejects
      with the reason the signal was aborted with`), during the body read (`delivers a slow body
      after its own delay, and an abort meanwhile fails the body read`)
- [x] A delay of 5 s resolves only after `advance(5000)` (`resolves a reply with a 5 s delay only
      after advance(5000)`)
- [x] Unmatched URL fails the test loudly (`fails the test loudly for an unmatched URL even when
      the caller swallows the error`, an `it.fails` test; checked once by disabling the hook,
      which made it fail); the rejection names the request (`rejects a request with no queued
      reply and names it`); used-up route and `Request` input (`rejects a request whose route is
      used up, and a Request object`)
- [x] A network failure is a `TypeError`, with or without delay (`fails like a browser network
      error with a TypeError`); 204 has no body, 299 is allowed, bad statuses and delays refused
      (`sends no body for 204 and accepts any status from 200 to 599`)
- [x] Every request recorded with URL, method, lower-cased headers, parsed or raw body and
      arrival time (`records every request: URL, method, lower-cased headers, parsed body and
      arrival time`)
- [x] Wire builders (`src/ai/testing/wire.test.ts`): Gemini parts with thought and call and
      finish reasons, and a candidate without parts (`geminiReply > builds one candidate with
      text, thought and call parts and a finish reason`, `geminiReply > defaults to one text part
      and STOP, and leaves parts out when there are none`); OpenAI-compatible string, parts and
      null content, the three reasoning fields, tool calls and an in-choice error (`openAiReply >
      …`, three tests); Anthropic blocks and stop reasons (`anthropicReply > builds content blocks
      with a stop reason`); error bodies read by `classify` (`error bodies > have the shapes the
      classifier reads, and travel through the fake fetch`)
- Deliberate differences: n/a (no reference behaviour).
- Not taken: a reply that repeats forever (tests queue `n` copies instead); matching on method or
  body; a `Request` object as input; Gemini `promptFeedback` (blocked prompt) and streaming
  bodies (not used by the AI layer; a test can pass its own object to `jsonReply`).

## Decisions for the lead

- **API for wave B/C and P08.** `const net = createFakeFetch(); net.on(':generateContent')
  .reply(jsonReply(geminiReply('…')), jsonReply(geminiError({…}), { status: 429 }));` then pass
  `net.fetch` as the `fetch` dependency and read `net.requests`. Reply builders: `jsonReply`,
  `textReply`, `networkFailure`; options `status`, `headers`, `delayMs`, `bodyDelayMs`.
  `FetchFunction` is the injected type (`(input, init?) => Promise<Response>`, which the browser's
  `fetch` satisfies); P03-05 may define its own equal type in `transport.ts`.
- **Loud failures** go through Vitest's `onTestFinished`, registered at the first problem of a
  test; a test that expects an unmatched request calls `net.takeProblems()` to collect it.
- **Abort reasons**: the fake rejects with `signal.reason` (an `AbortError` for a bare
  `abort()`), so a deadline that aborts with a `TimeoutError` reason is seen as such.
- **Request recording** includes the key headers (adapter tests check them); the fake records
  nothing for a request whose signal was already aborted, like a browser.
- `src/ai/testing/fakeFetch.ts` does not trip lint rule 3 (it never names the global `fetch`); no
  rule change was needed.
- One extra file beyond the table: `src/ai/testing/wire.test.ts`.

## Status

Done (2026-10-26). `src/ai/testing/{fakeFetch,wire}.ts` with tests. No file outside the task's set
changed for this task.
