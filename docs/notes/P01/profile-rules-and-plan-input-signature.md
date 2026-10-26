# Task: profile rules and plan-input signature (P01-15) · Phase: 01 · Owner: builder (wt-p01b4b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/settings/SettingsViewModel.kt` lines 1340–1670 (the
tune-up switch, the manual rebuild and its baseline, the Settings weight save, the generic profile
update), `I/ContentView.swift` searched for `goalsNeedRecalc` (the nudge row, the stored-baseline
check and its capture) and `case .editGoalWeight` (with the neighbouring weight, body-fat and
goal-body-fat sheets). Research spec `01-profile-goals.md` §3.1 (record and defaults), §3.9
(Settings fields, rules on save, the nudge), §6 R01.4, R01.6, R01.12; decision D-16.11. The rows
name no reference test for this task. No Evidence ids.

What it does (own words): three small pure modules behind the Settings "Personal info" page, the
wizard and the rebuild nudge. `profile.ts` builds the profile a first run starts from (male, born
25 years before today, 175 cm, 70 kg, moderately active, maintaining, no body fat, no pace or
target, no saved targets, no locks, no allergens) and picks the first-run display units from the
locale through `defaultUnits` (P01-04); it also says whether two stored profiles are the same
record, which the rebuild and the tune-up use to drop a stale AI reply. `editRules.ts` holds the
rules a field edit carries with it: switching to maintain drops the pace and the target weight;
switching to lose or gain gives a pace of 0.5 kg a week when none is set and drops a target on
the wrong side; a target weight must be below the current weight to lose and above it to gain
(the wizard uses the same check, D-16.11); a new weight drops a target it contradicts; clearing
body fat clears goal body fat. Pace presets are 0.25, 0.5 and 1.0 kg a week. None of these edits
touches the saved targets or the locks: Settings edits never recompute the plan (R01.12).
`signature.ts` reduces the inputs the plan depends on (sex, birth date, height, weight, activity,
goal, pace, target weight, body fat) to one string; the last rebuild stores it as a baseline and
the "inputs changed" nudge shows while the current string differs. With no baseline stored, the
current string is stored silently, so the nudge never appears on first open (R01.12).

Inputs → outputs:
- `profileDefaults(today: DayKey)` → `Profile`; `firstRunDefaults(today, localeTag)` →
  `{ profile, units }` (`units` from `defaultUnits`); `birthDateYearsBefore(today, years)` →
  `DayKey` (29 February becomes 28 February in a common year); `sameProfile(a, b)` → boolean.
- `PACE_IDS` (`slow`, `steady`, `fast`), `PACE_PRESETS` (0.25 / 0.5 / 1.0 kg a week),
  `DEFAULT_WEEKLY_KG` (0.5), `paceIdOf(kg)` → id or null.
- `checkGoalWeight({goal, weightKg}, kg)` → `null` when fine, else `'notBelowCurrent'` (lose) or
  `'notAboveCurrent'` (gain).
- `withGoal(profile, goal)`, `withWeight(profile, kg)`, `withBodyFat(profile, fraction | null)`,
  `withGoalBodyFat(profile, fraction | null)` → the next `Profile`; `withGoalWeight(profile, kg)`
  → `Result<Profile, GoalWeightProblem>` (refused edits change nothing).
- `planInputsKey(profile)` → string; `needsRebuild(current, baseline: unknown)` → boolean;
  `baselineToSeed(current, baseline: unknown)` → the key to store silently, or null.

Files: created `src/domain/profile/profile.ts`, `profile.test.ts`, `editRules.ts`,
`editRules.test.ts`, `signature.ts`, `signature.test.ts`, this note.

Edge cases / failure modes:
- `today` on 29 February: 25 years earlier is a common year, so the default birth date is
  28 February, and the person is 25 on that day (`ageOn`).
- Target weight equal to the current weight is refused for lose and for gain; maintain accepts
  any target (the field is hidden there anyway). A non-finite target is refused for lose and gain.
- Lose → gain with a target below the current weight drops the target; lose → lose keeps a valid
  one; switching to lose or gain keeps an existing pace.
