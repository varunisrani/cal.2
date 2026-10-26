# Task: Coach message repository (P02-11) · Phase: 02 · Owner: builder (wt-p02s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/ChatRepository.kt` (all: one stored list, appends and
clears serialised behind a lock, a context slice taken from the end), `I/Stores/ChatStore.swift`
(all: the list kept in memory and written whole on every change, reset to empty, a failed decode
leaving the list empty). Research spec `04-coach.md` §3.5 (reset), §3.6 (send flow), §3.7
(memory, retention, concurrency, corruption), §6 R04.4, R04.6–R04.8; decisions D-16.29, D-16.31,
D-16.34. Earlier waves: `src/data/guard.ts`, `src/data/codecs.ts` (`decodeCoachMessage`: an
unknown role is unreadable), `docs/plan/17-naming-and-glossary.md` (meta key `coachGeneration`).
No Evidence ids.

What it does (own words): the Coach conversation is stored one record per message (id, role,
text, time, an optional small thumbnail Blob and an optional failed state for Retry) instead of
one ever-growing list rewritten on every message. Appends from this tab go through one queue so
two appends made without waiting for each other are stored in the order they were called; each
append runs in one transaction that stores the message and, when more than 200 readable messages
remain, deletes the oldest ones (with their thumbnails) in that same transaction, so storage is
bounded (D-16.29, R04.8). `list()` returns the conversation oldest first. `patch(id, changes)`
updates a stored message's text or failed state (Retry, D-16.31). `reset()` deletes every message
and moves the conversation generation in `meta` on by one, so a reply that arrives after Reset can
be recognised as stale (R04.6, D-16.34); `generation()` reads it. A message that cannot be read
(for example an unknown role) is dropped from the list and kept aside in quarantine; nothing ever
overwrites it, and Reset copies it aside before deleting it (R04.7).

Inputs → outputs:
- `createCoachRepo(db, {clock?, newId?})` → `CoachRepo`.
- `append(message)` (no id) → the stored message with its new id. `append(message, generation)`
  → the stored message, or null (nothing stored) when the conversation generation has moved on.
- `list()` → readable messages, oldest first (Dexie promise, usable in a live query).
- `patch(id, {text?, state?})` → the updated message, or null when it is missing or unreadable;
  `state: null` clears the failed state.
- `reset()` → the new generation; `generation()` → the current one (0 before any reset).

Files: created `src/data/repos/coachRepo.ts`, `src/data/repos/coachRepo.test.ts`, this note.

Edge cases / failure modes:
- 205 appends → the newest 200 remain, the first 5 are gone (ACC-I10-1).
- Two appends started without awaiting → stored in call order, even when both carry the same
  instant; the order also survives a reopen.
- Messages are ordered by `at`; equal instants keep append order through a hidden sequence number
  stored on the row (rows written without one, e.g. by a restore, sort by id among equal instants).
- An unreadable row (unknown role, missing time) → skipped by `list`, kept aside, never counted
  for the cap, never deleted by it; `patch` on it refuses; `reset` keeps it aside first, then
  deletes it.
- A message stored with an `at` older than the 200 newest is the one the cap removes.
- `append` of a message the codec cannot read back (an unknown role) → TypeError, nothing stored.
- A failed append (a thrown error) does not block later appends in the queue.
- `reset` while appends are queued: queued work runs in call order, so an append called after
  `reset` lands in the new conversation, and one carrying the old generation is dropped.
- A stored generation that is not a whole number ≥ 0 reads as 0 and is kept aside when `reset`
  replaces it.

Our design differences / decisions:
- One record per message and a 200-message cap (D-16.29), instead of one list kept forever.
- An unreadable message is kept aside and the rest still show (the reference decoded the whole
  list as empty and the next append overwrote it, R04.7).
- A conversation generation in `meta` (`coachGeneration`) and an optional generation check on
  append, so a late reply is dropped inside the same transaction that would store it (R04.6).
- `patch` replaces the reference's "replace last assistant" and proposal-status updates; proposal
  cards are the workouts phase's (not in v1).
- No context slice here: picking the last 20 and normalising roles is P08-04 (R04.3).

Tests we will write:
- 205 appends keep the newest 200 (ACC-I10-1, R04.8); thumbnails of removed messages go with
  them.
- two parallel appends land in call order (same instant), also after a reopen.
- reset empties and bumps the generation; an append carrying an old generation stores nothing.
- a corrupt row (unknown role) is quarantined, the rest still list, appends and the cap never
  touch it, reset keeps it aside before deleting (R04.7).
