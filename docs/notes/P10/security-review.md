# Task: security review (P10-09) · Phase: 10 · Owner: builder (wt-p10s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row's "Read in reference" column says none: the
reference is a native app with no CSP, no browser storage and no web threat model, so nothing in
it bears on this review. Read instead: `docs/plan/04-architecture.md` §6 (privacy), decisions
D-16.7 (keys in a local store, a plain warning), D-16.26 (plain http only to this device),
D-16.29/30 (backups, never keys), D-16.31 (Details with keys cut out), D-16.51 (non-extractable
device key), D-16.52 (stored ZIP), `docs/plan/research/03-ai-providers.md` §3.12–3.15, and the
landed code the review is about: `index.html` (CSP), `vite.config.ts` (the dev-only CSP strip),
`src/data/{crypto,storage,wipe}.ts`, `src/data/repos/{secretsRepo,backupRepo,transferRepo}.ts`,
`src/services/backup/*`, `src/services/transfer/*`, `src/services/coach/{engine,session}.ts`,
`src/ai/{client,errors,transport,endpoint,retry}.ts`, `src/ai/adapters/*`, `src/ai/chat/*`,
`src/features/coach/{markdown,ErrorBanner,Bubble}.tsx`, `src/domain/food/labelText.ts`,
`src/services/barcode/{off,fdc,wasmReader}.ts`, `src/sw/sw.ts`, every `console.*` call in `src/`.

What it does (own words): writes down, for v1.0, who could hurt a person using Platewise and how,
and checks each promise the app makes against the built app and the tests. Platewise has no
server: the person's diary, photos and API keys live in their browser, and the page talks straight
to the AI provider they chose and to two food databases. So the assets are the keys (they cost
money and identify the person to a vendor) and the diary (health data); the attackers are a
malicious or compromised AI reply, crowd-sourced food-database text, a crafted backup or diary
file the person is tricked into opening, another site, someone with the device or its storage
files, and a supply-chain change in a dependency. The review records what stops each one, adds
tests that plant a key and search every output the app makes for it (export files, backup
archives, Coach error details, the console), verifies the CSP in a real browser against the
built app, records `pnpm audit`, fixes what is small and local, and lists the rest as open items
with a proposed fix.

Inputs → outputs: the landed code, `dist/` from `pnpm build`, `pnpm audit` → 
`docs/internals/security-review-v1.0.md`, planted-key tests in the modules that own each output.

