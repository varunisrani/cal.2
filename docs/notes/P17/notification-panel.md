# Task: Notification panel (P17-04, D-16.103) · Phase: 17 · Owner: builder (wt-p17s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The reference has no in-app list of notifications; the panel
is ours (D-16.103, the owner's request). Also read: the lead's addition (2026-10-28), phase file
P17 (D-16.103), `src/ui/{Sheet,SwipeRow,Dialog,Card,Button}.tsx`, `src/ui/icons`,
`src/features/home/HomePage.tsx` and `home.module.css`, `src/app/{router,App,Screen}.tsx`,
the plugin's tap and "received" events.

What it does (own words): in the Android app every notice Platewise posts and every notification
that came from the plan (reminders, the summary, the fasting goal, nudges) is kept in a list on the
device, newest first, up to 100 items and 30 days. Planned notifications fire while the app may be
closed, so when the app starts, comes back to the front, hands a new plan over, or hears Android
show one, it adds every notification of the last plan whose time has passed. Home's header gets a
bell with the unread count. The bell opens the panel, a tall sheet over Home: the items grouped by
Today, Yesterday and Earlier, each with an icon by kind, its title, text and time, and an unread
mark; a tap opens what it is about and marks it read; Mark all as read; each item can be deleted
(its button, or a swipe); Clear all asks first; a link to the Smart notifications settings; an
empty state. Opening the panel does not mark anything read. Tapping the system notification marks
its item read too.

Inputs → outputs:
- `src/services/notifications/inbox.ts` (pure): `readInbox(stored)`, `addItems`, `reconcile(state,
  now)` (the passed occurrences of the stored plan, one-shots and repeating ones, each once),
  `withPlan(state, plan, now)`, `markRead`, `markAllRead`, `markTapped(id)`, `removeItem`,
  `clearAll`, `unreadCount`, `groupByDay`; caps (100, 30 days).
- An inbox store over the `notify.inbox` setting (device state, out of backups and their hash),
  written in one settings transaction per change; nothing written when nothing changed.
- `NotifyService` (contract): `subscribe`/`getSnapshot` (items, unread, the card's state),
  `markRead`, `markAllRead`, `remove`, `clear`, `open(item)`.
- UI: `NotifyHeader` (static, tiny) → lazy `HomeNotifyParts` (bell, card, panel),
  `NotificationPanel.tsx`.

Files: `src/services/notifications/{inbox,service}.ts`, `src/features/notifications/**`, tests.

Edge cases / failure modes:
- The same occurrence reconciled twice (start and return at once): each item has a ref (`id@at`),
  added once; the plan's "since" never moves back.
- An item the person deleted never comes back: an occurrence is added only after the last
  reconcile time.
- A plan item newly handed over counts only from then (a daily reminder turned on at 15:00 for
  14:00 does not add today's 14:00).
- A daily repeating notification and the app closed for 40 days: at most 30 days of it, at most
  100 items in all.
- A tap from a closed app: the start's reconcile adds the item first, then the tap marks it.
- Erase everything: the setting goes with the database.
- A damaged stored inbox reads as empty, item by item.

Our design differences / decisions:
- The panel is a tall sheet over Home (the router has no non-tab page besides the walk; a sheet
  keeps Back closing it and needs no router change).
- Delete: the item's own button (keyboard and screen readers) plus the codebase's SwipeRow swipe.
- The bell and its badge are drawn in the lazy chunk; Home's own header line is wrapped once.

Tests we will write:
- `inbox.test.ts`: cap and age; reconcile one-shots and daily/weekly ones without duplicates; only
  after "since"; a deleted item stays deleted; unread count; mark all read; tapped marks the newest
  of its id; clear; grouping by day.
- `service.test.ts`: the store writes once per change, nothing when unchanged; the snapshot.
- `NotificationPanel.test.tsx`: groups, icons, a tap opens the target and marks read, Mark all as
  read, delete, Clear all asks, the settings link, the empty state, opening marks nothing.
- `HomeNotifyParts.test.tsx`: the bell's name with the unread count, opens the panel; nothing on
  the web.

Compare checklist (filled after the rewrite; no reference to reopen):
- [x] Cap and age (`inbox.test.ts > the inbox: keeping notices (P17-04, D-16.103) > keeps the newest
  first, at most 100 and 30 days`)
- [x] Reconcile without duplicates (`inbox.test.ts > the inbox: what came from the plan while the app
  was closed (P17-04) > *`; `setup.test.ts > the Android app’s notifications together (P17) > adds
  what came while the app was away when it comes back, and a tap opens it and marks it read`)
- [x] Unread count, mark all read, delete, clear (`inbox.test.ts > the inbox: keeping notices … >
  counts the unread, marks one or all read, deletes one and clears`; `service.test.ts`)
- [x] The tap on the system notification marks its item read (`inbox.test.ts > … > marks the newest
  item of a tapped notification read`; `setup.test.ts` as above)
- [x] The bell and its badge (`HomeNotifyParts.test.tsx > Home in the Android app: the bell (P17-04,
  D-16.103) > *`)
- [x] The panel (`NotificationPanel.test.tsx > the notification panel (P17-04, D-16.103) > *`;
  `groups.test.ts`)
- Deliberate differences: none (no reference counterpart).

## Decisions for the lead

- **A tall sheet, not a route**: the panel is a sheet on Home's stack (`notifications`), at least
  60 % of the screen high; Back closes it and no router or App change was needed. Its items' taps
  navigate through the router, which closes the sheet.
- **Delete**: SwipeRow (swipe, plus its own Delete button for keyboard and screen readers).
- **Store**: the `notify.inbox` setting, an opaque record read item by item in the lazy code
  (`services/notifications/inbox.ts`), out of backups and their hash (`LOCAL_SETTINGS`). It also
  keeps the last plan handed over (with each item's "since") and the last look's time.
- **Reconciling**: at every plan handed over (start, return to the front, every change), when
  Android reports a notification shown while the app runs (`localNotificationReceived`), and before
  a tap marks its item. Nothing is written when nothing changed.
- **Taps** carry only the notification id (the plugin reports it); the newest item of that id is
  marked read (ids are per day for every one-shot, so that is the one tapped).
- **The bell's name** is "Notifications" with nothing unread, else "Notifications, N unread"; the
  badge shows 99+ above 99.
- **Bundle**: the Home parts are one lazy chunk (`HomeNotifyParts`), fetched only when the notify
  service exists (the Android app); the P17 service code is fetched by the native reminders' chunk.

## Status

Done (2026-10-28). Screenshots in the report. Not run on a device.
