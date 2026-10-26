# Task: change bus, live queries and other tabs (P02-03) · Phase: 02 · Owner: builder (wt-p02a0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/ConsistentDataStore.kt` (all: re-reading after every
finished write, failed ones too, and dropping equal consecutive values),
`T/data/ConsistentDataStoreTest.kt` (all: a reader that starts while a write is held open must
still end on the written value; equal values are not emitted twice). Research spec
`06-settings-data.md` §3.18 (consistency) and §5 (cross-tab change broadcast), §6 R06.3; phase
file P02 goal and row P02-03. Dexie 4.4.6's `liveQuery` and its cross-tab propagation
(`node_modules/dexie`) to know what it already guarantees. No Evidence ids.

What it does (own words): screens never read the database once; they subscribe. `live(query)`
turns a Dexie query into a source that a screen (or a test) subscribes to: it starts in a loading
state, then holds the latest result, re-running whenever a committed write touches what the query
read, in this tab or another one. A subscriber that arrives while a write is still in flight ends
on the committed value, never on the value from before the write (the stale-water-total bug the
reference had to work around). A result equal to the previous one (deep comparison) is not
announced again, so a write that changes nothing does not re-render. A query that throws becomes
an error state instead of an exception. `useLive(query, deps)` is the React hook over a source,
built on `useSyncExternalStore` with no extra library. `bus.ts` carries the few app messages that
are not table changes — `erase`, `reload-needed`, `goal-reached`, `settings-loaded` — to the
listeners of this tab and, through a `BroadcastChannel('platewise')`, to every other open tab.
Table changes reach other tabs through Dexie's own broadcast; a test proves it.

Inputs → outputs:
- `live<T>(query)` → `LiveSource<T> {subscribe(onChange) → unsubscribe, getSnapshot() →
  LiveState<T>}`, `LiveState<T> = {status: 'loading'} | {status: 'ready', value} | {status:
  'error', error}`; `sameData(a, b)` (the structural comparison).
- `useLive<T>(query, deps)` → `LiveState<T>`.
- `createBus({name?, channel?})` → `Bus {post(message, reach?), subscribe(listener) →
  unsubscribe, close()}`; listeners get `(message, fromOtherTab)`; `appBus()` the app's one bus;
  `isBusMessage(value)`.

Files: created `src/data/live.ts`, `src/data/live.test.ts`, `src/data/useLive.ts`,
`src/data/useLive.test.ts`, `src/data/bus.ts`, `src/data/bus.test.ts`, `countRuns` in
`src/test/db.ts`, this note.

Edge cases / failure modes:
- Late subscriber during an open write transaction: its first read may show the old value; it
  must still end on the committed value.
- A write that fails and rolls back: the subscriber ends on the old committed value.
- Equal results after a write that changed nothing (same row written again): no new state, no
  re-render; different object identity alone is not a change. Blobs compare by identity (their
  bytes cannot be read synchronously), so a blob row may re-render but never misses a change.
- A thrown query: an error state; Dexie ends that subscription, and a new subscriber starts over.
- Listeners come and go (React mounts twice in strict mode): the Dexie subscription starts with
  the first listener and stops with the last; the last state is kept for the next subscriber.
- `useLive` with new deps: a new source (loading first); same deps: the same source, no
  resubscription.
- Bus: messages from other tabs are checked (unknown types or bad payloads are ignored); a
  listener that throws does not stop the others; without `BroadcastChannel` (older browsers)
  the bus still reaches this tab's listeners; after `close()` posting does nothing.
- `reload-needed` from a `versionchange` is posted to this tab only: every tab gets its own
  `versionchange`, so broadcasting it would only repeat it.
- Dexie's live queries go quiet when the database is closed (it swallows that error); the
  `reload-needed` message is what tells the screen.

Our design differences / decisions:
- The reference re-subscribes every reader after each write through a wrapper because its store
  could miss a write. Dexie's live queries record writes that land while a query runs and re-run
  it, and re-read on every committed write that overlaps the query, local or from another tab.
  So `live` relies on that and adds the parts Dexie lacks (dedupe, errors as values, a snapshot
  for React); the race is proven by tests, with the write held open the way the reference's
  test holds its file write.
- Bus listeners in this tab run synchronously on `post`, so the poster decides when (after the
  commit); other tabs receive it as a task.
- `goal-reached` carries the new weight in kg; P02-08 may widen it.

Tests we will write:
- `live`: initial loading → ready; a write re-runs and announces the new value; subscribe while
  a read-write transaction is held open → the final state is the committed value (R06.3); a
  failed write ends on the old value; writing an identical row announces nothing; a thrown query
  → error state; unsubscribing the last listener stops re-running; `sameData` cases.
- Other tabs: two Dexie instances on one fake database, a write in one updates the other's live
  query (ACC-L7-1); a row written behind Dexie's back appears once Dexie's cross-tab message
  (captured from a real write) arrives on its broadcast channel from "another tab".
- `useLive`: loading then data; a write re-renders with new data; an identical write does not
  re-render; a thrown query renders the error state; new deps switch queries; unmount stops it.
