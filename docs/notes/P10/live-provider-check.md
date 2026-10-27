# Task: live provider check, gated (P10-12) · Phase: 10 · Owner: builder (wt-p10s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The reference is a native app that never meets browser
CORS or our wire code; the check is ours. Read instead: research spec `03-ai-providers.md` §3.15
(browser constraints per provider) and §3.1–3.2 (addresses, wire formats, key headers); D-04.1
and its row in `16-what-we-change.md` (recheck with real keys); D-16.25 (curated presets) and
`src/ai/catalog/presets.ts` (`PRESETS_CHECKED_ON`); the P03-19 probe (`scripts/ai-cors-probe.ts`,
`scripts/ai-cors-probe/{page,browser}.ts`, its note); the code the check drives:
`src/ai/tasks/food.ts` (`analyzePhotos`), `src/ai/client.ts`, `src/services/coach/engine.ts`
(`runTurn`), `src/ai/settings.ts`; HANDOFF items marked for P10-12 (reasoning models under the
1 024-token cap, the re-ask's same cap, DeepSeek and Cerebras vision, key-page addresses written
from memory).

What it does (own words): before a release, someone with real keys runs one small photo
analysis on each wire format family (Gemini, Anthropic, OpenAI-compatible) and one Coach turn,
from the built app in a real Chromium page, through the app's own code: the food task with its
prompt, client, retry ladder, deadline, standby rules and reply parser, and the Coach engine with
its tools. The person sees, per family, whether the reply came back and parsed into a food draft
(and how long it took), or which failure kind stopped it; for the Coach, whether an answer came
back, how many requests the turn took (tool rounds) or which failure kind ended it. Results go
into `docs/internals/provider-check-v1.0.md` without keys. The check is opt-in twice: it does
nothing without `PLATEWISE_LIVE=1`, and with the flag but no keys it says "skipped" and starts
nothing. Keys come only from the environment, the same `PLATEWISE_PROBE_KEY_<ID>` variables the
CORS probe reads, so one export serves both runs.

Inputs → outputs:
- Environment: `PLATEWISE_LIVE=1`; keys `PLATEWISE_PROBE_KEY_<ID>`; server addresses
  `PLATEWISE_PROBE_URL_OLLAMA` / `_CUSTOM`; model overrides `PLATEWISE_PROBE_MODEL_<ID>`;
  `PLATEWISE_LIVE_<FAMILY>=<provider id>` picks the provider for a family (`GEMINI`,
  `ANTHROPIC`, `OPENAI`), `PLATEWISE_LIVE_COACH=<provider id>` the Coach's.
- `--dry-run`: prints the plan (which provider and model each family and the Coach would use,
  or why it is skipped) and starts nothing.
- Output: a table `check | provider | model | result | detail`, every line passed through the
  probe's `redact`; exit 0 whatever the results, 1 only when the script itself failed.

Files: created `scripts/ai-live-check.ts` (plan, judging, output, main), `scripts/ai-live-check/
page.ts` (runs in the app's page: the photo task and the Coach turn), `scripts/ai-live-check/
browser.ts` (build if needed, preview, Chromium, the page script served from the app's origin),
`scripts/ai-live-check.test.ts`, `docs/internals/provider-check-v1.0.md`; `package.json` is not
touched (run with `pnpm exec tsx scripts/ai-live-check.ts`).

Edge cases / failure modes:
- The built app's CSP forbids inline scripts: the page script must be served from the app's own
  origin (a routed same-origin URL), not added as inline content. The P03-19 probe still adds its
  bundle inline, so it cannot load under the CSP that P09-18 added: check and fix (small, local).
- A family whose providers have no key: skipped with the variable to set. A provider with no
  photo preset (DeepSeek, Cerebras) cannot serve a photo check without a model override.
- A provider override that is not in that family, or does not read photos: skipped with why.
- Ollama and Custom need a server address the app would accept (`checkServerUrl`).
- The page returns facts only (kind, status, counts, timings, whether a draft parsed), never the
  provider's text, which can echo part of a key; every printed line is redacted anyway.
- A thrown error (build, preview, browser) is printed redacted and exits 1; the browser and the
  preview server are closed in every case.

Our design differences / decisions:
- Keys share the probe's variable names; the flag is the check's own (`PLATEWISE_LIVE`), so
  running the probe never sends a photo or a Coach turn by accident.
- The photo is our own e2e fixture (`e2e/fixtures/meal.jpg`), read from disk and handed to the
  page as bytes; nothing is written to disk.
- The Coach turn uses a small made-up snapshot (a profile and two entries yesterday) and asks
  about yesterday, so a tool call is likely; the result counts requests, not words.
- No `package.json` script (the row does not ask for one and `package.json` is out of this slice).

Tests we will write (`scripts/ai-live-check.test.ts`):
- Without the flag: prints skipped, exit 0, never opens a session.
- With the flag and no keys: prints skipped (no keys), exit 0, never opens a session.
- The plan: the first keyed provider per family in catalogue order; an override wins; an
  override from another family or without photo reading is refused with a reason; a provider
  without a photo preset needs a model override; Ollama/Custom need an accepted address.
- `--dry-run` prints the plan and never opens a session.
- A run through a fake session: one table row per check, results judged; a session error that
  carries a key is printed redacted, exit 1, and the session is closed.
- No line printed in any of these contains a key.

Compare checklist (filled after the rewrite; no reference files: compared against the row, spec
03 §3.15 and the probe):
- [x] Skipped without the flag and without keys, exit 0 (`scripts/ai-live-check.test.ts > main
  (P10-12): opt-in, skipped without keys, never a key in the output > prints "skipped" and starts
  nothing without PLATEWISE_LIVE=1`; `> says "skipped: no keys" and opens no browser when the flag
  is set but no key is`; `> prints the plan on --dry-run, with or without the flag, and starts
  nothing`)
- [x] One photo analysis per family and one Coach turn planned (`> planChecks: one photo per wire
  format and one Coach turn (P10-12) >` six tests: first set-up provider per family, overrides,
  refused overrides, server addresses, the page input)
- [x] Output never contains a key (`> runs the planned checks in order and never prints a key,
  whoever writes it`; `> exits 1 with a redacted error, and closes the session, when a check
  breaks the page`; `> exits 1 when the browser cannot start or cannot be closed`; `judge and the
  table > prints aligned rows, planned ones with their address and never a key`)
- [x] Runs from the built app under its CSP: by hand against the repository's fake provider as
  Custom at loopback (photo-openai pass, 410 kcal, 2 parts; coach pass, 1 tool round; no key in
  the output); the CORS probe likewise (`direct`, after its fix)
- [x] D-04.1 recheck, presets and build date: recorded as pending (no keys) in the report
- Deliberate differences: none.
- Not taken: a `package.json` script (out of this slice; `pnpm exec tsx scripts/ai-live-check.ts`
  works); Gemini and Anthropic wires in the fake provider (it speaks only the OpenAI format, so
  those two families are proven only by the unit tests of their adapters until keys are given).

## Status

Done (2026-10-27), live run skipped: no keys. Script, page, browser helper and 15 tests written;
the report records the no-key runs and the end-to-end run against the fake provider. Changed
outside the task's own files: `scripts/ai-cors-probe/browser.ts` (the probe's bundle is served
from the app's origin, since the CSP refuses inline scripts; security review S-2). For the lead:
run both scripts with real keys before tagging, and fill the pending rows of
`docs/internals/provider-check-v1.0.md`.
