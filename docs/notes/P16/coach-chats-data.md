# Task: several Coach chats, data and service (P16-02) · Phase: 16 · Owner: builder (wt-p16s2, slice S2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist" BEFORE
writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`), behaviour only: `android/.../ui/coach/CoachViewModel.kt` (send,
the history it sends, `resetConversation`), `android/.../data/ChatRepository.kt` (one stored list,
append / clear / the last 20 for the context), `ios/calorietracker/Stores/ChatStore.swift` (one
stored history, `reset`) and the top bar of `ios/.../Views/ChatView.swift`. What they show: the
reference keeps **one** conversation on both platforms, stored as one list; its only history action
is a reset icon in the top bar (off while the chat is empty) behind a confirmation. There is no
list of conversations, no new-chat action and no titles. Several chats are ours (D-16.99). Ours:
the P16 phase file (Goal, D-16.99, the `CoachChat` contract), D-16.29 (200 messages), D-16.31
(Retry), D-16.34 (a late reply after Reset is dropped), I5, I10, I11 in
`docs/plan/03-feature-inventory.md`; `src/services/coach/{session,engine,history,reminderCards,
snapshot}.ts` and their tests; `src/data/{schema,codecs,guard,hooks,DataProvider,live,useLive}.ts`,
`src/data/repos/{coachRepo,backupRepo}.ts` and their tests; `src/services/backup/{payload,restore,
hash,backup}.ts`, `testing/seed.ts` and the tests; `src/services/yourData.ts` and `src/data/wipe.ts`;
`docs/notes/P15/walk-domain-and-data.md` (how schema 3 added `walks` and kept the backup version at
1). No REA evidence for this task.

What it does (own words): the Coach keeps chats instead of one conversation. A chat is a row in a
new `coachChats` table (id, title, whether the person named it, when it started, when its newest
message came); every Coach message carries the id of its chat. A chat is stored together with its
first question, titled from that question's start (60 characters at most, cut at a word), so an
opened but unused chat never becomes a row. Each chat keeps its own newest 200 messages. Opening
the app on schema 3 moves the one conversation into a first chat. The Coach session runs one turn
per chat: a turn is bound at Send to the chat it was asked in and its reply is stored there,
whatever the person opens meanwhile; several chats can wait at once; deleting a chat stops its turn
and a reply that still arrives for it is dropped (D-16.34 now reads "deleted" for "reset"). Each
turn sends only its own chat's messages; the snapshot and the tools are the same for every chat.
Backups carry the chats as an added list (document version stays 1); a file without them (1.3)
restores into one chat. Erase everything deletes the database, chats included.

Inputs → outputs:
- `src/domain/model.ts` (shared): `CoachChat` as the phase file's contract; `CoachMessage.chatId`.
- `src/domain/coach/chats.ts` (new, pure): `CHAT_TITLE_MAX = 60`; `chatTitle(text)` → the words
  with runs of white space as one space, trimmed; longer than 60 characters (counted as code
  points, so an emoji is never split) → cut at the last space before the 60th and ended with "…"
  (a single long word is cut hard); `''` when there are no words (screens show "Earlier chat" for
  an empty title). `chatFromMessages(id, messages)` → a chat row for messages that have none (the
  upgrade and a restore): titled from the oldest of the person's messages with words, created at
  the oldest message, updated at the newest. `FIRST_CHAT_ID = 'chat-earlier'`: the id the upgrade
  and a 1.3 file's restore give that chat (fixed, so both give the same and a test can name it).
- Schema 4 (`src/data/schema.ts`): `coachChats: 'id, updatedAt'` (an added table, kept in backups:
  `KEPT_ADDED_TABLES = ['walks', 'coachChats']`), `coachMessages: 'id, at, chatId'`. Its upgrade
  (`migrate`): the stored messages (objects only; time and append order as the repository keeps
  them) → one chat from `chatFromMessages(FIRST_CHAT_ID, …)` and that id on every message row,
  unreadable ones too, so nothing is orphaned. No messages → no chat.
- Codecs: `decodeCoachChat` (unreadable without its id or either time; title read as text, `''`
  otherwise; `titleByPerson` false unless true); `decodeCoachMessage` now also needs a non-empty
  `chatId` (a message without a chat has no place to show).
- `coachRepo` (one write queue as before; every write in one transaction over `coachMessages`,
  `coachChats` and the guard's tables):
  - `chats()` → readable chats, newest activity first (`updatedAt`, then `createdAt`, then id).
  - `summaries()` → each chat with its newest readable message's side and words (for the Chats
    list), same order.
  - `list(chatId)` → that chat's readable messages, oldest first (time, then append order, then id).
  - `get(id)` → one readable message or null (the reminder cards find their reply this way).
  - `append(message, {start?})` → stores the message in `message.chatId` and moves the chat's
    `updatedAt` on; with `start` a chat that is not stored is started (titled from this message),
    without it a message for a chat that is not stored is not stored either and the promise
    resolves to null (the chat was deleted meanwhile). After storing, the chat's readable messages
    beyond its newest 200 go, thumbnails with them (D-16.29 per chat).
  - `patch(id, changes)` as before.
  - `rename(chatId, title)` → the title trimmed and cut to 60 characters, `titleByPerson` true;
    null for a chat that is not stored; an empty title is refused (TypeError).
  - `remove(chatId)` → the chat and all its messages in one transaction (unreadable ones kept aside
    first, as Reset did); true when there was a chat.
  - The conversation generation in `meta` is no longer read or written (chat ids are never reused,
    so "the chat is still stored" replaces it).
- Hooks: `useCoachChats()`, `useCoachChatSummaries()`, `useCoachMessages(chatId)`;
  `DataSources.coachRepo` gains `chats` and `summaries`.
- `createCoachSession` (`src/services/coach/session.ts`):
  - state `{ waiting: readonly string[] }`: the chats with a turn running;
  - `newChatId()` → a fresh id for a chat the screen opens (nothing is stored);
  - `send(chatId, text, image?)` → `TurnOutcome`; `ignored` while that chat already waits (two
    quick taps start one turn, R04.5) — other chats are free; the question is stored with `start`,
    the answer without;
  - `retry(chatId, id)` → asks a failed question of that chat again;
  - `deleteChat(chatId)` → stops that chat's turn at once (its request aborted, its waiting mark
    gone), forgets the photos of its failed questions, removes the chat; rejects only when storage
    refused;
  - `renameChat(chatId, title)` → the stored chat or null;
  - `addReminder` / `dismissReminder` as before (the cards find their reply with `get`).
- Backups: `coachChats` rows through their codec (`BACKUP_CODECS`, `shapeRow`); before shaping, a
  file's messages are given a chat: a message without `chatId` (a 1.3 file) goes to
  `FIRST_CHAT_ID`, and a message whose chat the file does not list gets a chat made from its
  messages (`chatFromMessages`), so a chat row that was unreadable when the backup was made never
  makes the file refused. The hash is over the file's lists as written, unchanged.

Files: created `src/domain/coach/chats.ts` (+ test), `src/data/coachRows.ts` (the raw-row order
and the chat for rows without one, moved out of the repository so the upgrade and the restore
share it), these notes; changed `src/domain/model.ts` (shared: `CoachChat`, `chatId`),
`src/data/{schema,codecs,hooks,DataProvider}.ts`, `src/data/repos/{coachRepo,backupRepo}.ts`,
`src/services/coach/{session,reminderCards}.ts`, `src/services/backup/{payload,restore}.ts`,
`src/services/backup/testing/seed.ts`, `src/test/factories.ts` (shared: `makeCoachMessage` gets a
chat id, `makeCoachChat`), and the tests. `src/main.tsx` needs nothing new: the session's deps are
the same (new chat ids default to random UUIDs).

Edge cases / failure modes:
- Upgrade with no messages: no chat. With unreadable messages: they get the chat id too and stay
  unreadable (kept aside on the next read). A message with no time: still moved; the chat's times
  come from the readable ones (0 when there is none).
- A reply for a chat deleted here or in another tab: `append` without `start` finds no chat → null
  → `dropped`. A question asked in a chat deleted in another tab a moment before: `start` makes it
  a chat again with the same id (the screen moves to a new chat as soon as it sees the delete, so
  this needs a send inside that moment).
- Two chats waiting: each run has its own abort and its own photo; deleting one leaves the other.
- Delete while the photo of a send is being prepared: the run is marked dropped before the question
  is stored, so nothing is stored. Delete after the question was queued: the queue runs the remove
  after it, so the question goes with the chat.
- Retry of a question whose chat is gone, or of an answered question: `ignored`.
- Rename of a chat deleted meanwhile: null, nothing stored. Rename to spaces: refused before the
  store.
- Cap: a chat at 200 drops its own oldest, never another chat's; unreadable rows are never
  counted, overwritten or deleted by the cap.
- Restore: a 1.3 file (no `coachChats`) → one chat; a 1.4 file restored by 1.3 → 1.3 skips the
  unknown list (its hash still matches) and its codec leaves `chatId` behind, so all messages show
  in its one conversation; a damaged chat row → the file is damaged.

Our design differences / decisions:
- The reference has one conversation and Reset; several chats, New chat, the Chats list, rename
  and Delete chat are ours (D-16.99).
- A turn is bound to its chat by the chat id it was asked with, and dropped by the chat being gone
  (no generation counter any more).
- The 1.3 conversation and a 1.3 backup land in a chat with the fixed id `chat-earlier`.
- An automatic title is stored as words (or `''`), never as UI copy: "Earlier chat" is the screen's
  word for an empty title, so it follows the language.
- No limit on the number of chats (the phase file).

Tests we will write:
- `src/domain/coach/chats.test.ts`: titles (short, long cut at a word, one long word, white space,
  emoji, empty), `chatFromMessages`.
- `src/data/schema.test.ts`: version 4 adds `coachChats` and the `chatId` index; 3 → 4 and 1 → 4
  keep every row, the conversation becomes one chat titled from its first question with its times,
  every message carries its id; no messages → no chat; no words → `''`.
- `src/data/codecs.test.ts`: `decodeCoachChat`; a message without `chatId` is unreadable.
- `src/data/repos/coachRepo.test.ts`: start / drop without start, `updatedAt`, order of chats,
  per-chat cap (and the other chat untouched), rename (kept over the automatic title), remove with
  unreadable rows kept aside, summaries, `get`.
- `src/data/hooks.test.tsx`: the three hooks.
- `src/services/coach/session.test.ts`: two chats answering at once, switching while a reply runs
  (a new chat asked meanwhile), delete during a reply (this tab and another), each chat sends only
  its own messages, retry per chat; the old tests kept, per chat.
- `src/services/backup/{backup,restore}.test.ts`: chats out and back in (round trip), a 1.3 file
  into one chat, a message whose chat the file does not list.
- `src/services/yourData.test.ts`: Erase everything leaves no chat.

Compare checklist (filled after the rewrite; reopened `CoachViewModel.kt`, `ChatRepository.kt`,
`ChatStore.swift`, `ChatView.swift`):
- [x] One conversation per chat, stored locally and kept over a restart; the history sent with a
      question is that chat's newest messages (tested in `src/services/coach/session.test.ts` >
      several chats > answers two chats at once, each reply in its own chat, each request with its
      own chat only; `src/data/repos/coachRepo.test.ts` > lands appends made without waiting in
      call order, also after a reopen).
- [x] Clearing asks first and empties the conversation; ours deletes the open chat and drops a late
      reply (the reference lets it land, D-16.34) (tested in `session.test.ts` > Reset (R04.6,
      D-16.34) > aborts the running request…, drops a reply that comes back after a Reset in
      another tab; `coachRepo.test.ts` > deletes a chat with its messages only, and drops a reply
      that comes after).
- [x] The cap per chat (tested in `coachRepo.test.ts` > keeps the newest 200 of 205 messages…,
      caps each chat on its own…).
- [x] Schema 4 and its upgrade: one chat from the 1.3 conversation, titled from its first question,
      its times from its messages, every row kept, no chat for no messages, an empty title for no
      words (tested in `src/data/schema.test.ts` > schema version 4 (P16-02)).
- [x] Titles: 60 characters at most, cut at a word, emoji whole (tested in
      `src/domain/coach/chats.test.ts`); a renamed title is kept (tested in `coachRepo.test.ts` >
      renames a chat for good…).
- [x] Codecs (tested in `src/data/codecs.test.ts` > cannot read a message without its chat, reads
      a chat, needing its id and both times…); hooks (`src/data/hooks.test.tsx` > useCoachMessages,
      useCoachChats and useCoachChatSummaries).
- [x] Several turns at once, switching while a reply runs, delete during a reply, retry per chat,
      rename (tested in `session.test.ts` > several chats (P16-02, D-16.99)).
- [x] Backups: chats travel as one more list at document version 1 and the hash covers every list
      (tested in `src/services/backup/backup.test.ts` > carries the Coach’s chats as one more
      list…); round trip (`restore.test.ts` > gives back identical tables after backup, erase
      everything and restore…, `coachChats` in its list); a 1.3 file into one chat (`restore.test.ts`
      > restores a file made by 1.3…); a message whose chat the file does not list
      (`restore.test.ts` > gives a chat to messages whose chat the file does not list…); a damaged
      chat row refuses the file (`restore.test.ts` > refuses a file whose chat cannot be read…).
- [x] Erase everything removes every chat (tested in `src/services/yourData.test.ts` > deletes
      everything, the nudge’s key too… (ACC-K6-1)).
- Deliberate differences: the reference keeps one conversation (both platforms) and lets a reply
  that arrives after Reset land in the new conversation; ours keeps several chats (D-16.99) and
  drops a reply for a deleted chat (D-16.34). The 1.4 → 1.3 direction (1.3 restoring a 1.4 file)
  cannot run here; what makes it work is tested instead: the version stays 1 and the hash is over
  every list, unknown ones included.
- Not taken: nothing from the reference's code, names or copy.

## Status

Done (2026-10-28). Data (schema 4, upgrade, codecs, repo, hooks), backups and restore, the
session per chat and the tests are in. Lines changed outside the task's own files:
`src/domain/model.ts` (`CoachChat`, `chatId`), `src/test/factories.ts` (`chatId` on
`makeCoachMessage`, `makeCoachChat`), `src/app/App.test.tsx` and
`src/app/DamagedDataNotice.test.tsx` (the two new read methods in their stand-in sources),
`src/services/context.tsx` (one comment line). Decisions for the lead:
- The 1.3 conversation, and a 1.3 backup's messages, go to a chat with the fixed id
  `chat-earlier`; its title is the first question's start, or empty (shown as "Earlier chat").
- A question for a chat that is not stored starts it (`start`); a reply for one is dropped. No
  generation counter any more (the `coachGeneration` row in `meta` is left as it is, unread).
- A message whose chat a file does not list gets a chat made from its messages (a chat record that
  could not be read when the backup was made must not make the file refused).
- `src/data/schema.test.ts`: "is the current version and adds the walks table…" no longer holds
  at version 4; it is now "adds the walks table, keyed by id with an index on the start", and
  `docs/internals/acceptance-map.md` line 1332 (ACC-M18-6) must follow.
