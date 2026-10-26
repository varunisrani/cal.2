# Task: temporary quick start (P04-09) · Phase: 04 · Owner: builder (wt-p04s4, slice S4)

Read (reference @ `10e14b67`): none; the phase row lists no reference file. This screen is ours
alone: it stands in for onboarding until P05 builds the wizard and P05-07 deletes it. Read our
own specs instead: `01-profile-goals.md` (the starting profile, the first weigh-in at
completion), `16-what-we-change.md` D-16.10 (units from the browser locale), P01-15's
`defaultProfile` / `startingSetup` and P01-04's `defaultUnits`, the settings keys in
`src/data/settingsSchema.ts`, and P05-07's completion row (what the real completion will add).

What it does (own words): on first launch, with no profile yet, the onboarding route shows one
screen: the app name, one line saying the defaults can be changed later, and a "Start with
defaults" button. Pressing it saves the starting profile (male, 25 years old, 175 cm, 70 kg,
moderate activity, maintain), sets the energy, height and weight units the browser's region
uses, records the first weigh-in (the profile's 70 kg, now) and marks onboarding done; then the
caller shows Home. The screen never touches storage: it calls an action it is given (built from
`src/services/quickStart.ts`) and then `onDone()`, so the shell decides where to go. It is
deliberately thin and goes away in P05.

Inputs → outputs:
- `startWithDefaults({ profile, settings, weight, clock? }, localeTag)` →
  `{ profile, created }`: the profile now stored and whether this call made it. Rejects with
  `ProfileUnreadableError` (writing nothing) when the stored profile cannot be read.
- `quickStartAction({ db, profile, settings, bus?, clock? }, localeTag)` → the `onStart`
  action for the screen: the shell's two repositories plus a weight repository it makes on the
  same database (the shell cannot import repositories, lint rule 2).
- `<QuickStart onStart={() => Promise<unknown>} onDone={() => void} />`.

Files: created `src/services/quickStart.ts`, `src/services/quickStart.test.ts`,
`src/features/onboarding/QuickStart.tsx`, `src/features/onboarding/QuickStart.test.tsx`,
`src/features/onboarding/onboarding.module.css`, `src/i18n/en/onboarding.ts`; changed
`src/i18n/en.ts` (import line and the `onboarding` entry: shared).

Edge cases / failure modes:
- A profile already exists (another tab finished first, a retry after a half-done start): it
  is kept as it is, units are not touched, and the weigh-in is seeded only when the history is
  empty (from the stored profile's weight), then onboarding is marked done. Nothing is
  overwritten.
- A stored profile that cannot be read: refuse and write nothing (corrupt never passes for
  missing, R01.17); the boot gate shows its recovery card for that case anyway.
- A write fails half-way: onboarding is marked done last, so the person sees the screen again
  and can press once more; units are written before the profile, so a retry that finds the
  profile already saved also finds the units. Nothing is duplicated (the weigh-in seed is
  skipped when any weigh-in exists).
- Double press: the Button is busy while the action runs, so it runs once.
- The action fails: a short alert says the start could not be saved; the button works again;
  `onDone` is not called.
- An unusable locale tag: metric (P01-04's rule).
- Today's date for the default birth date: the local day of the clock's instant.

Our design differences / decisions:
- The action takes the repositories (the profile and settings repositories the shell already
  has, and a weight repository) rather than opening its own, so no second settings feed or
  `settings-loaded` announcement is created. Narrow `Pick<>` types keep test fakes small.
- No single transaction across the three repositories: the write order above makes every
  partial outcome safe to retry, and keeps the service out of `transact`.
- Only what the P04-09 row lists: no tune-up check day, Home sort, reminders or AI settings
  (P05-07's real completion does those).
- The heading is the app name, so the e2e smoke test keeps finding "Platewise" once the
  route shows this screen.
- A `<section>` named by its heading, not `<main>`: the shell owns the page's main landmark.

Tests we will write:
- Service: stores the default profile, en-GB metric units, one 70 kg weigh-in at now and
  `onboarding.done`; en-US starts in lb and ft/in (D-16.10).
- Service: an existing profile is kept, units untouched, no second weigh-in, done marked; with
  no weigh-ins yet it seeds the stored weight.
- Service: running it twice changes nothing more.
- Service: an unreadable profile refuses and writes nothing.
- Service: a failed weigh-in write leaves onboarding not done; a retry finishes it.
- Screen: heading is the app name; the button is found by role and name with its hook.
- Screen with the real action on a test database: the press stores the default profile, one
  weigh-in and `onboarding.done`, then `onDone` shows Home (P04-09 Verify).
- Screen: a double press runs the action once; a failed action shows the alert, does not call
  `onDone`, and the button works again.

Compare checklist (filled after the rewrite; no reference to reopen):
- [x] P04-09 Verify: default profile, one weigh-in, `onboarding.done`, then Home (tested in
      `src/features/onboarding/QuickStart.test.tsx > QuickStart > stores the default profile, one
      weigh-in and onboarding done, then shows Home (P04-09)`; `src/services/quickStart.test.ts >
      startWithDefaults > stores the default profile, the region’s units, one weigh-in and
      onboarding done`; `> quickStartAction > runs the start with the shell’s repositories and a
      weight repository on the same database`)
- [x] Units from the browser locale (D-16.10) (tested in `src/services/quickStart.test.ts >
      startWithDefaults > starts a US browser in pounds and feet and inches, energy in kcal
      (D-16.10)`)
- [x] Existing profile not harmed (tested in `src/services/quickStart.test.ts > startWithDefaults
      > keeps a profile that is already there, its units and its weigh-ins`, `> seeds a kept
      profile’s own weight when it has no weigh-ins yet`, `> changes nothing more when it runs a
      second time`, `> refuses an unreadable profile and writes nothing (R01.17)`)
- [x] Partial failure is safe to retry (tested in `src/services/quickStart.test.ts >
      startWithDefaults > leaves onboarding not done when a write fails, and a retry finishes the
      start`)
- [x] Screen: app name heading, hooks, busy blocks a double press, failure shown and retryable
      (tested in `src/features/onboarding/QuickStart.test.tsx > QuickStart > shows the app name
      as its heading and one start button with its hook`, `> runs the start once on a double
      press`, `> says so when the start fails, stays put and lets the person try again`)
- Deliberate differences: no reference counterpart (the reference always runs its onboarding);
  this screen is temporary and P05-07 deletes it.
- Not taken: tune-up check day, Home sort, reminders, AI settings and terms (P05-07's
  completion); a body-fat seed (only when entered, P05).

## Decisions for the lead

- **Wiring** (the lead, at land time): the onboarding route renders
  `<QuickStart onStart={quickStartAction({ db, profile, settings }, navigator.language)}
  onDone={() => navigate('#/home')} />` with the database and the profile and settings
  repositories from the shell's AppData (memoise the action per AppData). `src/app` cannot
  import `createWeightRepo` (lint rule 2), so `quickStartAction` makes the weight repository.
- **Not atomic across repositories**: the write order (units, profile, weigh-in seed, then
  `onboarding.done`) makes every partial outcome safe to retry instead; no `transact` in the
  service.
- **An existing readable profile is kept** (units untouched, weigh-in seeded only into an
  empty history, onboarding marked done); an unreadable one refuses with
  `ProfileUnreadableError` and writes nothing.
- **Copy** lives in the new `onboarding` partition (`onboarding.quickStart.*`); P05 grows it.

## Status

Done (2026-10-26). Service (8 tests) and screen (4 tests); `src/i18n/en.ts` gained the import
line and the `onboarding` entry (shared with the lead). Handed on: the lead wires the onboarding
route at land time (above); P05-07 deletes `QuickStart.tsx`, its test, its stylesheet and
`src/services/quickStart.ts` and points the route at the wizard; P05 grows the `onboarding`
partition.
