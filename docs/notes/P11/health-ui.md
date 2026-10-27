# Task: Health UI (P11-04) · Phase: 11 · Owner: builder (wt-p11s2, slice S2)

Read (reference @ `10e14b67`): `A/ui/home/HomeScreen.kt` (where the steps line and the burn line sit
under the energy readout, and what they say: an energy burned figure with a deficit, surplus or
balance), `A/ui/settings/SettingsScreen.kt` (the health section: a switch that asks for access,
what happens when Health Connect is missing or needs an update, the help shown when nothing was
granted, the link to manage access) — layout ideas only. Research spec `05-home-progress.md`
§3.2.2 (burn and steps lines under the dome, later phase), §3.5.1 (Steps metric, later phase);
`01-profile-goals.md` §3.10 (Energy Burn stays out). Phase file P11 (Goal, budget rule, P11-04 row).

What it does (own words): on the Android app, Settings lists a Health Connect page. It says whether
Health Connect is on the phone and whether Platewise is connected, offers Connect (or Grant access
again when the access was taken away), lists which kinds of data are allowed, holds the three
switches (count active calories in the target, import weigh-ins, write meals and weigh-ins back),
opens Health Connect's own settings, and shows when the last sync was with a Sync now button. Home
shows an Activity card for the day on show: steps, active calories and the day's workouts, or a
line saying Health Connect has nothing for that day. While counting is on, the day's calorie target
on the gauge (and in the day's nutrient sheet) is the goal plus that day's active calories, and a
line under the gauge reads "<goal> goal + <N> burned"; the stored goal never changes. Progress shows
steps and active calories for the last 7 or 30 days as bar charts with their averages. None of this
shows on the web, where there is no Health Connect.

Inputs → outputs:
- `HealthPage` (Settings, `#/settings/health-connect`): the service's status (subscribed) and the
  four health settings → status card, data card, switches card, sync card.
- `burn.ts` (Home): `countedBurn(goalKcal, day)` → whole kcal to add, or null; `withBurn(targets,
  burn)` → targets with the energy target raised.
- `DaySummary` gains an optional `burn` (`{goalKcal, burnedKcal}`) → the budget line under the gauge.
- `ActivityCard` (Home, fetched on first draw): the day's activity row and the energy unit → steps,
  active calories, workouts, or the empty line.
- `ActivityHistoryCard` (Progress, fetched on first draw): today and the energy unit → a 7 / 30 day
  choice, a steps chart and an active-calories chart with averages, or an empty line.
- Registry: one record `health-connect`, listed only when `isHealthAvailable()`.

Files: created `src/features/settings/health/{HealthPage.tsx,health.module.css}`,
`src/features/home/{ActivityCard.tsx,activity.module.css,burn.ts}`,
`src/features/progress/ActivityHistoryCard.tsx`, `src/i18n/en/health.ts`, tests next to each.
Changed (shared, only the lines needed): `src/features/settings/registry.ts` (+ its test: the
record and its slot in the hub order), `src/features/home/HomePage.tsx` and `DaySummary.tsx`,
`src/features/progress/ProgressPage.tsx`, `src/i18n/en.ts` (one partition line).

Edge cases / failure modes:
- Web: the page is not registered (its address goes to the hub), Home and Progress draw no health
  card and the gauge uses the goal alone — the e2e suites run unchanged.
- No health service (a test without one, or the service failed to load): as on the web.
- Not connected: no Home or Progress card, no counted burn.
- The day on show has no row, or a row with nothing in it: "No Health Connect data for this day"
  and the target stays the goal.
- The activity copy cannot be read: Home still draws the day with its goal, and the card says
  there is no data (a sync or read failure never keeps the diary away).
- Active calories null, 0 or negative: nothing counted. Fractions are rounded to whole kcal.
- No energy goal (no readable profile, or goal 0): nothing is added, no budget line.
- kJ: steps stay counts; energy figures (card, line, chart) in kJ through the existing formatting.
- Health Connect missing / needs an update / unsupported: the status says so; no Connect.
- Access refused at Connect: a short note, the switch-like state stays "Not connected".
- Access revoked: "Access was removed" with Grant access; the data list shows each kind's state.
- Write-back turned on but write access refused: the switch stays off and a toast says why.
- A sync that fails: "The last sync didn't finish" under the sync row; nothing else changes.
- A setting that cannot be saved: a toast, the switch keeps the stored value.
- Workouts: title if Health Connect has one, else a few common types by name, else "Workout"; the
  minutes and, when known, the energy.

Our design differences / decisions:
- Words and layout are ours. The reference's burn line states burned energy and a deficit or
  surplus; ours states the budget arithmetic the phase asks for ("goal + N burned") because P11
  counts the burn in the target (D-16.89, budget rule).
- The Home card sits between the gauge card and the diary; it is its own chunk.
- The Progress card has its own 7 / 30 day choice instead of following the range bar: Health
  Connect data is kept for 30 days only.
- The page's id is `health-connect` (the hub test keeps `health` out of v1's categories); it sits
  after Tracking & reminders in the hub order. Its icon is the heart (no new icon in the set).

Tests we will write:
- `HealthPage.test.tsx` (fake plugin, real service and repositories): each availability status;
  Connect grants and syncs; refused Connect; revoked shows Grant access and grants again; the data
  list; the three switches store their settings and write-back asks for write access; Open Health
  Connect; last sync and Sync now; a failed sync shows its note.
