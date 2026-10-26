# Task: temporary quick start, and the shell on stored data (P04-09) · Phase: 04 · Owner: builder (wt-p04s4, slice S4)

Read (reference @ `10e14b67`): none for the screen (the phase file lists none: the quick start is
ours and temporary). For the wiring: research spec `05-home-progress.md` §5 and R05.12 (hold until
the profile is read), `06-settings-data.md` R06.4 (an open failure never deletes), R06.22 (settings
gate on "loaded"); `01-profile-goals.md` (first-run defaults, R01.18 units from one locale
decision); the P02 notes for the profile, settings, weight and fasting repositories ("Boot should
call `fastRepo.settleOnOpen(now)` once after the database opens"); decision D-16.10 (units from the
browser locale).

What it does (own words):
- `QuickStart` is the one screen the onboarding address shows until P05 builds the real onboarding
  (P05-07 deletes it). It shows the app's name as its heading, one short line, and a "Start with
  defaults" button. The button asks the onboarding service to set the person up with the standard
  first-run profile (P01-15) and the units their browser's locale suggests (P01-04), seed their
  first weigh-in from that profile, and mark onboarding as done. Nothing on the screen navigates:
  the shell's start-up state turns `ready` once the profile and the done flag are stored, and the
  boot gate (P04-07) then replaces the address with Home. A failed save shows a short toast and the
  button works again.
- `startWithDefaults(now, locale)` writes, in order: the default profile for today (local day of
  `now`), the three unit settings (energy, height, weight) so a later locale change never flips
  them, the first weigh-in (only when none is stored), and last `onboarding.done`, so the shell can
  never read `ready` before everything else is stored.
- `src/services/shell.ts` adapts the repositories to the shell's ports: the boot store reads the
  profile and the done flag (`needsOnboarding` until a profile is stored and the flag is on, then
  `ready`; a read that fails shows the recovery card); the settings store reads appearance, accent
  and the hidden tabs. Both are live (Dexie live queries through `src/data/live.ts`), so a write in
  this tab or another one reaches the shell, and each returns the same snapshot object until its
  value changes (`useSyncExternalStore`).
- `src/services/context.tsx` carries the services (diary, onboarding, a clock) to screens:
  `ServicesProvider` and `useServices()`.
- `src/main.tsx` is the composition root: it shows the start-up skeleton at once, opens the
  database, and on success creates each repository once, ends a fast left running with tracking
  off (`fastRepo.settleOnOpen`), builds the ports and the services, and renders the app inside the
  services provider. An open failure renders the recovery card (boot `openError`) and deletes
  nothing.

Inputs → outputs:
- `createOnboardingService({profileRepo, settingsRepo, weightRepo})` →
  `{startWithDefaults(now, locale): Promise<void>}` (rejects when a write fails; what was written
  stays and a second press finishes the job without a second weigh-in).
- `createShellPorts({profileRepo, settingsRepo})` → `ShellPorts`; `openErrorPorts()` → ports with
  boot `openError` and default settings; `openingPorts()` → ports that are not read yet (skeleton).
- `ServicesProvider({services})`, `useServices()` → `{diary, onboarding, clock}`.
- `QuickStart` (no props) → the screen.

Files: created `src/services/onboarding.ts`, `src/services/onboarding.test.ts`,
`src/services/shell.ts`, `src/services/shell.test.ts`, `src/services/context.tsx`,
`src/services/context.test.tsx`, `src/features/onboarding/QuickStart.tsx`,
`src/features/onboarding/QuickStart.test.tsx`, `src/features/onboarding/onboardingText.ts`,
`src/features/onboarding/quickStart.module.css`, `src/i18n/en/onboarding.ts`, this note. Changed
(shared): `src/main.tsx`, `src/app/App.tsx` (QuickStart on the onboarding route),
`src/app/App.test.tsx` (the app now needs the services provider); deleted
`src/app/OnboardingPlaceholder.tsx`.

