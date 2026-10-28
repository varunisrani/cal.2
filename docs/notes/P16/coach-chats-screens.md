# Task: several Coach chats, screens (P16-03) · Phase: 16 · Owner: builder (wt-p16s2, slice S2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist" BEFORE
writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`), behaviour only: `android/.../ui/coach/CoachScreen.kt` (the top bar:
a centred title and a round reset icon on the right, off while the chat is empty, its
confirmation) and `ios/calorietracker/Views/ChatView.swift` (the toolbar's reset button and its
alert). The reference has no list of chats, no new-chat button and no chat titles: one
conversation, cleared by Reset. Ours: the P16 phase file (D-16.99); `src/features/coach/**`
(CoachPage, EmptyCoach, MessageList, Composer, ChipRow, followEnd, keyboard, coach.module.css,
ReminderCard) and their tests; `src/ui/{Sheet,Dialog,Button,Field}.tsx`, the icon set, the orange
tokens in `src/ui/tokens.css`; `src/i18n/en/coach.ts`, `src/i18n/format.ts`;
`src/app/{router,TodayProvider}.ts(x)`; `docs/notes/P14/keyboard.md` (the composer above the
keyboard); `e2e/coach.spec.ts`, `e2e/a11y.spec.ts`, `parity/coach.platewise.json` (its hooks);
`docs/user/coach.md`.

What it does (own words): the Coach screen's top bar keeps the heading "Coach" with the open
chat's title under it ("New chat" before its first message), and three icon buttons: **New chat**
(opens an empty chat with the goal's suggested questions; off while the open chat is already new
and empty), **Chats** (opens the list) and **Delete chat** (the old Clear chat: the same question,
off until the chat has been stored). The Chats list is a bottom sheet over the Coach: every stored
chat, newest activity first, each with its title, when it was last used (the time today,
"Yesterday", else the date), the start of its last message on one line, and "Replying…" with the
accent dot while a reply for it is on its way; the open chat is marked. Tapping a chat opens it
and closes the sheet; each row has Rename (a short sheet with the title field, Save and Cancel)
and Delete (asks first). A reply keeps running when the person opens another chat or starts a new
one: Send waits only in the chat that waits. The Coach tab opens the most recent chat, or a new
one when there is none; after the open chat is deleted (here or in another tab) a new chat opens.
The composer keeps its place above the keyboard as before (the page layout is unchanged; the top
bar does not grow with the keyboard open).

Inputs → outputs:
- `CoachPage`: reads `useCoachChats()` and `useCoachMessages(openId)` and the session's `waiting`;
  holds the open chat `{id, stored}`: on the first chats read, the newest chat or a new id from
  `session.newChatId()`; `stored` turns true when the chat shows up in the stored list; a stored
  chat that leaves the list → a new chat. Send / chips / Retry go to `session.send(openId, …)` /
  `session.retry(openId, id)`. `MessageList` is keyed by the chat, so switching opens the other
  chat at its newest message.
- `ChatsSheet` (new): `useCoachChatSummaries()`, the waiting ids, the open id → the list;
  `onOpen(id)`, `onRename(chat)`, `onDelete(chat)`.
- `RenameChatSheet` (new): the field (60 characters at most, focused, its current title in it),
  Save off while it holds only spaces or is unchanged; Save → `session.renameChat`; a refusal → a
  toast.
- Delete (from the top bar or a row): the Dialog with the old Reset words now naming deletion;
  `session.deleteChat(id)`; a failure → a toast.
- `chatWhen(ms, today)` and `preview(text)` (new, pure, in `chatsList.ts`): the "last used" words
  and the one-line start of a message (Markdown marks taken out, white space as single spaces).
- i18n (`coach.page.*`, `coach.chats.*`): New chat, Chats, Delete chat, the question, Earlier chat,
  Replying…, Yesterday, Rename, Save, the field's label, no chats yet, the failure toasts.
- Hooks: `coach.chats.new`, `coach.chats.open`, `coach.chats` (the sheet), `coach.chats.item`
  (with `data-current`, `data-waiting`), `coach.chats.item.open|title|when|last|waiting|rename|delete`,
  `coach.chats.empty`, `coach.chats.renameSheet` (`.field`, `.save`, `.cancel`),
  `coach.chats.deleteDialog`, `coach.chatTitle`; the top bar's Delete chat keeps `coach.reset` and
  its dialog `coach.resetDialog`, which the parity scenario and the e2e already drive.

Files: created `src/features/coach/{ChatsSheet,RenameChatSheet}.tsx`,
`src/features/coach/chatsList.ts` and their tests, this note; changed
`src/features/coach/{CoachPage,CoachPage.test}.tsx`, `coach.module.css`, the coach tests that
build messages (`MessageList.test.tsx`, `ReminderCard.test.tsx`), `src/i18n/en/coach.ts`,
`e2e/coach.spec.ts`, `docs/user/coach.md`.

Edge cases / failure modes:
- No chats at all: the tab opens a new chat; the Chats list says there are none yet.
- A chat whose stored title is empty (an upgrade with no words): "Earlier chat".
- A chat with no readable message left: its row shows no last line.
- The open chat deleted in another tab: a new chat opens, the composer keeps what was typed.
- Several chats waiting: each row marks its own; the open chat's dots show only for it.
- Rename to the same title or spaces: Save stays off. A chat deleted while its Rename sheet is
  open: Save answers nothing stored, the sheet closes with a toast.
- Long titles and previews: one line each with an ellipsis; nothing widens the page.
- Keyboard open: the header stays one block at the top, the composer above the keyboard as P14 set
  it (the page's height rules are untouched).

Our design differences / decisions:
- Chats is a bottom sheet over the Coach, not a page: the router stays as it is and the open chat
  stays in the Coach page; a page would need a route that carries the chat id for nothing more.
- The tab opens the most recent chat each time it is opened (the phase file's words); the chat a
  person picked is not kept across tabs.
- Delete chat keeps the old Reset hooks (`coach.reset`, `coach.resetDialog`) so the parity
  scenario stays valid; its words are new.
- After deleting the open chat a new chat opens (as Reset left an empty chat), not the next one.
- Icons from our own set: `plus` (New chat), `text` (Chats, a list), `trash` (Delete chat),
  `pencil` (Rename).

Tests we will write:
- `src/features/coach/CoachPage.test.tsx`: opens the most recent chat; New chat (empty chat with
  the goal's cards, off while new); Chats opens the sheet; picking a chat shows it; a reply waiting
  in another chat leaves this chat's Send free; Delete chat asks first and opens a new chat; the
  open chat deleted elsewhere → a new chat; the old tests (cards, conversation, error banner,
  keyboard) kept.
- `src/features/coach/ChatsSheet.test.tsx`: rows in order with title, time, last line, waiting
  mark, current mark, "Earlier chat", empty state; tap opens; Rename and Delete call back.
- `src/features/coach/RenameChatSheet.test.tsx`: the field holds the title, Save off for spaces or
  no change, Save renames, a refusal says so.
- `src/features/coach/chatsList.test.ts`: `chatWhen`, `preview`.
- `e2e/coach.spec.ts`: start a chat, New chat, send there, back to the first through Chats, rename,
  delete (axe in both themes on the list).

Compare checklist (filled after the rewrite; reopened `CoachScreen.kt`, `ChatView.swift`):
- [x] The heading and the top-bar actions: Delete chat off until the chat holds something, asking
      first (tested in `src/features/coach/CoachPage.test.tsx` > Delete chat (P16-03, was Reset)).
- [x] The empty chat with four goal-aware prompts, now for every new chat (tested in
      `CoachPage.test.tsx` > empty chat (P08-10) > shows the title… (ACC-I1-1), several chats >
      New chat opens an empty chat with the goal’s questions…).
- [x] The tab opens the most recent chat; a chat deleted elsewhere gives way to a new one (tested
      in `CoachPage.test.tsx` > several chats > opens the most recent chat…, opens a new chat when
      the open chat is deleted elsewhere; `chatsList.test.ts` > nextOpen).
- [x] Chats: rows newest first with name, last use, last message, waiting mark, the open chat
      marked; tap opens; Rename and Delete named after the chat; no chats yet (tested in
      `ChatsSheet.test.tsx`; `CoachPage.test.tsx` > lists every chat in Chats…, renames a chat
      from the list…, deletes a chat from the list after asking…).
- [x] Send stays free in a chat while another waits; the dots show only in the waiting chat (tested
      in `CoachPage.test.tsx` > leaves Send free in this chat while another chat waits…).
- [x] Rename: the name in a focused field of at most 60 characters, Save only for new words, a
      refusal said in a toast (tested in `RenameChatSheet.test.tsx`).
- [x] The composer above the keyboard as before (tested in `CoachPage.test.tsx` > keyboard; the
      page's height rules are unchanged).
- [x] End to end: start a chat, New chat while the first reply runs, send there, back through
      Chats to the first (its reply landed there), each request with its own chat only, rename,
      delete, reload; axe on the list in both themes (tested in `e2e/coach.spec.ts` > several chats
      (P16, D-16.99)).
- Deliberate differences: the reference has one conversation, a reset icon and no list; ours has
  New chat, Chats, Rename and Delete chat (D-16.99). The Chats list is a bottom sheet over the
  Coach, not a page. Delete chat keeps the old `coach.reset` / `coach.resetDialog` hooks so the
  parity scenario still finds them. After the open chat is deleted a new chat opens.
- Not taken: nothing from the reference's code, names, icons or copy.

## Status

Done (2026-10-28). Screens, strings, styles, docs (`docs/user/coach.md`) and tests are in. The
Chats list and Rename are fetched when first opened (each its own chunk, besides the Coach tab's
own lazy chunk); `RenameChatSheet` keeps its own copy of the 60-character limit (a test keeps it
equal to the store's) so the title module stays inside the start-up chunk. Screenshots (light and
dark, en-IN, Asia/Kolkata) were taken with a script outside the repo.
