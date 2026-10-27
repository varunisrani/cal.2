# Release checklist, v1.0 (P10-14)

Every gate of the P10 goal, with the command, its result and the date. Rows marked "here" were run
on 2026-10-27 in the P10-14 worktree: `77c587f` with this slice uncommitted on top (version 1.0.0,
the notices change, `CHANGELOG.md`), reference at `/root/reference/fud-ai`, pinned
`10e14b67116c52b515d2389621266e32b3a99840`. A builder may not run the full unit or e2e suites, so
those rows give the lead's last full loop and wait for the release commit's. Task note:
`docs/notes/P10/release-prep.md`.

Rows that depended on the accessibility, ship-inventory and browser-matrix slice (P10-07/08/11)
were filled by the lead from the full loop on `73aedfb`, where that slice landed.

## Gates

| # | Gate | Command | Result | Date, where |
|---|---|---|---|---|
| 1 | Lint | `pnpm lint` | Clean (exit 0) | 2026-10-27, here |
| 2 | Formatting | `pnpm fmt:check` | Clean: "All matched files use Prettier code style!" | 2026-10-27, here |
| 3 | Types | `pnpm typecheck` | Clean (exit 0) | 2026-10-27, here |
| 4 | Unit tests | `pnpm test` | Last full run: **5 143 passed + 2 expected-fail in 363 files** (lead's loop for `77c587f`). This slice adds 9 tests to `scripts/notices.test.ts` (31/31 here, with `--maxWorkers=1`), and `src/features/about/{AboutPage,CreditsPage}.test.tsx` pass on 1.0.0 (19/19 here). Lead, from the full loop on `73aedfb` (P10-07/08/11 landed; the release commit's own loop is in its commit message): **5 145 passed + 2 expected-fail in 363 files** | 2026-10-27, lead's loop; targeted runs here |
| 5 | Clean-room guards | `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref` | **6/6 PASS**: similarity 1 239 product files under every gate; banned 0 findings (24 patterns, `CHANGELOG.md` included); assets 8, none identical; licences 8 production packages, all allowed; traps 162 covered; acceptance 152 P0/P1 features covered (2 `Review:` lines left) | 2026-10-27, here |
| 6 | Acceptance, strict | `PLATEWISE_REF=/root/reference/fud-ai pnpm check:acceptance --strict` | Lead, from the full loop on `73aedfb` (P10-07/08/11 landed; the release commit's own loop is in its commit message): **green** (`check --require-ref --strict` 6/6). Before that slice: fails only on ACC-L6-2 and ACC-L9-1 (covered by review only), as expected. The lead's loop with P10-07/08/11 applied (`6a678e4`): `pnpm check --require-ref --strict` green, ACC-L6-2 → `e2e/hosts.spec.ts`, ACC-L9-1 → `e2e/a11y.spec.ts` | 2026-10-27, here and lead's loop |
| 7 | Traps | `pnpm check:traps` | PASS: 162 declared traps covered | 2026-10-27, here |
| 8 | v1 trap rows without a test | `pnpm ledger:gaps` | None: "162 rows, 26 kept for later owners" (exit 0) | 2026-10-27, here |
| 9 | Build | `pnpm build` | OK (exit 0). Leaves the tree as it was (the notices plugin found both files up to date); `dist/` ships only zxing-wasm's reader (`zxing_reader-*.wasm`) and carries `1.0.0` as the version | 2026-10-27, here |
| 10 | Bundle budget | `pnpm check:bundle` | PASS: initial JS **235.86 kB gzip of 250 kB** (14.14 kB under). The lead's loop with P10-07/08/11 applied: 235.6 kB | 2026-10-27, here and lead's loop |
| 11 | Browser tests | `pnpm build && pnpm e2e` | Lead, from the full loop on `73aedfb` (P10-07/08/11 landed; the release commit's own loop is in its commit message): **47 passed + 1 skipped by design**. Before that slice: 37 passed in `mobile-chromium` and `offline-chromium` (the offline test is skipped by design in `mobile-chromium`). The lead's loop with it applied (`6a678e4`): **47 passed + 1 skipped by design** | 2026-10-27, lead's loop |
| 12 | Accessibility | `pnpm exec playwright test e2e/a11y.spec.ts` | Lead, from the full loop on `73aedfb` (P10-07/08/11 landed; the release commit's own loop is in its commit message): the spec passes inside the 47. The lead's loop on `6a678e4`: axe with the WCAG 2.0/2.1/2.2 A and AA rules plus best practices on the main screens in both themes, serious and critical findings fail; **20/20 over two repeats** together with `e2e/hosts.spec.ts`. Moderate findings left: a Coach reply's Markdown `##` drawn as `h4` with no `h2`/`h3` above it (heading order); accent text on the accent wash is not in the contrast sweep (both in `CHANGELOG.md` Known issues) | 2026-10-27, lead's loop |
| 13 | Browser matrix | `PLATEWISE_E2E_ENGINES=webkit,firefox pnpm e2e`, manual rows in `docs/internals/browser-matrix-v1.0.md` | Lead, from the full loop on `73aedfb` (P10-07/08/11 landed; the release commit's own loop is in its commit message): Chromium projects pass. **Open:** the WebKit and Firefox projects exist behind `PLATEWISE_E2E_ENGINES=webkit,firefox` but were not run (those browsers are not installed in this container); every manual device row (iOS Safari installed and not, Android Chrome, desktop Chrome, Firefox and Safari) is open | 2026-10-27, lead's note |
| 14 | Parity | `pnpm parity` | **14/14 flows pass**; 74 claims, 70 verified and 4 blocked; no unclassified divergence; one bug fixed with a failing-first test, two new intended differences (D-16.86, D-16.87). Report: [parity-report-v1.0.md](parity-report-v1.0.md) | 2026-10-27, P10 slice S1 |
| 15 | Security review | [security-review-v1.0.md](security-review-v1.0.md) | No high or critical finding open. Fixed: S-1, S-2, S-3, S-5 to S-9, S-12, S-15; accepted with reasons: S-10, S-11, S-13, S-14. **Open: S-4**, see "Hosting headers" below | 2026-10-27, P10-09 and the S6 follow-up (`77c587f`) |
| 16 | Similarity | `PLATEWISE_REF=/root/reference/fud-ai pnpm check --only similarity --closest 30`, report [similarity-report-v1.0.md](similarity-report-v1.0.md) | PASS, no gate fired. Run here: the closest region is now **1.08**, in the report itself (`docs/internals/similarity-report-v1.0.md:117`, a table row quoting `index.html`'s viewport `<meta>`, which the reference's web pages share); every other region is at or below 0.92, and neither `CHANGELOG.md` nor this checklist is among the 30 closest. The report's "every region below 1.00" was measured before the report existed: for the lead (shorten that quote, or record it) | 2026-10-27, here |
| 17 | Live provider check | `PLATEWISE_LIVE=1 pnpm exec tsx scripts/ai-live-check.ts` (keys through `PLATEWISE_PROBE_KEY_<ID>`) | **Skipped: no keys.** Nothing was sent to a vendor; D-04.1 not re-checked live; presets and their date unchanged. Report: [provider-check-v1.0.md](provider-check-v1.0.md) | 2026-10-27, P10-12 |
| 18 | User docs | `docs/user/` | Written (P10-13, `ec065f0`): `getting-started.md`, `ai-keys.md`, `logging-tips.md`, `coach.md`, `privacy-and-storage.md`, `backup.md`; similarity and banned checks cover them (row 5). About links none of them yet: every address in `src/config/links.ts` is `null` until the owner supplies it (D-16.66), and a `null` link is not shown | 2026-10-27, here (row 5) |
| 19 | Notices | `pnpm exec tsx scripts/notices.ts --check` | "src/generated/notices.json and THIRD_PARTY_NOTICES.md are up to date" (exit 0). Both list zxing-cpp (Apache-2.0) and zint (BSD-3-Clause), bundled in zxing-wasm 3.1.5, without licence texts: the package ships neither | 2026-10-27, here |
| 20 | Dependency audit | `pnpm audit --audit-level high` | "No known vulnerabilities found" (exit 0) | 2026-10-27, here |

## 1.1.0 (2026-10-28): the Android app, the orange look, kg only, the Coach and reminders

P11 (`docs/plan/phases/P11-android-and-health-connect.md`, D-16.89) adds the Android app and
Health Connect; P12 the orange redesign (D-16.90); P13 kg only, the Coach with Health Connect and
reminders, and reminders as Android notifications (D-16.91..94). `CHANGELOG.md` describes 1.1.0 and
[docs/user/android.md](../user/android.md) is its user page. 1.1.0 is released as a version in the repository and an APK sent to the owner; nothing is tagged
or uploaded unless the owner asks. These rows say what was proved on a computer and what waits for a phone: the container
has no KVM, so no emulator, and no row runs the app. Rows marked "here" were run on 2026-10-27 in
the P11-05 worktree (`cbc7a27`, P11-01..04, with this slice uncommitted on top), with
`ANDROID_HOME` pointing at a local SDK (platform `android-36`), JDK 21 and
`PLATEWISE_MAVEN_MIRROR=1` (Maven Central throttles this machine).

| # | Gate | Command | Result | Date, where |
|---|---|---|---|---|
| A1 | Debug APK | `pnpm android:apk` | OK (exit 0): `android/app/build/outputs/apk/debug/app-debug.apk`, **9 007 790 bytes** (8.6 MB), signed with this machine's debug key. `aapt dump badging`: package `app.platewise.android`, versionCode 1, versionName `1.0.0` (from `package.json`, which moves to 1.1.0 at the release), minSdk 26, targetSdk 35; permissions INTERNET, CAMERA, the six Health Connect reads (steps, active and total calories, distance, exercise, weight) and the two writes (nutrition, weight). The P11-01 build on `614fdb8`, before the health UI, was 8 931 474 bytes | 2026-10-27, here |
| A2 | JVM unit tests | `cd android && ./gradlew testDebugUnitTest` | **62 passed** in 7 classes, 0 failures, 0 skipped (`android/app/build/test-results/testDebugUnitTest`): the plugin's contract (read from the phase file), the manifest, kinds, day keys, rows, writes and failures. They run on the JVM; none calls a real Health Connect | 2026-10-27, here |
| A3 | Release signing | `pnpm android:apk --release` with `PLATEWISE_KEYSTORE`, `PLATEWISE_KEYSTORE_PASSWORD`, `PLATEWISE_KEY_ALIAS`, `PLATEWISE_KEY_PASSWORD` | Proved with a throwaway PKCS12 key kept outside the repository: `apksigner verify` accepts the release APK, which carries versionCode 7 from `PLATEWISE_BUILD_NUMBER=7`; a partial set of the four variables and a bad build number stop the build with a message naming them ([P11-01 note](../notes/P11/android-shell.md)). The owner's real key has not been used: a release for others needs it | 2026-10-27, P11-01 (`wt-p11s1`) |
| A4 | Device test | Install the debug APK on the owner's phone: open it, set up or restore from a backup, log a meal by photo and by barcode (camera through the app's file provider), back up; look at the splash and system-bar colours and, on Android 15, the edge-to-edge margins | **Open** (the owner's first device run) | — |
| A5 | Health Connect permission flow | On Android 13 (Health Connect from Google Play) and on Android 14 or newer (built in): Connect with some kinds allowed and some not, the privacy note from Health Connect's screen, a sync on return to the app, "goal + N burned" on Home, write-back on and off, access removed in Health Connect and Grant access | **Open** (the owner, on a phone of each kind) | — |
| A6 | Release loop | `PLATEWISE_REF=/root/reference/fud-ai bash scripts/ci-local.sh` on the stack that landed as 1570597, b3d85bd and e94f7a7 | **ci=0**: lint, fmt, typecheck clean; unit **5 523 passed + 2 expected-fail in 388 files**; `check --require-ref --strict` 6/6; build ok; check:bundle **240.35 kB** of 250; e2e **49 passed + 1 skipped by design** (axe in both themes inside) | 2026-10-28, lead's loop |
| A7 | 1.1.0 APK | `PLATEWISE_BUILD_NUMBER=2 PLATEWISE_MAVEN_MIRROR=1 pnpm android:apk` at e94f7a7 | OK: debug APK **9 097 419 bytes**, sha256 `96a91b641160b00e7300bde995c6bc05337a3fc1f2d04d07c95e88e919cf2e29`; `aapt dump badging`: `app.platewise.android` versionName **1.1.0**, versionCode **2**, minSdk 26, targetSdk 35, 14 permissions (INTERNET, CAMERA, the 8 health permissions, POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK and androidx's receiver permission); signed with the same debug key as 1.0.0's APK, so it installs over it. Sent to the owner | 2026-10-28, lead |
| A8 | Notifications on a device | Install 1.1.0, turn reminders on (Android 13+ asks), add one of your own and one through the Coach, close the app; restart the phone; check each arrives and a tap opens Home | **Open: the owner's phone** | — |

## Release files

| File | State |
|---|---|
| `package.json` | `"version": "1.0.0"`. About shows it (`APP_VERSION` from `vite.config.ts`; `src/features/about/AboutPage.test.tsx` compares it with `package.json`); new backups record it as their `appVersion` |
| `CHANGELOG.md` | The 1.0.0 entry, Known issues, and the pointer to `docs/plan/16-what-we-change.md` |
| `THIRD_PARTY_NOTICES.md` | The credit (by hand) and the runtime dependency list (written by `scripts/notices.ts`, also on every build) |
| `src/generated/notices.json` | The Credits page's list, with zxing-cpp and zint |
| `docs/HANDOFF.md` | The lead's, at the release commit |

## Hosting headers (S-4)

A meta CSP cannot carry `frame-ancestors`, `report-to` or `sandbox`, and the static files send no
security headers of their own. When a host is chosen, have it send on every response:

```
Content-Security-Policy: frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

`X-Frame-Options: DENY` can stand in for the `frame-ancestors` header on old browsers. Keep the
CSP in `index.html` as it is: a second policy from a header only narrows what the page may do, so
the header needs nothing but `frame-ancestors`. Serve the app over https only (backups, restores
and the service worker need it). Record the host and the headers here, then mark S-4 fixed in the
security review.

## Release steps

1. **The release commit** is the one that lands P10-14 after P10-07/08/11, on the work branch. On
   that head run the full loop (`PLATEWISE_REF=/root/reference/fud-ai bash scripts/ci-local.sh`)
   and then `PLATEWISE_REF=/root/reference/fud-ai pnpm check --require-ref --strict`,
   `pnpm ledger:gaps`, `pnpm exec tsx scripts/notices.ts --check` and
   `pnpm audit --audit-level high`; fill every "pending" row above with that run's numbers and
   date, and the commit's `Verified:` line with the same.
2. Update `docs/HANDOFF.md` to the state at release (the lead).
3. **Tags, GitHub releases and pull requests only when the user asks.** When asked: tag the release
   commit `v1.0.0` and use the 1.0.0 entry of `CHANGELOG.md` as the release notes.
4. **`main` is fast-forwarded only when the user says so**; never force-pushed.
5. Still open after the release commit, each for the user or a later task: S-4 (above, when a host
   is chosen); the browser matrix's WebKit and Firefox runs and its manual device rows; the live
   provider check, when keys are supplied; Platewise's own addresses (`src/config/links.ts`: site,
   help, contact, source, release notes, privacy, terms) and the OpenRouter attribution address
   (`ATTRIBUTION_URL` in `src/ai/adapters/openaiCompat.ts`); whether to vendor the zxing-cpp and
   zint licence texts (their projects publish them; the installed package does not).
