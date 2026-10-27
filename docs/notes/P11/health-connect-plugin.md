# Task: Health Connect plugin (P11-02) · Phase: 11 · Owner: builder (wt-p11s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/services/health/HealthConnectManager.kt` (which record types it
asks for, how it buckets days, how it tells its own records apart, how it opens Health Connect's
screens), `A/services/health/HealthExerciseSessions.kt` (which sessions it keeps and how it finds
a session's calories), `A/services/health/HealthWriteRetry.kt` (first 30 lines: which errors it
treats as final), the health lines of `android/app/src/main/AndroidManifest.xml` (permissions,
`queries`, the rationale and usage entry points), and the names of the tests in
`android/app/src/test/.../services/health/`; research spec `07-later-phases-and-web.md` §2
(record types), §3.7 (health store), §6 R07.1 and R07.22. Vendor docs: the
`androidx.health.connect:connect-client` 1.1.0 sources jar from Google Maven (API shapes, value
limits, how errors surface). Capacitor 7.6.9 plugin API from `node_modules/@capacitor/android`.

What it does (own words): a Capacitor plugin named `HealthConnect` that gives the web app the
contract in the phase file and nothing more. It says whether Health Connect can be used here,
which of our kinds are granted, asks for kinds through Health Connect's own permission screen,
and opens Health Connect (or its store page when it is missing or outdated). It reads per-day
totals (steps, active and total calories, distance) for an inclusive range of day keys, the
workouts other apps recorded with their calories, and weigh-ins other apps recorded. It writes
meals as nutrition records and weigh-ins as weight records, each under our own id as Health
Connect's client record id with a version that only grows, so writing the same id again replaces
the record and deleting by that id removes it. Whatever Platewise wrote is left out of reads.

Behaviour taken from the reference (behaviour only):
- Record types: steps, active calories burned, total calories burned, exercise sessions and
  weight are read; nutrition and weight are written. We add distance (the contract asks for it)
  and leave out body fat, nutrition import, history access and background reads (not in P11).
- Days: per-day totals come from Health Connect's own per-day aggregation, which removes
  duplicates between a phone and a watch; a raw sum of records would double count.
- Own records: told apart by the data origin (the package that wrote the record); writes carry a
  client record id and a version so a later edit wins over an earlier write.
- A session's calories: the recording app's active calories in the session window first, else
  every app's active calories in that window.
- Health Connect wants a short privacy screen behind its rationale action (Android 13 and below)
  and behind the permission-usage action (Android 14 and up), and the `queries` entry for its
  app on Android 13 and below.

Inputs → outputs: plugin calls (JSON objects) → Health Connect client calls → JSON results in the
contract's shapes, or a rejection with one of `notAvailable`, `permissionDenied`, `rateLimited`,
`invalidInput`, `unknown`.

Files: `android/app/src/main/java/app/platewise/android/health/`:
- `HealthConnectPlugin.kt`: the Capacitor glue (argument reading, results, the permission screen,
  intents). The only file that touches Capacitor.
