# Task: walk tracker and Health Connect additions, native side (P15-01) · Phase: 15 · Owner: builder (wt-p15s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): nothing for the walk tracker: the reference's Android app has no
walk or route recording (searched `android/` for `LocationManager`, fused location,
`TYPE_STEP_COUNTER`, `ACTIVITY_RECOGNITION`, `ACCESS_FINE_LOCATION`, `startForeground` and
`foregroundServiceType`: no hits; its manifest has no location permission and no location
service). For the Health Connect additions, the P11 note's reading stands (the reference writes
active calories but no walks or heart rate). Ours: the P15 phase file (D-16.96, the plugin
contracts), the P11 plugin (`android/app/src/main/java/app/platewise/android/health/**`, its tests,
`docs/notes/P11/health-connect-plugin.md`), `MainActivity.kt` (P14's insets listener stays),
`AndroidManifest.xml`, Capacitor 7.6.9's `Plugin.java` and `Bridge.java` (listeners, permission
aliases and their states), Health Connect client 1.1.0's API (records, metadata, limits).

What it does (own words): a Capacitor plugin `WalkTracker` records a walk on the phone while the
web app computes everything else. `start` begins a walk while the app is in front and starts a
foreground service that keeps recording with the screen off: GPS fixes from Android's own
`LocationManager` (no Play services), filtered for poor accuracy and impossible jumps, and the
step counter sensor counted from the walk's start and sampled every 10 seconds. Pause and resume
stop and continue the clock, the route and the steps. Every change is appended to a small file in
the app's files folder, so a reloaded WebView or a restarted process finds the walk again
(`current()`), with the points and samples recorded so far. A "Walk in progress" notification on
its own channel shows the elapsed time and distance, with Pause/Resume and Stop; Stop there ends
the walk and keeps it for the app to show and save the next time it opens; tapping the
notification opens the app. While the app listens, a `walkUpdate` event carries the whole walk
about every 2 seconds. The Health Connect plugin learns to write a finished walk (exercise session
of type walking, distance, active calories, and steps when given and allowed) and to read heart
rate for a walk's time.

Inputs → outputs:
- `checkPermissions()` → `{ location, activity, notifications }` as Capacitor permission states;
  `requestPermissions({ location, activity })` asks Android for the chosen ones and answers the
  same shape.
- `start({ withRoute })` → the new walk's snapshot (or the walk already in progress);
  `pause`/`resume` → the snapshot; `stop()` → the snapshot with `endedAt`; `discard()` → nothing;
  `current()` → the walk in progress or the ended walk not yet discarded, else null.
- Snapshot: `{ id, state, startedAt, activeSeconds, points: [{ t, lat, lon, accuracyM }],
  steps: [{ t, steps }], locationGranted, stepsGranted }` plus `endedAt` once ended.
- `writeWalk({ clientId, start, end, distanceM, activeKcal, steps })` → Health Connect records;
  `readHeartRate({ start, end })` → `{ samples: [{ t, bpm }] }`.

Files:
- `android/app/src/main/java/app/platewise/android/walk/`: plain Kotlin (JVM-tested):
  `RouteFilter.kt` (accuracy and jump filter, haversine), `StepTally.kt` (step deltas across sensor
  resets and pauses), `WalkLog.kt` (the persisted line format), `WalkRecorder.kt` (the walk's state
  machine, time accounting, distance, snapshot rows), `WalkFile.kt` (append/read/replace the file),
  `WalkText.kt` (notification distance and time, permission states per Android version);
  Android: `WalkSession.kt` (the one walk of the process: file, recorder, service and notification
  side effects), `WalkService.kt` (foreground service: GPS, step sensor, timers),
  `WalkNotifications.kt` (channel, the notification, distance text), `WalkActionReceiver.kt`
  (notification buttons), `WalkTrackerPlugin.kt` (Capacitor glue).
- `health/`: `HealthKinds.kt` (read kind `heartRate`; write kind `walk`), `HealthWrites.kt`
  (`walkWrite` checks), `HealthRows.kt` (heart-rate rows), `RecordWrites.kt` / `RecordQueries.kt`
  (the client calls), `HealthConnectGateway.kt`, `HealthConnectPlugin.kt`.
- `MainActivity.kt` (registration lines), `AndroidManifest.xml` (permissions, service, receiver),
  `res/values/strings.xml` (notification text; the privacy note names walks and heart rate).
- Tests in `android/app/src/test/java/app/platewise/android/walk/` and `.../health/`.

