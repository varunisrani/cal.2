# Task: Settings, personal info page (P05-10) · Phase: 05 · Owner: builder (wt-p05s4a, slice S4a)

Read (reference @ `10e14b67`): `A/ui/settings/SettingsScreen.kt` lines 810–945 (the goal, activity,
pace and goal-weight rows, which the reference keeps with the targets) and 3155–3290 (the sheets:
sex, height, weight, body fat, goal body fat, activity, goal, goal weight, pace), plus the weight
save and unit setters in `A/ui/settings/SettingsViewModel.kt` and the personal-info rows just
above line 810 for the row list; `I/Views/ProfileComponents.swift` lines 75–480 (height, weight,
body-fat and goal body-fat sheets) and 618–670 (pace list); the add/remove part of
`A/ui/settings/AllergenSensitivitiesScreen.kt`: behaviour only. Research spec
`01-profile-goals.md` §3.9 (fields and validation, the nudge signature, units); trap R01.12;
acceptance ACC-B12-1, ACC-B12-2; decisions D-16.11 (target on the right side), D-16.37 and
Proposed D-16.56 (20–250 kg / 50–500 lb, body fat 3–60 % in 0.5 steps), D-16.80 (the target check
compares the weights as shown). No reference tests cover these screens.

What it does (own words): Settings › Personal info lists the person's body data and goal as rows
that each show the stored value in the person's units and open an editor: sex (list), birthday
(the browser's date input, never after today, shown as the date and the age), height (cm wheel or
feet + inches wheels with a unit toggle that stores the height unit at once and keeps the value),
weight (whole + tenths wheels with a unit toggle that stores the weight unit; Save adds one
weigh-in stamped now through the weight repository, which moves the profile weight and posts
goal-reached), body fat (3–60 % in half steps, Save or Remove; removing also drops the goal),
goal body fat (only while body fat is set; Save or Remove), activity (six levels with a line
each), goal (lose / maintain / gain), weekly pace (Slow / Steady / Fast with the amount a week,
only for lose and gain), goal weight (only for lose and gain; a target on the wrong side is
refused with the reason and nothing is stored) and allergen sensitivities (a free list: add a
name, remove one). No edit touches the saved targets or the locks (R01.12): an edit to a plan
input only makes the rebuild nudge on the Goals page (P05-11) appear. A short line on the page
says so.

Inputs → outputs: `useProfile()` and `useSettings(['units.weight', 'units.height'])` → rows;
editors call `services.profileEdits` → `profileRepo.update` (one transaction per edit),
`weightRepo.addWeighIn`, `settingsRepo.set` for the two units, and the rebuild baseline seed.

Files: created `src/services/profileEdits.ts` (+ test), `src/features/settings/profile/`
(`ProfilePage`, `WeightSheet`, `HeightSheet`, `BodyFatSheet`, `BirthdaySheet`, `AllergensSheet`,
`values`, `useProfileEdits`, `profile.module.css`, `testing/openProfile`, tests),
`src/i18n/en/profile.ts`; changed (additive) `src/services/context.tsx` (`profileEdits?`),
`src/main.tsx`, `src/i18n/en.ts` (`profile` line), `src/features/settings/registry.ts` (the
`profile` record).

Edge cases / failure modes:
- Profile missing (before onboarding) or unreadable: the page says it cannot show the details and
  offers no editors; a write that fails shows a toast and keeps the sheet open.
- A unit switch inside a sheet keeps the entered value; a value the new wheel cannot show is held
  to that wheel's end (D-16.80 rule, as in the wizard).
- Saving a wheel nobody moved stores the exact stored value, never the wheel's rounded one (an lb
  reader's 70 kg stays 70 kg; a 18.3 % reading stays 18.3 %).
- Goal weight: compared as the person reads it (tenths in their unit), so a target that reads the
  same as the current weight is refused; with maintain the row is hidden and the service stores
  nothing.
- Weight save: a goal weight the new weight contradicts (lose and goal ≥ new, gain and goal ≤ new)
  is dropped after the weigh-in, so reaching a lose target clears it (the goal-reached dialog then
  sends the person here to set a new one).
- Goal change: maintain drops pace and goal weight; lose/gain keep a pace or start at Steady and
  drop a target on the wrong side (`withGoal`).
- Allergens: names are trimmed and inner runs of spaces collapsed; an empty name or one already
  in the list (any case) is not added; removing takes that exact entry out.
- Birthday: a date after today is held to today by the input; the age counts on today.
- The rebuild nudge needs a baseline: when none is stored yet (the Goals page was never opened),
  an edit first stores the key of the profile as it was before the edit, so the change still
  raises the nudge instead of being taken in silently by the Goals page's first-open seed.

Our design differences / decisions:
- Goal, activity, pace and goal weight live on Personal info (the phase plan); the reference keeps
  them with the targets.
- Sheets are history entries (`useSheet`), so Back closes them first.
- The goal-weight refusal is a line inside the sheet (role alert) rather than a separate alert
  box, so the person can move the wheel and try again; the service is the one that refuses.
