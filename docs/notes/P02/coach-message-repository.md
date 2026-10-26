# Task: Coach message repository (P02-11) · Phase: 02 · Owner: builder (wt-p02s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/ChatRepository.kt` (all), `I/Stores/ChatStore.swift` (all);
for tests, the two chat-store cases of `IT/CoachExerciseProposalTests.swift` (outcomes survive a
reload, messages saved before cards existed still decode; the card logic itself is not in v1).
Research spec `04-coach.md` §3.5 (Reset), §3.7 (memory, concurrency, corruption), §6 R04.6–R04.8;
decisions D-16.29 (newest 200 kept), D-16.34 (late reply after Reset dropped); naming
`17-naming-and-glossary.md` §1.2 (`coachMessages`, meta `coachGeneration`). No Evidence ids.

What it does (own words): the Coach conversation lives on the device so it is still there after a
reload. The reference kept the whole chat as one stored array, rewrote it on every message, kept
every message and photo forever, and on a decode failure started again from an empty array, so the
next message silently replaced the unreadable history. Here each message is its own row (id, role,
text, time, an optional small thumbnail, an optional failure marker for Retry). Writes from this
tab run one after another through a queue, in the order they were asked for, so a reply and a
retry marker cannot cross. After every new message only the newest 200 stay; the older ones are
deleted in the same transaction. Reset deletes every message and bumps a conversation number
(`coachGeneration` in `meta`) so a reply that was still on its way can be recognised as belonging
to the old chat and dropped. A row that cannot be read is left out of the list and copied to the
quarantine; appends never replace it and the 200 cap never deletes it; only Reset clears it, after
its copy is safe.

Inputs → outputs (`coachRepo(db, {clock?})`):
- `list()` → readable messages, oldest first (by `at`; equal times by id).
- `feed()` → live feed of `list()` for the P02-15 hook.
- `append(message, {generation?})` → `{kind: 'added', message}` with the stored message, or
  `{kind: 'stale'}` (nothing written) when `generation` is given and is not the current one.
- `patch(id, {state})` → `'patched' | 'missing' | 'unreadable'`; `state: null` clears the marker.
- `reset()` → the new generation.
- `generation()` → the current generation (0 before the first Reset).
- `COACH_HISTORY_LIMIT` = 200.

Files: created `src/data/repos/coachRepo.ts`, `src/data/repos/coachRepo.test.ts`, this note.

Edge cases / failure modes:
- Two appends started in the same tick (a reply and the next question, or a test calling twice
  without waiting): stored and listed in call order, even with equal or reversed times. The list
  is ordered by `at`, so the repository keeps `at` strictly increasing: a message whose time is not
  after the newest stored message is stored 1 ms after it (the stored copy is returned).
- 205 appends: the five oldest are gone, the newest 200 remain in order (ACC-I10-1).
- Unreadable rows: left out of `list`, kept aside (guard), not counted towards the 200 and never
  deleted by the cap; an append with the same id as a stored row (readable or not) fails and
  changes nothing (`add`, never `put`). `patch` on an unreadable row refuses and leaves the bytes.
- Reset with unreadable rows: each is copied to the quarantine first (`guardKey`); if a copy
  fails the whole Reset is refused and nothing is deleted.
- Generation in `meta` unreadable (not a whole number ≥ 0): reads as 0 and is kept aside; the next
  Reset keeps it aside again before writing the new number.
- A failed write leaves the queue usable: the next operation still runs.
- Other tabs: the queue is per tab, but each operation is one read-write transaction that reads
  what it needs inside it, so the cap and the time order hold across tabs too.

Our design differences / decisions:
- Per-message rows, a 200-message cap and only small thumbnails (D-16.29) instead of one array
  kept forever; per-append cost is one transaction, not a rewrite of the whole chat.
- Unreadable data is kept aside and never overwritten (R04.7) instead of read as empty.
- A conversation generation in `meta`, with an optional generation check on append inside the
  same transaction, so the session (P08-09) can drop a late reply atomically (D-16.34, R04.6).
- Times made strictly increasing on append so "oldest first" is also call order.
- No card (exercise proposal) storage: workouts are not in v1.
- The 20-message context slice is not here; the history builder (P08-04) takes what it needs.

Tests we will write:
- 205 appends keep the newest 200; the first five ids are gone (ACC-I10-1, R04.8).
- two appends started together land in call order, also with equal and reversed times.
- reset empties the list and bumps the generation; a stale-generation append writes nothing.
- a corrupt row is quarantined and the rest still list; appending afterwards leaves it as it was
  (R04.7); the cap never deletes it; reset keeps it aside before clearing.
