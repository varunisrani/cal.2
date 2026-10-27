# Task: restore from a file on Welcome (P09-14) · Phase: 09 · Owner: builder (wt-p09s14)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../ui/onboarding/ReturningUser.kt` (the state machine:
phases, busy, closed, retried, finish actions), `android/.../ui/onboarding/ReturningUserStep.kt`
(state parts only: when the back chevron shows, which buttons each phase offers, the relaunch after
a restored setup), the test list of `android/.../test/.../ui/onboarding/ReturningUserStateTest.kt`
(leaving and retrying). Research spec `01-profile-goals.md` §3.4 (completion after a restore) and
§3.5 (returning user), §5 (the web form of it); decisions D-16.30, D-16.42; the P09-13 note
(`backup-and-restore.md`: `RestoreSheet`, `onRestored(summary)` with `hasProfile` and
`onboardingDone`). No REA evidence for this task.

What it does (own words): Welcome's "Restore from a backup file" opens the browser's file picker.
Picking a file swaps Welcome for a small restore screen and opens the P09-13 restore sheet over
it: the file is checked whole, the sheet says when the backup was made and what it holds, and
nothing changes until Restore. Once Restore is pressed the screen is locked until the restore has
finished: the sheet cannot be dismissed, the screen's Back is disabled, and closing or reloading
the tab asks first. Then: a backup that held a profile and a finished setup offers "Open Platewise",
which goes to Home with nothing seeded (no weigh-in, no tune-up defaults); a backup without a
finished setup offers "Continue setup", which opens the wizard at its first question (Sex) over the
restored data; the restored diary, photos, chat and settings stay, and finishing the wizard stores
its answers as any completion does. A refused file or a failed restore changed nothing and says
why, with "Try again" (pick another file) and "Start fresh" (the wizard from its first question).

Inputs → outputs: a picked `File` → the backup service's `inspect` / `apply` (through
`RestoreSheet`) → one of: Home (restored setup), the wizard at Sex with `restored` completion
(data but no setup), the problem screen (nothing changed), or Welcome again (Cancel / Back).

Files: created `src/features/onboarding/RestoreFromFile.tsx`, its test, this note. Changed:
`src/features/onboarding/OnboardingRoute.tsx` (the file input behind Welcome's link, the restore
screen on demand, Continue setup / Start fresh into the wizard), `src/i18n/en/onboarding.ts`
(additive `restore` keys). Shared, additive: `src/features/settings/data/RestoreSheet.tsx` (two
optional props: `onRestoring`, `onProblem`), `src/app/appState.ts` (`onboardingHeld` and
`holdOnboarding`) with its test, `src/app/Boot.tsx` (a held onboarding is not sent to Home) with a
test in `Boot.test.tsx`.

Edge cases / failure modes:
- The start-up gate is live: the moment a restore commits a profile with `onboarding.done`, it
  would send the app to Home and the restore screen would vanish mid-way. The restore screen holds
  onboarding on screen (shared UI state) from the moment a file is picked until "Open Platewise",
  or until it is left; Open Platewise only releases the hold, and the gate moves to Home.
