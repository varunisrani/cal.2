# Task: hash router and sheet stack (P04-04) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/navigation/FudAIRoutes.kt` [38] (the route list, which
destination selects which tab, hidden-tab filtering); `A/ui/navigation/FudAINavHost.kt` [392]
`selectTab` only (what a tab tap does to the back stack: Home is the floor, other tabs sit one
level above it and keep their state); `T/ui/navigation/FudAIRoutesTest.kt` [65]. Research spec
`05-home-progress.md` §3.1.1 (tabs, re-tap, each tab keeps its state), architecture `04` §4 row 6
(our own small hash router, tabs plus a sheet stack), naming `17` §1 (hash routes `#/home`,
`#/progress`, `#/coach`, `#/settings/<page>`).

What it does (own words): the app's address is the URL hash, so it works on any static host and
offline. Five screens have an address: Home, Progress, Coach, Settings (with an optional page and
sub-page below it) and onboarding. Anything else, including an empty hash, shows Home. Browser
Back behaves like a phone app: from a tab it goes to Home, from a Settings page to the level above,
and from Home it leaves the app. A sheet opened over a screen adds one history entry, so Back
closes the top sheet first and only then moves between screens. Each screen remembers how far it
was scrolled, and each tab remembers the last address shown in it (Settings › Units comes back
when Settings is tapped again).

Inputs → outputs:
- `parseRoute(hash)` → `Route | null`; `routeHash(route)` → `#/…`; `tabOf(route)` → the tab it
  belongs to (null for onboarding); `trailOf(route)` → the addresses from the bottom of its stack
  up to it (`#/settings/units` → Home, Settings, Units).
- `createRouter(window)` → a `Router`: `current()` (`{route, sheets}`), `subscribe`, `navigate(route)`,
  `showTab(tab)`, `openSheet(id)`, `closeSheet(id?)`, `setScrollReader(read)`, `scrollOf(route)`,
  `stop()`. `appRouter()` is the page's one router.
- `useRoute()` (state plus the actions), `useRouter()`, `useSheet(id)` → `{open, show, hide}`;
  `RouterContext` lets tests hand in their own router.

Files: created `src/app/router.ts`, `src/app/router.test.ts`, `src/app/useRoute.ts`,
`src/app/useRoute.test.ts`.

Edge cases / failure modes:
- Empty hash, `#`, `#/`, an unknown name, too many segments, a page name with capitals, spaces or
  other characters, a query string → Home, by replacing the entry (no extra Back step).
- A trailing slash (`#/progress/`) reads as the address without it.
- Arriving at a nested address directly (a reload, a shortcut, a typed address) → the history
  under it is built (Home, Settings, Units), so Back walks up instead of leaving the app.
- Reload with a sheet open: sheets are not restored; the router steps back over the sheet entries
  so Back is not a dead press.
- Forward into a sheet entry that is closed: the router steps back to the entry the screen lives on.
- Closing a sheet in code (Done, Save) must remove its history entry too, or the next Back would
  seem to do nothing. Closing a sheet below others closes those above it as well.
- `history.go()` is asynchronous: commands that arrive while a traversal is under way wait for it.
- Opening the same sheet twice adds no second entry.
- Navigating while sheets are open closes them (their entries are walked back first).

Our design differences / decisions:
- Names and structure are ours. The reference uses a native navigation stack; ours is the browser
  history, kept equal to `trailOf(route)` plus one entry per open sheet. Every move is "walk back
  to the deepest shared entry, then push the rest" (or replace the bottom entry when nothing is
  shared, e.g. onboarding → Home, so Back never returns to onboarding).
- Tab switches therefore never pile up history: Home → Progress → Coach leaves Home, Coach; Back
  from any tab lands on Home (the reference's floor), Back from Home leaves.
- Sheets live in memory (ids) with one history entry each, marked `{platewise: {sheets: n}}` in
  `history.state`; the screen's address does not change. Sheet contents are not addresses (drafts
  survive reloads through their own store, D-16.46).
- Scroll memory is per address. The router has no DOM: the shell's scroll container hands it a
  reader, and the router reads the position at the moment a screen is left (so a shorter next
  screen clipping the scroll cannot overwrite it). A fresh `navigate()` forgets the scroll of the addresses it pushes (a page opened again
  starts at the top); `showTab()` and Back keep it.
- Page names are lower-case words joined by hyphens; the router does not know the registry, so
  `#/settings/<anything well formed>` parses and the Settings screen (P04-13) decides.
- `#/log/<method>` (17 §1, manifest shortcuts) is not a route yet: it reads as unknown → Home
  until P09 adds it.

Tests we will write:
- `parseRoute`: the five screens; `#/settings/units` gives page `units` and no sub-page;
  `#/settings/ai/keys` gives both; malformed and unknown hashes give null; trailing slash.
- `routeHash` round-trips; `trailOf`, `tabOf`.
- Router on the jsdom history (real timers, waiting on `popstate` events, never on time):
  unknown hash → `#/home` with the entry replaced; a nested address builds its history; Back with
  two sheets open closes only the top one; closing a sheet in code removes its entry; Home →
  Progress → Home restores Home's scroll; `showTab` returns to a tab's last address; a tab switch
  replaces rather than piles up; onboarding → Home leaves no way back to onboarding; Back from a
  tab lands on Home; a typed address is taken over; a reload with a sheet entry steps back.
- `useRoute`/`useSheet`: re-render on route and sheet changes; `useSheet(id).open` follows Back.