- patch sets and clears the failed state; patch on a missing or unreadable id changes nothing.
- an unreadable role is refused on append; a failed append does not stop the queue.
- `list` follows an append through a live query.

Compare checklist (filled after the rewrite; reopened `A/data/ChatRepository.kt`,
`I/Stores/ChatStore.swift`):
- [x] Writes are serialised so a reply, a state change and a reset cannot overwrite each other;
  messages keep append order (`src/data/repos/coachRepo.test.ts > append and the 200-message cap >
  lands appends made without waiting in call order, also after a reopen`, `> reset and generation
  > applies a reset between appends in call order`, `> append and the 200-message cap > refuses a
  message with an unknown role, and a failed write does not stop the queue`).
- [x] The conversation survives a restart (`coachRepo.test.ts > append and the 200-message cap >
  lands appends made without waiting in call order, also after a reopen`, `> reset and generation
  > empties the conversation and bumps the generation, which survives a reopen`).
- [x] Reset clears every message (`coachRepo.test.ts > reset and generation > empties the
  conversation and bumps the generation, which survives a reopen`).
- [x] Storage is bounded (`coachRepo.test.ts > append and the 200-message cap > keeps the newest
  200 of 205 messages, removing the oldest with their thumbnails (ACC-I10-1, R04.8, D-16.29)`).
- [x] An unreadable message is never lost or overwritten, and the rest still show
  (`coachRepo.test.ts > unreadable messages (R04.7) > keeps a corrupt message aside and still lists
  the rest`, `> never overwrites or deletes a corrupt message on append, the cap or patch`, `>
  keeps a corrupt message aside before a reset deletes it`, `> refuses a reset that cannot keep a
  corrupt message aside, and changes nothing`).
- [x] Updating one stored message in place (the reference's "replace last assistant" and card
  status updates) keeps its position (`coachRepo.test.ts > patch > sets and clears the failed
  state of a question without moving it (D-16.31)`, `> returns null for a message that is not
  stored and stores nothing`).
- [x] A reload elsewhere (the reference reloads after a backup restore) reaches the list:
  `list()` is a live query (`coachRepo.test.ts > append and the 200-message cap > follows an
  append through a live query (R06.3)`).
- Deliberate differences: one record per message with a 200 cap (D-16.29) instead of one list
  kept forever; unreadable messages kept aside one by one (the reference read the whole list as
  empty and overwrote it, R04.7); a conversation generation in `meta` with an optional check on
  append (R04.6, D-16.34); `patch` covers text and the failed state (D-16.31).
- Not taken: the context slice of the last 20 messages and role normalisation (P08-04, R04.3);
  replace-all (a restore is P09's); exercise proposal cards (workouts phase, not v1).

## Decisions for the lead

- Ordering: messages sort by `at`, then by `seq`, a whole number stored on the row by `append`
  (one more than the highest stored), then by id. `seq` is not part of `CoachMessage` and the codec
  drops it on read; `schema.ts` does not mention it (not mine to edit). A restore (P09) that
  writes rows without `seq` still sorts by time; messages sharing an instant then fall back to id
  order. A restore that wants exact order can append in `list()` order or write `seq` itself.
- `append(message, generation)` stores nothing and resolves to null when the stored generation
  differs, inside the append's own transaction, so P08-09 can drop a late reply atomically. Plain
  `append(message)` always stores.
- `append` assigns the id (`NewCoachMessage` has none); the caller supplies `at` from its clock.
- The cap counts readable messages only and never deletes an unreadable one; a message appended
  with an `at` older than the 200 newest is the one the cap removes (it is returned but not kept).
- Queue: `append`, `patch` and `reset` share one in-process queue, and each queued write runs
  outside any transaction the caller is in (`Dexie.ignoreTransaction`). Reads (`list`,
  `generation`) are not queued: await a write before reading what it wrote. As in P02-13, tests
  cannot tell the queue from IndexedDB's own ordering of read-write transactions on one table; it
  is kept because the decision asks for it, and it keeps call order if a write ever awaits
  something before opening its transaction.
- `generation()` reads a stored value that is not a whole number ≥ 0 as 0; `reset` keeps the
  damaged value aside before replacing it.
- Trap ids: the task prompt listed the cap under R04.7 and the unreadable row under R04.8; the
  ledger (`docs/internals/traps-ledger.md`) has them the other way round (R04.7 unreadable kept
  aside, R04.8 bounded storage). Tests follow the ledger.

## Status

Done (2026-10-26). Coach message repository and tests in place; nothing outside the task's files
changed. `coachRepo.test.ts` 15, all passing.
