# Task: profile rules and plan-input signature (P01-15) · Phase: 01 · Owner: builder (wt-p01b4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/settings/SettingsViewModel.kt` lines 1340–1670 (tune-up
switch, rebuild, weight save, profile update, goal edits) and lines 150–180, 300–320 (the rebuild
baseline and its silent seeding), `A/ui/settings/SettingsScreen.kt` lines 3220–3255 (goal change
rules), `I/ContentView.swift` (`goalsNeedRecalc`, the baseline seeding on appear, `case
.editWeight`, `case .editBodyFat`, `case .editGoalWeight`, the goal `onChange` rules),
`A/models/UserProfile.kt` and `I/Models/UserProfile.swift` (defaults and the input signature);
research spec `01-profile-goals.md` §3.1 (defaults), §3.9 and §6 R01.6, R01.12, R01.15; decisions
D-16.10, D-16.11, D-16.56. Traps ledger rows R01.12 (owned by P05-10; the domain part is here),
R01.6 (P05-01 uses `checkGoalWeight`); no acceptance row of its own. No Evidence ids.

What it does (own words): `profile.ts` builds the profile a new person starts with (male, born 25
years before today on the calendar, 175 cm, 70 kg, moderate, maintain, nothing else set, no saved
targets, no locks, no allergens) together with the starting units from the browser locale (P01-04),
and says whether two profiles are exactly the same (the rebuild and the tune-up drop a result when
anything changed). `editRules.ts` holds the rules that keep a profile consistent when one field
changes: switching the goal to maintain drops the pace and the goal weight; switching to lose or
gain gives a 0.5 kg pace when none is set and drops a goal weight on the wrong side; a goal weight
must be below the current weight to lose and above it to gain (the wizard and Settings both ask
`checkGoalWeight`, D-16.11); a new current weight drops a goal weight it contradicts; removing body
fat also removes the body-fat goal; the pace presets are 0.25, 0.5 and 1.0 kg a week. None of these
edits recomputes targets (R01.12). `signature.ts` writes the plan inputs (sex, birth date, height,
weight, activity, goal, pace, goal weight, body fat) as one string; when it differs from the stored
baseline, Settings shows the "inputs changed, rebuild" nudge. Allergens, the body-fat goal, saved
targets and locks are not inputs. A missing baseline is stored silently from the current profile,
so the nudge never shows on first open.

Inputs → outputs:
- `profile.ts`: `DEFAULT_AGE_YEARS` 25; `defaultBirthDate(today)`; `defaultProfile(today)` →
  `Profile`; `startingSetup(today, localeTag)` → `{ profile, units }`; `sameProfile(a, b)`.
- `editRules.ts`: `PACE_PRESETS` (`slow` 0.25, `steady` 0.5, `fast` 1.0); `changeGoal(profile,
  goal)`; `setPace(profile, kg)`; `goalWeightProblem(goal, targetKg, currentKg)` /
  `checkGoalWeight(profile, kg)` → `null | 'mustBeBelow' | 'mustBeAbove' | 'outOfRange'`;
  `setGoalWeight(profile, kg)` → `Result<Profile, problem>`; `withWeight(profile, kg)`;
  `setBodyFat(profile, fraction | undefined)`.
- `signature.ts`: `planInputsKey(profile)` → string; `needsRebuild(profile, baseline)` → boolean
  (false without a baseline); `baselineToSeed(profile, baseline)` → the key to store when no
  baseline exists, else null.

Files: created `src/domain/profile/profile.ts`, `profile.test.ts`, `editRules.ts`,
`editRules.test.ts`, `signature.ts`, `signature.test.ts`, this note. Uses `defaultUnits` and
`WEIGHT_LIMITS` from `src/domain/units`, `splitDayKey`/`isDayKey` from `src/domain/dates`,
`DEFAULT_PACE_KG` from `goals/formulas.ts`, `Result` from `src/lib/result.ts`.

Edge cases / failure modes:
- Birth date 25 years before 29 February lands on 28 February in a common year; it is a calendar
  date, so it is the same in New York and Tokyo (R01.15).
- Goal weight equal to the current weight is refused for both lose and gain; maintain needs no
  check. A target that is not finite or lies outside 20–250 kg (the one weight range, D-16.56) is
  refused as out of range; every wheel position in kg or lb lies inside it.
- A goal change keeps an existing pace; only a missing pace becomes 0.5.
- `withWeight` changes only the weight and a contradicted goal weight: targets and the signature's
  other parts stay (the weigh-in itself is stored by the weight repository, P02/P05).
- Signature: numbers are written in their shortest exact form, absent values as null, so 70 and
  70.0 are one key and an absent pace differs from 0. Changing allergens, the body-fat goal, targets
  or locks keeps the key equal; any plan input changes it.
- `sameProfile` compares every field, nested saved targets and lists included; a field set to
  undefined equals a missing field.

Our design differences / decisions:
- Our names (`planInputsKey`, `needsRebuild`, `checkGoalWeight`, `withWeight`, pace names slow /
  steady / fast).
- The reference's legacy body-fat preference is not in our model, so it is not in the key; the
  birth date is a day key, not an instant.
- The goal-weight check also refuses values outside the one weight range (D-16.56), as a guard for
  typed or restored values; wheels never produce one.
- Seeding is a pure answer ("store this key") so the caller (P05-10/11) does the write.

Tests we will write:
- Defaults (and units seeding for en-US and de-DE); birth date across 29 February; Tokyo gives the
  same birth date.
