# P15 · Walk recorder with a walk score, and Google Drive backup

**Weeks:** 1 · **Tracks:** native (walk tracker, Health Connect writes, Google sign-in); web (walk domain, screens, Coach, Drive client) · **Depends on:** P00–P14 · **Status:** 📋 planned (2026-10-28, at the owner's request) · **Ships as:** 1.3.0

## Goal

The owner asked (2026-10-28) for (1) a walk recorder: start a walk, see time, distance, pace, steps, cadence and calories live, a line of the route, recording with the screen off, a summary that says how effective the walk was (a walk score from brisk minutes, intensity, the weekly 150-minute goal, heart-rate zones when a watch recorded them, and a comparison with past walks), saved in Progress, written to Health Connect and counted in "goal + burned"; and (2) automatic backups also uploaded to the person's own Google Drive, so a lost phone loses nothing.

## Decisions

- **D-16.96 Walks (Android app).** A native walk tracker (our own Kotlin plugin, no Google Play services: Android's LocationManager for GPS and the step counter sensor) runs in a foreground service of type location with a "Walk in progress" notification (Pause/Resume/Stop); it keeps the raw points and step samples in the app's files so a reload or a killed WebView loses nothing; the web side computes everything else. Permissions are asked when the person starts their first walk: location (fine; the walk works without it, then no distance from GPS and no route), physical activity (steps; Android 10+), notifications (already asked for reminders). No background-location permission (the service starts while the app is in front). The route is drawn as a line on a plain background (no map tiles: a tiled map needs a map provider; a later item). Walks are stored in a `walks` table (schema version 3) and travel in backups.
- **Walk score** (0–100, each part shown): brisk minutes (a minute counts as brisk at ≥ 100 steps/min, or ≥ 4.8 km/h when steps are missing), intensity from speed (METs from the 2024 Adult Compendium walking codes, cited in the note), duration toward 30 minutes, the comparison with the person's average walk pace; calories = MET × kg × hours (active calories = (MET − 1) × kg × hours, the part counted in "goal + burned"). The week's moderate minutes (brisk minutes of recorded walks and of other walking sessions Health Connect holds, the person's week start) against 150 (WHO). Heart-rate zones by % of 220 − age when Health Connect has heart rate for the walk (READ_HEART_RATE asked with the other health permissions). The Coach reads walks through a `walk_log` tool.
- **Burn without double counting.** With Health Connect connected, a finished walk is written to it (exercise session of type walking, distance, active calories) and the day's burn keeps coming from Health Connect's totals, which merge overlapping data from several apps. Without Health Connect, the day's recorded walks' active calories count in "goal + burned" when that switch is on.
- **D-16.97 Google Drive backup (Android app).** After each automatic backup (and Back up now), the file is also uploaded to the person's Google Drive, into a "Platewise backups" folder, with the `drive.file` scope (Platewise sees only the files it made). Sign-in uses Google's Authorization API on Android (no password ever in Platewise); it needs an OAuth client the owner registers once in Google Cloud (package `app.platewise.android` and the signing key's SHA-1). Uploads retry at the next start or return when offline or failing; the newest 7 Drive backups are kept; Settings › Your data › Google Drive: Connect (shows the account), last upload, Upload now, the list with Restore, Disconnect; Welcome's restore also offers Google Drive. The web app has no Drive backup.

## Plugin contracts (both slices code to these)

```ts
type WalkState = 'running' | 'paused';
interface WalkPoint { t: string; lat: number; lon: number; accuracyM: number }
interface StepSample { t: string; steps: number } // cumulative steps since the walk started
interface WalkSnapshot {
  id: string; state: WalkState; startedAt: string; activeSeconds: number;
  points: WalkPoint[]; steps: StepSample[]; locationGranted: boolean; stepsGranted: boolean;
}
interface WalkTrackerPlugin {
  checkPermissions(): Promise<{ location: PermissionState; activity: PermissionState; notifications: PermissionState }>;
  requestPermissions(o: { location: boolean; activity: boolean }): Promise<{ location: PermissionState; activity: PermissionState; notifications: PermissionState }>;
  start(o: { withRoute: boolean }): Promise<WalkSnapshot>;
  pause(): Promise<WalkSnapshot>;
  resume(): Promise<WalkSnapshot>;
  stop(): Promise<WalkSnapshot & { endedAt: string }>;
  discard(): Promise<void>; // call after saving or throwing away; an ended walk (state 'paused' plus endedAt) is kept until then
  current(): Promise<WalkSnapshot | null>; // a walk in progress, e.g. after the app was reopened; no walk resolves undefined, read it as null
  addListener(event: 'walkUpdate', fn: (s: WalkSnapshot) => void): Promise<{ remove(): Promise<void> }>; // about every 2 s while in front
}
// Health Connect additions (the P11 plugin):
//   writeWalk({ clientId, start, end, distanceM, activeKcal, steps: number | null }): Promise<void>
//   readHeartRate({ start, end }): Promise<{ samples: { t: string; bpm: number }[] }>   // kind 'heartRate' in HealthReadKind
//   kind 'walk' in HealthWriteKind: needed by writeWalk (exercise, distance, active calories; steps are asked with it and optional)
interface DrivePlugin {
  authorize(o: { interactive: boolean }): Promise<{ accessToken: string; email: string | null }>; // rejects 'notConfigured' | 'cancelled' | 'unavailable' | 'unknown'
  signOut(): Promise<void>;
}
```

## Slices (wave 21, parallel)

- **S1 native** (P15-01): the WalkTracker plugin and service, the Health Connect additions, the Drive authorize plugin; manifest permissions; JVM tests.
- **S2 walks web** (P15-02, P15-03): the walk domain (stats, score, calories, weekly minutes), the `walks` table and backup, the walk service (adapter + fake), the Walk screen and summary, Progress › Walks and the weekly ring, Home and + menu entries, the Coach's `walk_log`, the burn rule.
- **S3 Drive web** (P15-04): the Drive client (folder, upload, list, download, prune), its hook into automatic backup and Back up now, the Google Drive card and Welcome restore, with a fake.
- Then **P15-05**: release 1.3.0 and the APK (`PLATEWISE_BUILD_NUMBER=4`).
