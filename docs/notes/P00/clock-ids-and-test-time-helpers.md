# Task: clock, ids and test time helpers (P00-08) · Phase: 00 · Owner: builder (wt-p00s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none (tooling). The phase row lists no reference counterpart; these
are our own plumbing helpers. Read only `docs/plan/phases/P00-foundations.md` (P00-08 row, files
lists) and `docs/plan/phases/00-layout-and-conventions.md` §2 (Time, Tests rows).

What it does (own words): services never read the wall clock or the device zone directly; they
take a `Clock` so a test can pin "now" and the zone. `systemClock` is the real one (reads
`Date.now()` and the `Intl` default zone at call time, so fake timers still apply); `fixedClock`
always answers the same instant and zone. `newId()` makes record ids from `crypto.randomUUID`;
`withIdSequence(prefix)` hands tests an id source that counts `prefix-1`, `prefix-2`, … so stored
records are predictable. `Result<T, E>` is a tiny tagged union for code paths that return a
failure as a value (validators, parsers) instead of throwing. The test-time helpers wrap Vitest's
fake timers (`useFakeTime`, `advance`, `runPending`) and run code in another zone
(`inTimeZone`). The test setup puts real timers and the pinned zone back after every test, so a
test that forgets to clean up cannot leak into the next one. `vite.config.ts` pins the test zone
to America/New_York (it has DST), adds the fake AI server's unit tests to the test run, and turns
on the build manifest that the bundle budget (P00-10) reads.

Inputs → outputs:
- `systemClock.now()` → `Date.now()`; `systemClock.timeZone()` → the `Intl` default zone id.
- `fixedClock(ms, tz)` → a `Clock` that always returns `ms` and `tz`; a non-finite `ms` or an
  unknown zone throws a `RangeError` at creation.
- `newId()` → a v4 UUID string; `withIdSequence('a')` → `() => string` giving `a-1`, `a-2`, ….
- `ok(v)` → `{ ok: true, value: v }`; `err(e)` → `{ ok: false, error: e }`; `isOk(r)` narrows.
- `useFakeTime(at)` (epoch ms, `Date` or date string) → fake timers on, system time set to `at`,
  returns the epoch ms. `advance(ms)` → timers due within `ms` fire, `Date.now()` moves by `ms`.
  `advanceAsync(ms)` → the same, letting promise callbacks run between timers. `runPending()` →
  fires the timers pending now (not the ones they schedule).
- `inTimeZone(tz, fn)` → runs `fn` with `process.env.TZ = tz`, returns its result, restores the
  previous zone afterwards (after the promise settles when `fn` is async, and when it throws).

Files: created `src/lib/{clock,ids,result}.ts` and their `.test.ts`, `src/test/time.ts`,
`src/test/time.test.ts`; changed `src/test/setup.ts` (restore after each test) and
`vite.config.ts` (test zone, `e2e/fake-ai/**/*.test.ts` include, `build.manifest`).

Edge cases / failure modes:
- An unknown zone id: Node silently falls back to UTC when `TZ` is bad, so `inTimeZone` and
  `fixedClock` check the id with `Intl.DateTimeFormat` first and throw.
- `process.env.TZ = undefined` stores the string "undefined"; restoring an unset zone must delete
  the key instead.
- `fn` throws or rejects inside `inTimeZone`: the zone is still restored, the error propagates.
- `useFakeTime` with an invalid date string: throw rather than run the test at `NaN`.
- `advance`/`runPending` without `useFakeTime`: Vitest already throws a clear error; no wrapper.
- A test leaves fake timers on or changes `TZ` by hand: `setup.ts` resets both after each test.
- `Intl...resolvedOptions().timeZone` can be missing in old engines: `systemClock` falls back to
  `UTC`.

Our design differences / decisions:
- Names are ours (no reference counterpart). The four time helpers, `Clock`, `systemClock`,
  `fixedClock`, `Result`, `ok`, `err`, `isOk` keep the exact names other builders code against.
- `withIdSequence` returns an id source (`IdSource = () => string`) that services can take as a
  parameter beside the `Clock`, rather than swapping a global `newId` (no hidden state between
  tests). `newId` itself is an `IdSource`.
- `advanceAsync` is one small addition for async code (retry loops, chained timers); the sync
  `advance` stays the default.
