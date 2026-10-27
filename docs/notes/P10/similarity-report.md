# Task: similarity report (P10-10) · Phase: 10 · Owner: builder (wt-p10s4)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): only the reference lines that a similarity or overlap run names,
as the clean-room protocol's §6 asks ("read the hit"), never to write from. Read first:
`docs/plan/01-clean-room-protocol.md` §5–6, `docs/internals/checks.md` (gates, `--closest`, the
allow-list), `tooling/checks/similarity/allow.json`, `docs/plan/research/README.md` (how the
specs passed a 9-word overlap check), HANDOFF "Similarity findings for the P10-10 report", and
the 9-word tool `ngram_overlap_check.py` from the clean-room-rebuild skill.

What it does (own words): proves, with numbers, that Platewise's text is its own at v1.0. Three
runs: the full guard set with the reference required, the similarity ranking of the 30 regions
nearest a gate, and a 9-word overlap run over `docs/` (the skill's tool, plus a run of the same
tokenising over every text file of the reference, because the skill's tool skips Kotlin, Swift
and XML, where most of the reference's prose lives). Any region close to a gate is rewritten from
what our own code does, not reworded; every allow-list entry is listed with its reason; earlier
near-misses recorded in HANDOFF are carried into the report.

Inputs → outputs: the worktree and `/root/reference/fud-ai` →
`docs/internals/similarity-report-v1.0.md` with the commands, the counts, the ranking, the
overlap hits classified (vendor fact, identifier list, citation, quoted test name, prose), what
was rewritten and what was left and why.

Files: created `docs/internals/similarity-report-v1.0.md`; changed
`tooling/checks/similarity/allow.json` (one entry, with its reason) and the 11 rewritten regions
listed in the report's §4 and in Status.

Edge cases / failure modes:
- Ranked JSON that is not ours: `src/generated/notices.json` holds licence texts that must stay
  verbatim; it is ranked by `--closest` (JSON is never gated) and tops the list above 1.00.
- A run in `docs/plan/**` (vendor wire facts, model ids, labels the specs had to name): not ours
  to edit in this slice; list it for the lead with a reason or a proposed rewording.
- A quoted test name repeated in the ledgers: rewriting it means changing the test name and every
  `Test:` line that quotes it, together, or the traps and acceptance checks fail.
- "Near a gate": a region one unit short of firing (11 of 12 words, 5 of 6 lines, 45 of 50
  tokens), i.e. a score of 0.90 or more.

Our design differences / decisions:
- Generated third-party licence texts go on the allow-list with their reason, the same reason the
  reference's notice in `THIRD_PARTY_NOTICES.md` already has: they must not be rewritten.
- A paper title in a citation stays as published (a third-party fact).
- The 9-word scan over the whole reference tree is a throwaway script in the scratchpad (same
  tokenising as the skill's tool); its output is summarised in the report, not committed.

Tests we will write:
- None new: the evidence is the three runs, each repeated after every rewrite, and the traps and
  acceptance checks green after any renamed test.

Compare checklist (filled after the rewrite; reopened the reference lines each hit names):
- [x] `check --require-ref` green, numbers recorded (report §1: six PASS, exit 0)
- [x] `--closest 30`: every region below 1.00 after the allow-list entry; nothing at 0.90 or more
  left that is ours to rewrite (the three at 0.92: two `docs/plan` lines for the lead, one paper
  title)
- [x] 9-word runs over `docs/` classified; prose runs outside `docs/plan` rewritten (skill tool: 4
  runs, all vendor facts; full tree: 337 → 333, one place left outside `docs/plan`, a header name)
- [x] Every allow-list entry listed with its reason (report §3)
- [x] HANDOFF near-misses (P03-15/16, P05-12) carried into the report (§6)
- [x] Tests after each rewrite: `src/app/TabBar.test.tsx`,
  `src/features/settings/tracking/MealTimesSheet.test.tsx` (25/25 together); `src/i18n`,
  `src/features/coach/CoachPage.test.tsx`, `src/features/log/scan` (142/142); `src/ai/parse`,
  `src/domain/units/energy.test.ts`, `src/services/barcode/fdc.test.ts`,
  `src/features/log/review/ProductBlock.test.tsx`, `src/domain/progress` (286/286); traps and
  acceptance checks resolve the renamed TabBar test
- Deliberate differences: none in behaviour; six UI strings changed wording (the four meal-time
  labels, the Open Food Facts network message, the Coach's empty-chat lead).
- Not taken: rewording `docs/plan/research/06-settings-data.md:86-87` and
  `07-later-phases-and-web.md:75` (0.92, outside this slice); the `x-goog-api-key` test name
  (0.75, a header name).

## Status

Done (2026-10-27). Report written. Changed outside the task's own file:
`tooling/checks/similarity/allow.json` (entry for `src/generated/notices.json`, with its reason);
copy in `src/i18n/en/{trackers,scan,coach}.ts`; comments in `src/domain/progress/ranges.ts`,
`src/ai/parse/parts.ts`, `src/domain/units/energy.ts`, `src/services/barcode/fdc.ts`; test names in
`src/app/TabBar.test.tsx` and `src/features/log/review/ProductBlock.test.tsx`; the lines quoting the
TabBar test in `docs/internals/acceptance-map.md`, `docs/internals/traps-ledger.md` and
`docs/notes/P04/tab-bar.md`; one sentence each in `docs/notes/P06/fooddata-central-client.md` and
`docs/notes/P09/backup-archive-codec.md`. For the lead: the two `docs/plan` regions at 0.92.
