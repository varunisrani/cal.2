# Task: Fasting flows, editor and settings (P07-07) · Phase: 07 · Owner: builder (wt-p07s2b, slice S2b)

Read (reference @ `10e14b67`): `I/Views/FastingViews.swift` (all: the start goal chooser, the
default-goal chooser and the fast editor; the two row views only for context, they are P07-05);
`A/ui/home/HomeScreen.kt` lines 1235–1527 (the fast rows, the goal chooser with − / +, the fast
editor with its date-and-time rows, End fast now, Cancel / Delete and Save); tests
`IT/FastingStoreTests.swift` (all: start, end, edit, delete, cancel, overlap refused, food blocked
until the fast ends, tracking off completes the fast and keeps water). Research spec
`05-home-progress.md` §3.7 (and §3.3.3–3.3.4 for the rows and the editor's entry point, §3.4 for the
+ menu's fasting page); `06-settings-data.md` §3.4 (Tracking page: the fasting switch and default
goal). Decision D-16.35 (food paused during a fast, and the dialog also offers "End fast and log").
Traps R05.1, R05.2, R05.3 (R05.20, the goal alert, is P09-08). Acceptance ids reviewed by P07-07:
ACC-D27-1, ACC-H6-1, ACC-H7-1, ACC-H9-1, ACC-J10-1 (fasting half). Already in place: the P01-08
fasting rules (`src/domain/trackers/fasting.ts`), the P02-09 fast repository (`fastRepo`: start,
end, cancel, edit, endNow, remove, setTracking, settleOnOpen), `diaryRepo.endFastAndAdd` (P02-06)
and the diary and copy services' `fastActive` answers.

What it does (own words): fasting is an optional tracker, off until the person turns it on on
Settings › Tracking & reminders, where it then also offers a default goal (a wheel of 1 to 168
hours, 16 by default). A fast is started from a small sheet that opens on the default goal with a
− / + stepper (1–168 h) and starts now. Tapping a fast (P07-05 wires the tap) opens its editor:
Started (date and time), Ended for a finished fast (never before Started), the goal in hours.
A running fast can be ended now with the edits applied in the same single write, or cancelled
(deleted, never in history); a finished fast can be deleted. Save applies the edits and keeps a
running fast running; Cancel drops them. Any change the fasting rules refuse (it would share time
with another fast) shows "overlaps another fast" with a hint and changes nothing. Turning fasting
off ends a running fast (it stays in history) so food can be logged again. While a fast runs every
food write is refused by the store; each food path (review, manual entry, copy a day) then shows
one shared dialog, "Food logging is paused", offering "End fast and log" (ends the fast and logs
the food together) or Cancel (keeps the fast, logs nothing, the sheet stays as it was).

Inputs → outputs:
- `src/services/fasting.ts` `createFastingService({fastRepo, diaryRepo, settingsRepo, clock,
  newId?, onFirstEntry?})`: `start(goalMin)`, `end(id)`, `cancel(id)`, `edit(id, changes)`,
  `endNow(id, edits)`, `remove(id)` → the repository's `Result<Fast, FastRefusal>` (now from the
  clock); `setTracking(on)` → the fasts it ended; `setDefaultGoal(minutes)` → the stored, clamped
  minutes; `endFastAndLog(draft, ctx)` → `{kind:'logged', entry, endedFast}` or `{kind:'ignored'}`
  (a second call while one is writing), one transaction through `diaryRepo.endFastAndAdd`.
- `StartFastSheet` {open, onClose, onStarted?} → reads `fasting.defaultGoalMin`; Start calls
  `start(hours × 60)`; a refusal is said in the sheet and nothing starts.
- `FastEditor` {open, fast, onClose} → Save `edit`, End fast now `endNow`, Cancel fast `cancel`,
  Delete fast `remove`; overlap / another-active refusals → the overlap dialog; a fast gone or
  already ended elsewhere → a toast and the editor closes.
- `FastingSettings` (no props) → the Fasting card: the switch, then (when on) the default goal
  row opening a wheel sheet on the router's sheet stack.
- `PausedDialog` {open, onEndAndLog, onCancel} → the shared dialog; `onEndAndLog` may return a
  promise (busy until it settles). Review and manual entry call `fasting.endFastAndLog` with the
  draft and context the refused log had; copy a day ends the fast and copies again (see
  decisions).