- `Result` has no default error type and no `isErr`: `!isOk(r)` narrows to the failure.
- `src/lib/` imports nothing, so the pure domain may import `Result` and the `Clock` type
  (P00-07's rule 1 does not forbid `src/lib`).

Tests we will write:
- `clock.test.ts`: fixed clock returns its values; it rejects a bad zone and a non-finite time;
  system clock follows fake time and the current zone.
- `ids.test.ts`: UUID v4 shape and two calls differ; sequence `a-1`, `a-2`; two sequences are
  independent.
- `result.test.ts`: `ok`/`err` shapes; `isOk` narrows both ways.
- `time.test.ts`: `advance(1000)` fires a 1 s timer without real waiting and moves `Date.now()`;
  `runPending` fires only what is pending; `advanceAsync` runs a timer chained after a promise;
  `inTimeZone('Asia/Tokyo')` changes `new Date(0).getHours()` and restores it (sync, async, throw);
  bad zone throws; the pinned zone is America/New_York; a test that leaves fake timers on and a
  changed `TZ` is cleaned up before the next test.

Compare checklist (filled after the rewrite; no reference files reopened: tooling, no counterpart):
- [x] Fixed clock returns its values; bad zone and non-finite instant rejected (tested in
      `src/lib/clock.test.ts > fixedClock > returns the instant and zone it was given, every time`
      and `> rejects a zone Intl does not know and an instant that is not finite`)
- [x] System clock follows fake time and the current zone (`src/lib/clock.test.ts > systemClock`)
- [x] UUID shape, distinct ids; sequence `a-1`, `a-2` (tested in `src/lib/ids.test.ts > newId >
      returns a v4 UUID, different on each call` and `withIdSequence > counts prefix-1, prefix-2,
      … from one`)
- [x] `ok`/`err`/`isOk` (tested in `src/lib/result.test.ts > Result`)
- [x] `advance(1000)` fires a 1 s timer without real waiting (tested in `src/test/time.test.ts >
      useFakeTime and advance > advance(1000) fires a 1 s timer without real waiting`)
- [x] `inTimeZone('Asia/Tokyo')` changes `new Date(0).getHours()` and restores it (tested in
      `src/test/time.test.ts > inTimeZone > inTimeZone('Asia/Tokyo') changes new Date(0).getHours()
      and restores it afterwards`, plus the throw, async and reject cases)
- [x] Tests run in America/New_York (`src/test/time.test.ts > inTimeZone > tests run in
      America/New_York unless told otherwise`)
- [x] Real timers and the pinned zone come back after each test (tested in
      `src/test/time.test.ts > cleanup after each test (src/test/setup.ts)`, two ordered tests)
- Deliberate differences: n/a (no reference behaviour).
- Not taken: a global override of `newId()` for tests.
- Similarity finding fixed during the run: the first `ids.test.ts` checked the UUID with the
  common one-line v4 regular expression, which the similarity gate found as a 62-token run in a
  reference web file. Rewritten as our own group-by-group shape check (`shapeOf`), not renamed.

## Decisions for the lead

- `withIdSequence(prefix)` returns an id source (`IdSource = () => string`), so services that
  create records take an `IdSource` beside their `Clock`; there is no global switch of `newId`.
- Small extra exports beyond the agreed names: `advanceAsync`, `getTimeZone`, `setTimeZone`
  (`src/test/time.ts`), `isKnownTimeZone` (`src/lib/clock.ts`), the `IdSource`, `Ok` and `Err`
  types.
- `src/test/time.ts` declares a module-local `process` type (only `env`) because
  `tsconfig.app.json` has no Node types; adding them app-wide would change `setTimeout`'s type
  for the whole app. `tsconfig.app.json` is unchanged.
- `src/lib/{clock,ids,result}.ts` import nothing, so the domain may import `Result` (P01-14
  returns one) and the `Clock` type; P00-07's lint rule 1 should keep allowing `src/lib`.
- Heads-up for S5 (P00-09): Playwright's default `testMatch` also matches `*.test.ts`, so with
  `testDir: './e2e'` the Vitest files under `e2e/fake-ai/` would be picked up by `pnpm e2e`;
  `playwright.config.ts` needs `testMatch: '**/*.spec.ts'` (or a `testIgnore` for `fake-ai`).

## Status

Done (2026-10-26). `src/lib/{clock,ids,result}.ts` with tests, `src/test/time.ts` with tests,
`src/test/setup.ts` restores real timers and the pinned zone after each test, `vite.config.ts`
has `test.env.TZ`, the `e2e/fake-ai/**/*.test.ts` include and `build.manifest`. No lines changed
outside the slice's files.
