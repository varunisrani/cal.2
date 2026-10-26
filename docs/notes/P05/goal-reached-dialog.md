# Task: goal-reached dialog (P05-14) · Phase: 05 · Owner: builder (wt-p05s3a, slice S3a)

Read (reference @ `10e14b67`): `A/ui/progress/ProgressViewModel.kt` (`addWeight`,
`dismissGoalReached`: the flag the Progress add path raises), `I/Stores/WeightStore.swift`
(`addEntry`, `crossesGoal`, the posted notification) and the `weightGoalReached` receiver in
`I/ContentView.swift`: behaviour only. Research spec `01-profile-goals.md` §3.13; trap R01.11
(the dialog side: every add path); decision D-16.13 ("Set a new goal" + Dismiss). Reference tests
`T/ui/progress/LogWeightDateTest.kt`, `IT/WeightHistoryTests.swift` cover the crossing rule,
which `src/domain/trackers/goalCrossing.ts` and `src/data/repos/weightRepo.ts` already own.

What it does (own words): when a new latest weigh-in carries the weight across the goal weight,
the weight repository posts `{type: 'goal-reached', kg}` on the bus after its write commits,
whichever screen added it (Progress, the Settings weight sheet, Coach). One dialog mounted in the
app frame listens and congratulates the person, naming the weight in their unit. "Set a new
goal" closes it and opens Settings › Personal info (`#/settings/profile`, where P05-10 puts the
goal and target rows); Dismiss (also Escape and the scrim) closes it. A second message while the
dialog is open changes nothing, so two in a row show one dialog. A system notification is P09-09.

Inputs → outputs: bus messages, heard through a new `useGoalReached(listener)` in
`src/data/hooks.ts` (the bus comes from the `DataProvider`, or the app bus when the sources name
none, as in `main.tsx`), and the `units.weight` setting → the dialog; `router.navigate`.

Files: created `src/features/goals/GoalReachedDialog.tsx`, `GoalReachedDialog.test.tsx`,
`src/i18n/en/goals.ts`; changed `src/data/hooks.ts` (+ `useGoalReached`), `hooks.test.tsx`,
`src/data/DataProvider.tsx` (optional `bus` in `DataSources`), `src/app/App.tsx` (mount),
`src/app/App.test.tsx` (mount test), `src/i18n/en.ts` (the `goals` line).

Edge cases / failure modes:
- Two messages in a row (or one per add path in quick succession): one dialog.
- A message while the weight unit setting is still loading or unreadable: the dialog shows
  without the weight rather than a guessed unit.
- `goal-reached` is posted to this tab only, so another open tab does not show the dialog.
- The dialog lives in the tab frame, so it is not mounted on the onboarding route (no weigh-ins
  can be added there).
- "Set a new goal" before P05-10 registers the page: the Settings screen sends an unknown page to
  the hub, which is fine until then.

Our design differences / decisions:
- "Set a new goal" opens the goal editor (D-16.13); the reference only dismisses (I's text tells
  the person to go to Settings).
- The weight that reached the goal is named, in the person's unit.
- One listener in the frame instead of a flag per screen, so every add path shows it (R01.11).
- Bus access through a data hook: screens never import `src/data/bus.ts`.

Tests we will write (`GoalReachedDialog.test.tsx`, `hooks.test.tsx`, `App.test.tsx`):
- logging 79.4 kg with a 79.5 kg lose target (previous 80) through the weight repository shows
  the dialog once; a later 79.3 shows nothing new (ACC-C11-1, R01.11).
- a bus message opens the dialog; Dismiss closes it.
- "Set a new goal" closes and navigates to `#/settings/profile`.
- two messages in a row show one dialog.
- the weight reads in lb for an lb reader.
- `useGoalReached` hears `goal-reached` only, stops on unmount, and uses the provider's bus.
- the App frame mounts the dialog over a tab screen.

Compare checklist (filled after the rewrite; reopened `ProgressViewModel.kt`, `WeightStore.swift`,
`ContentView.swift` receiver):
- [x] Fires from the store for every add path, on the transition only (tested in
  `GoalReachedDialog.test.tsx` > GoalReachedDialog > shows the dialog once when 79.4 kg crosses a
  79.5 kg lose target (ACC-C11-1, R01.11))
- [x] A congratulation dialog with a dismiss action (`GoalReachedDialog.test.tsx` >
  GoalReachedDialog > opens on a goal-reached message and closes with Dismiss)
- [x] D-16.13 "Set a new goal" (`GoalReachedDialog.test.tsx` > GoalReachedDialog > closes and
  opens Settings › Personal info with Set a new goal (D-16.13))
- [x] The weight named in the person's unit (`GoalReachedDialog.test.tsx` > GoalReachedDialog >
  names the weight in pounds for a pound reader; > shows no weight while the weight unit is not
  known yet)
- [x] Screens hear the bus through a data hook (`hooks.test.tsx` > useGoalReached > hears the
  weight repository when a new weigh-in reaches the goal, once (R01.11); > ignores other
  messages, calls the newest listener and stops on unmount)
- [x] Two messages show one dialog (`GoalReachedDialog.test.tsx` > GoalReachedDialog > shows one
  dialog for two messages in a row)
- [x] Mounted once in the frame (`App.test.tsx` > App > shows the goal-reached dialog over a tab
  screen when a weigh-in reaches the goal)
- Deliberate differences: "Set a new goal" (D-16.13); the weight named in the message; our own
  title and text.
- Not taken: the system notification and its two switches (P09-09); A's Progress-only flag.

## Status

Done (2026-10-26). Dialog, hook, provider field, App mount and tests. The lead adds `goals` to
`src/i18n/en.ts` at landing (done in this worktree: the import and the entry).
