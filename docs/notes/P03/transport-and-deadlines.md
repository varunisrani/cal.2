# Task: transport and deadlines (P03-05) · Phase: 03 · Owner: builder (wt-p03s1, wave B slice S1)

Read (reference @ `10e14b67`): `A/services/ai/RetryPolicy.kt` (the cancellation parts: the
cancellable await, the buffered body read and the body-read failure), `A/services/SecureHttpClient.kt`
(looked for timeouts: it holds none; the cloud and user-server timeouts are set where the analysis
service builds its clients, seen through a search for the timeout calls only), tests
`T/services/ai/RetryPolicyThreadingTest.kt` (the cancellation cases: cancel while the body streams,
cancel before the headers, a body cut off midway). Research spec `03-ai-providers.md` §3.9
(timeouts, cancellation), §3.15 items 4 and 6, traps R03.2, R03.6, R03.26; decisions D-16.23 and
D-16.60 (`16-what-we-change.md`, wording in `18-phase-wise-build-plan.md`); glossary entry
"Deadline" (`17` §3). P03-01's `src/ai/errors.ts` (`fromNetwork`, `AiFailureError`) and P03-02's
fake fetch are the seams this builds on.

What it does (own words): one user action (analyse these photos, ask Coach, build a plan) gets one
`Deadline`, made from the person's "Give up after" setting and the Cancel button of the screen.
The deadline turns both into a single abort signal: whichever comes first stops everything that is
still running, and the deadline remembers which of the two it was, so a stop is later reported as
a timeout or as a silent cancel, never as a lost connection. It also says how much of the budget
is left, so every later step of the same action (the next attempt, the re-ask, the standby, the
unit repair, the next Coach round) works within what remains. The transport is the one place that
calls `fetch` for AI: it sends one request, gives that single attempt its own time cap on top of
the deadline (75 s for cloud providers, nothing extra for a server the person runs, which then
gets the rest of the budget), reads the whole reply body as text inside the same cap, and hands
back the status and the text. Any 2xx is a success. Everything thrown on the way (no reply, a
body cut off, our cap, our deadline, the person's cancel) becomes one `AiFailure` through
`fromNetwork`, told which of our own signals fired.

Inputs → outputs:
- `startDeadline({ timeoutMs, cancel? })` → `Deadline { signal, stoppedBy, remainingMs(),
  pause(ms), throwIfStopped(), dispose() }`. `stoppedBy` is `'cancel' | 'deadline' | undefined`.
  `pause(ms)` resolves to `undefined` after `ms`, or early with the stop reason.
- `attemptCapFor(endpoint: 'fixed' | 'userServer')` → `75 000` or `undefined` (the remaining
  budget).
- `send(url, init, { deadline, attemptCapMs?, provider?, keySent?, fetch? })` →
  `WireReply { status, ok, text }` for any HTTP reply (`ok` for 200–299), or throws an
  `AiFailureError` whose failure is cancelled, timeout, offline or connection.

Files: created `src/ai/deadline.ts`, `src/ai/deadline.test.ts`, `src/ai/transport.ts`,
`src/ai/transport.test.ts`.

Edge cases / failure modes:
- Cancel already pressed when the deadline is made: the deadline starts stopped (cancel), and a
  send on it never calls `fetch`.
- Cancel and the timer both due: the first to fire wins and the reason never changes afterwards.
- Cancel while the reply body is still arriving: the body read fails with the abort reason; it
  must read as cancelled even when the device also says it is offline (R03.6).
- The deadline firing during an attempt or during the body read: timeout.
- The 75 s cap firing first: timeout too (aborted with a reason named `TimeoutError` and passed as
  `stoppedBy: 'deadline'`), and the deadline itself keeps running, so a standby can still use what
  is left.
- A body cut off midway (a `TypeError` from the read): a network failure (connection, or offline
  when the device says so), as for no reply at all.
- 204 has no body: success with empty text. 299 is success. 3xx never reaches us (fetch follows
  redirects). Anything outside 200–299 is handed back for the retry ladder to judge, not thrown.
- Many sends on one deadline: each attempt adds and removes its own listener and timer, so a long
  Coach turn does not pile up listeners; `dispose()` clears the deadline's own timer and its
  listener on the Cancel signal when the action ends.
- Calling an injected browser `fetch` as a method of an options object throws "Illegal
  invocation" in some browsers, so the transport always calls it as a plain function, and the
  default wraps the global one.
- Nothing is logged: no headers (keys live there), no bodies (photos and provider text).
- A budget that is not a positive finite number is a programming error (RangeError); the 30–600 s
  clamp of the setting belongs to P03-04's settings, not here.

Our design differences / decisions:
- Names and structure are ours: `Deadline`, `startDeadline`, `send`, `WireReply`, `attemptCapFor`.
  The reference has no overall deadline at all; this is D-16.23 with the scope of D-16.60 (the
  deadline also covers the repair request and every Coach round, hence reusable across calls and
  disposed only by its owner).
- The browser has no separate connect, read and write timeouts; one abort per attempt replaces
  them (03 §3.15 item 6): 75 s for fixed cloud providers, the remaining budget for Ollama and
  Custom (D-16.60). The reference's 15/30/60 s socket timeouts have no browser equivalent and are
  not taken.
- `send` takes an options object instead of four positional arguments, because it also needs the
  fetch to use and the provider context for the refused-key hint (R03.2). Recorded for the lead.
- Any 2xx is success (R03.26), checked by our own range test rather than trusting a flag.
- The abort reasons are our own `DOMException`s named `AbortError` (cancel) and `TimeoutError`
  (deadline, cap), so even code that sees only the thrown error tells them apart by name, as
  `fromNetwork` does.
- No body-read thread concerns (a browser has none); the body is read inside the attempt so a
  cancel or cap during a slow body still ends the call, which is the behaviour the reference's
  buffered read exists for.

Tests we will write:
- `deadline.test.ts`: remaining time counts down with fake time and is 0 once stopped; the timer
  fires at the budget with `stoppedBy: 'deadline'` and a `TimeoutError` reason; Cancel stops it
  with `stoppedBy: 'cancel'` and an `AbortError` reason; an already-cancelled signal starts
  stopped; the first stop wins; `pause` resolves after its time, or early on cancel or deadline;
  `throwIfStopped` throws cancelled / timeout failures; `dispose` leaves no timer and stops
  listening to Cancel; a bad budget throws.
- `transport.test.ts`: 200, 204 and 299 are success, 404/503 come back as replies (not thrown);
  the request goes out with our signal, method, headers and body; the 75 s cap fires at exactly
  75 s with fake timers and reads as timeout while the deadline keeps running; a user server gets
  the remaining budget instead of the cap; Cancel during the body read reports cancelled, not
  offline; the deadline during the body read reports timeout; a network failure is connection,
  offline when the device says so, with the key hint for Cerebras; a stopped deadline sends
  nothing; the same deadline serves several sends with remaining-time accounting across them;
  nothing is logged; `attemptCapFor` values.
- `retry.test.ts` (P03-06) carries the deadline-ends-the-ladder case (ACC-E4-2).

Compare checklist (filled after the rewrite; reopened `A/services/ai/RetryPolicy.kt` (the
cancellable await, the buffered body read, the body-read failure), the client builders of
`A/services/ai/FoodAnalysisService.kt` (timeouts only), `A/services/SecureHttpClient.kt`,
`T/services/ai/RetryPolicyThreadingTest.kt`; every cancellation and timeout branch walked against
`src/ai/deadline.ts` and `src/ai/transport.ts`). Test names are in `src/ai/transport.test.ts`
unless another file is named.
- [x] Cancel while the body streams ends the call and the request's signal is aborted; it reads
      as cancelled, not offline (`send > reports a Cancel during the body read as cancelled, not
      offline (R03.6)`), also when the browser fails the read with a bare TypeError (`send > tells
      our own stops apart by the signal that fired, even when the browser only says TypeError`)
- [x] Cancel before the headers arrive ends the call (`send > reports a Cancel before the reply
      arrives as cancelled`); a stopped action sends nothing (`send > sends nothing once the
      action has stopped`)
- [x] A body cut off midway is a network failure, connection here (`send > reports a body cut off
      midway as a network failure`); no reply at all is connection, offline when the device says
      so, with the key hint for Cerebras (`send > reports no reply as a connection failure,
      offline when the device says so`)
- [x] 75 s cap for each cloud attempt, firing at exactly 75 s, read as timeout, the action going
      on (`send > caps a cloud attempt at 75 s as a timeout and leaves the deadline running`);
      a user server is not cut at 75 s and gets what is left of the budget (`send > gives an
      attempt at a user server the whole remaining budget instead of the cap`, `attemptCapFor >
      gives a cloud provider 75 s and a user server the remaining budget`)
- [x] Each attempt has its own timer, and the deadline is shared and accounted across attempts
      (`send > shares one deadline across sends, each starting with the budget left`); the
      deadline during a body read is a timeout (`send > reports the deadline running out during
      the body read as a timeout`)
- [x] Success range 200–299, including a bodiless 204 (`send > accepts any 2xx as success: 200,
      204 and 299 (R03.26)`); other statuses come back as replies for the ladder (`send > hands
      back other statuses with their body for the ladder to judge, without throwing`)
- [x] The deadline itself: countdown, firing, Cancel, first stop wins, pause, dispose
      (`src/ai/deadline.test.ts`, every test under `startDeadline`, `pause`, `throwIfStopped` and
      `dispose`); a 180 s deadline ends a four-try ladder (`src/ai/retry.test.ts > sendWithRetry >
      ends a four-try cloud ladder at the 180 s deadline, never later (ACC-E4-2)`)
- [x] Nothing logged (`send > never logs headers or bodies`); the global fetch called as a plain
      function (`send > uses the browser fetch when none is given, called as a plain function`)
- Deliberate differences: one overall deadline per action over every request (D-16.23, D-16.60),
  which the reference does not have; one abort per attempt instead of connect, read and write
  socket timeouts (the browser has none); a server the person runs gets the remaining budget, not
  a fresh full timeout per attempt (D-16.60); our abort reasons are named `AbortError` and
  `TimeoutError`, and the transport also tells `fromNetwork` which signal fired, so a cap or the
  deadline never reads as a cancel and a cancel never reads as offline; any 2xx accepted (R03.26,
  the reference's Android side already did, iOS did not).
- Not taken: reading the body on another thread (a browser has no such concern) and the tests
  about it; keeping status and headers of a reply whose body failed (only the hosted tier used
  them, out of scope); the 15 s connect, 60 s read and 30 s write timeouts; the TLS certificate
  strength checks of the HTTP client (the browser enforces TLS itself).

## Decisions for the lead

- **Signature.** `send(url, init, options)` with `options = { deadline, attemptCapMs?, provider?,
  keySent?, fetch? }` instead of the row's four positional arguments: the fetch dependency and
  the refused-key context (R03.2) needed a home. `init` has no `signal`; the transport makes its
  own per attempt. It resolves with `WireReply { status, ok, text }` for every HTTP reply and
  rejects with an `AiFailureError` only when no whole reply came.
- **Attempt cap.** `attemptCapFor('fixed' | 'userServer')` gives `75 000` or `undefined` (= the
  remaining budget). P03-17 should pass the catalogue's endpoint kind (P03-03) through it.
- **Deadline.** `startDeadline({ timeoutMs, cancel })`; the caller converts the setting
  (`timeoutSec`, clamped by P03-04) to ms. The owner of the action calls `dispose()` when the
  action ends; until then any number of requests may share it (D-16.60). `throwIfStopped()` is
  there for P03-17 and P08 to check between steps; `pause(ms)` is the deadline-aware wait.
- **Abort reasons.** Our own `DOMException`s: `AbortError` for Cancel, `TimeoutError` for the
  deadline and the attempt cap. Their messages are internal and never shown.

## Status

Done (2026-10-26). `src/ai/deadline.ts`, `src/ai/transport.ts` and their tests are in place; no
file outside the task's set changed. Trap rows R03.6 and R03.26 and acceptance row ACC-E4-2 now
have tests (listed in the final report for the ledgers).
