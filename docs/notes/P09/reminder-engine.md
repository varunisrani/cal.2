# Task: Reminder engine (P09-08) · Phase: 09 · Owner: builder (wt-p09s08, slice S2)

Read (reference @ `10e14b67`): `A/services/NotificationService.kt` (all: alarms per reminder, the
next-occurrence computation, the receiver that re-arms at now + 24 h and posts, the fasting goal
alarm and its boot re-arm, the summary text at fire time), `A/services/ReminderDispatchPolicy.kt`
and `A/services/DailySummaryPolicy.kt` (all); `I/Stores/NotificationManager.swift` lines 89–450
(meal and water repeating triggers, the fasting goal one-shot, the streak / summary / weight /
body-fat one-shots, the kcal and kJ summary bodies, the data-dependent re-schedule); tests
`T/services/{ReminderDispatchPolicyTest,DailySummaryPolicyTest}.kt`,
`IT/{DailySummaryPolicyTests,RepeatingReminderSettingsTests}.swift`. Research spec
`06-settings-data.md` §3.9–3.12, §5 (notifications without a server), traps R06.10–R06.12;
`05-home-progress.md` §3.7.6 and R05.20. Decisions D-16.5, D-16.40, D-16.41, Proposed D-16.61.
Acceptance ids reviewed by P09-08: ACC-H5-1, ACC-H11-1, ACC-J11-2.

What it does (own words): Platewise has no server, so it cannot schedule a notification for a time
when the app is closed (D-16.5). Reminders are worked out inside the app instead: when the app
opens, when it comes back to the front, and on a timer set for the next due time while the page
lives. There are six reminders (D-16.41): breakfast, lunch, dinner, the daily summary and water,
each at its own wall-clock time (08:00, 12:00, 19:00, 20:00, 14:00 by default, all off,
D-16.61), and the fasting goal, which is due when the running fast reaches start + goal. Every
time a reminder is about to show, the engine reads the stored switches again: the master switch,
the reminder's own switch, the tracker it belongs to (water tracking for water, fasting tracking
for the fasting goal) and the browser's notification permission; anything off means nothing shows
(R06.10). A reminder whose time passed while the app was closed shows once when the app next opens,
flagged as missed so the notifier (P09-09) can show it as a banner. The summary says how much was
eaten today against the energy goal and how much is left, in the person's energy unit. The next
time is always the next wall-clock occurrence in the local zone, worked out again each time, so it
neither drifts nor jumps an hour at a DST change (R06.11).

Inputs → outputs:
- `schedule.ts` (pure): `nextAt(at, now)` → the first instant after `now` at which the local clock
  reads `at`; `lastAt(at, now)` → the latest such instant at or before `now`; `due(reminders,
  marks, now)` → the daily reminders due now (`{id, dueAt}`); `planDaily(reminders, marks, now)` →
  `{due, marks, wakeAt}`; `planFastGoal(fast, mark, now)` → `{dueAt, mark, wakeAt}`;
  `summaryNumbers(eatenKcal, goalKcal, unit)` → `{eaten, goal, left}` in whole display units;
  `fixedMessage(id)`, `summaryMessage(totals, unit)`, `fastGoalMessage(goalMin)` → catalogue keys
  and params for the notice.
- `engine.ts`: `createReminderEngine(deps)` → `{start, refresh, stop, settled}`. Deps: `clock`,
  `timers` (setTimeout / clearTimeout), `visibility` (`isVisible`, `subscribe`), `settings()` (the
  reminder, tracking and energy-unit settings), `activeFast()`, `todayTotals(day)` (eaten kcal and
  the kcal goal), `permitted()`, `memory` (the shown-marks log), `show(notice)`, optional `watch`
  (stored changes that may move a reminder) and `onError`. `show` gets `{id, dueAt, missed, title,
  body, params}`; the notifier turns the keys into text with `t()`.
