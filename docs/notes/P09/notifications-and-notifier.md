# Task: Notifications settings and notifier (P09-09) · Phase: 09 · Owner: builder (wt-p09s09)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `ios/calorietracker/Views/ProfileComponents.swift` lines 1100–1429
(the notification sections: the master switch asking for authorisation and turning itself back
off on a refusal, the footer shown while the system says denied, the per-reminder switch with a
time picker shown while on, water only while water is tracked, the fasting goal only while fasting
is tracked); `android/.../ui/settings/SettingsScreen.kt` lines 2185–2365 (the notification type
rows, water and fasting rows only while their tracker is on, the goal alerts row, the "none
selected" line) and 540–650, 1120–1150 (the master switch flips on only after a grant; the card
under the tracking card). No reference tests cover these screens (`RepeatingReminderSettingsTests`
covers the stored defaults the engine already reads, P09-08). Research spec `06-settings-data.md`
§3.9–3.12, §5 (notifications without a server: in-app banners, a system notification while the
page is open and allowed, the switch reflects the real permission); trap R06.13; D-16.5, D-16.41,
D-16.61; P05-14 (the goal-reached message on the bus); P09-08's note (`permitted` and `show` are
this task's). Acceptance ids reviewed here: ACC-J11-1, ACC-L5-1.

What it does (own words): the last card of Settings › Tracking & reminders is Notifications. Its
master switch is off until the browser allows notifications: turning it on asks the browser, and
only a grant stores it on. A refusal leaves it off and says the site is blocked, pointing to the
browser's site settings (a page cannot open them itself). The page reads the browser's real
permission each time it comes back into focus, so a permission taken away elsewhere shows the
switch off at once and the engine stops counting. While it is on, the card lists breakfast, lunch,
dinner and the daily summary, each a switch with its time; water (switch and time) only while
water is tracked; the fasting goal only while fasting is tracked; goal weight reached. A line says
reminders show while Platewise is open or the next time it is opened, and work best installed.
The notifier turns what the engine hands it into words and shows it: as a system notification
through the service worker registration when the browser allows it and the reminder fell due while
the page was running; otherwise, and for every reminder that was missed while the app was closed,
as a banner at the top of the app. A weigh-in that reaches the goal weight also sends a system
notification when the master switch and the goal-reached switch are on and the browser allows it
(the in-app dialog of P05-14 shows either way).

Inputs → outputs:
- `notifier.ts`: `browserNotifications()` → `NotificationAccess` (`state()`: granted / denied /
  default / unsupported; `request()`; `worker()`: the registration that can show notifications, or
  null). `createNotifier({access, alerts, onError})` → `Notifier`: `show(notice)` → a system
  notification (`showNotification(title, {body, tag})`) or a banner; `goalReached()` → a system
  notification when allowed; `listen(bus)` hears `goal-reached`; `banners()` / `subscribe()` /
  `dismiss(id)` for the shell's banner list.
- `trackingSettings.ts` (shared with P09-03): `permission()`, `recheck()` (re-reads it and asks the
  engine to check again when it changed), `turnRemindersOn()` (asks, stores on only on a grant,
  resolves with the permission), `turnRemindersOff()`, `setReminder(id, {on?, at?})`,
  `setFastGoalAlert(on)`, `setGoalReachedAlert(on)`.
- `RemindersSection.tsx`: the settings `remind.*`, `alerts.goalReached`, `water.on`, `fasting.on`
  (read with `useSettings`) and the permission → the card; actions through `trackingSettings`.
- `src/app/ReminderBanners.tsx`: the notifier's banners → one dismissable notice each, above the
  screen.
- `main.tsx`: the engine gets `permitted: () => access.state() === 'granted'` and `show:
  notifier.show`; the notifier listens to the app bus.

