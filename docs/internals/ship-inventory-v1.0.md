# What ships, v1.0

The production build (`pnpm build` → `dist/`) as of 2026-10-27 (base `68a1456` plus the P10 S3
accessibility fixes), read three ways (P10-08): the bundle budget, REA's static analysis of
`dist/`, and the banned-names check run once over `dist/`, and checked once at run time by an e2e
test that records every request (below, "Checked at run time"). Static analysis says what the
code can do, not what a session does; where the two differ the code is quoted by path. REA's
runs 1 and 2 read the build of base `71e9727`, whose product files are the same as `68a1456`'s
(only notes and status changed in between).

## Start-up JavaScript (the 250 kB budget)

`pnpm build && pnpm check:bundle` (`scripts/bundle-budget.ts`): the entry chunk and everything it
imports statically, gzipped, 1 kB = 1000 bytes.

| Counted file (start-up) | Raw | Gzip |
| --- | ---: | ---: |
| `index-*.js` | 608.70 kB | 190.71 kB |
| `primitives.module-*.js` | 10.16 kB | 3.88 kB |
| `react-dom-*.js` | 3.92 kB | 1.44 kB |
| `result-*.js` | 0.13 kB | 0.13 kB |
| `dayKey-*.js` | 1.24 kB | 0.63 kB |
| `formulas-*.js` | 1.60 kB | 0.80 kB |
| `model-*.js` | 0.91 kB | 0.53 kB |
| `targets-*.js` | 0.54 kB | 0.36 kB |
| `numbers-*.js` | 2.15 kB | 0.98 kB |
| `body-*.js` | 1.17 kB | 0.58 kB |
| `t-*.js` | 67.77 kB | 23.52 kB |
| `Button-*.js` | 1.55 kB | 0.72 kB |
| `modalLayer-*.js` | 1.81 kB | 0.91 kB |
| `ranges-*.js` | 0.45 kB | 0.30 kB |
| `clock-*.js` | 0.15 kB | 0.16 kB |
| `energy-*.js` | 0.66 kB | 0.38 kB |
| `settingsSchema-*.js` | 5.63 kB | 2.42 kB |
| `settings-*.js` | 6.91 kB | 2.77 kB |
| `times-*.js` | 1.09 kB | 0.57 kB |
| `fasting-*.js` | 1.47 kB | 0.69 kB |
| `catalogue-*.js` | 0.79 kB | 0.42 kB |
| `water-*.js` | 1.82 kB | 0.92 kB |
| `goalDefaults-*.js` | 1.98 kB | 0.97 kB |
| `context-*.js` | 0.41 kB | 0.29 kB |
| `inputs.module-*.js` | 1.43 kB | 0.51 kB |
| **Total** | | **235.60 kB** |
| Budget | | 250.00 kB |
| Headroom | | 14.40 kB |

`pnpm check:bundle`: `PASS: initial JS is 235.60 kB gzip, 14.40 kB under the 250.00 kB budget.`
The Your data page (P09-15) and this slice's fixes are in it; the page itself is a lazy chunk.

