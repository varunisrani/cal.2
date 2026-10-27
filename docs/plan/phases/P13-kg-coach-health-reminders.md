# P13 · kg only, Coach with Health Connect, reminders as notifications

**Weeks:** 1 · **Tracks:** domain/units; Coach; reminders and native notifications; Coach chat UI · **Depends on:** P00–P12 · **Status:** 🔨 in progress: S2 Coach × Health Connect landed (2026-10-28)

## Goal

The owner asked (2026-10-28) for four changes, to ship in 1.1.0 with the orange redesign (P12):

1. **kg only.** Weight is shown and entered in kilograms everywhere; the lb choice goes. A person who chose lb sees their weights in kg (weights are already stored in kg, so no number changes; only the setting and every display and input).
2. **Coach chat that is easy to use.** A message list that scrolls on its own, stays at the newest message as replies arrive (unless the person has scrolled up, then a "jump to latest" button), a composer that stays at the bottom above the keyboard and the tab bar, a text box that grows with the text, clear bubbles, copy a reply.
3. **Coach sees Health Connect.** In the Android app, with Health Connect connected, the Coach can read steps, active and total calories, distance and workouts per day (a new read tool) and knows today's activity and whether "goal + burned" counting is on (its context and prompt say so).
4. **Reminders the person makes, shown as Android notifications.** Besides the five daily reminders and the fasting goal, the person can create their own reminders (text, time, which days or once on a date) by hand in Settings and by asking the Coach (the Coach proposes, the person taps Add). In the Android app every reminder is a real Android notification scheduled with the system (it fires with the app closed), after asking for the notification permission; the web keeps its browser notifications while open.

## Decisions

- **D-16.91** Weight is kg only (owner, 2026-10-28): `units.weight` keeps only `kg`; a stored `lb` reads as `kg`; first-run defaults are kg for every locale; the wizard, Settings, weigh-ins, goals and pace (kg per week), Progress, exports and the Coach use kg. Height (cm or ft-in) and energy (kcal or kJ) stay as they are. Imports that carry pounds are converted on the way in.
- **D-16.92** Native notifications in the Android app (replaces D-16.5 there): `@capacitor/local-notifications` 7.x schedules every enabled reminder with the system (daily repeats at wall-clock time, the fasting goal once); Android 13+ asks POST_NOTIFICATIONS when the person turns reminders on; inexact alarms (`allowWhileIdle`) are enough, no exact-alarm permission. Tapping a notification opens the app on the screen the reminder is about.
- **D-16.93** Custom reminders: up to 20, each with text (1–80 characters), a time, and either a set of weekdays (daily = all seven) or one date; stored on the device, not in backups' shared settings unless the person restores on the same device (they travel in backups like other settings). The Coach can propose one through a `propose_reminder` tool; it is added only when the person taps Add on the card in the chat.
- **D-16.94** The Coach reads Health Connect activity in the Android app through an `activity_log` tool (day range, at most 90 days) and gets today's activity and the counting switch in its context; on the web the tool and the context lines are absent.

## Slices and waves

- **Wave A (parallel with P12's design builder):** S1 = kg only (`src/domain/units/**`, settings schema and its migration, wizard and Settings units UI, weigh-in and goal inputs, exports/imports, tests) · S2 = Coach × Health Connect (`src/services/coach/**`, prompts, the coach's context, tests) · S3 = reminders as notifications and custom reminders (`src/services/reminders/**`, a native notifications port with `@capacitor/local-notifications`, the custom reminders store and Settings UI, Android permission and manifest, tests).
- **Wave B (after P12, S2 and S3 land):** S4 = the Coach chat UI and the `propose_reminder` tool with its Add card.
- **Then:** P12-05 releases 1.1.0 with all of it, and the APK.
