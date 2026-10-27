# Browser matrix, v1.0

What Platewise was run on before v1.0 (P10-11), and what still needs a person with the device in
hand. Recorded on 2026-10-27 against the build of this slice (base `68a1456`).

## Automated: Playwright projects

`playwright.config.ts` has two Chromium projects that always run and two projects that run only
when asked for:

| Project           | Engine   | Device                                             | Runs                       |
| ----------------- | -------- | -------------------------------------------------- | -------------------------- |
| `mobile-chromium` | Chromium | Pixel 7 (touch, mobile flag)                       | every spec (`pnpm e2e`)    |
| `offline-chromium`| Chromium | Pixel 7, with the service worker allowed           | the `@offline` test of `e2e/settings-data.spec.ts` (P09-19) |
| `mobile-webkit`   | WebKit   | iPhone 13 (touch, mobile flag)                     | the smoke subset: 5 tests  |
| `phone-firefox`   | Firefox  | a Pixel 7-sized window (no mobile mode in Firefox) | the smoke subset: 3 tests  |

```sh
pnpm build
PLATEWISE_E2E_ENGINES=webkit,firefox pnpm exec playwright test --workers=1   # or =all, =webkit
```

Only Chromium is installed in the build container, and installing browsers is not allowed there,
so the two extra projects were listed (`--list`) but not run. On a machine that may install them:
`pnpm exec playwright install webkit firefox`, then the command above.

The smoke subset, picked by test title in the config:

| Test (file > describe > test)                                                                                        | Chromium | WebKit | Firefox |
| -------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------- |
| `e2e/smoke.spec.ts > app shell > loads the product name on a phone viewport`                                        | yes      | yes    | yes     |
| `e2e/walking-skeleton.spec.ts > walking skeleton (Demo 1) > a manual entry lands under its meal, …`                   | yes      | yes    | no (1)  |
| `e2e/home-progress.spec.ts > Progress (Demo 4) > logs a weight for last Tuesday in kg and shows it on the 1M chart, …` | yes      | yes    | no (1)  |
| `e2e/a11y.spec.ts > accessibility checks on the main screens, in both themes (ACC-L9-1) > the Settings list and every Settings page` | yes | yes | yes |
| `e2e/a11y.spec.ts > the keyboard alone > logs a food entered by hand and a weight, with a focus ring at every stop`    | yes      | yes    | yes     |

(1) Those specs set the Pixel 7 profile themselves (the mobile flag included, to match their
parity scenarios), and Playwright's Firefox has no mobile mode. Firefox still logs a food by hand
and a weight in the keyboard walk, whose spec takes its device from the project.

Results here (2026-10-27, Chromium only):

| Project           | Result                                                         |
| ----------------- | -------------------------------------------------------------- |
| `mobile-chromium` | pass: in one run of the whole e2e folder with one worker (47 passed, 1 skipped, of 48), 46 passed and 1 skipped (the `@offline` test, which runs in `offline-chromium` instead), the five smoke tests among them; `e2e/a11y.spec.ts` 18/18 with `--repeat-each=2` |
| `offline-chromium` | pass: 1/1, in the same run                                     |
| `mobile-webkit`   | not run here: WebKit is not installed in the container         |
| `phone-firefox`   | not run here: Firefox is not installed in the container        |

## Manual checks on real devices

None of these can be done in the container (no phone, no desktop browser with a screen). Each row
says what the code does, so the person checking knows what to expect; the result and the date are
filled in by whoever runs it. "Open" means not checked yet: the lead lists these on the release
checklist (P10-14).

What to expect, by feature:

- **Install.** Chromium browsers fire `beforeinstallprompt`: the install card offers Install
  (`src/app/InstallPrompt.tsx`). Safari on iPhone and iPad gets the card with the Share → Add to
  Home Screen steps instead. Desktop Safari (Add to Dock) and Firefox show no card. The installed
  app opens standalone with the dark page colour and the icons of `public/manifest.webmanifest`.
- **Offline.** After the first visit the service worker (`sw.js`) holds the app shell: a reload
  with the network off opens the app on the stored `index.html`; AI and food-database requests are
  never cached and fail with their normal messages. On Chromium this is automated:
  `e2e/settings-data.spec.ts > … > reloads with the network off from the service worker, and an AI
  request offline says so (ACC-L2-1, R03.2)` in the `offline-chromium` project.
- **HEIC photos.** A photo is decoded by the browser (`src/lib/imageCodec.ts`). Safari decodes
  HEIC; where the browser cannot, the photo is refused with "This browser can't open one of these
  photos (HEIC photos open in Safari)…" and nothing is added (D-16.21). On iPhone the photo picker
  usually hands over a JPEG anyway.
- **Barcode.** The browser's `BarcodeDetector` reads the camera frames where it exists with our
  formats (Chrome on Android and macOS); everywhere else the zxing WASM reader loads on the first
  scan (`src/services/barcode/decoder.ts`, D-16.18). Typed digits work everywhere.
- **Notifications.** Reminders are shown by the page's own timers through the service worker's
  `showNotification` once permission is granted, and as in-app banners otherwise
  (`src/services/reminders/notifier.ts`). On iPhone and iPad, Safari offers notifications only to
  the installed app (iOS 16.4 and later). Nothing is pushed from a server: a reminder shows only
  while the app is open or kept alive by the browser.
- **Storage persistence.** The app asks once, after the first logged entry
  (`src/services/storageNudge.ts` through `src/data/storage.ts`); Settings › Your data shows the
  answer ("Kept by the browser": Yes, Not guaranteed or unknown), and Home's keep-safe card
  suggests installing while it is not kept. Safari
  may evict a site's data after seven days without a visit unless it is installed.

| Feature                 | iOS Safari, in the browser | iOS Safari, installed | Android Chrome | Desktop Chrome | Desktop Firefox | Desktop Safari |
| ----------------------- | -------------------------- | --------------------- | -------------- | -------------- | --------------- | -------------- |
| Install                 | Open                       | Open                  | Open           | Open           | Open            | Open           |
| Offline (reload, no network) | Open                  | Open                  | Open           | Open           | Open            | Open           |
| HEIC photo              | Open                       | Open                  | Open           | Open           | Open            | Open           |
| Barcode (which reader)  | Open                       | Open                  | Open           | Open           | Open            | Open           |
| Notifications           | n/a (installed only)       | Open                  | Open           | Open           | Open            | Open           |
| Storage persistence     | Open                       | Open                  | Open           | Open           | Open            | Open           |

Record each check as `pass` / `fail` with the date, the device and the browser version, e.g.
`pass 2026-11-02 (iPhone 15, iOS 19.1)`.

## Measured here, as a pointer only

Headless Chromium in the container (Linux, no camera, no screen) is not one of the targets above,
but it answers some of the same questions. Measured with a throwaway Playwright script against
`vite preview` (not kept):

| Question                         | Headless Chromium 153 (Linux, Pixel 7 profile), 2026-10-27                       |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Offline                          | pass: the worker took control after the first load; with the network off a reload showed the wizard, no page error |
| Barcode reader                   | no `BarcodeDetector` here, so a scan would load the WASM reader (desktop Linux Chrome has none either) |
| Notifications                    | permission `denied` (headless refuses by default): reminders would use the in-app banner |
| Storage persistence              | `persisted()` false, `persist()` answered false (a fresh, uninstalled profile): Settings would say best-effort |
| HEIC                             | not measured: there is no HEIC sample in the repository                          |
| Install                          | not measurable headless (no install surface)                                     |

These are not substitutes for the rows above: a real phone has a camera, an install surface and
its own storage policy.
