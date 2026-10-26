# Task: wizard steps, Welcome to Body fat (P05-02) · Phase: 05 · Owner: builder (wt-p05s1, slice S1)

Read (reference @ `10e14b67`): `A/ui/onboarding/OnboardingScreen.kt` lines 140–460 (the scaffold:
header, back, progress bar, footer buttons per step) and 553–1100 (the steps: sex cards, birthday
wheel, height and weight wheels with one unit toggle, body-fat yes/no with wheel and optional
goal), `I/Views/OnboardingView.swift` lines 80–560 (the same steps on iOS, welcome tour, birthday
limited to today): behaviour only. Research spec `01-profile-goals.md` §3.2, §3.4; decisions
D-16.10 (units from the browser locale), D-16.37 / D-16.56 (weight 20–250 kg / 50–500 lb, body
fat 3–60 % in 0.5 steps), D-16.63. No reference tests exist for these screens.

What it does (own words):
- `WizardPage` hosts the wizard: it keeps the P05-01 reducer, shows a header with a back chevron
  and a thin progress bar (only where the state machine allows them), the current step, and a
  footer Continue button on steps 1–10 that is disabled when the state machine says so. When the
  step changes, focus moves to the new step's heading so keyboard and screen-reader users start
  at the top of each step. It takes today's day, the browser locale (first units, D-16.10), the
  notification-permission function (P05-03), an optional restore handler, an optional start
  state and a state listener (P05-07 completes from it). Steps 10–12 come from a typed slot the
  S2 slice fills; until then each shows only its heading.
- `Welcome`: our mark, a two-line headline, one line about Platewise, a short tour in our words
  (photo logging, the Coach, your own AI key, data kept on this device), "Get started" (moves to
  Sex) and a "Restore from a backup file" text button (P09-14 wires it).
- `Sex`: three choice cards, male default.
- `Birthday`: a native date input that cannot go past today, defaulting to 25 years ago, with the
  age it gives.
- `Body`: one Metric | Imperial toggle that sets both units; height as a cm wheel (100–250) or
  feet + inches wheels (3′0″–8′11″); weight as whole + tenths wheels (20–250 kg or 50–500 lb).
- `BodyFat`: Yes / No cards (No by default). Yes shows a 3–60 % wheel in 0.5 steps starting at
  20 %, a hint with common ranges, and a switch for an optional goal that starts at the current
  value. No explains that the standard formula is used. Choosing No clears both values.

Inputs → outputs: `WizardPage({today, locale?, requestNotifications, onRestore?, lateSteps?,
initialState?, onStateChange?})` → the screen; each step takes `{state, dispatch}` and dispatches
P05-01 actions.

Files: created `src/features/onboarding/WizardPage.tsx` (+ test), `onboarding.module.css`,
`steps/{Welcome,Sex,Birthday,Body,BodyFat}.tsx`, tests for Welcome, Body and BodyFat, shared
`steps/{StepHeader,ChoiceCards,WeightPicker,stepProps}.tsx|ts`, a test helper
`testing/renderWizard.tsx`; changed `src/i18n/en/onboarding.ts` (the wizard's words; the quick
start keys stay).

Edge cases / failure modes:
- A weight the new unit's wheel cannot show is held to that wheel by the reducer, so the shown
  value and the stored one agree.
- Height in feet: 8 ft allows 0–11 in (8′11″ is the top); 3 ft starts at 3′0″.
- Body fat and its goal are snapped to the 0.5 grid for display only; the stored fraction is the
  picked percent ÷ 100.
- Birthday: a typed future date is held to today by the field and again by the reducer.
- The mark is a decorative image (empty alt); the headline carries the name.

Our design differences / decisions:
- Choice cards are native radio inputs inside card labels: one tab stop per group, arrow keys
  move the choice, no custom key handling.
- Back is hidden (not drawn disabled) where it does nothing (Welcome, Building plan); the
  progress bar is hidden outside steps 1–10.
- The birthday uses the native date input (the wheel of the native apps becomes the browser's
  own date picker, 05 §5) with a lower bound of 120 years ago.
- The restore link has no action until P09-14 passes one.
- Unit words (kg, lb, cm, ft, in) live in the onboarding partition until a shared units
  partition exists.