- `HealthConnectGateway.kt`: availability, grants, the permission intent, and each contract
  operation put together from the client calls in `DayTotalsQuery.kt` (per-day aggregation),
  `RecordQueries.kt` (paged session and weight reads, a window's active calories) and
  `RecordWrites.kt` (inserts and deletes by client id), which turn records into the plain facts
  below and checked writes into records.
- `HealthKinds.kt`, `DayKeys.kt`, `HealthRows.kt`, `HealthWrites.kt`, `HealthFailure.kt`: plain
  Kotlin with no Android calls (kinds and permission names, day keys and ranges, rows in the
  contract's shapes, write validation, error codes).
- `PrivacyNoteActivity.kt` and its strings: the short privacy text Health Connect opens.
- Tests in `android/app/src/test/java/app/platewise/android/health/`.
- Manifest: the eight health permissions (read: steps, active calories, total calories, distance,
  exercise, weight; write: nutrition, weight), `queries` for `com.google.android.apps.healthdata`,
  the privacy activity with the rationale action, and an activity alias for the usage action.

Edge cases / failure modes:
- Health Connect missing, outdated or unsupported (Android 8 has none; a work profile on 14+):
  `availability()` answers it; every other call except opening settings rejects `notAvailable`.
  On Android 9–13 the client reports a missing app as "update required", so the plugin checks if
  the Health Connect package is installed to tell `notInstalled` from `updateRequired`.
- A kind that is not granted is never put in an aggregate request (Health Connect would refuse
  the whole request): its values are null; a range with nothing granted makes no call at all.
  Sessions and weights read as empty lists when their kind is not granted.
- Granted but no data on a day: null, as the contract says; real zeros stay 0. Negative or
  non-finite values from a source are treated as no data.
- Day keys must be real dates in `YYYY-MM-DD` form, `from` ≤ `to`, at most 366 days
  (`invalidInput` otherwise).
- Paged reads follow every page; one failed page fails the call (a part of the list must never
  look like the whole).
- Sessions that end before they start, or have no id, are skipped.
- Writes: a blank or over-long client id, a time that does not parse or lies in the future,
  values outside Health Connect's ranges (energy and macros 0–100000, weight above 0 and up to
  1000 kg), an unknown meal type → `invalidInput`, nothing written. A meal is a one-minute
  interval starting at its time (Health Connect needs an interval).
- Versions: a write's version is the current time in milliseconds, raised to one more than the
  last version used when the clock has not moved, so two quick edits still order.
- Errors from Health Connect: SecurityException → `permissionDenied`; IllegalArgumentException
  → `invalidInput`; any message in the cause chain about a rate limit or quota → `rateLimited`;
  the client's "not available"/unsupported errors → `notAvailable`; anything else → `unknown`.
- Requesting nothing, or only kinds already granted, opens no screen and answers with the grants.
- The permission screen's own answer is not trusted: after it closes the plugin asks Health
  Connect for the grants again.

Our design differences / decisions:
- Names and structure are ours: a gateway for Health Connect, plain row builders, a failure type
  that carries the contract's code.
- Own records are told apart by data origin only (the contract's `source`), not by a prefix on
  the client id: Health Connect sets the origin itself, and the contract passes our ids as they
  are.
- Days follow Health Connect's local-time slicing: each record's own zone offset decides its day,
  the phone's zone when a record has none. For someone who stays in one zone this is the phone's
  zone; for a traveller a walk counts on the day it happened where it happened, as the meal
  logged then does. A session's `day` and a weight's day test use the same rule. Decision for
  the lead (the phase file says "the phone's time zone").
- Totals are rounded to whole steps, kcal and metres.
- `requestPermissions` answers with every granted kind (the same shape as `grantedPermissions`),
  not only the requested ones.
- `type` of a session: the Health Connect exercise type's constant name in camelCase
  (`running`, `strengthTraining`, `highIntensityIntervalTraining`, …); "other workout" and any
  number Health Connect adds later read as `other`. S2 maps these names to labels.
- `time`, `start` and `end` in results are ISO-8601 instants in UTC (`2026-10-27T07:30:00Z`).
- A record in the future is rejected (`invalidInput`) instead of written: Health Connect is a log
  of what happened. S2 writes an entry once its time has passed.
- No retry queue or background worker in the plugin: the web side (P11-03) decides when to write
  again; the plugin answers each call once.
- No history permission: P11 reads the last 30 days, which Health Connect allows without it.

Tests we will write (JVM, `./gradlew testDebugUnitTest`):
- The contract: the TypeScript block in the phase file lists exactly the plugin's `@PluginMethod`
  names; its read and write kinds, availability states and meal types are the ones the plugin
  knows.
- The manifest declares exactly the health permissions the kinds need, the `queries` entry, the
  rationale action and the usage alias.
- Kinds: parsing lists (unknown kind → `invalidInput`), grants → kinds, kinds → permissions.
- Day keys: strict parsing, inclusive ranges, the 366-day cap, the local-time window, the day of
  an instant with and without a zone offset (across midnight and a DST change).
- Rows: every day in the range appears once and in order, null for not granted and for no data,
  zeros kept, rounding, bad values dropped; sessions without own records, malformed ones dropped,
  sorted, type names, blank titles as null, calories from the recording app first; weights
  without own records, sorted.
- Writes: validation of each field, meal types, the one-minute interval, the future check, the
  growing version.
- Failures: each exception kind to its code, rate limits found in causes.
- Availability: each client status, API level and installed flag to the contract's state.

Compare checklist (filled after the rewrite; reopened `A/services/health/HealthConnectManager.kt`,
`HealthExerciseSessions.kt`, `HealthWriteRetry.kt`, the manifest's health lines and the names of
the tests in `T/services/health/`):
- [x] record types: steps, active and total calories, exercise sessions and weight read; nutrition
      and weight written; distance added (`KindsTest` > permissionNamesAreTheOnesTheClientLibraryUses,
      `ManifestTest` > declaresExactlyTheHealthPermissionsOfTheKinds)
- [x] days from Health Connect's per-day aggregation in local time, not a sum of raw records
      (`DayTotalsQuery.kt`; the window: `DayKeysTest` > aRangeIsAskedForInLocalTimeFromMidnightToMidnight)
- [x] only days with data carry values; granted-but-empty is null, real zeros stay
      (`RowsTest` > everyDayOfTheRangeHasOneRowInOrder, totalsAreRoundedAndRealZerosKept)
- [x] a metric that is not granted is never asked for (`RowsTest` > aKindThatIsNotGrantedIsNullEvenWithData;
      the request side in `DayTotalsQuery.kt`)
- [x] own records left out by data origin; malformed sessions (no id, end not after start) skipped
      (`RowsTest` > ownBrokenAndOutOfRangeSessionsAreLeftOutAndTheRestSorted,
      weightsLeaveOutOurOwnAndBrokenOnesAndAreSortedToTheGram)
- [x] session calories from the recording app first, then any app (`RowsTest` >
      sessionCaloriesComeFromTheRecordingAppFirst, sessionCaloriesFallBackToEveryAppWhenTheRecordingAppHasNone)
- [x] every page read; one failed page fails the read (`RowsTest` > aPagedReadFollowsEveryToken,
      aFailedPageFailsTheWholeRead, aTokenThatNeverEndsStops)
- [x] availability: profile or old Android → unsupported; missing app vs update on 9–13
      (`KindsTest` > availabilityFollowsTheSdkStatus)
- [x] settings: Platewise's access page on 14+, Health Connect's settings before, the store
      listing when missing (`KindsTest` > settingsOpenOurAccessPageFromAndroid14,
      settingsOpenTheHealthConnectAppBeforeAndroid14, aMissingOrOldHealthConnectOpensItsStoreListing)
- [x] client record id plus a growing version on every write; a future meal is not written
      (`WritesTest` > versionsOnlyGrowEvenWhenTheClockStandsStillOrGoesBack,
      aMealTimedNowIsAcceptedButNotOneInTheFuture)
- [x] refused permission and bad records are final, other failures retryable: SecurityException
      → permissionDenied, IllegalArgumentException → invalidInput, the rest unknown or rateLimited
      (`FailureTest` > clientExceptionsMapToContractCodes, aRateLimitIsFoundAnywhereInTheCauseChain)
- [x] rationale activity, usage alias with the system-only permission, `queries` for the app
      (`ManifestTest` > theRationaleActionOpensThePrivacyNote,
      thePermissionUsageAliasOpensThePrivacyNoteForTheSystemOnly, canSeeTheHealthConnectApp)
- [x] the contract itself (`ContractTest`, 8 tests: methods, kinds, states, meal types, codes,
      result and argument fields, the plugin name)
- Deliberate differences: own records by data origin, not a client-id prefix; writes carry the
  phone's zone offset (the reference leaves it empty) so their local day is known; no retry
  worker (the web side retries); future meals are refused rather than skipped silently; reads
  are refused while Health Connect is unavailable instead of answering empty.
- Not taken: merging one workout recorded by two apps (the reference keeps one session when two
  share most of the longer one's time) and splitting overlapping sessions' calorie windows; both
  are display questions for P11-03/04 or a later task. Body fat, nutrition import, history and
  background reads, workout-burn writes: not in P11's contract.

## Decisions for the lead

- Local-time day slicing (see above): a record's own zone offset decides its day; the phone's zone
  only when the record has none.
- Future-dated writes are rejected with `invalidInput`: P11-03 writes an entry once its time has
  passed (or writes `min(time, now)`).
- `type` vocabulary for S2: camelCase of Health Connect's `EXERCISE_TYPE_*` names (61 in client
  1.1.0, e.g. `running`, `walking`, `biking`, `bikingStationary`, `strengthTraining`, `yoga`,
  `swimmingPool`, `highIntensityIntervalTraining`); `other` for "other workout" and unknown numbers.
- Results: `time`/`start`/`end` are UTC instants (`…Z`); steps, kcal and metres are whole numbers;
  kg has at most three decimals. A read call rejects `notAvailable` while Health Connect is not
  usable; a kind that is not granted reads as null (totals) or as an empty list (sessions, weights).
- `writeNutrition` and the deletes split batches into calls of 100 records; a failure partway can
  leave the first calls written. Writes are upserts by client id, so writing the batch again is
  safe.
- Health Connect version: `androidx.health.connect:connect-client` 1.1.0 (latest stable on Google
  Maven; 1.2.0 is at alpha06).

## Status

Done (2026-10-27, base `614fdb8`): the plugin implements all 11 methods of the contract and is
registered in `MainActivity`; 62 JVM tests pass. Not run: any call against a real Health Connect
(no emulator); the owner's device run is the first. Handed to S2 (P11-03/04): the decisions above.