Files: created `src/services/fasting.ts` (+ test), `src/features/fasting/{StartFastSheet,FastEditor,
FastingSettings,PausedDialog}.tsx` (+ tests), `src/features/fasting/hours.ts`,
`src/features/fasting/fasting.module.css`, `src/features/fasting/testing/openFasting.tsx`,
`src/i18n/en/fasting.ts`. Shared, additive: `src/services/context.tsx` (`fasting?`),
`src/main.tsx` (builds it), `src/i18n/en.ts` (the partition),
`src/features/settings/tracking/TrackingPage.tsx` (mounts `FastingSettings` in its marked place)
and its test. Changed lines: `src/features/log/review/ReviewSheet.tsx`,
`src/features/log/ManualSheet.tsx`, `src/features/log/CopyDaySheet.tsx` (their paused toast or
dialog becomes `PausedDialog`) and the paused tests in their test files. The reuse sheets never
log (a pick opens the review), so they have nothing to change.

Edge cases / failure modes:
- Start while a fast runs (another tab) or while a stored finished fast ends after now: refused,
  said in the sheet, nothing stored.
- Editor fields left alone keep the stored values exactly (a start with seconds, a goal of 90 min
  from an import), so an untouched Save never moves a fast onto a neighbour by rounding.
- Started moved past Ended: Ended follows (shown and saved as the later of the two); Ended cannot
  be picked before Started; neither can be after now.
- Save on a running fast never sends an end, so a fast ended meanwhile elsewhere stays ended.
- End fast now with a start that meets the previous fast: refused; the fast keeps running with its
  stored start (R05.3, one write).
- Refusal `active` (two running fasts would meet) reads as the overlap message; `missing` /
  `notActive` (deleted or ended elsewhere) → a toast and the editor closes.
- Turning fasting off while a fast runs: the fast ends in the same transaction as the switch and a
  toast says so; the switch is held while the write runs; a failed write says so.
- Settings not yet read: the card draws nothing (never a switch at its default, R06.22); the start
  sheet's Start stays disabled until the default goal is read.
- End fast and log when the fast already ended elsewhere: the entry is still stored (the repository
  ends nothing then); a storage failure stores neither and says so; the dialog answers once.
- The paused dialog's Cancel keeps the sheet and what was typed; Log can be pressed again.

