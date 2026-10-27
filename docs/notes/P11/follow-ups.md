# Task: P11 follow-ups (no task id) · Phase: 11 · Owner: builder (wt-p11s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): for the distance unit only, `A/ui/progress/ProgressScreen.kt` (which
setting decides metric or imperial distance: the height unit), behaviour only. Nothing else: the
three fixes are about our own build (the plugin contract, our activity card, our notification copy
inside the WebView). Also read: phase file P11 (Decisions, the plugin contract: a future-dated write
is refused with `invalidInput`), `docs/notes/P11/health-service.md` and `health-ui.md`,
`src/services/health/{records,service}.ts`, the native write checks in
`android/.../health/HealthWrites.kt` (a time after the phone's now is refused, and one bad record
fails the whole `writeNutrition` call), `src/features/home/ActivityCard.tsx`, the reminders card of
Settings › Tracking and the onboarding reminders step.

What it does (own words):
1. Write-back never sends a record dated after now. An entry logged for later today (or a weigh-in
   with a time still to come) is held back, not dropped: it stays "stored" for the pass, so its
   earlier copy in Health Connect (if any) is neither removed nor forgotten, and the ledger keeps
   what was last sent. The first pass after its time (start, return to the front, any change, a
   sync) sees it as new or changed and sends it. Without this, one such entry made every
   `writeNutrition` call fail until its time came, so nothing else was sent either.
2. Home's activity card shows the day's total calories burned ("2,390 kcal total", through the
   energy formatting, so kJ users read kJ) and its distance (km or mi) under steps and active
   calories, each only when Health Connect gave it. Total burn is shown, never added (D-16.89).
   Distance follows the person's height unit, the app's only length setting: cm → km, ft/in → mi.
3. Inside the Android app the WebView has no Notification API, so reminders cannot work there.
   The reminders card and the onboarding step no longer suggest adding Platewise to the home
   screen; they say reminders are not available in the Android app yet. The web keeps its copy.

Inputs → outputs:
- `writeBackPlan({entries, weighIns, ledger, window, now})` → the plan, with entries and typed
  weigh-ins whose time is after `now` left out of `nutrition`, `weights` and `sent`, and kept out
  of `removeNutrition`, `removeWeights` and `forget`. `service.ts` passes `clock.now()`.
- `ActivityCard({day, energyUnit, lengthUnit})` → the extra figures; `HomePage` reads
  `units.height` and passes it as `lengthUnit`.
- `RemindersSection`, `Reminders` (onboarding) → the Android line when `isHealthAvailable()`.

Files: `src/services/health/records.ts` (+ test), `src/services/health/service.ts` (+ test),
`src/services/health/testing/fakeHealthPlugin.ts` (refuses a future time, like the native side,
when the test gives it a clock), `src/features/home/ActivityCard.tsx` (+ test),
`src/features/home/activity.module.css`, `src/features/home/HomePage.tsx` (+ test, shared: one
setting read and one prop), `src/features/settings/tracking/RemindersSection.tsx` (+ test),
`src/features/onboarding/steps/Reminders.tsx` (+ test), `src/i18n/en/{health,reminders,onboarding}.ts`.

Edge cases / failure modes:
- An entry exactly at now is sent (the plugin refuses only times after its now, which is never
  earlier than ours).
- An entry sent before and then moved to a later time today: its old copy stays in Health Connect
  until the new time comes; then the edit replaces it under the same client id.
- A future entry is not removed and not forgotten, whatever the ledger holds for it.
- An imported weigh-in in the future: never sent anyway.
- Total calories present but nothing else: the card shows the total (it is data), not the empty
  line. Distance 0 is shown ("0.0 km"); null is not.
- kJ: the total in kJ. Distance: one decimal, the locale's marks.
- Android detection fails (no bridge): the web copy, as before.

Our design differences / decisions:
- Deferral is in the pure plan (it takes `now`), so no timer is set: the existing triggers bring
  the record over once its time has passed.
