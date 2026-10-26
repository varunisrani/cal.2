# Task: hash router and sheet stack (P04-04) · Phase: 04 · Owner: builder (wt-p04s3, slice S3)

Read (reference @ `10e14b67`): `A/ui/navigation/FudAIRoutes.kt` (the route names, which routes
count as tabs, how a nested settings route maps to the Settings tab, hidden-tab test),
`A/ui/navigation/FudAINavHost.kt` (`selectTab` only: re-tap rules, how a tab switch treats the back
stack), `T/ui/navigation/FudAIRoutesTest.kt`. Research spec `05-home-progress.md` §3.1.1 (tabs and
navigation), §5 ("returned to foreground" and the web notes), architecture `04-architecture.md` §4
row 6 (our own small hash router: tabs plus a sheet stack). Acceptance ids ACC-A2-1, ACC-A2-2.

What it does (own words): the app's address lives in the URL hash. The router turns the hash into
a route (a tab, a nested Settings page, or onboarding) and back, and is the only code that touches
`history`. Changing tabs keeps a short, predictable history: Home is the bottom of it, so the
browser Back from any other tab goes to Home and Back on Home leaves the app, like the native back
stack that pops to Home. Nested Settings pages are pushed on top of the Settings tab, so Back walks
up to the hub. Sheets form a stack above the current screen; each open sheet owns one history
entry, so Back closes only the top sheet. Every tab remembers where it was scrolled and the last
nested page it showed, and both come back when the person returns to that tab. Anything the
router cannot read sends the person to Home without leaving the bad address in history.

Inputs → outputs:
- `parseHash(hash)` → `Route | null`; `routeHash(route)` → `#/…`; `sameRoute(a, b)`.
  Routes: `#/home`, `#/progress`, `#/coach`, `#/settings`, `#/settings/<page>`,
  `#/settings/<page>/<sub>`, `#/onboarding`. Page ids are lower-case kebab words.
- `createRouter(host)` → a router: `current()` (`{ route, sheets }`), `subscribe`, `navigate(route,
  { replace? })`, `selectTab(tab)`, `openSheet(id)`, `closeSheet(id?)`, `start()` (listens, returns
  stop), `applyScroll()` (runs a pending scroll after the new screen is drawn), `tabRoute(tab)`.
- `windowHost()`: the real `location`, `history` and window scroll behind a small `HistoryHost`
  interface; tests use an in-memory host with the same interface.
- `useRoute.ts`: `RouterProvider` (starts the router, applies the pending scroll in a layout
  effect), `useRouter()`, `useRoute()`, `useSheets()`, `useSheet(id)` (`open`, `show()`,
  `close()`), for features wiring a `Sheet` to the stack.

Files: created `src/app/router.ts`, `src/app/router.test.ts`, `src/app/useRoute.ts`,
`src/app/useRoute.test.ts`, `src/app/testing/memoryHost.ts` (the in-memory host for tests).

Edge cases / failure modes:
- Unknown or malformed hash (`#/kitchen`, `#/settings/Units`, `#/home/x`, a 3rd nested level) →
  replaced by `#/home`, so Back does not return to it. An empty hash is Home as well.
- Back after two sheets: the entry under the top sheet still lists the lower sheet, so it stays.
- Forward into an entry that lists more sheets than are open, or a reload while sheets were open:
  sheets never come back by themselves (their content is gone); the entry is rewritten with the
  sheets that are really open.
- A sheet closed by its own button: the stack shrinks at once and the router steps back over the
  sheet's history entry; closing a lower sheet also closes the ones above it.
- Async traversal: `history.go` reports back later with `popstate`; the router keeps what it has to
  do after landing and runs it once, whether `popstate`, `hashchange` or both arrive.
- A tab switch from a nested page or with sheets open first steps back over those entries.
- A deep link opened fresh (no state in history) has nothing under it: switching to Home replaces
  it instead of stepping back past the start of the history.
- Scroll: the browser's own restoration is turned off; a tab switch restores that tab's remembered
  offset, a newly pushed page starts at the top, Back inside a tab restores the offset stored on
  that entry. The offset is applied after React has drawn the new screen.

Our design differences / decisions:
- Hash URLs (architecture §4); names are ours (`Route`, `HistoryHost`, `selectTab`).
- History shape: leaving Home pushes, moving between two non-Home tabs replaces, choosing Home steps
  back to the Home entry. This keeps the native "Back goes Home first" behaviour on the web.
- Re-tap rules (Settings → hub, any other current tab → nothing) live in `selectTab`, so the tab bar
  and any later caller (shortcuts) behave alike.
- A nested route is remembered as a single pushed entry over the tab root (a remembered
  `settings/units/weight` returns as hub + one entry), so Back from it goes to the hub.
- Hidden tabs are not the router's business: the tab bar decides (P04-05).