Our design differences / decisions:
- Names, copy, layout and hooks are ours. The start sheet uses the − / + stepper (Android); the
  default goal uses a wheel (both platforms' settings). Dates and times are native inputs.
- "End fast and log" in the paused dialog (D-16.35); the reference only says logging is paused.
- Started and Ended cannot be later than now (the reference allows a future start, which would make
  a running fast with no elapsed time). Recorded for the lead.
- Untouched editor fields keep their exact stored values (the reference rebuilds them from the
  pickers, dropping seconds).
- Turning fasting off says, in a toast, that the running fast was ended and kept.
- A refusal shows our own title and hint; the start sheet says why a start was refused instead of
  doing nothing.
- The default-goal wheel and the start stepper both work in whole hours; a stored goal that is not
  a whole hour shows its hour floor and is kept exactly unless changed.

Tests we will write:
- `src/services/fasting.test.ts`: start now with the goal clamped; a second start refused;
  end / cancel / remove; edit keeps an active fast active; endNow one write, refused leaves the fast
  as stored; setTracking(false) ends the running fast (R05.2); setDefaultGoal clamps;
  endFastAndLog ends the fast and stores the entry in one transaction, and a failing entry write
  leaves the fast running (D-16.35, ACC-D27-1); the first entry hook.
- `StartFastSheet.test.tsx`: seeded with the default 16 h and starts a fast now, active
  (ACC-H7-1); the stored default (20 h) seeds it; the stepper stays within 1–168; a running fast
  refuses the start with a message; Cancel starts nothing.
- `FastEditor.test.tsx`: active and completed layouts and titles; Save keeps an active fast active
  with the new start and goal; End fast now applies the edited start and goal and ends it in one
  write (ACC-H8-1, R05.3); an edit overlapping another fast shows the message with its hint and
  changes nothing (ACC-H9-1, R05.3); End fast now refused by an overlap keeps the fast running;
  Ended never before Started; untouched Save keeps the exact start; Cancel fast deletes a running
  fast and Delete fast a finished one (ACC-H7-1); Cancel discards.
- `FastingSettings.test.tsx`: off by default with only the switch; on → the default goal row
  (ACC-J10-1, ACC-H6-1's setting half); off ends the running fast, keeps it, says so, and food logs
  again (ACC-H10-1, R05.2); the goal wheel 1–168 h opens on the stored goal and saves minutes;
  nothing drawn before the settings are read (R06.22).
- `PausedDialog.test.tsx`: the dialog's words and actions; logging from the review during a fast
  shows it and writes nothing (R05.1); End fast and log ends the fast and logs in one step
  (ACC-D27-1, D-16.35); Cancel keeps the fast and the review.
- Updated: `ReviewSheet.test.tsx`, `ManualSheet.test.tsx`, `CopyDaySheet.test.tsx` (the paused
  dialog instead of the toast or the old dialog; End fast and log from manual entry and copy);
  `TrackingPage.test.tsx` (fasting rows only while fasting is on, ACC-J10-1).

Compare checklist (filled after the rewrite; reopened `I/Views/FastingViews.swift` (the start
sheet, the default-goal sheet, the editor), `A/ui/home/HomeScreen.kt` 1366–1527 (goal chooser and
editor), `IT/FastingStoreTests.swift`):
- [x] start: a goal in whole hours 1–168 seeded with the default, starting now
      (`StartFastSheet.test.tsx > StartFastSheet > opens on the default 16 hours and starts a running
      fast now (ACC-H7-1)`, `> opens on the stored default goal and starts with the hours picked`,
      `> keeps the goal between 1 and 168 hours`; `src/services/fasting.test.ts > fasts > starts a
      fast now with its goal held to 1 h – 7 days, and refuses a second one`)
- [x] one fast at a time; a start meeting a stored fast is refused and stores nothing
      (`StartFastSheet.test.tsx > StartFastSheet > says a fast is already running and starts nothing
      (R05.3)`, `> says a logged fast ending after now blocks the start`)
- [x] + menu End and Cancel act at once: the service's `end` and `cancel` (the menu rows are
      P07-08) (`src/services/fasting.test.ts > fasts > ends the running fast now, and cancels a
      running one so it leaves no history`)
- [x] editor: title Active fast / Edit fast; Started; Ended for finished fasts only; goal 1–168 h;
      End fast now + Cancel fast for a running fast, Delete fast for a finished one
      (`FastEditor.test.tsx > FastEditor > opens a running fast as Active fast: Started and the
      goal, End fast now and Cancel fast`, `> opens a finished fast as Edit fast with Ended and
      Delete fast, neither time after now`)
- [x] Save keeps a running fast running (`FastEditor.test.tsx > FastEditor > keeps a running fast
      running on Save, with the new start and goal`; `src/services/fasting.test.ts > fasts > keeps a
      running fast running through an edit, and deletes a finished one`)
- [x] End fast now applies the edited start and goal with the end in one write (Android's atomic
      form) (`FastEditor.test.tsx > FastEditor > applies the edited start and goal and ends the fast
      now in one write (ACC-H8-1, R05.3)`; `src/services/fasting.test.ts > fasts > ends a running
      fast with the edited start and goal in one write, or not at all (R05.3)`)
- [x] Ended never before Started (`FastEditor.test.tsx > FastEditor > never lets Ended be before
      Started: a start moved past the end takes the end along`)
- [x] an overlapping edit is refused with the message and changes nothing; touching fasts are
      allowed (repository) (`FastEditor.test.tsx > FastEditor > refuses an edit that overlaps another
      fast: says so with a hint and changes nothing (ACC-H9-1, R05.3)`, `> leaves the fast running as
      it was when End fast now would overlap another (R05.3)`)
- [x] Cancel fast deletes a running fast (never in history); Delete fast without a confirmation;
      Cancel discards (`FastEditor.test.tsx > FastEditor > cancels a running fast so it leaves no
      history (ACC-H7-1)`, `> deletes a finished fast at once`, `> drops the edits on Cancel`)
- [x] fasting off by default; default goal 16 h on a 1–168 h wheel (`FastingSettings.test.tsx >
      FastingSettings > is off by default and then shows only its switch`, `> shows the default goal
      of 16 hours once fasting is on (ACC-J10-1, ACC-H6-1)`, `> offers 1 to 168 hours, opens on the
      stored goal and stores the hours picked in minutes`; `TrackingPage.test.tsx > TrackingPage >
      shows fasting's own rows only while fasting is switched on (ACC-J10-1)`)
- [x] turning fasting off ends (not cancels) the running fast; water is kept; food logs again
      (`FastingSettings.test.tsx > FastingSettings > ends the running fast when switched off, keeps
      it, says so, and food logs again (ACC-H10-1, R05.2)`; `src/services/fasting.test.ts >
      settings > ends the running fast when fasting is switched off, keeping it and the water logs
      (R05.2)`)
- [x] food is refused during a fast and logs once it ends (`PausedDialog.test.tsx > the review
      during a fast (D-16.35) > shows the paused dialog when Log meets a running fast, and writes
      nothing (R05.1)`; `ReviewSheet.test.tsx > ReviewSheet > keeps the sheet open behind the paused
      dialog while a fast is running, and logs once it ends`; `ManualSheet.test.tsx > ManualSheet >
      stays open behind the paused dialog while a fast is running; Cancel keeps what was typed`;
      `CopyDaySheet.test.tsx > CopyDaySheet > writes nothing during a fast: the paused dialog shows
      and the sheet stays (R02.12)`)
- [x] deliberate: End fast and log (`PausedDialog.test.tsx > the review during a fast (D-16.35) >
      ends the fast and logs the food in one step with End fast and log (ACC-D27-1)`, `> keeps
      fasting and the review on Cancel; Log then shows the dialog again`, `> says so and keeps the
      fast and the review when the write fails`; `ManualSheet.test.tsx > ManualSheet > ends the fast
      and stores the entry with End fast and log (ACC-D27-1, D-16.35)`; `CopyDaySheet.test.tsx >
      CopyDaySheet > ends the fast and copies with End fast and log, then closes (D-16.35)`;
      `src/services/fasting.test.ts > endFastAndLog (D-16.35) > ends the running fast now and stores
      the food, in one step (ACC-D27-1)`, `> stores neither when the food cannot be written: the fast
      keeps running`, `> writes once for two rapid calls, and asks for persistence after the first
      entry only`)
- Deliberate differences: "End fast and log" (D-16.35); Started and Ended cannot be after now;
  untouched editor fields (start with seconds, a goal of part hours, the default goal) keep their
  stored values exactly (`FastEditor.test.tsx > FastEditor > moves the end of a finished fast and
  keeps the fields left alone exactly as stored`, `FastingSettings.test.tsx > FastingSettings >
  keeps a stored goal that is not whole hours when saved unmoved`); a refused start is said in the
  sheet (the reference closes it silently); turning fasting off says so in a toast when it ended a
  fast; a fast changed elsewhere while its editor is open closes the editor with a message
  (`FastEditor.test.tsx > FastEditor > says so and closes when the fast was ended or deleted
  somewhere else`); our own copy, hooks and layout; dates and times are native inputs.
- Not taken: iOS's wheel on the start sheet (we use the − / + stepper of Android, as the row says);
  the icon on the start sheet; the fast rows (P07-05); the + menu rows and the home-screen shortcut
  (P07-08 and later); the goal alert and its switch (P09-08 / P09-09, R05.20).

## Decisions for the lead

- **Copy a day's "End fast and log" is two writes.** `diaryRepo.endFastAndAdd` takes one entry and
  a copy writes several in one transaction, so the copy sheet ends the fast (`fasting.end`) and then
  copies again (`copyDay.copy`, all or none). A storage failure between them leaves the fast ended
  and nothing copied (the sheet says so and stays). Making it one write needs an
  `endFastAndAddMany` (or a list) in `src/data/repos/diaryRepo.ts` (P02 file, not touched here).
  Review and manual entry use `endFastAndAdd` through `fasting.endFastAndLog` and are one write.
- **"End fast and log" lives on the fasting service**, not the diary service: adding a method to
  `DiaryService` would break every test's stand-in diary. It builds the entry with the diary
  service's `entryFrom`, now exported from `src/services/diary.ts` (a one-word change), and takes
  the same `onFirstEntry` hook (D-16.8; the request is remembered, so two callers ask once).
- Started and Ended are capped at now in the editor (the reference allows a future start, which
  gives a running fast a negative elapsed time).
- The shared dialog's words are new (`fasting.paused.*`); the old paused words are now unused:
  `review.paused`, `log.manual.paused`, `reuse.copyDay.paused.{title,message,ok}` (in partitions
  this slice does not own; delete them when convenient).
- The reuse sheets never log (a pick opens the review), so they needed no change: the review shows
  the dialog.
- `PausedDialog` is presentational; `useLogPause(onLogged)` (same file) holds the refused draft
  for sheets that log one draft. P06-19's combine can use `PausedDialog` with its own action.
- `FastEditor` takes `{open, fast, onClose}` and `StartFastSheet` `{open, onClose, onStarted?}`;
  P07-05 / P07-08 decide whether they sit on the router's sheet stack (`useSheet`).
- The fasting screens read the service through `useFasting()` (`src/features/fasting/hours.ts`),
  which fails the action, not the render, when a test's stand-in services have none, so the
  Tracking page and the food sheets keep rendering in older tests.
- Tests that wait on a mock call (no DOM change) use `settle` from
  `src/features/water/testing/openWater.tsx`; `until` waits for a DOM change and can hang there.

## Status

Done (2026-10-27). Fasting service, start sheet, fast editor, fasting card on the Tracking page and
the shared paused dialog wired into review, manual entry and copy a day, with tests. Lines outside
the task's own files: `src/services/context.tsx` (`fasting?`), `src/main.tsx` (builds it),
`src/i18n/en.ts` (the `fasting` partition), `src/services/diary.ts` (`entryFrom` exported),
`src/features/settings/tracking/TrackingPage.tsx` (mounts `FastingSettings`) and its test; the
paused lines of `ReviewSheet.tsx`, `ManualSheet.tsx`, `CopyDaySheet.tsx` and their tests. Handed on:
the fast rows and the tap into `FastEditor` (P07-05), the + menu's Start fast / Fasting rows using
`StartFastSheet`, `fasting.end` and `fasting.cancel` (P07-08), `PausedDialog` on combine (P06-19),
the goal alert (P09-08).
