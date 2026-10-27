# Task: About, licences and credits (P09-16) · Phase: 09 · Owner: builder (wt-p09s16)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/ui/about/AboutScreen.kt` (section list only: the header, the
category groups, the update row's states, the share action, the notice viewer and the footer; no
copy taken), research spec `06-settings-data.md` §3.20 (About groups), §3.21 (What's New, not
taken), §5 (About on the web), D-16.43 (no What's New; version and changelog link), Proposed
D-16.66 (our own URLs, hidden until supplied), `00-decisions.md` (licence row: MIT notice kept as
credit) and `01-clean-room-protocol.md` §7 (credits; the About screen says "inspired by"). The
row names no reference tests. No trap or acceptance row names P09-16 (checked the traps ledger
and the acceptance map); ACC-L3-1 belongs to P09-17 and is only read here.

What it does (own words): Settings › About Platewise is a short page about the app itself. At the
top: our mark, the name and the version of this build. Below: whether the app is current or a
new version waits ("Up to date", or "Update ready" with a Reload button that does what the update
banner's button does, never by itself); a link to what changed in each release when its address
is known; Share Platewise, which opens the system share sheet with the app's address where the
browser has one and otherwise copies the address and says so; help, contact and source links,
each shown only once the owner has written its address into `src/config/links.ts` (until then
they are hidden, not dead links); and links to the calculation methods page (P05-13) and to the
licences and credits page. A line at the bottom says which app inspired Platewise. The credits
page says Platewise is built on open-source packages, lists every production dependency with its
version and licence and shows each licence text on demand, and credits the app that inspired it
with that app's MIT notice. There is no What's New dialog (D-16.43).

Inputs → outputs:
- Build: `package.json` version → the build constant `__PLATEWISE_VERSION__` (`vite.config.ts`
  `define`) → `APP_VERSION` in `src/config/build.ts` → About's header and the backup document's
  `appVersion` (`main.tsx`, replacing the hard-coded `'0.1.0'`).
- Build: the installed production dependencies (package.json `dependencies` and their own
  dependencies through `node_modules`, the set the licence check judges) → `scripts/notices.ts`
  → `src/generated/notices.json` (`{packages: [{name, version, license, homepage, text}]}`,
  sorted, byte-stable) → the credits page.
- Build: `THIRD_PARTY_NOTICES.md` (the credit section: the inspiring app's name, its address and
  its MIT notice) → `readCredit()` in `scripts/notices.ts` → the build constant
  `__PLATEWISE_CREDIT__` → the credits page and About's footer line.
- Page: `useAppUpdate()` (P09-17) → the update row; `LINKS` → the link rows; a press of Share →
  `navigator.share({title, text, url})`, else `navigator.clipboard.writeText(url)` → a toast.

Files: created `src/features/about/AboutPage.tsx`, `AboutPage.test.tsx`, `CreditsPage.tsx`,
`CreditsPage.test.tsx`, `share.ts` (+ `share.test.ts`), `aboutPage.module.css` (both pages;
`about.module.css` stays the methods page's), `src/config/links.ts` (+ `links.test.ts`),
`src/config/build.ts`, `src/config/credit.ts`, `src/config/constants.d.ts` (the two build
constants' types), `scripts/notices.ts`, `scripts/notices.test.ts`,
`src/generated/notices.json` (generated), this note; changed `vite.config.ts` (the two build
constants and a plugin that regenerates the notices at build start, additive),
`src/features/settings/registry.ts` (the `about` and `credits` entries, additive),
`src/main.tsx` (the backup's `appVersion` from the build constant, shared),
`src/i18n/en/about.ts` (additive keys).

Edge cases / failure modes:
- No service worker (dev, tests, a browser without one): the flag stays `current`, so the row says
  "Up to date"; Reload is offered only while a new version actually waits.
- `navigator.share` missing (most desktop browsers): copy the address. The person closing the
  share sheet (`AbortError`) is not a failure: nothing more happens. Any other share failure
  (`NotAllowedError` when the gesture was lost, a refused payload) falls back to copying.
- Clipboard missing (an insecure page) or refused: a toast says copying failed and gives the
  address, nothing throws.
- No `site` link yet: the shared address is the one this copy of the app runs from (the page's
  origin and the app's base path), which is where an installed app came from.
- A link in `links.ts` that is not `https:` or `mailto:` is a mistake in the file: a test fails.
- A link left `null` is not drawn; a card whose links are all `null` is not drawn either.
- A dependency without a licence file in its package: listed with its licence id and a line
  saying the package ships no licence text. A package with several licence files (dual licence,
  an Apache `NOTICE`) shows them all, in file-name order.
- The same package at two versions: two entries. Optional dependencies that are not installed
  are skipped, as the licence check does; a missing required one stops the generator.
- Stable output: entries sorted by name then version, CRLF turned into LF, trailing blank lines
  trimmed, no dates or absolute paths in the file, two-space JSON with a final newline (the shape
  Prettier keeps, so `fmt:check` stays clean); the build rewrites the file only when its bytes
  would change.
- `THIRD_PARTY_NOTICES.md` without the credit section, its address or its fenced notice: the
  build fails with a message, so a build never ships a credits page without the credit.
- Clean-room guards: the reference's name and its author's name must never be written into
  `src/`, `scripts/` or any other checked folder, so the credit is read from
  `THIRD_PARTY_NOTICES.md` (an exempt file) at build time and exists only in `dist/`. The
  dependency licence texts in `notices.json` repeat the MIT text, but JSON is never gated by the
  similarity check; the guards are run to prove it.

Our design differences / decisions:
- Names, words, layout and order are ours. The reference's tip jar, store rating, launch-site
  vote, code-host star, community and social rows, security badges, business records, the
  "check for updates" store lookup and the What's New pop-up are not offered (06 §5, D-16.43,
  D-16.66). The update row reads the service worker's flag instead of a store lookup.
- One page for every third-party licence, generated from the installed packages, in place of the
  reference's per-model notice viewers. Licence texts open on demand (`<details>`), so the page
  stays short; no chunked loading is needed at these sizes (tens of kB, not megabytes).
- The credit (name, address, MIT notice) comes from `THIRD_PARTY_NOTICES.md` at build time, so
  there is one copy of it in the repository and none in product code.
- Decisions for the lead:
  1. `package.json` is outside this slice, so the notices are generated at build time by a small
     plugin in `vite.config.ts` (`buildStart` of `vite build`) instead of a `notices` script run
     before `build`. `tsx scripts/notices.ts` writes the file by hand and `--check` exits 1 when
     the file is stale; adding `"notices": "tsx scripts/notices.ts"` to `package.json` is left to
     the lead.
  2. `src/generated/notices.json` is meant to be committed, not ignored: `pnpm typecheck` and
     `pnpm test` run before `pnpm build` in CI and both need the file; a unit test fails when it
     no longer matches the installed packages, and the build refreshes it. The plan's `.gitignore`
     line is therefore not taken.
  3. Every address in `src/config/links.ts` is `null` until the owner supplies it (D-16.66: hidden
     until supplied), the changelog included (P10-14 writes `CHANGELOG.md`; its published address
     goes into `links.changelog`). `privacy` and `terms` are there for P09-01's hub rows.
  4. A `credits` category is registered next to `about` so the About page can open it; P09-01's
     nesting should put `credits` and `methods` under `about`.
  5. The built bundle names the inspiring app (the credit); `dist/` is not scanned by the guards.

Tests we will write:
- `scripts/notices.test.ts`: lists exactly the packages the licence check lists (same name and
  version set) with their licences; two runs give the same bytes; the committed file matches a
  fresh run; a tree of made-up packages: sorting, nested and duplicate versions, a missing
  optional dependency skipped, a missing required one refused, licence and NOTICE files read in
  order, CRLF normalised, a package with no licence file kept with `text: null`, licence fields
  in their object and array forms; the credit read from the real `THIRD_PARTY_NOTICES.md` and
  from made-up text, and refused when a part is missing; `--check` on a stale and a fresh file.
- `src/features/about/share.test.ts`: share when offered; copy when not; a cancelled share does
  not copy; a failed share copies; nothing works → failed.
- `src/features/about/AboutPage.test.tsx`: the version of this build (the package.json version)
  is shown; "Up to date" while current; "Update ready" with Reload while ready, Reload calls
  `apply` and nothing reloads without the press; Share uses the share sheet when present and
  falls back to copying with a toast; unsupplied links are hidden and supplied ones open their
  address; the methods and credits rows open their pages; the page is reached at
  `#/settings/about`.
- `src/features/about/CreditsPage.test.tsx`: every package of `notices.json` is listed with its
  version and licence, and the list matches the production dependencies; a licence text shows
  when opened; the inspired-by line and the MIT notice are shown.
- `src/config/links.test.ts`: every supplied link is `https:` or `mailto:`.

Compare checklist (filled after the rewrite; reopened `A/ui/about/AboutScreen.kt`: the header,
the update row's states, the share action, the notice viewers, the footer):
- [x] Header: mark, name, "Version x" (`AboutPage.test.tsx > AboutPage > shows the mark, the name
  and the version of this build, which is package.json’s`); the backup document carries the same
  constant (`main.tsx`).
- [x] Update row: ours has two states from the service worker, current and ready; Reload only on
  a press (`AboutPage.test.tsx > AboutPage > says Up to date, with no Reload, while no new version
  waits`, `> says Update ready when a version starts waiting, and lets it in only when Reload is
  pressed`, `> opens on Update ready when the version was already waiting`).
- [x] Share: a short line plus the app's address to the system sheet, else the address copied
  with a toast; closing the sheet is not a failure (`AboutPage.test.tsx > AboutPage > shares the
  app’s address through the share sheet when the browser has one`, `> copies the link instead,
  and says so, when the browser cannot share`, `> gives the address in its message when neither
  sharing nor copying works`; `share.test.ts > shareLink > *` (5 tests); `share.test.ts >
  appAddress > *`).
- [x] Help, contact and source as our own links, hidden until supplied; pages in a new tab, email
  in the mail app (`AboutPage.test.tsx > AboutPage > leaves out every link the owner has not
  supplied yet`, `> shows supplied links: pages in a new tab, the email in the mail app`;
  `links.test.ts > LINKS > holds only secure pages, email addresses or null placeholders`).
- [x] Changelog link (D-16.43), hidden until supplied (same two tests).
- [x] Third-party notices: one generated page instead of per-model viewers, every production
  package with version and licence, texts on demand (`CreditsPage.test.tsx > CreditsPage > lists
  every package of the generated notices with its version and licence`, `> covers every package
  the app depends on directly, each with a licence text`, `> opens a licence text on demand`,
  `> says so when a package ships no licence text, and links no project page it lacks`;
  `notices.test.ts > collectNotices > lists exactly the production packages the licence check
  judges, with their licences`).
- [x] Notices output stable across runs and fresh in the repository (`notices.test.ts > the
  notices file > comes out byte for byte the same on every run`, `> matches the installed
  packages as committed (tsx scripts/notices.ts or a build refreshes it)`, `> is written only
  when its bytes change`; `notices.test.ts > main > *`).
- [x] Credit: the inspired-by line on About and Credits, the reference's MIT notice as credit,
  read from THIRD_PARTY_NOTICES.md at build time (`CreditsPage.test.tsx > CreditsPage > credits
  the app that inspired Platewise, with its address and its licence notice`; `AboutPage.test.tsx
  > AboutPage > names the app that inspired Platewise`; `notices.test.ts > readCredit > reads the
  real credit out of THIRD_PARTY_NOTICES.md`, `> refuses a file with %s`).
- [x] Methods page linked; About and Credits are Settings pages (`AboutPage.test.tsx > AboutPage >
  opens the calculation methods and the licences and credits pages`, `> is a Settings page at
  #/settings/about, listed under About on the hub`; `CreditsPage.test.tsx > CreditsPage > is the
  Settings page at #/settings/credits`).
- [x] Guards: `pnpm check --require-ref` 6/6 PASS with the generated file and the credit in
  place (similarity 1145 files, banned 24 patterns, licences 8 packages); the credit's name and
  notice exist only in `dist/` (checked in the built chunks).
- Mutation check: no copy fallback after a failed share fails 1 test; the notices unsorted fail 3;
  unsupplied links drawn fail 1; Reload applied without a press fails 2; a version not from the
  build constant fails 1.
- Deliberate differences: no "check now" tap on the update row and no "current → latest" detail
  (the service worker checks at launch and on each return to the app, P09-17, and does not know
  the next version's number); no checking or failed states (the check runs in the background).
- Not taken: tip jar, store rating, code-host star, launch-site vote, community and social rows,
  security badges, business and credential records, the store update lookup, the "made by"
  footer and tagline, What's New (D-16.43, D-16.66, 06 §5). Privacy and terms rows belong to
  P09-01's hub (D-16.66).

## Status

Done (2026-10-27). About and Credits pages, the share helper, `links.ts`, the version and credit
build constants, the notices generator with its build hook and the generated
`src/generated/notices.json`, and their tests (59 tests in `AboutPage.test.tsx`,
`CreditsPage.test.tsx`, `share.test.ts`, `links.test.ts`, `notices.test.ts`). Outside the task's
own files: `src/main.tsx` (the backup's `appVersion` from `APP_VERSION`, two lines),
`src/features/settings/registry.ts` (the `about` and `credits` entries), `vite.config.ts` (the
notices plugin and `define`), `src/i18n/en/about.ts` (additive keys `about.page.*`,
`about.credits.*`). Handed on: the lead adds a `notices` script to `package.json` if wanted and
decides on committing `src/generated/notices.json` (decision 2); P09-01 nests `credits` and
`methods` under `about` and reads `privacy`/`terms` from `links.ts`; P10-14 puts the changelog's
address into `links.changelog` and may refresh THIRD_PARTY_NOTICES.md from the notices script.
