# Task: docs, ledgers and the Android app's notices (P11-05) · Phase: 11 · Owner: builder (wt-p11s3, slice S3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row's "Read in reference" column says none: user docs, a
changelog entry, naming rows, a checklist and licence notices for our own APK have no counterpart
in the reference. The reference names in the new naming rows come from the research specs
(`01-profile-goals.md`, `06-settings-data.md`, `07-later-phases-and-web.md` §3.7) and the P11
notes, not from the reference itself. Read instead: the P11 phase file (Goal, Decisions, the
P11-05 row); the four P11 notes (`android-shell`, `health-connect-plugin`, `health-service`,
`health-ui`); `docs/plan/17-naming-and-glossary.md` §1.1–1.6; `CHANGELOG.md`;
`docs/internals/release-checklist-v1.0.md`; `docs/user/*.md`; `THIRD_PARTY_NOTICES.md`,
`scripts/notices.ts` and its test; `src/features/about/CreditsPage.tsx` and its test;
`src/services/health/platform.ts`; the health UI words (`src/i18n/en/health.ts`), the health
service (`service.ts`, `records.ts`), the settings schema and backup lists (to describe them
right); `src/services/reminders/notifier.ts` and the reminders settings section (what happens
without a Notification API); `android/app/build.gradle`, `android/variables.gradle`,
`android/build.gradle`, `scripts/android/build-apk.sh`; Gradle's resolved
`debugRuntimeClasspath` and `releaseRuntimeClasspath` of `:app` (identical) and the POMs and jars
of each library in the Gradle cache (licence, project page, shipped licence files).

What it does (own words):
- `docs/user/android.md`: a user page for the Android app: what it is (the same Platewise in an
  Android shell, with its own storage), installing the APK (debug builds signed with the build
  machine's debug key; allow installs from the app that opens the file; Play Protect may warn; a
  release build needs the owner's key), Health Connect (what it is, which Android versions have
  it, Settings › Health Connect, Connect and what each permission is for, the three switches and
  their defaults, Sync now, the "goal + N burned" line, write-back, Disconnect against removing
  access in Health Connect), privacy (nothing leaves the phone for health data; Android's cloud
  backup is off; Platewise backups leave the activity copy out) and limits (no reminders in the
  app; no device run yet). One line in `getting-started.md` links it.
- `17-naming-and-glossary.md`: the app id, the plugin name, the `activity` table, the three `meta`
  keys and the four `health.*` settings, in the tables' own format.
- `CHANGELOG.md`: an "Unreleased (1.1.0)" entry above 1.0.0, grouped like 1.0.0, with Known
  issues.
- `release-checklist-v1.0.md`: a section for the Android app after 1.0, with the APK build, the
  JVM tests, release signing, and the two device rows left open for the owner.
- Licence notices of the APK: the libraries Gradle packs into the APK besides the web build
  (Capacitor's Android library, the Cordova framework it carries, AndroidX with the Health
  Connect client, Kotlin and its coroutines, Guava and the annotation jars it pulls in) as a
  hand-kept table in `scripts/notices.ts`, written as an "## Android app" section of
  `THIRD_PARTY_NOTICES.md` and an `android` list in `src/generated/notices.json`, with the
  standard texts of the three licences (Apache-2.0, BSD-3-Clause, MIT) once each, read from
  `scripts/licenses/`. The MIT and BSD licences ask that each copyright notice travels with the
  text, so those entries carry their copyright line. The Credits page adds the Android list to its
  package list only inside the Android app.

Inputs → outputs: the table and `scripts/licenses/*.txt` → `notices.json` (`android`,
`licenseTexts`) and the "## Android app" section; the P11 notes, the code and the Gradle report →
the docs.

