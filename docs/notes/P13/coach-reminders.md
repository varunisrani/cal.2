# Task: reminders made through the Coach (P13 S4, Goal item 4, D-16.93) · Phase: 13 · Owner: builder (wt-p13s4)

Read (reference @ `10e14b67`): nothing to rebuild from. The reference's Coach has no tool that
writes anything and the reference has no reminders the person writes; `services/ai/CoachTools.kt`
was searched for remind, notif and schedule and only the read tools turned up (read for the shape
of a tool description only). Platewise sources read: the P13 phase file (Goal item 4, D-16.93),
`docs/notes/P13/notifications-and-custom-reminders.md` (the custom reminders API and its
decisions), `docs/notes/P08/{nutrition-tools,chat-engine,coach-session}.md`,
`src/services/coach/**`, `src/ai/prompts/coach.ts`, `src/ai/chat/types.ts`,
`src/services/reminders/customReminders.ts`, `src/domain/reminders/custom.ts`,
`src/services/trackingSettings.ts`, `src/features/settings/tracking/{CustomReminders.tsx,
clockText.ts}`, `src/data/{codecs.ts,repos/coachRepo.ts}`, `src/domain/model.ts`,
`e2e/{coach,reminders}.spec.ts`, `e2e/fake-ai/**`.

What it does (own words): when the person asks the Coach to remind them of something, the Coach
calls a new tool, `propose_reminder`, with the words, a time (24-hour `HH:MM`) and either the days
it repeats on or one date. The app checks the proposal the way Settings would (`problemWith`):
a bad one goes back to the model with the reason in words, so it can ask the person again; a good
one is noted for the turn and the model is told it is proposed and waits for the person. The
reply is stored with its proposals, and under the reply the chat shows one card per proposal: the
words, when it comes ("Every day at 9:00 AM", "Mon, Wed and Fri at 7:30 AM", "Once, Oct 28, 2026
at 6:00 PM", the time in the person's locale), and Add and Dismiss. Add asks for notifications
first when they are not on (the same `turnRemindersOn` as Settings, inside the press), then adds
the reminder; the card then says Added with a link to Settings › Tracking & reminders, or says in
words why it could not (20 already, the time has passed, …). A refusal of notifications still adds
it, switched off, as Settings does, and the card says it shows only once notifications are on.
Dismiss hides the card. What happened to a card is stored on the reply, so it survives a reload,
and a card is added at most once. The system text tells the model to use the tool when asked to be
reminded, never to say a reminder is set until the person taps Add, and to ask for a missing time
or day instead of guessing; the facts gain the current local time, so "in an hour" and "tonight"
can be worked out.

Inputs → outputs:
- `toolSchemas.ts`: `REMINDER_TOOL` (`propose_reminder`: `text`, `time`, `days`, `date`, portable
  keywords only, `days` a comma list or `daily`); `coachTools(activity, reminders = false)` adds it
  last when the turn can take proposals.
- `reminderTool.ts`: `readProposal(args)` → `CustomReminderInput` (lenient: `9:00` → `09:00`,
  `Monday` → `mon`, `daily`/`every day` → all seven, an array of days too); `proposeReminder(args,
  desk)` → the JSON answer; the desk (`{ problemWith, proposals }`) collects the turn's good,
  distinct proposals (at most 5 per reply).
- `tools.ts`: `runCoachTool(name, args, snapshot, desk?)`; without a desk `propose_reminder` is
  answered "not available here".
- `engine.ts`: `TurnInput.reminders?` (`problemWith`); `runTurn` → `Result<CoachAnswer, AiFailure>`
  with `CoachAnswer = { text, reminders }` (the proposals of the attempt that answered; a standby
  starts with none).
- `session.ts`: deps `reminders?: Pick<CustomRemindersService, 'problemWith' | 'addCustomReminder'>`;
  stores the reply with `reminders: [{text, time, days | date, status: 'proposed'}]`;
  `addReminder(messageId, index, on)` → `{ ok: true, reminderId } | { ok: false, problem }` (never
  twice: the stored status, the ids it added since the app started, one card press at a time);
  `dismissReminder(messageId, index)`.
- `src/ai/prompts/coach.ts`: `reminders?: boolean` adds the reminder rules (and the one exception
  to "you cannot change anything").
- `context.ts`: the current local time after today's day.
- Stored (shared, additive): `CoachMessage.reminders?: CoachReminderCard[]` in
  `src/domain/model.ts`, read by `decodeCoachMessage` in `src/data/codecs.ts`, changed through
  `coachRepo.patch(id, { reminders })`.
- UI: `ReminderCard.tsx` (`coach.reminderCard`, `.add`, `.dismiss`, `.added`, `.settings`,
  `.problem`), under the reply in `Bubble`.
- e2e: `e2e/fake-ai/scripts/coach-reminder.json`; a test in `e2e/coach.spec.ts`.

Files: created `src/services/coach/{reminderTool,reminderCards}.ts` (+ tests),
`src/features/coach/ReminderCard.tsx` (+ test), `src/features/coach/reminderTiming.ts`, `e2e/fake-ai/scripts/coach-reminder.json`;
changed `src/services/coach/{toolSchemas,tools,engine,session,context}.ts` and their tests,
`src/ai/prompts/coach.ts` (+ test), `src/features/coach/{Bubble,MessageList,CoachPage}.tsx`,
`coach.module.css`, `src/i18n/en/coach.ts`, `e2e/coach.spec.ts`. Shared (minimal, additive):
`src/domain/model.ts`, `src/data/codecs.ts` (+ test), `src/data/repos/coachRepo.ts` (+ test),
`src/main.tsx` (one service built once and handed to the Coach session),
`scripts/ai-live-check/page.ts` (the answer's text).

Edge cases / failure modes:
- Missing or unclear time, days or date: the tool answers the problem (`badTime`, `daysOrDate`,
  `noDays`, `badDate`) in words; the prompt says to ask the person, not to guess.
- A date whose time has passed: `past` back to the model. A time that passes between the proposal
  and Add: the card says so on Add.
- 20 reminders already: found at Add (the card says to delete one in Settings).
- The same proposal twice in a turn: one card. More than 5 in one reply: the rest are refused with
  a reason.
- A failed turn (or one whose first attempt failed and the standby answered): only the answering
  attempt's proposals are stored; a failed turn stores none.
- A Reset while Add runs: the reminder may be added, the card is gone with the chat.
- Two taps on Add, or Add in two places at once in one tab: one reminder (the session's guard and
  the stored status).
- Notifications refused: added, switched off (as Settings), with a line saying so.
- Unsupported notifications (an old browser): the same as refused.
- The stored reminder later deleted in Settings: the card still says Added (it was).
- A stored card that cannot be read back (an older or damaged row): left out of the message; the
  message still shows.
- Web and Android: the same tool and card; Android asks Android's permission through the same call.

Our design differences / decisions:
- Platewise-only (D-16.93); no reference counterpart.
- The tool is offered when the session has the custom reminders service (always in the app, web and
  Android); without it (tests, the live check) neither the tool nor its rules are sent, so the
  six-tool prompt stays word for word as R04.20's tests read it.
- `days` is a comma list in a string, not a JSON array: the schemas keep to the keywords all three
  wires accept (`type`, `description`, `properties`, `required`).
- The proposal travels on the stored reply (`reminders` on the message), not in a table: it is part
  of the chat, goes with Reset and the 200-message cap, and backups carry it through the codec.
- The model is not told later whether a card was added or dismissed (history stays text only).
- A refused permission still adds the reminder switched off (Settings' rule), and says so.
- At most 5 proposals per reply.

Tests we will write:
- `toolSchemas.test.ts`: the reminder schema (portable keywords, fields, wording: proposes only,
  waits for Add, HH:MM, days or date); offered last only with `reminders`.
- `reminderTool.test.ts`: reading the arguments (times, day names, daily, arrays, a date); a good
  proposal recorded and answered as proposed; each problem answered in words; duplicates; the cap.
- `tools.test.ts`: without a desk, not available; the available list names it only with one.
- `engine.test.ts`: the fake AI calls propose_reminder, the next round carries the answer, the turn
  ends with the proposal; a bad one goes back as a problem and no card; the standby starts clean.
- `session.test.ts`: the reply is stored with its cards; Add adds once (two taps, a second Add),
  marks it added with the id; a problem leaves it proposed; Dismiss; without the service no tool.
- `coach.test.ts`: the reminder rules (use the tool, never say set until Add, ask instead of
  guessing) only with `reminders`.
- `context.test.ts`: the current time.
- `ReminderCard.test.tsx`: the card's words; Add with permission granted, not yet (asks first),
  refused (added off, the line); problems in words; Dismiss; the state from storage after a
  reload; no double add; the Settings link.
- `codecs.test.ts` / `coachRepo.test.ts`: cards read back, bad ones dropped; patch changes them.
- e2e: the fake AI proposes, Add, and the reminder is in Settings › Tracking & reminders › Your
  reminders; after a reload the card still says Added.

Compare checklist (filled after the rewrite; reopened `CoachTools.kt` (its tool list and
descriptions) searching for remind, notif, alarm and schedule: no counterpart, so every row below is
Platewise's own rule):
- [x] The schema: words, `HH:MM`, days or date, portable keywords, "proposes only, set on Add", ask
  rather than guess, at most 5 (`src/services/coach/toolSchemas.test.ts > REMINDER_TOOL: a reminder
  for the person to add (P13, D-16.93) > *` (4 tests))
- [x] Offered last, only when the turn takes proposals; the six nutrition tools and their R04.20
  tests unchanged (`toolSchemas.test.ts > REMINDER_TOOL: … > is offered last, after activity when
  there is one, only when the turn takes proposals`; `src/services/coach/engine.test.ts > runTurn:
  reminders the Coach proposes (P13, D-16.93) > offers propose_reminder and its rules only when the
  turn can take proposals`)
- [x] Reading the call leniently and checking it with `problemWith`: a good one kept, tidied, once;
  each problem back in words; the cap (`src/services/coach/reminderTool.test.ts > readProposal:
  reading what the model sent > *` (5 tests), `> proposeReminder: a proposal waits for the person
  (P13, D-16.93) > *` (5 tests))
- [x] Not available without a desk; named among the tools only with one; a throwing check is an
  `{error}` (`src/services/coach/tools.test.ts > runCoachTool: propose_reminder (P13, D-16.93) > *`
  (4 tests); `engine.test.ts > runTurn: reminders … > answers a stray propose_reminder call with not
  available when the turn takes none`)
- [x] The engine with a fake AI: the call runs, the next round carries "waits for Add", the turn
  ends with the proposal; a bad one is a problem and no card; the standby starts clean
  (`engine.test.ts > runTurn: reminders the Coach proposes (P13, D-16.93) > runs a propose_reminder
  call, tells the model it waits for Add, and ends with the proposal`; `> answers a proposal that
  cannot be kept with its problem, so no card comes of it`; `> starts the standby with no proposals
  from the attempt that failed (R04.1)`)
- [x] The reply stored with its cards; Add once (two at once, again later), on or off; a problem
  leaves it waiting; Dismiss for good; nothing without the service
  (`src/services/coach/session.test.ts > createCoachSession: reminders the Coach proposes (P13,
  D-16.93) > *` (7 tests); `src/services/coach/reminderCards.test.ts > createReminderCards (P13,
  D-16.93) > *` (3 tests), among them `> never adds twice, even when the added mark could not be
  stored`)
- [x] The card: words and timing in the locale; Add with permission granted, not yet (asks first),
  refused (added off, the line); problems in words; two taps and a reload add once; Dismiss survives
  a reload; the Settings link (`src/features/coach/ReminderCard.test.tsx > ReminderCard: what it
  shows (P13, D-16.93) > *`, `> ReminderCard: Add (P13, D-16.93) > *` (5 tests), `> ReminderCard:
  Dismiss (P13, D-16.93) > hides the card for good, also after a reload, and adds nothing`)
- [x] Stored and read back with the message; a card that cannot be read in full is left out
  (`src/data/codecs.test.ts > coach and photo codecs > reads the reminder cards of a reply and
  leaves out a card it cannot read in full (P13)`; `src/data/repos/coachRepo.test.ts > patch >
  replaces the reminder cards of a reply and keeps the rest of it (P13)`)
- [x] The system text: use the tool when asked, never say set before Add, ask for a missing time or
  day, plain words for a problem; none of it without reminders (`src/ai/prompts/coach.test.ts >
  coachSystemPrompt: reminders (P13, D-16.93) > *` (5 tests)); the time now in the facts
  (`src/services/coach/context.test.ts > coachContext: today > gives the local time now, for
  reminders and words like tonight (P13)`)
- [x] End to end: the fake proposes, the card shows, Add, the card says added after a reload, and
  Settings › Tracking & reminders › Your reminders lists it on; axe clean on the card in both
  themes (`e2e/coach.spec.ts > reminders through the Coach (P13, D-16.93) > adds the reminder the
  Coach proposed from its card, and it is in Settings › Tracking & reminders`; the fake's script:
  `e2e/fake-ai/server.test.ts > … > coach-reminder calls propose_reminder with words, a time and
  days, then answers (P13)`)
- Gaps found on reopening: none (no counterpart).
- Deliberate differences: the reference's Coach changes nothing; ours proposes reminders, which the
  person adds (D-16.93).
- Not taken: telling the model in later turns whether a card was added (history stays text only);
  checking the 20-reminder limit when proposing (found at Add).

## Decisions for the lead

- **Where a card lives**: on the stored reply, `CoachMessage.reminders?: CoachReminderCard[]`
  (`{text, time, days | date, status: proposed | added | dismissed, reminderId?}`), read by
  `decodeCoachMessage` and changed by `coachRepo.patch(id, { reminders })`: additive lines in
  `src/domain/model.ts`, `src/data/codecs.ts` and `src/data/repos/coachRepo.ts` (shared). It goes
  with Reset and the 200-message cap and travels in backups through the codec; no schema version.
- **Offered when the session has the custom reminders service** (`deps.reminders`): `main.tsx`
  builds the service once and hands it to both Settings and the Coach (shared, three lines). Tests
  and `scripts/ai-live-check` run without it, so R04.20's "six tools" prompt test reads the same
  text; R04.20's wording needs "plus `activity_log` (D-16.94) and `propose_reminder` where reminders
  are kept (D-16.93)".
- **`runTurn` answers `{ text, reminders }`** (was the text): `scripts/ai-live-check/page.ts` reads
  `.text` (shared, one line).
- **Add and Dismiss** run in `src/services/coach/reminderCards.ts`, loaded on the first press (the
  engine's pattern), one press at a time; an added card answers its reminder again, so a second tap,
  a reload or a stored mark that failed never adds twice.
- **Refused notifications** add the reminder switched off (Settings' rule for a new reminder), and
  the card says it shows once notifications are on.
- **The time now** joins the facts' first line ("The time there is 12:30."), for every turn.
- **At most 5 proposals per reply**; duplicates in one reply make one card.
- **Card words** reuse Settings' timing lines (`reminders.yours.everyDay/onDays/once`); the card's
  own words are under `coach.reminder.*`.
- **Start-up download** +0.90 kB gzip (239.46 → 240.36 kB): the codec's card reader and the
  session's two methods (+0.39 in the entry), the catalogue's new words (+0.18), and the bundler
  now putting `src/domain/reminders/custom.ts` in a chunk of its own (+0.30, shared by the settings
  schema and the codec). The tool, the prompt rules and the card logic are in the lazy chunks
  (engine 11.60 → 13.54 kB, CoachPage 5.81 → 7.93 kB, `reminderCards` 0.65 kB).

## Status

Done (2026-10-28). Lines outside the task's files: `src/domain/model.ts`, `src/data/codecs.ts`
(+ test), `src/data/repos/coachRepo.ts` (+ test), `src/main.tsx`, `scripts/ai-live-check/page.ts`.
Not run on a device: the card's Add asking Android for the notification permission.
