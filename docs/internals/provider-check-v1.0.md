# Live provider check, v1.0 (P10-12)

**Result on 2026-10-27: skipped: no keys.** No real provider key was supplied, so nothing was sent
to any AI vendor, D-04.1 was not re-checked against live vendors, and the curated presets and
their date (`PRESETS_CHECKED_ON = '2026-10-26'` in `src/ai/catalog/presets.ts`) are unchanged.
What could be checked without keys was: the scripts, their no-key behaviour, and the whole browser
path from the built app against the repository's fake provider. Task note:
`docs/notes/P10/live-provider-check.md`.

## The two scripts

| Script | What it sends | Opt-in | Keys |
|---|---|---|---|
| `scripts/ai-cors-probe.ts` (P03-19; `pnpm probe:cors`) | One tiny text request per provider with a key, plus Anthropic's no-header control | `PLATEWISE_PROBE=1` | `PLATEWISE_PROBE_KEY_<ID>` |
| `scripts/ai-live-check.ts` (this task; `pnpm exec tsx scripts/ai-live-check.ts`) | One meal photo through the app's food task on each wire format family (Gemini, Anthropic, OpenAI-compatible) and one Coach turn through the app's Coach engine, tools included | `PLATEWISE_LIVE=1` (or `--dry-run`, which sends nothing) | the same `PLATEWISE_PROBE_KEY_<ID>` |

Both run from the built app (`dist/`, built first when missing) served on 127.0.0.1 and a free
port, in Chromium from Playwright, with the app's CSP in force: the page code is served from the
app's own origin. Both exit 0 whatever the providers answer and 1 only when the script itself
fails. Every printed line goes through `redact` (keys as typed, trimmed and URL-encoded, and the
values of `Authorization`, `x-api-key` and `x-goog-api-key`); the page returns facts only (status,
counts, timings, failure kind, numbers from a parsed answer), never a provider's text.

Live check options: `PLATEWISE_LIVE_GEMINI`, `PLATEWISE_LIVE_ANTHROPIC`, `PLATEWISE_LIVE_OPENAI`
pick the provider of a family (it must speak that format and read photos);
`PLATEWISE_LIVE_COACH` picks the Coach's; otherwise the first provider of the catalogue that is
set up is used. `PLATEWISE_PROBE_MODEL_<ID>` replaces a model (DeepSeek and Cerebras have no
photo preset, so they need one for a photo check); `PLATEWISE_PROBE_URL_OLLAMA` /
`PLATEWISE_PROBE_URL_CUSTOM` name a server (https, or plain http to this device only). Each check
uses one provider with no standby, the app's time limit of 120 s, and our own fixture photo
(`e2e/fixtures/meal.jpg`).

## What ran on 2026-10-27

1. **No flag:** `pnpm exec tsx scripts/ai-live-check.ts` → "Live provider check skipped: set
   PLATEWISE_LIVE=1 to run it …", exit 0, nothing started.
2. **Flag, no keys:** `PLATEWISE_LIVE=1 pnpm exec tsx scripts/ai-live-check.ts`, exit 0, no browser:

   ```
   check            provider  model  result   detail
   photo-gemini     -         -      skipped  no keys: set PLATEWISE_PROBE_KEY_GEMINI
   photo-anthropic  -         -      skipped  no keys: set PLATEWISE_PROBE_KEY_ANTHROPIC
   photo-openai     -         -      skipped  no keys: set PLATEWISE_PROBE_KEY_<ID> of an OpenAI-compatible provider
   coach            -         -      skipped  no keys: set PLATEWISE_PROBE_KEY_<ID> of any provider

   Live provider check skipped: no keys. Nothing was sent.
   ```

3. **Dry run:** `pnpm exec tsx scripts/ai-live-check.ts --dry-run` prints the same table and
   "Dry run: 0 checks would run; nothing was sent." With keys it lists the provider, model and
   address each check would use.
4. **CORS probe, no keys:** `PLATEWISE_PROBE=1 pnpm probe:cors` → all 16 providers skipped,
   "Nothing was probed", exit 0.
5. **The browser path, without a vendor:** both scripts were run (throwaway drivers in the
   scratchpad) against the repository's fake OpenAI-compatible server (`e2e/fake-ai/server.ts`)
   as the Custom provider at `http://127.0.0.1:<port>/v1`, with a made-up key:

   ```
   Running 2 checks from http://127.0.0.1:35241 in Chromium 153.0.8010.12.
   check            provider       model       result   detail
   photo-gemini     -              -           skipped  no keys: set PLATEWISE_PROBE_KEY_GEMINI
   photo-anthropic  -              -           skipped  no keys: set PLATEWISE_PROBE_KEY_ANTHROPIC
   photo-openai     Custom server  fake-model  pass     parsed: 410 kcal, 2 parts; 1 request (HTTP 200); 78 ms
   coach            Custom server  fake-model  pass     answered in 208 characters, 1 tool round; 2 requests (HTTP 200, 200); 121 ms
   ```

   The CORS probe on the same server: `Custom server  userServer  direct  HTTP 200, answer`; "All
   1 measured providers match the catalogue." Neither output held the key.

## Found while preparing the check

- **The CORS probe could not run against the built app** (security review S-2): it added its
  bundle as an inline script, which the CSP that P09-18 added refuses. Fixed in
  `scripts/ai-cors-probe/browser.ts`: the bundle is now answered from an address on the app's
  origin and loaded with `<script src>`. Run 5 above is the proof.

## To do when keys are given

Run, from the repository root, with the keys exported in the shell (never written to a file):

```sh
pnpm build
PLATEWISE_PROBE=1 pnpm probe:cors
PLATEWISE_LIVE=1 pnpm exec tsx scripts/ai-live-check.ts
```

Then record here, without keys:

| Item | Source | Result |
|---|---|---|
| D-04.1: CORS per provider from the built app, including success replies (the research could only probe error replies) | probe table | pending: no keys |
| A photo analysis parses on each wire format (Gemini, Anthropic, an OpenAI-compatible vendor) | live check rows | pending: no keys |
| A Coach turn answers, with at least one tool round | live check row | pending: no keys |
| Models that reason by default (GPT-6, grok-4.3, Anthropic 5.5) under the 1 024-token cap: cut answers, and the re-ask keeping the same cap (HANDOFF, P03-17) | `truncated` failures or `requests > 1` on a photo row | pending: no keys |
| DeepSeek and Cerebras: still no vision models (no photo preset) | vendor model lists | pending |
| Curated presets refreshed against each vendor's list, `PRESETS_CHECKED_ON` set to the check date, a `PRESET_UPGRADES` step for every retired preset (D-16.25, R03.28) | vendor model lists | pending: no keys |
| Key-page addresses in `src/features/ai-setup/keyPages.ts` (written from memory, P05-04) open the right page | by hand in a browser | pending |
| Build date of the release | P10-14 | pending |

A `fail` row is a finding only when its kind is not the key's own fault: `keyRejected`, `credits`
and the quota kinds mean the key or the account, `connection` with the probe saying `blocked` means
CORS (roadmap risk 1: mark the provider `unsupported`, people use Custom with their own relay).
