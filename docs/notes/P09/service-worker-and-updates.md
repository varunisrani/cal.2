# Task: service worker and update flow (P09-17) · Phase: 09 · Owner: builder (wt-p09s17)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none, on purpose. The row names no reference file: the reference
is two native apps with no service worker, and its update row (store lookup, Play update API) has
no web counterpart. Sources: research spec `06-settings-data.md` §3.20 (update row states) and §5
(About: "update check = service-worker update flow … never auto-reload mid-edit"), `05-home-progress.md`
§3.1.1 (a dot on Settings for a waiting update), `04-architecture.md` §4 row 14 (our own small
worker, network-only for AI) and §6 (privacy: no other hosts), `03-feature-inventory.md` L2, L3;
acceptance ids ACC-L2-2 and ACC-L3-1. Web platform behaviour from the Service Worker spec and MDN
(install, activate, `skipWaiting`, `clients.claim`, `controllerchange`, `updateViaCache`).

What it does (own words): the built app gets a small service worker of its own, `sw.js`, so the
installed app opens with the network off. At install it stores the app shell (the page, every
script and style chunk of the build, the icons and the manifest) in one Cache Storage cache named
after the build's version. While it runs, a same-origin request for a file of the shell or of the
build's hashed `assets/` folder is answered from that cache first (anything missing is fetched
and kept); a page navigation goes to the network first and falls back to the stored `index.html`
when the network fails; every other request, and every request to another origin (the AI
providers, Open Food Facts, FoodData Central, a local Ollama), is left alone so the browser sends
it as if there were no worker. When it activates it deletes the `platewise-` caches of older
builds. A new version never takes over on its own: it waits until the page asks.
On the page side, `swRegistration.ts` registers the worker in production builds only, asks the
browser to look for a new version at launch and whenever the app comes back to the foreground,
and turns "a new worker is installed and waiting" into an update flag. `UpdateBanner.tsx` shows
"Update ready" with a Reload button while the flag is up; only a press sends the waiting worker
the go-ahead, and the page reloads once the new worker controls it. Nothing reloads by itself, so
an edit in progress is never lost.

