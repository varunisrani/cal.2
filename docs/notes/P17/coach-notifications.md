# Task: The Coach's own notifications (P17-03, D-16.102) · Phase: 17 · Owner: builder (wt-p17s2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/ai/CoachTools.kt` (its proposal tools: the Coach only
puts a change forward and the person confirms it on a card; at most a few per reply). Behaviour
only; nothing taken. The reference's Coach sets nothing by itself, has no check-ins and no reply
notice: those are ours (D-16.102). Also read: phase file P17 (D-16.102, the rules, the `Notice`
contract), the S1 notes (`event-notices.md`, `notification-panel.md`, `planned-nudges.md`),
`src/services/notifications/**`, `src/services/reminders/**` (customReminders, nativePlan and
nudgePlan ids and channels, nativeSync), `src/services/coach/**` (reminderTool, reminderCards,
toolSchemas, tools, engine, session), `src/ai/prompts/coach.ts`, `src/features/coach/**`,
`src/features/settings/tracking/**`, the chat wires' `continueWith` (tool results are written
synchronously), `src/data/settingsSchema.ts`, the i18n partitions.

What it does (own words): in the Android app the Coach can act on what the person agreed to.
**Let the Coach set reminders** (Settings › Tracking & reminders, on by default): the Coach's
reminder tool adds the reminder at once, with the same checks and the 20 limit as Settings, and
the reply shows a "Reminder set" card with Undo (takes the reminder away; the card goes back to a
proposal with Add) and Edit (the reminder's own editor). Off, and on the web, the Coach proposes
as before (Add). **Check-ins**: a Coach tool schedules one message for later (a day and time within
14 days, at most 120 characters, at most 3 waiting). It comes as an Android notification that opens
the chat it was set in, and the message appears there as the Coach's; the reply shows "Check-in
set for Thu, Oct 29, 7:00 PM" with Cancel; Settings lists the waiting check-ins with Delete. A
check-in is a promise the person agreed to, so it comes in quiet hours too. **The Coach replied**:
when a reply lands while Platewise is in the background or another screen or chat is open, a notice
with the start of the reply opens that chat; none while the person is looking at it. The Coach's
instructions say when to use the tools and to set no more than the person asked for, and always to
say in the reply what was set. Check-ins and replies land in the notification panel.

Inputs → outputs:
- `services/coach/checkIns.ts`: `CheckIn {id, chatId, at, text, messageId?}`, the limits
  (3 waiting, 120 characters, 14 days), `readCheckIns(stored)` item by item, `checkInProblem`, and
  `createCheckIns({settingsRepo, clock})` → `add` (one settings transaction: checks, limit),
  `remove`, `attach(ids, messageId)`, `dropChat(chatId)`, `takeDue(now)`.
- `services/coach/ownTools.ts`: the turn's own writes, `CoachActions` (from the Android app), the
  `set_reminder` and `schedule_check_in` calls run before the round's results go back (the wires
  write results synchronously, so the engine awaits the writes first), `undo` when the attempt
  fails, `settle(reply)` after the reply is stored (ties check-ins to it, or undoes everything when
  the chat went).
- `toolSchemas.ts`: `set_reminder` (in place of `propose_reminder` while the switch is on) and
  `schedule_check_in`; `coachTools(…, own)`. `ai/prompts/coach.ts`: the two blocks.
- `services/coach/onScreen.ts`: which chat the Coach screen shows, and the chat a tap asked for.
- Session: `actions` and `onReply` deps; `undoReminder`; a deleted chat's check-ins go.
- Notifications: `open.ts` opens the chat; `setup.ts` delivers due check-ins into their chats
  (start, return, every plan, a notification shown, a tap), posts `coachReplied` (onceKey per
  message) and builds the `CoachActions`; `service.ts`: `setCoachSets`, `cancelCheckIn`.
