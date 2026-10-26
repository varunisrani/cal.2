# Phases: index and how a phase runs

Start with [`00-layout-and-conventions.md`](00-layout-and-conventions.md) (the repo tree and the rules every task follows), then the phase file. A builder gets one phase file, its task note and the research spec for the area, and nothing else.

## Totals

| Phases | Tasks | Files to create | Files to update | Fixtures | Task notes |
|---|---|---|---|---|---|
| 11 | 176 | 682 | 45 | 12 | 176 |

Files to create count each test file separately (tests sit next to code). Weeks are calendar weeks with 3–5 parallel builders; the domain/data/AI and UI tracks overlap as shown in `../18-phase-wise-build-plan.md`.

## Phase index

| Phase | File | Title | Weeks | Tasks | Create | Update | Fixtures | Notes | Demo | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| P00 | [`P00-foundations.md`](P00-foundations.md) | Foundations (remaining work) | 1 | 10 | 49 | 6 | 2 | 10 | M0: branded placeholder, green checks | 🔨 in progress |
| P01 | [`P01-domain-core.md`](P01-domain-core.md) | Domain core (pure TypeScript) | 1–2 | 19 | 70 | 0 | 1 | 19 | M1 part 1: domain vectors | planned |
| P02 | [`P02-data-layer.md`](P02-data-layer.md) | Data layer (Dexie schema and repositories) | 2 | 15 | 47 | 0 | 0 | 15 | M1 part 2: data safety cases | planned |
| P03 | [`P03-ai-layer.md`](P03-ai-layer.md) | AI layer (catalogue, adapters, client, parsers, prompts) | 2–3 | 19 | 63 | 1 | 1 | 19 | M1 part 3: AI pipeline cases | planned |
| P04 | [`P04-shell-and-walking-skeleton.md`](P04-shell-and-walking-skeleton.md) | App shell, UI primitives and the walking skeleton | 2–3 (primitives can start in week 1 on the UI track) | 14 | 84 | 3 | 1 | 14 | Demo 1 (M2): manual entry on Home | planned |
| P05 | [`P05-onboarding-and-goals.md`](P05-onboarding-and-goals.md) | Onboarding and goals | 2 | 15 | 64 | 4 | 1 | 15 | Demo 2 (M3): onboarding with AI plan | planned |
| P06 | [`P06-logging-flows.md`](P06-logging-flows.md) | Logging flows | 3 | 20 | 90 | 5 | 3 | 20 | Demo 3 (M4): photo, barcode, reuse, edit | planned |
| P07 | [`P07-home-progress-trackers.md`](P07-home-progress-trackers.md) | Home depth, Progress, water, fasting, weight and body fat | 2–3 | 17 | 68 | 7 | 0 | 17 | Demo 4 (M5): days, water, fasting, Progress | planned |
| P08 | [`P08-coach.md`](P08-coach.md) | Coach | 2 | 14 | 43 | 2 | 1 | 14 | Demo 5 (M6): Coach answers from the log | planned |
| P09 | [`P09-settings-data-platform.md`](P09-settings-data-platform.md) | Settings, data and platform | 2–3 | 19 | 74 | 11 | 2 | 19 | Demo 6 (M7): install, offline, backup/restore | planned |
| P10 | [`P10-hardening-and-release.md`](P10-hardening-and-release.md) | Hardening and release | 2 | 14 | 30 | 6 | 0 | 14 | M8: v1.0 release checklist | planned |

After v1.0: L1–L5 (see `../18-phase-wise-build-plan.md`, After v1.0). Each gets its own phase file in this format when it is scheduled.

## How a phase runs

1. **Slice.** The phase file lists slices and waves. A slice is a set of tasks whose files no other slice in the same wave touches. Files to update are owned by exactly one task per phase.
2. **Build.** One builder per slice, in its own git worktree. For each task: read the spec section and the listed reference files, write the task note in our words, close the reference and write the code and tests, reopen and compare, then run the loop until green.
3. **Catalogue partitions.** Each slice writes its copy into its own partition under `src/i18n/en/`. Only the lead adds the partition import to `src/i18n/en.ts` when the slice lands (Proposed D-16.55).
4. **Land.** The lead reruns the whole loop on the merged head, lands one commit per slice (format in `00-layout-and-conventions.md`), swaps the slice's `Review:` lines in the traps ledger and acceptance map for `Test:` lines, and updates the Status line of the phase file.
5. **Write back.** Anything a builder had to decide that the plan did not say goes back into the phase file (and, if users can see it, into `16-what-we-change.md` §2.7 through the lead) so later phases stay consistent.
6. **Demo.** A phase that ends a milestone is done only when its demo runs live (see Done when).