- patch sets and clears the failure marker; patch on a missing or unreadable row refuses.
- a thumbnail blob round-trips; the live feed follows an append.

Compare checklist (filled after the rewrite; reopened `A/data/ChatRepository.kt`,
`I/Stores/ChatStore.swift`):
- [x] Appends never overwrite each other: the reference holds a lock around read-modify-write;
  here writes run in call order through a per-connection queue and each is one read-write
  transaction (tested in `src/data/repos/coachRepo.test.ts > append > lands two appends started
  together in call order, whatever their times`, `> patch > runs after an append asked for before
  it`).
- [x] Retention: the reference keeps everything forever; here the newest 200 (D-16.29) (`> append
  > keeps the newest 200 of 205 messages: the oldest 5 are gone (ACC-I10-1, R04.8)`).
- [x] Reset empties the stored conversation at once; here it also moves the generation on and a
  late reply for the old conversation is not stored (`> reset and generation > empties the
  conversation and bumps the generation`, `> reset and generation > drops a reply that belongs to
  the conversation before a reset (D-16.34)`).
- [x] Unreadable history: the reference read it as empty and the next append replaced it; here it
  is kept aside and stays in its table through appends, patches and the cap, and Reset copies it
  before clearing or refuses (`> unreadable messages > quarantines a corrupt row and still lists
  the rest (R04.7)`, `> unreadable messages > never counts or deletes an unreadable row when
  trimming to the limit`, `> unreadable messages > refuses to patch an unreadable row and leaves it
  as it was`, `> reset and generation > keeps an unreadable row aside before clearing it`, `> reset
  and generation > refuses the whole reset when an unreadable row cannot be kept aside`).
- [x] The conversation survives a reload (the reference loads it at start); a restore reaches the
  screen through the live feed instead of an explicit reload call (`> reset and generation > keeps
  the conversation and the generation across a reload`, `> feed > pushes the conversation again
  after an append and a reset`).
- [x] A message keeps its photo thumbnail (`> append > stores a small thumbnail and a failure
  marker`).
- Deliberate differences: per-message rows, a 200 cap, generations, quarantine instead of silent
  loss (D-16.29, D-16.34, R04.7, R04.8); a failure marker patched on the stored message for Retry
  (D-16.31) instead of the reference's orphan question; times kept strictly increasing so the
  list order is the append order.
- Not taken: card (exercise proposal) storage and its add/dismiss outcomes (no workouts in v1);
  replacing the whole history at once (restore belongs to P09); "replace the last assistant
  message" (no streaming in v1); the 20-message context slice (P08-04).

## Decisions for the lead

- API shape: `coachRepo(db, {clock?})` returns `{list, feed, append, patch, reset, generation}`;
  `COACH_HISTORY_LIMIT` (200) and `COACH_GENERATION_KEY` (`coachGeneration`) are exported.
- `append(message, {generation})` checks the generation inside the appending transaction and
  answers `{kind: 'stale'}` without writing, so P08-09 can drop a late reply atomically (R04.6).
  Without `generation` it always appends.
- `append` keeps `at` strictly increasing (a time that is not after the newest stored message
  becomes newest + 1 ms) and returns the stored message. The alternative, a hidden insertion
  counter on each row, would add a field the model and codec do not know.
- `patch` changes only the failure marker (`state`, `null` clears); it answers `'missing'` or
  `'unreadable'` instead of throwing.
- Unreadable rows are not counted towards the cap and are never deleted by it; Reset keeps them
  aside first (`guardKey`) and is refused as a whole when a copy fails.
- `generation()` runs in the same queue as the writes, so it reflects every reset this tab asked
  for before it. Reads (`list`, `feed`) are not queued.
- The queue cannot be told apart in tests today: every operation opens its transaction without
  awaiting anything first, and IndexedDB already runs overlapping read-write transactions in the
  order they were opened. It keeps call order if an operation ever awaits before its transaction
  (for example to shrink a thumbnail) and keeps going after a failed write (tested in `> append >
  rejects an id that is already stored and changes nothing`).
- Thumbnail size is the caller's job (P03-10 / P08-09 make the 700 px thumbnail); this repository
  stores the blob it is given.

## Status

Done (2026-10-27). Everything in this note is in place; no file outside the slice was changed.
