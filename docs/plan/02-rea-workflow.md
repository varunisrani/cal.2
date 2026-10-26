# 02 · REA workflow

REA (Reverse Engineer Anything, https://github.com/morluto/rea, npm `rea-agents`) is used for three
jobs in this rebuild:

- **research:** what the reference really ships and does;
- **parity:** recording the product doing scripted flows and comparing it with the reference's
  observed behaviour;
- **the done-ledger:** which claims are proven.

Its Evidence records (stable `ev_…` ids) separate observations, inferences and unknowns.

## 1. Set-up in this environment

| Item | Value |
|---|---|
| Version | `rea-agents@6.8.0`, pinned |
| Runtime | Node 24.22.1 (REA needs Node 22.23.4+, 24.22.1+ or 26.12.1+; the app itself builds on Node 22) |
| Entry | CLI wrapper `~/rea-lab/rea` (`npx -y rea-agents@6.8.0 "$@"` on Node 24) |
| Why not MCP | Registering the MCP server needs an agent restart, which this cloud session cannot do. Every MCP tool has a CLI twin returning the same Evidence |
| Browser | Pre-installed Playwright Chromium. Remote sites: a Chromium started with `--proxy-server` and a loopback CDP port, then REA `connect` mode with an explicit `target_id`. REA's `launch` mode takes no proxy flags. Local product runs can use `launch` mode directly |
| Native engines | None (no Hopper, Ghidra, IDA or JADX). Not needed: the reference's source is complete |
| Smoke check | `analyze-javascript-application` on a one-file folder → `ev_cb289a1f427ca22872484f206466f75df596fe8847dff83845c4e71e9c9a9454` |

Lab layout (outside every repository):

```
~/reference/fud-ai/      pinned, read-only reference checkout
~/reference/rea/         REA's own repo, for its docs
~/rea-lab/
  rea                    pinned CLI wrapper
  evidence/              Evidence JSON (static analyses, exports)
  captures/              research captures: live site, store contact sheets
  scenarios/             reference-side scenario files (their selectors and URLs)
  parity/                product captures, comparisons, divergences, REA ledger runs
  sandboxes/             browser profiles, throwaway homes
  briefs/                lead briefs for research sub-agents
```

Nothing under `~/rea-lab/` enters the repo. The repo may cite Evidence ids.

## 2. Research runs (done at intake)

| What | Tool | Evidence | Used by |
|---|---|---|---|
| Live marketing site, home page (accessibility tree, screenshot) | `capture-browser-scenario` (connect mode) | `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a` | specs 05, 07 |
| Worker and web code that ships to the reference's site and APIs | `analyze-javascript-application` on a copy of its `web/` folder | `ev_9c2ecdc594fd34e4da8a45d833e14cd0f2783a3ddcd904cef49e1afcb32c06da` | spec 07 |
| Shipped mobile UI | store screenshots (Play and App Store), read as images | — (files, not Evidence) | specs 02, 04, 05 |

**What REA cannot reach here.** The reference's real product is two native mobile apps. No APK or
IPA can be downloaded in this environment (the store builds are not public files), and the
container has no KVM for an Android emulator. So REA cannot inspect or drive the shipped mobile
binaries. Source reading at the pinned commit, the reference's own tests, and the store
screenshots stand in for them, and each spec marks its claims `[obs]`, `[inf]` or `[unk]`. If the
user later supplies an APK (for example pulled from their own phone with `adb`), the same workflow
extends: `inspect-android-package`, `decode-android-resources`, `search-android-classes`, and with a
device or emulator the `*-adb-*` tools.

## 3. What REA does for our own build

- **Inventory of what ships.** After each milestone, run `analyze-javascript-application` on
  `platewise/dist/` and keep the Evidence in `~/rea-lab/evidence/platewise-<milestone>.json`. It
  shows the routes, storage, network endpoints and workers that really ship. It catches dead
  features, an endpoint we did not mean to call, and any leaked reference name in the bundle.
- **Runtime check.** For flows that matter (analysis request, Coach turn), compare the static
  inventory with a captured run (`reconcile-javascript-runtime`).

## 4. Parity: record, compare, classify

The reference cannot run in a browser, so our parity pass is one-sided by necessity and says so.

1. **Scenario files** (in the repo): `platewise/parity/<flow>.platewise.json`. Each one is REA's
   declarative `capture-browser-scenario` input, with stable `data-ui` hooks, a `timeout_ms` on
   every step, and identical `environment` and `capture` blocks. They capture the accessibility
   tree, screenshots and the URL, and record page errors and network events.
2. **Product run:** a runner (`platewise/scripts/parity.ts`) builds the app, starts
   `vite preview` on a fixed port, runs each scenario through REA one at a time, and stores
   captures under `~/rea-lab/parity/platewise/`. A flow passes when REA completes every step
   and the page throws no uncaught error. AI calls go to a local scripted provider (an
   OpenAI-compatible fake on loopback), so runs are repeatable and need no keys.
3. **Reference side:** for each flow, the reference's observed behaviour is recorded as a
   *reference observation* outside the repo, in `~/rea-lab/parity/fud-ai/<flow>.md`. It holds the
   source paths and tests at the pin, the store screenshot that shows the screen, and the spec
   section. Where a live-site capture applies (the web side), it is a real REA capture. The
   repo's ledger cites the spec section, never the reference's text.
4. **Compare and classify.** Every divergence is **intended** (cite a D-id in
   `16-what-we-change.md`), a **bug** (fix it with a test that fails without the fix), a
   **reference gap** (the reference cannot show it here; say why), or **unknown** (the lead
   decides, with the user if it is visible to users). Unclassified is not allowed.
5. **Obligations.** `platewise/parity/ledger/obligations.json` holds observable claims in our
   words. `manifest.json` binds each one to its owner module and tests. A claim is **verified**
   when its steps complete on the product and the reference observation agrees, or differs only
   where intended. It is **blocked** when the reference observation could not be made.
6. **REA's own ledger:** `build-reconstruction-obligation-ledger` is fed the exported Evidence
   bundle of our captures plus the reviewed obligations. It is conservative, and our own ledger
   report is the working progress bar.

## 5. Rules

- Reference scenario files, captures and observations never enter the repo: they hold the
  reference's text, selectors and screenshots.
- Run scenarios through the real REA early. Draft files replayed by a home-made interpreter hide
  schema errors and strict-locator failures.
- One scenario at a time; one browser per scenario.
- Stop only the processes you started, by PID.
