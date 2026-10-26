# Task: transport and deadlines (P03-05) · Phase: 03 · Owner: builder (wt-p03b1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/RetryPolicy.kt` (the cancellation parts: how a
cancelled caller cancels the call before the headers and while the body is still arriving, and
which status range counts as success), `A/services/SecureHttpClient.kt` (for timeouts: it holds
none, only TLS checks; the cloud timeouts are as spec 03 §3.9 lists them), then
`T/services/ai/RetryPolicyThreadingTest.kt` (the cancellation cases: cancel before the headers,
cancel during a slow body, a body cut off midway). Research spec `03-ai-providers.md` §3.9 and
traps R03.2, R03.6, R03.26; decisions D-16.23 and D-16.60 (`18-phase-wise-build-plan.md`,
confirmed in `16-what-we-change.md`).

What it does (own words): every model call made for one thing the person asked for (analyse this
photo, build my plan, one Coach turn) runs under one time limit, the person's timeout setting
(default 180 s, 30–600 s). The limit covers the first provider, its retries, the compact re-ask,
the standby and the unit repair together, and the Cancel button can stop it at any point. A
`Deadline` joins the two ways an action can be stopped (Cancel and the clock) into one abort
signal, says how much time is left, and remembers which of the two stopped it, so the failure can
read as "cancelled" (shown as nothing) or "timeout", never as a network error. On top of that,
one request to a fixed cloud provider may take at most 75 s (a stuck provider must not eat the
whole budget); a server the person runs themselves (Ollama, Custom) may use whatever is left of
the budget, since for those the timeout setting is the call limit. `transport.send` is the one
place that calls `fetch` for AI: it adds that per-attempt limit, treats every 2xx as success,
reads the body as text and turns a thrown error into one failure kind. It never logs.

Inputs → outputs:
- `startDeadline({ timeoutSeconds, cancel? })` → `Deadline { signal, remainingMs(), stoppedBy(),
  end() }`. `signal` aborts at the limit (reason named `TimeoutError`) or when `cancel` aborts
  (its own reason, an `AbortError`), whichever is first. `stoppedBy()` is `'cancel'`,
  `'deadline'` or undefined while running. `remainingMs()` counts down from the limit and is 0
  once stopped. `end()` clears the timer and the Cancel listener when the action is over.
- `attemptCapMs(deadline, selfHosted)` → the longest the next attempt may take: the smaller of
  75 000 and the time left for a cloud provider; the time left for a self-hosted one.
- `send(url, init, deadline, attemptCapMs, { fetch?, provider?, keySent? })` →
  `Result<Reply, SingleFailure>`. `Reply = { status, ok, body }` with `ok` true for 200–299 and
  `body` the text ('' for none). Thrown errors → `fromNetwork(error, { stoppedBy, provider,
  keySent })` from P03-01: our limit or the per-attempt cap → timeout, Cancel → cancelled, the
  device offline → offline, else connection (with the refused-key hint where it applies).

Files: created `src/ai/deadline.ts`, `src/ai/deadline.test.ts`, `src/ai/transport.ts`,
`src/ai/transport.test.ts`, this note.

Edge cases / failure modes:
- Cancel while the body is still arriving: the read fails with the abort, reported as cancelled
  even when the device says it is offline (R03.6).
- Cancel before the headers arrive, and a Cancel signal that is already aborted when the action
  starts: stopped at once, no request sent for the latter.
- The per-attempt cap fires at exactly 75 s (not at 74.999 s) and reads as timeout; it is not
  armed when the time left is shorter (the deadline covers it).
- 204 (no body) and 299 are success; 300 and above are not (the ladder and classifier read them).
- A body cut off midway (the read throws a TypeError) is a connection failure, like any other
  failed read.
- Cancel and the limit both firing: the first one wins and stays the answer.
- A send after the deadline has stopped: no request, the matching failure.
- A non-finite or non-positive timeout is a programming error (RangeError): the settings module
  (P03-04) clamps the setting to 30–600 s before it gets here.

Our design differences / decisions:
- Names are ours (`Deadline`, `startDeadline`, `stoppedBy`, `attemptCapMs`, `send`, `Reply`).
- One overall limit per action instead of per-call timeouts only (D-16.23); the 75 s cap applies
  to fixed cloud providers and Ollama and Custom get the remaining budget (D-16.60). The
  reference's separate connect, write and read timeouts do not exist in `fetch`; one per-attempt
  timer replaces them.
- Failures are returned as values (`Result` from `src/lib/result.ts`), not thrown, because P03-01
  models failures as plain `SingleFailure` objects.
- `send` owns the abort signal: `init` cannot carry one (its type leaves `signal` out).
- `fetch` is injected for tests (`fakeFetch`); the default calls the browser's `fetch` through a
  wrapper so it is never called with the wrong `this`.
- Timers are `setTimeout` (fake time drives them), not `AbortSignal.timeout`, which fake timers do
  not control.
- Which provider is self-hosted is a boolean from the caller: the catalogue (P03-03) knows it.

Tests we will write:
- `deadline.test.ts`: remaining time counts down with fake time and is 0 at the limit; the limit
  aborts the signal with a `TimeoutError` and reads as `deadline`; Cancel aborts with an
  `AbortError` and reads as `cancel`; an already-aborted Cancel stops at once; the first cause
  wins; `end()` clears the timer and stops listening; bad timeouts throw; `attemptCapMs` gives
  75 s, the smaller remaining time, and the remaining budget for self-hosted servers; with the
  ladder: a 180 s limit ends a 4-attempt ladder early, at 180 s exactly; the time left is
  accounted across attempts and waits; a provider that never answers is stopped at the limit
  (ACC-E4-2).
