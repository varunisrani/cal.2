# Task: browser CORS probe, gated (P03-19) · Phase: 03 · Owner: builder (wt-p03s7)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The reference is a native app with no browser and no CORS,
so there is nothing in it to compare; the probe is ours. Read instead: research spec
`03-ai-providers.md` §3.15 (the curl probes of 2026-10-26 and the proposed `browserAccess`
handling), §3.1 and §3.2 (addresses, wire formats, auth headers); decision D-04.1
(`04-architecture.md`) and its row in `16-what-we-change.md` ("recheck with real keys"); the
landed code we call: `src/ai/catalog/providers.ts`, `src/ai/catalog/presets.ts`,
`src/ai/adapters/*`, `src/ai/transport.ts`, `src/ai/deadline.ts`, `src/ai/errors.ts`,
`src/ai/endpoint.ts`.

What it does (own words): the research measured CORS with curl, which only shows what headers a
vendor sends; it could not show what a browser does with them, and it never sent a real key. This
script answers the question the way the app will meet it: from a real Chromium page at the app's
own origin, through our real adapters and transport, one tiny text request per provider for which
the person running it supplied a key. It prints one verdict per provider: `direct` (the page could
read the reply), `needs header` (readable only with Anthropic's direct-browser header), `blocked`
(the browser refused the call: a TypeError and no status for the page), `opaque error` (the page
got a status but nothing it can read in the body). It is the re-check of D-04.1 to run before a
release (P10-12) and whenever a vendor starts failing in the field. It is opt-in: without
`PLATEWISE_PROBE=1` it prints "skipped" and exits 0, so no default loop (unit, CI, `pnpm test`)
ever sends a request.

Inputs → outputs:
- Environment: `PLATEWISE_PROBE=1` turns it on. Keys come only from `PLATEWISE_PROBE_KEY_<ID>`,
  where `<ID>` is the catalogue id upper-cased: `PLATEWISE_PROBE_KEY_GEMINI`, `_OPENAI`,
  `_ANTHROPIC`, `_XAI`, `_OPENROUTER`, `_TOGETHER`, `_GROQ`, `_HUGGINGFACE`, `_FIREWORKS`,
  `_DEEPINFRA`, `_MISTRAL`, `_DEEPSEEK`, `_QWEN`, `_CEREBRAS`, `_CUSTOM` (Ollama never sends a
  key). Ollama and Custom are probed only when `PLATEWISE_PROBE_URL_OLLAMA` /
  `PLATEWISE_PROBE_URL_CUSTOM` names a server (checked with the app's own `checkServerUrl`:
  https anywhere, plain http only to this machine). An optional `PLATEWISE_PROBE_MODEL_<ID>`
  replaces the model; by default the provider's first text preset (Custom has none, so it needs
  one or the server answers "unknown model", which still counts as a readable reply).
- Output (stdout): a table `provider | catalogue | verdict | detail`, one row per catalogue entry
  in catalogue order, skipped rows included with their reason (`no key`, `no server address`,
  `server address refused: <problem>`), then one line naming the providers whose verdict
  differs from the catalogue's `browserAccess`. Exit 0 whatever the verdicts; 1 only when the
  script itself failed (the build, the preview server or the browser would not start).

How it runs (only when at least one provider is configured; with none it prints the table of
skips and starts nothing):
1. The app: reuse `dist/` when `dist/index.html` exists, otherwise build it with Vite's build API
   (the `vite build` half of `pnpm build`; the type check is not needed to serve a page).
2. Serve it with Vite's preview API on `127.0.0.1` and a free port, as `pnpm preview` does.
3. The probe code: `scripts/ai-cors-probe/page.ts` imports the real adapters, the catalogue,
   `transport.send` and `startDeadline`, and is bundled by Vite's build API in library mode
   (one IIFE that defines a global), **in memory** (`write: false`): nothing is written to disk.
   The bundle is added to the open app page with `page.addScriptTag({ content })`. The app's
   page has no CSP today; if one arrives that forbids inline scripts, the bundle must be served
   from the origin instead (a follow-up, not needed now).
