# 04 · Architecture

The reference is two native mobile apps (SwiftUI and Kotlin/Compose) that share one idea: a
local-first diary on the device, AI calls made straight from the device with the user's own key,
and no first-party server in the core loop. We keep that idea. Its concrete form is not ours, so
every choice below is redone for a web app, with our own reasons.

## 1. Big picture

```
┌──────────────────────────── Browser / installed PWA ────────────────────────────┐
│                                                                                 │
│  UI (React)            features/home  features/log  features/progress           │
│  ───────────           features/coach features/settings features/onboarding     │
│        │ hooks (useLiveQuery-style subscriptions)                               │
│        ▼                                                                        │
│  App services          diary · goals · coach · analysis · backup · reminders    │
│        │                    │                    │                              │
│        ▼                    ▼                    ▼                              │
│  Domain (pure TS)      nutrition math, goal formulas, adaptive goals,           │
│                        forecast, serving scaling, meal-time grouping            │
│        │                                                                        │
│        ▼                                                                        │
│  Data (Dexie/IndexedDB)  entries · photos · weights · bodyFat · water · fasts   │
│                          savedMeals · chat · settings · secrets · drafts        │
│                                                                                 │
│  AI layer              provider catalog → transport adapters (Gemini, OpenAI-   │
│                        compatible, Anthropic) → retry/backoff → fallback chain  │
│        │                                                                        │
│  Service worker        offline app shell (cache-first static assets)            │
└────────┼────────────────────────────────────────────────────────────────────────┘
         │ HTTPS (user's key)                │ HTTPS (no key)
         ▼                                   ▼
   AI provider chosen by the user      Open Food Facts product API
   (or a local Ollama over HTTP)       (barcode lookup)
```

There is no Platewise server. The app is static files; it can be hosted anywhere (or served
locally) and works offline except for AI and barcode lookups.

## 2. Design rules

1. **The domain is pure.** Formulas (BMR/TDEE, macro split, adaptive correction, forecast,
   serving scaling, meal-time grouping, unit conversion) live in `src/domain/` as pure functions
   with no I/O, no React and no clock reads (time is passed in). They carry most of the unit tests.
2. **Grams and kcal are the truth.** Storage is always metric (grams, millilitres, kilograms,
   centimetres, kcal). Units the user picks (imperial, kJ, servings) are display conversions at
   the edge.
3. **One AI seam.** All model calls go through `src/ai/client.ts`: provider catalog → adapter →
   retry → fallback. Features never call `fetch` on a vendor URL themselves. Adapters absorb vendor
   quirks; prompts are ours and live in `src/ai/prompts/`.
4. **Validate at the boundary.** AI and barcode responses are untrusted input. Each is parsed into
   our own types by a validator that clamps, defaults and rejects. Nothing unvalidated reaches
   the store.
5. **Local-first, recoverable writes.** Every write is one Dexie transaction. Backups and exports
   are versioned JSON with a schema version and an integrity check on import.
6. **The UI is thin.** Screens read through hooks that subscribe to the store, and act through app
   services. No business rules in components.

## 3. Repo layout (inside `platewise/`)

```
src/
  app/            shell: tab bar, router, theme provider, error boundary, install prompt
  ui/             design tokens (CSS variables) and primitives: Button, Sheet, Card, Ring,
                  Bar, Field, Stepper, Segmented, Toast, Chart
  domain/         pure logic: units, nutrients, goals, adaptive, forecast, servings, meals, dates
  data/           Dexie schema, migrations, repositories, live-query hooks
  ai/             catalog, adapters, client (retry + fallback), prompts, parsers, image prep
  services/       app services: analysis, diary, coach, backup, export/import, reminders, barcode
  features/       onboarding, home, log (capture, review, edit, manual, saved), progress,
                  coach, settings, about
  sw/             service worker source
  test/           test setup, fixtures, fake providers
e2e/              Playwright specs (mobile viewport) + fake AI provider server
parity/           REA scenario files for our app + obligation ledger
scripts/          parity runner, notices generator, bundle check
tooling/checks/   clean-room guards
docs/             plan, notes, internals, user docs
```

## 4. Stack

