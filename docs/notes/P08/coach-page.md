# Task: Coach page (P08-10) · Phase: 08 · Owner: builder (wt-p08s5, slice S5)

Read (reference @ `10e14b67`): `A/ui/coach/CoachScreen.kt` (the screen's scaffold and top bar,
the keyboard and drag handling, `EmptyState` and its prompt cards, `MessageList`, the typing row and
the error row, `MessageBubble`, `AssistantBadge`, `Bubble`, the Reset dialog),
`I/Views/ChatView.swift` (the body layout, the Reset toolbar button and alert, `emptyState`,
`messageList` with its scroll anchoring, `MessageBubble`, `CoachAssistantBadge`,
`TypingIndicator`). Research spec `04-coach.md` §3.1 (layout and states), §3.4 (rendering), §3.5
(Reset), §3.6 (errors), §5 (keyboard, `visualViewport`, blur on drag); decisions D-16.31 (friendly
error, Details, Retry), D-16.34 (a late reply after Reset is dropped), D-16.33 and D-16.85 (chips).
The reference has no tests for this screen.

What it does (own words): the Coach tab. A heading with a Reset button that is off while there is
nothing to clear and asks before it clears (a destructive "Clear"). An empty chat shows a round
chat icon, a short title, one sentence saying what the Coach can see, and up to four suggested
questions as cards in two columns that send at once and wait while a reply is on its way. Once
there are messages they show as a list: the person's on the right (with the photo they attached on
top), the Coach's on the left behind a small round badge, drawn from Markdown with a copy button.
While a reply is on its way three dots pulse at the end, the lit one moving every 350 ms. When the
newest question failed, a banner at the end says what went wrong in our words, can show the
provider's own message under Details, and offers Retry. The list follows new messages and the
waiting dots; dragging it closes the on-screen keyboard; the composer stays above that keyboard.

Inputs → outputs:
- `useServices().coachSession` (pending through `useSyncExternalStore`, `send`, `retry`, `reset`),
  `useCoachMessages()` (the stored conversation, live), `useCoachChips()` → the page.
- `MessageList({ messages, pending, onRetry, keyboardInset })` → bubbles, the typing row and the
  banner; scrolls itself to the end.
- `Bubble({ message })`, `TypingDots()`, `ErrorBanner({ kind, details, pending, onRetry })`,
  `EmptyCoach({ chips, pending, photo, onSend, onPhotoUsed })`.

Files: created `src/features/coach/{MessageList,Bubble,TypingDots,ErrorBanner,EmptyCoach}.tsx`,
`src/features/coach/{CoachPage,MessageList,TypingDots,ErrorBanner}.test.tsx`; changed
`src/features/coach/CoachPage.tsx` (the placeholder goes), `src/features/coach/coach.module.css`,
`src/i18n/en/coach.ts` (additive keys).

Edge cases / failure modes:
- Messages still loading: header and composer only (Reset off); a read error: one short line.
- Reset while a reply is pending: allowed (the session aborts it and drops the late reply,
  D-16.34); Reset when storage fails: the dialog closes and a toast says the chat was not cleared.
- The newest message is a failed question but a turn is pending (a Retry or a new send): no banner
  until the turn ends; the session clears the mark while it asks again.
- A stored failure kind the app does not know (an older build), `cancelled` or `bothFailed` (which
  needs provider names): the generic message.
- No detail text stored (offline, timeout): no Details control, Retry only.
- A message with an unreadable thumbnail: the bubble shows its text only (the image fails quietly).
- No `visualViewport` (older browsers, tests): the page keeps its normal height.

Our design differences / decisions:
- Our words throughout; the title is the tab name and sits at the start like every other tab.
- Reset uses our `trash` glyph (the set has no turning arrow) with the name "Clear chat"; the
  confirm's action is "Clear". Toast when clearing fails (the reference cannot fail visibly).
- Errors are per question (stored on the message, D-16.31), so the banner shows for the newest
  message when it is a failed question; an older failed question gets no banner (it is sent again
  in front of the next question, D-16.85), like the reference's banner that lasts until the next
  send.
- Details is a toggle button with `aria-expanded` over the stored, redacted provider text.
- The page is a fixed-height column inside the shell's content area: only the list scrolls, so
  the chips row and composer stay put. With the on-screen keyboard open (`visualViewport` shows
  the bottom covered), the column ends above the keyboard instead of above the tab bar.
- A drag (touch move) or a tap in the conversation or the empty chat blurs the field; scrolls the
  page makes itself do not (as Android). The row names the drag; the tap is the reference's too
  (§3.1).
- Following the end: on a new message, a reply starting and the keyboard moving (always), and
  while the person is at the end (within 24 px) whenever the list gets shorter or its content
  taller (`ResizeObserver`: the field grows, a photo is attached, Details opens). A sent photo
  keeps its frame from the first draw, so a reloaded conversation opens at its end.
- The draft (text and photo) lives in the page, shared by the composer and the chips: a chip sends
  with the photo and leaves the typed text (D-16.85).
- Badge: our `chat` glyph in a small disc; bubbles use the accent fill and the card surface from
  tokens (no gradients, D-16.1).

Decisions for the lead:
- `src/features/settings/SettingsHub.test.tsx` > "tab placeholders" renders `<CoachPage />` with no
  providers; the real page reads the data hooks and services, so that case must go (the Coach
  heading is covered in `CoachPage.test.tsx`). I did not touch the settings folder.
- Older failed questions show no Retry (only the newest does). If they should, a small "Not
  answered · Retry" line under the bubble is the smallest addition.