Tests we will write:
- `WizardPage.test.tsx`: a fresh wizard opens on Welcome without header, Get started reaches Sex
  with progress 1/12 (ACC-B1-1); walking Welcome → Body fat with the keyboard only, every step
  taking its value (ACC-B2-1); an en-US browser shows weight in lb (ACC-B11-2); focus moves to
  each step's heading; Back returns and keeps answers.
- `Welcome.test.tsx`: the restore link is present and calls its handler; the tour has four items.
- `Body.test.tsx`: toggling units converts the shown height and weight and writes both units;
  back to metric reads 70.0 again; 170 cm reads 5′7″; wheels write canonical values.
- `BodyFat.test.tsx`: No by default with the formula note; Yes starts at 20 %; the goal switch
  seeds the current value; No clears a set value and its goal.

Compare checklist (filled after the rewrite; reopened `OnboardingScreen.kt` 140–1100,
`OnboardingView.swift` 80–560):
- [x] Header: back chevron and thin progress bar where allowed; none on Welcome (tested in
  `WizardPage.test.tsx` > WizardPage > opens a fresh wizard on Welcome without Back or progress,
  and Get started begins it (ACC-B1-1); > shows Back but no progress on Plan ready, and neither
  while the plan is built)
- [x] Welcome: mark, two-line headline, one line, a four-point tour, the primary button and the
  restore link (`Welcome.test.tsx` > Welcome > shows the mark, a two-line headline, a line about
  the app and a four-point tour; > offers restoring from a backup file, calling the handler it is
  given; > starts the wizard with Get started)
- [x] Each step takes its value and Continue moves on, by keyboard alone (`WizardPage.test.tsx` >
  WizardPage > walks from Welcome to Body fat with the keyboard only, each step keeping its answer
  (ACC-B2-1))
- [x] Birthday: 25 years back to start, never after today (`WizardPage.test.tsx` > … walks from
  Welcome to Body fat … (birth date 2001-10-26); `wizard.test.ts` > birthday > holds a future date
  to today and a date over 120 years back to that limit)
- [x] One toggle for both units; heights 100–250 cm or 3′0″–8′11″; weights 20–250 kg or
  50–500 lb (`Body.test.tsx` > Body > toggles units: converts the shown height and weight and
  writes both unit settings; > reads 70.0 kg again after kg → lb → kg (R01.3); > offers the
  decided ranges …; > stores what the wheels pick in cm and kg)
- [x] Body fat: No to start with the formula note; Yes opens 3–60 % in half steps at 20 % with the
  ranges hint; the goal starts at the current value; No clears both (`BodyFat.test.tsx` > BodyFat
  > starts on No …; > Yes opens a 3–60 % wheel in half steps at 20 % …; > seeds the optional
  goal with the current value; > No clears a set value and its goal)
- [x] A fresh wizard follows the browser's locale for units (`WizardPage.test.tsx` > WizardPage >
  shows weight in pounds in a fresh wizard in an en-US browser (ACC-B11-2))
- Deliberate differences: the browser's date input instead of a day–month–year wheel (05 §5), with
  a lower bound 120 years back; native radio cards without figure icons (our icon set has none);
  Metric listed before Imperial; the tour names Platewise's features (photo logging, the Coach,
  your own key, data on the device) instead of the exercise library and widgets; weight wheels
  20–250 kg / 50–500 lb (D-16.56; A 30–250 / 60–500); the feet wheel reaches 8′11″ (A shows at
  most 8′0″ but lets the inches wheel go past it); Back hidden, not drawn disabled, where it does
  nothing; first units from the browser locale (D-16.10; A from stored preferences, I imperial).
- Not taken: the returning-user screen behind the link (P09-14); the gradient headline and step
  transitions.

## Status

Done (2026-10-26). WizardPage, Welcome, Sex, Birthday, Body, BodyFat with their tests (WizardPage
7, Welcome 4, Body 4, BodyFat 4); shared `steps/{StepHeader,ChoiceCards,WeightPicker,stepProps}`
and the test helper `testing/renderWizard.tsx`; words in `src/i18n/en/onboarding.ts` (quick-start
keys kept). Not routed: P05-07 points `#/onboarding` at `WizardPage` and passes today, the
permission ask and the completion; P09-14 passes `onRestore`.