Compare checklist (filled after the rewrite; reopened `FudAIRoutes.kt`, `FudAINavHost.kt`
`selectTab`, `FudAIRoutesTest.kt`):
- [x] Routes: the four tabs, Settings with nested pages that select Settings, onboarding that
      selects no tab (tested in `src/app/router.test.ts > parseRoute > reads the five screens`,
      `> reads a Settings page and its sub-page`; `> trailOf and tabOf > keeps onboarding apart
      from the tabs`)
- [x] Unknown address → Home, replacing the entry (ACC-A2-2) (tested in `src/app/router.test.ts >
      router > replaces an unknown address with #/home without adding a history entry (ACC-A2-2)`,
      `> opens on an empty address at Home`, `> sends a typed unknown address to Home`;
      `> parseRoute > gives nothing for the unknown address %j` (13 cases), `> reads an address
      with a trailing slash as the address without it`)
- [x] Home is the floor: other tabs sit one level above it, a tab switch never piles up history,
      Back from a tab lands on Home (the reference's pop-up-to-Home) (tested in
      `src/app/router.test.ts > router > switches tabs without piling up history: Back from any tab
      lands on Home`; `> trailOf and tabOf > puts Home under the other tabs and the hub under its
      pages`)
- [x] Each tab keeps its state: scroll per address and the last nested address (the reference's
      save/restore state) (tested in `src/app/router.test.ts > router > restores Home's scroll
      after Home → Progress → Home`, `> shows a tab again at the address it last showed`,
      `> starts a page navigated to afresh at the top`, `> reads the scroll position once, when a
      screen is left`; `src/app/Shell.test.tsx > Shell >
      switching back to Home returns to where Home was scrolled (ACC-A1-1)`)
- [x] Leaving onboarding removes it from the history (the reference pops onboarding inclusive)
      (tested in `src/app/router.test.ts > router > leaves no way back to onboarding once Home is
      shown`)
- [x] Sheets: Back closes the top sheet only (ACC-A2-1); a sheet closed in code leaves no dead
      entry; closing one closes those above it (tested in `src/app/router.test.ts > router > closes
      only the top sheet when Back is pressed with two sheets open (ACC-A2-1)`, `> takes a sheet
      closed in code out of the history too`, `> closes the sheets above a sheet that is closed by
      id`, `> opens a sheet that is already open only once, and ignores closing one that is not`,
      `> closes open sheets before moving to another screen`; `src/app/useRoute.test.ts > useSheet
      > is open while its sheet is on the stack, and Back closes it`, `> hides its sheet and removes
      its history entry`)
- [x] Web-only cases the reference has no counterpart for: nested address opened directly,
      typed address, reload with a sheet entry, commands during an asynchronous history move
      (tested in `src/app/router.test.ts > router > builds the history under a nested address, so
      Back walks up to the hub and then Home`, `> takes over an address typed into the page`,
      `> steps back over the entry of a sheet that did not survive a reload`, `> runs a command
      given during a history move once the move has landed`)
- [x] React bindings (tested in `src/app/useRoute.test.ts > useRoute > gives the router from the
      context`, `> re-renders with the new route and parses page and sub-page`, `> follows the
      browser Back button`)
- [x] Checked by hand in headless Chromium (Pixel 7, production build): Home → Progress → Coach
      then Back lands on Home; a typed `#/settings/units` then a Settings tap shows the hub, Back
      from the hub lands on Home; a typed `#/kitchen` becomes `#/home`.
- Deliberate differences: the browser history is the stack; sheets are history entries without
  an address of their own; scroll memory is per address and reset by a fresh `navigate()`.
- Not taken: the voice assistant's navigation requests, quick-action routing to Home and the
  Workouts tab (later phases); `#/log/<method>` shortcuts (P09).

## Decisions for the lead

- **History model**: history = `trailOf(route)` + one entry per open sheet. Home under every
  other tab, the Settings hub under its pages, onboarding alone. A move walks back to the deepest
  shared entry (`history.go`) and pushes the rest; when nothing is shared (onboarding ↔ tabs) it
  replaces the bottom entry. Commands that arrive during a `history.go` wait for its `popstate`.
- **Sheets**: `openSheet(id)` / `closeSheet(id?)` / `useSheet(id)` → `{open, show, hide}`; pass
  `open` and `hide` to the `Sheet` primitive (`onClose={sheet.hide}`). Sheet ids are free
  strings chosen by features (e.g. `log.manual`).
- **Router access**: `useRoute()` returns the state plus `navigate`, `showTab`, `openSheet`,
  `closeSheet`; `RouterContext` lets tests inject `createRouter(window)`; without a provider the
  page's `appRouter()` is used. No module-level `navigate()` export, so a feature never bypasses
  the router its test provides.
- **Scroll memory**: the shell's content area registers `setScrollReader`; the router reads it
  when a screen is left and the shell restores `scrollOf(route)` in a layout effect per address;
  features need do nothing.
- Follow-up: a screen whose content arrives after the restore (live queries) can clip the restored
  position; the remembered value survives, so a later task can re-apply it once content grows.
- Edge left as is: an address typed into the URL bar is taken over in place (its trail is planted
  on the new entry), which leaves one extra entry below it; one Back press there changes nothing.

## Status

Done (2026-10-27). Router, React bindings and tests; checked by hand in headless Chromium. Files
outside `src/app`: none for this task. Handed on: P04-10..13 (screens plug into
`src/app/RouteScreen.tsx`), P04-11/P06 sheets (`useSheet`).
