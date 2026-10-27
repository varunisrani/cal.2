# Task: P11 polish (no task id) · Phase: 11 · Owner: builder (wt-p11s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The three items finish our own build: our Progress card, our
onboarding step inside the Android WebView, and our write-back pass. The one reference question
they touch (which setting picks km or miles: the height unit) was read and compared for Home in
`follow-ups.md`; Progress reuses that rule as it stands. Also read: phase file P11 (Decisions:
total burn and distance are shown, never added; the plugin refuses a write dated after its now),
`docs/notes/P11/follow-ups.md`, `health-service.md`, `health-ui.md`, `src/services/health/**`,
`src/features/progress/ActivityHistoryCard.tsx`, `src/features/home/ActivityCard.tsx`,
`src/features/onboarding/steps/Reminders.tsx`, the reminder engine's timer port
(`src/services/reminders/{engine,ports}.ts`).

What it does (own words):
1. Progress's activity card, under steps and active calories, also shows the period's total
   calories burned and its distance: each as a row like the two above (a heading, "Avg …" over
   the days that have a value above 0, a bar per such day), and each only when the 7 or 30 days
   shown have any. Energy is in the person's unit (kcal or kJ); distance in km beside centimetres
   and miles beside feet and inches, to one decimal, written as Home writes it. The "nothing for
   these days" line shows only when none of the four has a day.
2. Inside the Android app the page has no notifications, so onboarding's reminders step no longer
   offers "Turn on reminders" there: the title and explanation stay, the line under them says
   reminders are not available in the Android app yet, and Continue moves on with reminders off.
   The web (any browser, with or without notifications) keeps the button as before.