Edge cases / failure modes:
- A stored profile that cannot be read counts as a profile: damaged data must never send the
  person back through onboarding (the profile repository's rule). With the done flag on, the app
  opens.
- A profile without the done flag (a write that stopped half way) → onboarding again; pressing the
  button again overwrites the profile with the same defaults, keeps the one weigh-in and sets the
  flag.
- The flag without a profile (a damaged restore) → onboarding.
- A weigh-in already stored (data from before) → no second one; the profile weight is not touched
  by the seed in that case.
- The live read fails → boot `openError` (the recovery card asks for a reload); settings fall back
  to the defaults so the card is still themed.
- `openDb` fails → recovery card; nothing is deleted. `settleOnOpen` fails → logged, the app still
  opens (a stuck fast only blocks food logging, which the repository refuses anyway).
- A double press on the button: `Button` ignores presses while the returned promise runs.
- The locale tag is unreadable → metric (the units module's rule).

Our design differences / decisions:
- The screen never navigates itself: the boot gate's redirect (ready on the onboarding address →
  Home, replacing the address) is the one place that leaves onboarding, so Back never returns to
  the quick start.
- Units are stored explicitly at the start (the settings schema would otherwise recompute height
  and weight units from whatever the browser's language is at each read).
- The onboarding partition is read through `src/features/onboarding/onboardingText.ts` (a
  translator over the catalogue plus the partition) until the lead adds it to `en.ts`.
- The first render shows the skeleton before the database opens; the second render (database open)
  remounts the app under the services provider. Only the skeleton is replaced, so nothing flashes.

Tests we will write:
- `onboarding.test.ts`: stores the default profile, en-US units, one weigh-in at `now` and the
  done flag; en-GB gives metric; the flag is written last; a retry after a failed flag write keeps
  one weigh-in.
- `shell.test.ts`: boot needs onboarding with nothing stored, with only a profile, with only the
  flag; ready with both; a damaged profile with the flag is ready; a failed read is `openError`;
  the same snapshot object until the value changes; settings read from the repository with
  defaults, follow a change, and keep their object when an unrelated setting changes;
  `openErrorPorts`, `openingPorts`.
- `context.test.tsx`: `useServices` returns what the provider holds and throws without one.
- `QuickStart.test.tsx`: the app name as the heading, the line and the button, all catalogue text;
  the button calls the service with the clock's now and the browser locale; a failure shows the
  toast; on a fresh database the button stores the default profile, one weigh-in and the flag, then
  shows Home, and a fresh app over the same database opens on Home (the reload); the onboarding
  partition passes the catalogue lint merged with the rest.
- `App.test.tsx`: the existing boot tests, now inside a services provider; the onboarding address
  shows the quick start.
- e2e smoke (unchanged) still finds the app name; a hand check in Chromium: fresh load → quick
  start → Home → reload stays on Home.

Compare checklist (filled after the rewrite; no reference screen to reopen: checked against the
phase row's Verify column and the research rules named above):
- [x] The button stores the default profile, one weigh-in and `onboarding.done`, then shows Home
      (`QuickStart.test.tsx > quick start on a fresh database (P04-09) > stores the default
      profile, one weigh-in and onboarding done, then shows Home`), and a reload stays on Home
      (`> opens on Home again after a reload`); by hand in Chromium (Pixel 7 profile, production
      build): fresh load → quick start; button → `#/home` with the tab bar; reload → Home;
      typing `#/onboarding` → Home; stored rows checked in IndexedDB; no page or console errors
- [x] Units from the browser locale, height and weight from one decision, stored explicitly
      (R01.18, D-16.10) (`onboarding.test.ts > startWithDefaults > stores the default profile, the
      locale units, one weigh-in and onboarding done`, `> stores metric units for a metric locale`;
      `QuickStart.test.tsx > QuickStart > starts with the defaults at the clock's now and the
      browser's locale`)
- [x] The shell never reads ready early (`onboarding.test.ts > startWithDefaults > writes
      onboarding done last`); a half-finished start can be finished (`> finishes on a second try
      after a failed write, still with one weigh-in`; `QuickStart.test.tsx > QuickStart > says so
      when the save fails, and lets the person try again`)
- [x] Boot state from stored data, live (`shell.test.ts > boot store > reads nothing before anyone
      listens, then needs onboarding with nothing stored`, `> needs onboarding with a profile but
      no done flag, and with the flag but no profile`, `> turns ready once the profile and the done
      flag are stored`, `> counts a stored profile that cannot be read, so damaged data never
      reopens onboarding`, `> shows the recovery card when the read fails`)
- [x] Settings from the repository, same snapshot object until the value changes (`shell.test.ts >
      settings store > reads the appearance, the accent and the hidden tabs, defaults filled in`,
      `> follows a change, and keeps its object while only other settings change`, `> falls back
      to the default settings when the read fails`)
- [x] An open failure shows the recovery card and deletes nothing (R06.4) (`shell.test.ts > fixed
      ports > shows the recovery card in the default theme when the database cannot be opened`;
      `main.tsx` only reads the error; `openDb` itself is P02-01's and tested there); the skeleton
      while the database opens (`> reads nothing while the database is opening`)
- [x] All copy from the catalogue; the e2e smoke still finds the app name (`QuickStart.test.tsx >
      QuickStart > shows the app name as its heading, one line and the start button, all catalogue
      text`, `> passes the catalogue lint merged with the other partitions`; `App.test.tsx > App >
      shows only text from the catalogue`; `e2e/smoke.spec.ts` 1/1)
- [x] Screens act through the services (`context.test.tsx > useServices > returns the services
      the provider holds`, `> throws without a provider`; lint rule 2 clean)
- Deliberate differences: a single temporary screen in place of the reference's onboarding flow
  (P05 builds the real one); the screen never navigates, the boot gate leaves onboarding by
  replacing the address.
- Not taken: everything of the real onboarding (P05).

## Decisions for the lead

- `src/i18n/en.ts`: add the `onboarding` partition (`import { onboarding } from './en/onboarding'`
  and `onboarding` in `enPartitions`). Then `src/features/onboarding/onboardingText.ts` can become
  `export const onboardingT = t;` (or QuickStart can call `t` and the file goes).
- Boot: a stored profile that cannot be read counts as a profile (with the done flag on, the app
  opens), following the profile repository's rule; a failed live read shows the recovery card
  (`openError`), and the settings store then falls back to the defaults.
- `Services` = `{diary, onboarding, clock}`; `ServicesProvider` wraps `App` in `main.tsx` (and in
  tests that reach onboarding). QuickStart passes `clock.now()` and `currentLocale()` (the
  browser's language, canonical).
- `main.tsx` renders the skeleton (`openingPorts()`) before the database opens, then the app inside
  the provider: the second render remounts the tree once (only the skeleton is on screen). Any
  `openDb` failure renders `openErrorPorts()` and logs the error; a failing `settleOnOpen` is
  logged and the app still opens.
- D-16.8 wiring: `main.tsx` passes no `onFirstEntry` yet; when `src/data/storage.ts` lands, pass
  `onFirstEntry: () => requestPersistence()` to `createDiaryService` (a comment marks the spot).
- Follow-ups not done here (outside this slice's files): `temporaryPorts()` in `src/app/ports.ts`
  is now used only by `App.test.tsx`; the `.onboarding` rule in `src/app/shell.module.css` is no
  longer used (QuickStart has its own `quickStart.module.css`); nothing listens yet for the bus's
  `reload-needed` (P02-01 posts it when another tab upgrades or deletes the database) or `erase`.
- Bundle after this slice: 121.09 kB gzip initial JS (Dexie and the repositories now load at start).

## Status

Done (2026-10-26). Created the services, the quick start, its partition and their tests (all
passing). Changed outside the new files (shared): `src/main.tsx` (owned), `src/app/App.tsx` (the
onboarding route renders QuickStart), `src/app/App.test.tsx` (wrapped in the services provider; the
onboarding text check now includes the quick start's words); deleted
`src/app/OnboardingPlaceholder.tsx` (nothing else used it).