Files: created `docs/user/android.md`, `scripts/licenses/{Apache-2.0,BSD-3-Clause,MIT}.txt`,
this note. Changed `docs/user/getting-started.md` (one line), `docs/plan/17-naming-and-glossary.md`,
`CHANGELOG.md`, `docs/internals/release-checklist-v1.0.md`, `scripts/notices.ts`,
`scripts/notices.test.ts`, `THIRD_PARTY_NOTICES.md` and `src/generated/notices.json` (both
generated), `src/features/about/CreditsPage.tsx` and its test.

Edge cases / failure modes:
- The table drifts from Gradle: a version bump in `android/variables.gradle` or
  `android/build.gradle` (Kotlin) changes what the APK carries. A test compares every version
  `android/` pins with the table, and the entry for Capacitor's Android library must match the
  installed `@capacitor/android` (the script refuses otherwise, as it does for zxing-wasm's
  bundled code). Transitive versions (Guava, the lifecycle libraries) can only be re-read from
  Gradle's report: the table's comment names the command.
- A licence the table names without a text file under `scripts/licenses/`: the script stops
  (exit 2) instead of writing an entry without its licence.
- An MIT or BSD entry without its copyright line: a test refuses it.
- The licence texts reach the similarity check (`.txt` is scanned): the MIT text matches the
  reference's own licence file. Generated copies are already allow-listed; the source files need
  one allow-list entry with a reason (`tooling/checks/similarity/allow.json`, outside my files,
  reported).
- The web Credits page must not change and the web start-up size must not grow: the list is read
  by the Credits page only, which is its own lazy chunk; its rows show only when
  `isHealthAvailable()`.
- Health data docs must say what the code does, not what the plan hoped: total calories and
  distance are read and stored but no screen shows them yet; write-back covers the last 30 days;
  an older entry is forgotten, not deleted, from Health Connect; reminders cannot be switched on
  in the app (the WebView has no Notification API, so the switch is disabled).

Our design differences / decisions:
- No new UI words: the Android libraries join the existing "Open-source packages" list (same row
  shape, same intro), which needs no new catalogue strings (`src/i18n/**` is not mine). A card of
  its own would need a heading and an intro in `src/i18n/en/about.ts`.
- Each Android row's licence text is its copyright line (MIT and BSD entries) over the standard
  text, put together on the page from the list and the three texts; the JSON keeps each text once.
