# Task: walk domain, the walks table and the walk service (P15-02) · Phase: 15 · Owner: builder (wt-p15s2, slice S2)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist" BEFORE
writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): the reference has no GPS or step recorder and no walk score. What it
has near this, read for behaviour only: `android/.../ui/home/OutdoorActivityDurationSheet.kt` (a
walk or run logged by hand as a number of minutes and a light/moderate/vigorous choice) and
`android/.../models/WorkoutModels.kt` (`timedMet`: three walking METs, one per effort, said to come
from the 2024 Adult Compendium, with the resting energy taken off). Ours: the P15 phase file (Goal,
D-16.96, the walk score, the burn rule, the WalkTrackerPlugin contract and the Health Connect
additions, and the lead's note on the native behaviour as built); `src/services/health/{load,setup,
native,contract,service}.ts`, `src/services/reminders/load.ts`, `src/services/backup/autoLoad.ts`
(the lazy Android pattern); `src/data/{schema,codecs,guard,hooks,DataProvider}.ts`,
`src/data/repos/{healthRepo,weightRepo,backupRepo}.ts`; `src/services/backup/{payload,backup,
restore,hash}.ts`. No REA evidence for this task.

Sources outside the reference:
- Walking METs: the "Walking" table of the 2024 Adult Compendium of Physical Activities, fetched on
  2026-10-28 from https://pacompendium.com/walking/ (read through the fetch tool, whose answer is a summary
  of the page listing the level-ground rows as code, MET and description: worth checking against
  the page itself). The eight values below (2.3, 2.8, 3.0, 3.8, 4.8,
  5.5, 7.0, 8.5 for 17151, 17152, 17170, 17190, 17200, 17220, 17230, 17231) are the values that page
  gave, not values from memory. The lead checked all eight against the table at
  https://pacompendium.com/adult-compendium/walking/ on 2026-10-28: they match. (From memory I had the 2011 Compendium's numbers, e.g. 3.5 for
  17190 and 4.3 for 17200; the fetched 2024 page differs and is what is used.) The paper: Herrmann
  SD et al., "2024 Adult Compendium of Physical Activities: A third update of the energy costs of
  human activities", Journal of Sport and Health Science, January 2024 (PubMed 38242596; found by a
  web search on the same day). One oddity on the page: 17231 reads "5.0 to 5.5 mph (8.8 to 8.9
  km/h)"; 5.0 mph is 8.05 km/h, which is the band start used here.
- The weekly 150 minutes of moderate activity: the WHO 2020 guidelines on physical activity (general
  knowledge, not fetched).
- Maximum heart rate 220 − age and zones at 50/60/70/80/90 %: the common rule of thumb (general
  knowledge, not fetched).
- Step length 0.414 × height: a common estimate for walking (general knowledge, not fetched).

What it does (own words): the Android app records walks. A native tracker (S1) keeps the raw GPS
points and cumulative step samples; everything else is worked out here, in plain functions. From the
points and steps of a walk (live, or once it is stopped) Platewise works out the distance (noisy and
impossible points left out), the active time (the tracker's own count, pauses left out), the pace
over the whole walk and over the last minute, the steps and the cadence (overall and per minute),
per-minute splits, the brisk minutes, the intensity in METs from the speed, the energy, and a walk
score from 0 to 100 made of four parts, each shown with what it means. The week's moderate minutes
(brisk minutes of recorded walks, plus walking sessions other apps put in Health Connect that do not
overlap a recorded walk) are set against the WHO's 150. When Health Connect has heart rate for the
walk, the time in each zone (by % of 220 − age) is kept. A stopped walk is stored in a new `walks`
table (schema version 3), which travels in backups and restores like the person's other records.
The walk service is the adapter to the plugin: it explains the permissions before Android asks them
on the first start, starts, pauses, resumes, stops and discards, follows live updates, picks up a
walk in progress (or one stopped from the notification) when the app opens, and on stop stores the
walk with the heart rate Health Connect holds for it; on Save it writes the walk to Health Connect
when that is connected and writing is on. The web build never fetches any of it.

Inputs → outputs:
- `src/domain/walks/mets.ts`: `WALKING_METS` (the 2024 Compendium codes below, each with its lower
  speed bound in km/h), `metForSpeed(kmh)`, `UNMEASURED_WALK_MET` (3.0, 17170).

  | Code | Compendium description (2024) | Speed band used | METs |
  |---|---|---|---|
  | 17151 | walking, less than 2.0 mph, level, strolling, very slow | < 3.22 km/h | 2.3 |
  | 17152 | walking, 2.0 to 2.4 mph, level, slow pace, firm surface | 3.22–4.02 km/h | 2.8 |
  | 17170 | walking, 2.5 mph, firm, level surface | 4.02–4.51 km/h | 3.0 |
  | 17190 | walking, 2.8 to 3.4 mph, level, moderate pace, firm surface | 4.51–5.63 km/h | 3.8 |
  | 17200 | walking, 3.5 to 3.9 mph, level, brisk, firm surface, walking for exercise | 5.63–6.44 km/h | 4.8 |
  | 17220 | walking, 4.0 to 4.4 mph, level, firm surface, very brisk pace | 6.44–7.24 km/h | 5.5 |
  | 17230 | walking, 4.5 to 4.9 mph, level, firm surface, very, very brisk | 7.24–8.05 km/h | 7.0 |
  | 17231 | walking, 5.0 to 5.5 mph, level, firm surface | ≥ 8.05 km/h | 8.5 |

  The Compendium gives bands with gaps (2.4–2.5 mph, 2.5–2.8 mph); each band here starts at the
  code's lower speed and runs to the next code's, so every speed has one value.
- `geo.ts`: `metresBetween(a, b)` (haversine, mean Earth radius 6 371 008.8 m); `countedMoves(points)`
  → the moves that count: a fix worse than 50 m accuracy or with a bad position is dropped; a move
  counts from the last counted point (the anchor) once it is longer than half the better accuracy
  (between 3 and 10 m: GPS jitter while standing never adds up), at most 4 m/s (anything faster is a
  jump or a vehicle), and within 60 s of the anchor (a longer gap is a pause or a lost fix: it is not
  counted and the anchor moves on).
- `stats.ts`: `walkStats({startedAt, endAt, activeSeconds, points, steps, locationGranted,
  stepsGranted, heightCm, weightKg})` → distance, active seconds, overall and recent pace, steps,
  cadence, splits (metres and steps per wall-clock minute), brisk minutes and whether they could be
  measured, the speed and where it came from (route, steps or none), METs, energy and active energy.
  A minute's steps come from the cumulative samples (linear between samples, flat after the last;
  across a gap longer than 30 s the later sample's steps go into its last 10 s, so a pause holds
  none); its metres from the moves that overlap it, shared by time. A minute is brisk at 100
  steps/min or more when steps were allowed, else at 4.8 km/h or more from the route; brisk minutes
  are brisk seconds ÷ 60, rounded, never above the active time. Speed: the route's (distance ÷
  active time) once it holds 50 m; else steps × step length (0.414 × height) ÷ active time; else
  none, and then 3.0 METs. Energy: MET × kg × active hours; active energy (MET − 1) × kg × hours.
- `score.ts`: `walkScore(...)` → `{score|null, parts: {brisk, duration, intensity, pace}, paceRatio}`.
  Parts and their weight: brisk share 40 (brisk ÷ active minutes), duration 25 (active minutes
  toward 30), intensity 20 (METs from 2.3 to 5.5, linear), against the person's average pace 15
  (speed ÷ the mean speed of up to the last 10 earlier walks with a speed: full at the average or
  faster, none at 85 % or slower, linear between). A part that cannot be measured is null and left
  out, and the parts that are left are scaled to 100; with neither the brisk part nor the intensity
  part (no steps and no route) there is no score. `effortOf(met)`: light under 3, moderate to 6,
  vigorous from 6.
- `heartRate.ts`: `heartRateSummary(samples, startedAt, endedAt, ageYears)` → average and highest
  bpm, 220 − age and the seconds in zones 1–5; each sample stands for the time to the next one, at
  most 30 s; samples outside the walk or outside 25–250 bpm are left out.
- `week.ts`: `weekWalkingMinutes({walks, sessions, from, to})` → `{recorded, other, total}`: brisk
  minutes of recorded walks that started in the week, plus whole minutes of Health Connect sessions
  of type `walking` in the week that overlap no recorded walk (Platewise's own written walks: the
  plugin already leaves its own sessions out; a watch that recorded the same walk overlaps it).
  `MODERATE_GOAL_MINUTES = 150`.
- `compare.ts`: `earlierWalks(walk, all)` (the last 10 that ended before it started),
  `walkAverages(walks)` (count, minutes, distance, speed, score, each null when none had it).
- `route.ts`: `thinRoute(points, 2000)` (even by index, first and last kept), `encodeRoute` /
  `decodeRoute` (our own text: a version mark, then per fix the change in latitude and longitude in
  1e-5 degree and in seconds from the start, zigzagged, 5 bits per character with a continuation
  bit), `routeShape(fixes, width, height, pad)` → the SVG path and the start and end marks (north
  up, longitudes squeezed by the cosine of the middle latitude).
- `record.ts`: `buildWalk(recorded, {heightCm, weightKg, stored, heartRate})` → the stored `Walk`.
- Data: `walks` table `'id, startedAt'` (schema 3, a new empty table; `KEPT_ADDED_TABLES`
  marks it as travelling in backups, unlike `activity`); `decodeWalk` in `codecs.ts`; `walkRepo`
  (`put`, `get`, `list` newest first, `between(firstKey, lastKey)` by start, `remove`,
  `markWritten`), all through the guard; `useWalks(first, last)` and `useWalkList()` (always empty
  where there is no walk repository: the web); the table in `BACKUP_TABLES`, `BACKUP_CODECS` and the
  restore's key field.
- `src/services/walks/`: `contract.ts` (the phase file's types word for word, its comments too),
  `native.ts` (`registerPlugin('WalkTracker')`), `load.ts` (`loadWalks`: Android only, or a stand-in
  a browser test puts on `globalThis.__platewiseWalkTracker`), `setup.ts`, `service.ts`
  (`createWalkService`: phases idle → asking → starting → active → stopping → finished, or failed),
  `healthLink.ts` (heart rate while Health Connect is connected, at most a 24 h window; `writeWalk`
  only while connected with write-back on; refusals read as "not written"), and
  `testing/{fakeWalkTracker,walkHarness}.ts`.
- Health Connect contract additions (shared): read kind `heartRate`, write kind `walk`, `writeWalk`,
  `readHeartRate`; the health parts also hand out the plugin for the walk link.

Files: created `src/domain/walks/*`, `src/data/repos/walkRepo.ts`, `src/services/walks/*` and their
tests; changed `src/data/{schema,codecs,hooks,DataProvider}.ts`, `src/data/repos/backupRepo.ts`,
`src/services/backup/{payload,restore}.ts` (+ seed), `src/services/health/{contract,load,setup}.ts`
and the fake (shared), `src/services/context.tsx`, `src/main.tsx`, `src/test/factories.ts`.

Edge cases / failure modes:
- No location: no distance, pace or route; speed from steps when allowed. No steps: no step count
  or cadence; brisk minutes from the route's speed. Neither: time and an energy estimate at 3.0
  METs, no score.
- GPS jitter while standing, a lost fix, a jump, driving without pausing: not counted (above).
- A pause: the tracker stops time, points and steps, but the snapshot has no pause times; the move
  across the pause is longer than 60 s and is not counted, and its minutes hold no steps.
- A step sample lower than one before it: the highest so far counts.
- The app killed or reloaded mid-walk: `current()` gives the walk back at open, live again; stopped
  from the notification: `current()` gives it paused with `endedAt`, and it is finished and shown.
  "No walk" may come as undefined: read as null. Start while the tracker holds a walk answers that
  walk.
- Storing fails: the tracker's copy is not let go, the screen says so, and Try again (or the next
  open) finds it again.
- Health Connect write or heart-rate read fails or is refused: the walk is kept without it
  (`writtenToHealth` false, no zones); nothing throws into the app. Walks of the last 30 days not
  yet written are written when the app starts with writing allowed (never the one on the summary).
- A very long walk: splits capped at 600 minutes, the route thinned to 2 000 points, heart rate
  read for its first 24 h.
- A backup from 1.2 has no `walks` list: restoring it leaves no walks (a restore replaces
  everything); 1.2 reading a 1.3 backup skips the unknown list (its hash still matches).

Our design differences / decisions:
- The reference logs a walk by hand with three fixed METs; we record it and take the METs from the
  measured speed (eight Compendium bands). Score, splits, route, zones and the week ring are ours.
- Backup version stays 1: the `walks` list is an addition an older build ignores (Decisions for the
  lead, below).
- `distanceM` to `writeWalk` is 0 when there is no route (the contract has no null).
- Walk calories use the profile weight at the moment the walk is stopped, stored with the walk.

Tests we will write:
- `src/domain/walks/*.test.ts`: METs by band and edge; haversine; jitter, accuracy, jumps, gaps;
  stats on a scripted walk (distance, pace, recent pace, steps, cadence, splits, brisk by steps
  and by speed, energy), without location, without steps, without both, with a pause; score parts
  and scaling; heart-rate zones; week minutes with overlap and type rules; route thinning, the
  encode/decode round trip and the SVG shape; `buildWalk` and the comparison.
- `src/data/schema.test.ts` (version 3; 1 → 3 and 2 → 3 keep every row), `codecs.test.ts`
  (`decodeWalk`), `repos/walkRepo.test.ts`, `hooks.test.tsx` (`useWalks`, `useWalkList`), the
  backup and restore tests (walks out and back in; a 1.2 file).
- `src/services/walks/{load,service,healthLink}.test.ts` with the fake tracker and the fake Health
  Connect.

## Compare checklist (filled after the rewrite; reopened `OutdoorActivityDurationSheet.kt`, `WorkoutModels.kt`):

- [x] Walking METs come from the 2024 Adult Compendium, net of the resting MET for the part counted
      as burned (tested in `src/domain/walks/mets.test.ts` > lists the eight level-walking codes …,
      `stats.test.ts` > works out the energy as MET × kg × hours and the active part …).
- [x] Distance leaves out jitter, bad fixes, jumps and the straight line across a pause (tested in
      `src/domain/walks/geo.test.ts`, `stats.test.ts` > walkStats with a pause).
- [x] Brisk minutes by steps, by speed without steps, none measured without both (tested in
      `stats.test.ts` > walkStats: brisk minutes, walkStats without sensors).
- [x] Score parts, weights, scaling, no score without effort data (tested in `score.test.ts`).
- [x] Heart-rate zones by % of 220 − age (tested in `heartRate.test.ts`).
- [x] Week minutes: recorded brisk minutes plus other apps' walking sessions, overlaps left out
      (tested in `week.test.ts`).
- [x] Route thinning, compact text round trip, SVG shape (tested in `route.test.ts`).
- [x] Schema 3 adds `walks` and keeps every row from 1 and 2 (tested in `src/data/schema.test.ts` >
      schema version 3 (P15-02)); codec, repo, hooks (`codecs.test.ts` > decodeWalk,
      `repos/walkRepo.test.ts`, `hooks.test.tsx` > useWalks and useWalkList).
- [x] Walks travel in backups and restore; the activity copy never does; a 1.2 file restores to no
      walks (tested in `src/services/backup/backup.test.ts` > makes one file …,
      `restore.test.ts` > gives back identical tables …, restores a file made before walks …).
- [x] The walk service: explanation before asking, starting with what was allowed, live updates,
      pause/resume, stop → store → let the tracker's copy go, heart rate while connected, Save
      writes only with write-back on, Discard, open at start-up (in progress / stopped from the
      notification / nothing), catch-up writes, store failure keeps the tracker's copy, `current()`
      answering undefined, Start taking up a held walk, Pause with no walk (tested in
      `src/services/walks/service.test.ts`); the loader (`load.test.ts`); the Health Connect link
      (`healthLink.test.ts`, incl. the 24 h heart-rate window).
- Deliberate differences: the reference logs a walk by hand as minutes and one of three efforts
  with fixed METs (2.8 / 3.8 / 4.8); Platewise records the walk and takes the METs from the measured
  speed across eight Compendium bands. Score, splits, route, zones and the week ring are ours.
- Not taken: nothing from the reference's code, names or copy; its workout and training models.

## Status

Done (2026-10-28). Domain, data (schema 3, codec, repo, hooks), backups, the walk service and its
stand-ins are in, with tests. Lines changed outside the task's own files: `src/services/health/
{contract,load,setup}.ts` and the fake Health Connect (the `heartRate` read kind, the `walk` write
kind, `writeWalk`, `readHeartRate`, the plugin in the parts), `src/services/health/{contract,
service}.test.ts`, `src/features/settings/health/HealthPage.test.tsx` (the new kinds in expected
lists), `src/test/factories.ts` (`makeWalk`), `scripts/ai-live-check/page.ts` (`walks: null`).
Decisions for the lead:
- Backup document version stays 1: `walks` is an added list an older build skips (its hash still
  matches), so a 1.3 file restores in 1.2 without walks rather than being refused.
- A walk without a route sends `distanceM: 0` to `writeWalk` (the contract has no null).
- The walk record keeps the weight used, the score parts, the pace ratio and per-minute splits, so
  a summary opened later shows what it showed at the time.