4. Chromium from `@playwright/test` (`chromium.launch()`, service workers blocked as in the e2e
   config), one context, the app's root page. For each configured provider in turn the Node side
   calls `page.evaluate` with the request input (provider, base address, model, key) as an
   argument: the key crosses into the page only as that argument, never in a URL, a file or a
   log. In the page the adapter's `build` makes the request, `transport.send` sends it under a
   30 s deadline, and the adapter's `read` reads the reply. The page returns only facts: the
   address it called (the adapters never put a key in one), the status, whether the body was
   blank, whether it holds a provider message, and the read's outcome (`answer` or a failure
   kind). It never returns the body or the provider's message: some vendors echo part of the key
   in their 401 text (a masked prefix and suffix), which no redaction of the whole key can catch.
5. For a provider whose catalogue entry is `directWithHeader` (Anthropic) and whose first request
   was readable, a second request is sent: the same adapter output with the
   `anthropic-dangerous-direct-browser-access` header removed. If that one is refused the verdict
   is `needs header`; if it is readable too the verdict is `direct` with the detail "works without
   the header". That is the only provider that gets two requests.
6. While a request runs, the Node side listens to Playwright's `requestfailed`, `response` and
   `console` events for that request's address. They tell a CORS refusal (Chromium's console
   says "blocked by CORS policy"; the network layer saw a reply the page was not allowed to read;
   or the generic `net::ERR_FAILED`) from the environment refusing the connection (the
   container's proxy refusing the host shows as `net::ERR_TUNNEL_CONNECTION_FAILED`; also DNS,
   certificate, refused-connection and proxy errors). The latter are reported as
   `blocked by environment`, separate from `blocked`, and are not script failures.
7. The browser, the preview server and the bundle are torn down in `finally`.

Verdict rules (one request; pure, unit-tested):
- The page got a reply: `direct` when the body is not blank and either the status is 2xx or the
  body holds a provider message the app can show (JSON `error`, `detail`, `message` or plain
  text); otherwise `opaque error` (blank body, an HTML page, JSON without a message).
- No reply, stopped by our deadline: `timeout` (an extra row value: "no answer in 30 s").
- No reply and an environment clue (see 6): `blocked by environment`, with the network error.
- No reply otherwise: `blocked`, with the clue (CORS console reason, the status the network saw,
  or "cause unknown").
- Not configured: `skipped`, with the reason.

Keys never leave memory: one redaction helper `redact(text, secrets)` replaces every configured
key (as given, trimmed, and URL-encoded) and every value of an `Authorization`, `x-api-key` or
`x-goog-api-key` header or field (`name: value`, `"name":"value"`, `name=value`, with or without
`Bearer`) by `[redacted]`. Every line the script prints, to stdout or stderr, the table, the
details, Vite's log lines and the final error message, goes through one printer that applies it
with every `PLATEWISE_PROBE_KEY_*` value as a secret. Keys are not written to disk (the probe
bundle is built in memory and holds no key; the app build holds no key), and never put in an
address (the adapters send them as headers; server addresses carrying credentials are refused).

Files: created `scripts/ai-cors-probe.ts` (env plan, redaction, verdicts, table, `main`),
`scripts/ai-cors-probe/page.ts` (the in-page runner), `scripts/ai-cors-probe/browser.ts` (build,
preview, Chromium, network clues), `scripts/ai-cors-probe.test.ts`, this note; changed
`package.json` (one line: `"probe:cors": "tsx scripts/ai-cors-probe.ts"`).

Edge cases / failure modes:
- Flag absent, `0`, or any value but `1`: "skipped", exit 0, nothing else runs (no build, no
  browser, no import of Vite or Playwright).
- Flag on, no keys and no server addresses: every row `skipped`, exit 0, no browser.
- A blank or whitespace key counts as no key. A key with surrounding spaces is trimmed by the
  adapter; both forms are redacted.
- A server address with a user name or password, a query, or plain http to another machine is
  refused (the app would not save it) and its text is never printed, only the problem code.
- The container's proxy refuses a vendor host: `blocked by environment`, exit 0.
- A vendor that never answers: `timeout` after 30 s, the next provider goes on.
- A vendor that answers 401 to a bad key with a JSON message and CORS headers: `direct` (the
  verdict is about CORS, not about the key; the detail says `HTTP 401, keyRejected`). The
  vendor's own text is never shown, only our failure kind.
