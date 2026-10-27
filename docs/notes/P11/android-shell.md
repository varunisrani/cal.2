# Task: Android shell (P11-01) · Phase: 11 · Owner: builder (wt-p11s1)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none for the shell itself. The row's "Read in reference" column
says none: the shell is Capacitor's, not a port of the reference's native app. Read instead: the
P11 phase file (Goal, D-16.89, the P11-01 row); `docs/plan/01-clean-room-protocol.md`; the lead's
throwaway Capacitor 7.6.9 shell in the scratchpad (its Gradle files and the build log, to know
what already built here); `public/manifest.webmanifest` and `public/icons/*` (our colours and
icons); `tooling/checks/**` (which files the similarity, banned and assets checks walk, so the
generated Android files do not trip them). The reference's `android/` tree was looked at only to
see which of its files the similarity check could pair with a Capacitor template file (the
`FileProvider` block of its manifest), never to take anything from it.

What it does (own words): Platewise on an Android phone is the same web build inside a Capacitor 7
WebView. `capacitor.config.json` names the app (`app.platewise.android`, Platewise) and points
Capacitor at `dist`. `android/` is the project `cap add android` writes, then changed by us:
minSdk 26 (Health Connect's floor), the Kotlin plugin for P11-02, our launcher icons and splash
drawn from `public/icons` by a script, the camera permission (photo capture and the barcode
scanner both use it through the WebView), version name from `package.json` and version code from
the build number. `pnpm android:apk` builds the web app, copies it into the project with
`cap sync`, and runs Gradle for a debug APK; a release APK is signed only when the signing
variables are set, and nothing secret is ever written to the repo.

Inputs → outputs: `dist/` + `android/` + environment (`ANDROID_HOME`, JDK 21, optional build
number, optional signing variables, optional Maven mirror) → `android/app/build/outputs/apk/
debug/app-debug.apk` (or `release/app-release.apk`); `public/icons/*.png` +
`public/manifest.webmanifest` → `android/app/src/main/res/{mipmap-*,drawable*,values}` icon,
splash and colour files.

Files: created `capacitor.config.json`, `android/**` (Capacitor template, then edited),
`scripts/android/build-apk.sh`, `scripts/android/icons.py`, `scripts/android/mirror.init.gradle`,
this note. Changed `package.json` (three Capacitor packages, two scripts), `pnpm-lock.yaml` (from
`pnpm add` only), `.gitignore` (Android build output and the copies `cap sync` makes). Shared:
`eslint.config.js` (one ignore entry, `android/`, where only generated and copied JavaScript
lives); `src/generated/notices.json` and the generated section of `THIRD_PARTY_NOTICES.md`, which
`pnpm build` rewrites by itself now that `@capacitor/core` (MIT) and its `tslib` (0BSD) are
production dependencies.

Edge cases / failure modes:
- Maven Central answers 429 here. The init script sends every Central request to Google's mirror
  of it, but only when `PLATEWISE_MAVEN_MIRROR` is set (opt-in): a normal machine builds without
  it. `1` means Google's mirror; any `https://` value is used as the mirror itself.
- No `ANDROID_HOME`/`ANDROID_SDK_ROOT` and no `android/local.properties`: the script stops with
  one line saying what to set, before any build work.
- A JDK older than 21 (Capacitor 7 compiles for Java 21): the script stops and says so.
- `PLATEWISE_BUILD_NUMBER` that is not a whole number from 1 to 2100000000 (Play's ceiling): the
  Gradle build fails with a message naming the variable, instead of shipping version code 1.
- Some but not all signing variables set: the build fails and lists the missing ones; none set
  means an unsigned release APK (or the debug key for a debug APK).
- Gradle run straight after a checkout (or after the copied web build was removed) would package
  an APK with an empty WebView: `merge{Debug,Release}Assets` stops with "run `pnpm android:sync`"
  when `assets/public/index.html` is missing. Unit tests do not merge assets, so they still run.
- The copied web build, `capacitor.config.json` copy and the Cordova plugin folder are written by
  `cap sync`; they are ignored by git (root `.gitignore`, which Prettier also reads) and by
  ESLint, and the shell must still build from a fresh checkout (`cap sync` comes first in the
  script).
- The similarity and assets checks walk every file outside `node_modules` and the root output
  folders, so `android/**/build`, `android/.gradle` and the copied web build are walked too when
  they exist: the checks are run with and without them, and anything they flag is reported with a
  proposed allow-list entry (the checker is not edited).
- Template files that look like the reference's own Android template files (the Android Studio
  example tests, the default vector launcher drawables, the stock `FileProvider` block): the
  examples and the default drawables are deleted, the manifest is written in our own order.
- Android 15 forces edge-to-edge for apps that target SDK 35: Capacitor's margin option keeps the
  WebView between the system bars, since a WebView may not report those bars to `env()`. Not
  testable here without a device: listed for the owner's device run.

Our design differences / decisions:
- Kotlin `MainActivity` (registers the Health Connect plugin before the bridge starts) instead of
  the template's Java one.
- Toolchain: the Health Connect client 1.1.0 (the latest stable on Google Maven) declares
  `minCompileSdk=36` and Android Gradle plugin 8.9.1 or newer, so the template's plugin 8.7.2 and
  compileSdk 35 had to move: plugin 8.10.1 (the first line made for API 36; it still runs on the
  template's Gradle 8.11.1), compileSdk 36 (`platforms;android-36` installed with sdkmanager),
  Kotlin 2.2.21 (inside the ranges JetBrains lists for Kotlin 2.2: Gradle up to 8.14, the
  Android plugin's 8.10 line), kotlinx-coroutines 1.10.2.
  targetSdk stays 35, as Capacitor 7 ships it.
- The template's unused pieces are gone: the Google services classpath, the example tests, the
  default vector launcher drawables, `activity_main.xml`, two strings Capacitor 7 never reads;
  `file_paths.xml` shares only the app's external files folder (where Capacitor's camera capture
  writes), not the whole external storage the template allowed.
- `android:allowBackup="false"`: the diary and the user's AI keys live in WebView storage, and
  Android's cloud backup would copy them to the user's Google account; Platewise's own backup
  (Settings → Data) stays the way to move data. Decision for the lead.
- The window, status bar and splash backgrounds use the web manifest's `background_color`, so the
  app does not flash white before the WebView paints.
- Icons: legacy and round launcher PNGs from `icon-512.png` and `icon-maskable-512.png`; the
  adaptive icon's foreground is the maskable icon scaled so its safe circle fills Android's 66 dp
  safe zone, on a background colour read from that icon's corner. Splash PNGs (the sizes the
  Capacitor template ships) are the manifest background with `icon-512.png` in the middle.
- The mirror is opt-in through `PLATEWISE_MAVEN_MIRROR`, never always on.
- versionName comes from `package.json` (read by Gradle, so Android Studio builds agree with
  `pnpm android:apk`); versionCode from `PLATEWISE_BUILD_NUMBER`, else 1.
- Release signing variables: `PLATEWISE_KEYSTORE` (path to the keystore), `PLATEWISE_KEYSTORE_PASSWORD`,
  `PLATEWISE_KEY_ALIAS`, `PLATEWISE_KEY_PASSWORD`; documented in `app/build.gradle` and the build
  script's header; `local.properties`, keystores and build output are git-ignored.

Tests we will write:
- `pnpm android:apk` builds `app-debug.apk`; `aapt dump badging` shows `app.platewise.android`,
  versionName 1.0.0 (from `package.json`), versionCode 1, CAMERA and the health permissions.
- `./gradlew testDebugUnitTest` (P11-02's tests run in the same module).
- The web build, lint, fmt:check, typecheck and `pnpm check --require-ref` stay green with the
  Android files in the tree (and with the build output present).

Compare checklist (filled after the rewrite; compared with the row's Verify column, there is no
reference counterpart to reopen):
- [x] `pnpm android:apk` builds `app-debug.apk` (with `PLATEWISE_MAVEN_MIRROR=1` here): a clean
      build of `android/app/build/outputs/apk/debug/app-debug.apk`, 8,931,474 bytes
- [x] `aapt dump badging`: `package: name='app.platewise.android' versionCode='1'
      versionName='1.0.0'`, sdkVersion 26, targetSdkVersion 35, INTERNET, CAMERA and the eight
      health permissions (ManifestTest checks the source manifest)
- [x] release signing: a throwaway PKCS12 key in the scratchpad gave a release APK that
      `apksigner verify` accepts, versionCode 7 from `PLATEWISE_BUILD_NUMBER=7`; a partial set of
      signing variables and a bad build number stop the build with the messages above
- [x] web build, unit tests and e2e unchanged: no file under `src/` or `e2e/` changed by hand
      (`src/generated/notices.json` is rewritten by `pnpm build`); lint, fmt:check and typecheck
      clean
- [x] `pnpm check --require-ref` green on the tree as committed; with the build output present
      only the two copies of the web build fail it (see Decisions for the lead)
- Deliberate differences: none from the row.
- Not taken: running the APK (no emulator: no KVM in the container); a monochrome (themed) icon
  layer (Android lint suggests one; it needs a one-colour drawing of the mark).

## Decisions for the lead

- `allowBackup="false"` (see above). On Android 12 and up it stops cloud backup but not a
  phone-to-phone transfer, which moves the data to the person's own new phone.
- `PLATEWISE_MAVEN_MIRROR=1` must be set for `pnpm android:apk` in this container.
- The clean-room checks walk the folders `cap sync` and Gradle write into `android/`
  (`android/app/src/main/assets/public` and `android/app/build/intermediates/assets/**`, both copies
  of `dist/`): after a build, `similarity` (22 regions per copy: the Credits page's licence texts,
  the About page's credit) and `banned` (the About page names the inspiration) fail on them, as
  they would on `dist/`, which the checker already skips. Proposed checker change (not made): in
  `tooling/checks/lib/files.ts`, have `isGeneratedProductDir` also skip
  `android/app/src/main/assets/public`, `android/capacitor-cordova-android-plugins`,
  `android/.gradle`, `android/.kotlin` and any `build` folder under `android/`, with the reason
  "copies of dist/ and Gradle output that `cap sync` and Gradle write; git ignores them". An entry in
  `tooling/checks/similarity/allow.json` alone would not do, since `banned` has no allow-list.
- The APK targets API 35 (Capacitor 7's level). Play's yearly target-API rule very likely asks
  for 36 from 31 August 2026 for new apps and updates; check it before any Play release, where
  Capacitor 8 (targetSdk 36) is the usual way up. A sideloaded APK is not affected.
- Untested without a device: the splash and system-bar colours, Android 15's edge-to-edge margins
  (`adjustMarginsForEdgeToEdge: "auto"`), camera capture through the narrowed FileProvider path.
  Web reminders do not fire in the app (Android's WebView has no Notification API).

## Status

Done (2026-10-27, base `614fdb8`): shell, icons, scripts and signing in place; the debug APK builds
and carries the version and permissions. Open for the owner: the first run on a phone. Outside the
task's own files: `eslint.config.js` (one line), and the two generated notices files.
