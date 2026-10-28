# Task: Catalogue partitions on demand (P18-00) · Phase: 18 · Owner: builder (wt-p18s0, slice S0)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The reference is a native app whose strings ship inside it;
how a web build splits its words is ours alone. Read instead: the P18 phase file (P18-00), the
brief of wave 24, `src/i18n/**` (catalogue, en, t, message, lint and their tests),
`src/app/{App,Screen,onDemand}.tsx`, `src/features/settings/registry.ts`, every `onDemand(...)` and
`import(...)` in `src/`, `src/services/*/load.ts`, `vite.config.ts`, `scripts/bundle-budget.ts`,
`src/test/setup.ts`, `e2e/support.ts`, and the tests that lint or merge the whole catalogue.

What it does (own words): today `t()` reads one catalogue merged from all 33 partitions, so every
word of every screen is in the start-up download (the `t` chunk is about 28.5 kB of gzip; the
initial JavaScript is 249.30 kB of the 250 kB budget). After this task the app starts with only
the partitions its start-up screens and services use (Home, the add flows, the shell, the
reminder engine…). The words of screens and services that are fetched on demand (the walk
recorder, onboarding, Progress, Coach, Settings and its pages, the entry editor and the review,
the Android-only services…) are fetched with them: the code that fetches such a chunk names the
partitions it needs, and the chunk is handed over only once they are registered, so a screen never
draws before its words are there. `t()` reads whatever is registered; registering a partition twice
does nothing. Tools and tests still see every partition through `en.ts`.

Inputs → outputs:
- `src/i18n/catalogue.ts`: `createLiveCatalogue(partitions)` → a catalogue that grows:
  `register(name, tree)` merges a partition in once (a second call with the same name does
  nothing), `has(name)`, `tree` (what lookups read).
- `src/i18n/startup.ts` (new): `startupPartitions`, the partitions in the start-up download.
- `src/i18n/en.ts`: `onDemandPartitions` (static, for tools and types), `enPartitions` = start-up
  ∪ on demand (the full static list, as before), `en` (merged, as before), type
  `OnDemandPartition`.
- `src/i18n/onDemand.ts` (new): one loader per on-demand partition (a dynamic import, typed so the
  list must match `onDemandPartitions`); `loadPartitions(names)`; `withPartitions(names, chunk)` →
  the chunk's module once the partitions are registered (fetched side by side);
  `pendingPartition(key)` → the on-demand partition a missing key belongs to, if it is not
  registered yet.
- `src/i18n/t.ts`: the app's `t()` reads the live catalogue (start-up partitions first);
  `registerPartition(name, tree)`; types still come from the whole catalogue (`import type`), so
  every key of every partition compiles.
- Loaders: `withPartitions([...], import('…'))` at each `onDemand(...)` or `import(...)` whose chunk
  uses an on-demand partition (App, Screen, the Settings registry, Home, Progress, Coach,
  onboarding, `src/services/*/load.ts`, the backup and diary-file services).
- `src/test/setup.ts`: registers every on-demand partition, so every screen test sees the whole
  catalogue, as before.

Edge cases / failure modes:
- A key of an on-demand partition that is not registered yet (a loader forgot to name it): in
  strict mode (tests, the dev server) `t()` throws, naming the partition; in production it draws
  nothing for that text (never the raw key), logs it once and fetches the partition, so the next
  draw has the words. A key that no partition has keeps today's behaviour (throws when strict, the
  key in production).
- Registering a partition twice, or two loaders fetching the same partition at once: one fetch, one
  merge.
- A partition that cannot be fetched (offline before the worker kept it): the chunk's promise
  rejects like a chunk that cannot be fetched, into the error boundary with Reload (as today).
- A module drawn at start-up that names a key of an on-demand partition: caught by a static test
  (below), never at run time.
- Two partitions sharing an area (`goals.reached` at start-up, the rest of `goals` on demand):
  allowed by the lint as before; a key still lives in exactly one partition.
- Words used before a draw by a service (the Android notifications, the backup file's names): the
  service's loader names the partition too.
- Onboarding runs once, on the first start: its route is fetched on demand with its words
  (onboarding, the AI setup and the methods page words), behind the start-up skeleton.

Our design differences / decisions:
- Registration lives with the loader (`withPartitions(names, import(...))`), not in the screens:
  feature modules are untouched, and the loader is where a chunk is fetched. The partition is its
  own small chunk, fetched beside the screen's chunk.
- An on-demand partition is rooted at its own name (`walk` → `{ walk: … }`), so a missing key
  tells which partition it needs; start-up partitions may share an on-demand area's root (the
  start-up pieces split from an area, e.g. `goalReached` → `goals.reached`).
- A static test (`src/i18n/onDemandCoverage.test.ts`) reads the sources: from `main.tsx` it follows static
  imports (the start-up download) and every dynamic import (a chunk fetched on demand), and checks
  that no start-up module names a key of an on-demand partition and that every chunk's loader names
  the on-demand partitions its modules use. Key names are found as string literals (exact keys, or
  template prefixes); setting names that happen to equal a message key are listed as exceptions.
- Partitions are split only by moving whole groups or keys between files; no word changes.

Tests we will write:
- `catalogue.test.ts` / `t.test.ts`: register merges once; a second register does nothing; strict
  throws for a key of an unregistered on-demand partition, naming it; production returns '' for it,
  logs once and fetches it; a key of no partition as before.