- Cerebras-style 401 without CORS headers: `blocked`, since the page sees only a TypeError.
- A key echoed back in a vendor's error message: that text never leaves the page. Chromium's
  console lines are only matched against, never printed; the CORS reason is reduced to our own
  short phrase (`preflight refused`, `no Access-Control-Allow-Origin`, `header not allowed: x`).
- The build, preview or browser fails to start: the error is printed (redacted) and the exit
  code is 1.

Our design differences / decisions:
- Nothing to differ from: the reference has no browser. Names, structure and verdicts are ours.
- `timeout` and `blocked by environment` are row values beside the four verdicts the phase row
  names, so a slow vendor or a refused host is never mistaken for a CORS answer.
- The catalogue column and the "differs from the catalogue" line make the D-04.1 re-check a
  one-line read: `direct` expects `direct`, `directWithHeader` expects `needs header`,
  `userServer` expects `direct` (the person's server must allow our origin), `unsupported`
  expects `blocked`.
- The origin is `http://127.0.0.1:<port>` (vite preview), not the deployed https origin. Vendors
  that answer `*` or echo the origin treat both alike; a vendor that allow-lists origins would
  not, and the probe cannot see that. Recorded as a limit, not handled.
- The extra no-header request goes only to `directWithHeader` providers (Anthropic).
- Exit code 1 for a script failure (the bundle budget script uses 2 for its setup errors; the
  probe has no "over budget" outcome, so one failure code is enough).

Tests we will write (`scripts/ai-cors-probe.test.ts`, node environment, no network, no browser):
- redaction: a configured key anywhere in a line; several keys, one a prefix of another (longest
  first); the trimmed and URL-encoded forms; `Authorization: Bearer …`, `"x-api-key":"…"`,
  `x-goog-api-key=…`, header names in any case; text without secrets unchanged; blank secrets
  ignored.
- the plan from the environment: every catalogue id in order; the env names per id; blank keys
  skipped; Ollama and Custom need a server address; a refused address is skipped with its
  problem only; Custom without a key is probed without one; the model override and the default.
- verdicts: each rule above, including the two-request header check (needs header, works without
  the header, control request unreachable).
- the table and the catalogue line.
- `main`: without the flag prints "skipped" and returns 0 without calling the runner; with the
  flag and no keys lists all sixteen as skipped and never calls the runner; with keys, every
  printed line is redacted even when the runner's details echo a key; a runner that throws gives
  exit 1 and a redacted error.

Compare checklist (filled after the rewrite; no reference to reopen: the reference has no browser.
Compared instead with spec 03 §3.15, D-04.1 and the phase row's acceptance column, and run end to
end in Chromium against local servers only, no keys and no vendor: the repo's fake AI server as
Custom gave `direct` (HTTP 500 readable), a server without CORS headers as Ollama gave `blocked`
(`CORS: preflight refused, no Access-Control-Allow-Origin`), a closed port gave `blocked by
environment` (`net::ERR_CONNECTION_REFUSED`), an unresolvable https host gave `blocked by
environment` (`net::ERR_TUNNEL_CONNECTION_FAILED`, the container's proxy); the test key never
appeared in stdout or stderr):
- [x] Without `PLATEWISE_PROBE=1` it prints "skipped", exits 0 and starts nothing
  (`scripts/ai-cors-probe.test.ts > main > prints "skipped" and starts nothing without
  PLATEWISE_PROBE=1`; also run: `pnpm probe:cors`)
- [x] With the flag and no keys every provider is listed as skipped, no browser
  (`main > lists every provider as skipped and opens no browser when no key is set`,
  `planProbes: … > skips all sixteen, in catalogue order, when nothing is set`; also run:
  `PLATEWISE_PROBE=1 pnpm probe:cors`)
- [x] Key env names per catalogue id; Ollama and Custom only at a server address, Ollama never
  with a key; refused addresses never printed (`planProbes: what the environment asks for`, 6 tests)
- [x] Output never contains a key: the redaction helper (`redact: keys never reach the output`,
  6 tests) and every printed line through it, the session's own lines and a failure message
  included (`main > probes the configured providers and never prints a key, whoever writes it`,
  `main > exits 1 with a redacted error when the browser cannot start`)
- [x] Verdicts direct / opaque error / blocked / timeout / blocked by environment, CORS told apart
  from the environment (`judgeAttempt: one request, one verdict (R03.2)`, 6 tests)
- [x] needs header: the no-header control request for Anthropic only (`the direct-browser header
  check (R03.1)`, 4 tests; `probeProvider`, 3 tests)
- [x] Table, catalogue comparison, exit 0 whatever the verdicts, exit 1 only for a script failure,
  the session always closed (`the table and the catalogue`, 3 tests; `main`, 3 exit-1 tests)
- Mutation check: printing without redaction (1 test fails), error output without redaction (1),
  shortest secret first (1), no header pattern (2), any non-empty flag value (1), no control
  request (1), environment clue before the CORS line (1), ignoring the provider message (3),
  Ollama sending a key (1), not closing the session after a failure (1).
- Deliberate differences: none from a reference (there is none). From the phase row: two row
  values beside the four verdicts (`timeout`, `blocked by environment`), and a second request for
  `directWithHeader` providers, which is how `needs header` is measured rather than assumed.
- Not taken: printing the vendor's error text (it can hold part of a key); a proxy base URL per
  provider (03 §3.15 item 3 is a product feature, not a probe one); probing from an https origin.

## Decisions for the lead

- `scripts/ai-cors-probe/page.ts` starts with `/// <reference lib="dom" />`. It runs in the
  browser and imports the adapters, which reach `src/ai/errors.ts` (`navigator.onLine`) and
  `src/ai/transport.ts` (`RequestInfo`); the node tsconfig (`lib: ES2023`, `types: node`) has no
  DOM, so `pnpm typecheck` failed without it. A lib reference applies to the whole node program,
  so tooling, e2e and scripts now also see DOM types. The narrower fix is a tsconfig for
  browser-side scripts (or excluding `scripts/**/page.ts` from `tsconfig.node.json` and adding it
  to a DOM program), which I may not touch.
- Verdict vocabulary: the four of the phase row plus `timeout`, `blocked by environment` and
  `skipped`. `opaque error` is "a status, but a blank body or one without a message the app can
  read" (an HTML page, JSON without a message); a readable 401 counts as `direct`, since the
  verdict is about CORS, not the key.
- `needs header` is measured: Anthropic gets the app's request, and, if that was readable, the
  same request without `anthropic-dangerous-direct-browser-access`. A refusal of the second is
  `needs header`; a second that also gets through is `direct` "works without the header too".
- When `dist/index.html` is missing the probe runs Vite's build (not `tsc -b`), writing `dist/`
  as `pnpm build` would; otherwise it serves `dist/` as it is (only the origin matters).
- `PLATEWISE_PROBE_MODEL_<ID>` is an optional extra; the default is the provider's first text
  preset, and Custom (no presets) sends a blank model unless one is given; the server's refusal
  of it still counts as a readable reply.
- Exit code 1 for any script failure (build, preview, browser, a page error, a failed close).
- Follow-up: if the app gains a CSP that forbids inline scripts, `page.addScriptTag({ content })`
  stops working; serve the bundle from the origin then (P10 CSP work).
- Follow-up for the ledger (`docs/internals/traps-ledger.md`, not mine to edit): R03.1 ←
  `scripts/ai-cors-probe.test.ts > the direct-browser header check (R03.1) > needs the header
  when the same request without it is refused`; R03.2 ← `scripts/ai-cors-probe.test.ts >
  judgeAttempt: one request, one verdict (R03.2) > tells the environment refusing the connection
  apart from CORS`.

## Status

Done (2026-10-26). Created `scripts/ai-cors-probe.ts`, `scripts/ai-cors-probe/page.ts`,
`scripts/ai-cors-probe/browser.ts`, `scripts/ai-cors-probe.test.ts` (34 tests), this note; one line
in `package.json` (`probe:cors`). No real vendor was probed (no keys here): the live re-check of
D-04.1 with real keys is P10-12's.
