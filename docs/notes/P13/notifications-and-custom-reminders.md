# Task: Reminders as Android notifications, and custom reminders (P13 S3) · Phase: 13 · Owner: builder (wt-p13s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/NotificationService.kt` (how reminders reach the system:
inexact alarms that may fire while idle, a boot receiver that arms them again, the notification
permission checked before posting, one channel per kind, a tap opening the main activity) and
`A/ui/settings/SettingsScreen.kt` lines 540–650 (the master switch asks for POST_NOTIFICATIONS on
Android 13+ and is stored on only on a grant). Behaviour only; nothing taken. The reference has no
reminders the person writes (D-16.93 is ours). Also read: phase file P13 (Goal 4, D-16.92,
D-16.93), `docs/notes/P09/{reminder-engine,notifications-and-notifier}.md`, `docs/notes/P11/*.md`
(the Android shell, the Health Connect load pattern, P11 polish's "not available in the Android
app" lines), `src/services/reminders/**`, `src/services/trackingSettings.ts`, the reminders
settings in `src/data/settingsSchema.ts`, `RemindersSection.tsx`, onboarding's `Reminders.tsx`
and its route, `android/**`, `scripts/android/{build-apk.sh,icons.py}`, and the plugin's own
sources (`@capacitor/local-notifications` 7.0.7: `schedule` with `at` or `on`, `allowWhileIdle`,
`getPending`, `cancel`, `checkPermissions`/`requestPermissions`, the tap event kept until a
listener comes, the boot receiver, inexact alarms when exact ones are not allowed).

What it does (own words):
1. In the Android app every reminder becomes a real Android notification that the system shows at
   its time, also with Platewise closed or after a restart. The app hands the system its whole
   list of reminders whenever something that changes it moves (a switch, a time, the running
   fast, a custom reminder, the diary for the summary, the permission) and when it starts or comes
   back to the front: meals and water repeat daily at their wall-clock time, the fasting goal is
   one notification at start + goal, custom reminders repeat on their days or fire once on their
   date. What is turned off is taken back from the system. The system's inexact alarms that may
   fire in Doze are enough: no exact-alarm permission. On Android 13+ the Notifications switch (and
   onboarding's button, and switching a custom reminder on while notifications are off) asks for
   the notification permission; a refusal leaves the switch off with a line pointing to Android's
   settings. A tap on a notification opens the app on Home showing today, where meals, water, the
   running fast and the summary's numbers are.
2. The person can write their own reminders (up to 20): a short text, a time, and either the
   weekdays it repeats on or one date. Settings › Tracking & reminders gets a "Your reminders" card
   to add, edit, delete and switch them; they obey the Notifications switch like the others. The
   web shows them through the browser notifier while the app is open (or as a missed banner on the
   next open the same day), like the daily ones. The Coach (Wave B) gets one call to add one.
3. P11's "reminders are not available in the Android app" lines and the missing onboarding button
   go: in the app reminders work once Android allows notifications.

Inputs → outputs:
- `src/domain/reminders/custom.ts` (pure): `CustomReminder` `{id, text, time, on}` with `days`
  (weekdays, Monday first) or `date` (a day key); `checkCustomReminder(input)` → the clean
  reminder fields or a problem code; `readCustomReminders(stored)` (the settings reader);
  `weekdayOf(day)`.
- `remind.custom` setting (array, default `[]`).
- `src/services/reminders/customReminders.ts`: `createCustomRemindersService({settingsRepo, clock,
  newId})` → `addCustomReminder(input)` → `Result<CustomReminder, CustomReminderProblem>` (the
  Coach's call), `updateCustomReminder(id, input)`, `removeCustomReminder(id)`,
  `setCustomReminderOn(id, on)`.
- `schedule.ts`: `nextOccurrence(timing, now)`, `lastOccurrence(timing, now)`, `planCustom(list,
  marks, now)` → `{due, marks, wakeAt}`, `customMessage(text)`.
- `engine.ts`: the web engine also checks custom reminders (marks in the same log).
- `nativePlan.ts` (pure): the stored reminder settings, the running fast, the summary days' totals
  and now → the native schedule requests (`{id, title, body, schedule: {on: {hour, minute,
  weekday?}} | {at}, allowWhileIdle, extra: {open, key}}`), and `summaryDays(at, now)`.
- `nativeSync.ts`: `createNativeReminders(deps)` → `{access, engine}`: `access` is a
  `NotificationAccess` over the plugin's permission (with `refresh()` and `system: 'android'`, and
  a worker that shows the goal-weight alert at once); `engine` is a `ReminderEngine` whose check
  hands the plan to the system (cancel what is pending and no longer wanted, schedule what is new
  or changed) and whose `stop` takes everything back (erase everything); taps call `onOpen`.
- `native.ts` (the plugin, `registerPlugin('LocalNotifications')`, and `setUpNativeReminders`),
  `load.ts` (`loadNativeReminders(base)`: undefined on the web, nothing fetched).
- `ports.ts`: `storedSummaryWatch(repos, clock)`, the next week's entries and the profile.
- `trackingSettings.ts`: the permission becomes a small store (`permission()`, `subscribe`), async
  `recheck()`, `requestPermission()` (onboarding), `system`.
- UI: `RemindersSection` (Android wording), `CustomRemindersCard` + its sheet, onboarding
  `Reminders` (button everywhere; Android denied line), `OnboardingRoute` asks through the service.
- Android: manifest permissions (POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK come with
  the plugin; written in ours too), `ic_stat_platewise` drawn by `icons.py`, `cap sync`.

Files: created `src/domain/reminders/custom.ts`, `src/services/reminders/{customReminders,
nativePlan,nativeSync,native,load}.ts`, `src/services/reminders/testing/fakeNotificationsPlugin.ts`,
`src/features/settings/tracking/{CustomReminders.tsx,customReminders.module.css,usePermission.ts}`,
`android/app/src/main/res/drawable-*/ic_stat_platewise.png`, `e2e/reminders.spec.ts`, tests for
each, this note. Changed:
`src/services/reminders/{schedule,engine,ports,notifier}.ts`, `src/i18n/en/reminders.ts`,
`RemindersSection.tsx`, `TrackingPage.tsx`, onboarding `Reminders.tsx`, `src/i18n/en/onboarding.ts`
(lines), `android/app/src/main/AndroidManifest.xml`, `android/app/capacitor.build.gradle` and
`android/capacitor.settings.gradle` (written by `cap sync`), `scripts/android/icons.py`,
`package.json`, `pnpm-lock.yaml`. Shared (minimal lines): `src/data/settingsSchema.ts` (one key),
`src/services/trackingSettings.ts`, `src/services/context.tsx` (`customReminders?`), `src/main.tsx`,
`src/features/onboarding/OnboardingRoute.tsx`, `src/test/notifications.ts`.

Edge cases / failure modes:
- Permission refused (Android 13+): the plugin answers `denied`; the switch stays off, the Android
  line shows; nothing is scheduled (the sync cancels what is pending). A permission taken away in
  Android settings is read again when the app comes back to the front: everything is cancelled.
- A permission state "asked once and refused" (`prompt-with-rationale`) reads as refused, so the
  pointer shows; pressing the switch asks again (Android still shows its dialog then).
- `schedule` rejects when notifications are off for the app: reported, retried at the next sync.
- A re-scheduled id that is showing in the shade would be dismissed by the plugin, so unchanged
  requests are not sent again: each carries a key (its words, time and target) in `extra`, and
  only a missing or changed one is scheduled.
- The summary's numbers are fixed when the notification is handed over, so the summary is not one
  repeating notification but its next 7 occurrences, each with that day's numbers, handed over
  again on every diary change (the diary only changes inside the app, so the next one is exact).
  After 7 days without opening the app the summaries stop until it opens.
- The fasting goal: only a goal still ahead is handed over; a fast ended, cancelled or edited moves
  or cancels it.
- A once reminder whose time has passed is kept in the list, shown as passed, never scheduled; its
  switch can be turned off or it can be edited to a new date or deleted.
- A custom reminder on a weekday set gets one weekly notification per day; every day (all seven)
  is one daily notification.
- DST: `on: {hour, minute}` is wall-clock (the plugin's calendar match), the web engine already
  recomputes each time (R06.11).
- Erase everything: the native engine's `stop` cancels every id it can have, at once.
- 20 reminders: Add is disabled with a line; `addCustomReminder` answers `full` (in the same
  settings transaction, so two adds at once cannot pass 20).
- Text: trimmed, runs of spaces and new lines become one space, 1–80 characters (code points).
- Web while closed: as before (D-16.5), custom ones too: a missed one shows as a banner the same
  day.

Our design differences / decisions:
- Store: a settings key `remind.custom`, not a table. It travels in backups with the other
  settings (D-16.93), live queries and `useSettings` already watch the settings, one
  `settingsRepo.update` checks the limit and writes in one transaction, erase everything clears
  it, and no database version, backup codec or restore change is needed in `src/data` (owned by
  other slices). Easy to move to a table later: only the service and the reader change.
- On the Android app the web engine is not used at all: the native engine takes its place behind
  the same `ReminderEngine` interface (so the settings page, restore and erase need no change),
  and nothing is shown as a banner there (the system shows them, with the app closed too).
- The goal-weight alert goes through the same native access (shown at once) in the app.
- Taps: every reminder opens Home on today (meals, water, summary, custom). The fasting goal also
  opens Home on today, where the running fast's row is: Home has no route to the fast editor sheet
  (its state lives in `HomePage`), so `extra.open` says `fast` for a later change there.
- Notifications use their own channel "Reminders" (the plugin's default one is called "Default").
- Custom reminder words: title "Reminder", body the person's text.
- Turning a custom reminder on (or adding one) while notifications are off asks for the permission
  in the same press; a grant also turns the Notifications switch on.

Tests we will write:
- `custom.test.ts` (domain): text rules, time, days set (empty, unknown, duplicates, order), date,
  both or neither, the reader (good list, bad entry, more than 20, duplicate ids).
- `customReminders.test.ts`: add stores and returns it (on by default); validation problems; a
  once reminder in the past refused; the 20 limit (`full`); update, remove, switch; unknown id.
- `schedule.test.ts`: next and last occurrence for weekday sets and once; `planCustom` due today,
  not before it was counted, not on other days; a changed time restarts counting.
- `engine.test.ts`: a custom reminder shows while open (web notifier path), on its weekday only, a
  once reminder once, not while the master is off.
- `nativePlan.test.ts`: daily meals and water → `on {hour, minute}`; custom weekdays → one `on
  {weekday, hour, minute}` per day; every day → one daily; once → `at`; fasting goal → `at`
  start + goal, absent when passed; summary → 7 `at` days with their numbers; master off → none;
  ids stable and distinct; tap targets.
- `nativeSync.test.ts` (plugin mocked): first sync schedules; a change re-schedules only what
  changed and cancels what was turned off; refused permission cancels all and schedules nothing;
  permission states mapped; request; stop cancels everything; taps call `onOpen`; schedule errors
  reported.
- `load.test.ts`: nothing fetched on the web; the setup module on Android.
- `CustomReminders.test.tsx`: add (validation lines, stored), edit, delete, switch, limit, asking
  for the permission when notifications are off; `RemindersSection.test.tsx`: Android lines.
- Onboarding `Reminders.test.tsx`: the button in the Android app; the Android denied line.
- `notifier.test.ts`: a custom notice is shown as a system notification with its text.

Compare checklist (filled after the rewrite; reopened `NotificationService.kt` (the class
header, the boot receiver, the fire-time receiver and its re-arm) and `SettingsScreen.kt` 540–650):
- [x] Inexact alarms that may fire in Doze, no exact-alarm permission (the reference's choice too):
  every request has `allowWhileIdle`; the APK has no SCHEDULE_EXACT_ALARM or USE_EXACT_ALARM
  (`nativePlan.test.ts > nativePlan (D-16.92) > repeats meals and water every day at their
  wall-clock time, opening Home`; `aapt dump badging` in Status)
- [x] Android 13+ asks for POST_NOTIFICATIONS from the switch and stores it on only on a grant; a
  refusal leaves it off with a pointer (`RemindersSection.test.tsx > RemindersSection > asks Android
  in the Android app, and points to Android's settings when it says no (P13, D-16.92)`; `> turns on
  in the Android app after a grant, and reads the permission again on return (P13)`;
  `nativeSync.test.ts > createNativeReminders: the permission (Android 13+) > asks Android, and
  reads anything but a grant as a refusal`)
- [x] Nothing is posted without the permission (the reference checks before posting): nothing is
  handed over while Android refuses, and a permission taken away takes everything back
  (`nativeSync.test.ts > createNativeReminders: the permission (Android 13+) > hands nothing over
  and takes everything back while Android refuses`)
- [x] Alarms come back after a restart (the reference's boot receiver): the plugin's restore
  receiver re-arms what it holds (RECEIVE_BOOT_COMPLETED in the APK), and the app hands
  everything over again when it starts (`nativeSync.test.ts > createNativeReminders: the schedule
  (D-16.92) > hands everything over again when the app starts, as a force stop drops the alarms`)
- [x] Daily reminders keep their wall-clock time (R06.11; the reference re-arms at + 24 h): the
  plugin's calendar match (`on: {hour, minute}`) finds the next clock time each day
  (`nativePlan.test.ts > … > repeats meals and water every day at their wall-clock time, opening
  Home`); custom ones too on the web (`schedule.test.ts > reminders the person wrote (P13, D-16.93)
  > keeps its wall-clock time across the November DST change`)
- [x] The fasting goal is one alarm at start + goal, moved or cancelled with the fast
  (`nativeSync.test.ts > createNativeReminders: the schedule (D-16.92) > moves the fasting goal with
  the fast, and takes it back when the fast ends`; `nativePlan.test.ts > … > leaves the fasting goal
  out once it has passed, for an ended fast, or while it is not wanted`)
- [x] The summary carries the day's numbers (the reference works them out when it fires; we hand
  over the next 7 days with each day's numbers and hand them over again on every diary change)
  (`nativePlan.test.ts > … > hands the summary over as its next 7 days, each with that day's
  numbers`; `nativeSync.test.ts > … > hands the summary over again with new numbers after the day's
  diary changed`; `ports.test.ts > storedSummaryWatch (P13: …) > reports a change to the entries of
  today and the week ahead, and to the profile`)
- [x] A tap opens the app (`nativeSync.test.ts > createNativeReminders: taps, errors and stop >
  opens the fast for the fasting goal and Home for everything else`; `> opens what a tap that
  started the app was about, once the engine listens`)
- [x] A channel of our own, named in Android's settings (`nativeSync.test.ts > … > hands every
  reminder that is on to the system when the app starts, in our channel`)
- [x] Custom reminders: validation, limits, the store, the Settings UI, the Coach's call, the web
  path (`custom.test.ts`, `customReminders.test.ts`, `CustomReminders.test.tsx`, `engine.test.ts >
  createReminderEngine: the reminders the person wrote (P13, D-16.93) > *`, `notifier.test.ts >
  createNotifier: reminders > shows a reminder the person wrote with its own words, and as its own
  banner (P13)`, `e2e/reminders.spec.ts > reminders of your own (P13) > adds a reminder of your own,
  shows it at its time while open, edits and deletes it (D-16.93)`)
- [x] P11's "not available in the Android app" lines are gone; the onboarding button is back there
  (`Reminders.test.tsx > Reminders > offers the button in the Android app, where Android asks, and
  turns reminders on after a grant (P13)`; `> points to Android's settings when Android refuses, and
  continues with reminders off (P13)`)
- Deliberate differences: one channel for every reminder (the reference has one per kind); the
  summary's numbers are fixed when handed over (7 days ahead) instead of read when it fires;
  every tap opens Home on today (the reference opens its main screen); the person's own reminders
  have no reference counterpart (D-16.93); no battery-optimisation link.
- Not taken: the streak, weight, body-fat, launch-day, update and rest notifications (D-16.41);
  per-kind channels; exact alarms.

## Decisions for the lead

- **Store: the `remind.custom` setting**, not a table (reasons above). One line in
  `src/data/settingsSchema.ts` (and its test's key list); the rules live in
  `src/domain/reminders/custom.ts`, so the reader is pure. A list with one unusable reminder reads
  as `[]` and is kept aside whole (the schema's rule: never half read).
- **The Android app does not run the web engine.** `loadNativeReminders` returns an access and an
  engine with the web engine's interface; `main.tsx` uses them in place of the browser's, so the
  settings page, restore (`refresh`) and erase (`stop`) need no change. No in-app banners there.
- **The summary on Android is 7 one-shot notifications** (ids by day, 8 slots so today's in the
  shade is never reused), handed over again after each change to the next week's entries or the
  profile (`storedSummaryWatch`). After a week without opening the app, summaries stop until it
  opens again. A repeating notification would have to say something without numbers.
- **Unchanged notifications are not handed over again** (the plugin dismisses a shown one when its
  id is scheduled again): each carries a key in `extra`. The check when the app starts hands over
  everything regardless, since a force stop drops the alarms while the plugin still lists them.
- **Notification ids**: meals 11–13, water 15, summary 20–27, fasting goal 30, goal weight 40;
  a written reminder gets a block of 8 at `1000 + slot × 8`, the slot from a hash of its id (a
  taken slot moves on), so deleting one leaves the others' ids alone.
- **Taps**: every notification opens Home on today (`appState.selectDay(null)` and Home). The
  fasting goal's `extra.open` is `fast`, but Home has no way in to the fast editor from outside
  (its sheet state lives in `HomePage`); the running fast's row is on today's Home. A follow-up in
  `HomePage` could open the editor for `open: 'fast'`.
- **Permission state**: Android's `prompt-with-rationale` (refused once) reads as `denied`, so the
  pointer shows; pressing the switch asks again. Any answer but a grant counts as a refusal.
- **Permission store**: `trackingSettings` keeps the last-read permission and tells subscribers;
  `recheck()` is now async (Android reads it through the bridge), and the cards share it
  (`usePermission.ts`). `requestPermission()` asks without storing (onboarding).
- **Asking from a custom reminder**: switching one on, or adding one, while notifications are off
  asks in the same press (`turnRemindersOn`); a grant turns the Notifications switch on too; a
  refusal leaves the reminder off (a new one is stored off).
- **A once reminder that has passed** stays in the list as "Passed: …", is never scheduled, and
  counts toward the 20 until deleted.
- **The goal-weight alert** goes through the same native access in the app (shown at once).
- **Status icon**: `ic_stat_platewise`, the plate rim and leaf in white from `mark.svg`'s geometry,
  drawn by `icons.py` into `drawable-{m,h,xh,xxh,xxxh}dpi`. No tint is set (the redesign may change
  the accent).
- **The Coach's call (Wave B)**: `services.customReminders.addCustomReminder(input)` with
  `{text, time: 'HH:MM', days?: Weekday[], date?: 'YYYY-MM-DD', on?: boolean}` (days or date) →
  `Result<CustomReminder, CustomReminderProblem>`; problems `noText | textTooLong | badTime |
  noDays | badDate | daysOrDate | past | full | notFound`; `problemWith(input)` checks without
  storing. It stores the reminder on by default and does not ask for the permission: the Add card's
  press can call `trackingSettings.turnRemindersOn()` first when `permission()` is not `granted`
  or the Notifications switch is off.
- **Acceptance map**: ACC-M11-9 named the two P11 tests this task replaces on purpose, so
  `pnpm check --require-ref` fails on those two lines until the map is updated (rows proposed in the
  final report; they resolve against this tree).

## Status

Done (2026-10-28). Everything above, with tests; `pnpm android:apk` builds the debug APK with the
plugin (POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK; no exact-alarm permission). Not
run on a device (no emulator here): the permission dialog, the alarms in Doze, the boot re-arm,
taps from a closed app and the status icon need the owner's phone. Lines outside the task's own
files: `src/data/settingsSchema.ts` (+ test), `src/services/trackingSettings.ts` (+ test),
`src/services/context.tsx`, `src/features/onboarding/OnboardingRoute.tsx`,
`src/test/notifications.ts`, `THIRD_PARTY_NOTICES.md` and `src/generated/notices.json` (written by
`pnpm build`). Handed on: the acceptance rows to the lead; `addCustomReminder` to S4.