- `transport.test.ts`: 200, 201, 204 and 299 are success, 300 and 404 are not; the body comes
  back as text; method, headers and body pass through; Cancel during the body read → cancelled,
  not offline; Cancel before the headers → cancelled; the limit during a request → timeout; the
  75 s cap fires at 75 s and not before; a self-hosted request may run past 75 s; a stopped
  deadline sends nothing; a network failure → connection or offline, with the provider hint; no
  timer is left after a send; nothing is logged.

Compare checklist (filled after the rewrite; reopened `RetryPolicy.kt`, `SecureHttpClient.kt`,
`RetryPolicyThreadingTest.kt`; a grep for the timeout values showed they are set where the
analysis client is built, which matches §3.9):
- [x] Any 2xx is success, 204 and 299 included; 300 and 404 are replies the ladder reads
  (`src/ai/transport.test.ts > send: any 2xx is a success (R03.26) > counts 200, 201, 204 and
  299 as success, and 300 and 404 as not`; R03.26)
- [x] The body is read to the end, as text, inside the abort scope (`> reads the body as text,
  and an empty body as an empty string`, `send: Cancel and the time limits (R03.6) > caps the
  body read too`)
- [x] Cancel while the body is arriving stops the call and reads as cancelled, not as a network
  failure (`> reports Cancel during the body read as cancelled, not offline`); Cancel before the
  headers (`> reports Cancel before the headers arrive as cancelled`); our stop is known even when
  fetch rejects with a bare TypeError (`> knows who stopped the request even when fetch says only
  "network error"`)
- [x] A body cut off midway is a connection failure (`send: a request that gets no reply (R03.2)
  > reports a body cut off midway as connection`); network failure, offline and the refused-key
  hint (`> reports a network failure as connection, or offline when the device is offline`,
  `> passes the provider on, for the refused-key hint`)
- [x] The 75 s per-attempt cap fires at 75 s, not before (`send: Cancel and the time limits
  (R03.6) > stops one attempt at its 75 s cap, not before, as timeout`;
  `src/ai/deadline.test.ts > one time limit for the whole action (D-16.23, R03.6, ACC-E4-2) >
  stops a stuck cloud request at 75 s, well inside a long limit`); Ollama and Custom get the
  remaining budget instead (`attemptCapMs: the limit of one attempt (D-16.60) > gives a
  self-hosted server whatever is left of the budget`, `send: … > lets a request with the whole
  budget as its cap run past 75 s`)
- [x] A 180 s deadline ends a 4-attempt ladder early, at 180 s exactly (`one time limit for the
  whole action … > ends a four-attempt ladder early, at 180 s exactly`); remaining time across
  attempts and waits (`> accounts the time left across attempts and waits`); a provider that
  never answers stops at the limit (`> stops a provider that never answers at the limit, never
  later`) (ACC-E4-2)
- [x] Deadline: count-down, TimeoutError at the limit, AbortError on Cancel, the first cause
  wins, `end()` lets go (`Deadline: the time limit and Cancel`, 6 tests)
- [x] Nothing logged; no timer or listener left (`send: nothing is logged > never writes headers,
  bodies or errors to the console`, `send: … > leaves no timer and no listener behind`)
- Mutation check: only-200 success (2 tests fail), dropping `stoppedBy` (1), no attempt cap (5),
  a 75 s cap for self-hosted servers (2), time left after a stop (2).
- Deliberate differences: one overall deadline per action (D-16.23); one per-attempt timer in
  place of separate connect, write, read and call timeouts (`fetch` has no such knobs); the
  75 s cap only for fixed cloud providers, the remaining budget for Ollama and Custom (D-16.60);
  failures are values, not exceptions.
- Not taken: the TLS certificate checks of `SecureHttpClient` (the browser owns TLS); reading the
  body on another thread (a browser `fetch` never blocks the page); keeping reply headers (no
  caller reads them: `Retry-After` is ignored and the hosted quota is out of scope).

## Decisions for the lead

- `send` returns `Result<Reply, SingleFailure>` (`src/lib/result.ts`) and never throws for a
  network problem: P03-01 models failures as plain objects. An error status is a `Reply` with
  `ok: false`; only the ladder turns it into a failure (with `fromReply`).
- `send`'s fourth parameter is the per-attempt cap in ms; callers get it from
  `attemptCapMs(deadline, selfHosted)` before each attempt. `selfHosted` (Ollama, Custom) should
  come from the provider catalogue (P03-03): please give it a property for that.
- The per-attempt cap reads as `timeout` and is not retried (spec: a request without a reply is
  never resent); the client (P03-17) then tries the standby inside the remaining deadline.
- `startDeadline({ timeoutSeconds, cancel })` throws a RangeError for a non-finite or
  non-positive timeout instead of clamping: the 30–600 s clamp and the 180 s default belong to
  the settings (P03-04). `remainingMs()` is 0 once the action has stopped. The client must call
  `deadline.end()` when the action finishes (it clears the timer and the Cancel listener).
- `send` short-circuits when the deadline has already stopped (no request is recorded).
- `init` has no `signal` (type `SendInit`); the default `fetch` is wrapped so it is never called
  with the wrong `this`.

## Status

Done (2026-10-26). Created `src/ai/deadline.ts`, `deadline.test.ts` (13 tests),
`src/ai/transport.ts`, `transport.test.ts` (17 tests), this note. Nothing changed outside the
task's files. The client wiring (one deadline per action, the cap per attempt, `end()`) is
P03-17's.