- The weight sheet's unit toggle stores the weight unit at once, like the height sheet's.
- Body-fat edits here change the profile only; readings are Progress's (P07-13), as in the
  reference.
- Allergen removal needs no confirmation (a name is quick to add again).
- The reference's allergen import from a photographed lab report (an AI call) is not taken.
- Baseline seed on edit (above), recorded for the lead.

Tests we will write:
- `profileEdits.test.ts`: a weight save adds one weigh-in at now, moves the profile weight and
  posts goal-reached when it crosses (ACC-B12-1); it drops a contradicted goal weight; a wrong-side
  goal weight is refused with the problem and nothing is written, compared as shown (ACC-B12-2,
  D-16.80); every edit leaves the saved targets and locks as they were and an input edit raises
  the nudge, seeding a missing baseline from before the edit (R01.12); maintain drops pace and
  target; body fat removal drops the goal; goal body fat needs body fat; allergens add (trimmed,
  no duplicates) and remove; units are stored.
- `ProfilePage.test.tsx`: rows show the stored values in the person's units; switching the goal to
  maintain hides pace and goal weight; editing activity leaves targets unchanged and raises the
  nudge (R01.12); body fat Remove hides goal body fat; a wrong-side goal weight shows the reason
  and saves nothing (ACC-B12-2); the page is registered as `#/settings/profile`.
- `WeightSheet.test.tsx`: saving adds one weigh-in and changes the profile weight (ACC-B12-1);
  the unit toggle stores lb and keeps the value; an unmoved save keeps the exact kg.
- `HeightSheet.test.tsx`: the toggle stores ft-in and shows 170 cm as 5 ft 7 in; saving a pick.
- `AllergensSheet.test.tsx`: add, refuse a duplicate, remove.

Compare checklist (filled after the rewrite; reopened `SettingsScreen.kt` 700–945, 3155–3290,
3750–3800, 4022–4090, `SettingsViewModel.kt` `saveCurrentWeight` / unit setters,
`ProfileComponents.swift` 75–480 and 618–670, `AllergenSensitivitiesScreen.kt` 88–140):
- [x] Weight Save adds one weigh-in at now; the profile weight follows it (tested in
  `WeightSheet.test.tsx` > WeightSheet: the current weight > adds one weigh-in for now and changes
  the profile weight (ACC-B12-1); `profileEdits.test.ts` > saveWeight > adds one weigh-in stamped
  now and moves the profile weight to it (ACC-B12-1))
- [x] Goal-reached comes from the weight repository on that path (`profileEdits.test.ts` >
  saveWeight > posts goal-reached through the weight repository when the weigh-in crosses the
  goal (R01.11))
- [x] A goal weight the new weight contradicts is dropped, decided on the new weight
  (`profileEdits.test.ts` > saveWeight > drops a goal weight the new weight contradicts and keeps
  one it does not)
- [x] Wrong-side goal weight: explained, nothing stored (`WeightSheet.test.tsx` > WeightSheet: the
  goal weight (D-16.11) > shows why a lose goal above the current weight is refused and saves
  nothing (ACC-B12-2); > refuses a gain goal that reads the same as the current weight, in pounds;
  `profileEdits.test.ts` > setGoalWeight (D-16.11, D-16.80) > refuses a lose target that is not
  below the current weight and stores nothing (ACC-B12-2); > compares the weights as the person
  reads them, to the tenth in their unit)
- [x] Goal-weight sheet opens on the goal, else the current weight (`WeightSheet.test.tsx` > … >
  opens on the current weight when no goal weight is set)
- [x] Unit toggles store the unit at once and keep the value; a value the new wheel cannot show is
  held to its end (`WeightSheet.test.tsx` > … > stores pounds with the toggle and keeps the value,
  so an unmoved Save keeps the exact kg; > holds a weight the new wheel cannot show at that
  wheel’s end (D-16.80); `HeightSheet.test.tsx` > HeightSheet > stores ft-in with the toggle and
  shows 170 cm as 5 ft 7 in; an unmoved Save keeps 170 cm; > holds a height the new wheels cannot
  show at their end)
- [x] Height 100–250 cm or 3 ft 0 in–8 ft 11 in; a feet and inches pick stored unrounded
  (`HeightSheet.test.tsx` > HeightSheet > stores a feet and inches pick unrounded, and a cm pick
  in whole cm)
- [x] Goal → maintain clears pace and goal weight; lose/gain start Steady and drop a contradicted
  target (`ProfilePage.test.tsx` > ProfilePage > hides pace and goal weight once the goal is
  switched to maintain; `profileEdits.test.ts` > goal and pace > drops pace and goal weight when
  the goal becomes maintain; > starts a gain goal at the steady pace and drops a target below the
  weight)
- [x] Pace: Slow / Steady / Fast with the amount a week in the person's unit (`ProfilePage.test.tsx`
  > ProfilePage > offers Slow, Steady and Fast with the amount a week, and stores the pick)
