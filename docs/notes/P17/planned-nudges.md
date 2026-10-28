# Task: Planned nudges (P17-01) · Phase: 17 · Owner: builder (wt-p17s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/NotificationService.kt` (one channel per kind of
notification, so Android's settings can mute one) and `A/services/ReminderDispatchPolicy.kt` (a
reminder that is not posted once the day already has a log). Behaviour only; nothing taken. The
reference has no meal check, water pace, empty-day or weigh-in-age nudge and no quiet hours: those
are ours (D-16.100). Also read: phase file P17 (Goal, D-16.100, the rules, the Notice contract),
`docs/notes/P13/notifications-and-custom-reminders.md`, `src/services/reminders/**` (engine,
schedule, nativePlan ids and channels, the 7-day summary, `extra.open`, nativeSync's re-plan after
every change, native.ts, load.ts), the plugin's Android sources (a one-shot that fired is dropped
from `getPending`; scheduling an id that is showing dismisses it; `cancel` also dismisses),
`src/data/settingsSchema.ts` (`remind.*`), the diary, water and weight repositories,
`src/domain/meals/times.ts`.

What it does (own words): in the Android app Platewise now works out a few nudges of its own and
hands them to Android with the reminders, so they come with the app closed. Each is planned for
the next 7 days as one notification per day, and every change in the app (a log, water, a
weigh-in, a setting) plans again, so a nudge that is no longer needed is taken back before it
comes. The meal check says "Nothing logged for lunch yet" about an hour after the person's usual
lunch time (the median of the last 14 days' lunch logs, from 5 days of them; else the lunch
reminder's time), and today's goes once lunch is logged. Water pace comes at 13:00, 16:00 and
19:00 while water tracking is on and the day is behind an even pace toward the goal over
08:00–21:00. The empty day comes at 20:30 when nothing at all is logged that day. The weigh-in
comes at 08:30 seven days after the newest weigh-in, then every 7 days. A meal reminder the person
turned on gains "Only if I haven't logged it" (on by default): it is then planned day by day too,
and a logged meal takes that day's back. Quiet hours (22:00–07:00, on by default) drop nudges that
would come then; reminders the person set always come. Each kind has its own Android channel.

Inputs → outputs:
- `src/domain/reminders/usualTimes.ts` (pure): `usualMealTime(entries, meal, today)` → `HH:MM` or
  null (the earliest log of that meal on each of the 14 days before today, logged on that same day;
  at least 5 such days; the median, rounded to the minute).
- `src/domain/reminders/notices.ts` (pure): `NOTICE_KINDS`, `NoticeKind`, `SMART_KINDS` (the
  switches S1 shows), `QUIET_HOURS`, `isQuietAt(at)`.
- `src/services/reminders/nudgePlan.ts` (pure): `nudgeRequests(input, write)` → the planned nudges
  and the day-by-day meal reminders as `NativeRequest`s; id helpers (`dayIdOf`), the nudge
  times, `waterBehind(ml, goal, at)`.
- `nativePlan.ts`: takes optional `nudges` facts (`NudgeFacts`: per day of the next 7 the meals
  logged, the water and whether anything is logged; the usual meal times; the newest weigh-in),
  gives each kind its channel, keeps reminders under the Notifications switch and nudges under
  their own switches; the fasting goal waits for 07:00 in quiet hours and moves to its own channel.
- `nativeSync.ts`: creates the kind channels, reads the facts (`nudgeFacts` dep), reports every
  hand-over (`onHandedOver(plan, now)`, for the inbox) and every notification Android shows while
  the app runs (`onShown`).
- Settings (`notify.*`): `notify.off` (kinds turned off, `[]`), `notify.quiet` (true),
  `notify.onlyIfNotLogged` (true). They travel in backups like `remind.*`.

Files: created `src/domain/reminders/{usualTimes,notices}.ts`,
`src/services/reminders/nudgePlan.ts`, `src/services/notifications/sources.ts` (the facts and their
watch, Android chunk), tests for each. Changed `src/services/reminders/{nativePlan,nativeSync,
native,load,engine}.ts`, `src/data/settingsSchema.ts` (notify.* only), the reminders card
(`RemindersSection.tsx`: the Only if I haven't logged it row, Android only).

Edge cases / failure modes:
- A one-shot that fired is gone from the plugin's pending list, so a later plan never takes it out
  of the shade; ids are per day (8 slots by day number, as the summary), so tomorrow's never
  reuses today's, which may still be showing.
- A meal logged for a future day takes that day's check and reminder back too.
- Usual time from entries logged on another day than their diary day (a late log of yesterday's
  lunch) is ignored: their clock time says nothing about when the meal was eaten.
- Several foods of one meal on one day count once (the earliest), so one big lunch is not 5 logs.
- A usual time an hour before midnight gives a check after midnight: dropped (it is quiet anyway).
- Water goal 0 or tracking off: no water pace. A future day's water is 0, so its 3 nudges are
  planned and taken back by the next change if water is logged ahead (rare).
- Empty day while a fast is expected to run through 20:30 that day: not planned (a fasting day is
  not a forgotten one).
- No weigh-in at all: no weigh-in nudge (onboarding stores the first one).
- Permission refused: nothing is handed over (as P13). The Notifications switch off: reminders
  are taken back, nudges stay (they have their own switches, D-16.100's rules).
- More than 7 days without opening the app: the planned nudges and the day-by-day meal reminders
  stop, as the summary does (P13); with Only if I haven't logged it off, meal reminders repeat
  daily as before.
- DST: one-shots are worked out per calendar day (`clockOn`), so they keep their clock time.

Our design differences / decisions:
- Nudges do not need the reminders' Notifications switch, only Android's permission and their own
  switch (all on by default); otherwise they would never come for most people.
- "Only if I haven't logged it" is one switch for the three meal reminders, shown in the Android
  app only (the web engine is unchanged, D-16.5).
- Planned nudges in quiet hours are dropped; the fasting goal (a person's own alert) waits until
  07:00 instead, since dropping it would lose it.
- Ids: day-by-day meal reminders 100–123, meal checks 130–153, water pace 160–183, empty day
  190–197, weigh-in 200–207, event notices 300–403; P13's are 11–40 and 1 000+.
- Channels: `platewise-<kind>` per nudge kind and for the fasting goal; reminders keep
  `platewise-reminders`.

Tests we will write:
- `usualTimes.test.ts`: median of 5+ days; fewer than 5 → null; one meal's several foods count
  once; logs from another day ignored; only the 14 days before today; even count rounds.
- `nudgePlan.test.ts`: a logged meal takes today's check back and history decides the time; the
  reminder time without history; water pace behind/ahead at each time; empty day with and
  without logs, and while a fast runs; weigh-in age (7 days, then every 7); quiet hours drop and
  the switch off keeps them; kinds off; ids never collide with each other or with P13's; channels.
- `nativePlan.test.ts`: Only if I haven't logged it turns meal reminders into days and a logged
  meal takes that day's back; off keeps the daily ones; nudges without the Notifications switch;
  the fasting goal waits for 07:00 in quiet hours.
- `nativeSync.test.ts`: kind channels made; the facts read; a change (a logged meal) takes today's
  check back; `onHandedOver` gets each plan; `onShown` for a shown one.

Compare checklist (filled after the rewrite; reopened `NotificationService.kt` (its channel list)
and `ReminderDispatchPolicy.kt`):
- [x] One channel per kind, so Android's settings can mute one: each nudge kind and the fasting
  goal get `platewise-<kind>`, named with Settings' words (`nativeSync.test.ts > createNativeReminders:
  the nudges and the inbox hooks (P17) > makes a channel per kind besides the reminders’ and hands the
  nudges over without the reminders’ switch`; `setup.test.ts > the Android app’s notifications
  together (P17) > hands the nudges over in their channels and keeps the plan for the inbox`;
  `nudgePlan.test.ts > the meal check (P17-01, D-16.100) > comes an hour after the reminder time
  without history, each day of the next 7, in its channel`)
- [x] A reminder that does not come once the day has a log (the reference's streak reminder): the
  meal check and Only if I haven't logged it take that day's back (`nudgePlan.test.ts > the meal
  check (P17-01, D-16.100) > goes for a meal once it is logged that day, and history decides the
  time`; `nativePlan.test.ts > nativePlan with the nudges (P17-01, D-16.100) > plans meal reminders
  day by day while Only if I haven’t logged it is on, taking back a logged day`;
  `nativeSync.test.ts > … > takes today's meal check back once the meal is logged, and reports each
  plan handed over`; `setup.test.ts > … > takes today's check back once lunch is logged, so it never
  reaches the inbox`)
- [x] Usual meal times from history (`usualTimes.test.ts > usualMealTime (P17-01, D-16.100) > *`)
- [x] Water pace, empty day, weigh-in age (`nudgePlan.test.ts > the water pace (P17-01) > *`, `> the
  empty day (P17-01) > *`, `> the weigh-in (P17-01) > comes at 08:30 seven days after the newest
  weigh-in, then every 7 days`)
- [x] Quiet hours (`nudgePlan.test.ts > the meal check (P17-01, D-16.100) >
  drops a check that falls in quiet hours, unless they are off`; `notices.test.ts (domain) > notice
  kinds and quiet hours (P17) > *`; `nativePlan.test.ts > nativePlan with the nudges (P17-01,
  D-16.100) > holds the fasting goal until 07:00 when it would come in quiet hours`)
- [x] Ids never collide (`nudgePlan.test.ts > the nudges together (P17-01) > never gives two
  notifications one id, nor one of the ids of P13`; `> never reuses yesterday's id for a day of the
  next 7`)
- [x] The facts and their watch (`sources.test.ts > the nudges’ facts (P17-01) > *`)
- Deliberate differences: the reference has no nudges of its own besides a streak reminder (not
  taken, D-16.41); ours are planned 7 days ahead and taken back by re-planning (no server, the
  WebView sleeps), and have quiet hours.
- Not taken: the reference's streak, weight and body-fat log reminders, announcements.

## Decisions for the lead

- **Nudges do not follow the reminders' Notifications switch** (`remind.master`, off by default):
  they need only Android's permission and their own switch (on by default). Otherwise they would
  never come for most people. The Notifications card still governs the person's own reminders.
- **Usual time**: each of the 14 days before today counts once (the earliest food of that meal,
  logged on that same diary day); at least 5 such days; median rounded to the minute. A late log of
  an earlier day is ignored.
- **The meal check** is planned for breakfast, lunch and dinner (not snacks), an hour after the
  usual time; a check that would fall after midnight is never planned.
- **Empty day** counts food and water as "logged", and is skipped on a day a running fast is
  expected to run through 20:30.
- **Weigh-in** is anchored to the newest weigh-in's day (+7, +14, …) so re-planning never moves it;
  with no weigh-in at all there is none.
- **Only if I haven't logged it** is one switch (`notify.onlyIfNotLogged`, default on) for the three
  meal reminders, shown in the Android app only, after the meal rows. While on, the meal reminders
  are 7 one-shots per meal (ids 100–123) instead of P13's daily repeating ones (11–13, taken back by
  the first plan); like the summary, they stop after 7 days without opening the app.
- **Quiet hours**: planned nudges that would fall in 22:00–07:00 are dropped; the fasting goal (the
  person's own alert) waits until 07:00 and moves to its own channel `platewise-fastGoal`; it keeps
  its existing switch `remind.fastGoal` (no second switch in Smart notifications).
- **Ids**: meal reminders by day 100–123, meal checks 130–153, water pace 160–183, empty day 190–197,
  weigh-in 200–207, event notices 300–403 (8 day slots each); P13 keeps 11–40 and 1 000+.
- **`notify.off`** is stored as a plain list of names (unknown names ignored by the readers), so the
  initial bundle carries no kinds list.

## Status

Done (2026-10-28). Everything above with tests. Not run on a device: the alarms, the channels in
Android's settings and the taps need the owner's phone. Lines outside the task's own files:
`src/services/backup/hash.ts` (two keys in `LOCAL_SETTINGS`) and its test; `src/main.tsx`,
`src/services/context.tsx` (wiring); `src/features/home/HomePage.tsx` (the title wrapped once).