| Lazy chunk (not counted) | Raw | Gzip |
| --- | ---: | ---: |
| `ReviewSheet-*.js` | 42.72 kB | 13.82 kB |
| `ProgressPage-*.js` | 41.31 kB | 12.98 kB |
| `wasmReader-*.js` | 34.95 kB | 12.18 kB |
| `engine-*.js` | 25.02 kB | 9.90 kB |
| `CreditsPage-*.js` | 29.66 kB | 8.09 kB |
| `CoachPage-*.js` | 16.64 kB | 5.81 kB |
| `planning-*.js` | 13.32 kB | 5.68 kB |
| `client-*.js` | 12.54 kB | 5.46 kB |
| `payload-*.js` | 12.62 kB | 4.84 kB |
| `GoalsPage-*.js` | 15.48 kB | 4.74 kB |
| `food-*.js` | 11.54 kB | 4.69 kB |
| `DataPage-*.js` | 14.82 kB | 4.43 kB |
| `ProfilePage-*.js` | 15.13 kB | 4.43 kB |
| `TrackingPage-*.js` | 15.49 kB | 4.28 kB |
| `AiPage-*.js` | 10.86 kB | 3.71 kB |
| `SettingsScreen-*.js` | 9.97 kB | 3.41 kB |
| `EntryEditor-*.js` | 8.08 kB | 3.24 kB |
| `importDiary-*.js` | 6.75 kB | 2.70 kB |
| `MenuEditorPage-*.js` | 7.53 kB | 2.60 kB |
| `exportDiary-*.js` | 3.96 kB | 1.90 kB |
| `AppPage-*.js` | 6.01 kB | 1.89 kB |
| `exportFormats-*.js` | 4.22 kB | 1.71 kB |
| `backup-*.js` | 3.20 kB | 1.62 kB |
| `AboutPage-*.js` | 4.25 kB | 1.50 kB |
| `restore-*.js` | 2.86 kB | 1.39 kB |
| `RestoreSheet-*.js` | 3.52 kB | 1.32 kB |
| `RestoreFromFile-*.js` | 3.47 kB | 1.26 kB |
| `FastEditor-*.js` | 3.03 kB | 1.25 kB |
| `AnalysisOverlay-*.js` | 2.44 kB | 1.17 kB |
| `aboutPage.module-*.js` | 1.96 kB | 1.08 kB |
| `WaterMenuPage-*.js` | 2.40 kB | 0.92 kB |
| `CustomWaterSheet-*.js` | 1.69 kB | 0.92 kB |
| `Stepper-*.js` | 1.85 kB | 0.89 kB |
| `StartFastSheet-*.js` | 1.84 kB | 0.87 kB |
| `writes-*.js` | 1.37 kB | 0.76 kB |
| `ProductFieldsPage-*.js` | 1.65 kB | 0.74 kB |
| `TabsPage-*.js` | 1.25 kB | 0.64 kB |
| `json-*.js` | 1.00 kB | 0.60 kB |
| `water.module-*.js` | 0.58 kB | 0.30 kB |
| `fasting.module-*.js` | 0.56 kB | 0.30 kB |
| `wheelOptions-*.js` | 0.20 kB | 0.20 kB |

What must not be in the start-up download, and where it is:

| Heavy part                     | Chunk (lazy)                                       | Loaded when                      |
| ------------------------------ | -------------------------------------------------- | -------------------------------- |
| Barcode decoder (zxing WASM)   | `wasmReader-*.js` and `zxing_reader-*.wasm` (966 kB raw, never counted: not JavaScript) | the first camera frame on a browser without a usable `BarcodeDetector` |
| Charts (line and bar)          | `ProgressPage-*.js` (`src/ui/charts/*`)            | the Progress tab is first opened |
| Markdown (Coach replies)       | `CoachPage-*.js` (`src/features/coach/markdown.tsx`) | the Coach tab is first opened  |

Checked from the source maps of the build: `src/ui/charts/{LineChart,BarChart}.tsx` sit only in
the Progress chunk, `src/features/coach/markdown.tsx` only in the Coach chunk, and
`src/services/barcode/wasmReader.ts` with zxing-wasm only in `wasmReader-*.js`; none of them is
in the counted files.

## REA static analysis

REA 6.8.0 (`~/rea-lab/rea analyze-javascript-application --artifact-format directory`) read a copy
of this `dist/` without its source maps and Vite's manifest (96 files: the page, the web manifest,
the icons, the `.wasm`, `sw.js` and 66 chunks). Source maps are not code the browser runs, and
with them the analysis did not finish. The Evidence stays outside the repository
(02-rea-workflow §1); this page cites its ids.