Edge cases / failure modes:
- No location permission, or `withRoute: false`: no GPS, no points, `locationGranted: false`;
  only "approximate" granted: the GPS provider needs fine location, so the same.
- No activity permission (Android 10+) or no step counter sensor: no samples,
  `stepsGranted: false`. Below Android 10 the step counter needs no permission.
- Neither: the walk still runs (time only); no foreground service is needed or allowed then
  (Android 14 requires a granted permission behind each service type), the notification is a
  plain one.
- Fixes with no accuracy or worse than 50 m, invalid coordinates, or not newer than the last kept
  fix are dropped. A fix that would need more than 8 m/s (29 km/h) from the last kept one, after
  allowing for both fixes' accuracy, is held back as a jump; three held-back fixes that agree with
  each other are kept after all (the person really is there), and the jump itself adds no
  distance. After a resume the next good fix starts a new stretch (no distance across a pause).
- Step counter: counts since boot; the first reading only sets the baseline; a reading below the
  last one means the counter restarted (a reboot): the new value is all new steps. Readings while
  paused move the baseline without counting. Values are whole steps.
- Persisted file: appended line by line (header, start, points, samples, pause/resume, end); a
  torn last line after a crash is skipped; an unknown header or version means no walk. The
  step baseline is in each sample, and a sample is written at pause and resume, so a restarted
  process keeps counting from the right place.
- Process killed with the service: START_STICKY brings the service back with the file's walk; if
  Android refuses to start it from the background it stops, and the app restarts it when it opens
  (`current()` while a walk runs or is paused and the service is not running).
- Stop from the notification: the walk ends and stays in the file with its end; the notification
  becomes a plain "Walk ended" one that opens the app; `current()` returns it with `endedAt` until
  the app calls `discard()` (or starts a new walk).
- Calls without a walk (`pause`, `resume`, `stop`) reject `noWalk`; `pause` when paused and
  `resume` when running answer the snapshot unchanged; `start` during a walk answers that walk.
- writeWalk: blank or over-long id, times that do not parse, end not after start, end in the
  future, a walk over 24 h, negative or out-of-range numbers → `invalidInput`; the walk write
  kind not granted → `permissionDenied`. Zero distance or zero calories write no record of that
  type (Health Connect rejects a 0-step record, and empty records are noise). The records go in
  one insert, so they are written together or not at all.
- readHeartRate: heart rate not granted → no samples (as the other reads); a window over 24 h or
  end before start → `invalidInput`; every page followed; samples outside the window dropped,
  sorted by time.

Our design differences / decisions:
- Names and structure are ours (no reference code for this).
- The service declares `foregroundServiceType="location|health"` and starts with only the types
  the walk uses: location when recording GPS, health when counting steps. The phase file names
  only location, but on Android 14+ a location-type service cannot start without the location
  permission, and the walk must work with steps only (D-16.96). Health needs
  `FOREGROUND_SERVICE_HEALTH` and the activity permission. Decision for the lead.
- `locationGranted` / `stepsGranted` say whether the walk records that source (permission granted
  and, for location, `withRoute`; for steps, a step counter present), fixed at start.
