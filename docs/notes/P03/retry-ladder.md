# Task: retry ladder (P03-06) · Phase: 03 · Owner: builder (wt-p03b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/RetryPolicy.kt` (all: which statuses are tried
again, the two wait lists, how the error kind is kept after the last attempt, what happens to a
network exception), then `T/services/ai/RetryPolicyErrorTest.kt` (the daily-quota body seen four
times; statuses that are not retried). Research spec `03-ai-providers.md` §3.9 and traps R03.6,
R03.18, R03.19; decision D-16.23.

What it does (own words): a provider that is busy for a moment (rate limited, unavailable or
overloaded) often answers a second later, so those three replies (HTTP 429, 503, 529) are tried
again after 1 s, then 2 s, then 4 s: at most four requests. Anything else is final at once: other
error statuses (a 500, a refused key, an unknown model) would fail again, and a request that got
no reply (offline, CORS, our timeout, Cancel) is not repeated. The same ladder serves every wire
format and every entry point (D-16.23 drops the reference's one-quick-retry variant for some food
calls). The ladder lives inside the action's deadline: it never starts a wait that would run past
the time left (it stops with the last error instead), and Cancel during a wait stops it at once.
When the last reply is still an error, its kind is read from that reply's status and body, so a
Gemini daily-quota body (`quotaId …PerDay…`) still gives "daily quota" after four tries (R03.18).

Inputs → outputs: `withRetries(attempt, deadline, { secrets? })` where `attempt()` is one
`transport.send` call → `Result<Reply, SingleFailure>`: the 2xx reply as soon as one arrives; a
failed attempt (no reply) as it is; for an error reply that is final, `fromReply(status, body,
{ secrets })` from P03-01 (kind by `classify`, provider text kept only as a redacted detail);
`cancelled` or `timeout` when the deadline stops a wait.

Files: created `src/ai/retry.ts`, `src/ai/retry.test.ts`, this note.

Edge cases / failure modes:
- 429, 429, 429, 200 → the 200, after waits of 1, 2 and 4 s (four requests, the fourth at 7 s).
- Four 503 → overloaded after four requests; no fifth. Four 429 with a plain body → rate limit;
  529 behaves like 503.
- `Retry-After: 30` on a 429 is ignored: the next request still goes after 1 s.
- 500, 404, 401, 402 → no retry, one request, classified.
- A network failure (TypeError), our timeout or a cancel → no retry, returned as it is.
- A wait longer than or equal to the time left → stop now with the last error (no wait).
- Cancel during a wait → cancelled at once, the wait's timer cleared, no further request.
- Status changes between attempts (503 then 404) → classified from the last reply (model).
- An in-body error inside a 200 (OpenAI family) is the adapter's to read (P03-08), not retried.

Our design differences / decisions:
- One ladder for every format and entry point (1, 2, 4 s); no 1.5 s interactive ladder (D-16.23).
- Bounded by the action's deadline: a wait that would pass it is not started (D-16.23, R03.6).
- The kind is classified once from the last reply rather than after every reply (same result,
  less work); the detail is redacted with the keys the caller passes.
- The ladder takes the attempt as a function so the client (P03-17) can compute each attempt's cap
  from the time left (self-hosted servers) and every adapter shares it.
- Names are ours (`withRetries`, `RETRY_WAITS_MS`, `isRetryStatus`).

Tests we will write (`retry.test.ts`, all on fake time through `transport.send` and `fakeFetch`):
- 429, 429, 429, 200 → success, requests at 0, 1, 3 and 7 s and not earlier.
- Four 503 → overloaded after four requests (ACC-E4-1), the busy message key; four 529 the same.
- Gemini daily-quota 429 four times → dailyQuota with four requests, the redacted detail kept
  (R03.18).
- `Retry-After` ignored.
- 500, 404, 401 → one request each; a TypeError → connection after one request.
- A wait that would pass the deadline stops early with the last error.
- Cancel during a wait → cancelled at once, one request, no timer left.
- The status mix: 503 then 404 → model.

Compare checklist (filled after the rewrite; reopened `RetryPolicy.kt`, `RetryPolicyErrorTest.kt`):
- [x] Retries 429, 503 and 529 only, after 1, 2 and 4 s: 429, 429, 429, 200 → success with
  requests at 0, 1, 3 and 7 s (`src/ai/retry.test.ts > withRetries: the ladder (03 §3.9,
  D-16.23) > waits 1, 2 and 4 s and then returns the success`; `withRetries: what is never
  retried > retries only 429, 503 and 529`)
- [x] Four 503 → overloaded and the busy message after four requests, no fifth (`withRetries:
  the ladder … > gives the busy message after four 503 replies and no fifth request
  (ACC-E4-1)`); 529 and plain 429 (`> treats 529 like 503, and four plain 429 replies as a rate
  limit`)
- [x] `Retry-After` ignored (`> ignores Retry-After`)
- [x] The kind comes from the last reply (`> classifies from the last reply when the status
  changes between tries`); the Gemini daily quota survives four 429s, four requests seen, the
  detail redacted (`withRetries: daily-quota details survive the retries (R03.18) > reads a
  Gemini daily quota from the fourth 429 after four requests`)
- [x] Non-retryable statuses: one request each, the message never holds the body (`withRetries:
  what is never retried > gives up after one request on 500 (generic)`, `… 404 (model)`,
  `… 401 (keyRejected)`, `… 402 (credits)`, `… 400 (generic)`)
- [x] A network exception is never retried (`> does not resend a request that got no reply
  (TypeError)`); neither is a capped attempt (`> does not resend an attempt that hit its cap`)
- [x] Inside the deadline: a wait that would pass it stops early with the last error
  (`withRetries: inside the deadline (D-16.23, R03.6) > stops early with the last error when a
  wait would pass the deadline`, `> does not start a wait that would end exactly at the
  deadline`); Cancel during a wait stops at once with no timer left (`> stops at once when the
  person cancels during a wait`); Cancel before the first request sends nothing (`> sends nothing
  when Cancel was pressed before the first request`)
- Mutation check: a strict `>` at the deadline boundary (1 test fails), ignoring the deadline
  (2), a wait deaf to Cancel (1), retrying 500 (2), retrying network failures (2).
- Deliberate differences: one ladder for every format and entry point, no 1.5 s interactive
  ladder (D-16.23); waits are bounded by the action's deadline; Cancel during a wait returns
  `cancelled` at once instead of relying on coroutine cancellation.
- Not taken: the reference's own body-message parsing (P03-01's `classify` reads every body
  shape); an "HTTP <code>" fallback message (messages are catalogue keys).

## Decisions for the lead

- `withRetries(attempt, deadline, { secrets })` takes the attempt as a function so P03-17 can
  compute each attempt's cap with `attemptCapMs(deadline, selfHosted)` and pass the provider for
  the refused-key hint. It returns `Result<Reply, SingleFailure>`; an in-body error inside a 200
  is the adapter's to read and is not retried.
- A wait equal to the time left is not started (`>=`): the next request would be cut at once, and
  the person learns more from the last error (busy, rate limited) than from "timeout".

## Status

Done (2026-10-26). Created `src/ai/retry.ts`, `retry.test.ts` (18 tests), this note. Nothing
changed outside the task's files.
