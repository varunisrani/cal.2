# Task: fit check, what-if sheet (P06-10) · Phase: 06 · Owner: builder (wt-p06s2b, slice S2b)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `I/Views/FoodResultView.swift` lines 1109–1300 (the preview
sheet: the four rows, the left/over text, the highlight rule, the suggestion states and when the
suggestion runs again) and the lines that open it (the candidate built from the review, the day's
entries for the picked date); `A/ui/home/HomeViewModel.kt` around `suggestMealWhatIf` (the day of
the candidate's time, the profile check before any request). Research spec `02-food-logging.md`
§3.6, `03-ai-providers.md` §3.11; the prompt itself is ours already (`src/ai/prompts/fitCheck.ts`,
P03-16) and the request is `fitCheck` in `src/ai/tasks/planning.ts` (P03-18). Ledger rows naming
P06-10: ACC-D11-1, ACC-D11-2.

What it does (own words): from the review, "Fit check" opens a sheet that shows what the day of
the picked date would look like with this meal, without logging anything. For energy, protein,
carbs and fat it shows what the meal adds ("+700 kcal"), the day after it against the goal
("2,200 / 2,000 kcal") and how much is left or over ("200 kcal over"). Energy, carbs and fat that
end above their goal are highlighted; protein never is, since more protein than the target is not
a warning. The day's numbers are that date's logged entries; the goals are the targets in effect
(saved values over the formula). Below, an AI suggestion starts when the sheet opens: a busy line
while it runs, then a few sentences the person can select and copy, or the failure's message with
Retry, or a neutral line when the answer was empty. Without an AI set up it says where to add a
key and asks nothing. When the meal's numbers, the number of entries that day or the goals change
while it is open, the suggestion runs again once things are quiet for a moment (debounced); a
request still running is stopped first. Done closes the sheet.

Inputs → outputs: the review's `FitCheckSlot` (`food`: the draft at the shown amount, its time and
meal; `onClose`) and the read hooks (`useDayEntries` of the picked date, `useTargets(today)`,
`useSettings` for the energy, weight and height units) → the rows; `fitCheck.suggest(input,
signal)` → `{text} | {empty} | {noKey} | {failed, messages} | {cancelled}`.

Files: created `src/features/log/FitCheckSheet.tsx` (+ `FitCheckSheet.test.tsx`),
`src/features/log/fitCheck.module.css`, `src/i18n/en/fitCheck.ts`, `src/services/fitCheck.ts`
(+ test), this note. Shared, additive: `src/features/log/review/ReviewSheet.tsx` (the `fitCheck`
slot in `AnalysisReview`), `src/services/context.tsx` (`fitCheck?`), `src/main.tsx` (builds it),
`src/i18n/en.ts` (the partition line).

Edge cases / failure modes:
- No profile (missing or unreadable): rows show "+added" and the day after it, without a goal or
  left/over; the suggestion is not asked for (the prompt needs a profile) and a line says why.
- Exactly at the goal: "0 left", not highlighted.
- Energy in kJ: every energy figure in kJ; left/over from the shown kJ numbers so they agree.
- The day still loading: rows wait; the suggestion starts once the day and the goals are read.
- An empty answer → the neutral line; a cancelled request (sheet closed, inputs changed) shows
  nothing.
- AI not set up ("Set up later"): no request, the how-to-add-a-key line, no Retry. A missing key
  for the provider in use: the same line.
- A failure: the failure's messages (both providers, then the standby's) and Retry, which asks
  again at once.
- Closing the sheet stops a running request.

Our design differences / decisions:
- Names and words are ours; the button and title are "Fit check".
- The AI call goes through a small service (`src/services/fitCheck.ts`, `fitCheck` in Services),
  since screens act through services and never hold the fetch or the keys.
- Without a profile we show the meal and the day after it and no suggestion (Android: a hint to
  finish onboarding, iOS needs a profile to open).
- The first run starts as soon as the day and the goals are read; later changes wait 600 ms.
- Retry is offered on every failure (iOS; Android offers none).

Tests we will write:
- `FitCheckSheet.test.tsx` (screen harness over the test database, a stand-in fit-check
  service, fake timers for setTimeout/setInterval/Date only): a day at 1,500 of 2,000 plus 700 →
  "+700", "2,200 / 2,000" and "200 kcal over" highlighted (ACC-D11-1); protein over is not
  highlighted, carbs and fat are; entries of another date are not counted; kJ figures; the
  suggestion starts on open with the day, the goals and the meal; a changed amount runs it once
  more after the debounce, not before (and not for every change); the entry count and the goals
  re-run it; an error shows the message and Retry, which asks again (ACC-D11-2); an empty answer
  shows the neutral line; no AI set up shows the key line and no Retry; the text is selectable;
  Done closes; closing aborts the request; copy passes the catalogue lint.
- `src/services/fitCheck.test.ts` (fake fetch): the text request goes to the text provider with
  JSON off and the trimmed answer comes back; an empty answer → empty; not set up → noKey without
  a request; a refused key → failed with its message; an abort → cancelled.

