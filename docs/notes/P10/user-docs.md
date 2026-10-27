# Task: user docs (P10-13) · Phase: 10 · Owner: builder (wt-p10s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The row's "Read in reference" column says none, and the docs
must not lean on the reference's README, store listings or help texts (the similarity check runs
over `docs/`). Read instead: research specs `03-ai-providers.md` §3.3, §3.9–3.10, §3.12–3.13,
§3.15; `04-coach.md` (context and tools); `06-settings-data.md` §3.13–3.18, §5; decisions
D-16.2, D-16.5, D-16.7, D-16.8, D-16.10, D-16.26, D-16.28, D-16.29, D-16.30, D-16.42, D-16.82
and the proposed D-16.49/51/52; the wave 14 prompts (`docs/handoff/wave14/`) for the Settings
pages that are landing now. Every statement was checked against our code: the catalogue
partitions in `src/i18n/en/` (the words people see), `src/ai/catalog/{providers,presets}.ts`,
`src/features/ai-setup/keyPages.ts`, `src/ai/{endpoint,image,settings}.ts`,
`src/services/coach/{context,toolSchemas,tools,history,engine,session}.ts`,
`src/data/{storage,crypto,wipe,schema}.ts`, `src/services/backup/{payload,hash,backup}.ts`,
`src/domain/{units/defaults,food/addMenu,forecast/evidence}.ts`, `src/app/InstallPrompt.tsx`,
`src/sw/sw.ts`, `index.html` (CSP), `public/manifest.webmanifest`; and against the built app
(`pnpm build`, `vite preview` on a private port, a throwaway Playwright walk in the scratchpad:
Welcome, the wizard to Set up later, Plan ready, Home, the + menu, Settings, AI providers, Coach,
Tracking & reminders, App settings; no page errors).

What it does (own words): six short pages under `docs/user/` for people who use Platewise, not for
contributors. Getting started covers opening and installing the app and the 13 setup steps up to
the first plan and the first log. AI keys says what uses AI and what does not, where each of the 16
providers makes keys, what costs money and how to keep it low, and how to run Ollama on the same
device or behind https (plain http only to this device, D-16.26). Privacy and storage says what is
kept in the browser, what leaves the device and to whom, how keys are kept, why storage can be lost
and how persistence and backups help. Backup says how to back up, restore and move to another
device, and how the diary export and import differ. Logging tips covers the + menu methods, the
review, editing after logging, reuse, days, water and fasting. Coach says what the Coach sees on
each question, what its tools can read, what it cannot see or do, and how the chat is kept.

Inputs → outputs: the built app and its code → Markdown pages a person can read on GitHub or
from About.

Files: created `docs/user/getting-started.md`, `docs/user/ai-keys.md`,
`docs/user/privacy-and-storage.md`, `docs/user/backup.md`, `docs/user/logging-tips.md`,
`docs/user/coach.md`, this note. Not touched: `src/config/links.ts` (it does not exist on this base:
P09-16 creates it with About; see the decisions below).

Edge cases / failure modes:
- Pages that land in wave 14 are not on this base: Settings › Your data (P09-15: Export, Import,
  Backup, Restore, Clear diary, Erase everything, the storage card and nudges), About (P09-16),
  restore on Welcome (P09-14: the Welcome button exists, its flow does not), the reminders section
  (P09-09). The docs name them by the titles the wave 14 prompts fix ("Your data", "About
  Platewise", "Restore from a backup file") and by the words already in the catalogue (`backup`,
  `transfer`, `onboarding.welcome.restore`). Each such statement is listed for the lead to recheck
  once wave 14 lands.
- The hub today lists Add menu, Product details and Tab bar at the top level; P09-01 nests them
  under App settings. The docs always say "App settings, under More", which is true both before and
  after (the App settings page already links them under "More").
