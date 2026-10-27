# Task: browser matrix (P10-11) · Phase: 10 · Owner: builder (wt-p10s3)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row says none: the reference is a native app and has no
browser matrix. Read instead: `playwright.config.ts`, the e2e specs (`smoke`, `walking-skeleton`,
`home-progress`, `logging`, `coach`) for which tests make a smoke subset, D-16.18 (barcode:
`BarcodeDetector`, else the lazy WASM decoder), D-16.21 (HEIC through the browser, else refused),
`src/services/barcode/*` (decoder choice), `src/features/log/capture/*` (photo decode),
`src/sw/sw.ts` and `src/app/InstallPrompt.tsx` (install and offline), `src/data/storage.ts`
(persistence), `src/services/reminders/*` (notifications).

What it does (own words): adds Playwright projects for WebKit and Firefox next to the mobile
Chromium one, each running a small smoke subset (the shell loads, the walking skeleton with its
manual log, Progress, and Settings), and writes `docs/internals/browser-matrix-v1.0.md` with what
was run in this container and what needs a person with real devices: iOS Safari in the browser
and installed, Android Chrome, desktop Chrome, Firefox and Safari, for install, offline, HEIC
photos, barcode (native detector or WASM), notifications in an installed app, and whether storage
is persistent.

Inputs → outputs: `PLATEWISE_E2E_ENGINES=webkit,firefox` (or `all`) → the extra projects run their
smoke subset; without it only mobile Chromium runs, as today. → the matrix page.

Files: changed `playwright.config.ts` (shared with every spec; the default project list is
unchanged); created `docs/internals/browser-matrix-v1.0.md`, this note.

Edge cases / failure modes:
- Only Chromium is installed here, so the WebKit and Firefox projects cannot run in this
  container; they are off unless the variable asks for them, so `pnpm e2e` is unchanged. The
  matrix says "not run here" for them, with the command to run them.
- Playwright's Firefox has no mobile mode (`isMobile` is refused), so its project is a
  Pixel 7-sized window without the mobile flags; WebKit takes the iPhone 13 profile.
- The walking-skeleton and home-progress specs set the whole Pixel 7 profile themselves (the mobile
  flag included, to match their parity scenarios). A file's `test.use` outranks the project, so
  on Firefox those two tests would fail before they start: they are in WebKit's subset only.
  Their `defaultBrowserType` does not leak, as each extra project names its own browser.
- The a11y spec takes its device from the project instead, so its keyboard walk (a manual entry
  and a weight) and its Settings scan run on all three engines; on mobile Chromium the project's
  Pixel 7 gives it the same device as before.
- `page.clock`, `routeFoodDatabases` and `addInitScript` are engine-neutral Playwright features.
- A manual row without a person to run it stays "Open" with no date; the row asks for a result
  and a date, so those rows are listed for the lead as open.

Our design differences / decisions:
- The gate variable is `PLATEWISE_E2E_ENGINES` (a comma list: `webkit`, `firefox`, or `all`),
  read in `playwright.config.ts` only. Projects `mobile-webkit` (iPhone 13) and `phone-firefox`.
- The smoke subset is chosen by test title in the config (`grep`), so no other spec changes: the
  shell smoke, Settings and every Settings page, the keyboard walk (manual log and weight) on all
  three; the walking skeleton (manual log) and Log weight on Progress on WebKit as well.
- A throwaway probe in headless Chromium answers some of the manual questions (offline reload,
  barcode reader choice, notification permission, persistence answer) as a pointer; it is not a
  device result.

Tests we will write: none new for the matrix; the projects reuse existing tests. The config is
checked by `pnpm exec playwright test --list` with and without the variable.

Compare checklist (filled after the rewrite; no reference to reopen; compared with the row's
Verify column instead):
- [x] WebKit and Firefox projects for the smoke subset, off by default (`playwright.config.ts`;
      `pnpm exec playwright test --list` on base `68a1456`: 48 tests (47 on `mobile-chromium`, 1
      on P09-19's `offline-chromium`); with `PLATEWISE_E2E_ENGINES=webkit,firefox` 56, of which 5
      on `mobile-webkit` and 3 on `phone-firefox`)
- [x] the smoke subset passes on Chromium here (inside the whole e2e folder: 47 passed, 1 skipped
      by design, of 48); WebKit and
      Firefox recorded as not run here (not installed; installing is not allowed in the container)
- [ ] every manual row has a result and a date: open, listed for the lead (no devices here); the
      matrix gives what to expect per row and a headless Chromium probe as a pointer
- Deliberate differences: none.
- Not taken: running WebKit and Firefox (no browsers here); the manual device checks.

## Decisions for the lead

- `PLATEWISE_E2E_ENGINES` gates the extra projects; nothing changes for `pnpm e2e` or CI.
- On a machine with the browsers: `pnpm exec playwright install webkit firefox`, `pnpm build`,
  `PLATEWISE_E2E_ENGINES=all pnpm exec playwright test --workers=1`. The WebKit run is the first
  real test of the keyboard walk there: Safari moves Tab through links and buttons only when
  "Press Tab to highlight each item" is on, and Playwright's WebKit may behave differently from
  the Safari on a phone.
- The manual rows of `docs/internals/browser-matrix-v1.0.md` are open; P10-14's release
  checklist should carry them until someone with the devices fills them in.

## Status

Done as far as this container allows (2026-10-27, base `68a1456`): projects and subset in place and listed, the
Chromium run green, the matrix written. Open: the WebKit and Firefox runs and every manual device
row (no browsers, no devices here). Outside the task's files: none besides `playwright.config.ts`,
which the task names.