- [x] Body fat 3–60 % in half steps, seed 20 %, Remove also removes the goal; goal body fat only
  with body fat, seeded goal → body fat → 15 %, showing the current value (`ProfilePage.test.tsx` >
  ProfilePage > sets body fat, which brings the goal row; Remove takes both away; > keeps an exact
  body fat that is off the wheel when Save is pressed unmoved; `profileEdits.test.ts` > body fat >
  removes goal body fat together with body fat; > stores goal body fat only while body fat is set,
  and removes it alone)
- [x] Sex list; birthday never after today, shown with the age (`ProfilePage.test.tsx` >
  ProfilePage > changes sex from its list and the birthday from the date input, showing the age)
- [x] Activity list with a line each; no edit recomputes targets; the nudge rises
  (`ProfilePage.test.tsx` > ProfilePage > leaves the targets unchanged and raises the rebuild
  nudge when activity is edited (R01.12); `profileEdits.test.ts` > edits and the plan (R01.12) >
  leaves the saved targets and locks as they were for every field edit; > raises the rebuild nudge
  after an activity edit against a stored baseline; > seeds a missing baseline from the profile
  before the edit, so the edit still raises the nudge; > raises no nudge for goal body fat or
  allergens, which are not plan inputs)
- [x] Allergens: add trimmed, no case-insensitive duplicate, remove (`AllergensSheet.test.tsx` >
  AllergensSheet > adds names as typed, trimmed, and stores each one at once; > does not add a
  name already on the list, in any case, and says so; > removes a name with its own button and
  keeps the rest in order)
- [x] Rows in the person's units (`ProfilePage.test.tsx` > ProfilePage > shows each stored value in
  the person’s units, metric; > shows feet and inches, pounds, body fat and its goal, and the
  allergen list)
- [x] Registered as `#/settings/profile` (`ProfilePage.test.tsx` > ProfilePage > is the Personal
  info category at #/settings/profile, under the back link and its title)
- Deliberate differences: goal, activity, pace and goal weight on Personal info (phase plan); the
  goal-weight refusal is a line in the sheet rather than an alert box; body fat shows one decimal
  (half steps) instead of a whole percent; body fat Remove only while a value is stored; Settings
  height and weight ranges are the wizard's (D-16.37, Proposed D-16.56: 3 ft 0 in–8 ft 11 in,
  20–250 kg / 50–500 lb, body fat from 3 %); a feet and inches pick keeps its exact cm; the goal
  weight is checked as shown (D-16.80); allergen removal without a confirmation; the pace text
  says "a week" without loss/gain; the baseline is seeded on the first edit when missing.
- Not taken: the allergen import from a photographed lab report (AI); body measurements
  (later phase).

## Decisions for the lead

- **Baseline seed on edit.** `profileEdits` stores the rebuild baseline from the profile as it
  was before an edit when none is stored yet (`baselineToSeed`). Without it, an edit made before
  the Goals page was ever opened would be taken in silently by that page's first-open seed and
  never raise the nudge (the reference seeds on any Settings load). Weigh-ins added on Progress
  (P07) do not seed; the Goals page's first-open seed covers them as before.
- **Shared rules duplicated, not moved.** `goalWeightProblem` (`src/services/profileEdits.ts`)
  repeats the wizard's `targetProblem` rule (D-16.80: compare as shown) because a service cannot
  import a feature and `src/domain` was import-only for this slice; `heldOnWheel` (WeightSheet)
  and `heldHeight` (HeightSheet) repeat the wizard's private `holdWeight` / `holdHeight`. A small
  lead task could move all three into `src/domain/profile/editRules.ts` and
  `src/domain/units/body.ts` and have both callers import them.
- **Words.** Sex, activity and pace names come from the wizard's keys (`onboarding.sex.*`,
  `onboarding.activity.levels.*`, `onboarding.pace.*`); the page's own words are the new `profile`
  partition. The wizard's `WeightPicker`, `countingOptions`, `BODY_FAT_WHEEL`, `bodyFatPercent`,
  `DEFAULT_BODY_FAT` and `OLDEST_AGE_YEARS` are imported unchanged.
- **`Services.profileEdits` is optional** like the other late services; the page throws without
  it. `src/test/screenHarness.tsx` does not carry it (outside this slice): the page tests add it
  through `src/features/settings/profile/testing/openProfile.tsx`.
- **Icon** `heart` for the category; the hub lists Personal info first in Preferences.

## Status

Done (2026-10-27). Page, sheets, service, partition and tests. Shared files changed additively:
`src/services/context.tsx` (`profileEdits?`), `src/main.tsx` (the service), `src/i18n/en.ts` (the
`profile` line), `src/features/settings/registry.ts` (the `profile` record). Trap R01.12's
"Settings wiring owned by P05-10" line and ACC-B12-1 / ACC-B12-2 can take the tests named above.