- `ports.ts`: the running app's ports: `storedReminderSources(repos)` (settings, active fast, day
  totals and a watch over live queries of the reminder settings and the running fast),
  `browserTimers`, `localReminderMemory()` (the marks in localStorage under `platewise-reminders`).

Files: created `src/services/reminders/{schedule,engine,ports}.ts` with tests,
`src/i18n/en/reminders.ts`, this note. Shared, additive: `src/services/context.tsx`
(`reminders?`), `src/main.tsx` (builds and starts the engine), `src/i18n/en.ts` (the partition).

Edge cases / failure modes:
- A reminder switched on after its time today (lunch turned on at 15:00) does not show at once: a
  reminder with no mark, or whose mark was taken for another time of day, starts counting from now.
- A time moved earlier past now (12:00 → 10:00 at 11:00) does not fire at once, for the same reason.
- Missed for days: shows once, and only an occurrence of today counts; yesterday's breakfast is
  not shown this morning, and the summary never reports a finished day with today's numbers.
- DST: 02:30 on the spring-forward day is 03:30 that day; 01:30 on the fall-back day shows once.
- Fasting goal: a fast first seen with its goal already passed (its start edited back, the switch
  turned on late) never alerts; ended, cancelled or deleted → its mark goes and no alert; an edit
  that moves the goal re-arms it for the new time (or drops it when that time has passed).
- Master off, permission lost, a reminder or its tracker off: its marks are dropped and its timer
  cleared; turning it back on starts counting from then (no flood of old reminders).
- `stop()` (erase everything) cancels the timer and the listeners and drops a check in flight.
- Checks never overlap: a trigger during a check runs one more check after it; triggers that pile
  up meanwhile become one (missed if any of them was).
- A failed read (settings, fast) is reported and checked again within the hour; a failed day
  total gives the summary a plain body without numbers.
- localStorage blocked or full: the marks live in memory for the session.
- Two tabs: each runs an engine; the marks are re-read from localStorage at every check and written
  before anything shows, so the second tab normally sees the first one's mark. Two checks in the
  same instant could both show (accepted; Web Locks could serialise them later).

Our design differences / decisions:
- No re-arm at now + 24 h (R06.11): every wake recomputes the next wall-clock time, and the timer is
  capped at an hour so a moved clock or zone is picked up.
- The fire-time check covers the in-app switches as well as the permission (R06.10; the reference
  checked only the permission).
- No streak, food-log, weight or body-fat reminders (D-16.41, D-16.61), so R06.12 cannot occur;
  meal reminders are not suppressed by logging (D-16.61).
- The summary is the "eaten X of Y, Z left" form only (no health data on the web, 06 §3.11): the
  goal is the energy target in effect; left = max(0, goal − eaten) after both are converted to the
  display unit; without a goal it reads "eaten X"; when the day cannot be read, a plain line.