| Run | Sources | Result | Evidence |
| --- | --- | --- | --- |
| 1 | all 67 JavaScript files, 900 s per source | stopped on `index-*.js` (the entry chunk, 609 kB) at the per-source deadline, after 43 files | partial observation `ev_7567b2cbca34450e1a539fcf51fa3b5d14468aef21c7839a363352c63285c43a` (not kept) |
| 2 | the 66 files other than the entry chunk | complete: 68 relevant files, 66 parsed, no parse failure, 136,366 syntax nodes visited, 1,956 findings | `ev_5b08c637688825e1ddd874a2e7c2e66d11ca83b7b087f9e508c787adc4cc238f` in `~/rea-lab/evidence/platewise-v1.0.json` (101 MB); summary view `ev_d509b7449b36a89c9fba1ae143a06a234e99cccb6bbc4127ea78f39d16b99a74` |
| 3 | the entry chunk alone (build of `68a1456`), 2 GB heap, 1,200 s, semantic limits lowered to 30,000 nodes (10,000 per file) and 10,000 unknowns (5,000 per file) | stopped at the per-source deadline in its static pass: nothing kept from the entry chunk (0 files parsed, 0 findings, no route) | partial observation `ev_5711d29298ca31c9b997cff04398212d42cbb780317b5d65ffcc44ec66aa1ebc` (not kept) |

What the Evidence of run 2 says, family by family:

- **Routes:** none. Its route inventory is empty, with application routes "unknown": REA looks
  for path routers, and ours reads `location.hash` (`src/app/router.ts`). The Routes table below
  comes from the router and the Settings registry.
- **Network endpoints:** two `fetch` call sites, both in `wasmReader-*.js`, whose address is
  worked out at run time (resolution "partial"): zxing-wasm loading its `.wasm`, which
  `src/services/barcode/wasmReader.ts` points at the build's own copy. No other endpoint.
- **Storage and workers:** none recorded.
- **Limits:** REA kept its per-file static facts for 22 of the 66 files; for the rest its result
  budget (bound to its own heap) ran out (`resource_constraint`), and the semantic analysis of 30
  files was interrupted. 15,344 semantic unknowns remain.

So the Evidence contradicts nothing below, but it cannot prove the tables alone: the entry chunk
is beyond REA 6.8.0 on this machine even on its own (run 3), and everything that
talks to the network or stores data sits in the entry chunk (the source maps place every
`fetch` in `src/ai/transport.ts` and `src/services/barcode/http.ts`, `localStorage` in
`src/app/InstallPrompt.tsx`, `src/data/wipe.ts`, `src/services/reminders/ports.ts` and
`src/services/storageNudge.ts`, IndexedDB in `src/data/db.ts` and `src/data/wipe.ts`) or in
`sw.js`. The tables therefore come from that code, cited by path, from a scan of every address
in the shipped `.js`, `.html` and manifest files (the last table under Network endpoints), and
from the run-time check below.

## Routes

The app is one page (`index.html`) with a hash router (`src/app/router.ts`); sheets live in
`history.state`, not in the address. REA finds no route table in the bundle (it reads path routers,
not a hash parser), so the list comes from the router and the Settings registry:

| Address                       | Screen                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| `#/onboarding`                | the wizard (a fresh browser opens here)                                |
| `#/home` (or no hash)         | Home                                                                   |
| `#/progress`                  | Progress (lazy chunk)                                                  |
| `#/coach`                     | Coach (lazy chunk)                                                     |
| `#/settings`                  | the Settings list (lazy chunk)                                         |
| `#/settings/<page>`           | `profile`, `goals`, `tracking`, `ai`, `app`, `data`, `about`, `methods` from the list; `menu`, `product-fields`, `tab-bar` from App settings; `credits` from About (each a lazy chunk) |

An address the router cannot read opens Home (`parseHash` returns `null`). The service worker is
at `/sw.js` with the page's own scope; `manifest.webmanifest` declares `start_url` and `scope` as
`./`.

## Storage

All of it on the person's device, under the app's origin:

