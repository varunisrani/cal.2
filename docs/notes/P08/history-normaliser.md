# Task: History normaliser (P08-04) · Phase: 08 · Owner: builder (wt-p08s3, slice S3)

Read (reference @ `10e14b67`): `A/services/ai/ChatService.kt` (the history part only: how each of
the three tool loops turns the stored messages into earlier turns, and the on-device branch's own
shorter window), `A/ui/coach/CoachViewModel.kt` (the one line that picks the window before the
engine runs), `A/data/ChatRepository.kt` (`contextMessages`, which takes the newest N). Research
spec `04-coach.md` §3.7 (context window), §3.6 step 4, traps R04.2 and R04.3; decisions D-16.34
and D-16.48. No reference tests cover the window.

What it does (own words): before each Coach turn the engine needs the conversation so far as plain
text turns. We look at the newest 20 stored messages, set aside the question being answered now,
and keep at most 19 earlier ones. Only their words travel: an earlier photo is never sent again.
A provider wants a conversation that starts with the person and takes turns, but our window can
start on a reply (the cut lands mid-exchange, or the 200-message cap removed a question) and a
failed question leaves two person turns in a row. So replies before the first question are
dropped, neighbouring turns of one side are joined with a blank line, and questions left
unanswered right before the new one are put in front of it, so what the model receives always
alternates. The sides are then named the way the wire format wants: `user`/`assistant` for
OpenAI-compatible and Anthropic, `user`/`model` for Gemini.

Inputs → outputs:
- `earlierMessages(messages, questionId)` → the ≤ 19 stored messages that come before the
  question inside the 20-message window, oldest first (the whole list counts as earlier when the
  question is not stored).
- `coachHistory(messages, question: { id, text }, format)` → `{ turns: { role, text }[], text }`:
  `turns` alternate, start with `user`, end with the assistant side (or are empty); `text` is the
  new question with any unanswered questions in front of it.
- `wireRole(role, format)` → `'user' | 'assistant' | 'model'`.

Files: created `src/services/coach/history.ts`, `src/services/coach/history.test.ts`.

Edge cases / failure modes:
- Fewer than 20 stored messages: all earlier ones are used.
- 30 stored → 19 earlier messages are considered, the oldest 10 are not.
- Window starts with one or more replies: they are dropped.
- Two (or more) failed questions in a row: one user turn, texts joined by a blank line.
- A failed question right before the new one: it goes in front of the new question, so the
  conversation never shows two person turns in a row.
- Every earlier message is an unanswered question: no turns; all of them lead the new text.
- A message with a thumbnail: only its text is used.
- A message whose text is blank after trimming: skipped (providers reject empty text blocks).
- A retried question that is not the newest message: only messages stored before it count, never
  later ones.
- Nothing stored: no turns; the text is the question.

Our design differences / decisions:
- Names and structure are ours; one pure module with no React or storage.
- The window is "the messages stored before the question", newest 19. For a question that was
  just stored this equals the reference's "newest 20 minus the newest"; for a retried question
  that is not the newest it keeps later messages out of its history.
- Normalising is new (D-16.34, R04.3): drop leading replies, merge same-side neighbours, and move
  unanswered questions that end the window onto the new question. The last step is our reading
  of D-16.34 "merges same-role neighbours" across the boundary between the history and the new
  question; the row only says failed questions "stay as user text", which they do.
- Texts are trimmed before joining, so merged turns are separated by exactly one blank line.
- No proposal or card lines: there are no exercise proposals in 1.0 (L3).
- Earlier photos are not re-sent (D-16.48); the prompt saying so is P08-01's.

Tests we will write (`history.test.ts`):
- 30 stored → 19 earlier messages, the newest 19 before the question (ACC wording "30 stored → 19 sent").
- A window that starts with a reply drops it; the history starts with `user` (R04.3).
- Two failed questions in a row merge into one user turn with a blank line between (R04.3).
- A failed question right before the new one leads the new text; turns end on the reply side.
- Thumbnails never travel: each turn has only `role` and `text`.
- Gemini roles are `user`/`model`; OpenAI-compatible and Anthropic `user`/`assistant`.
- A retried older question takes only the messages before it.
- Blank messages are skipped; nothing stored gives no turns.

Compare checklist (filled after the rewrite; reopened `ChatService.kt` history parts of the three
loops, `CoachViewModel.kt` window line, `ChatRepository.kt` `contextMessages`):
- [x] Window of 20 minus the question, so at most 19 earlier messages (tested in
  `src/services/coach/history.test.ts` > earlierMessages: the window (04 §3.7) > takes the 19
  messages before the question when 30 are stored)
- [x] Text only, an earlier photo never re-sent (tested in `src/services/coach/history.test.ts` >
  coachHistory: text only (R04.2, D-16.48) > never sends a thumbnail…)
- [x] Role names per format: user/assistant for OpenAI-compatible and Anthropic, user/model for
  Gemini (tested in `src/services/coach/history.test.ts` > coachHistory: roles per format)
- [x] Failed questions stay as the person's text (tested in `src/services/coach/history.test.ts` >
  coachHistory: shape > merges two failed questions in a row…)
- Deliberate differences: the history is normalised (leading replies dropped, same-side neighbours
  merged, unanswered questions moved in front of the new one; D-16.34, R04.3); the question is
  set aside by id, and a retried question takes only the messages stored before it (the
  reference drops the newest message); blank messages are skipped; texts are trimmed.
- Not taken: the on-device model's shorter window (later phase); the proposal lines appended to a
  reply's text (exercise proposals are L3).

## Status

Done (2026-10-27). `src/services/coach/history.ts` and its test; nothing outside the task's files.
The engine (P08-08) calls `coachHistory(messages, { id, text }, format)` and sends `turns` as the
earlier turns and `text` as the new user message (with the photo, when there is one).
