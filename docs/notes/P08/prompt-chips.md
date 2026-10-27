# Task: Prompt chips (P08-12) · Phase: 08 · Owner: builder (wt-p08s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/coach/CoachViewModel.kt` (`chipsFor` and the flow that keeps
chips current when the goal or workout history changes), `I/Views/ChatView.swift`
(`suggestedPrompts`, the empty-state prompt grid and the chip row: layout, disabled while sending,
what a tap does with the draft). Research spec `04-coach.md` §3.3 (chip sets, row, tap behaviour),
§3.1 (empty-state cards), §5 (no training chip in v1), trap R04.14; decision D-16.33. No reference
tests cover chips.

What it does (own words): the Coach suggests four questions that fit the person's goal. Someone
losing weight is offered a 30-day projection, a safe way to go a little faster, a check on whether
they eat too much, and a dinner idea; someone gaining gets the projection, a healthy way to gain,
a check on whether they eat enough, and protein-rich foods to add; someone maintaining gets
whether their weight holds steady, their average intake, macro advice and their trend. The words
are ours. An empty chat shows them as up to four cards in two columns; once there are messages
they sit in a row that scrolls sideways above the composer. Tapping one sends its words at once
as the person's question. A photo waiting in the composer goes with it and the composer drops it
(D-16.33). Every chip is disabled while a reply is pending. The chips follow the stored goal
live: changing the goal in Settings changes them without leaving the tab.

Inputs → outputs:
- `chipsFor(goal | undefined)` → four `{ id, text }` in order (`id` like `lose.projection`), or
  none without a goal.
- `useCoachChips()` → the chips for the stored profile's goal, live through `useProfile()`.
- `<ChipRow chips pending photo onSend onPhotoUsed layout="row" | "cards" />` → buttons; a tap
  calls `onSend(text, photo)` and then, when a photo went with it, `onPhotoUsed()`.

Files: created `src/features/coach/chips.ts`, `src/features/coach/chips.test.ts`,
`src/features/coach/ChipRow.tsx`, `src/features/coach/ChipRow.test.tsx`,
`src/features/coach/chips.module.css`, `src/i18n/en/coach.ts` (partition rooted at `coach`, chip
and copy words; P08-10 adds the page's words to it). Shared: one line in `src/i18n/en.ts`.

Edge cases / failure modes:
- Profile still loading, missing or unreadable: no chips (no flash of a wrong set).
- Goal changes while the tab is open: the set changes on the next live read.
- Pending: buttons are disabled, so a tap does nothing; a second tap in the same frame is also
  ignored by the session's own guard (P08-09, R04.5).
- No photo attached: `onSend(text)` with no photo and `onPhotoUsed` is not called.
- Cards layout with a longer list (a training chip later, L3): only the first four show.

Our design differences / decisions:
- Wording is ours, four per goal, same intents (D-16.33 for the photo; no training chip, §5).
- One component for both shapes (`layout`): the empty state (P08-10) mounts the cards layout, the
  conversation the row. The page owns the composer's photo, so the row takes the photo and a
  callback instead of reaching into the composer.
- A chip leaves the typed draft alone: only the photo is taken. The reference clears the draft
  (Android) or replaces it with the chip text (iOS). Decision for the lead below.
- The text sent is the displayed catalogue text; with one English catalogue in 1.0 that matches
  the reference sending English chip text. When i18n lands (L1) the sent text follows the
  catalogue, and the reply follows the question's language (D-16.28).
- No profile → no chips (the reference's Android shows a three-chip no-profile set; Platewise has
  no Coach without onboarding).
- The leading disc of the row uses our `chat` icon; the cards a small `chevronRight`.

Decisions for the lead:
- A chip tap keeps the typed draft text; tell me (or P08-10/11) if the draft should be cleared.

Tests we will write:
- `chips.test.ts`: each goal gives its four chips in order with catalogue words; no goal gives
  none; no chip mentions training; every chip text is a catalogue message.
- `ChipRow.test.tsx`: lose shows the four lose chips (row and cards); a tap sends the chip's text;
  with an attached photo the tap sends both and calls `onPhotoUsed` (ACC-I3-2, R04.14); pending
  disables every chip; cards show only the first four of a longer list; live: switching the stored
  goal from lose to gain changes the chips (ACC-I3-1).

Compare checklist (filled after the rewrite; reopened `CoachViewModel.kt` `chipsFor` and its
flow, `ChatView.swift` `suggestedPrompts`, the prompt grid and the chip row):
- [x] Four chips per goal, same intents in the same order (tested in
  `src/features/coach/chips.test.ts` > chipsFor (P08-12))
- [x] The empty chat shows the first four as cards; the row shows all (tested in
  `src/features/coach/ChipRow.test.tsx` > ChipRow: what shows)
- [x] A tap sends at once; every chip disabled while pending (tested in
  `src/features/coach/ChipRow.test.tsx` > ChipRow: sending (D-16.33, R04.14))
- [x] A chip sends the attached photo and clears it (tested in `src/features/coach/ChipRow.test.tsx`
  > ChipRow: sending > sends the attached photo with the chip and clears it (ACC-I3-2, R04.14))
- [x] Chips follow the goal live (tested in `src/features/coach/ChipRow.test.tsx` >
  useCoachChips: chips follow the goal live (ACC-I3-1))
- Deliberate differences: our wording; the photo goes with the chip on every platform (D-16.33);
  the typed draft is left alone (decision for the lead above); no profile gives no chips; the row
  disc and card icon are ours (`chat`, `chevronRight`).
- Not taken: the training chip (workouts are L2/L3, §5); the Android no-profile set.

## Status

Done (2026-10-27). Shared: `src/i18n/en.ts` gains the `coach` partition (import and one entry).
P08-10 mounts `<ChipRow layout="cards">` in the empty state and `<ChipRow>` above the composer,
both with `useCoachChips()`, `pending` from the session, and the composer's photo with
`onPhotoUsed` clearing it.