| Where             | Name                                   | What                                                                                     |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| IndexedDB         | database `platewise`, schema version 1 (`src/data/schema.ts`) | tables `profile`, `entries`, `photos`, `savedMeals`, `weighIns`, `bodyFat`, `water`, `fasts`, `coachMessages`, `settings`, `secrets` (API keys, AES-GCM sealed), `drafts`, `quarantine` (rows that failed the guard), `meta` (the non-exportable device key that seals the API keys, and two flags: a restore in progress, unreadable rows found) |
| localStorage      | `platewise-reminders`                  | the reminder log: what was shown when (`src/services/reminders/ports.ts`)               |
| localStorage      | `platewise-install-shown`              | when the install card was last shown (`src/app/InstallPrompt.tsx`)                       |
| localStorage      | `platewise-backup-quiet`               | when the backup card's 14 days last started (`src/services/storageNudge.ts`)            |
| Cache Storage     | `platewise-shell-<version>`            | the app shell of one build, and the decoder's `.wasm` once a scan has fetched it; older `platewise-` caches are deleted on activate (`src/sw/sw.ts`) |
| BroadcastChannel  | `platewise`                            | not storage: tells other open tabs what changed, and that everything is being erased (`src/data/bus.ts`) |

Erase everything deletes the database whole and every Cache Storage entry and localStorage key
that starts with `platewise-` (`src/data/wipe.ts`). No cookies, no sessionStorage.

## Network endpoints

Hosts the built app sends requests to. Nothing else is contacted: no analytics, fonts or scripts
from elsewhere (the CSP in `index.html` allows scripts, styles and workers from the app's own
origin only).

| Host                                      | Used for                                                    | Code                                         |
| ----------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| the chosen AI provider's API (below)      | photo and text analysis, the plan, the Coach, the fit check | `src/ai/transport.ts`, `src/ai/catalog/providers.ts` |
| `world.openfoodfacts.org`                 | product lookup by barcode, `/api/v2/product/<code>`         | `src/services/barcode/off.ts`                |
| `images.openfoodfacts.org`                | the product photo, as an image (the URL comes in the product reply) | CSP `img-src`                       |
| `api.nal.usda.gov`                        | FoodData Central search, only with the person's own key     | `src/services/barcode/fdc.ts`                |
| the app's own origin                      | the shell, the lazy chunks, the `.wasm`, the manifest, `sw.js` | `src/sw/sw.ts`                            |

The AI provider is one of the catalogue's fixed API hosts, or an address the person types:

| Provider                 | API host                                   |
| ------------------------ | ------------------------------------------ |
| Gemini                   | `generativelanguage.googleapis.com`        |
| OpenAI                   | `api.openai.com`                           |
| Anthropic                | `api.anthropic.com`                        |
| xAI                      | `api.x.ai`                                 |
| OpenRouter               | `openrouter.ai`                            |
| Together AI              | `api.together.xyz`                         |
| Groq                     | `api.groq.com`                             |
| Hugging Face             | `router.huggingface.co`                    |
| Fireworks AI             | `api.fireworks.ai`                         |
| DeepInfra                | `api.deepinfra.com`                        |
| Mistral AI               | `api.mistral.ai`                           |
| DeepSeek                 | `api.deepseek.com`                         |
| Qwen                     | `dashscope-intl.aliyuncs.com`              |
| Cerebras                 | `api.cerebras.ai`                          |
| Ollama                   | `localhost:11434` by default, or the server the person types |
| Custom server            | the server the person types                |

That last pair is why the CSP's `connect-src` allows any `https:` host and plain `http:` on
loopback only (D-16.26).

Other addresses in the shipped files are never requested by the app; they are links the person
may open, or text:

