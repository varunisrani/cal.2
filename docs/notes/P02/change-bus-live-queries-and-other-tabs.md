# Task: change bus, live queries and other tabs (P02-03) · Phase: 02 · Owner: builder (wt-p02s0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/ConsistentDataStore.kt` (all), `T/data/ConsistentDataStoreTest.kt`
(all); research spec `06-settings-data.md` §3.18 (consistency) and §5 (cross-tab change broadcast,
`blocked` handling), §6 R06.3; `04-architecture.md` §2 rule 6 (thin UI over subscriptions), stack row
5. No Evidence ids. Dexie 4.4.6 source read for `liveQuery` (start, re-run, errors, cache) and its
cross-tab `BroadcastChannel`.

What it does (own words): screens never poll; they subscribe to a query and are told when its
answer changes. The reference had to work around a store bug where a reader that started during a
save stayed on the old value; it re-subscribed every reader after each finished write and skipped
equal values. Here `live(query)` wraps Dexie's `liveQuery`: IndexedDB queues a read behind any
write transaction on the same tables, and Dexie re-runs a query after every committed change that
touches what it read, also when another tab made the change. We add what Dexie leaves out: an
equal answer (compared by structure, because every read returns fresh copies) is not passed on, so
saving an unchanged row does not re-render; a query that throws becomes an error value instead of
ending the subscription, and the query starts again after the next database change; several
listeners share one Dexie subscription, which stops when the last one leaves. `useLive(query, deps)`
puts that on React's `useSyncExternalStore` and starts in a loading state. `bus.ts` is a small
`BroadcastChannel('platewise')` wrapper for app messages that are not table changes (`erase`,
`reload-needed`, `goal-reached`, `settings-loaded`); a posted message reaches this tab's listeners
and every other tab. Table changes across tabs need no bus: Dexie already announces every commit on
its own channel, and the tests prove that a second tab's live query sees our write.

Inputs → outputs:
- `live(query)` → `LiveFeed<T>` with `current()` (`{status: 'loading'}` | `{status: 'ready',
  value}` | `{status: 'error', error}`, the same object until something changes) and
  `subscribe(listener)` → unsubscribe.
- `feedOf(open)` → the same feed over any source with Dexie's observable shape (`live` is
  `feedOf` over `liveQuery`; tests drive it by hand).
- `sameData(a, b)` (in `values.ts`) → structural equality for query results.
- `useLive(query, deps)` → the current `LiveState<T>`; re-renders only on a change.
  `useFeed(feed)` → the same for a feed made elsewhere.
- `createBus(name?)` → `{post(message), subscribe(listener), close()}`; `appBus()` → the app's
  shared bus; `isAppMessage(value)`; message union `AppMessage`.

Files: created `src/data/live.ts`, `src/data/live.test.ts`, `src/data/useLive.ts`,
`src/data/useLive.test.ts`, `src/data/bus.ts`, `src/data/bus.test.ts`, `src/test/live.ts` (test
helpers: `watch`, `ready`, `manualSource`, `tappedQuery`), this note.

Edge cases / failure modes:
- A subscriber that starts while a write transaction is still open ends on the committed value and
  never shows the half-written one; after an aborted write it stays on the old value.
- A write in another connection (another tab) re-runs our query; a raw write from another realm
  followed by Dexie's cross-tab announcement does too.
- An identical write re-runs the query but emits nothing; the next real change still arrives.
- A thrown query: an error value; the next change anywhere restarts the query and a good answer
  replaces the error.
- Last listener leaves → Dexie subscription closed; a new listener restarts it (React StrictMode
  subscribes twice).
- Blobs and other non-plain objects compare by identity (a missed update is worse than an extra
  render); plain objects, arrays, dates and byte arrays by content.
- Bus: messages from other tabs are checked and unknown shapes dropped (an older build may still
  be open); without `BroadcastChannel` the bus still delivers in this tab; `close()` stops both.
- Dexie runs the first query on a timer: fake timers would stall it, so these tests use real
  timers and wait on events, never on time.

Our design differences / decisions:
- No reference counterpart for the bus or the hook; the consistency wrapper becomes a thin layer on
  Dexie instead of re-subscribing after every write, because IndexedDB ordering already gives the
  late reader the committed value; our test pins that down instead of a library-bug test.