Files: created `src/services/reminders/notifier.ts`, `src/services/trackingSettings.ts`,
`src/features/settings/tracking/RemindersSection.tsx`, `src/app/ReminderBanners.tsx`, each with
its test; test helpers `src/test/notifications.ts` (the browser's notifications stood in for) and
`src/features/settings/tracking/testing/openTracking.tsx`. Changed: `TrackingPage.tsx` (its marked place), `tracking.module.css`,
`src/i18n/en/reminders.ts` (additive keys). Shared, additive: `src/services/context.tsx`
(`notifier?`, `trackingSettings?`), `src/main.tsx` (the permission, the notifier, the service),
`src/app/App.tsx` (mounts the banners next to the update banner).

Edge cases / failure modes:
- No Notifications API (iOS Safari outside an installed app, old browsers): the switch is disabled
  with a line saying this browser cannot show notifications and that installing may add them.
- The prompt dismissed (permission still `default`): stays off, no pointer (nothing is blocked).
- Denied: off, and the pointer stays while the browser says denied (re-read on focus).
- Stored on but the permission was withdrawn: shown off with the rows hidden; the stored switch is
  kept, so allowing again in the browser brings everything back as it was.
- A request that throws (old callback-only API) counts as unsupported.
- `showNotification` missing (no worker in development, a blocked worker) or failing: a banner.
- A notice for a reminder that already has a banner replaces it (one banner per reminder).
- Words are rendered when shown, so the language at show time is used.
- A failed write → the switch shows the stored value again and a toast says so.

Our design differences / decisions:
- Names and words are ours (notifier, banner, "Notifications", our footer and pointer sentences).
- No streak, weight, body-fat, app-update or launch reminders (D-16.41); no battery row (06 §5).
- The shown switch is "stored on and the browser allows it"; the stored value is not rewritten
  when the permission goes (the engine already stops on it, R06.10).
- A missed reminder is a banner, never a system notification (the person is looking at the app).
- Goal reached never becomes a banner: the in-app dialog (P05-14) is already on screen.
- A "none switched on" line while the master is on and every row is off (as Android).

Tests we will write:
- `notifier.test.ts`: a live notice with permission granted goes to `showNotification` with its
  words and tag; a missed one is a banner; permission default → banner (ACC-L5-1); no worker or
  a failing `showNotification` → banner; one banner per reminder and dismiss; goal reached
  notifies only with master, its switch and the grant, and never as a banner; the bus listener.
- `trackingSettings.test.ts`: turning on stores only after a grant (denied and dismissed leave it
  off; unsupported asks nothing); reminder switch and time writes keep the other half; recheck
  refreshes the engine only when the permission changed.
- `RemindersSection.test.tsx`: denied → switch off and the pointer (ACC-J11-1, R06.13); a grant
  turns it on and shows the rows; revoking on focus turns the shown switch off (R06.13); water row
  only while water is tracked; fasting row only while fasting is tracked; time edits store;
  unsupported disables the switch; the D-16.5 line.
- `ReminderBanners.test.tsx`: a banner per notice with Dismiss; a missed one says when it was due.

Compare checklist (filled after the rewrite; reopened `ProfileComponents.swift` 1100–1429 and
`SettingsScreen.kt` 540–650, 1120–1150, 2185–2365):
- [x] the master switch asks and turns on only on a grant; a refusal leaves it off
  (`RemindersSection.test.tsx > RemindersSection > turns on after a grant and lists the reminders,
  each off, with a line saying so (R06.13)`; `> leaves the switch off when the browser says no, and
  points to the browser's site settings (ACC-J11-1, R06.13)`; `trackingSettings.test.ts > the
  notifications switch (R06.13) > asks the browser and stores the switch on after a grant`,
  `> leaves the switch off when the browser answers %s`)
- [x] already granted: on at once (the browser answers a granted request without a prompt;
  `fakeNotifications` does the same) (`trackingSettings.test.ts > the notifications switch (R06.13)
  > asks the browser and stores the switch on after a grant`)
- [x] the request is made inside the press (`trackingSettings.test.ts > the notifications switch
  (R06.13) > asks before anything is awaited, so the request stays inside the press`)
- [x] the pointer to settings while the browser says denied, with the status re-read when the page
  shows (`RemindersSection.test.tsx > RemindersSection > shows the pointer while the browser
  already blocks notifications`; `> shows the switch off when the permission was taken back while
  away, and on again once it is back (R06.13)`)
- [x] off cancels what is armed: the stored switch goes off and the engine's watch disarms
  (`RemindersSection.test.tsx > RemindersSection > stores the switch off and hides the reminders`;
  the cancel itself: `ports.test.ts > the engine over the stored data > cancels the timer when the
  master switch is turned off in the store (R06.10)`)
- [x] the rows only while the master is on; water only while water is tracked; the fasting goal
  only while fasting is tracked (`RemindersSection.test.tsx > RemindersSection > shows the water
  reminder only while water is tracked`; `> shows the fasting goal only while fasting is tracked`)
- [x] a time per reminder, shown while its switch is on (`RemindersSection.test.tsx >
  RemindersSection > switches a reminder on, shows its time, and stores a new time`;
  `trackingSettings.test.ts > the reminders > changes a reminder's switch or its time and keeps
  the other`)
- [x] the fasting row's line says it notifies once and the fast keeps running (our hint, and the
  notice's own words from P09-08)
- [x] the goal alerts row (`RemindersSection.test.tsx > RemindersSection > switches the
  goal-weight alert, the same setting as on the Goals page`) and its notification
  (`notifier.test.ts > createNotifier: the goal-weight alert (P05-14) > notifies with the master
  switch and its own switch on and the permission granted`; `> stays quiet when %s, and never
  becomes a banner`; `> hears this tab's goal-reached messages on the bus until stopped`)
- [x] a line when every type is off (`RemindersSection.test.tsx > RemindersSection > turns on after
  a grant and lists the reminders, each off, with a line saying so (R06.13)`)
- [x] system notification when allowed, else a banner; missed ones a banner (`notifier.test.ts >
  createNotifier: reminders > shows a reminder due while the page runs as a system notification,
  with its words and tag`; `> shows a reminder missed while the app was closed as a banner, never
  as a system notification (D-16.5)`; `> uses the banner when the permission is %s (ACC-L5-1)`;
  `> uses the banner without a running worker`; `> uses the banner when the browser refuses to
  show it, and reports why`; `> the engine and the notifier together, as main.tsx joins them > *`;
  `ReminderBanners.test.tsx > ReminderBanners > shows a missed lunch with when it was due, and
  takes it away on Dismiss (ACC-L5-1)`)
- Deliberate differences: a web page cannot open the browser's settings, so the pointer is a line
  of text; the shown switch is "stored on and allowed" and the stored value is kept when the
  permission goes (the reference has no outside revocation to handle on Android and re-reads the
  status on iOS); every reminder starts off when the master goes on (D-16.61; iOS defaults the meal
  reminders on); the goal-weight alert also shows on Settings › Goals (P05-11) and both write the
  same setting; a reminder the browser cannot show becomes a banner; a missed one is a banner.
- Not taken: streak, weight and body-fat reminders, app updates, the launch reminder and the
  battery row (D-16.41, 06 §5); the rows' icons.

## Decisions for the lead

- **The stored switch outlives a withdrawn permission.** It shows off (and the rows hide) while
  the browser does not allow notifications; allowing them again brings the stored choice back
  without a tap. The engine already stops on the permission (R06.10). Easy to change: clear
  `remind.master` in `recheck()` when the permission goes.
- **No notifications API (iOS Safari outside an installed app):** the switch is disabled with a
  line saying so; reminders do not run there. A banners-only mode would be `permitted: () =>
  state !== 'denied'` plus letting the switch on for `unsupported`; not taken, since the row says
  the switch turns on only on a grant.
- **Banners live in the shell** (`src/app/ReminderBanners.tsx`, mounted in `App.tsx` after the
  install card; shared, one line): one per reminder, Dismiss only, not kept across reloads.
- **A tap on a system notification** does nothing yet: the worker (`src/sw/sw.ts`, P09-17) has no
  `notificationclick` handler. Follow-up for that file's owner: focus an open window or open the
  start URL. Not done here (not this slice's file).
- **Onboarding** still asks for permission through its own `askNotifications` in
  `OnboardingRoute.tsx` (P05); it could use `browserNotifications().request()` later (not this
  slice's file).
- **Ledger** (for `docs/internals/`): R06.13, ACC-J11-1 and ACC-L5-1 can switch from `Review:` to
  the tests named above.

## Status

Done (2026-10-27). `notifier.ts` (21 tests), `trackingSettings.ts` (with P09-03, 12 tests),
`RemindersSection.tsx` (14 tests), `ReminderBanners.tsx` (3 tests), the card in its place on
`TrackingPage.tsx`, words in `src/i18n/en/reminders.ts`. Shared, additive: `src/services/context.tsx`
(`notifier?`, `trackingSettings?`), `src/main.tsx` (the permission and the notifier replace the
engine's stubs; the notifier hears the app bus), `src/app/App.tsx` (mounts the banners).