- Back (the browser's) while the sheet asks = Cancel → Welcome. Back while restoring closes only
  the sheet: the restore runs on, the screen shows that it is restoring with Back disabled, and the
  result follows.
- Closing or reloading the tab while restoring: a `beforeunload` prompt. If the page goes anyway,
  the one IndexedDB transaction is not committed, so nothing changed and Welcome shows again.
- A backup with a profile but no done flag, or a done flag but no profile, is not a finished setup
  (the gate would not open either) → Continue setup.
- After a restore the screen has no Back (Welcome's Get started would run the wizard over restored
  data as if new); Try again exists only after a refusal (re-restoring would undo the first one).
- The native picker cancelled: nothing changes (no change event).
- Picking the same file twice still works (the input is cleared after each pick).
- The restore screen and the sheet are fetched on demand; Welcome itself carries only the input.

Our design differences / decisions:
- A local file instead of cloud and health sources (D-16.30, D-16.4): no source picker, no
  launch-time "returning user" signal (01 §5: none exists on the web), no health step, no relaunch:
  the gate follows the stored data live, so "Open Platewise" just lets it move to Home.
- The confirmation is the shared restore sheet (D-16.42, R06.8), not a second dialog.
- Start fresh after a refusal goes to the wizard's first question (Welcome is one Back away).
- Continue setup starts a fresh wizard (locale units, default answers), not one pre-filled from a
  restored profile: the reference pre-fills only from health readings, which we do not have.
- Continue setup finishes like any completion (`complete(answers, {now})`, without `restored`).
  Every seed there only fills what is empty (`seedFirst` writes a weigh-in or body-fat reading
  only into an empty history), the units and reminders are what the person just chose, and the
  plan was just built, so its tune-up week starts today. With `restored`, a backup that never
  stored `tuneUp.lastCheckDay` would leave it unset and the tune-up would re-run the AI over the
  new plan on the first open, and an empty restored weight history would get no first weigh-in.
  The reference also runs its normal completion on this path; only its "open app" path skips
  seeding, which is our Open Platewise (no completion at all: the done flag is restored).
- Decisions for the lead: (1) the "hold" lives in `AppState` (`onboardingHeld`), read by `Boot`;
  the alternative (restoring without the done flag and writing it on Open Platewise, as one
  reference platform does) would strand a person who closes the tab before pressing it, and needs
  the backup service to change. (2) `OnboardingService.complete`'s `restored` option is now unused
  (see above); drop it or keep it for a later path. (3) A backup with the done flag but no profile
  (a profile row that was unreadable on the device that made it): finishing the continued wizard
  writes the profile first, so the gate opens Home a moment before the last completion writes
  land (they still land; only a failure there would go unseen). Holding onboarding during
  completion would close it; not done here.

Tests we will write (`RestoreFromFile.test.tsx`, over the real backup service, the live gate and
Home):
- the Welcome link opens the picker; a complete backup previews, restores after Restore, shows Open
  Platewise while the gate already reads ready, and lands on Home with its entries; no weigh-in or
  tune-up default was written (ACC-B10-1).
- a backup without a profile → Continue setup → the wizard at Sex with the restored entries kept;
  finishing the wizard keeps the restored entries and adds no weigh-in to the restored history
  (ACC-B10-2).
- `restoredSetup`: only a profile and the done flag together count.
- a file that is not a backup → its message, Try again (opens the picker; a good file then
  restores) and Start fresh (the wizard at Sex); nothing changed.
- while restoring: the sheet cannot be dismissed, Back on the screen is disabled after Back closed
  the sheet, `beforeunload` is prevented; the result shows once the restore finishes.
- Cancel on the preview returns to Welcome with nothing changed.

Compare checklist (filled after the rewrite; reopened `ReturningUser.kt`, `ReturningUserStep.kt`
(state parts), `ReturningUserStateTest.kt`):
- [x] A restore counts as a finished setup only with a profile and the completed flag
  (`RestoreFromFile.test.tsx > restoredSetup > counts a setup as finished only with both a profile
  and the done flag`)
- [x] Finished setup → open the app with the restored data, nothing seeded (`RestoreFromFile.test.tsx
  > RestoreFromFile on Welcome > restores a complete backup after its preview and lands on Home with
  its entries, seeding nothing (ACC-B10-1)`)
- [x] Data but no finished setup → continue setup at step 1 over the restored data
  (`… > continues a backup without a profile at the Sex step, keeping its entries through to the
  end (ACC-B10-2)`)
- [x] Confirm before restoring, showing when the backup was made; cancelling restores nothing and
  can be left (`… > returns to Welcome when the preview is cancelled, changing nothing`; the preview
  itself is P09-13's `RestoreSheet.test.tsx`)
- [x] The screen cannot be left while the restore runs, and shows that it is restoring once
  confirmed (`… > cannot be left while restoring: the sheet stays, Back is disabled and closing the
  tab asks first`)
- [x] Nor once a backup was applied: no Back, no second restore (`… > restores a complete backup
  after its preview …`: no Back, no Try again)
- [x] A failure has its own message and nothing changed; it can be left, retried (picker again) or
  set up fresh (`… > shows why a bad file was refused, with Try again opening the picker for another
  file`, `… > starts the wizard on Start fresh, and Back after a refusal returns to Welcome`)
- [x] Reopening after a run that restored nothing starts over (`… > starts the wizard on Start
  fresh, and Back after a refusal returns to Welcome`: Back, then a new pick runs a new check)
- [x] A late result of an earlier run changes nothing: each pick mounts its own screen and sheet,
  and the sheet ignores a check that finishes after it closed (by construction; not tested apart)
- Gaps found on reopening: the reference moves focus nowhere special; ours moves it to the outcome
  heading once the sheet is gone (tested in the refusal test). No behaviour gap.
- Mutation check: Boot ignoring the hold fails the ACC-B10-1 test (and the rest of the file after
  its timeout); no `beforeunload` guard fails the leaving test; Back not disabled fails it too; no
  heading focus fails the refusal test.
- Deliberate differences: one local file instead of cloud and health sources (D-16.30, D-16.4);
  the shared restore sheet as the confirmation (D-16.42); the start-up gate held instead of a
  relaunch; Start fresh after a refusal (the reference offers it only on the picker, which we do
  not have); `beforeunload` as the web's "cannot leave".
- Not taken: the source picker, the launch-time returning-user signal (health grants / a
  surviving key), the step list with per-source statuses, the health import and its wizard
  pre-fill, account sign-in and consent, retrying only the health step after a restore.

## Status

Done (2026-10-27). `RestoreFromFile.tsx` with 7 tests, the Welcome link wired through
`OnboardingRoute.tsx`, the `onboarding.restore` words, this note. Shared, additive lines:
`RestoreSheet.tsx` (`onRestoring`, `onProblem`), `appState.ts` (+ test), `Boot.tsx` (+ one test in
`Boot.test.tsx`). Handed on: the lead records ACC-B10-1 and ACC-B10-2 `Test:` lines; P09-19 drives
it end to end (hooks: `wizard.restore`, `wizard.restoreFile`, `screen.welcomeRestore`,
`welcomeRestore.{back,restoring,problem,open,continue,tryAgain,startFresh}`).
