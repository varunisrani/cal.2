# Task: fake AI provider server (P00-09) · Phase: 00 · Owner: builder (wt-p00s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart, and
the reference has no such server. Read `docs/plan/phases/P00-foundations.md` (P00-09 row, files
lists), `docs/plan/02-rea-workflow.md` §4 step 2 (parity runs use a loopback scripted provider),
`docs/plan/16-what-we-change.md` D-16.26 (plain HTTP only for loopback), the OpenAI-compatible
request and reply shape in research spec `03-ai-providers.md` §3.2 (O), §3.8 (truncation) and §3.9
(retryable 429), the Coach tool names in `17-naming-and-glossary.md` §1.5, our food reply keys in
`P03-ai-layer.md` P03-15, and the wave-1 note on Playwright's `testMatch` in `docs/HANDOFF.md`.
**All reply text in the starter scripts is ours** (dish, numbers, error messages, Coach answer);
no reference prompt, reply or fixture was opened.

What it does (own words): e2e and parity runs must never need a real API key or the internet, and
must get the same AI answers every time. This is a small HTTP server on 127.0.0.1 that speaks just
enough of the OpenAI chat-completions protocol for the app's Custom provider: the app points at
`http://127.0.0.1:4320/v1` (allowed by the loopback rule, D-16.26) and every
`POST /v1/chat/completions` is answered from a loaded script, an ordered list of canned replies
(status, body, optional delay). A test loads a script, drives the app, then reads back what the
app sent (headers without the key, and the JSON body) to check the request. Browsers call it
cross-origin from the preview server, so it answers CORS preflights and marks every reply as
readable from any origin. Playwright starts it once for the whole run and stops it at the end.

Inputs → outputs:
- `startFakeAiServer({ port? })` → `{ port, url, close }`; `port` defaults to
  `PLATEWISE_FAKE_AI_PORT` or 4320, `0` picks a free port (unit tests); `url` is the origin
  `http://127.0.0.1:<port>`, so the provider base URL is `${url}/v1`.
- `OPTIONS <any path>` → 204 with `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Methods: GET, POST, OPTIONS`,
  `Access-Control-Allow-Headers: authorization, content-type`.
- `POST /v1/chat/completions` → records the request, then the next scripted reply: its status, its
  body (JSON-encoded, or sent as-is when the body is a string, so a script can send text that is
  not JSON), after `delayMs` when given. Empty or used-up script → 500 with an OpenAI-style error
  whose message says what happened and how to fix it.
- `POST /__script` with `{ "name": "food-ok" }` (a file in `e2e/fake-ai/scripts/`) or an inline
  `{ "replies": [...] }` → replaces the script and rewinds it; 200 `{ ok, script, replies }`.
- `GET /__requests` → the recorded chat requests, oldest first: `{ method, path, headers, body }`.
- `POST /__reset` → empty script, rewound, no recorded requests.
- Anything else → 404 with a message naming the method and path. Every reply carries
  `Access-Control-Allow-Origin: *`.

Files: created `e2e/fake-ai/server.ts`, `e2e/fake-ai/server.test.ts`,
`e2e/fake-ai/global-setup.ts`, `e2e/fake-ai/scripts/{food-ok,busy-then-ok,cut-then-ok,coach-tool,
garbage}.json`; changed `playwright.config.ts` (globalSetup, `testMatch`, html reporter).

Edge cases / failure modes:
- No script loaded, or more requests than replies: 500 with a clear message (which script, how
  many replies, which request number); the request is still recorded.
- Script name with path characters (`../x`) or unknown: 400, the message lists the scripts there.
- Malformed script (no `replies` array, a status outside 200–599, a missing `body`, a negative
  `delayMs`, an unknown key such as a misspelt `delay`): 400 naming the reply and the problem, and
  the previous script stays loaded.
- Control-route body that is not JSON: 400. A chat body that is not JSON is still answered and is
  recorded as its raw text (the fake reports, it does not judge).
- The client goes away while a delayed reply waits (Coach Reset in P08-14): the reply is dropped
  quietly. `close()` cancels waiting replies and drops open keep-alive connections, so teardown
  never hangs.
- The port is taken (a stale server): start fails with a message naming the port and
  `PLATEWISE_FAKE_AI_PORT`. A bad `PLATEWISE_FAKE_AI_PORT` value fails with its value.
- `Authorization` is never stored or returned, so a key typed in a test cannot leak into reports.

Our design differences / decisions:
- No reference behaviour (tooling). `node:http` only, no dependency. Binds 127.0.0.1 only; the
  host is not configurable, so the fake can never be reached from another machine.
- Script file shape `{ "description": "...", "replies": [...] }`; the description is our one-line
  note on what the script is for (JSON has no comments). Inline scripts use the same shape.
- Loading a script does not clear the recorded requests; `/__reset` does both. A spec that wants a
  clean slate calls `/__reset` then `/__script`.
- Allowed request headers are exactly `authorization` and `content-type` (task decision), so a new
  header from the Custom provider fails the preflight visibly instead of passing silently.
- `garbage` is a 200 whose body is a chat completion cut off mid-JSON: unreadable at the HTTP
  level, so it fails for every AI flow (food, plan, Coach), not only for flows that parse the text.
- Food scripts answer with one dish of ours, red lentil soup with wholemeal bread (410 kcal,
  420 g), in our reply contract keys (P03-15: `name`, `emoji`, `kcal`, `protein`, `carbs`, `fat`,
  `servingGrams`, `nutrients`, `units`, `parts`, `progressive`); parts sum to the totals and units
  match the weight, so P03's validators accept it. `coach-tool` calls `food_log` (our tool name,
  17 §1.5; the P08-14 scenario), then answers in text.