- A new weight at or below a lose target, or at or above a gain target, drops the target; a new
  weight that keeps the direction possible keeps it. Maintain never drops it.
- Clearing body fat drops goal body fat; setting goal body fat with no body fat keeps none.
- Removed fields are removed keys, not keys holding `undefined`, so two equal records compare
  equal and the stored JSON stays clean; `sameProfile` treats a key holding `undefined` as absent.
- Signature: allergens, goal body fat, saved targets and locks do not change it; every listed
  input does. A baseline that is missing, not a string, empty or from another key format is
  "missing": no nudge, seed the current key silently.

Our design differences / decisions:
- Names are ours (`planInputsKey`, `needsRebuild`, `baselineToSeed`, `withGoal`, …); the stored
  baseline lives at `goals.rebuildBaseline` (17 §1.3).
- The key is a JSON array that starts with a format number, so a later change of what the key
  covers reads as "no baseline" (seeded silently) instead of raising the nudge for everyone.
- The reference's key also covers a legacy body-fat flag; our profile has no such field (17 §1.3),
  so the key has nine inputs.
- Edit rules are pure field updaters; storage, weigh-in records and the goal-reached event stay
  with the callers (P02-08, P05-10). The display name and initials of §3.1 are not built: our
  profile has no name.
- `withGoalBodyFat` with no body fat keeps none, so "goal body fat only with body fat" holds for
  every caller (P05-01 states the same rule for the wizard).

Tests we will write:
- `profile.test.ts`: every default; birth date 25 years back, including 29 February; age 25 on
  the day; units from the locale (en-US imperial, de-DE metric) seeded together; `sameProfile`
  for equal records, a changed field, a changed array or saved target, and `undefined` vs absent.
- `editRules.test.ts`: `checkGoalWeight` lose/gain/maintain with the equality edge (R01.6,
  D-16.11); gain → maintain clears pace and target; maintain → lose sets 0.5; a set pace is kept;
  lose → gain drops a wrong-side target; `withGoalWeight` refuses and saves; a weigh-in at or
  below a lose target clears it, one above keeps it; gain mirror; clearing body fat clears goal
  body fat; pace presets and `paceIdOf`; every edit leaves saved targets and locks alone (R01.12).
- `signature.test.ts`: allergens, goal body fat, targets and locks leave the key equal; each of the
  nine inputs changes it; weight, activity, goal and pace edits raise the nudge (R01.12); a
  missing baseline gives no nudge and is seeded (R01.12); unreadable and old-format baselines seed
  too; after seeding, an edit raises the nudge.

Compare checklist (filled after the rewrite; reopened `A/ui/settings/SettingsViewModel.kt` lines
1340–1670, `I/ContentView.swift` at `goalsNeedRecalc` and `case .editGoalWeight` with its
neighbouring sheets):
- [x] Target weight refused on the wrong side with nothing saved; equal refused; maintain accepts
  (`src/domain/profile/editRules.test.ts > checkGoalWeight > refuses a lose target at or above the
  current weight (R01.6, D-16.11)`, `> refuses a gain target at or below the current weight (R01.6,
  D-16.11)`, `> accepts any target for maintain`; `withGoalWeight > refuses a target on the wrong
  side and changes nothing`).
- [x] Settings weight save drops a target the new weight contradicts (lose & target ≥ new, gain &
  target ≤ new) and recomputes nothing (`editRules.test.ts > withWeight > clears a lose target once
  a weigh-in reaches it or goes below it`, `> keeps a lose target when the new weight is still above
  it`, `> clears a gain target once a weigh-in reaches it or goes above it`).
- [x] Clearing body fat clears goal body fat (`editRules.test.ts > withBodyFat and withGoalBodyFat >
  clears goal body fat when body fat is cleared`).
- [x] Goal change rules of §3.9 (`editRules.test.ts > withGoal > clears pace and target when
  switching gain to maintain`, `> starts lose and gain at 0.5 kg a week when no pace is set`, `>
  keeps a pace that is already set`, `> drops a target on the wrong side of the current weight for
  the new direction`).