Tests we will write:
- `router.test.ts`: parse table (tabs, onboarding, settings page and sub-page, unknown, malformed,
  trailing slash, empty); round trip `routeHash(parseHash(x))`; start on an unknown hash replaces it
  with `#/home` (history length unchanged, ACC-A2-2); Back with two sheets open closes the top one
  only (ACC-A2-1); closing a sheet by its button steps back once; closing a lower sheet closes
  the ones above; forward does not reopen a sheet; reload drops sheets; Home → Progress → Home
  restores Home's scroll; Back from a non-Home tab returns Home; non-Home → non-Home replaces;
  Settings remembers its nested page; re-tap Settings on a nested page returns to the hub; re-tap
  another tab does nothing; async traversal runs its follow-up once; deep-link start then Home.
- `useRoute.test.ts`: the hook re-renders on navigation; an unknown address shows Home (ACC-A2-2);
  `useSheet` open/close with Back; the provider applies the pending scroll after a tab switch.

Compare checklist (filled after the rewrite; reopened `FudAIRoutes.kt`, `FudAINavHost.kt`
`selectTab`, `FudAIRoutesTest.kt`):
- [x] Routes: the four tabs, nested Settings pages and onboarding (`router.test.ts > parseHash >
      reads %j`, `> parses the page and sub-page of a nested Settings address`, `> writes every
      route back to the hash it was read from`); anything else names no route (`> names no route
      for %j`) and the person lands on Home with the bad address replaced (`router.test.ts >
      createRouter > opens Home for an unknown address and keeps the address out of history`,
      `> goes Home when the address is edited to an unknown one`; `useRoute.test.ts > useRoute >
      shows Home for an unknown address`) (ACC-A2-2)
- [x] A nested Settings page counts as the Settings tab (`TabBar.test.tsx > TabBar > shows
      Settings as selected on a nested Settings page`); onboarding is no tab (`> is not drawn on
      onboarding`; `router.test.ts > createRouter > ignores tab taps on onboarding`)
- [x] Choosing Home pops back to the Home entry; other tabs sit over Home and replace each other
      (`router.test.ts > createRouter > keeps Home at the bottom: Back from any tab goes Home,
      Back on Home leaves`, `> replaces a tab the app was opened on when Home is chosen`)
- [x] Re-tap Settings anywhere in Settings → hub; re-tap of any other current tab does nothing
      (`router.test.ts > createRouter > returns to the Settings hub when Settings is tapped on a
      nested page`, `> returns to the hub from a nested page the app was opened on`, `> does
      nothing when the tab on screen is tapped again`)
- [x] Tabs keep their state across switches (the native back stack saves and restores it): scroll
      and last nested page (`router.test.ts > createRouter > restores Home's scroll after Home →
      Progress → Home`, `> restores the tab scroll when Back leaves a tab too`, `> remembers the
      last nested Settings page of the tab`; `useRoute.test.ts > useRoute > applies the tab
      scroll after the new screen is drawn`)
- [x] Sheets (the web's stand-in for the native modal back handling): Back closes the top sheet
      only (`router.test.ts > createRouter > closes only the top sheet when Back is pressed with
      two sheets open`; `useRoute.test.ts > useSheet > opens a sheet with its own history entry,
      and Back closes only the top one`) (ACC-A2-1); a sheet closed from inside, a lower sheet,
      Forward, reload (`> steps back over its own entry when a sheet closes from inside`, `> closes
      the sheets above a lower sheet that closes`, `> never reopens a sheet on Forward`, `> drops
      open sheets on a reload`)
- [x] Real browser timing: `history.go` lands later and fires `popstate` and `hashchange`
      (`router.test.ts > createRouter > finishes a tab switch once a late step back lands, and only
      once`, `> closes a sheet at once even when the step back lands later`). Also checked by hand
      in Chromium (Playwright on a blank same-origin page with `windowHost()`): unknown → Home,
      Back with two sheets, close by button, tab switch from a nested page with a sheet, Back to
      Home, remembered nested page, re-tap Settings, typed unknown and known hashes; all as above.
- Deliberate differences: hash URLs and a history shape that imitates the native back stack (Home
  at the bottom); sheets own history entries; a remembered nested page returns as hub + one entry.
- Not taken: the voice assistant's requests and the quick-action switch to Home (later phases);
  the hidden-tab guard inside `selectTab` (the tab bar never offers a hidden tab and sends a hidden
  tab on screen Home, P04-05).

## Decisions for the lead

- History shape (no D-id yet; behaviour matches the reference's back stack, so none may be
  needed): leaving Home pushes, moving between two other tabs replaces, choosing Home steps back
  to the Home entry; nested pages and sheets push. Each entry carries `{ platewise: { sheets,
  depth, overHome, scroll? } }` in `history.state`; the router relies on it to step back the right
  number of entries. `history.scrollRestoration` is set to `manual` while the router runs.
- A sheet that should survive Back must be opened with `useSheet(id)` / `router.openSheet(id)`;
  sheet content never comes back by Forward or reload (the entry is rewritten).
- Scroll is restored in `RouterProvider`'s layout effect, right after the new screen is drawn. A
  screen whose content arrives later (live queries) may be shorter at that moment, so the offset
  can clamp; P04-10 can call `router.applyScroll()` again once its data is in if this shows.
- Tests run on an in-memory host (`src/app/testing/memoryHost.ts`), because jsdom delivers
  `history.go` on its own task queue, which fake timers do not drive.

## Status

Done (2026-10-26). Router, React bindings, in-memory host and tests. Nothing changed outside the
slice's files.