- Lose with target ≥ current refused, gain with target ≤ current refused, maintain needs none;
  out-of-range targets refused; `setGoalWeight` leaves the profile unchanged on refusal.
- Gain → maintain clears pace and target; maintain → lose sets pace 0.5 and keeps a valid target;
  lose → gain drops a target below current; existing pace kept.
- New weigh-in above a lose target clears it; below a gain target clears it; a consistent one keeps
  it.
- Clearing body fat clears goal body fat; setting it keeps the goal.
- Signature: allergens, goal body fat, targets and locks leave it equal; weight (and each other
  input) changes it; missing baseline → no nudge and a seed; stored baseline → nudge only after a
  change (R01.12).
- `sameProfile`: equal copies, any changed field, lock and target edits, undefined vs missing.

Compare checklist (filled after the rewrite; reopened `A/models/UserProfile.kt` (defaults, the
input signature), `I/Models/UserProfile.swift` (the same), `A/ui/settings/SettingsViewModel.kt`
lines 150–180, 300–320 and 1596–1660, `A/ui/settings/SettingsScreen.kt` lines 3220–3290,
`I/ContentView.swift` lines 5060–5080, 6560–6620, 6700–6707 and 7211–7224):
- [x] Defaults: male, today − 25 years, 175 cm, 70 kg, moderate, maintain, nothing else (tested in
  `src/domain/profile/profile.test.ts > defaultProfile > starts male, 25 years old, 175 cm, 70 kg,
  moderate, maintain, with nothing else set`, `> gives the default plan of 2 452 kcal, 112 / 406 /
  42 g (ACC-C1-1)`, `defaultBirthDate > goes back 25 calendar years`, `> lands on 28 February when
  29 February does not exist 25 years earlier`, `> gives the same birth date in Asia/Tokyo
  (R01.15)`); units seeded with the profile (`startingSetup > seeds the units from the locale with
  the default profile`).
- [x] Goal change rules (`src/domain/profile/editRules.test.ts > changeGoal > clears pace and target
  when switching gain → maintain`, `> sets a 0.5 kg pace when switching to lose or gain without one`,
  `> keeps a pace that is already set`, `> drops a target on the wrong side of the new direction
  and keeps one on the right side`, `> leaves the targets alone (R01.12)`).
- [x] Goal weight check with equality refused both ways, and a refusal saves nothing
  (`checkGoalWeight > refuses a lose target at or above the current weight (D-16.11)`, `> refuses a
  gain target at or below the current weight (D-16.11)`, `> needs no direction to maintain`,
  `setGoalWeight > refuses a target on the wrong side and leaves the profile as it was`, `> saves a
  target on the right side`).
- [x] A new weight clears a contradicted goal weight (`withWeight > clears a lose target that a new
  weigh-in has reached or passed`, `> clears a gain target at or below a new weigh-in`, `> keeps a
  target the new weight does not contradict, and the targets`).
- [x] Clearing body fat clears the goal (`setBodyFat > clears the body-fat goal when body fat is
  cleared`, `> keeps the body-fat goal when body fat changes`); pace presets (`PACE_PRESETS > offers
  0.25, 0.5 and 1.0 kg a week`).
- [x] Signature fields and exclusions (`src/domain/profile/signature.test.ts > planInputsKey >
  stays equal when allergens, the body-fat goal, targets or locks change`, `> changes when the
  weight changes`, `> changes with every plan input`, `> writes the same number one way and tells
  an absent pace from 0`).
- [x] Nudge only against a stored baseline; a missing one is seeded silently (`needsRebuild > shows
  no nudge when there is no baseline yet, and seeds one silently (R01.12)`, `> seeds nothing when a
  baseline exists`, `> nudges after a new weigh-in or a goal change, and not after a target or lock
  edit`, `> clears once the baseline is stored again after a rebuild`).
- [x] Exact profile equality for dropping stale results (`src/domain/profile/profile.test.ts >
  sameProfile > sees any changed field, nested targets, locks and lists included (R01.4)`, `> treats
  a copy as the same profile`, `> counts a field set to undefined as missing`).
- Deliberate differences: the goal-weight check also refuses values outside 20–250 kg (D-16.56) or
  not finite; the signature has no legacy body-fat flag and uses the birth day key, not an instant;
  cleared fields are removed from the record rather than set to null; seeding is returned to the
  caller instead of written.
- Not taken: display name and initials; the weigh-in write and profile weight sync (P02 weight
  repository, P05-10); the alert copy for a refused goal weight (P05-10, i18n).

## Decisions for the lead

- `checkGoalWeight` returns `'outOfRange'` for a target outside `WEIGHT_LIMITS.kg` (20–250) or not
  finite; every kg or lb wheel position lies inside, so only typed or restored values can hit it.
- `sameProfile` lives in `profile.ts` (P05-08 rebuild and the tune-up both need it); a key holding
  undefined equals a missing key, list order counts.
- Pace preset names are `slow` / `steady` / `fast` (P05-03 uses Slow / Steady / Fast).
- `HEIGHT_LIMITS` is not used here: no profile rule needs it (the height sheets clamp, P01-04).

## Status

Done (2026-10-26). `profile.ts` (10 tests), `editRules.ts` (18 tests), `signature.ts` (8 tests);
nothing outside the slice's files changed. Traps with tests here: R01.12 (domain part; the row is
owned by P05-10), R01.4 (`sameProfile`, with P01-16), R01.15 (birth date in Tokyo). D-16.11's
check is ready for P05-01 (R01.6).
