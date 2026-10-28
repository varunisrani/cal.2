# Task: Event notices, the Notices service and Smart notifications settings (P17-02) · Phase: 17 · Owner: builder (wt-p17s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/NotificationService.kt` (a check that the app may post
before posting; the goal-weight notice shown at once; a channel per kind). Behaviour only; nothing
taken. The events below are ours (D-16.101). Also read: phase file P17 (D-16.101, the rules, the
`Notices` contract), `src/services/analysis.ts` (its states; D-16.46: a finished analysis is
stored as a draft and its review opens again after a reload), `src/services/backup/{auto,drive,
hash,restore,payload}.ts` (how `backup.autoState` and `backup.drive` stay out of backups, and how a
failure is stored with its time), `src/domain/walks/week.ts`, `src/features/walk/useWeekMinutes.ts`,
`src/domain/nutrients/goalDefaults.ts` (sugar is a limit, 0 = no goal), `src/features/home/burn.ts`
and `dayNutrients.ts`, `src/services/trackingSettings.ts`, `src/features/settings/tracking/**`,
`src/features/home/HomePage.tsx`, the i18n partitions.

What it does (own words): in the Android app Platewise posts a notification at once when something
worth knowing happens while it is open or just left: the day passed the sugar limit, the day's
calories passed the target (goal + burned) by 10 %, the protein goal was reached, the week reached
150 active minutes, a photo analysis finished while the app was in the background (a tap opens its
review), or an automatic or Google Drive backup failed twice in a row (a tap opens Your data). Each
comes at most once a day (the week's once a week; the analysis once per analysis). Everything
Platewise sends by itself follows the same rules: its own switch in Settings › Tracking &
reminders › Smart notifications (all on), Quiet hours 22:00–07:00 (on: then it is dropped),
Android's permission, and its own Android channel. Turning a switch on asks Android when the
permission is not granted. Home shows a one-time card "Let Platewise nudge you" (Turn on / Not now)
while the permission is not granted; Not now hides it for good. A tap on any notification opens
what it is about: Home on today, the fast, water, Progress for a weigh-in, the review, Your data.
The web app shows nothing new (D-16.5).

Inputs → outputs:
- `src/services/notifications/contract.ts` (types): `Notice`, `OpenTarget`, `Notices` (the phase
  contract), `NotifyService` (what screens use).
- `notices.ts`: `createNotices({show, permitted, settings, device, inbox, clock})` → `post(notice)`
  → `'posted' | 'off' | 'notAllowed' | 'quiet' | 'already'`; the onceKey is recorded in the same
  transaction as the check, in `notify.device` (device state, out of backups, pruned after 14
  days); a posted notice also goes to the inbox (P17-04).
- `events.ts` (pure): `sugarTotal(entries)` (only foods with a sugar figure), `sugarPassed`,
  `caloriesPassed(eaten, target)` (> 110 %), `proteinReached`, `weekReached(minutes)`,
  `failStreak(stored, problem)`; the notices' words.
- `hooks.ts`: `watchEvents(deps)` → stop: live reads of today's entries, the plan, the burn,
  the week's walks and Health Connect sessions, the backup states; the analysis service's states;
  each crossing posts. A seam for the Coach's notices (S2).
- `open.ts`: `openTarget(target, app)`: the route for each target.
- `testing/fakeNotices.ts`: records posts, answers as told.
- Settings: `notify.off`, `notify.quiet` (P17-01), `notify.device` (device state:
  `LOCAL_SETTINGS` in `backup/hash.ts`, one line).
- UI: `SmartNotifications.tsx` (Settings › Tracking & reminders, Android app only),
  `src/features/notifications/{NotifyHeader,HomeNotifyParts,NudgeCard}.tsx` (Home, lazy, Android
  only), one wiring change in `HomePage.tsx`.

Files: created `src/services/notifications/**`, `src/features/notifications/**`,
`src/features/settings/tracking/SmartNotifications.tsx` (+ css), tests. Changed
`src/data/settingsSchema.ts` (notify.*), `src/services/backup/hash.ts` (two keys in
`LOCAL_SETTINGS`), `src/services/reminders/{native,load,nativeSync,nativePlan}.ts`,
`src/services/context.tsx` (`notify?`), `src/main.tsx` (wiring), `TrackingPage.tsx`,
`HomePage.tsx` (one wiring change), `src/i18n/en/reminders.ts`, `docs/user/android.md`.

Edge cases / failure modes:
- Two posts of one onceKey at once: the check and the record are one settings transaction, so only
  one is shown.
- A post in quiet hours is dropped, not queued (the contract); the onceKey is not recorded, so an
  event still true after 07:00 posts then at the next change.
- Permission not granted: `notAllowed`, nothing recorded.
- The plugin refuses (notifications off for the app): reported, and the onceKey stays recorded
  (no retry storm).
- Sugar: entries without a sugar figure are left out of the sum (a partial sum that passed the
  limit has certainly passed it); a limit of 0 means no limit.
- Calories: the target is the plan's energy plus the day's burn while counting is on (Health
  Connect when connected, else recorded walks), as Home shows it; no readable plan → nothing.
- Active week: from the person's week start; onceKey per week.
- Analysis: only the step from analysing to a review ready while the page is hidden; a review
  opened from a reuse list, or after a reload, never posts.
- Backups: each new failure time of a source (`problem.at`) counts, a success clears it; the
  count is kept in `notify.device`, so failures across restarts count. The second in a row posts.
- Erase everything wipes `notify.device` with the database; restore keeps this device's.

Our design differences / decisions:
- The fasting goal keeps its switch (`remind.fastGoal`, Notifications card) and stays planned
  ahead (it must come with the app closed); under the new rules it gets its own channel, waits
  for 07:00 in quiet hours and lands in the inbox. No second switch in Smart notifications.
- The analysis notice is once per analysis, not once a day (several meals a day are analysed).
- The Home card hides for good after Not now and also after Android refuses (it could only ask
  again uselessly); Settings then points to Android's settings.
- Smart notifications need Android's permission, not the reminders' Notifications switch.

Tests we will write:
- `notices.test.ts`: posts once per onceKey; off, notAllowed, quiet (and after quiet), already;
  concurrent posts; onceKeys pruned; the request's channel, icon, id and tap target; the inbox gets it.
- `events.test.ts`: the sugar sum skips foods without a figure; passed / not passed / no limit;
  calories over 110 % only; protein reached; 150 minutes; the failure streak.
- `hooks.test.ts`: each event posts once a day (sugar, calories, protein), the week once a week,
  the analysis only in the background, backups on the second failure in a row; nothing after stop.
- `open.test.ts`: each target's route.
- `SmartNotifications.test.tsx`: a switch per kind on by default, a short line each, quiet hours,
  turning one on asks Android when needed; absent on the web.
- `NudgeCard` / `HomeNotifyParts.test.tsx`: shows while not granted, Turn on asks, Not now hides
  for good; nothing on the web.

Compare checklist (filled after the rewrite; reopened `NotificationService.kt`: its permission
check before posting and its channel list):
- [x] Nothing is posted without the permission (`notices.test.ts > Notices.post (P17-02, D-16.101) >
  posts nothing, and records nothing, while its kind is off or Android does not allow it`)
- [x] One channel per kind (`notices.test.ts > Notices.post (P17-02, D-16.101) > posts at once in its
  own channel, opening its target, and keeps it in the inbox`; `setup.test.ts > the Android app’s
  notifications together (P17) > posts a notice at once through the plugin and keeps it in the inbox`)
- [x] Once a day, quiet hours, concurrent posts, a refusal (`notices.test.ts > Notices.post (P17-02,
  D-16.101) > posts a onceKey once, even when asked twice at the same moment`; `> drops a notice in
  quiet hours, and posts it after them when it is still true`; `> reports a notice Android refuses,
  and does not try it again`; `> forgets onceKeys after 14 days`)
- [x] Each event (`hooks.test.ts > watchEvents: the day (P17-02) > *`, `> watchEvents: a meal ready to
  review (P17-02) > *`, `> watchEvents: backups failing (P17-02) > *`; `events.test.ts`)
- [x] Tap targets (`open.test.ts`; `nativeSync.test.ts > createNativeReminders: the nudges and the
  inbox hooks (P17) > hears a notification Android shows while the app runs, and passes a tap’s id
  on`)
- [x] Settings › Smart notifications (`SmartNotifications.test.tsx > Smart notifications (P17-02,
  D-16.100/101) > *`), the Home card (`HomeNotifyParts.test.tsx > Home in the Android app: Let
  Platewise nudge you (P17-02) > *`), the web shows nothing new (`HomeNotifyParts.test.tsx > … > shows
  nothing new on the web: the title alone`; `SmartNotifications.test.tsx > … > is not on the Tracking
  page on the web`; `> Only if I haven't logged it (P17-01) > is not there on the web`)
- Deliberate differences: the reference's notices (goal weight, app update, announcements) are not
  ours; ours are D-16.101's.
- Not taken: the update and launch-day notices, the workout rest timer.

## Decisions for the lead

- **The fasting goal** stays planned with the reminders under its own switch (`remind.fastGoal`),
  now in its own channel, waiting for 07:00 in quiet hours; no second switch.
- **Meal ready to review** is once per analysis (onceKey with the draft's time), not once a day:
  several meals a day are analysed. Only the step analysing → review ready while the page is hidden
  posts (a reuse pick or a reload's restore never does).
- **Backups failing**: each new failure time stored in `backup.autoState.problem` or
  `backup.drive.problem` counts one, a success (problem null) starts again; the count is device
  state (`notify.device.fails`), so failures across restarts count. Read from the stored states, so
  `auto.ts` and `drive.ts` are unchanged (no hook line was needed).
- **Calories** compare with the plan's energy plus the day's burn while Count active calories is on,
  using Home's `features/home/burn.ts` (the services import that pure module rather than repeat the
  rule).
- **Sugar**: foods without a sugar figure are left out; a limit of 0 is no limit. The helper
  (`sugarTotal` in `services/notifications/events.ts`) is small and local, as asked; P16's sugar
  module can replace it later.
- **Quiet hours drop notices** (the contract): an event still true after 07:00 posts at the next
  change that day.
- **The Home card** hides for good after Not now and after Android refuses (it could only ask again
  uselessly); Settings then shows Android's pointer. Turn on only asks for the permission; it does
  not turn the reminders' switch on.
- **A refused show** (notifications off for the app) answers `notAllowed` and keeps the onceKey.
- **The Coach's seam**: `NotifyService.notices.post({kind: 'coachReplied' | 'coachCheckIn', open:
  {coachChat: id}, …})`; `OpenTarget` has `{coachChat}` and opens the Coach tab for now; the kinds
  have no switch or channel yet (S2 adds them to `SMART_KINDS` and `kindChannels`).
- **Strings**: kept short for the 250 kB budget; the sugar and protein bodies share one message.

## Status

Done (2026-10-28). Not run on a device. Lines outside the task's files: `src/services/backup/hash.ts`
(+ test), `src/main.tsx`, `src/services/context.tsx`, `src/features/home/HomePage.tsx`.