- An ended walk reports `state: 'paused'` with `endedAt` (the contract's state has no "ended").
- The native side keeps an ended walk until `discard()`: the app must call it once the walk is
  saved or thrown away (also after `stop()`), else `current()` keeps returning it. Decision for
  the lead (S2 must call `discard()` after saving).
- GPS: `GPS_PROVIDER`, at most every 2 s and only after 5 m of movement (the platform's
  minimum-distance filter keeps standing-still jitter out).
- The notification's distance is in miles where the phone's region uses miles (US, Liberia,
  Myanmar), else km: the plugin does not know the app's unit setting. Time is a chronometer that
  Android ticks itself; the text is refreshed every 2 s only when it changed.
- Health Connect: a new write kind `walk` (exercise, distance, active calories; steps asked with
  it but optional) and a new read kind `heartRate`. The phase file names `heartRate` but no write
  kind; without one the web cannot ask for the walk permissions. Decision for the lead (the P15
  contract needs the line "kind 'walk' in HealthWriteKind").
- writeWalk's client record ids: `<clientId>:exercise`, `:distance`, `:activeCalories`, `:steps`;
  metadata "actively recorded" on a phone; the session has no title (apps show "Walking").
- walkUpdate events come from the plugin, not the service: every 2 s while a listener is attached
  and the app is in front, for any walk (also an ended one, so a Stop from the notification
  reaches an open app).

Tests we will write (JVM):
- RouteFilter: accuracy cut-off, invalid fixes, time order, the speed rule with accuracy slack, a
  confirmed jump after three agreeing fixes, a lone spike dropped, haversine against known
  distances.
- StepTally: baseline, deltas, counter restart, pause moves the baseline, restore from a sample.
- WalkLog: every line round-trips, a torn or unknown line is skipped, a bad header means no walk.
- WalkRecorder: start/pause/resume/end time accounting (open pause, clock going back), points
  only while running, samples only while running, distance without pause gaps or confirmed jumps,
  replaying the file gives the same snapshot (including the step baseline), snapshot rows.
- WalkFile: create, append, read back, torn last line, delete.
- Health: walkWrite checks and record ids, heart-rate rows, kinds (heartRate, walk with an optional
  permission), the manifest's health permissions, the contract (P11 and P15 blocks).
- Contract: the WalkTracker plugin's methods and snapshot fields against the P15 block.

Compare checklist (filled after the rewrite; no reference file exists for the tracker, so the
cases are checked against the phase file's contract and D-16.96; for Health Connect reopened the
P11 note's reading):
- [x] the contract: methods, snapshot, point and sample fields, states, permission shapes, the
      `walkUpdate` name, the plugin name (`WalkContractTest`, 7 tests)
- [x] Health Connect additions: `writeWalk` and `readHeartRate` are plugin methods with the
      contract's fields; `heartRate` and `walk` kinds (`ContractTest` >
      everyContractMethodIsAPluginMethodAndNoOtherIsDeclared, readAndWriteKindsMatchTheContractUnions,
      writeWalkTakesTheContractFields, readHeartRateTakesAWindowAndAnswersSamples)
- [x] fixes worse than 50 m, unusable or out of order are dropped (`RouteFilterTest` >
      unusableFixesAreDropped, theFirstPointStartsAStretchAndReachablePointsFollowIt)
- [x] impossible jumps: the 8 m/s rule with the fixes' accuracy, a lone spike never kept, three
      agreeing fixes kept as a new stretch (`RouteFilterTest` > theSpeedLimitAllowsForBothFixesAccuracy,
      aLoneSpikeIsNeverKept, threeAgreeingJumpsAreKeptAsANewStretch, jumpsThatDisagreeStartTheCountAgain)
- [x] haversine distance (`RouteFilterTest` > haversineMatchesKnownDistances); distance never across
      a pause or a jump (`WalkRecorderTest` > distanceFollowsEachStretchAndNeverCrossesAPauseOrAJump)
- [x] steps relative to the walk's start, across counter restarts, not counted while paused
      (`StepTallyTest`, 6 tests; `WalkRecorderTest` > stepsCountWhileRunningAndArePutInSamples)
- [x] pause accounting: open pause, end while paused, repeated pause/resume, a clock going back
      (`WalkRecorderTest` > pausesAreLeftOutOfTheActiveTime, pauseAndResumeTwiceChangeNothing,
      aClockThatGoesBackNeitherShrinksNorRewindsTheWalk)
- [x] points and samples only while running; fixes from before a resume dropped (`WalkRecorderTest` >
      pointsAreKeptOnlyWhileRunningAndOnlyWithARoute, aWalkWithoutStepsHasNoSamples)
- [x] persisted format: every line round-trips, torn and unknown lines skipped, header and start
      required, '.' decimals in any language (`WalkLogTest`, 7 tests); file create/append/replace,
      a torn last line closed (`WalkFileTest`, 5 tests)
- [x] a walk read back from its file is the same walk and counts on (step baseline, GPS anchor)
      (`WalkRecorderTest` > aWalkReadBackFromItsEventsIsTheSameWalkAndCountsOn,
      replayNeedsAStartAndIgnoresWhatFollowsTheEnd)
- [x] an ended walk: `paused` with `endedAt`, takes nothing more (`WalkRecorderTest` >
      anEndedWalkIsPausedWithItsEndAndTakesNothingMore)
- [x] notification text: km or miles in the phone's number style, a clock-like elapsed time
      (`WalkTextTest` > distancesInKmOrMilesInThePhonesNumberStyle, milesWhereTheRegionUsesThem,
      elapsedTimeReadsLikeAClock)
- [x] permission states per Android version (`WalkTextTest` > permissionStatesAreCapacitorsFromAndroid13,
      olderAndroidsHaveNoActivityOrNotificationQuestion)
- [x] manifest: location, activity, the service types and their permissions, no background
      location, private service and receiver, optional GPS and step counter hardware
      (`WalkManifestTest`, 5 tests); the health permissions of every kind (`ManifestTest` >
      declaresExactlyTheHealthPermissionsOfTheKinds)
- [x] writeWalk checks, record ids from the walk id, which records are written (steps only when
      given, above 0 and granted) (`WritesTest` > aWalkIsCheckedAndItsRecordsTakeTheWalkIdWithASuffix,
      badWalksAreInvalidInput, aWalkWritesItsSessionAndOnlyRecordsThatHoldSomething)
- [x] heart rate: the window's samples only, sorted, impossible values dropped; the window's checks
      (`RowsTest` > heartRateKeepsTheWindowsSamplesInOrder, `DayKeysTest` >
      aHeartRateWindowIsTwoInstantsAtMostADayApart)
- [x] the walk kind needs its three writes, steps asked but optional (`KindsTest` >
      aWalkIsGrantedWithItsThreeWritesAndStepsAreOptional, aWalkRequestAsksForStepsButOnlyNeedsTheRest,
      permissionNamesAreTheOnesTheClientLibraryUses)
- Not tested on the JVM (Android only; a device must check them): the service starting in the
  foreground with its types, GPS and step counter readings with the screen off, the notification
  and its buttons, a START_STICKY restart, the permission dialogs, Health Connect inserts and
  heart-rate reads against a real Health Connect.
- Deliberate differences: none from the reference (it has no walk recorder); from the prompt, the
  service is `location|health` (see above).
- Not taken: a route written to Health Connect (needs `WRITE_EXERCISE_ROUTE`, not asked for);
  pause times in the snapshot (the contract has none).

## Decisions for the lead

- **Write kind `walk`** (new): requires `WRITE_EXERCISE`, `WRITE_DISTANCE`,
  `WRITE_ACTIVE_CALORIES_BURNED`; `WRITE_STEPS` is asked with it and optional (steps are written
  only when it is granted). `requestPermissions` opens Health Connect's screen only when a required
  permission is missing, so a refused steps toggle does not bring the screen back. The P15 phase
  file needs one line in the contract block, after the `readHeartRate` comment, for the contract
  test (it fails without it):
  `//   kind 'walk' in HealthWriteKind: needed by writeWalk (exercise, distance, active calories; steps are asked with it and optional)`.
  S2 must ask for `write: ['walk']` (with the existing write kinds) and `read: ['heartRate']`.
- **Foreground service type `location|health`**: started with location when the walk records GPS
  and health when it counts steps; adds `FOREGROUND_SERVICE_HEALTH`. Without it a steps-only walk
  cannot run in the foreground on Android 14+. Play's foreground-service declaration then lists
  both types (fitness tracking).
- **Ended walks are kept until `discard()`**: `stop()` answers the ended walk and keeps it;
  `current()` answers it (with `endedAt`) until `discard()` or a new `start()`. S2 calls
  `discard()` once the walk is saved or thrown away.
- **`current()` with no walk resolves with no value** (`undefined` in JS, not `null`: a
  Capacitor result is an object or nothing); the adapter maps it to null.
- `start()` during a walk answers that walk; `pause`/`resume`/`stop` without a walk reject
  `noWalk`; other failures `unknown`. `pause` on a paused or ended walk, `resume` on a running or
  ended one, `stop` on an ended one answer the walk unchanged.
- `locationGranted` / `stepsGranted` mean "this walk records it" (permission, `withRoute`, the
  hardware), fixed at start.
- The snapshot's points are already filtered (accuracy, jumps); no pause times are in it, so the
  web joins the last point before a pause to the first after it (native distance does not).
  Adding `pauses` to the contract would let the web do the same.
- `walkUpdate` carries the whole walk every 2 s; a two-hour walk is about 3 600 points (about
  300 kB of JSON). Fine on current phones; a later item could send only what is new.
- Notification distance unit from the phone's region (miles in US, LR, MM), not the app setting.
- The privacy note Health Connect opens now also names heart rate (read for a recorded walk) and
  walks (written as walking sessions); docs/user's privacy text may want the same lines.

## Status

Done (2026-10-28, base `648e6ca`): the WalkTracker plugin (service, notification, buttons,
file), the Health Connect additions and their tests; registered in `MainActivity`. JVM tests:
134 pass (with the P15 phase file plus the line above; with the lead's current phase file
`ContractTest.readAndWriteKindsMatchTheContractUnions` fails, as intended, until that line is
added). Debug APK builds. Not run: anything on a device (no emulator). Handed to S2: the
decisions above.