- `post` delivers to this tab too, so one listener handles a message wherever it came from; the
  listener learns whether it came from this tab or another.
- Message payloads: `reload-needed` carries `reason` (`upgrade` | `deleted`); `goal-reached`
  carries the weigh-in id and kg; `erase` and `settings-loaded` carry nothing. P02-08 / P02-14 may
  widen them.
- `useLive` takes an explicit deps list (the query is rebuilt when they change), like `useMemo`.

Tests we will write:
- live: subscribe during an open write transaction → the committed value arrives and the
  half-written one never does (R06.3); an aborted write leaves the old value; two Dexie instances on
  one database (two tabs): a write in one updates the other's live query (ACC-L7-1); a raw write by
  "another tab" plus Dexie's channel message re-runs our query; an identical row does not emit; a
  thrown query is an error value and recovers after the next change; listeners share one
  subscription and the last unsubscribe stops it.
- useLive: loading then ready; re-renders on a change; no re-render on an identical write; error
  as a value; unmount stops the subscription.
- bus: a message reaches a second channel and this tab's listeners; malformed messages ignored;
  close stops delivery; works without `BroadcastChannel`.

Compare checklist (filled after the rewrite; reopened `A/data/ConsistentDataStore.kt`,
`T/data/ConsistentDataStoreTest.kt`):
- [x] A reader that starts while a write is still in progress ends on that write's value (tested
  in `src/data/live.test.ts > live > a subscriber that starts during an open write ends on the
  committed value (R06.3)`; it also asserts the half-written and the old value were never shown).
- [x] Readers stay right after a write that fails (`live.test.ts > live > stays on the committed
  value when the write in flight rolls back`).
- [x] Equal consecutive values are not passed on, also when the store hands back fresh copies
  (`live.test.ts > live > does not publish again after an identical row is written`, `> feedOf >
  starts loading, publishes a new answer and skips an equal copy`, `src/data/useLive.test.ts >
  useFeed > does not render again when an identical row is written`).
- [x] Every committed write reaches every open tab (`live.test.ts > live > shows an entry added in
  one tab in another open tab (ACC-L7-1, R06.3)`, `> re-reads when another tab announces its write
  on the channel Dexie shares between tabs`).
- [x] Errors become values and the feed recovers (`live.test.ts > live > turns a failing query
  into an error value and recovers after the next change`, `useLive.test.ts > useLive > shows a
  failing query as an error value instead of throwing`).
- [x] Hook: loading first, renders only on change, deps rebuild the query, unmount stops it
  (`useLive.test.ts > useLive > starts loading and renders the answer once it arrives`, `> renders
  again when a write changes the answer, and only then`, `> rebuilds the query when a dependency
  changes`, `> stops the subscription when the component unmounts`).
- [x] Bus messages reach a second channel (`src/data/bus.test.ts > createBus > delivers a posted
  message to this tab and to another tab`, `> carries every app message from one tab to the
  other`, `> ignores malformed messages from other tabs`).
- Deliberate differences: no re-subscription after every write; IndexedDB's transaction ordering
  and Dexie's re-run on commit already give a late reader the committed value, and the R06.3 test
  pins that down instead of characterising a library bug. Cross-tab propagation is Dexie's, not
  ours; the bus is only for app messages.
- Not taken: the upstream-bug characterisation test (Dexie has no such bug to track).

## Decisions for the lead

- `bus.post` also delivers to this tab's listeners (with `origin: 'this-tab'`), so one listener
  handles a message wherever it came from. Payloads: `reload-needed {reason}`, `goal-reached
  {weighInId, kg}` (P02-08 may widen), `erase`, `settings-loaded`.
- `live` is `feedOf(liveQuery)`; `useLive` is `useMemo(live)` + `useFeed`, with one
  `eslint-disable-next-line react-hooks/exhaustive-deps` for the caller-supplied deps list.
  Follow-up for the lead: `additionalHooks: '(useLive)'` on that rule in `eslint.config.js` would
  check the callers' deps lists (P02-15 and the features).
- Blobs in query results compare by identity, so a query that returns photo rows re-renders on
  every re-run of its table (a missed update would be worse).
- The cross-tab test replays Dexie 4's own announcement on its channel (`x-storagemutated-1`); a
  Dexie upgrade that renames it fails that test on purpose.

## Status

Done (2026-10-26). Everything in this note is in place; no file outside the slice was changed.
