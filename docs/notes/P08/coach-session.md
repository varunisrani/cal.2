# Task: Coach session service (P08-09) · Phase: 08 · Owner: builder (wt-p08s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/coach/CoachViewModel.kt` (`send`: the guard, the image-only
fallback text, the order persist → busy → history → data → chat → reply, where failures and
cancels go, and the failure summary written to the log) and `T/ui/coach/CoachFailureSummaryTest.kt`
(the summary names exception types and code places, never messages, so no URL or key leaks).
Research spec `04-coach.md` §3.5 (Reset), §3.6 (send flow, busy flag, errors, cancellation,
diagnostics), §3.7 (persistence), §6 traps R04.4, R04.5, R04.6, R04.22; decisions D-16.29, D-16.31,
D-16.34; acceptance ACC-I5-1, ACC-I11-1. Landed parts read as our API: `src/data/repos/coachRepo.ts`
(P02-11: `append(message, generation)`, `patch`, `reset`, `generation`, the 200 cap),
`src/ai/image.ts` (P03-10 sizes), `src/lib/imageCodec.ts` and `src/services/photos.ts` (stored
photo copies), `src/services/aiAccess.ts`, `src/services/analysis.ts` (an app-level store with
`subscribe`), and the engine of P08-08.

What it does (own words): the Coach page talks to one session that lives as long as the app, so
a reply still on its way survives switching tabs. The session only holds whether a turn is
pending; the messages themselves are read by the page from the coach repository's live hook.
`send(text, photo?)` does nothing while a turn is pending or when there is neither text nor a
photo. Otherwise it marks the session pending at once, before it waits for anything, so two quick
taps start one turn (R04.5). A photo gets a small stored copy (700 px, 0.68); a photo the browser
cannot read stops the send with nothing stored. A photo without words is stored with a fixed
short request to look at it. The question is stored first, tagged with the conversation's
generation; then the data is copied into a snapshot (the tools of this turn read only it, R04.22),
the stored AI setup is read and the engine runs, loaded on first use so the AI code stays out of
the start-up download. The answer is stored under the same generation, so after a Reset (here or
in another tab) a late answer is dropped (R04.6, D-16.34). A failure marks the question as failed
with its kind and the provider's message with every stored key removed, for Details (D-16.31).
`retry(id)` sends a failed question again without storing it twice (R04.4). `reset()` stops the
running request at once, ends pending, and clears the conversation, moving the generation on.

Inputs → outputs:
- `createCoachSession(deps)` → `CoachSession {getState, subscribe, send, retry, reset}`;
  `getState()` → `{pending}` (the same object until it changes), `subscribe(listener)` → unsubscribe.
- `send(text, image?)` and `retry(id)` → a promise of the turn's outcome, never rejected:
  `ignored` (pending, nothing to send, or no failed question with that id), `photoUnreadable`
  (nothing stored or sent), `answered`, `failed` (the question is marked), `dropped` (a Reset came
  first: nothing more is stored).
- `reset()` → resolves once the conversation is cleared; rejects only when storage fails.
- `takeSnapshot(sources)` in `snapshot.ts` → `CoachSnapshot`, or null without a readable profile.
- Deps: the coach repository, the snapshot sources (profile, settings, diary, weights, body fat,
  fasts, water, clock), `aiAccess`, `fetch`, `photoOnlyText()`, and for tests the photo codec
  (`ImageCodec`) and the AI image backend.

Files: created `src/services/coach/session.ts`, `src/services/coach/session.test.ts`,
`src/services/coach/snapshot.test.ts`, `src/services/coach/__fixtures__/stores.ts` (real
repositories on a fake IndexedDB for these tests), this note; changed `src/services/coach/snapshot.ts`
(adds `takeSnapshot`), `src/services/context.tsx` (`coachSession?`), `src/main.tsx` (wiring; one
coach repository shared by the session and the read hooks), `src/i18n/en/coach.ts` (shared: the
`coach.photoOnly` text).

Edge cases / failure modes:
- Two sends in the same tick → the second is `ignored`; one question stored, one request.
- Blank text and no photo → `ignored`, pending never set.
- Unreadable photo → `photoUnreadable`, nothing stored, no request, pending ends.
- Reset while a turn is pending → the request is aborted, pending ends at once, the turn ends
  `dropped`, the chat stays empty; a send right after the Reset lands in the new conversation.
- Reset in another tab while a reply is on its way → the reply's append is refused by
  generation → `dropped`.