- Playwright: `testMatch: '**/*.spec.ts'` so the Vitest files in `e2e/fake-ai/` are never
  collected; the html reporter (`open: 'never'`) sits next to `list` for the CI upload.

Tests we will write (`e2e/fake-ai/server.test.ts`, node environment, server on port 0 per test,
a `node:http` client so the client never uses the faked timers):
- Preflight returns 204 with the three CORS headers; chat, control and 404 replies carry
  `Access-Control-Allow-Origin: *`.
- `busy-then-ok` answers 429 then 200, in order.
- `/__requests` lists both bodies in order, without `authorization` or the key's text.
- `delayMs` holds the reply until fake time reaches it (fake `setTimeout`, no real wait).
- An empty script answers 500 with a clear message; an exhausted one names the script and count.
- Script loading: inline, unknown name, path characters, malformed reply → 400 and the old
  script kept; `/__reset` clears script and requests.
- Every starter script loads and has the shape its name promises (food reply parses to our keys
  with parts that sum to the totals; cut-off first; tool call then text; garbage is not JSON).
- `PLATEWISE_FAKE_AI_PORT` parsing (default, a value, a bad value).
- e2e: `pnpm exec playwright test` runs only `smoke.spec.ts`; globalSetup starts the server (a
  throwaway probe spec reaches it) and stops it (the port is free after the run).

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart):
- [x] Preflight returns 204 with the CORS headers (tested in `e2e/fake-ai/server.test.ts > CORS >
      answers a preflight with 204 and the CORS headers`); every reply allows any origin (`> CORS >
      lets any origin read every reply: chat, control routes and unknown routes`)
- [x] A 429-then-200 script answers in order (`> scripted replies > answers a 429-then-200 script
      in order`)
- [x] `/__requests` lists both bodies without the key (`> recorded requests > lists both bodies in
      order, without the authorization header or the key`)
- [x] `delayMs` honoured with fake timers (`> scripted replies > holds a reply for its delayMs, on
      fake timers (no real wait)`); a mutation that ignores `delayMs` makes it fail
- [x] Empty script → 500 with a clear message (`> scripted replies > answers 500 with a clear
      message when no script is loaded`, `> ... for an empty script`, `> answers 500 naming the
      script and the request once the script is used up`)
- [x] Script loading and reset (`> loading scripts > refuses %s with 400 and keeps the loaded
      script` (10 cases), `> rewinds the script on every load and keeps the recorded requests`,
      `> recorded requests > clears the script and the recorded requests on /__reset`)
- [x] Starter scripts have the promised shapes (`> starter scripts > ...`, 10 tests)
- [x] globalSetup starts and stops the server; no `*.test.ts` collected: `playwright test --list`
      lists 1 test in 1 file (`smoke.spec.ts`); a throwaway probe spec (deleted after) reached the
      server during the run, including a cross-origin `fetch` with `Authorization` from the
      preview page in Chromium (preflight passed, the recorded origin was the preview origin, the
      key absent); after the run port 4320 refused connections (ECONNREFUSED).
- Deliberate differences: n/a (no reference behaviour).
- Not taken: streaming (`stream: true`) replies; other provider dialects (Gemini, Anthropic);
  per-reply headers (`Retry-After` is ignored by the app, 03 §3.9).

## Decisions for the lead

- `startFakeAiServer()` returns `url` = the origin (`http://127.0.0.1:4320`); the Custom
  provider's base URL is `${url}/v1`. Specs run in worker processes and do not get this object:
  they reach the fake at `http://127.0.0.1:${PLATEWISE_FAKE_AI_PORT ?? 4320}` (workers inherit the
  runner's environment). A small spec-side client can come with the first spec that drives it
  (P05-15 or P06-20).
- Script files are `{ "description", "replies" }`; unknown keys are refused (a misspelt `delay`
  would otherwise do nothing). Loading a script rewinds it but keeps the recorded requests;
  `/__reset` clears both.
- A delayed reply still goes out after `/__reset` (unless the client has gone): dropping a late
  reply is the app's job (D-16.34), and P08-14 needs the fake to send it.
- `garbage` is unreadable at the HTTP level (a 200 whose body is a completion cut off mid-JSON),
  so it fails every AI flow, Coach included. A reply whose `body` is a string is sent as-is with
  `Content-Type: application/json`.
- The food scripts use the P03-15 reply keys as written today. If P03-15 changes the contract, its
  builder updates `food-ok`, `busy-then-ok` and `cut-then-ok` (follow-up, not a blocker).
- `coach-tool` asks `food_log` for 2026-10-19..2026-10-25 (fixed dates; the tool runner defaults
  or echoes dates, 04 §3.9).
- `pnpm exec tsx e2e/fake-ai/server.ts` runs the fake by hand (manual checks, the P10-03 parity
  runner may import `startFakeAiServer` instead).
- The html reporter writes `playwright-report/` on every local run (gitignored).
- I ran the e2e with `PLATEWISE_E2E_PORT=4183` so the preview server could not clash with another
  builder on 4173; the fake used its default 4320.

## Status

Done (2026-10-26). Created `e2e/fake-ai/server.ts`, `server.test.ts`, `global-setup.ts` and the
five scripts in `e2e/fake-ai/scripts/`; changed `playwright.config.ts` (`testMatch`,
`globalSetup`, html reporter). Nothing changed outside the task's files.
