# Task: Coach e2e (P08-14) · Phase: 08 · Owner: builder (wt-p08s14, wave C)

Read (reference @ `10e14b67`): none. The phase row lists no reference file: the flows are ours, and
the spec strings together the Coach pieces that already landed (P08-01..13) and proves them end to
end in a browser against the fake AI provider (P00-09). Our own docs read: the P08-14 row, "Goal"
and "Done when" (Demo 5) in `docs/plan/phases/P08-coach.md`; research spec `04-coach.md` §3.1
(layout and states), §3.3 (chips), §3.5 (Reset), §3.6 (send flow and errors), §3.7 (memory);
D-16.29 (newest 200 messages), D-16.31 (friendly error, Details, Retry), D-16.33 and D-16.85 (a chip
sends with the photo and leaves the typed draft), D-16.34 (a late reply after Reset is dropped);
the acceptance rows whose Review line names P08-14 (ACC-I7-1, ACC-I10-2; no trap row names it);
the landed specs `e2e/walking-skeleton.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/logging.spec.ts`
and `e2e/support.ts`; the fake AI (`e2e/fake-ai/server.ts`, the `coach-tool` script); the landed
code for hooks, words and behaviour (`CoachPage.tsx`, `MessageList.tsx`, `Bubble.tsx`,
`EmptyCoach.tsx`, `ChipRow.tsx`, `chips.ts`, `Composer.tsx`, `ErrorBanner.tsx`, `TypingDots.tsx`,
`CopyButton.tsx`, `markdown.tsx`, `src/i18n/en/coach.ts`, `src/ui/Menu.tsx`, `src/ui/Dialog.tsx`),
the services behind them (`session.ts`, `engine.ts`, `history.ts`, `tools.ts`, `coachRepo.ts`),
the OpenAI-compatible chat wire (`src/ai/chat/openaiChat.ts`) and the failure kinds
(`src/ai/errors.ts`, `src/ai/retry.ts`).

What it does (own words): five browser tests on the Pixel 7 profile, each from an empty browser,
walk the wizard with the AI as the Custom provider at the fake's loopback address (the fake answers
`plan-ok`), land on Home, then open the Coach tab and talk to the fake:
1. Tools (Demo 5, ACC-I7-1): a porridge entered by hand on yesterday; "What did I eat yesterday?"
   with the `coach-tool` script: the fake's first answer calls `food_log`, the app runs the tool on
   its own data and asks again, and the second answer shows as the Coach's reply. The fake saw two
   Coach requests: the first with the six tools and no food name anywhere (the context holds none),
   the second with exactly one `tool` message answering the call id, whose JSON lists yesterday's
   porridge. Copy puts the reply on the clipboard; after a reload both messages are still there
   (ACC-I10-2).
2. Chips (D-16.33, D-16.85): the empty chat's first card sends its words at once and gets an
   answer; the typing dots showed while it was pending; then the chip row is there. A photo picked
   from the library through the attach menu shows as a preview; with words typed in the field, the
   second chip sends its own words with the photo: the preview goes, the typed words stay, the
   question's bubble shows the photo, and the request carried one image.