- `registry.test.ts`: the page is registered only when Health Connect is available.
- `burn.test.ts`: counted burn rules.
- `DaySummary.test.tsx`: the budget line in kcal and kJ, none without a burn.
- `ActivityCard.test.tsx`: steps, active calories, workouts, the empty line, kJ.
- `HomePage.test.tsx`: with a health service and a synced day the gauge shows goal + burn and the
  line; counting off or not connected → the goal; no health service → no card (web).
- `ActivityHistoryCard.test.tsx`: 7 and 30 days, averages, empty, kJ.
- `ProgressPage.test.tsx`: the card shows only with a connected health service.

Decisions for the lead:
- The page and cards show figures from Health Connect as they come (rounded for display); no extra
  smoothing or caps.
- The phase's "the pillars" use the same raised energy target (the gauge and the day's nutrient
  sheet); macro targets are not changed by a burn.

Compare checklist (filled after the rewrite; reopened `A/ui/home/HomeScreen.kt` (the burn line
and the steps line, re-read on resume) and `A/ui/settings/SettingsScreen.kt` (the health section:
availability messages, partial grants, the help when nothing is granted, manage access)):
- [x] the page is offered only in the Android app, after Tracking & reminders (`registry.test.ts >
      pages a copy of the app does not offer (P11-04) > offers Health Connect on the web never, and
      in the Android app after Tracking (ACC-M11-1)`)
- [x] Health Connect missing, needing an update or unsupported says so, with nothing to press
      (`HealthPage.test.tsx > HealthPage (P11-04) > says when Health Connect is %s, with nothing to
      connect`)
- [x] any read granted connects; nothing granted keeps it off with a note (`HealthPage.test.tsx >
      HealthPage (P11-04) > connects on Connect, then shows what is allowed, the switches and the
      last sync (ACC-M11-1)`, `> says no access was given when Connect allows nothing, and stays
      not connected`)
- [x] access removed shows as such, with a way to grant again (`HealthPage.test.tsx > HealthPage
      (P11-04) > shows access removed in Health Connect with Grant access, and reads again once it
      is back`), and each kind's state (`> marks each kind that is not allowed`)
- [x] manage access opens Health Connect (`HealthPage.test.tsx > HealthPage (P11-04) > opens
      Health Connect`)
- [x] the three switches, write-back asking for write access (`HealthPage.test.tsx > HealthPage
      (P11-04) > stores the counting and import switches`, `> asks for write access when
      write-back is turned on, and says when it is refused`)
- [x] last sync, Sync now and a failed sync (`HealthPage.test.tsx > HealthPage (P11-04) > syncs on
      Sync now, and says when the last sync didn't finish`); Disconnect (`> stops reading after
      Disconnect, and offers Connect again`)
- [x] Home: target = goal + active calories with the line, goal unchanged; counting off → goal;
      a day without data says so; an unreadable copy never blocks the day (`HomePage.test.tsx >
      HomePage: Health Connect on the Android app (P11-04) > counts the day's active calories in
      the gauge, says goal + burned, and shows the activity card (ACC-M11-2)`, `> keeps the goal
      and shows no line while counting is off; the card stays`, `> says a day without Health
      Connect data has none, and keeps its goal`, `> draws the day and its goal when Health
      Connect's copy cannot be read`;
      `burn.test.ts > countedBurn > adds the day's active calories, rounded to whole kcal`)
- [x] the line in kJ (`DaySummary.test.tsx > DaySummary counted burn (P11-04) > writes both amounts
      in kJ for a kJ user`); the card's steps, energy and workouts (`ActivityCard.test.tsx >
      ActivityCard (P11-04) > lists the workouts with their length and energy`)
- [x] nothing on the web (`HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04)
      > shows no health feature without a health service, as on the web (D-16.89)`;
      `ProgressPage.test.tsx > ProgressPage: Health Connect on the Android app (P11-04) > shows no
      activity card without a health service, as on the web (D-16.89)`; the e2e suites unchanged)
- [x] Progress: steps and active calories for 7 and 30 days (`ActivityHistoryCard.test.tsx >
      ActivityHistoryCard (P11-04) > shows the last 7 days of steps and active calories, each with
      the mean of its days (ACC-M11-3)`, `> covers 30 days once chosen`)
- Deliberate differences: the reference's line states the burned energy and a deficit or surplus
  without changing the goal (R07.1); ours counts the burn in the target, as the phase decides, and
  says "goal + N burned". The reference's steps line sits under the gauge; ours is in the activity
  card with the active calories and the workouts. Health Connect has its own Settings page here,
  not a section of a longer page.
- Not taken: the reference's nightly summary with burn, its workouts diary and imported-workout
  history, Energy Burn's anchor for Adaptive Goals (later item).

## Status

Done (2026-10-27). P11-04 finished: Settings › Health Connect (Android only), Home's activity card
and counted burn line, Progress's 7 / 30 day activity card, the `health` catalogue partition.
Lines changed outside the task's own files: `src/features/settings/registry.ts` (+ test: an
`offered` field, the page, its hub slot), `src/features/home/HomePage.tsx`, `DaySummary.tsx`,
`home.module.css` (one class), `src/features/progress/ProgressPage.tsx`, `src/i18n/en.ts` (one
partition line). Handed on to S3 (P11-05): user docs for the page, the M11 acceptance rows.
