# Task: fake AI provider server (P00-09) · Phase: 00 · Owner: builder (wt-p00s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart: the
reference has no fake provider and cannot run in a browser. Read `docs/plan/phases/P00-foundations.md`
(P00-09 row and file tables), `docs/plan/02-rea-workflow.md` §4 step 2 (AI calls in parity runs go
to a local scripted provider on loopback), D-16.26 in `docs/plan/16-what-we-change.md` (plain HTTP
only for loopback), and, for the shape the app will send and expect: P03-08 and P03-15 in
`docs/plan/phases/P03-ai-layer.md`, 17 §1.4–1.5 (our food reply keys and Coach tool names), 03 §3.9
(retry ladder: 429 is retried, `Retry-After` ignored) and the P05-15, P06-20 and P08-14 e2e rows
that will use the scripts. The OpenAI chat-completion wire shape (`choices[].message`,
`finish_reason`, `tool_calls`, `error.message`) is a third-party protocol, written from the public
API shape. **All reply text in the scripts is ours**: the dishes, numbers, error messages and the
Coach answer were written for this task; nothing was taken from the reference.

What it does (own words): a tiny HTTP server, run on the test machine, that pretends to be an
OpenAI-compatible provider so browser tests and parity runs can drive every AI flow without keys or
network. The app is pointed at it as the Custom provider (`http://127.0.0.1:4320/v1`), which the
loopback rule (D-16.26) allows over plain HTTP. A test first loads a *script* (an ordered list of
replies, each a status, a body and an optional delay) and every `POST /v1/chat/completions` then
takes the next reply. The server writes down each request it got (headers without the key, and the
JSON body) so a test can check what the app sent. Browsers call it cross-origin, so it answers CORS
preflights and puts `Access-Control-Allow-Origin: *` on every reply. Playwright starts it once
before the run (`globalSetup`) and stops it after.

Inputs → outputs:
- `startFakeAi({port?})` → `{port, url, close}`; binds 127.0.0.1 only; port from the option, else
  `PLATEWISE_FAKE_AI_PORT`, else 4320 (port 0 = any free port, for unit tests).
- `POST /v1/chat/completions` (any JSON body) → the next scripted reply after its `delayMs`; with
  no script, an empty one or a used-up one → 500 with an OpenAI-shaped error that says which.
- `OPTIONS <any path>` → 204 with allow-origin `*`, allow-headers `authorization, content-type`,
  allow-methods `POST, GET, OPTIONS`.
- `POST /__script` with `{"name": "food-ok"}` (a file in `e2e/fake-ai/scripts/`) or an inline
  `{"replies": [...]}` → 200 `{loaded, replies}`; replaces the script and starts it from the top.
- `GET /__requests` → `{requests: [{headers, hasAuthorization, body}, ...]}` in arrival order.
- `POST /__reset` → 204; no script, no recorded requests.
- `global-setup.ts` (Playwright) → starts the server, puts its URL in `PLATEWISE_FAKE_AI_URL` for
  the specs, returns the teardown that closes it.

Files: created `e2e/fake-ai/server.ts`, `e2e/fake-ai/server.test.ts`, `e2e/fake-ai/global-setup.ts`,
`e2e/fake-ai/scripts/{food-ok,busy-then-ok,cut-then-ok,coach-tool,garbage}.json`; changed
`playwright.config.ts` (globalSetup, `testMatch`, html reporter).

Edge cases / failure modes:
- Script used up or never loaded: 500 with a message naming the case and how to fix it (load one
  with `POST /__script`), never a hang and never a silent repeat of the last reply.
- Two requests in flight: replies are taken in arrival order, when the request arrives (not when
  its delay ends), so a slow first reply never swaps places with the second.
