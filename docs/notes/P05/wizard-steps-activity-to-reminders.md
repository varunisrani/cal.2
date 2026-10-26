# Task: wizard steps, Activity to Reminders (P05-03) · Phase: 05 · Owner: builder (wt-p05s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/onboarding/OnboardingScreen.kt` (the activity and goal
cards, the desired-weight step, `GoalSpeedStep`, the notifications step), `I/Views/OnboardingView.swift`
lines 560–800 (goal, desired weight, pace, notifications): behaviour only. Research spec
`01-profile-goals.md` §3.3 (activity table: multipliers, step guides), §3.4 (steps 5–9); decisions
D-16.11 (target on the right side), D-16.15 (Reminders replaces notifications + health), D-16.41
(reminder model), D-16.61 (all reminders start off). No reference tests exist for these screens.

What it does (own words):
- `Activity`: six choice cards, least active first, each with a name, a one-line description in
  our words and a steps-a-day guide computed from the domain table (`ACTIVITY_FACTORS`), default
  moderate.
- `Goal`: lose / keep / gain cards, default keep (maintain). Choosing a goal re-seeds the target.
- `Target`: the current weight for reference, a whole + tenths weight wheel in the person's unit,
  the goal named under the title, and an inline message when a lose target is not below the
  current weight or a gain target not above it; Continue stays disabled meanwhile (D-16.11).
- `Pace`: for maintain a short confirmation that calories stay level; for lose or gain the weekly
  amount in the person's unit ("0.5 kg" / "1.1 lb" a week), Slow / Steady / Fast (0.25, 0.5,
  1 kg a week; Steady default), a caption per pace and an estimated-days card =
  trunc(|target − current| ÷ weekly × 7).
- `Reminders`: says what meal reminders do, a button that asks the browser for notification
  permission through an injected function, and the outcome: a grant turns reminders on; a block
  explains how to allow notifications later (browser site settings, then Settings); a dismissed
  prompt or an unsupported browser leaves them off with a short line. Continue skips. Nothing is
  scheduled here.

Inputs → outputs: each step takes `{state, dispatch}`; `Reminders` also takes
`requestNotifications: () => Promise<NotificationPermission | 'unsupported'>`.

Files: created `steps/{Activity,Goal,Target,Pace,Reminders}.tsx`, tests for Target, Pace and
Reminders; words in `src/i18n/en/onboarding.ts`.

Edge cases / failure modes:
- The permission function throws → treated as unsupported (reminders stay off).
- Asking while a previous ask is pending: the button is busy and ignores presses.
- A grant arriving after the person moved on still records the answer.
- Maintain: Pace shows no pace control, no days; Target shows the wheel without a check.
- Days use stored kg, not the rounded readout, so 154.3 → 143.3 lb at Steady reads 69 days.

Our design differences / decisions:
- One Reminders step replaces the notifications and health steps (D-16.15); the permission ask is
  injected so P05-07 / P09 decide how it reaches the browser.
- Pace uses a three-choice segmented control instead of a slider with icons.
- The weekly amount uses the locale's decimal mark (`formatDecimal`), not a fixed dot.
- The step guide is written from the domain's numbers, so it can never drift from the formula
  table.

Tests we will write:
- `Target.test.tsx`: a wrong-side lose target shows the message and disables Continue; a target
  below passes; gain mirrors; maintain shows no message (ACC-B4-1 at screen level).
- `Pace.test.tsx`: 70 → 65 kg at Steady shows 70 days (ACC-B2-2); the imperial readout reads
  "1.1 lb"; Fast halves the days; maintain shows the confirmation only.
- `Reminders.test.tsx`: a denial leaves reminders off, explains how to allow later, and Continue
  still moves on (ACC-B5-1); a grant turns the master switch on; Continue without asking skips.

Compare checklist (filled after the rewrite; reopened `OnboardingScreen.kt` (activity, goal,
desired weight, `GoalSpeedStep`, notifications), `OnboardingView.swift` 560–800):
- [x] Six activity levels, least active first, moderate to start, each with a line and a steps
  guide from the formula table (tested in `WizardPage.test.tsx` > WizardPage > walks from Activity
  to AI access, each step starting on its default (ACC-B2-1))
- [x] Goal: keep to start; lose seeds the target 5 kg lower (`WizardPage.test.tsx` > … walks from
  Activity to AI access …; `wizard.test.ts` > target weight > seeds the target 5 kg under or over
  the current weight when a goal is chosen)
- [x] Target: goal named, wrong side explained and Continue held; maintain unchecked
  (`Target.test.tsx` > Target > shows why a lose target above the current weight is refused and
  holds Continue (ACC-B4-1); > refuses a gain target at the current weight, in the person’s unit;
  > checks nothing when the goal is to keep the weight)
- [x] Pace: 0.25 / 0.5 / 1 kg a week, 0.5 to start; readout in the person's unit; days =
  trunc(|target − current| ÷ weekly × 7); maintain confirms only (`Pace.test.tsx` > Pace >
  estimates 70 days from 70 to 65 kg at 0.5 kg a week (ACC-B2-2); > reads the weekly amount in
  pounds for an imperial person: "1.1 lb"; > changes the amount, note and days with the pace;
  > only confirms a steady plan when the goal is to keep the weight)
- [x] Reminders: one ask; only a grant turns them on; a denial explains; Continue skips
  (`Reminders.test.tsx` > Reminders > leaves reminders off after a denial, says how to allow them
  later, and continues (ACC-B5-1); > turns the reminders master switch on after a grant; > skips
  with Continue without asking)
- Deliberate differences: a three-choice segmented control instead of a three-stop slider with
  icons; "Steady" for the middle pace; captions in our words; the weekly amount with the locale's
  decimal mark; a denial explains how to allow notifications later and a closed prompt can be
  asked again (D-16.15); one Reminders step for notifications and health (D-16.15).
- Not taken: the unit toggle repeated on the Target step (A); scheduling meal reminders on a grant
  (I schedules at once; P05-07 records the choice and P09 schedules); the health step (D-16.15).

## Status

Done (2026-10-26). Activity, Goal, Target, Pace, Reminders with tests for Target (4), Pace (4) and
Reminders (6); Activity and Goal are covered by the WizardPage flow test. Handed on: P05-07 turns
the reminder answer into settings (see the P05-01 note, "Decisions for the lead").
