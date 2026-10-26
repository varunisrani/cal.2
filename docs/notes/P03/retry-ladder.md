# Task: retry ladder (P03-06) · Phase: 03 · Owner: builder (wt-p03s1, wave B slice S1)

Read (reference @ `10e14b67`): `A/services/ai/RetryPolicy.kt` (all), test
`T/services/ai/RetryPolicyErrorTest.kt` (all); the retry cases of
`T/services/ai/RetryPolicyThreadingTest.kt` (retried replies, exhausted retries still classified).
Research spec `03-ai-providers.md` §3.9 (statuses, ladders, last-response classification), traps
R03.6 and R03.18; decisions D-16.23 and D-16.60. Builds on P03-05's `send` and `Deadline` and
P03-01's `classify`.

What it does (own words): a provider that says it is busy (429 too many requests, 503
unavailable, 529 overloaded) gets asked again, after 1 s, then 2 s, then 4 s: four tries at most.
That is the only thing that is retried. A reply with any other status fails straight away, and a
request that got no reply at all (offline, refused connection, our cap, our deadline, the
person's cancel) is never repeated. The provider's own `Retry-After` hint is ignored, so the
waits are the same on every provider. Every wait sits inside the action's deadline: a wait that
would run into the end of the budget is not started, and the action ends at once with the busy
error it already has; a Cancel during a wait ends it immediately and silently. When the tries run
out, the failure is read from the last reply's status and body, so details only that body carries
(Gemini's per-day quota id) still give the right kind. The same ladder serves every wire format
and every entry point (food, plans, fit check, Coach), because they all send through it.

Inputs → outputs: `sendWithRetry(url, init, sendOptions)` (the same options as `send`, the
deadline among them) → the first 2xx `WireReply`, or throws an `AiFailureError`: the kind from
`classify(status, body)` of the last reply, or the transport's failure (cancelled, timeout,
offline, connection) unchanged. `RETRY_WAITS_MS` = `[1000, 2000, 4000]`.

Files: created `src/ai/retry.ts`, `src/ai/retry.test.ts`.

Edge cases / failure modes:
- 429, 429, 429, 200: success on the fourth request, sent at 0 s, 1 s, 3 s and 7 s of fake time.
- Four 503s: overloaded after exactly four requests, never a fifth.
- 529 is retried like 503; 500, 502, 504, 400, 401, 404 are not.
- A network failure on any try stops the ladder with that failure, even after earlier busy
  replies.
- A `Retry-After: 30` header changes nothing.
- Gemini daily quota on a 429, four times: four requests, and the final kind is dailyQuota, not
  rateLimit (R03.18): the last body is classified, not a remembered status.
- The deadline: a wait that would end at or after the deadline stops the ladder at once with the
  last reply's kind (no pointless wait); an attempt still running when the deadline fires ends as
  timeout. Either way the action never runs past the budget (ACC-E4-2).
- Cancel during a wait: cancelled at once, no further request, nothing shown.
- A slow busy reply eats into the budget: the remaining time is read again before every wait.

Our design differences / decisions:
- One ladder for every format and entry point (D-16.23). The reference's short interactive ladder
  (one retry after 1.5 s for some food calls) is not taken; the overall deadline bounds the wait
  instead.
- Waits respect the overall deadline and Cancel (D-16.23, D-16.60); the reference sleeps through
  them.
- Names are ours: `sendWithRetry`, `RETRY_WAITS_MS`, `BUSY_STATUSES`. The ladder calls our
  transport directly instead of taking a call factory; each try is a fresh `send` with its own
  attempt signal and cap.

Tests we will write (`src/ai/retry.test.ts`):
- 429 ×3 then 200 → success after waits of 1/2/4 s (request times checked).
- 503 ×4 → overloaded after four requests (ACC-E4-1); 529 also retried.
- 500 (and other statuses) → one request, classified; a network failure → one request,
  connection, also after a busy reply.
- `Retry-After` ignored.
- Gemini daily-quota 429 ×4 → dailyQuota after four requests (R03.18, the retry part).
- Cancel during a wait → cancelled at once, no further request.
- A wait that would pass the deadline stops early with the last error; a 180 s deadline ends a
  four-try ladder of slow busy replies early as timeout, never later than 180 s (ACC-E4-2).
- A user server (no cap) keeps the remaining budget across tries.

Compare checklist (filled after the rewrite; reopened `A/services/ai/RetryPolicy.kt`,
`T/services/ai/RetryPolicyErrorTest.kt` and the retry cases of
`T/services/ai/RetryPolicyThreadingTest.kt`; every branch of the loop walked against
`src/ai/retry.ts`). Test names are in `src/ai/retry.test.ts` under `sendWithRetry`.
- [x] Retryable statuses 429, 503 and 529 only (`waits 1, 2 and 4 s between tries: 429, 429, 429,
      then 200 succeeds`, `retries 529 like 503`); every other status gets one request, classified
      from its body, never showing it (`never retries any other status: one request, classified
      from its body`, which also covers the reference's 402 → credits, 404 → model, 500 → generic)
- [x] Waits of 1, 2 and 4 s, four requests at most, the busy message after the last (`retries a
      busy provider three times, then shows the busy message (ACC-E4-1)`)
- [x] Network failures never retried, also after a busy reply (`never retries a request that got
      no reply, even after a busy reply`); our own attempt cap is not retried either (`never
      retries an attempt that ran past its 75 s cap`)
- [x] `Retry-After` ignored (`ignores Retry-After and keeps its own waits`)
- [x] The last response is classified, so the daily quota survives four tries (`keeps the daily
      quota of the last reply through four tries (R03.18)`, `reads the kind from the last reply,
      not the first`)
- [x] A cancellable wait: Cancel during a wait ends at once and shows nothing (`stops at once when
      the person cancels during a wait`)
- [x] One ladder for every format (`works the same for every wire format`)
- [x] Inside the deadline (our addition): a wait that would pass it stops early with the last
      error (`stops early with the last error when a wait would pass the deadline`, `gives the
      last error, not a timeout, when the deadline ends during a wait`); the deadline ends a
      ladder still running, never later than the budget (`ends a ladder of slow busy replies from
      a user server at the 180 s deadline (ACC-E4-2)`, `ends a four-try cloud ladder at the 180 s
      deadline, never later (ACC-E4-2)`); a user server keeps what is left of the budget across
      tries (`gives each try at a user server the budget still left`)
- Deliberate differences: one ladder everywhere (D-16.23), with no short interactive ladder; waits
  bounded by the overall deadline and Cancel (D-16.23, D-16.60); a wait that cannot finish
  before the deadline is not started and the last reply's kind is given at once; each try is a
  fresh `send` with its own attempt signal instead of a call factory.
- Not taken: the interactive one-retry ladder (1.5 s) and the choice of ladder per call; the
  "HTTP <code>" placeholder message (P03-01 classifies the body and keeps the status as a number).

## Decisions for the lead

- **Entry point.** `sendWithRetry(url, init, options)` takes the same options as `send` and is the
  only way P03-17 (and P08's Coach rounds) should send; it resolves with the first 2xx
  `WireReply` and rejects with an `AiFailureError`. In-body errors of a 2xx reply (an
  OpenAI-compatible `error` inside a 200) are not retried here; the adapters read them.
- **Wait vs deadline.** A wait is skipped when it is at least as long as the budget left; the
  failure is then the last reply's kind (overloaded, rateLimit, dailyQuota…), not timeout, so the
  person still learns the provider was busy. A try cut by the deadline is a timeout.
- **Daily quota still retried.** A 429 carrying a per-day quota is retried like any 429 (four
  requests), as the reference does and as D-16.23 says; only the final kind reads the body. If
  the lead prefers to stop at once on a daily quota, it is a one-line rule in `retry.ts`.

## Status

Done (2026-10-26). `src/ai/retry.ts` and its tests are in place; no file outside the task's set
changed. Acceptance row ACC-E4-1 and the retry part of trap R03.18 now have tests; R03.6 and
ACC-E4-2 are shared with P03-05 (listed in the final report for the ledgers).