- The browser gives up during a delay (the app's Cancel or Coach Reset): the late reply is
  dropped without an error in the server.
- `close()` while a delayed reply is pending: timers are cleared and open sockets dropped, so
  Playwright's teardown never waits on a test's delay or a keep-alive connection.
- Port in use: `startFakeAi` rejects with a message naming host and port (e.g. two builders on one
  machine), instead of an unhandled `EADDRINUSE`.
- Script names are a plain slug (`[a-z0-9-]`): `../server` or `/etc/x` is refused (400), an unknown
  name is 404 listing nothing outside the folder.
- Script validation: a reply needs an integer `status` in 200–599 and a `body`; `delayMs`, when
  present, a finite number ≥ 0; unknown keys (a typo like `delay`) are refused, so a bad script fails
  at load time with a 400, not later as a confusing reply.
- A request body that is not JSON is still recorded (as its raw text) and still answered.
- A key must never reach `/__requests`: the `authorization` header is dropped before recording.

Our design differences / decisions:
- No dependency: `node:http` only. All state lives inside each `startFakeAi` call (nothing at
  module level), so unit tests run several servers on port 0 without sharing state.
- Script file shape: `{"about": "<what it is for>", "replies": [...]}`; the same shape is accepted
  inline. A reply `body` that is a JSON string is sent verbatim (that is how `garbage` sends a body
  that is not JSON); any other value is sent as JSON. Every reply is `application/json`.
- `url` is the server root (`http://127.0.0.1:<port>`); the app's base URL is `url + '/v1'`.
- Recorded request: lower-cased headers minus `authorization`, plus `hasAuthorization` (whether a
  key was sent at all, never its value), and the body parsed as JSON. Loading a script does not clear
  the record; `/__reset` clears both.
- The food reply uses the keys planned for our reply contract (P03-15; 17 §1.4: `name`, `kcal`,
  `protein`, `carbs`, `fat`, `servingGrams`, `emoji`, `nutrients`, `units`, `parts`,
  `progressive`). P03-15 owns the contract: if it changes a key, the scripts follow.
- `coach-tool` calls `food_log` (our tool name, 17 §1.5) with only a `limit`, so the app's defaults
  pick the range and the script works whatever the test's clock says.
- `garbage` holds two unusable replies (a body that is not JSON, then a well-formed completion whose
  text is not the JSON object asked for), so whether the app gives up after the first or tries once
  more, it never gets a usable answer.
- `global-setup.ts` exports `PLATEWISE_FAKE_AI_URL` so specs read the URL instead of repeating the
  port default; it logs one line on start and one on stop.
- Playwright: `testMatch: '**/*.spec.ts'` (the Vitest file in `e2e/fake-ai/` must never run as a
  spec) and the html reporter (`open: 'never'`) next to `list`, so CI's failure upload holds a report.

Tests we will write (`e2e/fake-ai/server.test.ts`, `// @vitest-environment node`, servers on port 0,
a `node:http` client so only the server's own `setTimeout` is faked):
- Preflight → 204 with the three CORS headers; allow-origin on 200, 429, 404, 500 and control replies.
- Inline 429-then-200 script answers in order; a third call → 500 "used up".
- `/__requests` lists both bodies, no `authorization` header, the key text appears nowhere,
  `hasAuthorization` true.
- `delayMs` with fake timers (`setTimeout` only): no reply at 4 999 ms, the reply at 5 000 ms.
- No script and an empty inline script → 500 with a clear message.
- Every shipped script loads by name and has the promised shape (food JSON parses with the contract
  keys; 429 then 200; `length` then `stop`; a `food_log` tool call then text; garbage unusable twice).
- Bad script names (traversal, unknown) and invalid inline replies are refused; `/__reset` clears.
- Port from env: default 4320, `PLATEWISE_FAKE_AI_PORT` honoured, junk rejected; the server listens
  on 127.0.0.1; `close()` returns while a delayed reply is pending; the global setup starts and its
  teardown stops the server.

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart):
- [x] Preflight → 204 with allow-origin `*`, allow-headers `authorization, content-type`,
      allow-methods `POST, GET, OPTIONS` (`e2e/fake-ai/server.test.ts > fake AI server: CORS >
      answers a preflight with 204 and the CORS headers`); allow-origin on 200, 429, 500, 400, 404
      and 204 replies (`> puts Access-Control-Allow-Origin on every reply`)
- [x] 429-then-200 answers in order, a third call is a clear 500 (`fake AI server: scripted
      replies > answers a 429-then-200 script in order, then says the script is used up`)
- [x] `/__requests` lists both bodies without the key (`> lists both requests with their bodies and
      without the key`); no key and a non-JSON body (`> records a request without a key, and a body
      that is not JSON as its text`)
- [x] `delayMs` with fake timers: still pending at 4 999 ms, answered at 5 000 ms, recorded on
      arrival (`fake AI server: delays > honours delayMs, measured with fake timers`)
- [x] Empty script → 500 with a clear message, for no script and for `{"replies": []}`
      (`fake AI server: scripted replies > answers 500 with a clear message when no script is
      loaded`, `> ... for an empty script`)
- [x] Caller gives up during a delay; `close()` with a delayed reply pending (`fake AI server:
      delays > drops a delayed reply whose caller gave up, and answers the next request`,
      `> close() drops a pending delayed reply instead of waiting for it`)
- [x] Script loading: ten refusal cases, a refused load keeps the current script, every file in
      `scripts/` loads (`fake AI server: loading scripts > refuses %s`, `> keeps the current script
      when a load is refused`, `> loads every script file in e2e/fake-ai/scripts/`)
- [x] The five starter scripts have the promised shape; food totals equal the sum of the parts
      (`fake AI server: starter scripts > food-ok: …`, `busy-then-ok: …`, `cut-then-ok: …`,
      `coach-tool: …`, `garbage: …`)
- [x] Loopback only, busy port named, port from env, global setup and teardown (`fake AI server:
      lifecycle > listens on 127.0.0.1 only`, `> refuses a port that is already taken, naming it`,
      `> reads the port from PLATEWISE_FAKE_AI_PORT, 4320 by default`, `> global setup starts the
      server on the env port and its teardown stops it`)
- [x] Playwright: `--list` collects only `smoke.spec.ts` (no `*.test.ts`); the run prints "fake AI
      provider listening on http://127.0.0.1:4321" before the specs and "fake AI provider
      stopped" after; port 4321 refuses connections afterwards; the html report is written. A
      throwaway probe spec (deleted after the run) fetched `/v1/chat/completions` from the page
      (origin `http://127.0.0.1:4175`, with an `Authorization` header, so through a real CORS
      preflight) and got the food-ok reply; the record held the origin, `hasAuthorization: true`
      and not the key.
- Deliberate differences: n/a (no reference behaviour; the reference has no fake provider).
- Not taken: a command-line entry to run the server alone (P10-03's parity runner can import
  `startFakeAi`); streaming replies (the app makes non-streaming calls, 03 §3.2); per-reply headers
  such as `Retry-After` (the retry ladder ignores it, 03 §3.9); `Access-Control-Allow-Private-Network`
  (the app and the fake are both on loopback, so Chrome sends no private-network preflight).

## Decisions for the lead

- Script file shape `{"about", "replies": [{status, body, delayMs?}]}`, also accepted inline; a
  string `body` is sent verbatim. Unknown keys are refused at load time.
- `GET /__requests` answers `{requests: [{headers, hasAuthorization, body}]}`. `hasAuthorization`
  is an addition to the row (whether a key was sent, never its value), so a spec can check the
  Custom provider sends a key and Ollama does not. Loading a script keeps the record;
  `POST /__reset` clears script and record.
- `global-setup.ts` sets `PLATEWISE_FAKE_AI_URL` (new env name, `PLATEWISE_` prefix per 17) for
  the specs; the provider base URL is that plus `/v1`.
- `garbage` has two unusable replies (a body that is not JSON, then prose instead of the food
  object), so it fails whatever the app's retry or re-ask path is.
- The food replies use the keys planned for our reply contract (P03-15, 17 §1.4). When P03-15
  lands, its builder should check `food-ok`, `busy-then-ok` and `cut-then-ok` against
  `src/ai/prompts/contract.ts` (follow-up).
- `coach-tool` calls `food_log` with `{"limit": 30}` only, so the app's default range applies and
  the script does not depend on the spec's clock.

## Status

Done (2026-10-26). Created `e2e/fake-ai/{server.ts,server.test.ts,global-setup.ts}` and the five
scripts in `e2e/fake-ai/scripts/`; changed `playwright.config.ts` (`testMatch`, `globalSetup`, html
reporter). No file outside the slice touched. All reply text in the scripts is ours. Later scripts
(`plan-ok` P05-15, `coach-fail-then-ok` and `coach-slow` P08-14) go in the same folder and are
checked by `loads every script file in e2e/fake-ai/scripts/`.
