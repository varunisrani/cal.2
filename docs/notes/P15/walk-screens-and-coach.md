# Task: walk screens, the burn rule and the Coach's walk_log (P15-03) · Phase: 15 · Owner: builder (wt-p15s2, slice S2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist" BEFORE
writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): the reference has no walk recorder screen, route line or walk
score. Nearest, read for behaviour only: `android/.../ui/home/OutdoorActivityDurationSheet.kt` (a
sheet that logs a walk by minutes and effort) and `android/.../ui/coach/CoachViewModel.kt` (which
workout data its Coach reads). Ours: the P15 phase file (Goal, D-16.96, the walk score, the burn
rule); `src/features/home/{HomePage,ActivityCard,burn,distance,energy}.tsx/ts`,
`src/features/progress/{ProgressPage,ActivityHistoryCard}.tsx`, `src/features/log/AddMenu.tsx`,
`src/features/settings/health/HealthPage.tsx`, `src/app/{router,App,Screen,TabBar}.ts(x)`,
`src/services/coach/{toolSchemas,tools,snapshot,engine,context}.ts`, `src/ai/prompts/coach.ts`,
`src/ui/{Gauge,Dialog,Card,Button,Sheet}.tsx`, the orange tokens in `src/ui/tokens.css`, D-16.91 (kg
only). No REA evidence for this task.

What it does (own words): in the Android app a person can start a walk from Home's activity card or
the + menu. The Walk screen (`#/walk`) has Start; the first time it explains why location, physical
activity and notifications are asked (and what the walk shows without each) before Android asks.
While walking it shows the time large, then distance, pace, steps, cadence and active calories, and
the route as a line on a plain background with a start mark and a "you are here" mark; Pause/Resume
and Stop (Stop asks first; Keep walking is the other answer). After Stop the summary shows the walk
score as a big number with its parts and what each means, the walk's figures and route, the week's
moderate minutes as a ring (x of 150), heart-rate zones when Health Connect had heart rate for the
walk, how this walk compares with the person's recent walks, and Save (the default: leaving also
keeps it) or Discard. Progress gets a Walks card: the week ring and the list of walks (date, time,
distance, score), each opening its summary in a sheet. Without Health Connect connected, the day's
recorded walks' active calories count in "goal + burned" while "Count active calories" is on; with
it connected the day's burn stays Health Connect's (our walks are written there, and its totals
merge every app). The Coach gets `walk_log` where the app records walks, a prompt block on what the
score means, and, without Health Connect, today's walks in its facts, counted in today's target the
way Home counts them. The web shows none of it and fetches none of it.

Inputs → outputs:
- Router: a `walk` route (`#/walk`) pushed over the screen it was opened from; Back returns there;
  no tab bar on it. On the web (no walk service) the route goes Home.