- Bus: a message reaches a second channel (another tab) and this tab's listeners with the right
  `fromOtherTab`; garbage on the channel is ignored; local-only post stays in this tab; without
  `BroadcastChannel` local delivery still works; a throwing listener does not block the next.

Compare checklist (filled after the rewrite; reopened `A/data/ConsistentDataStore.kt`,
`T/data/ConsistentDataStoreTest.kt`, and Dexie's `liveQuery`, cache and cross-tab code):
- [x] A reader that starts while a write is held open, and first reads the old value, still ends
  on the written value (`src/data/live.test.ts > live > ends a subscriber that starts during an
  open write on the committed value (R06.3)`: the write is held with `Dexie.waitFor`, the late
  reader's first value is asserted to be the old one, as in the reference's test).
- [x] Re-reads after a write that changes nothing do not re-emit (`live.test.ts > live > does not
  announce a re-run whose result equals the last one`; `src/data/useLive.test.ts > useLive > does
  not render again when an identical row is written`; both fail with the dedupe removed), and the
  comparison is structural (`live.test.ts > sameData > compares plain data deeply`, `> tells
  different data apart`, `> compares blobs and other class instances by identity only`).
- [x] Failed writes: the reference re-reads after failed writes too; with Dexie a failed
  transaction rolls back and the reader stays on the committed value (`live.test.ts > live > ends
  on the old value when a write fails and rolls back`).
- [x] Every committed write reaches readers in other tabs (`live.test.ts > other tabs > shows an
  entry added in one tab in another open tab (ACC-L7-1)`, `> re-reads when Dexie announces a
  change from another tab`: a row written behind Dexie's back stays unseen until Dexie's own
  change message, captured from a real write, arrives on its BroadcastChannel).
- [x] Errors are values; loading comes first; subscriptions follow listeners (`live.test.ts > live
  > delivers a thrown query as an error state`, `> starts loading, then holds the result, then
  follows a committed write`, `> starts again for a new first listener after an error`, `> stops
  re-running once the last listener leaves`; `useLive.test.ts > useLive > renders loading first,
  then the rows`, `> renders again with the new rows after a write`, `> renders the error state of
  a thrown query`, `> runs a new query when its deps change`, `> keeps the same query when it
  re-renders with equal deps`, `> stops the query when the component unmounts`).
- [x] App messages reach other tabs and this one (`src/data/bus.test.ts > bus > reaches another
  tab and the listeners of this tab`, `> keeps a this-tab post away from other tabs`, `> ignores
  malformed messages from other tabs`, `> still reaches this tab when the browser has no
  BroadcastChannel`, `> delivers to the next listener when one throws`, `> stops delivering to a
  listener that unsubscribed, and posts nothing after close`, `> closes its channel`, `> gives the
  app one shared bus`; `> isBusMessage > accepts the four message types with valid payloads`, `>
  rejects anything else`); `versionchange` posts `reload-needed` here (`db.test.ts > versionchange
  > closes this connection, posts reload-needed here, and lets the other tab upgrade`).
- Deliberate differences: no wrapper that re-subscribes every reader after each write: Dexie's
  live queries record writes that land during a query and re-run it, and re-run on every
  committed overlapping write in this tab or another; the tests prove the race instead. Failed
  writes cause no re-read because nothing changed.
- Not taken: the reference's test that characterises its upstream library bug (there is no such
  bug to pin here; if a Dexie upgrade regressed, the R06.3 test fails).

## Decisions for the lead

- Bus message shapes: `{type: 'erase'}`, `{type: 'reload-needed'}`, `{type: 'goal-reached', kg}`,
  `{type: 'settings-loaded'}`; `post(message, 'this-tab')` keeps a message local; listeners get
  `(message, fromOtherTab)`; this tab's listeners run synchronously on `post`.
- `useLive(query, deps)` signature (deps compared with `Object.is`, like React's); new deps start
  from loading.
- `LiveState` is `{status: 'loading' | 'ready' | 'error'}` with `value` or `error`.

## Notes for later waves

- Dexie may hand a live query's result over on a `setTimeout(0)` task when the query is a native
  `async` function (its zone bookkeeping), and does so at once when the query returns Dexie's own
  promise chain.
  Tests that must show a re-run happened and was dropped use `countRuns` from `src/test/db.ts`
  with a plain Dexie chain (see its comment). Tests wait on events, never on time.
- Dexie forbids read-write transactions inside a live query (`ReadOnlyError`), so feature hooks
  (P02-15) only read; the guard defers its quarantine copies for that reason.
- Dexie's live-query cache is shared by every connection with the same database name in one page,
  which is what makes two connections behave as one database (and why tests use unique names).

## Status

Done (2026-10-26). `live.ts`, `useLive.ts`, `bus.ts` and their tests are in place, plus the
`countRuns` helper in `src/test/db.ts`; nothing outside the task's files changed. Unit tests:
`live.test.ts` 12, `useLive.test.ts` 7, `bus.test.ts` 10, all passing (the full set three runs in
a row).