Tests we will write:
- `CoachPage.test.tsx` (fake session over the test database): empty → four cards (ACC-I1-1);
  tapping a card sends its words; a card takes the composer's photo; cards off while pending;
  Reset off when empty, asks when not, Clear calls `reset` (also while pending), Cancel does not;
  a failed Reset shows a toast; the error banner of the newest failed question shows the friendly
  message, Details and Retry calls `retry(id)`; the typing dots show and step while pending with
  fake timers (ACC-I1-2); a drag or tap in the conversation blurs the field, a scroll does not; the
  keyboard inset; an unreadable conversation; an unreadable photo restores the draft (P08-11).
- `MessageList.test.tsx`: user right with a thumbnail, assistant left with badge, reply and copy;
  typing row only while pending; the banner only for the newest failed question and not while
  pending; auto-scroll on new messages, when pending starts and when the keyboard moves; staying
  at the end through size changes, and not when the person scrolled back.
- `TypingDots.test.tsx`: three dots, the lit one moves every 350 ms with fake timers (ACC-I1-2).
- `ErrorBanner.test.tsx`: friendly message per kind, unknown kind → generic, Details toggles the
  stored text, no Details without text, Retry calls back and is off while pending.

Compare checklist (filled after the rewrite; reopened `CoachScreen.kt` `CoachScreen`, `EmptyState`,
`EmptyPromptCard`, `MessageList`, `TypingIndicator`, `MessageBubble`, `AssistantBadge`, `Bubble`;
`ChatView.swift` `body`, `emptyState`, `emptyPromptGrid`, `messageList`, `MessageBubble`,
`CoachAssistantBadge`, `TypingIndicator`):
- [x] Top bar: title and Reset, off when empty, confirm with a destructive action and Cancel
  (tested in `src/features/coach/CoachPage.test.tsx` > CoachPage: Reset)
- [x] Empty state: icon, title, sentence, up to four cards in two columns that send at once and are
  off while pending (tested in `src/features/coach/CoachPage.test.tsx` > CoachPage: empty chat
  (P08-10); the grid and the four-card cap in `src/features/coach/ChipRow.test.tsx`)
- [x] Chips row only once there are messages, above the composer (tested in
  `src/features/coach/CoachPage.test.tsx` > CoachPage: conversation > shows the messages, the
  chips row above the composer, and no cards)
- [x] Bubbles: user right with the photo on top and the words verbatim, assistant left behind a
  badge hidden from screen readers (tested in `src/features/coach/MessageList.test.tsx` >
  MessageList: bubbles)
- [x] Typing row after the last message while pending; three dots, 350 ms step, back to the first
  (tested in `src/features/coach/TypingDots.test.tsx` > TypingDots (P08-10),
  `src/features/coach/MessageList.test.tsx` > MessageList: typing dots,
  `src/features/coach/CoachPage.test.tsx` > CoachPage: conversation > shows the typing dots…)
- [x] Error row inline at the end with a warning icon; gone while the next turn runs (tested in
  `src/features/coach/ErrorBanner.test.tsx` > ErrorBanner (P08-10, D-16.31),
  `src/features/coach/MessageList.test.tsx` > MessageList: error banner)
- [x] Auto-scroll on message count and on pending start; the first jump without animation (tested
  in `src/features/coach/MessageList.test.tsx` > MessageList: following the end)
- [x] Keyboard: a user drag or a tap on the message area lets go of the field, a scroll the page
  makes does not; the composer stays above the keyboard (tested in
  `src/features/coach/CoachPage.test.tsx` > CoachPage: keyboard)
- [x] Reset clears the error with the messages (the banner is per message; tested in
  `src/features/coach/CoachPage.test.tsx` > CoachPage: Reset > clears with the destructive Clear…)
- Deliberate differences: our words; the title at the start like the other tabs; our `trash` glyph
  for Reset with the name "Clear chat" and a "Clear" confirm; a toast when clearing fails; Details
  and Retry on the banner (D-16.31), which shows for the newest failed question only; Reset stays
  on while a reply is pending and drops it (D-16.34; the reference let the late reply land); the
  list also stays at the end through size changes while the person reads the end (the reference
  re-anchors on focus and on the keyboard showing); flat token colours instead of gradients and
  glass (D-16.1); the page keeps a fixed height inside the shell so only the conversation scrolls.
- Not taken: proposal cards under replies (workouts phase); the hosted-AI paywall sheets (later
  phase); iOS's scroll on input focus (the keyboard inset change covers phones).

## Status

Done (2026-10-27). Files: `src/features/coach/{CoachPage,MessageList,Bubble,TypingDots,
ErrorBanner,EmptyCoach}.tsx`, their tests (`CoachPage`, `MessageList`, `TypingDots`,
`ErrorBanner`), `coach.module.css`, additive keys in `src/i18n/en/coach.ts`. Checked in a real
mobile browser (Pixel 7 profile on the built app): the empty chat, a failed question with Retry,
a seeded conversation with a photo, the Reset dialog, a five-line field; two layout bugs found
there and fixed (the chips row widened the page; a reloaded conversation opened above its end).
For the lead: drop the Coach case of `src/features/settings/SettingsHub.test.tsx` ("tab
placeholders"), which renders the page with no providers; P08-14 can use the hooks
`coach.message` (`data-role`), `coach.list`, `coach.empty`, `coach.typing`, `coach.error`,
`coach.details`, `coach.retry`, `coach.reset`, `coach.resetDialog.confirm`.
