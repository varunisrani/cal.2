# Task: lazy-loading groundwork (lead infrastructure for P10-08) · Phase: 10 · Owner: builder (wt-lazy)

Read (reference @ `10e14b67`): none. This is our own build plumbing (the bundle budget of
04-architecture §6 and P10-08), with no counterpart in the reference to read. Read instead:
`docs/plan/phases/P10-hardening-and-release.md` (P10-08), `scripts/bundle-budget.ts` (the check:
the entry chunk and its static imports are counted, dynamic-import chunks are listed apart and
never counted), `docs/HANDOFF.md` ("Next after these land").

What it does (own words): the start-up download is the entry chunk plus everything it imports
statically, and it has to stay within 250 kB of gzip while P06, P07 (charts), P08 (Coach,
Markdown) and P09 still land. Before this slice everything was in one chunk (206.57 kB). This
slice moves what is not needed to draw the first screen behind dynamic imports, so each piece is
fetched the first time it is used:
- the tab screens other than Home (Progress, Coach, Settings) through `React.lazy`, with the
  start-up skeleton as the Suspense fallback while a screen's chunk loads; Home stays eager as
  the first screen;
- each Settings category page (Personal info, Goals, Methods) through `React.lazy` in the
  registry: the records, their order and their routes stay, only `page` is fetched on first
  open; the back link and the title show at once, the skeleton stands in for the page;
- the analysis overlay and the review sheet: the shell renders nothing for them until an
  analysis starts (overlay) or a draft waits (review), then fetches the component. The tab bar
  still hides the moment an analysis starts, because the analysis service raises the app-state
  flag itself, not the overlay;
- the AI layer: the services that ask a model (`analysis`, `goals/planRequest` for the rebuild
  and the tune-up, `goals/rebuild` for nutrient goals, `goals/planBuilder`) import
  `src/ai/tasks/*` with `import()` at the moment they send, so the tasks and what they pull in
  (client, adapters, prompts, parsers, image preparation, retry ladder) leave the start-up
  chunk. Their public types and behaviour stay the same.

What stays at start (and why): React and React DOM, Dexie and the repositories (the boot gate
reads the profile and settings first), the shell (router, boot, tab bar, theme, toasts, error
boundary), Home with its sheets (manual, capture, describe; AddMenu and HomePage belong to other
builders now), onboarding (the first screen of a new person; it shows the Methods page in a
sheet, so `MethodsPage` stays at start too), the goal-reached dialog, the services and the light
AI modules the data and setup layers read (`ai/settings`, `ai/catalog/*`, `ai/endpoint`,
`ai/errors`, `ai/deadline`, `ai/transport`; `src/data/settingsSchema.ts` and the setup forms
import them, and `src/data/**` is out of this slice).

Inputs → outputs: the same app; `pnpm build && pnpm check:bundle` → a smaller counted total and
a list of lazy chunks.

Files: changed `src/app/Screen.tsx`, `src/app/App.tsx`, `src/features/settings/registry.ts`,
`src/features/settings/CategoryFrame.tsx`, `src/services/analysis.ts`,
`src/services/goals/{planRequest,rebuild,planBuilder}.ts` (`tuneUp.ts` sends through
`planRequest`, so it needs no change); created `src/app/onDemand.ts` (a typed `React.lazy` over a
named export) with `src/app/onDemand.test.tsx`, `src/app/Skeleton.tsx` (the skeleton blocks,
shared by the boot gate and the lazy fallbacks) and `src/test/lazy.ts` (`untilLoaded`, see
below); shared: `src/app/Boot.tsx` (draws the shared skeleton instead of its own copy),
`src/app/shell.module.css` (a class for the in-content skeleton, which must not repeat the page
padding). Tests changed only to wait for a lazy module: `src/app/App.test.tsx`,
`src/features/settings/goals/GoalsPage.test.tsx`, `src/features/settings/profile/ProfilePage.test.tsx`,
`src/features/about/MethodsPage.test.tsx`, `src/features/log/AnalysisOverlay.test.tsx`,
`src/features/onboarding/steps/BuildingPlan.test.tsx`, `src/services/analysis.test.ts`,
`src/services/goals/planBuilder.test.ts`.

Edge cases / failure modes:
- A chunk that fails to load in a lazy component throws inside React: the app's ErrorBoundary
  shows the crash card with Reload (it already catches any render error).
- A chunk that fails to load inside a service: the analysis turns it into its generic failure
  (Retry, Cancel), as it does for any unexpected error; the plan builder falls back to the
  formula plan (it never rejects); the rebuild and the tune-up reject, as they do for any
  unexpected error, and their callers already handle a rejection.
- Cancel while the AI chunk is still loading: the attempt is already retired; when the import
  settles the run sees it ended and cleans up, as after any other await.
- The analysis loads the tasks before it starts the deadline, so a slow chunk does not eat the
  person's AI time limit; Building plan's 60 s cap covers everything, chunk included (it is a cap
  on the wait, D-16.14).