Files: created `docs/internals/security-review-v1.0.md`, `src/test/plantedKeys.ts` (shared test
helper: the planted keys, a byte and text search, a console recorder) with
`src/test/plantedKeys.test.ts`, and planted-key tests next to the outputs they search:
`src/services/transfer/plantedKey.test.ts` (export files), `src/services/backup/plantedKey.test.ts`
(backup archive, made and handed over, and its restore), `src/services/coach/plantedKey.test.tsx`
(Coach Details, the stored chat and a backup made after a failure), `src/ai/plantedKey.test.ts`
(food-request failure details, addresses of every provider's request). Fixes: CSV formula
neutralising in `src/services/transfer/exportFormats.ts` with `src/services/transfer/
csvFormula.test.ts`; the CORS probe's page script served from the app's origin in
`scripts/ai-cors-probe/browser.ts`. A throwaway Playwright script in the scratchpad checks the
CSP in the built app (not committed).

Edge cases / failure modes:
- A provider that echoes the key in its error body: the detail kept for Details must have every
  stored key cut out, the standby's key too, and in "both failed" as well.
- A key that only ever lives in another slot (the food-database key, a provider not in use): no
  output may carry it either.
- A backup carries Blobs as base64 inside `payload.json`: the search must look inside the decoded
  Blobs too, not only the archive's bytes.
- The console: every failure path that logs (backup, restore, export hand-over, import cleanup)
  must not log a key; error objects are searched through their message, stack and cause.
- CSP in a meta tag cannot carry `frame-ancestors`, `report-to` or `sandbox`; those need the host.
- The `http://[::1]:*` source is invalid in Chromium's parser and is dropped with a console
  error on every load: decide keep or drop.
- A crafted backup can give a Coach thumbnail any MIME type; a crafted diary file can carry long
  strings; a crafted ZIP can carry stray entries or huge entries.

Our design differences / decisions:
- Planted keys are made-up strings with a recognisable shape per vendor family, never real keys.
- Planted-key tests are additive files (`plantedKey.test.ts`) beside the module that owns the
  output; they do not change the existing tests.
- A finding is fixed here only when it is small and local; anything that changes a decision,
  another slice's tests or the CSP text is written up as an open item with the proposed change.

Tests we will write:
- Export: every format (JSON, Markdown, CSV) of All time from a diary seeded beside planted keys
  in every slot; no key in any file, the hand-over's File included; nothing logged with a key,
  also when the hand-over's download fails.
- Backup: made through the real service and handed over (share and download), restored into a
  fresh store; no key in the archive bytes, in any decoded Blob, in the restored tables, or in
  the console; a crafted backup that carries a `secrets` table restores without it.
- Coach: a turn whose primary and standby both echo every stored AI key (the food-database key
  never reaches an AI provider: each request must carry only its own provider's key); the stored
  Details, the Details on screen, a backup made afterwards and the console hold none of them.
- AI client: a photo request on each wire format whose error body echoes the keys; the failure's
  detail and `failureMessages` hold none; no provider's request address holds its key.

Compare checklist (filled after the rewrite; no reference files: the row names none, so the
compare is against the row, the decisions and the acceptance ids):
- [x] Export files hold no key (`src/services/transfer/plantedKey.test.ts > diary export: no key
  in any output (P10-09, D-16.7) > holds no stored key, in any form, in the %s file or the File
  handed over`, for json, markdown and csv; `> logs no key when the hand-over fails`)
- [x] Backup archives hold no key, also in decoded Blobs and after a restore
  (`src/services/backup/plantedKey.test.ts > backup: no key in any output (P10-09, ACC-E14-2,
  D-16.30) > hands over (%s) a file with no stored key in its bytes, its decoded Blobs or its
  photos`, share and download; `> restores on another device without any key, and leaves that
  device’s own keys as they were`)
- [x] Coach Details hold no key (`src/services/coach/plantedKey.test.tsx > Coach Details: no key in
  any output (P10-09, D-16.31, R03.18) > stores and shows a refusal from %s with every key cut
  out`, primary alone and with its standby)
- [x] Console output holds no key (every planted-key test records the console; failure paths:
  `src/services/backup/plantedKey.test.ts > … > logs no key when a backup fails part-way`,
  `src/services/transfer/plantedKey.test.ts > … > logs no key when the hand-over fails`)
- [x] Error details hold no key on every wire format, and a key goes only in its own provider's
  header (`src/ai/plantedKey.test.ts > failures: no key in a detail or a message (P10-09, R03.18,
  D-16.31) > a photo request on %s, then its standby %s, both echoing every key`; `> requests: a
  key goes only in its own provider’s header (P10-09, D-16.7) > builds %s food and Coach requests
  with no key in the address`, all 16 providers)
- [x] CSV export never hands a spreadsheet a formula (`src/services/transfer/csvFormula.test.ts >
  toCsv: no formula reaches a spreadsheet (P10-09) > writes a formula-looking name, note and part
  as text, and leaves numbers and plain names alone`)
- [x] CSP verified in the built app (scratchpad Playwright run against `dist/`: 20 of 20 probes as
  expected; an HTML Blob inherits the policy; results in the review §5.1)
- [x] `pnpm audit` recorded with decisions (0 vulnerabilities in 307 dependencies; review §5.8)
- Mutation checks: a key hidden in a Coach thumbnail fails 3 of the 4 backup tests; switching the
  redaction in `src/ai/errors.ts` off fails 6 tests (4 AI, 2 Coach); `inertText` returning its
  input fails 7 of the 12 CSV tests.
- Deliberate differences: none.
- Not taken: the open items S-3 to S-9, S-12 and S-15 of the review (each needs another slice's
  files, a decision or the hosting), written up there with the proposed change.

## Status

Done (2026-10-27). Review written; 52 tests in six new test files, all passing. Fixed two findings
(S-1 CSV formulas, S-2 the CORS probe under the CSP). Lines changed outside the task's own files:
`src/services/transfer/exportFormats.ts` (`inertText` and its three uses) and
`scripts/ai-cors-probe/browser.ts` (the bundle served from the app's origin). For the lead: the
`http://[::1]:*` decision (S-3, recommended: drop it and refuse `[::1]` at save time with a hint),
`form-action 'none'` (S-5), the hosting headers (S-4) and `pnpm audit` in CI (S-15).
