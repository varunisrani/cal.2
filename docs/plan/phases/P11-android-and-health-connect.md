# P11 · Android app and Health Connect

**Weeks:** 1–2 · **Tracks:** native (Android shell, Health Connect plugin); web (health service, data, UI) · **Depends on:** P00–P10 · **Status:** 📋 planned (2026-10-27, at the owner's request)

Reference paths are relative to `$PLATEWISE_REF` (`/root/reference/fud-ai`, pinned at `10e14b67`). Prefixes: `A/` = `android/app/src/main/java/com/apoorvdarshan/calorietracker/`. The clean-room protocol (01) applies as in every phase: read, note in our words, rewrite, compare.

## Goal

The owner asked (2026-10-27) for Platewise on an Android phone that connects to Health Connect: how many steps were taken, how many calories were burned, workouts, and calorie tracking that counts that burn. Until now the plan had no health sync (D-16.4, N-5, inventory row M11) because a browser has no health API. P11 adds an Android app (the same web app in a Capacitor shell) and builds M11 for it: read steps, active and total calories, distance, exercise sessions and weight from Health Connect; show them on Home; optionally count active calories in the day's budget; optionally write meals and weigh-ins back. The web app and the installable PWA are unchanged: on the web the health features are hidden (D-16.89).

## Decisions

- **D-16.89** (replaces D-16.4 on Android only): an Android app built from the same web build in a Capacitor 7 shell (`app.platewise.android`), with Health Connect sync. Reads: steps, active calories burned, total calories burned, distance, exercise sessions, weight. Writes (off by default): nutrition per diary entry and weigh-ins, each keyed by our own id as Health Connect's client record id, so an edit replaces and a delete removes the same record. The web and PWA builds show no health features. iOS (HealthKit) is not planned.
- **Budget:** when "Count active calories in my budget" is on (default on once connected), the day's calorie target shown on Home and used by the pillars is the goal plus that day's active calories from Health Connect; the goal itself and every stored value stay as they are. Total calories burned and steps are shown, never added (active calories already hold the exercise).
- **Days:** daily totals use the phone's time zone and our diary's day keys, so a day's steps and burn sit beside that day's meals.
- **Not in P11:** M11's measured-energy anchor for Adaptive Goals (maintenance from measured burn) stays a later item; P11 shows and counts burn, it does not change the goal maths.
- **No emulator here:** the container has no KVM, so native code is compiled and unit-tested on the JVM and the web side is tested against a fake Health Connect; the first run on a device is the owner's. The release checklist says so.

## Plugin contract (both slices code to this)

`registerPlugin<HealthConnectPlugin>('HealthConnect')` from `@capacitor/core`, loaded only when `Capacitor.getPlatform() === 'android'`.

```ts
type HealthReadKind = 'steps' | 'activeCalories' | 'totalCalories' | 'distance' | 'exercise' | 'weight';
type HealthWriteKind = 'nutrition' | 'weight';
interface HealthConnectPlugin {
  availability(): Promise<{ status: 'available' | 'notInstalled' | 'updateRequired' | 'notSupported' }>;
  grantedPermissions(): Promise<{ read: HealthReadKind[]; write: HealthWriteKind[] }>;
  requestPermissions(o: { read: HealthReadKind[]; write: HealthWriteKind[] }): Promise<{ read: HealthReadKind[]; write: HealthWriteKind[] }>;
  openHealthConnectSettings(): Promise<void>;
  // Inclusive day keys (YYYY-MM-DD) in the phone's zone; a value is null when that kind is not granted or has no data.
  readDailyTotals(o: { from: string; to: string }): Promise<{ days: { day: string; steps: number | null; activeKcal: number | null; totalKcal: number | null; distanceM: number | null }[] }>;
  readExerciseSessions(o: { from: string; to: string }): Promise<{ sessions: { id: string; day: string; start: string; end: string; type: string; title: string | null; activeKcal: number | null; source: string }[] }>;
  readWeights(o: { from: string; to: string }): Promise<{ weights: { id: string; time: string; kg: number; source: string }[] }>;
  writeNutrition(o: { records: { clientId: string; time: string; name: string; mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null; kcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null }[] }): Promise<void>;
  deleteNutrition(o: { clientIds: string[] }): Promise<void>;
  writeWeight(o: { clientId: string; time: string; kg: number }): Promise<void>;
  deleteWeight(o: { clientIds: string[] }): Promise<void>;
}
```

Reads leave out records Platewise wrote itself (`source` is the writing app's package name). Errors reject with a code: `notAvailable`, `permissionDenied`, `rateLimited`, `invalidInput`, `unknown`.

## Slices and waves

- **Wave A (parallel):** S1 = P11-01, P11-02 (`android/**`, `capacitor.config.json`, `scripts/android/**`, `package.json` scripts and the Capacitor packages, `pnpm-lock.yaml` with the lead's approval) · S2 = P11-03, P11-04 (`src/services/health/**`, the data-layer table and migration, Settings and Home UI, tests; codes to the contract above with a fake plugin).
- **Wave B:** S3 = P11-05 (docs, ledgers, CHANGELOG 1.1.0, release checklist rows), after both land.

## Tasks (5)

| ID | Task | Read in reference | New files | Verify |
|---|---|---|---|---|
| P11-01 | **Android shell.** Capacitor 7.6.9 (exact) `android/` project in the repo, `capacitor.config.json` (`appId` `app.platewise.android`, `appName` Platewise, `webDir` `dist`), minSdk 26, our icons and splash generated from `public/icons` by a script, camera permission (photo and barcode), `pnpm android:apk` = web build, `cap sync`, Gradle debug APK (a Gradle init script points Maven Central at Google's mirror when the environment needs it); release signing from environment variables, documented, never committed. | none (our own shell) | `android/**`, `capacitor.config.json`, `scripts/android/{build-apk.sh,icons.py,mirror.init.gradle}` | `pnpm android:apk` builds `app-debug.apk`; `aapt dump badging` shows the package, the version from `package.json` and the permissions; the web build, unit tests and e2e are unchanged. |
| P11-02 | **Health Connect plugin.** Kotlin `HealthConnectPlugin` implementing the contract with `androidx.health.connect:connect-client` (latest stable); manifest read/write permissions for the kinds above, the `queries` entry for the Health Connect app, the permissions-rationale and permission-usage entries that open our privacy text; per-day aggregation in the phone's zone; records written by Platewise left out of reads; client record ids on writes. JVM unit tests for the mapping and day bucketing. | `A/` health sync code (observable behaviour only: which record types, how days are bucketed, how own records are told apart) | `android/app/src/main/java/app/platewise/android/health/**` | `./gradlew testDebugUnitTest` green; the APK lists the health permissions; the plugin's methods match the contract (a test reads the TypeScript contract's method names). |
| P11-03 | **Health service and data.** `src/services/health/` (the contract types, the native adapter, a fake for tests and the web, `isHealthAvailable()`); an `activity` table (day key → steps, active and total kcal, distance, sessions, synced at) with a migration; settings (`health.connected`, `health.countActiveCalories` default true, `health.writeBack` default false, `health.importWeights` default true); sync of the last 30 days on start, on resume and on demand; weigh-ins imported as ours with their Health Connect id (no duplicates on re-import); write-back on entry add, edit and delete and on weigh-ins when on. | `A/` health sync (as P11-02) | `src/services/health/**`, migration and tests | unit tests with the fake: sync fills days, a second sync changes nothing, revoked permissions show as such, write-back calls follow add/edit/delete, the web build never loads the adapter. |
| P11-04 | **Health UI.** Settings → Health Connect page (shown only on Android): status, Connect, which data is granted, the three switches, Open Health Connect, last sync; Home: an activity card for the shown day (steps, active calories, workouts) and, when counting is on, the budget line "goal + N burned"; Progress: steps and active calories for 7 and 30 days. All strings through i18n, `data-ui` hooks, accessible names. | `A/` Home burn line and health settings screen (layout ideas only) | Settings page, Home card, Progress chart, tests | unit tests for each screen with the fake; the a11y spec still passes on the web (the health UI is hidden there). |
| P11-05 | **Docs and ledgers.** `docs/user/android.md` (install the APK, Health Connect, privacy), acceptance rows for M11 (moved from N-5 to P11 on Android), D-16.89 in 16-what-we-change, CHANGELOG 1.1.0 (unreleased), release checklist rows (APK build, device test by the owner). | none | `docs/user/android.md` | `check --require-ref --strict` green; the docs build. |