- The engine fails → the question is marked `{status: failed, kind, details}`; `bothFailed`
  is stored as the standby's kind and detail (the page shows one message per kind).
- Cancel without a Reset cannot happen (only Reset aborts); a `cancelled` result marks nothing.
- No readable profile → the question is marked failed `generic`.
- Storage fails mid-turn → `failed`; the question, if stored, is marked `generic` when possible.
- Retry: only a stored user question marked failed; its mark is cleared while it runs and set
  again if it fails; the answer is appended after the latest message; the photo goes again (the
  picked photo while this session still holds it, else the stored thumbnail).
- The engine module fails to load (offline, an old chunk) → the stored question is marked
  `generic` and can be retried.

Our design differences / decisions:
- Names and structure are ours; the session is a small store, not a view model.
- Pending is set before any await (R04.5); the reference set it after storing.
- Generations and abort on Reset (R04.6, D-16.34); the reference let a late reply land.
- Failed questions keep a failure mark and get Retry (R04.4, D-16.31); the reference showed a
  banner only and had no Retry.
- The stored thumbnail is made with the photo codec of the photo store (`src/lib/imageCodec.ts`,
  already in the start-up code); the model's copy is the engine's (P03-10 `COACH_PHOTO`). The
  thumbnail's 700 px / 0.68 is written in the session and a test keeps it equal to P03-10's
  `COACH_THUMBNAIL`, so the AI image code is not pulled into the start-up download.
- The fixed text for a photo without words is ours and comes from the catalogue
  (`coach.photoOnly`), handed in by `main.tsx`.
- Nothing is logged: provider messages can hold keys or addresses (the reference logged type
  names and code places only).
- `send` resolves with an outcome so the composer (P08-11) can show the unreadable-photo message.

Tests we will write (`session.test.ts`, `snapshot.test.ts`; real repositories on fake IndexedDB,
the fake fetch only, a held fetch instead of real waits):
- Two sends in the same tick start one turn (R04.5); pending is set before the first await and
  ends with the turn; subscribers hear both changes.
- Reset during a pending turn aborts the request and the chat stays empty (R04.6, ACC-I5-1); a
  send after it lands in the new conversation.
- A reply after a Reset in another tab is not stored (R04.6).
- Failure marks the question with kind and redacted details (D-16.31); `bothFailed` stores the
  standby's kind.
- Retry stores no second user message and clears the mark (R04.4, ACC-I11-1).
- Image-only send stores the fixed text and a 700 px / 0.68 thumbnail; the model gets the
  1 600 px / 0.78 copy; an unreadable photo stores and sends nothing.
- Tools read the snapshot taken at send time, not data logged while the reply runs (R04.22).
- `takeSnapshot` reads every entry, weigh-in, reading and fast, today's water, the units and
  water settings and the clock's zone; null without a profile.

Compare checklist (filled after the rewrite; reopened `A/ui/coach/CoachViewModel.kt` `send`,
`resetConversation`, `logFailure`; `T/ui/coach/CoachFailureSummaryTest.kt`; research §3.5–3.6):
- [x] Guard: pending, or blank text without a photo → nothing (tested in
  `src/services/coach/session.test.ts` > createCoachSession: send (04 §3.6) > ignores blank text
  without a photo, never turning pending; > starts one turn for two sends in the same tick
  (R04.5))
- [x] Busy set before the first await, cleared when the turn ends (`> stores the question, then
  the answer, pending only while the turn runs`; R04.5 test above)
- [x] Photo without words → a fixed request in our words; stored thumbnail 700 px / 0.68; model
  copy 1 600 px / 0.78 (`> stores a photo without words as the fixed request with a small
  thumbnail; the model gets its own copy`; `> keeps the thumbnail at P03-10’s Coach size`);
  unreadable photo → nothing (`> stores and sends nothing for a photo the browser cannot read`)
- [x] The question is stored first, then the data is read and the engine runs; the answer is
  stored trimmed (`> stores the question, then the answer, pending only while the turn runs`)
- [x] The data is the snapshot of Send (`> runs the tools on the data as it stood at Send, not on
  what is logged meanwhile (R04.22)`; `src/services/coach/snapshot.test.ts` > takeSnapshot
  (R04.22) > copies every entry, weigh-in, reading and fast, today’s water and the settings it
  needs; > is a copy: data stored after it was taken is not in it; > gives null without a
  readable profile)