- [x] Profile edits never touch targets or locks (`editRules.test.ts > edits and the plan > leave
  the saved targets and locks as they were for every field edit (R01.12)`).
- [x] Nudge: no stored baseline → no nudge; differs → nudge; baseline = key of the rebuilt profile
  (`src/domain/profile/signature.test.ts > needsRebuild > shows no nudge on first open when no
  baseline is stored (R01.12)`, `> shows the nudge after a weight, activity, goal or pace edit,
  without touching targets (R01.12)`, `> shows no nudge right after a rebuild`; `baselineToSeed >
  seeds a missing baseline silently with the current key (R01.12)`, `> raises the nudge for an edit
  made after the silent seed (R01.12)`).
- [x] Key coverage: the nine inputs in, allergens / goal body fat / targets / locks out
  (`signature.test.ts > planInputsKey > changes when any plan input changes`, `> stays equal when
  allergens, goal body fat, targets or locks change`).
- [x] A rebuild reply is applied only to an identical profile; the equality behind it covers every
  field (`src/domain/profile/profile.test.ts > sameProfile > is false when any field differs
  (R01.4)`, `> is true for a copy with new arrays and objects`).
- Deliberate differences: the key has no legacy body-fat flag (our profile has none) and carries a
  format number; goal body fat cannot be set without body fat (the reference's sheet just saves,
  but its row is hidden then, so nothing visible changes); field updaters return new records and
  never write.
- Not taken: the reference forcing the nudge on after a dropped manual rebuild (a transient UI
  flag; ours shows the nudge only when inputs differ, which is the case when an input edit caused
  the drop); display name and initials (no name field); the alert copy (catalogue, P05-10).

## Decisions for the lead

- Verify-column wording: "a new weigh-in above a lose target clears it" reads inverted against the
  rule in the same row and §3.9 (lose & target ≥ new weight). I followed the rule: a weigh-in at or
  below a lose target clears it, one above keeps it (both tested), and the gain mirror.
- Goal reached vs. `withWeight`: a weigh-in that crosses a lose or gain target always contradicts
  it, so `withWeight` drops that target. P02-08 must evaluate `crossesGoal` against the target
  *before* applying `withWeight`, or the goal-reached event never fires.
- Which paths drop a contradicted target: in the reference only the Settings weight save does
  (both platforms); Progress weigh-ins only sync the weight. `withWeight` is pure, so P02-08 /
  P05-10 decide; parity means calling it only from the Settings weight path.
- Missing baseline = also a non-string, an empty string or a key from another format (seeded
  silently, no nudge). `KEY_FORMAT` must be bumped if the covered inputs ever change.
- Extra exports beyond the row: `DEFAULT_AGE_YEARS`, `DEFAULT_HEIGHT_CM`, `DEFAULT_WEIGHT_KG`,
  `birthDateYearsBefore`, `firstRunDefaults` / `FirstRunDefaults`, `sameProfile` (for P05-08 and
  the cadence), `PACE_IDS`, `PaceId`, `PACE_PRESETS`, `DEFAULT_WEEKLY_KG`, `paceIdOf`,
  `GoalWeightProblem` (`notBelowCurrent` / `notAboveCurrent`), `withGoal`, `withGoalWeight`
  (returns `Result` from `src/lib/result`), `withWeight`, `withBodyFat`, `withGoalBodyFat`,
  `baselineToSeed`. Pace ids follow P05-10's labels (Slow / Steady / Fast).
- Nothing compares weights in display units: a target that shows the same as the current weight
  after a lb round trip may still be accepted (69.99 kg < 70 kg), as in the reference.

## Status

Done (2026-10-26). `profile.ts` (12 tests), `editRules.ts` (23 tests), `signature.ts` (12 tests),
all passing. Nothing outside `src/domain/profile/**` changed. Traps exercised: R01.12 (owned by
P05-10), R01.6 / D-16.11 (owned by P05-01), R01.4 equality (owned by P05-08).