| Address in `dist/`                                                         | What it is                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `aistudio.google.com`, `platform.openai.com`, `console.anthropic.com`, `console.x.ai`, `openrouter.ai`, `api.together.ai`, `console.groq.com`, `huggingface.co`, `fireworks.ai`, `deepinfra.com`, `console.mistral.ai`, `platform.deepseek.com`, `modelstudio.console.alibabacloud.com`, `cloud.cerebras.ai` | "Get a key" links, one per provider (`src/features/ai-setup/keyPages.ts`) |
| `fdc.nal.usda.gov`                                                         | the FoodData Central key sign-up link (`src/features/settings/ai/FoodDbSection.tsx`) |
| `doi.org`, `www.fao.org`                                                   | the sources on the Methods page                                |
| `github.com/varunisrani/cal.2`                                             | sent only as the `HTTP-Referer` header to OpenRouter (its app attribution, `src/ai/adapters/openaiCompat.ts`) |
| `github.com/…` of the app that inspired us, `www.apache.org`, `dexie.org`, `sindresorhus.com` | licence texts and links on the Credits page                    |
| `fastly.jsdelivr.net`                                                      | zxing-wasm's default `.wasm` location, inside the library; overridden by `src/services/barcode/wasmReader.ts`, which serves the `.wasm` from the build |
| `react.dev`, `bit.ly`, `tinyurl.com`, `www.w3.org`                         | React's and Dexie's error-message links, the SVG namespace     |
| `example.com`                                                              | an example address in a validation message                    |
| `localhost`, `127.0.0.1`, `[::1]`                                          | the CSP's loopback hosts and Ollama's default                  |

### Checked at run time (ACC-L6-2)

`e2e/hosts.spec.ts > the hosts the built app contacts (ACC-L6-2) > only its own origin, the AI
provider and the food databases, across every screen` drives the built app under `vite preview`
through everything that talks to the network: the wizard's plan and a Coach question (the AI as
the Custom provider at the fake's loopback address), a product found by Open Food Facts with its
photo, a code it does not know searched in FoodData Central with a key, then Progress, the
Settings list and every Settings page (so each lazy chunk is fetched). It records every request
of the browser context by origin and expects exactly the app's origin, the provider, and
`world.openfoodfacts.org`, `images.openfoodfacts.org` and `api.nal.usda.gov`, each of them
reached and nothing else; the hosts are written out in the test, not imported from the code. A
request to any other host, loopback included, fails it (checked once by adding a stray `fetch`
to an unused loopback port). The real providers' hosts are not called by any test (the fake
stands in for them); they are the catalogue's fixed addresses in the table above.

## Workers

| Worker            | File     | Role                                                                                         |
| ----------------- | -------- | -------------------------------------------------------------------------------------------- |
| Service worker    | `/sw.js` | the offline shell: cache-first for the build's files, network-first for the page with the stored `index.html` as the fallback; never touches requests to other origins; shows reminder notifications for the page (`showNotification`) |

No dedicated, shared or audio worklet workers: the WASM barcode reader runs on the page, one frame
at a time with gaps between them (`src/services/barcode/decoder.ts`).

## Banned names in `dist/` (one-off)

`pnpm check:banned` walks the repository and leaves build output out, so it was run once over
`dist/` with the check's own code, unchanged (`loadPatterns` and `scanBanned` from
`tooling/checks/banned.ts`, the root set to `dist/`, from a throwaway script outside the repo).
All 24 patterns over the 164 files of the build, source maps included (binary files, the icons
and the `.wasm`, are skipped as the check skips them everywhere):

- **6 findings, all in one place:** `assets/aboutPage.module-*.js`, the credit to the app that
  inspired us on the Credits and About pages (P09-16). It holds that app's name, its repository
  address and its MIT notice with the author's name: `product-name` ×2, `product-short-name` ×2,
  `author-handle` ×2. The build reads them from the "Design inspiration" section of
  `THIRD_PARTY_NOTICES.md` (`readCredit` in `scripts/notices.ts`, called from `vite.config.ts`), so
  no product source names that app; the MIT licence asks for the notice to travel with the work.
  The chunk is lazy (loaded with Settings), never in the start-up download.
- **Nothing else:** no reference name in any other chunk, in `index.html`, `sw.js`, the manifest
  or the source maps.

Decision for the lead: this is the intended credit, not a leak; the banned check's exemption
list already covers `THIRD_PARTY_NOTICES.md` for the same reason. If a future check runs over
`dist/` for real, it needs that one chunk on its allow-list with this reason.