- The engine carries catalogue keys, not text; the notifier renders them (services stay free of
  `t()`, like the AI layer's failure kinds).
- Names are ours: engine, marks, memory, notice, `missed`.

Tests we will write:
- `schedule.test.ts`: next 08:00 across the March DST change in New York (23 h later, never 09:00);
  a time the day skips; the repeated hour in November; due once, not for a reminder turned on
  after its time, not for an earlier day, not after the time changed; the reminder list (no
  streak) and the defaults; the summary in kJ (eaten 6 276, goal 8 368, 2 092 left) and kJ
  converted before subtracting; the fasting-goal plan for every lifecycle step.
- `engine.test.ts`: water at 15:00 shows at 15:00 while open (ACC-H5-1); a reminder switched off
  between scheduling and fire time is not shown; master off, permission lost and stop cancel the
  timer; a missed lunch shows once on the next open, as missed (ACC-J11-2); the fasting goal shows
  at start + goal while open, and never after the fast ended, was cancelled or deleted; an edit
  re-arms it (ACC-H11-1, R05.20); the summary notice in kJ; checks do not overlap.
- `ports.test.ts`: the stored sources over the test database (settings, the running fast, the day's
  totals against the goal in effect, the watch); the localStorage marks survive bad data.

Compare checklist (filled after the rewrite; reopened `NotificationService.kt`,
`ReminderDispatchPolicy.kt`, `DailySummaryPolicy.kt`, `NotificationManager.swift` 89–450 and the
four test files):
- [x] Next time = next wall-clock occurrence, recomputed at every wake, never now + 24 h (R06.11)
  (`schedule.test.ts > nextAt (R06.11) > gives 08:00 the morning after the March DST change in
  New York, 23 hours later, never 09:00`; `> stays at 08:00 every day from March to November,
  through both changes, without drifting`; `engine.test.ts > createReminderEngine: daily reminders >
  shows 08:00 at 08:00 on the clock the morning after the March DST change (R06.11)`)
- [x] An occurrence at exactly now counts as due today, not tomorrow (`schedule.test.ts > nextAt
  (R06.11) > takes today's time while it is ahead and tomorrow's once it has come`; `> lastAt >
  is today's time once it has come, else yesterday's`)
- [x] Posting needs the permission at fire time; we also re-read the master, the reminder's and the
  tracker's switches (R06.10) (`engine.test.ts > createReminderEngine: daily reminders > does not
  show a reminder when the permission was taken back before fire time (R06.10)`; the `it.each`
  "does not show a reminder when %s goes off between scheduling and fire time (R06.10)" for its own
  switch and the master switch)
- [x] Master off and wipe cancel what is armed (`engine.test.ts > … > cancels the pending timer when
  the master switch goes off (R06.10)`; `> cancels everything on stop (erase everything): no
  timer, no listener, nothing shown (R06.10)`; `ports.test.ts > the engine over the stored data >
  cancels the timer when the master switch is turned off in the store (R06.10)`)
- [x] Water needs water tracking and its own switch (iOS settings test) (`engine.test.ts > … >
  keeps the water reminder quiet while water tracking is off`; `> shows a water reminder set for
  15:00 at 15:00 while the app is open (ACC-H5-1)`)
- [x] Saved times and switches are read as stored, defaults otherwise (iOS settings test)
  (`ports.test.ts > storedReminderSources > reads the reminder settings once they are loaded, with
  the defaults filled in`); our defaults are all off (D-16.61) (`schedule.test.ts > the reminder
  list (D-16.41) > starts every reminder off, at 08:00, 12:00, 19:00, 20:00 and 14:00 (D-16.61,
  D-16.40)`)
- [x] Non-food reminders are never held back by logging (dispatch policy test)
  (`engine.test.ts > … > shows the meal reminders whatever was logged: a log never holds one back
  (D-16.61)`); no streak reminder exists (`schedule.test.ts > the reminder list (D-16.41) > has
  breakfast, lunch, dinner, the summary, water and the fasting goal, and no streak or food-log
  reminder (R06.12)`)
- [x] Fasting goal: scheduled only for a future goal time; dropped when the fast is not running;
  re-evaluated on change and on open (R05.20) (`schedule.test.ts > planFastGoal (R05.20) > *`;
  `engine.test.ts > createReminderEngine: the fasting goal (R05.20) > shows the goal at start + goal
  while the app is open, once (ACC-H11-1)`, `> never shows the goal of a fast that ended before it
  (ACC-H11-1)`, `> drops the goal when the fast is cancelled or deleted, even with no word before
  the goal time`, `> moves the alert to the new goal after an edit`, `> shows nothing when an edit
  puts the goal in the past`; `ports.test.ts > the engine over the stored data > drops the goal
  alert when the fast is cancelled in the store (R05.20)`)
- [x] Fasting goal needs master, fasting tracking and its switch (boot receiver) (`engine.test.ts`
  `it.each` "needs %s on")
- [x] Goal text names the goal length and says the fast stays active (`schedule.test.ts > notice
  words > names the fasting goal's length and says the fast keeps running`)
- [x] Summary "eaten X of Y, Z left", remaining never below 0, kJ converted before subtracting, goal
  = the target in effect (`schedule.test.ts > the daily summary > *`; `engine.test.ts >
  createReminderEngine: the daily summary > reads eaten 6 276 of 8 368 kJ, 2 092 left, for the day
  it falls due`; `ports.test.ts > storedReminderSources > adds up the day's energy against the
  energy target in effect`)
- [x] Texts follow the current language (iOS re-adds repeating reminders on foreground for this):
  ours carry catalogue keys and are rendered when shown.
- Deliberate differences: a reminder (fasting goal included) whose time passed while the app was
  closed shows once on the next open, as missed (D-16.5; Android drops a fasting goal that passed
  while the phone was off, iOS drops a summary whose time passed); the summary's numbers are read
  when it shows, not when it was scheduled (iOS computes them at schedule time); missed daily
  reminders count for today only; switch-on or a moved time starts counting from then; every
  reminder off by default (D-16.61); the in-app switches are checked at fire time (R06.10).
- Not taken: streak, weight and body-fat reminders (D-16.41); the measured burn / balance summary
  (no health data on the web, 06 §3.11); the goal-weight, update, What's new, launch-day and rest
  notifications (goal reached is P09-09's notifier; the rest are out of v1); channels and request
  codes (no web equivalent).

## Decisions for the lead

- **Where the shown-marks live.** The settings schema has no key for them and `src/data/**` is not
  this slice's, so the engine takes a `memory` port and `main.tsx` passes `localReminderMemory()`:
  localStorage key `platewise-reminders`. It is device state: erase everything removes it (the
  `platewise-` prefix), and backups never see it (they read IndexedDB). Moving it into a settings
  key later only means another `ReminderMemory`.
- **Not yet allowed to show anything.** `main.tsx` builds and starts the engine with
  `permitted: () => false` and `show: () => undefined`; P09-09 replaces those two lines with the
  browser's notification permission and the notifier. While `permitted` is false the engine drops
  every mark and arms no timer, so nothing piles up before the notifier lands.
- **`missed`** is set for what the open or the front check finds; the timer, a stored change and
  `refresh()` give `missed: false`. The notifier (P09-09) shows missed ones as a banner (D-16.5).
- **Notices carry catalogue keys** (`title`, `body`, `params`), typed as keys of the `reminders`
  partition; the notifier renders them with `t()`.
- **Missed daily reminders count for today only**; one missed on an earlier day is dropped (a
  breakfast nudge or a summary for a finished day would be noise, and the summary reads today's
  numbers). The fasting goal of a fast still running shows on the next open whatever the day.
- **The watch** (`storedReminderSources(...).watch`) re-checks after any change to the reminder
  settings or to the running fast, from any writer: the settings section, the water and fasting
  services, onboarding, the restore and other tabs. P09-13 can still `await reminders.refresh()`
  after a restore; P09-15 calls `reminders.stop()` before `eraseEverything` (and `start()` again if
  the page is not reloaded after onboarding).
- **The timer is capped at an hour** while any reminder is on, so a moved clock or zone is noticed
  within the hour; with everything off there is no timer at all.
- **Two tabs** each run an engine; the marks are re-read at every check and written before showing,
  so a reminder normally shows in one tab. Two checks in the very same instant could both show;
  `navigator.locks` could serialise them later if that is ever seen.
- **Ledger rows** (for `docs/internals/`): R05.20, R06.10, R06.11, R06.12 and ACC-H5-1, ACC-H11-1,
  ACC-J11-2 can switch from `Review:` to the tests listed in the compare checklist above.

## Status

Done (2026-10-27). `schedule.ts`, `engine.ts`, `ports.ts` with tests (schedule 29, engine 28,
ports 11), the `reminders` catalogue partition, the engine in `Services` and `main.tsx`. Lines
outside the task's own files: `src/services/context.tsx` (`reminders?`), `src/main.tsx` (builds and
starts the engine), `src/i18n/en.ts` (the partition). Handed on to P09-09: the permission and the
notifier in `main.tsx`, the settings section. P09-15: `reminders.stop()` before erasing.
