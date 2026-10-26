# 00 · Repo layout and conventions

Every phase file assumes this tree and these rules. If a task needs a path that is not here, add it
here first (in the same commit), then use it. The tree follows `04-architecture.md` §3; the folders
added below it (`src/i18n/`, `src/lib/`, `src/config/`, `src/generated/`, and the sub-folders of
`ai/`, `data/` and `services/`) are named with the phase that creates them.

## 1. The tree (inside `platewise/`)

```
platewise/
  index.html                 app shell page; manifest link, theme colour, CSP (P09-18)
  package.json               scripts, exact dependency versions
  vite.config.ts             build, test env (TZ), precache plugin (P00-08, P09-17)
  playwright.config.ts       mobile viewport project; fake-AI global setup; SW and engine projects (P00-09, P09-19, P10-11)
  eslint.config.js           boundaries, fetch and IndexedDB limits, copy rule (P00-07)
  ci/platewise.yml           CI workflow source (P00-01; copied to the repo root on D-16.54)
  public/
    icons/                   our mark and rendered icons (P00-04)
    manifest.webmanifest     web app manifest (P09-18)
  src/
    main.tsx                 entry
    app/                     shell: App, Boot, router, TabBar, ThemeProvider, TodayProvider, ErrorBoundary,
                             appState, swRegistration, UpdateBanner, InstallPrompt, useTuneUp (P04, P05, P09)
    ui/                      tokens.css, tokens.ts, theme.ts, contrast.ts (P00); primitives (P04)
      icons/                 our inline SVG icon set (P04-03)
      charts/                LineChart, BarChart (P07-10, P07-11)
    i18n/                    t.ts, format.ts, locale.ts, lint.ts, en.ts (P00-05, P00-06)
      en/                    catalogue partitions, one per area/slice (common, ai, onboarding, home, log, …)
    lib/                     clock.ts, ids.ts, result.ts (P00-08); imageCodec.ts (P06-02)
    config/                  links.ts: Platewise's own URLs (P09-16)
    generated/               notices.json written by scripts/notices.ts at build time (gitignored, P09-16)
    domain/                  pure TypeScript, no React, Dexie, fetch or clock reads (P01, P06, P07)
      model.ts               shared records (P01-01)
      dates/                 dayKey, ranges, week, age (P01-02)
      units/                 energy, body, defaults, water, numbers (P01-03..06)
      nutrients/             catalogue, goalDefaults, pillars (P01-07)
      meals/                 times, diary (P01-08)
      servings/              expression, units, scale, ingredients, recipe (P01-06, P01-09..11)
      goals/                 formulas, maintenance, targets, locks, planEdit, planValidator (P01-12..14)
      profile/               profile, editRules, signature (P01-15)
      adaptive/              cadence (P01-16)
      forecast/              evidence, forecast (P01-17, P01-18)
      trackers/              fasting, goalCrossing (P01-19)
      food/                  combine (P01-11); addMenu, reuse, barcode, productText, allergens, labelText (P06)
      progress/              ranges, chartMath, recap, averages (P07)
    data/                    the only code that touches IndexedDB (P02)
      schema.ts, db.ts, guard.ts, live.ts, useLive.ts, bus.ts, crypto.ts, wipe.ts, storage.ts,
      settingsSchema.ts, hooks.ts
      repos/                 settingsRepo, profileRepo, diaryRepo, photoRepo, draftsRepo, weightRepo,
                             bodyFatRepo, waterRepo, fastRepo, savedMealsRepo, coachRepo, secretsRepo
    ai/                      the only AI seam (P03, P08)
      errors.ts, settings.ts, endpoint.ts, deadline.ts, transport.ts, retry.ts, image.ts, client.ts
      catalog/               providers, presets (P03-03)
      adapters/              gemini, openaiCompat, anthropic (P03-07..09)
      chat/                  Coach tool rounds per format (P08-05..07)
      parse/                 json, foodReply, units, parts, planReply, nutrientGoals, labelReply (P03-11..14)
      prompts/               contract, food, shared, plan, evidenceText, nutrientGoals, fitCheck, coach (P03, P08)
      tasks/                 food, planning (P03-18)
      testing/               fakeFetch, wire (P03-02)
    services/                app services: orchestrate domain + data + ai, no UI
      diary.ts, analysis.ts, photos.ts, captureDrafts.ts, copyDay.ts, combine.ts, onboarding.ts,
      storageNudge.ts
      goals/                 planBuilder, rebuild, tuneUp (P05)
      barcode/               decoder, off, fdc, lookup (P06-14..17)
      coach/                 context, tools, toolSchemas, limiter, history, engine, session (P08)
      reminders/             schedule, engine, notifier (P09-08, P09-09)
      transfer/              exportDiary, exportFormats, importDiary (P09-10, P09-11)
      backup/                zip, archive, hash, backup, restore (P09-12, P09-13)
    features/                screens; read through data/hooks.ts, act through services
      onboarding/            WizardPage, wizard.ts, steps/, QuickStart (P04, removed in P05), RestoreFromFile (P09)
      ai-setup/              ProviderForm, ModelPicker, KeyField (P05-04, reused by P09-07)
      home/                  HomePage, DaySummary, Diary, EntryRow, PillarRow, WeekBar, DaySwipe, … (P04, P06, P07)
      log/                   AddMenu, ManualSheet, DescribeSheet, AnalysisOverlay, FitCheckSheet,
                             EntryEditor, CopyDaySheet (P04, P06)
        capture/             CaptureSheet, PhotoCard (P06-03)
        review/              ReviewSheet and its parts (P06-06..09, P06-18)
        reuse/               ReuseSheet, ReuseRow (P06-12)
        scan/                ScanSheet, DigitsField (P06-14)
      water/                 WaterMenuPage, CustomWaterSheet, WaterSettings, PresetsEditor (P07-06)
      fasting/               StartFastSheet, FastEditor, FastingSettings, PausedDialog (P07-07)
      goals/                 GoalReachedDialog (P05-14)
      progress/              ProgressPage, RangeBar, MetricSwitch, cards and sheets (P04, P07)
      coach/                 CoachPage, MessageList, Composer, chips, markdown, … (P04, P08)
      settings/              SettingsHub, registry, CategoryPage (P04, P09)
        profile/  goals/  app/  tracking/  ai/  data/    category pages (P05, P07, P09)
      about/                 MethodsPage, AboutPage, CreditsPage (P05-13, P09-16)
    sw/                      sw.ts service worker (P09-17)
    test/                    setup.ts, time.ts (P00-08), factories.ts (P02-01)
  e2e/                       Playwright specs (mobile viewport)
    fake-ai/                 scripted OpenAI-compatible server and scripts (P00-09)
    fixtures/                our own test photo and food-database replies (P06-20, P09-19)
  parity/                    REA scenario files and the obligations ledger (P04-14, P10-01..04)
    ledger/
  scripts/                   ci-local.sh, bundle-budget.ts, render-icons.ts, lint-fixtures/, notices.ts,
                             ai-cors-probe.ts, ai-live-check.ts, parity.ts
  tooling/checks/            clean-room guards (landed; do not edit without the lead)
  docs/
    plan/                    this plan; research/ (read-only for builders)
    notes/P<nn>/             task notes, one per task
    internals/               checks.md, traps-ledger.md, acceptance-map.md, reports
    user/                    user docs (P10-13)
```