- [x] Failure keeps the question, marked with kind and redacted Details (`> createCoachSession:
  failures and Retry (D-16.31, R04.4) > marks a failed question with its kind and the provider’s
  message, keys cut out (ACC-I11-1)`; `> stores the standby’s failure when both providers fail`;
  no profile: `> marks the question generic when no profile can be read, sending nothing`)
- [x] Retry without a duplicate (`> asks a failed question again without storing it twice, its
  mark cleared (R04.4, ACC-I11-1)`; `> marks the question again when the retry fails too`;
  `> sends a failed photo question’s photo again on Retry`; `> ignores a retry of an answered
  question or an unknown id`)
- [x] Reset clears the chat; a pending reply is aborted and never lands (`> createCoachSession:
  Reset (R04.6, D-16.34) > aborts the running request, ends pending at once and leaves the chat
  empty (ACC-I5-1)`; `> drops a reply that comes back after a Reset in another tab`; `> lets a
  question sent right after a Reset land in the new conversation`; `> stores nothing when Reset
  comes while the photo is being prepared`; `> clears the conversation when nothing is pending`)
- [x] Diagnostics never carry messages: the session logs nothing at all (no test: nothing to
  observe; the provider text reaches only the stored, redacted Details)
- Mutation check (each made alone, then reverted): pending set after an await (2 tests fail);
  the reply stored without its generation (1); Reset without abort (2); a send after Reset not
  waiting for it to reach storage (1); Retry storing a second question (3); `bothFailed` stored
  as it is (1).
- Deliberate differences: pending before any await (R04.5); generations, abort and drop on Reset
  (R04.6, D-16.34); a failed question is kept with a mark, Details and Retry (R04.4, D-16.31);
  failure text is classified (the catalogue's) with the provider's words only in Details; no
  profile marks the question `generic` (the reference showed a finish-onboarding message: the
  Coach tab is only reached after onboarding here); nothing is logged; the fixed photo request is
  our own words, from the catalogue.
- Not taken: proposal cards and their Add/Dismiss (workouts, L3); the hosted paywall routing
  (later phase); the training chip (P08-12 owns chips).

## Decisions for the lead

- `send` and `retry` resolve with an outcome (`ignored`, `photoUnreadable`, `answered`, `failed`,
  `dropped`) so P08-11 can show the unreadable-photo message; the rest of the shape is exactly the
  agreed `getState/subscribe/send/retry/reset`. `reset()` rejects only when storage fails.
- When both providers fail, the question stores the standby's kind and detail (`CoachMessageState`
  holds one kind; the page cannot name the providers from it). The reference also showed the
  fallback's error.
- The stored thumbnail uses the photo store's codec (`src/lib/imageCodec.ts`), its size written in
  the session as `COACH_THUMB` and kept equal to P03-10's `COACH_THUMBNAIL` by a test, so
  `src/ai/image.ts` stays out of the start-up download. Initial JS 214.65 kB gzip (HEAD 213.07).
- Retry sends the photo as picked while this session still holds it, else the stored thumbnail
  (after a reload): the original photo is never stored.
- A missing or unreadable profile marks the question `generic` (no dedicated kind or message).
- Shared edits: `src/main.tsx` creates one coach repository for the session and the read hooks
  (its writes queue per instance; the hooks' entry `coachRepo: createCoachRepo(db)` now uses it);
  `src/i18n/en/coach.ts` gains `coach.photoOnly` ("Have a look at this photo."), handed to the
  session by `main.tsx`.
- Follow-ups not done: the connection failure's "key may be refused" hint is not stored with the
  mark (only the kind is), so the page cannot show it; a question left unanswered by a closed tab
  has no mark, so neither the page nor `retry` offers Retry for it (accepting it in `retry` would
  need a cross-tab guard, since another tab may still be answering it).

## Status

Done (2026-10-27). `src/services/coach/session.ts` (19 tests), `takeSnapshot` in
`src/services/coach/snapshot.ts` (3 tests in `snapshot.test.ts`), the shared test stores
`src/services/coach/__fixtures__/stores.ts`, `coachSession?` in `src/services/context.tsx` and its
wiring in `src/main.tsx`. Lines outside the task's files: `src/i18n/en/coach.ts` (one key). Handed
on to P08-10/11: the page subscribes with `useSyncExternalStore(session.subscribe,
session.getState)`, reads messages with `useCoachMessages()`, and shows a failed question from its
`state` (`kind` → `ai.failure.<kind>`, `details` for Details).