| # | Layer | Choice | Why (our reasoning) | Alternative |
|---|---|---|---|---|
| 1 | Platform | Installable PWA | One codebase for phones and desktops, and fully testable in this environment with a real browser. Native wrappers (Capacitor) stay possible later | Expo React Native (D-0.1) |
| 2 | UI | React 19 + TypeScript 6 (strict) | Mature, typed, and well supported by tooling and by builders | Preact, Solid |
| 3 | Build | Vite 8 | Fast dev server and a small production bundle | — |
| 4 | Storage | IndexedDB via Dexie 4 | Transactions, indexes, blobs for photos, live queries; Apache-2.0 | `idb` plus hand-written queries |
| 5 | State | Store subscriptions (Dexie live queries) plus small React contexts for UI state | The database is the source of truth; no second store to sync | Zustand |
| 6 | Routing | Our own small hash router (tabs plus sheet stack) | Four or five tabs and modal sheets don't need a router library; hash URLs work on any static host and offline | React Router |
| 7 | Styling | Plain CSS with design tokens (custom properties) and CSS modules per feature | No runtime cost; light and dark themes swap token sets; easy to restyle | Tailwind |
| 8 | Charts | Our own SVG components | We need only a few chart types (line, bars, ring, area); a library would double the bundle | uPlot |
| 9 | Barcode | `BarcodeDetector` when present, else `zxing-wasm` (MIT), lazy-loaded | Native where available, works everywhere else | QuaggaJS |
| 10 | Camera | `<input type=file accept=image/* capture>` (multiple) plus an optional live `getUserMedia` view | Works on every phone browser; live view for the multi-shot flow | — |
| 11 | Images | Canvas downscale to JPEG before AI and before storage | Bounds request size and storage use | `createImageBitmap` + OffscreenCanvas when available |
| 12 | Tests | Vitest 5 (jsdom, fake-indexeddb), Testing Library, Playwright 1.63 (mobile viewport) | Fast unit tests plus real-browser flows | — |
| 13 | AI transport | `fetch` with `AbortController` timeouts | No SDKs: three wire formats cover all providers, and SDKs bloat the bundle and assume servers | Vendor SDKs |
| 14 | Offline | Our own small service worker (precache the app shell, network-only for AI) | The shell needs to load offline; vendor calls must never be cached | `vite-plugin-pwa` / Workbox |

## 5. One flow end to end: photo → logged entry

```
user taps + → Photo        features/log/capture: picks ≤ 10 images, optional note
  │
  ▼
services/analysis.analyze  ai/image: downscale each to ≤ max edge, JPEG, base64
  │                        ai/prompts/foodAnalysis: our prompt + JSON contract
  ▼
ai/client.complete         catalog(provider) → adapter.buildRequest → fetch
  │                        retry on 429/503/529: 1 s, 2 s, 4 s → on final failure: fallback provider
  ▼
ai/parse/foodResult        JSON extraction → validation → clamping → serving-unit repair
  │
  ▼
features/log/review        person checks/edits values (unlock → edit → lock scaling base)
  │ Log
  ▼
services/diary.logEntry    one transaction: entry + photo blob + saved-meal recency
  │
  ▼
Home live query re-renders ring, bars, meal section
```

## 6. Cross-cutting concerns

- **Secrets.** API keys live in their own IndexedDB table, never in exports by default, never in
  logs. A browser cannot protect a key from code running on the same origin; the Settings screen
  says so plainly (D-16 entry). A backup includes keys only when the person opts in.
- **Privacy.** No analytics, no third-party scripts, no fonts from CDNs. The only network calls
  are the person's chosen AI provider, Open Food Facts for barcodes, and (if enabled) an update
  check of our own static manifest.
- **Errors.** One error type per layer (`AiError` with kinds such as auth, quota, overloaded,
  network, timeout, bad response, blocked by CORS). The UI maps kinds to short messages with a
  next step.
- **Time.** Day boundaries use the device's local time zone. All stored timestamps are epoch
  milliseconds; a "day key" (YYYY-MM-DD in local time) is derived and indexed for diary queries.
- **Accessibility.** Every control has an accessible name. The ring and bars expose their values
  as text. Contrast is checked in both themes.
- **Performance.** The bundle budget is checked on a production build (initial JS ≤ 250 KB gzip).
  The barcode decoder and charts are lazy-loaded.

## 7. Risky choices, with a way out

- **D-04.1 Browser CORS for AI providers.** Some providers may refuse direct browser calls. Trial
  in P02: call each provider's endpoint from the built app in Chromium. Way out: mark a provider
  "needs a proxy" and accept a user-supplied base URL (for example their own small relay), so
  the provider still works without a Platewise server.
- **D-04.2 Reminders without a server.** Web pages cannot schedule exact notifications while
  closed. v1 shows reminders when the app is open or in the background (service worker timers
  are not reliable). Way out: a later phase can add a push relay or a native wrapper.