- Vendor facts move: key pages, model names and prices. The docs name the key place as the app
  does and give the address the app links, name no model beyond the ones the pickers offer, and
  give no prices.
- Browser behaviour differs (persistence prompts, eviction, install). The docs say what Platewise
  does and keep browser claims general, except Safari's home-screen rule, which
  `src/data/storage.ts` already documents.

Our design differences / decisions:
- Our own words and structure throughout; no reference text read, so nothing to paraphrase.
- Six pages, no index page: Getting started ends with a list of the other five and is the page an
  About "Help" link should open. An index (`docs/user/README.md`) is easy to add later if the lead
  wants a folder landing page.
- Decisions for the lead: (1) `src/config/links.ts` and the About page are not on this base
  (P09-16, wave 14), so there is no docs link slot to fill; when it lands, point its help or docs
  link at `docs/user/getting-started.md` (one line). (2) Recheck after wave 14 lands, against the
  real screens: the path "Settings › Your data" and its button names (backup.md,
  privacy-and-storage.md), "Clear diary" and "Erase everything" as named there, the storage card's
  persistence line, the 14-day backup reminder (from the P09-15 prompt), the Welcome restore flow
  (backup.md), the reminder switches and their place (getting-started.md, logging-tips.md).

Tests we will write:
- None in code: these are documents. Checks instead: `PLATEWISE_REF=/root/reference/fud-ai pnpm
  check --require-ref` (similarity over `docs/` included), `pnpm fmt:check`, `pnpm lint`,
  `pnpm typecheck`, and a throwaway script (outside the repo) that resolves every relative link and
  anchor in `docs/user/`.

Compare checklist (filled after the rewrite; no reference reopened: the row reads none, so the
compare is against our code and the built app; the existing tests named below were run on this
worktree, 6 files, 104/104 passed):
- [x] Every provider, key place and key address matches `providers.ts` and `keyPages.ts`
  (ai-keys.md table; read side by side)
- [x] Plain http only to `localhost`, `127.0.0.1`, `[::1]`; the `/v1` hint for Ollama (ai-keys.md;
  `src/ai/endpoint.test.ts > checkServerUrl: which addresses can be saved (D-16.26, R03.3) >
  refuses plain http to the local network or the internet, with the reason`,
  `src/features/ai-setup/ProviderForm.test.tsx > ProviderForm > refuses http://10.0.0.2:11434/v1
  and says why (ACC-E13-1, D-16.26, R03.3)`)
- [x] What the Coach sees matches `context.ts`, `toolSchemas.ts`, `tools.ts` and `history.ts`
  (coach.md; `src/services/coach/context.test.ts > coachContext: what never enters it`,
  `src/services/coach/tools.test.ts > runCoachTool: limits keep the newest rows (R04.10,
  D-16.32)`)
- [x] What a backup holds and leaves out matches `payload.ts` and `hash.ts` (backup.md;
  `src/services/backup/backup.test.ts > makeBackup > never holds a key, the rows kept aside or
  this device’s state (ACC-E14-2, R06.7)`)
- [x] Persistence asked once after the first entry (privacy-and-storage.md;
  `src/data/storage.test.ts > requestPersistence (R06.19, D-16.8) > asks the browser once even
  when asked twice, and shows the answer`)
- [x] Every relative link and anchor in `docs/user/` resolves (throwaway script: 23 links, 0
  broken); no 9-word run shared with any reference text file (throwaway script: 0); the closest
  similarity region in `docs/user/` scores 0.58 (`backup.md`, the export range labels)
- Deliberate differences: none in behaviour; these pages describe the app as built.
- Not taken: prices per provider, screenshots, a page per provider.

## Status

Done (2026-10-27). Six pages in `docs/user/` (Prettier-clean when checked past the repo's
`docs` ignore) and this note. No lines changed outside the task's files. Handed on: the About
link (P09-16's `src/config/links.ts`) and the wave 14 rechecks listed under "Decisions for the
lead".