3. Write-back holds back a record dated after now (follow-ups 1). Until now it went at the next
   pass someone else started (start, return to the front, a change, a sync), so an entry logged
   for dinner while the app stayed open went only on the next trigger. Now a pass that held
   something back sets one timer for just after the first held-back time (that time plus one
   second, measured on the service's clock), and the timer runs one more pass. Every pass clears
   the timer first and sets it again only if it still holds something back; `stop` clears it.
   There is never more than one.

Inputs → outputs:
- `ActivityHistoryCard({today})` reads `units.energy` and `units.height` → two more rows
  (`progress.activity.total`, `progress.activity.distance`).
- `src/features/home/distance.ts` (new, pure): `distanceUnitOf(lengthUnit)`, `distanceIn(metres,
  unit)`, `distanceAmount(amount)`, `distanceText(amount, unit)` → used by Home's card and Progress's
  card, so Progress does not fetch Home's card (and its styles) to write a distance.
- `Reminders` (onboarding): `isHealthAvailable()` and no `Notification` on the page → no button,
  the Android line.
- `writeBackPlan(...)` → also `heldBackUntil`: the earliest time of a record held back for being
  after `now` and not yet sent as it is; null when nothing waits.
- `createHealthService({..., timers?})` (`Timers` from the reminder engine: `setTimeout` and
  `clearTimeout`; the page's own when left out, so the app's wiring and the screen tests that
  build a service are unchanged) → at most one timer. `HELD_BACK_MARGIN_MS` (1 s) is exported for
  the tests.

Files: `src/features/progress/ActivityHistoryCard.tsx` (+ test), `src/features/home/distance.ts`
(new), `src/features/home/ActivityCard.tsx` (uses it; + its test's import),
`src/features/onboarding/steps/Reminders.tsx` (+ test), `src/services/health/{records,service}.ts`
(+ tests), `src/i18n/en/health.ts` (four Progress words).

Edge cases / failure modes:
- Progress: a period with only total burn (or only distance) is not "empty"; a day with 0 has no
  bar and is not in the mean (as steps and active calories); kJ users read kJ; the mean of a
  distance keeps its decimal (the mean is rounded only when written).
- Distance axis ticks can be fractions (0.5 km steps): written with up to one decimal, not as
  whole numbers.
- Reminders: in the app with a `Notification` API (a later WebView), the button stays and the old
  answer-driven Android line still applies; on the web nothing changes, with or without the API.
- Timer: a record exactly at now is sent (not held back), so it sets no timer; a held-back record
  already in the ledger unchanged (the clock went back) is not "held back" and sets none.
- Timer while write-back is off or the service is disconnected: the pass returns early, after
  clearing; nothing is set.
- A pass that fails after planning keeps the timer it set: the pass at that time also retries.
- A timer that fires during a running pass joins it as "one more pass" (the send loop).
- The timer is set only between `start` and `stop`, so a pass still running when `stop` is called
  cannot leave one behind.
- The delay never goes below 0; held-back records are at most today (the window ends today), so
  it stays well under the browser's longest timeout.

Our design differences / decisions:
- The timer reuses the reminder engine's `Timers` port, so tests drive it with Vitest's fake timers
  like the reminders tests. Its default is a small copy of the page's timers in `service.ts`, not
  the reminders' `browserTimers`: importing `reminders/ports` from the health chunk split the
  database library into a chunk of its own (+0.8 kB of initial JS, seen in `check:bundle`).
- One second after the record's time, because the plugin compares with the phone's own clock and
  a timer can fire a moment early.
- Progress's rows reuse the card's own row component (heading, mean, bars) for both new figures,
  so the card stays one pattern; the distance bars are in the person's unit so the axis steps
  are round in that unit.
- Onboarding probes `Notification` the same way its route already asks (`typeof Notification`).
  No new string: the step reuses `onboarding.reminders.unsupportedAndroid`.

Tests we will write:
- `ActivityHistoryCard.test.tsx`: total and distance rows with their means and bars (km beside
  cm), miles beside ft/in, kJ total, rows absent when the period has none, a period with only a
  total or only a distance is not empty.
- `Reminders.test.tsx`: in the app without notifications, no button, the explanation and the
  Android line, Continue moves on with reminders off; in the app with notifications the button
  stays; on the web without notifications the button stays (unchanged).
- `records.test.ts`: `heldBackUntil` is the first held-back time, null when nothing waits or the
  held-back record is already sent as it is.
- `service.test.ts` (fake timers, the service's movable clock): an entry for later today goes at
  its time plus a second with no other trigger; the timer is cleared by the next pass and by
  `stop`; at most one timer, at the earliest held-back time; nothing is set while write-back is
  off.

Compare checklist (filled after the rewrite; no reference reopened: see Read):
- [x] Progress shows the period's total burn and distance under steps and active calories, each
      with the mean of its days, only when it has any, kJ and km / mi
      (`ActivityHistoryCard.test.tsx > ActivityHistoryCard (P11-04) > adds the period's total burn
      and distance, each with the mean of its days, in km beside cm (ACC-M11-3)`, `> writes the
      distance in miles for a person who reads feet and inches`, `> writes the total burn in kJ for
      a kJ user`, `> leaves out the total burn and the distance when the days shown have none`,
      `> shows days that have only a total burn, not the empty line`, `> shows days that have only
      a distance, not the empty line`)
- [x] in the Android app without notifications the step has no button, keeps its explanation,
      says why and moves on; with notifications it keeps the button; the web is unchanged
      (`Reminders.test.tsx > Reminders > says reminders are not available in the Android app,
      where the home screen cannot help (P11)`, `> keeps the button in the Android app where the
      page has notifications, and says so if they fail`, `> keeps the button on the web, also where
      the browser has no notifications (ACC-M11-9)`)
- [x] the plan names the first held-back time; none for a record at now, one already sent as it
      is, or an imported weigh-in (`records.test.ts > writeBackPlan > says when the first held-back
      record can go, and nothing when none waits`)
- [x] the timer sends a held-back entry a second after its time with nothing else happening; one
      at most, for the earliest record, cleared by each pass and by stop; a failed pass is retried
      then; none while write-back is off or before start (`service.test.ts > the pass for a
      held-back record (ACC-M11-5) > sends an entry logged for later today a second after its time,
      with nothing else happening`, `> keeps one timer at most, for the earliest record, cleared by
      each pass and by stop`, `> retries a failed pass at the held-back time`, `> sets no timer
      while write-back is off, or before the service starts`)
- Deliberate differences: none against the reference (nothing of it is involved). Progress writes
  the distance's mean and bars with one decimal, as Home does; its axis with up to one.
- Not taken: a timer for a record more than a day ahead (the window ends today, so none is);
  probing notifications through the notifier (the onboarding route already probes the global).

## Status

Done (2026-10-27). The three items are finished. Outside the named components and service files:
`src/features/home/distance.ts` (new, the distance helpers moved out of `ActivityCard.tsx` so
Progress does not fetch Home's card) and `ActivityCard.test.tsx` (its import of `distanceUnitOf`).
Handed on to the lead: the user page (Progress's total and distance; no reminders button in the
Android app) and the CHANGELOG; acceptance rows for the new tests if wanted (ACC-M11-3, -5, -9).
