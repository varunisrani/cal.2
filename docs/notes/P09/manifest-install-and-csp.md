# Task: manifest, install prompt and CSP (P09-18) · Phase: 09 · Owner: builder (wt-p09s17)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none, on purpose: the row names no reference file (native apps
have no web manifest, install prompt or CSP), and the reference's icons stay closed (P00-04).
Sources: research spec `06-settings-data.md` §3.7 and §5 (quick actions become static manifest
shortcuts; manifest icons are static), `03-feature-inventory.md` L1, L6, L8, `04-architecture.md`
§6 (privacy: no analytics, third-party scripts or CDN fonts), D-16.3, D-16.8; acceptance ids
ACC-L1-1, ACC-L1-2, ACC-L6-1. Web platform behaviour from the Web App Manifest spec, MDN
(`beforeinstallprompt`, `display-mode`, CSP directives and their fallbacks) and Apple's notes on
Add to Home Screen.

What it does (own words): three pieces make Platewise an installable, locked-down web app.
`public/manifest.webmanifest` tells browsers what the installed app is: its name, our own icons
(two "any" sizes and a maskable one), the dark page colour for the title bar and splash, a
standalone window, the folder it lives in, a stable id, and three launcher shortcuts (Camera,
Describe, Scan). `InstallPrompt.tsx` offers the install once in a while: where the browser offers
`beforeinstallprompt`, Platewise keeps that event and shows a small card with Install and Not now;
on iPhone and iPad Safari, which has no such event, the card explains Share → Add to Home Screen.
Either card shows at most once in seven days on a device, never in the installed app, and goes
away for good once the app is installed. `index.html` links the manifest, keeps the theme colour,
and carries a Content Security Policy that only lets our own scripts and styles run, images come
from us, blobs, data URLs and Open Food Facts' image host, and requests go to our origin, any
HTTPS host (the person's AI provider) or a local server (Ollama).

Inputs → outputs:
- `public/manifest.webmanifest` → read by the browser through `<link rel="manifest">`.
- `installOffer.listen(window)` (from `main.tsx`, before React draws) → the kept install event in
  `installOffer` (a small store: `getSnapshot()`, `subscribe`, `take()`); `appinstalled` ends it.
- `<InstallPrompt clock? storage? device? offer? />` → nothing, the install card, or the iOS card.
  Writes `platewise-install-shown` (epoch ms) to `localStorage` when a card is shown.
- `index.html` → the CSP `<meta http-equiv>` exactly as the row gives it.

Files: created `public/manifest.webmanifest`, `src/app/InstallPrompt.tsx`,
`src/app/InstallPrompt.test.tsx`, `src/app/installOffer.ts`, this note; changed `index.html`
(manifest link, CSP meta; theme-color kept), `src/app/App.tsx` (the prompt's place, additive),
`src/main.tsx` (listen for the install event, additive, shared), `src/i18n/en/shell.ts` (additive
keys); styles shared with the update banner in `src/app/notices.module.css`.

Edge cases / failure modes:
- `beforeinstallprompt` can fire before React has drawn anything (a returning visitor): the
  listener starts in `main.tsx`, calls `preventDefault()` and keeps the event for later.
- The kept event can be used once: after Install (accepted or not) it is dropped, and the card
  goes; a later event (Chrome fires again) waits for the week to pass.
- Already installed (`display-mode: standalone`, or `navigator.standalone` on iOS): no card.
- iOS detection: iPhone, iPod and iPad user agents, and iPadOS that reports itself as a Mac but
  has touch points; Safari only (Chrome, Firefox, Edge and Opera on iOS name themselves in the
  user agent and get no card, since the steps differ there).
- `localStorage` missing or throwing (private mode, blocked site data): the card still shows at
  most once per page load, and a broken stored value counts as never shown.
- A clock moved backwards (stored time in the future): treat as shown now, wait a week from it.
- CSP: `'wasm-unsafe-eval'` lets the barcode decoder compile its WebAssembly; no `'unsafe-inline'`
  anywhere, so `index.html` itself must hold no inline script or style (React sets styles through
  the CSSOM, which the policy allows). `http://[::1]:*` is written as the row gives it, although
  browsers drop IPv6 literals from source lists with a console warning.
- Vite's dev server needs inline scripts and styles; the meta is stripped there only (P09-17's
  plugin), builds keep it.

Our design differences / decisions:
- Names, copy, colours and icons are ours: the manifest uses the P00-04 icon set and the dark page
  token `#09120d` (`PAGE_COLOURS.dark`) for both `theme_color` and `background_color`.
- `id` is `platewise`; `start_url` and `scope` are `./` so the app also works from a sub-folder.
- Shortcut addresses are `./#/log/camera`, `./#/log/describe`, `./#/log/scan` as the row says.
  The router does not know these yet, so today they open Home (an unknown address opens Home,
  ACC-A2-2); a follow-up maps them to the capture actions (L8 is P2).
- One card at a time, drawn in the tab frame (not during onboarding), above the screen's content;
  it is a plain region with buttons, not a dialog, so it never blocks the app.
- "Shown" is recorded when the card appears, not when it is dismissed, so ignoring it also counts
  toward the week.
- Decisions for the lead: (1) the last-shown time lives in `localStorage` under the app's
  `platewise-` prefix (device-local, erased by Erase everything with the other owned keys), not in
  the settings table: it is per device and must not travel in backups; (2) the CSP meta keeps the
  row's IPv6 source even though browsers ignore it; (3) the inline head script for the theme that
  HANDOFF mentions cannot exist under `script-src 'self'`: a light device still sees the dark
  page until `main.tsx` runs (a follow-up could use an external `public/` script or a
  `prefers-color-scheme` rule in `tokens.css`).

Tests we will write:
- `InstallPrompt.test.tsx`: the kept install prompt shows once, Not now hides it, and it does not
  show again within seven days but does after; Install calls `prompt()` once and hides the card;
  an iPhone Safari user agent (and an iPad that reports a Mac) shows the Add to Home Screen steps
  (ACC-L1-2) under the same weekly rule; iOS Chrome, desktop without the event and the installed
  app show nothing; storage that throws still shows once; `appinstalled` hides the card.
- Same file, `index.html`: the CSP meta parses and holds exactly the row's directives and sources,
  no `'unsafe-inline'` or `'unsafe-eval'`, no inline script or style and no third-party script,
  style or font link (ACC-L6-1); the manifest link points at the manifest; the theme colour is the
  dark page colour.
- Same file, the manifest: parses; name, short name, `id`, `start_url`/`scope` `./`, standalone,
  colours equal the dark tokens; icons 192 and 512 "any" plus a maskable 512, and every icon path
  exists in `public/` with the size it claims (read from the PNG header) (ACC-L1-1); the three
  shortcuts.

Compare checklist (filled after the rewrite; no reference files: the row names none, so the
compare is against the row, the specs and the acceptance ids):
- [x] Install offer shown once, not again within seven days (ACC-L1-1: `InstallPrompt.test.tsx >
  InstallPrompt > shows the kept install offer once, then not again within seven days
  (ACC-L1-1)`, `> opens the browser prompt once when Install is pressed, and the card goes`,
  `> waits for an offer that comes after the app is drawn`, `> goes away once the app is
  installed`, `> still shows once in the visit when storage cannot be used`, `> counts the week
  from now when the clock was moved back`)
- [x] iOS Safari explains Add to Home Screen (ACC-L1-2: `InstallPrompt.test.tsx > InstallPrompt >
  explains Add to Home Screen in Safari on %s (ACC-L1-2)`, an iPhone and an iPad that reports a
  Mac; `> shows the iOS steps at most once in seven days`; `> shows nothing in %s`: the installed
  app, Chrome on an iPhone, Safari on a Mac, a browser that offers no install; `> shows nothing
  in the installed app even when an offer is kept`)
- [x] Every CSP directive of the row, nothing more, before any link or script (ACC-L6-1:
  `InstallPrompt.test.tsx > index.html > carries the CSP with exactly these directives, before
  anything loads (ACC-L6-1)`); no inline or third-party script, style or font (`> loads no inline
  or third-party script, style or font (L6)`); manifest link and theme colour (`> links the
  manifest and keeps the dark page colour as the theme colour`)
- [x] The manifest parses; name, short name, id, `./` start and scope, standalone, dark colours
  (`InstallPrompt.test.tsx > manifest.webmanifest > describes the installed app: name, id, scope,
  window and dark colours`); our icons, maskable included, every path present with its size
  (ACC-L1-1: `> lists our icons, a maskable one included, each present with the size it claims
  (ACC-L1-1)`); shortcuts (`> offers launcher shortcuts for Camera, Describe and Scan`)
- [x] Built app under the CSP in a real browser (by hand, Chromium, service workers allowed):
  `dist/index.html` keeps the meta and holds no inline script; Welcome renders online and
  offline; `walking-skeleton.spec.ts` and `onboarding.spec.ts` pass (5/5), the fake AI at
  `http://127.0.0.1:<port>` reachable under `connect-src`. The only console error is Chromium's
  "invalid source `http://[::1]:*` … will be ignored", on every load.
- [x] `vite dev` serves index.html without the CSP meta (checked with curl: 0 matches), and with
  the inline React refresh script the policy would block.
- Mutation check: no seven-day rule fails 2 tests; iOS Chrome taken for Safari fails 1; no
  once-per-visit decision fails 1.
- Deliberate differences: none from the row. Our own choices: `id` `platewise`; the SVG mark as
  an extra "any" icon; `lang`, `dir`, `categories` and a description; the card recorded as shown
  when it appears.
- Not taken: shortcut icons (launchers use the app icon); routing `#/log/camera`, `#/log/describe`
  and `#/log/scan` to their actions (today they open Home: a follow-up for the router and the
  log flows, L8 is P2); `apple-mobile-web-app-*` metas (iOS 16.4+ reads the manifest); a theme
  boot script before `main.tsx` (cannot be inline under this CSP).

## Status

Done (2026-10-27). Manifest, CSP, install offer and card with their tests (20 in
`InstallPrompt.test.tsx`). Outside the task's own files: `src/main.tsx` (one additive line:
`installOffer.listen(window)`), `src/app/App.tsx` (the card's place, additive),
`src/i18n/en/shell.ts` (additive keys `shell.install.*`). For the lead: the row's
`http://[::1]:*` source makes Chromium log a console error on every load and allows nothing; drop
it (or accept the noise) before a "no console errors" check lands.