- Distance unit from `units.height` (the app's only length setting), not the weight unit.
- On Android the reminders card also leaves out its "when reminders can show" note: it describes
  reminders that cannot happen there and contradicts the new line.

Tests we will write:
- `records.test.ts`: an entry later today and a future weigh-in are left out, others sent; after
  the clock passes, the entry is sent; a future record already in the ledger is neither removed
  nor forgotten.
- `service.test.ts`: with the fake refusing future times, an entry for later today does not fail
  the call, the others are sent; after the clock moves past it, the next pass sends it.
- `ActivityCard.test.tsx`: total and distance (km and mi, kJ), absent when null, a row with only
  the total is not empty.
- `HomePage.test.tsx`: the synced day's total and distance on the card, in the person's length
  unit.
- `RemindersSection.test.tsx`, `Reminders.test.tsx`: the Android line inside the Android app, the
  web line in a browser.

Compare checklist (filled after the rewrite; reopened `A/ui/progress/ProgressScreen.kt` (the
distance unit choice) and `A/ui/workouts/ImportedHealthWorkoutViews.kt` (how a distance is
written)):
- [x] an entry for later today is not sent while the others are, and is sent once its time has
      passed; a weigh-in likewise (`records.test.ts > writeBackPlan > holds back an entry and a
      weigh-in dated later today, and sends them once their time has passed`; `service.test.ts >
      write-back (D-16.89) > holds back an entry logged for later today, sends the others, and
      sends it once its time has passed`, with the fake refusing future times as the plugin does)
- [x] deferred, not forgotten: a record sent before whose new time is still to come is neither
      removed nor forgotten (`records.test.ts > writeBackPlan > neither removes nor forgets a
      record sent before whose new time is still to come`)
- [x] total calories and distance under steps and active calories, only when present, kJ and
      km / mi (`ActivityCard.test.tsx > ActivityCard (P11-04) > shows the total burn and the
      distance under steps and active calories, in km beside cm`, `> writes the distance in miles
      for a person who reads feet and inches`, `> writes energy in kJ for a kJ user, steps as
      counts`, `> leaves out the total and the distance when Health Connect gave none`, `> shows a
      day that has only a total burn or only a distance, not the empty line`; `distanceUnitOf >
      follows the length unit: km beside cm, miles beside feet and inches`)
- [x] on Home, the total is shown and not counted; the distance follows the stored length unit
      (`HomePage.test.tsx > HomePage: Health Connect on the Android app (P11-04) > counts the
      day's active calories in the gauge, says goal + burned, and shows the activity card
      (ACC-M11-2)`, `> writes the day's distance in km for a person who reads centimetres`)
- [x] the Android reminders copy in both places, the web copy unchanged
      (`RemindersSection.test.tsx > RemindersSection > says reminders are not available in the
      Android app, where the home screen cannot help (P11)`, `> cannot be switched on where the
      browser has no notifications, and says so`; `Reminders.test.tsx > Reminders > says
      reminders are not available in the Android app, where the home screen cannot help (P11)`,
      `> keeps reminders off when the browser has no notifications`)
- Deliberate differences: the reference picks metric distance from the height unit too; it drops
  a trailing zero ("7 km"), ours always writes one decimal ("7.0 km"), as weights do here. It
  shows distance per imported workout; ours is the day's total on the activity card.
- Not taken: per-workout distance (the contract's sessions carry none).

## Status

Done (2026-10-27). The three follow-ups are finished. Lines changed outside the health and card
files: `src/features/home/HomePage.tsx` (reads `units.height`, passes it to the card) and its
test, `src/features/settings/tracking/RemindersSection.tsx`, `src/features/onboarding/steps/
Reminders.tsx` and their tests, `src/i18n/en/{reminders,onboarding}.ts` (one line each).
Handed on to the lead: the user page (the card's total and distance, reminders on Android) and
the CHANGELOG.
