# Task: feature hooks (P02-15) · Phase: 02 · Owner: builder (wt-p02c)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The P02-15 row lists no reference files: the hooks are our own
seam between the repositories (already compared against the reference in P02-04..11) and the
screens, so there is nothing of the reference to match here. Read instead: phase file P02 (goal,
row P02-15), `04-architecture.md` rule 6 (thin UI), `00-layout-and-conventions.md` (layers), the
`SCREEN_MESSAGE` lint rule in `eslint.config.js` ("Screens read through src/data/hooks and act
through src/services"), research spec `06-settings-data.md` §6 R06.22 (settings flashing defaults)
and R06.3 (every committed write reaches every reader), the landed `src/data/live.ts`,
`src/data/useLive.ts`, every repository's read methods, `src/domain/goals/{formulas,targets}.ts`,
`src/test/db.ts`, and `src/main.tsx`.

What it does (own words): screens never touch a repository or the database. To show stored data
they call one hook from `src/data/hooks.ts`, which subscribes to a live query over one landed
repository read and re-renders whenever a committed write changes the result, in this tab or
another. Each hook is a single `useLive` call: it passes arguments through (a day key, a range)
and, for targets only, applies the domain's formula plan and effective-target functions to the
profile it read. The repositories reach the hooks through a small React context
(`src/data/DataProvider.tsx`) filled once by the composition root (`src/main.tsx`), so there is no
database singleton and tests render the hooks over their own fake database.

Inputs → outputs:
- `DataProvider({sources, children})`; `useDataSources()` → `DataSources` (throws without a
  provider). `DataSources` = the read methods only of `profileRepo` (`get`), `settingsRepo`
  (`snapshot`, `loaded`), `diaryRepo` (`byDay`, `between`), `waterRepo` (`byDay`), `fastRepo`
  (`between`, `active`), `weightRepo` (`between`), `bodyFatRepo` (`between`), `savedMealsRepo`
  (`list`), `coachRepo` (`list`), plus `unreadableFlag()` (reads `meta.unreadableData`) and the
  `clock` "today" falls back to.
- Hooks, every one returning `LiveState<T>` (below):
  `useProfile()` → `ProfileRead` (missing | ok | corrupt); `useSettings(keys)` → the named settings
  only; `useDayEntries(dayKey)`, `useEntriesBetween(first, last)` → `DiaryEntry[]`;
  `useDayWater(dayKey)` → `WaterLog[]`; `useFasts(first, last)` → `Fast[]`; `useActiveFast()` →
  `Fast | null`; `useWeighIns(first, last)` → `WeighIn[]`; `useBodyFat(first, last)` →
  `BodyFatReading[]`; `useSavedMeals()` → `SavedMeal[]`; `useCoachMessages()` → `CoachMessage[]`;
  `useTargets(today?)` → `TargetsRead` (missing | corrupt | ok with profile, formula plan and
  effective targets); `useUnreadableFlag()` → `boolean`.
- **Loading convention (every hook):** `LiveState<T>` from `src/data/live.ts`:
  `{status: 'loading'}` until the first read, then `{status: 'ready', value}`, or
  `{status: 'error', error}` when the read fails. No hook suspends; later UI slices switch on
  `status`.

Files: created `src/data/hooks.ts`, `src/data/hooks.test.tsx`, `src/data/DataProvider.tsx`,
`src/data/DataProvider.test.tsx`, this note. Shared: `src/main.tsx` (wraps the app in
`DataProvider`; creates the read repositories it did not create yet, once each).

Edge cases / failure modes:
- `useSettings` before `settingsRepo.loaded` resolves: loading, never defaults (R06.22); a
  failed first read (loaded rejects): the error state.
- `useSettings(['a', 'b'])` written inline: a new array every render must not restart the query
  (keys are compared by content); a change to another setting must not re-render (the picked
  object is compared structurally by `live`).
- Day keys or ranges that change: a new query, starting from loading (as `useLive` does).
- A profile that is missing (before onboarding) or unreadable: `useProfile` says which;
  `useTargets` returns no targets for it rather than inventing some.
- `useTargets()` without a day: today comes from the provider's clock; screens should pass
  `useToday()` so the plan moves on at midnight with the rest of the screen.
- Unmount stops the live query (no re-runs for a component that is gone).
- No business rules: no sorting, filtering or totals beyond what the repository returns.

Our design differences / decisions:
- Names and structure are ours; no reference counterpart.
- The context holds read methods only (`Pick<…Repo, reads>`), so a component reaching for the
  context cannot write through it; writes stay in `src/services`. `secretsRepo`, `photoRepo` and
  `draftsRepo` are not part of it.
- `useSettings` waits for `loaded` inside the live query (a Dexie promise wrapping `loaded`, so the
  snapshot read that follows stays tracked) and reports loading instead of suspending, the same
  convention as every other hook.
- `useUnreadableFlag` reads through a function the composition root builds over the landed
  `hasUnreadableData(db)`, not through the database itself: the context never carries the db.
- `hooks.ts` re-exports the types screens need (`LiveState`, `ProfileRead`, `TargetsRead`),
  because screens may not import `src/data/repos/*`.

Tests we will write:
- `DataProvider.test.tsx`: the provider hands its sources to `useDataSources`; without one the
  hook throws a clear error.
- `hooks.test.tsx` (renderHook over `openTestDb()` and real repositories):
  - every hook renders loading, then the repository's data, and renders again after a write made
    after mount (R06.3);
  - `useSettings` stays loading while `loaded` is pending (a witness hook proves reads had their
    chance) and becomes ready once it resolves (R06.22); a rejected `loaded` is the error state;
    an inline keys array does not restart the query; a change to another key does not re-render;
  - `useTargets`: missing, corrupt, then the formula plan and effective targets of the stored
    profile; follows a saved-target change; uses the caller's day, else the provider's clock;
  - `useUnreadableFlag` turns true once something is kept aside;
  - a new day key switches the query; unmount stops the subscription (`countRuns`, witness hook);
  - `settleQuarantine` before closing each database.

Compare checklist (filled after the rewrite; no reference files to reopen, compared against the
P02-15 row, the task's decisions and the lint message):
- [x] Every hook listed in the row exists, is one `useLive` call over a landed repository read,
  renders loading first and follows a write made after mount (R06.3) (`src/data/hooks.test.tsx >
  each hook renders loading, then the stored data, and follows a write after mount (R06.3) >
  useProfile`, `> useSettings`, `> useDayEntries`, `> useEntriesBetween`, `> useDayWater`, `>
  useFasts and useActiveFast`, `> useWeighIns`, `> useBodyFat`, `> useSavedMeals`, `>
  useCoachMessages`, `> useUnreadableFlag`).
- [x] `useSettings` waits for `loaded` (R06.22): loading while it is pending, the snapshot is not
  even read meanwhile, and no default is ever shown (`hooks.test.tsx > useSettings > stays loading
  until the first settings snapshot has been read (R06.22)`; fails with the gate removed); a failed
  first read is the error state (`> shows the error state when the first snapshot cannot be
  read`).
- [x] Keys compared by content, unrelated settings do not re-render (`hooks.test.tsx > useSettings
  > keeps its query when it renders again with an equal list of keys`, fails with `[keys]` as the
  dependency, which also loops on an inline array; `> does not render again when only another
  setting changes`, uses `countRuns` to prove the re-run happened and was dropped).
- [x] `useTargets` follows a saved-target change and uses the caller's day, else the clock's
  (`hooks.test.tsx > useTargets > gives the formula plan and the targets in effect, and follows a
  saved-target change`, `> counts age on the day it is given, else on the provider clock's day`,
  `> has no plan before onboarding, nor for a profile that cannot be read`).
- [x] Unmount stops the subscription; new deps switch the query (`hooks.test.tsx > subscriptions >
  stops the query when the component unmounts`, `countRuns` with a witness; `> switches to the new
  day when the day key changes`).
- [x] Provider seam, no singleton (`src/data/DataProvider.test.tsx > useDataSources > returns the
  sources the provider holds`, `> throws without a provider`); `src/main.tsx` wraps the app (e2e
  smoke passes on the build).
- Deliberate differences: none against a reference (there is none). Against the row: the test
  file is `hooks.test.tsx` (it renders a provider), and `useSettings` reports loading rather than
  suspending, so every hook has one loading convention.
- Not taken: hooks for reads no screen needs yet (`weightRepo.history`/`latest`,
  `bodyFatRepo.history`/`latest`, `fastRepo.list`, `diaryRepo.since`, `savedMealsRepo.isSaved`,
  `coachRepo.generation`): add each with the screen that needs it.

## Decisions for the lead

- Loading convention for every read hook: `LiveState<T>` (`{status: 'loading'}` |
  `{status: 'ready', value}` | `{status: 'error', error}`), re-exported from `src/data/hooks.ts`.
  No hook suspends.
- `DataSources` (in `src/data/DataProvider.tsx`) holds the read methods only (`Pick` of each
  repository), `unreadableFlag()` and a `clock`. `main.tsx` now also creates the water, body-fat,
  saved-meal and Coach repositories, and shares one diary and one weight repository between the
  services and the hooks (they were created inline before).
- `useSettings(keys)` returns only the named keys (`Pick<Settings, K>`); keys are compared by
  content.
- `useTargets(today?)` → `TargetsRead`: `{kind: 'missing'}` | `{kind: 'corrupt'}` (no raw value)
  | `{kind: 'ok', profile, formula, targets}`. Screens should pass `useToday()`; the provider's
  clock is the fallback.

## Notes for later waves

- Screens may not import `src/data/repos/*`, so `ProfileRead` and `LiveState` come from
  `src/data/hooks.ts`.
- To count runs of an async repository read (`settingsRepo.snapshot`, `profileRepo.get`) with
  `countRuns`, wrap it in `Dexie.Promise.resolve(...)` (see `hooks.test.tsx`).
- Initial JS is 123.08 kB gzip after this change (the four repositories now load at start-up).
- Nothing clears `meta.unreadableData` yet (K9 dismiss), as before.

## Status

Done (2026-10-26). `src/data/hooks.ts`, `src/data/DataProvider.tsx` and their tests are in place.
Shared: `src/main.tsx` (imports, `render` takes the data sources, the repositories the hooks read
are created once, the top comment names the sources). Unit: `hooks.test.tsx` 20,
`DataProvider.test.tsx` 2, all passing (three runs in a row, one worker); e2e smoke 1/1.