## 2. Conventions

| Topic | Rule |
|---|---|
| Runtime | Node ≥ 22.12 for the app and tests; pnpm with `--frozen-lockfile`. REA runs on Node 24 outside the repo (`02-rea-workflow.md`). |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules` (as in `tsconfig.app.json`). No `any` without a comment saying why; no non-null `!` on data read from storage or the network. |
| Modules | Named exports only (no default exports, except where a tool demands one, e.g. config files). Relative imports; no path aliases. |
| File naming | React components `PascalCase.tsx` (one component per file, styles in `Name.module.css` or a shared `<area>.module.css`); everything else `camelCase.ts`. Pages end in `Page`, bottom sheets in `Sheet`, dialogs in `Dialog`. Never reuse a reference file or type name (`17-naming-and-glossary.md` §1). |
| Layers | `domain` imports nothing outside itself. `data` imports `domain`. `ai` imports `domain` and `i18n` (messages) only. `services` import `domain`, `data`, `ai`. `features`, `app` and `ui` read through `src/data/hooks.ts` and act through `services`; they never import `dexie`, `data/db`, `data/repos/*`, `ai/adapters/*` or `ai/transport`. Enforced by lint (P00-07). |
| IndexedDB | Only through repositories in `src/data/`. Every change is one read-write transaction; cross-entity rules read inside it. Never delete or overwrite unreadable data: quarantine it (P02-02). |
| Network | Vendor `fetch` only in `src/ai/transport.ts` (AI) and `src/services/barcode/*` (Open Food Facts, FoodData Central); the service worker never touches cross-origin requests. No other host is ever contacted. Keys only in headers, never in URLs or logs. |
| Time | The domain takes time and day keys as parameters; services take a `Clock` (`src/lib/clock.ts`). Day keys are local `YYYY-MM-DD`; stored instants are epoch ms. Tests pin `TZ=America/New_York` (`vite.config.ts`) and use `inTimeZone()` for other zones. |
| Units | Storage is canonical: kcal, grams, mg, mcg, kg, cm, ml, body fat as a fraction. Display units convert at the edge (`src/domain/units/`). Exports always write kcal. |
| Copy | Every user-visible string lives in the one English catalogue exported by `src/i18n/en.ts`, written in per-area partitions under `src/i18n/en/` (Proposed D-16.55: a slice owns its partition; only the lead edits `en.ts`). Use `t()`; numbers and dates through `src/i18n/format.ts`. Lint rejects literal JSX text and literal `aria-label`/`title`/`placeholder`/`alt`. AI prompts are ours, in `src/ai/prompts/`, written from the specs' described intent, never from the reference's prompt text. |
| Accessibility | Every interactive element has an accessible name and a `data-ui="<area>.<thing>"` hook (used by e2e and REA parity scenarios). Values drawn as graphics (gauge, pillars, charts) are also available as text. Respect `prefers-reduced-motion`. |
| Styling | Plain CSS with the tokens of `src/ui/tokens.css`; no colour literals outside the tokens file; logical properties (`margin-inline-start`) so RTL is cheap later (R07.20). |
| Tests | Next to the code: `name.test.ts` / `name.test.tsx`; e2e in `e2e/*.spec.ts`. Vitest with jsdom and fake-indexeddb; Testing Library for components; Playwright Pixel 7 project for flows. **No real sleeps**: `vi.useFakeTimers()` and `src/test/time.ts`. No network in unit tests (`src/ai/testing/fakeFetch.ts`); e2e uses the loopback fake AI server and Playwright routes for food databases. Describe and test names are stable English sentences so ledger rows (`file > describe > test`) keep resolving. |
| Fixtures | Our own values and text only. Never copy the reference's tests, fixtures, sample JSON, images or prompt text. Tests that need a banned word build it from pieces. |
| Dependencies | Exact versions only (no `^` or `~`), each at least two weeks old when added, licence on `tooling/checks/licenses.allow.json`. New production dependencies need a line in the task note saying why. Current: React 19.3.0, Dexie 4.4.6, zxing-wasm 3.1.5 (lazy). |
| Banned names | `tooling/checks/banned-patterns.json`; reference names may appear only in `README.md`, `AGENTS.md`, `CLAUDE.md`, `THIRD_PARTY_NOTICES.md` and `docs/`. |
| Ledgers | Builders report their `file > describe > test` references in the task note's compare section; the lead swaps `Review:` lines for `Test:` lines in `docs/internals/{traps-ledger,acceptance-map}.md` when the slice lands (builders never edit these files in parallel). |
| Commits | Format from `AGENTS.md`: `platewise(<task ids>): <user-visible effect>`, then a body with what and why, `Reference: <what was matched, behaviour only>`, `Task note: <path>`, `Verified: <exact counts from runs on this head>`. One slice per commit; the lead lands them. Never claim a test passed that you did not run. PRs, tags and releases only when the user asks. |

## 3. Run until green (shared loop)

```bash
cd platewise
pnpm install --frozen-lockfile
pnpm lint && pnpm fmt:check && pnpm typecheck && pnpm test   # fix and re-run until all pass
pnpm build && pnpm e2e                                        # browser tests, mobile viewport
PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref # similarity, banned, assets, licences, traps, acceptance
```

Each phase file adds its own commands inside the same loop. On any failure, fix the cause and run the
whole loop again from `pnpm install`. Never skip a test, widen an allow-list without a written reason,
or edit a recorded fixture to make a test pass. A similarity finding means "not yet our own writing":
follow `01-clean-room-protocol.md` §6 (rewrite from the note, never rename to pass).

## 4. The per-task loop (short form)

1. **Read** the research spec section, then the reference files the task lists (only the named parts),
   then the reference tests it names.
2. **Note** `docs/notes/P<nn>/<slug>.md` from `docs/notes/_template.md`, in our own words, before code.
3. **Rewrite** with the reference closed: our names, our structure, tests next to code.
4. **Compare**: reopen the reference, walk it branch by branch, close each gap our own way, tick the
   note's checklist with the test that covers each case.
5. **Check**: the loop above, plus the phase's additions.