3. Failure (D-16.31, R04.4): the `coach-fail-then-ok` script fails the first request (500 with a
   provider message). The question stays with the error banner: our generic message, Details
   (closed until pressed, then the provider's message), Retry. Retry asks again and the answer
   shows; the question is on screen once and the retried request carried it once.
4. Reset (ACC-I5-1, R04.6, D-16.34): the `coach-slow` script holds the first answer at the fake.
   While the dots show, Clear chat → Cancel keeps everything; Clear chat → Clear empties the chat
   at once (cards back, no dots, Clear chat off) and the browser abandons the request
   (`net::ERR_ABORTED`), so the held answer can never arrive. A card then gets the script's second
   answer: the chat holds only that exchange, before and after a reload, and the held answer's
   words were never on the page.
5. Cap (D-16.29, R04.8): short exchanges through the composer, each answered by an inline
   script. After 100 the chat holds all 200 messages from the first question; the 101st leaves
   200, the first question and its answer gone (the list starts with the second question and its
   answer and ends with the last answer), and the same holds after a reload. Each request carried
   at most 20 messages of the conversation.
Every test routes all non-loopback traffic (the logging spec's routes: anything off loopback is
aborted and recorded) and fails on a stray request or an uncaught page error.

Inputs → outputs:
- `e2e/coach.spec.ts` → five Playwright tests over the built app (`vite preview`), one worker,
  Pixel 7, `en-US`, UTC, reduced motion, the page clock installed at 2026-10-25 08:30 UTC (a
  Sunday: yesterday is in the same week of the week bar, which starts on Monday, and inside
  `coach-tool`'s `food_log` range 2026-10-19..25).
- `e2e/fake-ai/scripts/coach-fail-then-ok.json` → a 500 with an OpenAI-style error message, then a
  text answer.
- `e2e/fake-ai/scripts/coach-slow.json` → a text answer held for 60 s at the fake, then a prompt
  text answer.
- `e2e/support.ts` (additive) → a text chat completion and an inline script of many, the answer
  text of a script reply; of a recorded request its messages, the tools it offered, its questions
  and its `tool` messages; and a recorder of texts that ever entered the page.

Files: created `e2e/coach.spec.ts`, `e2e/fake-ai/scripts/coach-fail-then-ok.json`,
`e2e/fake-ai/scripts/coach-slow.json`, this note; changed `e2e/support.ts` (additions only).

Edge cases / failure modes:
- The fake keeps its script and recordings between tests: every test resets it and loads `plan-ok`
  for the wizard, then its own script (a load rewinds the script and keeps recordings). Coach
  requests are told from the wizard's plan request by the `tools` they carry.
- The held answer of `coach-slow` waits on the fake's own timer (real time in the fake's process,
  not the page clock), so the test never waits for it: it proves the answer cannot arrive (the
  browser abandoned the request) instead of waiting to see it not arrive. The fake drops the
  answer when its socket is gone; global teardown clears the timer.
- Reset is on while a reply is pending (the question is stored first); the test waits for the
  fake to record the request before pressing it, so the request is really in flight.
- The clock runs at real speed after `page.clock.install`; no flow here waits on a page timer
  (the dots step every 350 ms on their own), so nothing needs `runFor`.
- A banner or a reply that flashes and goes would pass a final "not shown" check: the hook
  recorder (and a text recorder for the held answer) remember everything that ever entered the
  page.
- The clipboard needs the page's permission in Chromium: the copy step grants clipboard read and
  write to the context and reads the text back.
- Send is off while a reply is pending, so the 101 exchanges go one after another, each waiting
  for its own answer; the test has a longer timeout of its own.
- The attach menu opens the hidden library input from the menu row's click, so the file chooser
  event carries the photo in, as a person's pick would.

Our design differences / decisions:
- Copy comes from the catalogue through `words()`; locators are roles, names and `data-ui` hooks.
- The 200-message cap is seeded through the UI with an inline script (101 exchanges), not through
  the repository as the row words it: e2e cannot reach the repository inside the built app, and
  101 exchanges are the fewest that cross the cap (the repository's 205-message case is
  `coachRepo.test.ts`).
- The Reset case proves the abort (`net::ERR_ABORTED` on the chat request) rather than waiting out
  the fake's delay: real waits are banned, and an abandoned request cannot deliver its answer. The
  generation check behind it (a reply that does arrive late is dropped) stays with
  `session.test.ts`.
- `coach-tool` is used as it landed; the test's day is chosen so its fixed range covers yesterday.

Decisions for the lead:
- No `data-ui` hook was missing: every hook the prompt lists is already on the landed components
  (`coach.attach.camera` and `.library` come from the menu's row hooks), so no component changed.

Tests we will write (`e2e/coach.spec.ts > coach chat (Demo 5)`):
- `answers "What did I eat yesterday?" from a food_log call, copies the reply and keeps the chat over a reload (ACC-I7-1, ACC-I10-2)`
- `sends a card at once, then a chip with the attached photo, keeping the typed words (D-16.33, D-16.85, R04.14)`
- `shows a failed turn with Details, and Retry answers it without asking twice (D-16.31, R04.4)`
- `clears the chat while a slow reply is pending, and that reply never arrives (ACC-I5-1, R04.6, D-16.34)`
- `keeps the newest 200 messages after 101 exchanges, also after a reload (D-16.29, R04.8)`
Every test three times in a row (`--repeat-each=3`), one worker; then the whole e2e folder once.

Compare checklist (filled after the rewrite; no reference file applies: the flows are ours, so
each tick names the test of `e2e/coach.spec.ts > coach chat (Demo 5)` that proves it; T1..T5 are
the five tests above, in order):
- [x] Empty chat: the title, four cards with the maintain chips in order, Clear chat off (every
      test, through `openEmptyCoach`)
- [x] "What did I eat yesterday?" → `food_log` call → answer shown; the first request offered the
      six tools and carried no food name, the second exactly one `tool` message for
      `call_fake_food_log_1`, after the echoed call, listing yesterday's porridge (2026-10-24,
      310 kcal, breakfast) in the echoed range 2026-10-19..25 (T1, ACC-I7-1)
- [x] Copy → "Reply copied" and the clipboard holds the reply as written (T1, ACC-I4-2)
- [x] Reload keeps the conversation, the chip row and Clear chat on, with no new request (T1,
      ACC-I10-2; also T3, T4, T5)
- [x] A card sends its words at once; the dots showed while pending; the request's one question is
      the card's words, no image (T2, ACC-I1-1, ACC-I1-2)
- [x] With messages the four chips are a row (`coach.chip.1..4`); a photo from the library through
      the attach menu (`coach.attach.library`) shows as the preview; chip 2 sends its words with
      the photo: preview gone, the bubble's photo shown, the typed draft kept and not sent, one
      image in the request (T2, D-16.33, D-16.85, R04.14, ACC-I3-2)
- [x] 500 from the provider → the banner (kind generic, our message only), Details closed then the
      provider's message, Retry → the answer under the one question, banner gone; both requests
      carried the question exactly once; a reload shows no banner (T3, D-16.31, R04.4, ACC-I11-1)
- [x] While the fake holds the answer: the dots, the chips and the attach button off; Clear chat →
      Cancel changes nothing; Clear chat → Clear empties the chat at once (cards back, no dots,
      Clear chat off) and the chat request fails with `net::ERR_ABORTED`; a card then gets the
      script's second answer and the chat holds only that exchange, also after a reload; the held
      answer's words never entered the page (T4, ACC-I5-1, R04.6, D-16.34)
- [x] The abort check is real: with `run.controller.abort()` commented out in
      `src/services/coach/session.ts` (and the app rebuilt) T4 failed at "Clear chat → Clear"
      (no aborted request); the line was restored and the app rebuilt before the runs below
- [x] 100 exchanges → 200 messages from "Question 1?"; the 101st → still 200, starting "Question
      2?" / "Answer 2." and ending "Answer 101."; the same after a reload; no request carried more
      than 20 messages of the conversation (T5, D-16.29, R04.8, ACC-I10-1)
- [x] No uncaught page error and no request off loopback in any test (the `afterEach` checks)
- Deliberate differences: none against the reference (no reference flow). Against the row: the
  cap is seeded through the UI (101 exchanges) instead of the repository, and the Reset case
  proves the abort instead of waiting out the fake's delay (see "Our design differences").
- Not taken: the camera row of the attach menu is only checked for its label (the library row
  carries the photo in); Enter to send (Pixel 7 has no fine pointer, so Enter adds a line there).

## Status

Done (2026-10-27). The five tests passed three times in a row (15/15, `--repeat-each=3`, one
worker, Pixel 7), and the whole e2e folder once (20/20). The cap test takes about 50–70 s on a
loaded machine (101 turns one after another), inside its own 240 s budget. No file outside the
task's set changed; `e2e/support.ts` only gained helpers; no component needed a hook.