- Building plan with no AI set up returns the formula plan without loading the AI chunk at all.
- Switching to a tab whose chunk has not loaded shows the skeleton in the content area; the tab
  bar stays.
- A second open of the same screen or service call reuses the loaded module (no second fetch).

Our design differences / decisions:
- Fallback for the overlay and the review sheet is nothing (not the skeleton): they are layers
  over a screen that is already drawn, and the tab bar has already hidden. The modal layer
  appears once its chunk is in (a few milliseconds from the local cache).
- No chunk rule in `vite.config.ts`: Rolldown's default splitting gives one chunk per dynamic
  import target and puts shared modules where they are needed; nothing needed forcing.
- No prefetching yet: every chunk loads on first use. A later slice can warm the overlay and AI
  chunks when the add menu opens (AddMenu and HomePage are other builders' files now).

Tests we will write:
- No new behaviour: the existing unit tests and both e2e specs must pass with the same meaning,
  adding only a wait (`findBy…`, `untilLoaded`, a warm-up import) where a first render or call
  now fetches a module.
- `src/app/onDemand.test.tsx`: nothing is fetched before the first draw, the fallback shows
  meanwhile, then the component; a chunk that cannot be fetched shows the crash card with Reload.
- `pnpm check:bundle` shows the drop and lists the new chunks.

Why tests need a wait: a lazy piece suspends on its first draw and React draws it when the module
is in, but while a test waits inside `act` (as `until` in `src/test/screenHarness.tsx` does) React
holds that draw back until the wait ends, so such a wait never ends. `untilLoaded` waits with
Testing Library's `waitFor`, outside `act`. Tests on fake time load the module in a `beforeAll`
first, so fake time measures the request alone (a first load is real I/O in Vitest).

Numbers (gzip, 1 kB = 1000 bytes, `pnpm build && pnpm check:bundle`):
- Before: initial JS **206.57 kB**, one chunk (`index`), no lazy chunks.
- After: initial JS **184.90 kB** (−21.67 kB, 65.10 kB of headroom), 13 files; 35.55 kB moved
  into 11 lazy chunks.

Start-up files (counted): `index` 124.60 (React DOM, the shell, Home and its sheets, onboarding
with the Methods page, the services and repositories, the light AI modules) · `Sheet` 34.35
(Dexie, the sheet, toast and field primitives, the live-data hooks) · `t` 13.95 (the message
catalogue and `t`) · `primitives.module` 3.49 (React) · `context` 2.80 (modal layer, button,
services context) · `numbers` 2.53, `editRules` 0.84, `body` 0.58, `ranges` 0.51, `catalogue`
0.42, `energy` 0.35, `Card` 0.35, `result` 0.13 (small domain and UI modules). Rolldown puts every
module that the start and a lazy chunk share into a common chunk of its own; all of them are
`modulepreload`ed by `index.html`. Gzipped as one file they would be 181.75 kB (3.15 kB less).

Lazy chunks (not counted): `ReviewSheet` 6.38 (review sheet, photo strip, serving card, amount
field, nutrition rows, more nutrition, amount expressions) · `json` 5.68 (the AI core both tasks
share: client, the three adapters and the request shape, image preparation, retry ladder, shared
prompt text, JSON extraction) · `planning` 5.04 (plan task, plan, evidence and nutrient-goal
prompts, plan check, their parsers) · `GoalsPage` 4.77 (Goals page, target rows and sheet,
nutrient goals editor) · `food` 4.68 (food tasks, food prompts and reply contract, food, parts
and unit parsers) · `ProfilePage` 4.40 (Personal info and its sheets) · `SettingsScreen` 1.62
(hub, frame, registry) · `ingredients` 1.38 (serving units, scaling, ingredients: shared by the
review sheet and the food task) · `AnalysisOverlay` 1.10 · `ProgressPage` 0.25 · `CoachPage`
0.25 (both placeholders today). The Methods page has no chunk: onboarding's Plan ready imports it,
so Settings › Methods opens with nothing new to fetch.

Checked in the built app (a throwaway Playwright script against `vite preview`, not kept): the
start fetches only the 13 files; Progress, Coach, Settings and each category page fetch their
chunk (and CSS) on first open; Describe → Analyse hides the tab bar at once and fetches
`AnalysisOverlay`, `food`, `json` and `ingredients`; the failure dialog shows; no page error.

Compare checklist (filled after the rewrite; no reference to reopen, compared with the behaviour
before the slice instead):
- [x] Home draws with no fallback once start-up is done (`src/app/App.test.tsx > App > shows the
      skeleton, then Home and the tab bar once the profile and settings are read`, unchanged and
      synchronous)
- [x] Another tab shows its screen once its chunk is in, under the goal-reached dialog
      (`App.test.tsx > App > shows the goal-reached dialog over a tab screen when a weigh-in
      reaches the goal`)
- [x] Nothing fetched before the first draw, the skeleton meanwhile, a failed fetch in the crash
      card with Reload (`src/app/onDemand.test.tsx > onDemand > fetches nothing until it is
      drawn, shows the fallback meanwhile, then the component`, `> falls into the crash card with
      Reload when its chunk cannot be fetched`)
- [x] Settings keeps its records, order and routes and opens each page
      (`src/features/settings/registry.test.ts > the registered categories > have distinct ids
      and titles, and routes the router reads back as themselves`, `SettingsHub.test.tsx`,
      `ProfilePage.test.tsx > ProfilePage > is the Personal info category at #/settings/profile,
      under the back link and its title`, `MethodsPage.test.tsx > MethodsPage > is registered as
      an About page in Settings at #/settings/methods`, every `GoalsPage.test.tsx` test, which
      opens the page through `SettingsScreen`)
- [x] The overlay once over a tab screen and never on onboarding; the review when a draft waits
      (`App.test.tsx > App > shows the analysis overlay once over a tab screen, and never on
      onboarding (P06-01)`, `> opens the review over the tab screen while the analysis has a
      draft waiting (P06-06)`); the tab bar hides through the service
      (`src/features/log/AnalysisOverlay.test.tsx > AnalysisOverlay > hides the tab bar during an
      analysis and brings it back afterwards (ACC-A5-1)`)
- [x] Analysis, rebuild, tune-up and plan builder behave as before (`src/services/analysis.test.ts`
      including `the time limit (fake timers)`, `src/services/goals/{rebuild,tuneUp,planBuilder}
      .test.ts`, `src/app/useTuneUp.test.ts`, `src/features/onboarding/steps/BuildingPlan.test.tsx
      > BuildingPlan with the real plan builder and Plan ready`)
- [x] Demo 1 and the smoke spec pass on the built app (`e2e/walking-skeleton.spec.ts`,
      `e2e/smoke.spec.ts`)
- Deliberate differences: none visible beyond the skeleton while a screen's chunk loads.
- Not taken: lazy logging sheets on Home (capture, describe, manual: HomePage is another
  builder's file now); lazy onboarding (it is the first screen of a new person).

## Decisions for the lead

- `src/app/onDemand.ts` is the one way to load a component on demand. Later Settings pages
  (P07-06, P09-01) register as `page: onDemand(() => import('./x/XPage').then((m) => m.XPage))`;
  the registry's header says so. A static import there would put the page back in the start-up
  download without any test failing; the bundle check is the guard.
- The skeleton is one component (`src/app/Skeleton.tsx`): the boot gate draws it as the page
  (`shell.skeleton`, unchanged), a tab screen loading draws it in the content area
  (`shell.screenLoading`), a Settings page loading draws it under the drawn title without its
  title bar (`settings.pageLoading`).
- The overlay and the review sheet have no fallback (nothing draws until their chunk is in); the
  tab bar does not wait for them.
- The analysis fetches the food tasks before its deadline starts; the plan builder fetches them
  inside its 60 s cap and only when an AI is set up; the rebuild and the tune-up fetch them when
  they send. A failed fetch is the analysis's generic failure (Retry), the builder's formula plan,
  and a rejection from the rebuild and the tune-up, as for any unexpected error.
- `ProfilePage.test.tsx`: `categoryFor(['profile'])` no longer matches `page: ProfilePage` (the
  page is now a lazy wrapper, which cannot equal the component). The same test goes on to open
  the category through `SettingsScreen` and wait for ProfilePage's own rows, which is now the
  check that the category draws that page.
- No chunk rule in `vite.config.ts` and no change to `scripts/bundle-budget.ts`: the check
  already counts the entry with all its static imports and lists the lazy chunks.

Follow-ups found, not done here:
- Start-up fragmentation: Rolldown's 12 small common chunks cost 3.15 kB of gzip and 12 extra
  (parallel, preloaded) requests. A `build.rolldownOptions.output.codeSplitting` group that keeps
  start-only shared modules in the entry could win that back; worth trying when headroom matters.
- Onboarding through `onDemand` (wizard, Plan ready, AI setup forms, and with them the Methods
  page): measured with a throwaway build (not kept), initial JS 184.90 → 168.35 kB, an
  `OnboardingRoute` chunk of 9.36 kB; a new person then waits for one more chunk on first load.
- Home's capture, describe and manual sheets on first open, once the P06 S3b/S4b slices have
  landed in `HomePage.tsx`.
- Warm the overlay and AI chunks when the add menu opens (AddMenu is another builder's file).
- Chrome keeps a failed dynamic import failed for the page's life, so Retry after a failed chunk
  fetch fails again until a reload; the generic failure text does not say to reload.

## Status

Done (2026-10-27). Initial JS 206.57 → 184.90 kB. Lines outside the task's files: `src/app/Boot.tsx`
(the shared skeleton), `src/app/shell.module.css` (one class), and the test waits listed under
Files.