- `onDemand.test.ts`: `withPartitions` registers before the chunk resolves, fetches each partition
  once; the loader list matches `onDemandPartitions`; on-demand partitions are rooted at their own
  names; start-up and on-demand lists are disjoint and cover `enPartitions`; the static coverage
  check above.
- `lint.test.ts`: the whole catalogue (start-up ∪ on demand) still passes the lint.
- `App.test.tsx`: onboarding's Welcome is found once its chunk is in.

Compare checklist (filled after the rewrite; no reference to reopen):
- [x] Registration that `t()` reads, twice harmless (`onDemand.test.ts > createLiveCatalogue
  (P18-00) > *`; `… > the app's catalogue on demand (P18-00) > hands over a chunk only once its
  partitions are registered`, `… > keeps the first registration when a partition comes twice`)
- [x] Missing partition: throws when strict, nothing drawn in production, fetched after a miss
  (`t.test.ts > t and partitions fetched on demand (P18-00) > *`; `onDemand.test.ts > … > throws
  in tests for a key of a partition not registered yet, naming it`, `… > after a draw asked for
  words not fetched yet, says so once and fetches them`)
- [x] Every chunk names its partitions; no start-up module uses an on-demand one; no on-demand
  partition in the start-up download (`onDemandCoverage.test.ts > catalogue partitions on demand:
  what each chunk names (P18-00) > *`)
- [x] Tools and tests see every partition (`onDemand.test.ts > the partition lists (P18-00) > *`,
  `… > fetches every on-demand partition by its loader, as the tools list it`; `lint.test.ts >
  lintCatalogue > passes the real catalogue` over the whole list; `src/test/setup.ts`)
- [x] Onboarding fetched with its words on the first start (`App.test.tsx > App > boots to
  onboarding with the temporary source and opens the wizard's Welcome`, `… > shows only text from
  the catalogue`)
- Deliberate differences: none (no reference counterpart).

## Decisions for the lead

- **Missing partition**: strict mode (tests, `vite dev`) throws `Message "walk.title" is in the
  partition "walk", which is not registered yet…`; production draws nothing for that text (never
  the raw key), logs once and fetches the partition, so the next draw has the words. A key that no
  partition has keeps the old behaviour (throws when strict, the key in production).
- **Tests see the whole catalogue**: `src/test/setup.ts` registers every on-demand partition, so
  screen tests that draw a lazily loaded screen on its own are unchanged. What proves the loaders
  is the static test (`onDemandCoverage.test.ts`) and the production build in e2e. A test that calls
  `vi.resetModules()` and then imports a screen again gets fresh i18n modules with the start-up
  partitions only; it calls `registerEveryPartition()` (`src/test/partitions.ts`) after the reset
  (MethodsPage.test.tsx does).
- **Registration at the loader**: `withPartitions(names, import('…'))` fetches the chunk and the
  partitions side by side and hands the module over once they are registered. Feature modules are
  unchanged; only loader lines are. The static test needs that exact shape (no comment between the
  list and `import(`).
- **Onboarding is fetched on demand** (`App.tsx`): the route and its words (onboarding, AI setup,
  the methods page) load behind the same skeleton on the first start. This also takes the wizard's
  code out of the start-up download.
- **Splits (no word changed)**: the start-up pieces of four areas moved into their own start-up
  partitions, so the rest of each area could go on demand: `goalReached` (`goals.reached`, the
  dialog over any tab), `reminderTexts` (`reminders.breakfast…banner`: what the engine and notifier
  show, the channel), `healthBudget` (`health.home.budget`, Home's budget line) and `storageNudge`
  (`data.nudge`, Home's storage cards). `ReminderTextKey` (schedule.ts) now spans both reminder
  partitions.
- **On demand** (18): onboarding, settings, charts, about, goals, aiSetup, profile, review,
  ingredients, fitCheck, editor, progress, reminders, transfer, backup, data, health, walk.
  **Start-up** (19): common, appearance, display, ai, shell, home, log, menu, capture, reuse, scan,
  goalReached, trackers, coach, fasting, reminderTexts, appSettings, storageNudge, healthBudget.
- **Not moved**: `scan`, `capture`, `reuse`, `menu`, `log` (Home's add flows are in the start-up
  download), `ai` (the analysis errors), `fasting` (Home's fast row and dialogs). `coach` (only
  `coach.photoOnly` is used at start-up, by main.tsx), `trackers` (`trackers.water.settings.summary`
  in water/amounts.ts) and `appSettings` (`appSettings.saveFailed` on Home) could be split the same
  way for about 1.7 kB more; left whole because S2 and S3 are editing those areas in this wave.
- **A new partition**, when its slice lands: start-up → `startupPartitions` (startup.ts); on demand
  → `onDemandPartitions` (en.ts) plus its loader line in `src/i18n/onDemand.ts` (the compiler asks
  for it), rooted at its own name, and named where its screen is fetched:
  `withPartitions(['sources'], import('./SourcesSheet'))`. The static test says what is missing.
- **Setting names spelt like a key**: `backup.lastAt` is both a setting and a message; the static
  test lists the modules where it names only the setting.

## Status

Done (2026-10-28). Initial JS 249.30 kB → 219.47 kB gzip (−29.83 kB; `t` chunk 28.51 → 2.52 kB, the
entry chunk 197.98 → 180.56 kB without onboarding's code). Lines changed outside src/i18n: the
loaders (App, Screen, the Settings registry, Home, Progress, onboarding, NotifyHeader, ReminderCard,
the reminders' and diary file's services), `ReminderTextKey` in schedule.ts, `src/test/setup.ts`,
and the tests that read the split groups.