- One row per resolved Maven module (58) plus Capacitor's Android library, so the list matches
  Gradle's report line for line; the two BOMs (`kotlin-bom`, `kotlinx-coroutines-bom`) are
  constraints with no code and are left out, and so is Capacitor's generated
  `capacitor-cordova-android-plugins` module (an empty module from Capacitor's template).
- Licence texts: the SPDX License List's plain-text files, release `v3.29.0`
  (`https://raw.githubusercontent.com/spdx/license-list-data/v3.29.0/text/<id>.txt`), byte for
  byte, placeholders and all.
- jsr305 3.0.2 is listed as BSD-3-Clause, as the JSR 305 project published it (its reference
  implementation's LICENSE and the project page say BSD); its Maven POM says Apache-2.0. Decision
  for the lead.
- Copyright lines: Capacitor's from `@capacitor/android`'s LICENSE; checker-qual's from the jar's
  `META-INF/LICENSE.txt`; protobuf's from the protobuf project's LICENSE (the jar ships the BSD
  text without its first line); jsr305's from the JSR 305 reference implementation's LICENSE.

Tests we will write:
- `scripts/notices.test.ts`: the table is sorted, without duplicates, with https pages and a
  licence text for every licence it names; MIT and BSD rows carry a copyright line; every version
  `android/` pins matches the table, and Capacitor's matches the installed package; the section
  lists every row on one line and names the texts once; the JSON keeps each text once; a table
  naming a licence without a text, or a Capacitor entry at another version, stops the script;
  `--check` calls a stale Android section stale; the committed files match.
- `src/features/about/CreditsPage.test.tsx`: the web page lists only the web packages; inside the
  Android app the Android rows follow them, each with its licence text and copyright line.

Compare checklist (filled after the rewrite; compared with the row's Verify column and the
prompt, there is no reference counterpart to reopen):
- [x] the row's docs: `docs/user/android.md` (linked from `getting-started.md`), CHANGELOG
      "Unreleased (1.1.0)" above 1.0.0, the release checklist's "After 1.0: Android app" rows A1–A5
      (APK 9 007 790 bytes and 62 JVM tests, both run here; A4 and A5 open for the owner)
- [x] naming rows: 17 §1.1 (app id), §1.2 (schema version 2, `activity`, the three `meta` keys),
      §1.3 (the four `health.*` settings), §1.6 (the `HealthConnect` plugin)
- [x] the table: sorted, unique, https pages, allowed licences with a text each, copyright lines
      for MIT and BSD (`scripts/notices.test.ts > the Android app's libraries (P11-05) > keeps one
      sorted row per library, each with an https page, an allowed licence and its text`); the
      versions `android/` pins and the installed `@capacitor/android` (`> names the versions
      android/ pins, and the installed Capacitor Android library`); also cross-checked by hand
      against the built APK's `META-INF/*.version` files (every one matches)
- [x] the texts once each, unchanged (`> lists the libraries by name and each licence text once,
      as SPDX writes it`); the section's lines (`> writes one line per library: name, version,
      licence, project page and copyright line`); refusals (`> refuses a licence without a text,
      and a Capacitor entry at another version than installed`); `--check` covers both files
      (`main > checks the Android app's table it is given, in both files`); the committed files
      (`the notices file > the committed THIRD_PARTY_NOTICES.md matches …`, `> matches the
      installed packages as committed …`)
- [x] the Credits page: Android rows after the packages, each with its text
      (`CreditsPage.test.tsx > CreditsPage in the Android app (P11-05) > lists the libraries of its
      APK after the packages, each with its licence text`, `> puts the copyright line over the
      standard text where the licence asks for one`); none on the web (`> shows none of them on the
      web`, and the existing web tests unchanged)
- [x] `check --require-ref --strict` 6/6 PASS; `notices.ts --check` up to date; `pnpm build` OK;
      `pnpm check:bundle` PASS, initial JS 237.50 kB gzip (237.51 kB before this slice): the list
      sits only in the lazy Credits chunk (31.81 → 55.21 kB raw, 8.46 → 13.52 kB gzip)
- Deliberate differences: none from the row. The Android libraries join the existing package list
  instead of a card of their own (no new UI words).
- Not taken: acceptance rows and D-16.89 (already in `acceptance-map.md` and
  `16-what-we-change.md`, the lead's).

## Decisions for the lead

- jsr305 3.0.2 is listed as BSD-3-Clause (the JSR 305 project and its reference implementation's
  LICENSE); its Maven POM says Apache-2.0. Both texts are in the list anyway.
- The licence texts need a similarity allow-list entry (`scripts/licenses/*.txt` in
  `tooling/checks/similarity/allow.json`, with its reason): the reference quotes the same standard
  texts. One entry added; it is outside this task's files.
- A separate "Android app" card on the Credits page would need a heading and an intro in
  `src/i18n/en/about.ts`; the rows join the existing list instead.

## Follow-ups found (not fixed, not my files)

- Total calories burned and distance are read and stored but no screen shows them, while the
  phase's budget rule says total burn and steps "are shown". The user page and the changelog say
  so as it is.
- Write-back sends an entry at its own time; the plugin refuses a record in the future
  (`invalidInput`) for the whole `writeNutrition` call. If an entry's time can be later than now
  (a time picked later today), every pass would fail until that time passes. Not checked in the
  UI; clamping to `min(time, now)` or skipping future entries would close it.
- In the Android app, the reminders copy says adding Platewise to the home screen may make
  notifications available, which is not so inside the APK.

## Status

Done (2026-10-27). Docs, naming rows, CHANGELOG 1.1.0, release checklist rows, the Android
licence notices with their tests, and the Credits page's Android rows. Outside the task's own
files: `tooling/checks/similarity/allow.json` (one entry). Handed to the owner: rows A4 and A5 of
the release checklist.