Compare checklist (filled after the rewrite; reopened `FoodResultView.swift` 1109–1300 and the
lines that open the sheet, `HomeViewModel.kt` `suggestMealWhatIf`):
- [x] Four rows: "+added", "after / goal", "N left" or "N over"; over highlighted for energy,
  carbs and fat, never protein (`src/features/log/FitCheckSheet.test.tsx > FitCheckSheet: the day
  with the meal > shows a day at 1,500 of 2,000 plus 700 as +700 and 2,200 / 2,000, 200 over and
  highlighted (ACC-D11-1)`, `> never highlights protein over its goal, while carbs and fat over
  theirs are`, `> says what is left, unhighlighted, under the goal and exactly at it`)
- [x] Energy left/over worked out on the shown display numbers (`> shows energy in kJ when the
  person reads kJ`)
- [x] The day of the picked date; the targets in effect (`> counts only the entries of the picked
  date`; the stored saved targets are the goals in every test)
- [x] No profile: no goals and no request (Android's hint) (`> shows the day without goals, and
  asks for no suggestion, without a profile`)
- [x] Done closes, nothing logged (`> closes on Done and logs nothing`)
- [x] Suggestion starts on open with the candidate, the day and the goals; loading line; text shown
  as plain, selectable text (`FitCheckSheet: the suggestion > asks on open with the meal, the day
  in order and the goals, and shows the text as plain text`)
- [x] Error with Retry (`> shows the failure with Retry, which asks again at once (ACC-D11-2)`);
  empty → neutral line (`> shows a neutral line for an empty answer`); no key → how to add one
  (`> says where to add a key when no AI is set up, with no Retry`)
- [x] Re-runs when the candidate's numbers, the day's entry count or the goals change, debounced,
  stopping the running request (`> asks again once after the debounce when the amount changes,
  not before, and once for quick changes`, `> stops a running request and asks again after the
  debounce when the day gains an entry`, `> asks again after the debounce when the goals change`);
  stopped when the sheet goes (`> stops the request when the sheet goes`)
- [x] The request: prose, our prompt, trimmed answer; nothing sent without a set-up AI or a key;
  failures with their messages; cancel silent (`src/services/fitCheck.test.ts >
  createFitCheckService (03 §3.11) > sends our fit-check prompt as prose and gives back the trimmed
  answer`, `> treats an answer with only spaces as unusable, never as text to show`, `> sends
  nothing without an AI set up, and nothing for a provider without a key`, `> gives a failure its
  messages`, `> is cancelled, silently, when the caller stops it before or during the request`)
- [x] Copy from the catalogue (`FitCheckSheet.test.tsx > the fitCheck partition > passes the
  catalogue lint merged with the other partitions`)
- Mutation check: highlighting protein fails 1 test; starting every change at once (no debounce)
  fails 3.
- Deliberate differences: "Fit check" instead of the reference's title; re-runs wait 600 ms after
  the last change (iOS restarts at once) and leave the meal's name out of the trigger; Retry on
  every failure (Android has none); without a profile the rows show the day after the meal without
  goals and a line explains why there is no suggestion (Android: a finish-onboarding hint, iOS
  needs a profile); the AI not set up ("Set up later") shows where to add a key without sending
  anything; a reply with no text is a failure of its own (our adapters refuse it) and an empty one
  the neutral line; the request goes through a service (`src/services/fitCheck.ts`).
- Not taken: Android's version without remaining amounts (we follow iOS: left/over shown).

## Decisions for the lead

- A new service file, `src/services/fitCheck.ts` (+ test), with `fitCheck?` in Services and one
  line in `main.tsx` (`createAiAccess`, `browserFetch`): the prompt named only the screen, but
  screens may not hold the fetch or the keys.
- Debounce 600 ms (`FIT_CHECK_DEBOUNCE_MS`); the first run, a Retry and the same inputs again
  start at once.
- No profile: no request and a "needs your profile" line; AI not set up (`configured` false) or no
  key for the provider in use: the key line, no request, no Retry.
- The fit check opens from the review's own state (S2a), not the router stack, so Back does not
  close it: a follow-up for the review sheet if wanted.

## Status

Done (2026-10-27). Created `src/features/log/FitCheckSheet.tsx` (+ 16 tests, fake timers for
setTimeout/clearTimeout/setInterval/clearInterval/Date only), `src/features/log/fitCheck.module.css`,
`src/i18n/en/fitCheck.ts`, `src/services/fitCheck.ts` (+ 5 tests), this note. Shared, additive:
`src/features/log/review/ReviewSheet.tsx` (the `fitCheck` slot in `ANALYSIS_SLOTS`),
`src/services/context.tsx` (`fitCheck?`), `src/main.tsx`, `src/i18n/en.ts`. Hooks: `fitCheck`,
`fitCheck.done`, `fitCheck.row.<energy|protein|carbs|fat>[.added|.after|.remaining]` (the remaining
line carries `data-over="true"` when highlighted), `fitCheck.suggestion[.loading|.text|.empty|.noKey|
.noProfile|.error]`, `fitCheck.retry`.