- `src/features/walk/WalkScreen.tsx` (lazy): the phases of the walk service (idle, asking,
  starting, active, stopping, finished, failed); `LiveWalk.tsx`; `WalkSummary.tsx` (shared with
  Progress); `RouteLine.tsx` (SVG from `routeShape`); `WeekRing.tsx` (a progress bar for assistive
  tech, "x of 150"); `WalksCard.tsx` (Progress, lazy); `text.ts` (clock time, pace per km or per
  mile, distance in km or miles by `units.height` as Home's distance does, speeds, energy in the
  person's unit); `useWeekMinutes.ts` (the week's walks and Health Connect sessions from the
  person's week start).
- Home: the activity card shows on Android when Health Connect is connected (as before) or when the
  walk service exists; it lists the day's walks and has Walk (Back to your walk while one runs). The
  + menu: a Walk row under the trackers (Android only).
- `burn.ts`: `countedBurn` (Health Connect's day, unchanged), `walkBurn(goalKcal, walks)` (the
  day's walks' active kcal, whole, null at 0) and `burnSource(healthConnected, recordsWalks)`.
  HomePage tells the two cases apart only by "Health Connect service present and `health.connected`
  on" → Health Connect's day; else, where the walk service exists → the day's walks; both only
  while `health.countActiveCalories` is on (default on). Never both. Settings › Health Connect
  shows that switch also before connecting where the app records walks (shared file).
- Coach: `walk_log` (from, to; at most 90 days, the last 7 by default, the newest kept): per walk the
  date, start, minutes, km, steps, brisk minutes, score and active kcal, a figure not measured left
  out; offered when the snapshot holds walks (the walk repository exists: Android). The prompt adds
  a WALKS block (what the score and its parts mean, brisk minutes count toward 150 a week, never add
  walks a second time). `countedWalkKcal` and a "Walks today" facts section without Health Connect.

Files: created `src/features/walk/*` and tests, `src/i18n/en/walk.ts` (a new partition: one line in
`src/i18n/en.ts`, shared); changed `src/app/{router,App}.ts(x)` (shared: the route),
`src/features/home/{HomePage,ActivityCard,burn}.tsx/ts`, `activity.module.css` and tests,
`src/features/progress/ProgressPage.tsx`, `src/features/log/AddMenu.tsx`,
`src/features/settings/health/HealthPage.tsx` (shared, the switch), `src/ui/icons/index.tsx`
(shared: a `walk` icon), `src/services/coach/{toolSchemas,tools,snapshot,engine,context}.ts`,
`src/ai/prompts/coach.ts`, `src/i18n/en/{menu,health}.ts`.

Edge cases / failure modes:
- A walk running when the person leaves the screen: it goes on (the native service); Home's card
  and the + menu say Back to your walk.
- Stop pressed by mistake: the confirm dialog's Keep walking keeps it going.
- The summary left with Back: the walk is already stored (Save is the default) and is saved on
  leaving; Discard (after asking) removes it.
- A walk with no score (no sensors): the summary says why instead of a number.
- No earlier walks: no comparison ("your first walk"), and the pace part says there is nothing to
  compare yet.
- No heart rate from Health Connect: no zones section.
- A day with walks while Health Connect is connected: the card lists the walks, but the target
  counts only Health Connect's burn (no double counting).
- kJ readers: every energy in their unit; miles for a person who reads feet and inches; weight kg.

Our design differences / decisions:
- `#/walk` is a route of its own kind, not a tab page (no tab bar, like onboarding).
- The "Count active calories" switch is shared by Health Connect's burn and the walks' burn: one
  switch, the rule above says which source counts.
- The route is a line on a plain well, no map tiles (D-16.96).
- The reference's manual walk sheet is not taken: walks are recorded, not typed.

Tests we will write:
- `src/features/walk/*.test.tsx`: the Walk screen through every phase with the fake tracker (the
  permission explanation, live figures and route, pause/resume, stop with confirm, summary, Save,
  Discard, Back); the summary of stored walks (parts and their meaning, kJ and miles, the ring,
  zones, the comparison or "first walk", no score); Progress › Walks (list, sheet, empty); text
  helpers.
- `src/features/home/burn.test.ts` (both sources), `ActivityCard.test.tsx`, `HomePage.test.tsx`
  (walks counted without Health Connect, not with it; nothing with counting off),
  `AddMenu.test.tsx` (the Walk row), `src/app/router.test.ts` and `App.test.tsx` (the walk route),
  `HealthPage.test.tsx` (the switch before connecting).
- `src/services/coach/{toolSchemas,tools,engine,snapshot,context}.test.ts` and
  `src/ai/prompts/coach.test.ts` (`walk_log`, the prompt block, the facts).

## Compare checklist (filled after the rewrite; reopened `OutdoorActivityDurationSheet.kt`, `CoachViewModel.kt`):

- [x] `#/walk` is its own route, pushed over the screen it was opened from, Back returns, no tab
      bar; on the web it goes Home and nothing is fetched (tested in `src/app/router.test.ts` > the
      walk route (P15-03), `src/app/App.test.tsx` > goes Home from #/walk …, draws the walk screen
      without the tab bar …).
- [x] The Walk screen: the permission explanation, live figures and route, pause/resume, Stop with
      Keep walking, the summary, Save, Discard, Back keeps the walk (tested in
      `src/features/walk/WalkScreen.test.tsx`).
- [x] The summary: score and parts with their meaning (by steps or by speed, km or mi), figures in
      kcal or kJ, the week ring, zones only with heart rate, the comparison or "first walk", no
      score without sensors (tested in `src/features/walk/WalkSummary.test.tsx`).
- [x] Progress › Walks: the list with date, time, distance and score, newest first, each opening
      its summary in a sheet; the ring; empty state (tested in `WalkSummary.test.tsx` > Progress ›
      Walks (P15-03)).
- [x] Home: the card lists the day's walks and has Walk / Back to your walk; without Health Connect
      the walks' active calories count in goal + burned; with it, Health Connect's burn alone;
      nothing while counting is off (tested in `src/features/home/HomePage.test.tsx` > HomePage:
      walks on the Android app (P15-03), `ActivityCard.test.tsx` > ActivityCard: walks (P15-03),
      `burn.test.ts` > walkBurn, burnSource).
- [x] The + menu's Walk row (tested in `src/features/log/AddMenu.test.tsx` > AddMenu: the walk
      recorder (P15-03)).
- [x] Settings › Health Connect offers Count active calories for walks before connecting (tested
      in `HealthPage.test.tsx` > HealthPage: walks (P15-03)).
- [x] Coach: `walk_log` with its range and cap, rows, offered only with walks, the WALKS prompt block
      (tested in `src/services/coach/tools.test.ts` > runCoachTool: walk_log, `toolSchemas.test.ts`
      > WALK_TOOL, `engine.test.ts` > runTurn: recorded walks, `snapshot.test.ts` > takeSnapshot:
      recorded walks, `src/ai/prompts/coach.test.ts` > coachSystemPrompt: walks).
- Deliberate differences: the reference has a sheet to log a walk by minutes and effort and a Coach
  that reads its workout history; Platewise has no manual walk sheet (walks are recorded), and the
  Coach reads recorded walks through `walk_log` (our own name and description).
- Not taken: the reference's chips, copy, workout and training tools.

## Status

Done (2026-10-28). Lines outside the task's own files (shared): `src/app/{router,App}.ts(x)` (the
route), `src/ui/icons/index.tsx` (the `walk` icon), `src/i18n/en.ts` (the `walk` partition),
`src/features/settings/health/HealthPage.tsx` (the switch before connecting). The Coach's facts
block lists today's walks without Health Connect and counts them in today's target the way Home
does (`countedWalkKcal`, tested in `src/services/coach/context.test.ts` > coachContext: recorded
walks without Health Connect). Follow-up: the minute-by-minute splits are stored but not drawn.
