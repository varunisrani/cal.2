# P16 · Sugar on Home, and several Coach chats

**Weeks:** 0.5 · **Tracks:** Home (sugar line, the Coach's facts); Coach (chats: data, service, screens) · **Depends on:** P00–P15 · **Status:** 📋 planned (2026-10-28, at the owner's request) · **Ships as:** 1.4.0

## Goal

The owner asked (2026-10-28) for two things: to see on Home how much sugar they eat, and to start a new Coach chat and
keep a history of chats, so several conversations exist side by side. Today sugar is already recorded per food (the
analysis, labels and barcodes fill `nutrients.sugar`; Settings › Nutrient goals has a Sugar limit, 50 g by default) but
Home shows it only if the person picks Sugar as a pillar, two levels down (Home › All nutrients › Choose pillars). The
Coach keeps one conversation (I10: the newest 200 messages; I5: Reset).

## Decisions

- **D-16.98 Sugar on Home.** Under the pillars, Home shows a Sugar line for the shown day: the grams eaten against the
  Sugar limit from Nutrient goals ("32 g of 50 g"), a thin bar, and past the limit "8 g over" in the warning colour; with
  the limit turned off, "32 g" alone. When some of the day's foods have no sugar figure, the line says so ("from 4 of 6
  foods") rather than showing an undercount as complete; a day with foods but no sugar figures says "No sugar figures"
  instead of 0 g. When the day has added-sugar figures it adds "12 g added". A tap opens All nutrients. The line is
  hidden while Sugar is one of the chosen pillars (no double display), and a **Sugar on Home** switch (default on) in
  All nutrients turns it off. The Coach's fresh context (I6) gains today's sugar and the limit, with the same honesty
  about missing figures. Pillar defaults, goals and stored values do not change. Web and Android alike.
- **D-16.99 Several Coach chats.** The Coach keeps chats instead of one conversation:
  - **New chat** (top of the Coach screen) opens an empty chat with the goal-aware prompts; it is stored only once the
    first message is sent, so empty chats never pile up. The Coach tab opens the most recent chat.
  - **Chats** (top of the Coach screen) lists every chat, newest activity first: its title, when it was last used and
    the start of its last message; a tap opens it; **Rename**; **Delete** (asks first). A chat's title is the start of
    its first message (at most 60 characters, on a word boundary) until the person renames it.
  - A reply in progress keeps going when the person opens another chat or starts a new one, and lands in its own chat;
    several chats may wait for replies at the same time; the Chats list marks a chat that is waiting. A reply for a
    chat deleted meanwhile is dropped (D-16.34 extended from Reset to Delete). Each chat sends only its own messages to
    the AI; the facts and tools (I6, I7, Health Connect, walks, reminders) are the same for every chat.
  - Storage: a `coachChats` table and a `chatId` on every message (schema version 4, with its upgrade): the existing
    conversation becomes the first chat, titled from its first message (or "Earlier chat" when it has none). The
    200-message cap (I10) applies per chat; there is no cap on the number of chats.
  - Backups carry the chats (backup document version stays 1: `coachChats` is an added list, so 1.3 restores a 1.4
    file with its messages in one conversation); a 1.3 file restores into one chat. Erase everything removes all chats.
  - Reset (I5) becomes **Delete chat** for the open chat, with the same question.

## Contracts

```ts
interface CoachChat {
  id: string;
  title: string;            // the start of the first message, or the person's own
  titleByPerson: boolean;   // a renamed title is never replaced
  createdAt: number;        // epoch ms
  updatedAt: number;        // the newest message's time; the list's order
}
// CoachMessage gains `chatId: string`. Schema 4: coachChats 'id, updatedAt'; coachMessages gains a chatId index.
```

## Slices (wave 22, parallel)

- **S1 sugar** (P16-01): the Sugar line, the switch, the Coach's context line; tests; docs.
- **S2 chats** (P16-02, P16-03): data (schema 4, repo, upgrade, codecs, backups), the Coach service per chat (turns
  bound to their chat, several at once, drop after delete), the screens (New chat, Chats list, Rename, Delete), tests.

## Tasks (3)

| ID | Task | Verify |
|---|---|---|
| P16-01 | **Sugar on Home.** The Sugar line under the pillars for the shown day (limit, over, coverage, added sugar, no figures), hidden while Sugar is a pillar, the Sugar on Home switch (setting `home.sugarLine`, default true) in All nutrients, the Coach's context line. Strings through i18n, `data-ui` hooks, accessible text, tokens only. | unit tests for the sums (missing figures never count as 0), the line's states, the switch, the hide-when-pillar rule, the Coach context; a11y on Home in both themes; e2e unchanged or extended. |
| P16-02 | **Chats: data and service.** Schema 4 (`coachChats`, `chatId`), the upgrade (the existing conversation becomes one chat), repo and live hooks, codecs, backups and restore (a 1.3 file into one chat); the Coach service keyed by chat: send, retry, delete, rename, per-chat in-flight turns that land in their own chat, a reply for a deleted chat dropped, the 200 cap per chat. | unit tests: upgrade, round trip through a backup, a 1.3 backup, two chats answering at once, switching while a reply runs, delete during a reply, per-chat cap. |
| P16-03 | **Chats: screens.** New chat and Chats buttons on the Coach screen, the Chats list (title, time, last message, waiting mark), Rename, Delete with its question, the empty state of a new chat, Delete chat replacing Reset. Strings, hooks, accessible names. Docs: `docs/user/coach.md`, CHANGELOG. | unit tests for each screen; e2e: start a chat, start a new one, switch back through Chats, rename, delete. |