Inputs → outputs:
- Build: `vite build` → `dist/sw.js` with the build's `{version, files, assetsDir}` written into
  it by our plugin in `vite.config.ts` (the version is a hash of every shell file, so any change
  to the app changes the worker's bytes, which is what makes the browser see an update).
- Worker: `install` → cache `platewise-shell-<version>` filled with every listed file (fetched
  past the HTTP cache); `activate` → other `platewise-` caches deleted, open pages claimed;
  `fetch` → cache-first, network-first-with-shell, or not handled; `message {type:
  'platewise:skip-waiting'}` → `skipWaiting()`.
- Page: `registerServiceWorker(updates, options?)` → registration or `null`; `appUpdates`
  (`getSnapshot(): 'current' | 'ready'`, `subscribe`, `apply()`); `useAppUpdate()` →
  `{status, apply}` for the banner, the Settings dot (P09-01) and About (P09-16).

Files: created `src/sw/sw.ts`, `src/sw/sw.test.ts`, `src/app/swRegistration.ts`,
`src/app/swRegistration.test.ts`, `src/app/UpdateBanner.tsx`, `src/app/UpdateBanner.test.tsx`,
`src/app/testing/fakeServiceWorker.ts` (fake container, registration and workers for tests),
`src/app/notices.module.css` (the banner's and the install prompt's styles), this note; changed
`vite.config.ts` (the plugin), `src/app/App.tsx` (the banner's place, additive), `src/main.tsx`
(start the registration, additive, shared), `src/i18n/en/shell.ts` (additive keys).

Edge cases / failure modes:
- First install: no page is controlled yet, so an installed worker is not an "update"; no flag.
  The first `controllerchange` (after `clients.claim`) must not reload or raise the flag.
- A worker already waiting at launch (the person ignored the banner and reopened the app) raises
  the flag straight away.
- Two tabs: Reload in tab A activates the worker; tab B gets `controllerchange` without having
  asked, keeps its unsaved state and keeps (or raises) the flag, now as a plain reload.
- Reload pressed when the waiting worker has gone (a newer one replaced it): just reload.
- `register()` rejecting (private mode, blocked storage) or resolving to nothing (Playwright's
  `serviceWorkers: 'block'` swaps in a function that returns `undefined`): log, no flag, app runs.
- `registration.update()` rejects when offline: ignored, tried again at the next foreground.
- Install with one file missing on the server: `addAll` fails, the new worker is thrown away and
  the old one keeps serving; nothing half-cached is used (each version has its own cache).
- Offline navigation with no cached shell (before the first install finished): the network error
  goes through as it would without a worker.
- A navigation answered by the network never replaces the stored page: it must stay the one
  whose scripts this version cached. It is stored only when the cache lost it (Erase everything
  deletes every `platewise-` cache), so the app opens offline again after the next online visit.
- Servers that answer `Vary: Origin` (Vite's preview does): a page's module scripts carry an
  Origin header the install requests lack, so lookups ignore Vary (found in the browser run).
- Non-GET requests, cross-origin requests, same-origin files outside the shell and `assets/`
  (a future update check of our own) are not handled at all.
- A response that is not a plain same-origin 200 (an opaque, redirected or error response) is
  passed on but never cached.
- Hashed `assets/` files are immutable, so cache-first never serves a stale one; `index.html`
  is the only mutable shell file and navigations reach the network first.

Our design differences / decisions:
- All names are ours; no reference counterpart. No Workbox or `vite-plugin-pwa` (architecture
  §4 row 14): the worker is about 150 lines of code and its build step one plugin.
- The worker is its own build entry, emitted by the plugin as `sw.js` at the root (a stable URL
  and a root scope), with no imports and no exports in its output, so it runs as a classic worker
  in every browser and adds nothing to the app's initial JavaScript. The plugin fails the build if
  the output ever gains an import or loses the build placeholder.
- One cache per build version (`platewise-shell-<version>`) holds both the precached shell and
  files cached later (the barcode `.wasm`, which is not precached: about a megabyte that only a
  scan needs, and a scan needs the network for its lookup anyway).
- `updateViaCache: 'none'`, so a check always reaches the server for `sw.js`.
- The page's reload waits for `controllerchange` after the person pressed Reload; no timer.
- Constants shared by page and worker (the message type, the cache prefix) are written in both
  files and a test checks they match: importing one from the other would put the worker's code
  into the app bundle or a shared chunk into the worker.
- The CSP meta is removed from `index.html` by the plugin in `vite dev` only (Vite's dev server
  injects an inline script and `<style>` tags that the policy forbids); builds and `vite preview`
  keep it (P09-18).
- Decisions for the lead: (1) the update flag lives in `src/app/swRegistration.ts` (`appUpdates`,
  `useAppUpdate()`), not in `appState.ts` (not this slice's file): P09-01's dot and P09-16's About
  status read it there; (2) registration starts from `main.tsx` after the page's `load` event (two
  additive lines in a shared file); (3) the barcode `.wasm` is cached on first use, not
  precached; (4) navigation preload is not used (one fewer moving part; network-first already
  answers from the network when online).

Tests we will write:
- `sw.test.ts` (fake scope with fake `caches`, `fetch`, `clients`, `skipWaiting`): install
  precaches every listed file into the versioned cache past the HTTP cache and does not skip
  waiting; activate deletes older `platewise-` caches only and claims; a request to
  `generativelanguage.googleapis.com` (and Open Food Facts, a local Ollama, a POST) is not
  intercepted and reaches no cache (ACC-L2-2); a shell file is served from the cache without the
  network; an `assets/` file missing from the cache is fetched and kept; an error response is not
  kept; a navigation uses the network when it answers and does not cache it; a navigation offline
  returns the cached shell; `skipWaiting` only on the page's message; the build placeholder is
  read; the shared constants match the page's.
- `swRegistration.test.ts` (fake container, registration and workers): not registered outside
  production or without service workers; a waiting worker at launch sets the flag; a worker
  installed while a page is controlled sets the flag, but not on a first install; no reload until
  `apply()` (ACC-L3-1); `apply()` posts the skip-waiting message and reloads once on
  `controllerchange`; another tab's takeover keeps the flag as a plain reload; `update()` at
  launch and on each return to visible, failures ignored; a blocked or failing `register()`.
- `UpdateBanner.test.tsx`: nothing while current; "Update ready" with Reload while ready; the page
  is never reloaded until Reload is pressed, however long it waits (ACC-L3-1).

Compare checklist (filled after the rewrite; no reference files: the row names none, so the
compare is against the row, the specs and the acceptance ids):
- [x] Precache on install, versioned cache, past the HTTP cache, no `skipWaiting` (`sw.test.ts >
  install > stores every shell file in the cache of its version, past the HTTP cache, and
  waits`, `> fails without caching anything when a shell file is missing on the server`, `> keeps
  a page the host redirected to without the redirect mark`)
- [x] Old `platewise-` caches removed on activate, others kept, pages claimed (`sw.test.ts >
  activate > deletes the other platewise- caches, keeps the current one and others, and takes
  control`)
- [x] AI and food-database requests never intercepted or cached (ACC-L2-2: `sw.test.ts > fetch >
  leaves a request to %s alone: no answer, no cache (ACC-L2-2)`, Gemini POST and GET, Open Food
  Facts, FoodData Central, a local Ollama, another host at a path of our shell; `> leaves
  same-origin requests outside the shell alone, and every non-GET one`)
- [x] Same-origin static files cache-first (`sw.test.ts > fetch > serves a shell file from the
  cache without the network, whatever Origin it varies by`, `> fetches a build asset missing from
  the cache once, then keeps it`, `> passes an error answer on without keeping it`)
- [x] Navigations network-first with the cached `index.html` offline (`sw.test.ts > fetch >
  answers a navigation from the network when it can, keeping the stored page`, `> answers a
  navigation offline with the cached shell`, `> puts the page back when its cache lost it, so
  offline opens again`, `> fails an offline navigation as the browser would when no shell is
  cached yet`)
- [x] `skipWaiting` only when the page asks (`sw.test.ts > message > skips waiting only when a
  page asks`); page and worker constants match (`sw.test.ts > constants shared with the page >
  match the page message and the prefix of owned caches`); the build list (`sw.test.ts >
  readBuild > reads the list the build writes in`, `> refuses %s`)
- [x] Production only, `update()` at launch and on visibility (`swRegistration.test.ts >
  registerServiceWorker > registers nothing outside a production build`, `> registers nothing
  where the browser has no service workers`, `> registers sw.js under the base address, always
  checking the server for it`, `> looks for a new version at launch and whenever the app comes
  back into view`, `> runs on without a flag when registering fails or the browser blocks
  workers`)
- [x] A waiting worker sets the flag; no reload until Reload (ACC-L3-1: `swRegistration.test.ts >
  registerServiceWorker > sets the flag when a waiting worker appears, and reloads only after
  Reload (ACC-L3-1)`, `> raises the flag for a version already waiting at launch, and reloads
  nothing`, `> notices a worker that was already installing at launch`, `> raises no flag and
  reloads nothing on a first install`, `> keeps a reload on offer, without reloading, when
  another tab lets the update in`; `UpdateBanner.test.tsx > UpdateBanner > shows Update ready and
  reloads only when Reload is pressed (ACC-L3-1)`, `> draws nothing while the app is current`)
- [x] The worker stays out of the initial JS: `pnpm build && pnpm check:bundle` PASS, 214.66 kB
  gzip (213.07 before this slice: the banner, the install card and the registration); `sw.js`
  3.9 kB raw, no import or export (the plugin fails the build otherwise).
- [x] Real browser, by hand (a scratch Playwright config outside the repo, service workers
  allowed, Chromium of Playwright 1.63): the built app registers, precaches 54 files into
  `platewise-shell-<16 hex>`, reloads offline from the worker, a cross-origin fetch offline fails
  as a network error; a changed `sw.js` shows "Update ready", the page keeps its state for the
  wait, Reload reloads once into the new worker and only the new cache is left;
  `walking-skeleton.spec.ts` and `onboarding.spec.ts` pass with the worker registered (5/5) as
  well as blocked (5/5). The first offline run failed: the module scripts' cache lookups missed
  on `Vary: Origin`; fixed with `ignoreVary` and a fake cache that honours Vary.
- Mutation check: no origin check fails 1 test; `skipWaiting` on install fails 1; deleting every
  cache fails 1; no controller check fails 1; reload on any `controllerchange` fails 2; no update
  on visibility fails 1; no `ignoreVary` fails 2.
- Deliberate differences: none from the row. Our own choices: one cache per build version; the
  `.wasm` decoder cached on first use; navigation preload not used; the page stored again only
  when its cache lost it.
- Not taken: the What's New dialog after an update (06 §5 lists it; P09-16 says no What's New
  dialog); the Settings dot (P09-01) and About's status (P09-16) read `useAppUpdate()` when they
  land; an offline e2e project (P09-19).

## Status

Done (2026-10-27). Worker, plugin, registration, banner and their tests (40 tests in
`sw.test.ts`, `swRegistration.test.ts`, `UpdateBanner.test.tsx`) are in. Outside the task's own
files: `src/main.tsx` (two additive lines: start the registration after `load`, listen for the
install offer), `src/app/App.tsx` (two additive lines: the banner and the install card above the
screen), `src/i18n/en/shell.ts` (additive keys `shell.update.*`, `shell.install.*`). Handed on:
P09-01 and P09-16 read `useAppUpdate()` from `src/app/swRegistration.ts`; P09-19 adds the offline
e2e project.