- Reminders: `nativePlan.ts` plans waiting check-ins (kind `coachCheckIn`, its channel, ids
  210–241, the person's permission only, no quiet hours).
- Settings: `coach.setsReminders` (on) and `coach.checkIns` (list), both in backups.
- UI: the "Reminder set" state of `ReminderCard.tsx` (Undo, Edit), `CheckInCard.tsx`,
  `settings/tracking/CoachSettings.tsx` (switch and list, Android only).

Files: created `src/services/coach/{checkIns,ownTools,onScreen}.ts`,
`src/features/coach/CheckInCard.tsx`, `src/features/settings/tracking/CoachSettings.tsx`, tests.
Changed `src/services/coach/{session,engine,tools,toolSchemas,reminderTool,reminderCards}.ts`,
`src/ai/prompts/coach.ts`, `src/features/coach/{CoachPage,MessageList,Bubble,ReminderCard}.tsx`,
`src/features/settings/tracking/{TrackingPage,CustomReminders}.tsx`,
`src/services/notifications/{contract,open,setup,service}.ts`,
`src/services/reminders/{engine,nativePlan}.ts`, `src/data/settingsSchema.ts`, `src/i18n/en/*`,
docs. Shared: `src/domain/model.ts` (a card status), `src/domain/reminders/notices.ts`
(`coachReplied` gets a switch), `src/main.tsx` (wiring).

Edge cases / failure modes:
- The wires answer tool calls synchronously: the writes of a round are made first, in call order,
  and their answers handed over with the rest.
- An attempt that fails after setting something (a later round, Cancel, the standby taking over)
  takes back what it set, so the standby never sets it twice and a failed question leaves nothing.
- The reply not stored (chat deleted meanwhile): everything the turn set is taken back.
- The same reminder twice in one reply is set once; more than 5 in a reply refused.
- 20 reminders, 3 waiting check-ins: one transaction checks and writes, so two at once cannot pass.
- A check-in in the past, more than 14 days ahead, without words or over 120 characters: refused
  with the reason, for the model to ask again.
- Delivering a due check-in: it is taken off the list in one transaction before its message is
  stored, so a start and a return at once deliver it once. Its chat gone: dropped.
- A chat deleted: its waiting check-ins go (and their notifications with the next plan).
- Reply notice: posted only when the page is hidden or the Coach screen shows another chat (or is
  not shown); it follows its Smart notifications switch, quiet hours and the permission.
- Undo after the reminder was deleted elsewhere: the card still goes back to a proposal.

Our design differences / decisions:
- Direct add is the Android app's only: the web keeps the proposal with Add (D-16.5), the switch is
  shown in the Android app only.
- `set_reminder` replaces `propose_reminder` while the switch is on (a tool's name says what it
  does); the result says `set` or `proposed`.
- Check-ins are a setting list (`coach.checkIns`), in backups like written reminders, because the
  chats they reply in travel in backups too; a restored phone plans them again.
- After Undo the card is a proposal again (Add, Dismiss).
- The check-in card shows while the check-in waits; after Cancel or once it came it is gone (the
  message itself is then in the chat).
- Check-ins have no Smart notifications switch (each was agreed to; Delete in the list, or mute
  their Android channel); the Coach replied has one, and quiet hours apply to it.

Tests we will write:
- `checkIns.test.ts`: reading, the checks (past, 14 days, words, 120), add with the limit of 3 (two
  at once), remove, attach, dropChat, takeDue once.
- `toolSchemas.test.ts`, `tools.test.ts`: the new schemas and their place; stray calls.
- `reminderTool.test.ts`/`ownTools.test.ts`: set at once with the 20 limit and the same checks,
  the result says set; check-in validation and limit; undo; settle.
- `engine.test.ts`: a set-reminder round, a check-in round, undo when the attempt fails.
- `session.test.ts`: direct add vs proposal by the switch, cards `set`, Undo, the check-in tied to
  its reply, a deleted chat's check-ins, `onReply`.
- `coach.test.ts` (prompt): the blocks by mode.
- `nativePlan.test.ts`: check-ins planned in their channel and ids, never colliding, in quiet hours.
- `open.test.ts`, `setup.test.ts`: the tap opens that chat; a due check-in's message appears once;
  the Coach replied only when not looking.
- UI: `ReminderCard.test.tsx` (Reminder set, Undo, Edit), `CheckInCard.test.tsx` (Cancel),
  `CoachPage.test.tsx` (opens the chat a tap asked for), `CoachSettings.test.tsx`,
  `NotificationPanel.test.tsx` (the two kinds).

Compare checklist (filled after the rewrite; reopened `CoachTools.kt`: its proposal tools, the
cap per reply, the card the person confirms):
- [x] The proposal stays as it was where the Coach may not act (the web, the switch off)
  (`session.test.ts > createCoachSession: what the Coach does itself in the Android app (P17-03,
  D-16.102) > proposes as on the web while the switch is off`; `> offers neither tool on the web,
  where the app gives the Coach no actions`; `engine.test.ts > runTurn: what the Coach does itself
  in the Android app (P17-03, D-16.102) > offers set_reminder and schedule_check_in with their
  rules; propose_reminder while it is off`)
- [x] Direct add with the same checks and the 20 limit, the result says set (`ownTools.test.ts >
  set_reminder: the Coach sets a reminder at once (P17-03, D-16.102) > *`; `session.test.ts > … >
  sets a reminder at once while Let the Coach set reminders is on, its card set`)
- [x] Undo and Edit (`reminderCards.test.ts > createReminderCards: Undo on a reminder the Coach set
  (P17-03, D-16.102) > *`; `session.test.ts > … > takes the reminder away on Undo, and the card
  waits for Add again`; `ReminderCard.test.tsx > ReminderCard: a reminder the Coach set (P17-03,
  D-16.102) > *`)
- [x] A cap per reply (5, shared by proposals and set reminders) and the same one once
  (`ownTools.test.ts > set_reminder … > sets the same reminder once in one reply, and refuses a bad
  one with the reason`)
- [x] Check-in validation, ≤ 14 days, ≤ 120 characters, ≤ 3 waiting (`checkIns.test.ts > *`;
  `ownTools.test.ts > schedule_check_in: the Coach schedules a check-in (P17-03, D-16.102) > *`)
- [x] Planning: kind, channel, ids 210–241 never colliding, quiet hours exempt (`nativePlan.test.ts >
  nativePlan: the Coach’s check-ins (P17-03, D-16.102) > *`; `setup.test.ts > the Coach’s
  notifications in the Android app (P17-03, D-16.102) > keeps a check-in at its time in quiet hours`)
- [x] The message appears in its chat when the check-in comes, once (`setup.test.ts > … > plans a
  check-in in its channel; when it comes its message is in the chat, once, and in the inbox`; `> puts
  the message in when Android shows the check-in while the app runs`; `checkIns.test.ts > … > takes
  the check-ins whose time has come off the list, once, and writes nothing otherwise`)
- [x] The tap opens that chat (`open.test.ts > where a notification opens the app (P17, D-16.101) >
  opens {"coachChat":"chat-1"}`; `setup.test.ts > … > opens the Coach on the chat of a tapped reply
  or check-in`; `CoachPage.test.tsx > CoachPage: the Coach’s notifications (P17-03, D-16.102) > opens
  the chat a notification’s tap asked for, whether or not the Coach was on screen`;
  `NotificationPanel.test.tsx > the notification panel: the Coach’s (P17-03, D-16.102) > *`)
- [x] The Coach replied only when not looking, once per message, its switch and quiet hours
  (`setup.test.ts > … > posts The Coach replied only when the person is not looking at that chat,
  once a reply`; `> drops The Coach replied in quiet hours, and while its switch is off`;
  `CoachPage.test.tsx > … > says which chat it shows, so a reply there is not announced, and none
  once it is gone`; `session.test.ts > … > reports each stored reply, and nothing for a failed turn`)
- [x] What a failed or dropped turn set is taken back (`engine.test.ts > … > takes back what a failed
  attempt set, so the standby starts from nothing set`; `> takes it all back when the turn fails for
  good`; `session.test.ts > … > takes back what it set when the reply is not stored: its chat was
  deleted meanwhile`)
- [x] The prompt lines (`coach.test.ts > coachSystemPrompt: what the Coach does itself (P17-03,
  D-16.102) > *`) and the schemas (`toolSchemas.test.ts > SET_REMINDER_TOOL and CHECK_IN_TOOL: what
  the Coach does itself (P17-03, D-16.102) > *`, `tools.test.ts > runCoachTool: the Coach’s own tools
  (P17-03, D-16.102) > *`)
- [x] Settings: the switch and the check-in list (`CoachSettings.test.tsx > *`; `service.test.ts >
  … > stores Let the Coach set reminders, and cancels a check-in (P17-03, D-16.102)`), the check-in
  card with Cancel (`CoachPage.test.tsx > … > shows a waiting check-in under the reply that set it;
  Cancel takes it away`; `> shows no check-in card on the web`)
- Deliberate differences: the reference's Coach only proposes (workouts); ours sets reminders
  itself in the Android app (with Undo), schedules check-ins and announces replies (D-16.102).
- Not taken: the reference's workout proposals and their tools.

## Decisions for the lead

- **Direct add is the Android app's only.** The web keeps today's proposal with Add (D-16.5); the
  switch is shown in the Android app only. The e2e reminder flow on the web is unchanged.
- **A tool name per mode**: `set_reminder` replaces `propose_reminder` while the switch is on (the
  name says what it does); its result says `set`, the proposal's `proposed`. The 5 per reply cap
  covers both.
- **Writes before the round's results**: the chat wires answer tool calls synchronously, so the
  engine makes the round's `set_reminder` / `schedule_check_in` writes first, in call order
  (`ownTools.ts`), then hands their answers to the wire. A failed attempt takes back what it set
  (so the standby never sets it twice, and a failed question leaves nothing); a reply that could
  not be stored (its chat deleted meanwhile) takes everything back too.
- **Card states**: a reminder the Coach set is a reminder card with the new status `set`
  (`src/domain/model.ts`, one value; the codec reads it through the existing guard, no schema or
  codec change). Undo takes the reminder away and the card becomes a proposal again (Add,
  Dismiss). The card shows the reminder as Your reminders keeps it (an edit shows), and Edit opens
  the same editor as Settings (fetched on demand); Edit goes once the reminder was deleted.
- **Check-ins are a setting list** (`coach.checkIns`, in backups like `remind.custom`): the chats
  they reply in travel in backups, so a restored phone plans them again; a passed one's message
  goes into its chat at its time on the next start. Each record holds its chat and, once the reply
  is stored, the reply's id: the card under that reply is drawn from the list (no message field),
  so it shows while the check-in waits and is gone after Cancel, Delete in Settings, or once it
  came (the message itself is then in the chat).
- **Check-ins and quiet hours**: they come at their time even in quiet hours (the person agreed to
  each), say so in Settings ("From the Coach, even in quiet hours.") and in the tool's description
  and the prompt ("It comes even at night, so pick a time they would welcome").
- **Check-ins need only Android's permission**, not the reminders' Notifications switch; no Smart
  notifications switch (Delete in the list, or mute their Android channel `platewise-coachCheckIn`).
  Ids 210–241: 32 slots by a hash of the check-in's id, so a new one seldom takes the id of one that
  just came and may still be in the shade.
- **Delivery**: at every plan handed over (start, return, every change), when Android shows a
  notification while the app runs, and on a tap; the due check-ins are taken off the list in one
  transaction before their messages are stored (role assistant, at the check-in's time), so two
  looks at once deliver once. A chat deleted here drops its check-ins; one deleted in another tab
  drops the message when it comes.
- **The Coach replied**: a Smart notifications switch ("Coach replies", on), quiet hours apply, and
  it needs the permission; onceKey `coachReplied:<message id>`; the body is the reply's start as the
  Chats list shows it (Markdown marks out). "Looking at that chat" = the page visible and the Coach
  screen showing that chat (`services/coach/onScreen.ts`, which the Coach screen updates). Notices
  of one kind share one id per day (S1's rule), so a newer reply replaces the older one in the
  shade; the panel keeps both.
- **Open a chat**: `OpenApp.openChat` asks the Coach screen for the chat (`coachScreen.ask`) and the
  route goes to the Coach; the screen takes the request when it shows.
- **Strings**: 11 short ones; the prompt and the tool text are in the lazy engine chunk.

## Status

Done (2026-10-28). Screenshots in the report. Not run on a device. Lines outside the task's files:
`src/domain/model.ts` (one card status), `src/domain/reminders/notices.ts` (`coachReplied` in
`SMART_KINDS`) and its test, `src/main.tsx` (wiring: `coachRepo` to the notifications, `actions`
and `onReply` to the session).
