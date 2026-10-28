# P17 · Smart notifications: nudges Platewise works out, event notices, and the Coach's own

**Weeks:** 1 · **Tracks:** notifications (rules, scheduling, settings); Coach (reminders it sets, check-ins, reply
ready) · **Depends on:** P00–P16 (S2 after P16's Coach chats) · **Status:** ✅ done: P17-01..04 landed (2026-10-28); device tests are the owner's · **Ships as:** 1.5.0

## Goal

The owner asked (2026-10-28) for notifications beyond the reminders a person sets: every reminder arrives as a
notification and waits in the shade; Platewise itself sends nudges and event notices "when required"; and the Coach
creates reminders and notifications by itself. Today (P13, D-16.92/93) the Android app schedules the reminders the person
turns on (meals, water, the summary, the fasting goal, their own reminders) and the Coach only proposes a reminder that is
added when the person taps Add. Nothing reacts to what happens in the app.

Platewise has no server and its data lives in the WebView, so nothing runs while the app is closed. Two kinds of
notification work within that: **planned** ones handed to Android ahead of time and re-planned after every change in the
app (a nudge that is no longer needed is taken back before it comes), and **event** ones posted at once when something
happens while the app is open or just left.

## Decisions

- **D-16.100 Planned nudges (Android app).** Platewise works these out and hands them to Android with the reminders,
  re-planning after every diary, water, weight or settings change, so each comes only when it is still true:
  - **Meal check:** for breakfast, lunch and dinner, if that meal is not logged by about an hour after the person's
    usual time for it (the median of the last 14 days' logs of that meal, at least 5 of them; without enough history,
    the meal reminder time from Settings), "Nothing logged for lunch yet". Today's is taken back once the meal is logged.
    Days ahead are planned like the summary (7 days).
  - **Water pace:** with water tracking on, at 13:00, 16:00 and 19:00 if the day's water is behind an even pace toward
    the goal over 08:00–21:00.
  - **Empty day:** at 20:30 if nothing at all is logged for the day.
  - **Weigh-in:** at 08:30 when the newest weigh-in is 7 or more days old (once, then every 7 days).
  - A meal reminder the person turned on gains **Only if I haven't logged it** (default on): the same taking back.
- **D-16.101 Event notices (Android app).** Posted at once, each at most once a day (the weekly one once a week), each
  with a tap target:
  - **Sugar limit passed** (D-16.98's limit), **calories passed** (the day's target, goal + burned, by 10 %),
    **protein goal reached**, **150 active minutes this week** (walks and Health Connect walking, D-16.96),
    **fasting goal reached** (as today).
  - **A meal is ready to review** when a photo analysis finishes while the app is in the background.
  - **A backup failed** (automatic or Google Drive) twice in a row.
  - (D-16.102) **The Coach replied** while the app is in the background or another screen or chat is open; a tap opens
    that chat.
- **Rules for everything Platewise sends by itself:** Settings › Tracking & reminders gets a **Smart notifications**
  section: one switch per kind (all on by default), and **Quiet hours** 22:00–07:00 (on by default; nudges and notices
  wait or are dropped then; reminders the person set always come). They need Android's notification permission: in the
  Android app, Home shows a one-time card ("Let Platewise nudge you": Turn on / Not now) while it is not granted, and
  turning a switch on asks for it. Every notification stays in the shade until it is opened or swiped away. Each kind
  has its own Android channel so Android's settings can mute one. The web app is unchanged (D-16.5).
- **D-16.102 The Coach's own notifications.**
  - **Let the Coach set reminders** (Settings, default on): the Coach's reminder tool adds the reminder at once and the
    chat shows it as set, with Undo and Edit; off, the Coach proposes as today (Add).
  - **Check-ins:** a new Coach tool schedules a one-time follow-up (a time within 14 days and a short message, at most 3
    waiting); it comes as a notification that opens the chat it came from, with the message there as the Coach's. They
    are listed in Settings › Tracking & reminders with Delete.
  - **The Coach replied** (above).
  - The Coach is told in its instructions when to use them (a plan the person agreed to, a habit they want to build) and
    never to set more than the person asked for.

- **D-16.103 Notification panel (Android app; the owner asked the same evening).** Every notice Platewise posts and every
  notification that came from the plan (the person's reminders, the summary, the fasting goal, nudges) is kept in an
  in-app inbox, newest first, up to 100 items or 30 days, as device state (out of backups). Planned notifications fire
  while the app may be closed, so on start and on return the app adds every one from the last handed-over plan whose
  time has passed. Home's header has a bell with the unread count; the panel lists the items by Today / Yesterday /
  Earlier with an icon by kind, title, text and time; a tap opens the item's target and marks it read (as does tapping
  the system notification); Mark all as read, delete one, Clear all (asks first), a link to Smart notifications.

## Contracts

```ts
type NoticeKind =
  | 'mealCheck' | 'waterPace' | 'emptyDay' | 'weighIn'                        // planned (D-16.100)
  | 'sugarOver' | 'caloriesOver' | 'proteinReached' | 'activeWeek' | 'fastGoal'
  | 'analysisReady' | 'backupFailed' | 'coachReplied' | 'coachCheckIn';      // events and the Coach
type OpenTarget = 'home' | 'fast' | 'water' | 'weight' | 'review' | 'data' | { coachChat: string };
interface Notice { kind: NoticeKind; title: string; body: string; open: OpenTarget; onceKey: string }
interface Notices {
  // Posts at once when the kind is on, notifications are allowed, it is not quiet hours (else drops it) and onceKey
  // has not been posted; records onceKey (device state, out of backups).
  post(notice: Notice): Promise<'posted' | 'off' | 'notAllowed' | 'quiet' | 'already'>;
}
```

## Slices

- **S1 nudges, notices and the panel** (P17-01, P17-02, P17-04), wave 23, now: the planner (D-16.100), the `Notices` service and the
  events that do not need the Coach (sugar, calories, protein, active week, fasting, analysis ready, backup failed), the
  Smart notifications settings, quiet hours, channels, the Home card, the notification panel (D-16.103), docs.
- **S2 the Coach** (P17-03), after P16's chats land: Let the Coach set reminders, check-ins, the Coach replied.

## Tasks (4)

| ID | Task | Verify |
|---|---|---|
| P17-01 | **Planned nudges.** Usual meal times from the diary (pure, tested), the meal check, water pace, empty day and weigh-in nudges in the native plan (7 days ahead, taken back when no longer true), Only if I haven't logged it on meal reminders, quiet hours, per-kind channels. | unit tests on the pure planner: a logged meal takes today's back, history decides the time, water pace, empty day, weigh-in age, quiet hours, ids never collide with reminders. |
| P17-02 | **Event notices and settings.** The `Notices` service (once a day, quiet hours, permission, switches), the event hooks (sugar, calories, protein, active week, fasting, analysis ready in the background, backup failed twice), Settings › Smart notifications, the Home permission card, tap targets. Docs: `docs/user/android.md` (Notifications). | unit tests: each event posts once a day, nothing during quiet hours, nothing when off or not allowed, the card shows once; the web shows nothing new. |
| P17-03 | **The Coach's notifications.** Let the Coach set reminders (direct add with Undo/Edit), the check-in tool (≤ 3 waiting, ≤ 14 days, opens its chat), the Coach replied notice, the prompt lines; Settings lists check-ins. | unit tests for the tool, the setting, the notice and its tap target; the engine tests for a check-in round. |
| P17-04 | **Notification panel.** The inbox (device state, 100 items / 30 days), reconciling planned notifications that came while the app was closed, the bell with the unread count on Home, the panel (groups, open target, mark read, mark all read, delete, Clear all), the system notification's tap marking its item read. | unit tests: cap and age, reconcile without duplicates, unread count, open target, mark all read, clear, the bell; screenshots. |
