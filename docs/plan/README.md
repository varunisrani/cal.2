# Platewise plan: start here

Platewise is a clean-room rebuild of an open-source native calorie tracker (the reference, read-only
at `/root/reference/fud-ai`, pinned at `10e14b67`) as a mobile-first installable web app: React,
TypeScript, Vite, IndexedDB, and AI calls made straight from the device with the person's own key.
Same features and flows, none of the reference's code, text or assets.

## The method in five lines

1. **Research** turned the reference into seven behaviour specs in our words (`research/01`–`07`),
   each ending with numbered traps.
2. **Decisions** pin what stays and what changes (`16-what-we-change.md`, D-ids; final).
3. **Plan** turns specs into 11 phases and 176 small tasks; each task names the reference files to
   read, the files to write and the tests that prove it (`phases/`).
4. **Build** runs Read → note → close the reference and rewrite → reopen and compare → check, with
   3–5 builder sub-agents on disjoint slices and the lead landing one commit per slice
   (`01-clean-room-protocol.md`, `phases/00-layout-and-conventions.md`).
5. **Prove** with the guards (`pnpm check --require-ref`: similarity, banned names, assets,
   licences, traps, acceptance), the REA parity pass (`02-rea-workflow.md`) and `--strict`
   acceptance at release.

## The plan on one page

| Milestone | Phases | What a person can do at the end |
|---|---|---|
| M0 | P00 foundations | Nothing new to see; CI, tokens, catalogue and the fake AI provider are ready |
| M1 | P01 domain, P02 data, P03 AI | Nothing new to see; every formula, store and AI path is tested |
| M2 | P04 shell and walking skeleton | Add a food by hand and see it on Home after a reload (Demo 1) |
| M3 | P05 onboarding and goals | Walk the wizard, get an AI or formula plan, edit targets (Demo 2) |
| M4 | P06 logging flows | Log by photo, description, barcode, reuse; edit and combine (Demo 3) |
| M5 | P07 Home depth, Progress, water, fasting | Browse days, track water and fasts, see weight and the recap (Demo 4) |
| M6 | P08 Coach | Ask the Coach about your own log (Demo 5) |
| M7 | P09 settings, data, platform | Install, work offline, export, back up and restore (Demo 6) |
| M8 | P10 hardening | v1.0: every P0/P1 feature proven by tests and the parity pass |

After v1.0: L1 i18n, L2 workouts and rest timer, L3 AI workouts and Coach workout tools, L4 speech
and direct share links, L5 live-voice spike (`18-phase-wise-build-plan.md`, After v1.0).

## Phases

| Phase | File | Tasks | Demo |
|---|---|---|---|
| P00 | [phases/P00-foundations.md](phases/P00-foundations.md) | 10 | M0 |
| P01 | [phases/P01-domain-core.md](phases/P01-domain-core.md) | 19 | M1 (domain vectors) |
| P02 | [phases/P02-data-layer.md](phases/P02-data-layer.md) | 15 | M1 (data safety) |
| P03 | [phases/P03-ai-layer.md](phases/P03-ai-layer.md) | 19 | M1 (AI pipeline) |
| P04 | [phases/P04-shell-and-walking-skeleton.md](phases/P04-shell-and-walking-skeleton.md) | 14 | Demo 1 |
| P05 | [phases/P05-onboarding-and-goals.md](phases/P05-onboarding-and-goals.md) | 15 | Demo 2 |
| P06 | [phases/P06-logging-flows.md](phases/P06-logging-flows.md) | 20 | Demo 3 |
| P07 | [phases/P07-home-progress-trackers.md](phases/P07-home-progress-trackers.md) | 17 | Demo 4 |
| P08 | [phases/P08-coach.md](phases/P08-coach.md) | 14 | Demo 5 |
| P09 | [phases/P09-settings-data-platform.md](phases/P09-settings-data-platform.md) | 19 | Demo 6 |
| P10 | [phases/P10-hardening-and-release.md](phases/P10-hardening-and-release.md) | 14 | v1.0 |
| | **Total** | **176** | |

Totals of files to create and update per phase: [phases/README.md](phases/README.md).

## Decisions

All lead decisions are in [`16-what-we-change.md`](16-what-we-change.md): §2 lists D-16.1 to
D-16.48 (identity, platform, scope, improvements), §2.8 the N-ids that 1.0 ships without, §3 the
decision log (including D-0.1, D-04.1, D-04.2). They are final; the plan follows them. Where a
choice was still open, [`18-phase-wise-build-plan.md`](18-phase-wise-build-plan.md) ends with
**Proposed D-16.49 to D-16.66**, each with a recommendation the builders follow until the lead
confirms it.

## Documents

| Doc | Holds |
|---|---|
| [00-decisions.md](00-decisions.md) | Intake: reference, licence, product name, stack, v1 scope |
| [01-clean-room-protocol.md](01-clean-room-protocol.md) | Read → Rewrite → Compare, what may be read, guards, similarity hits |
| [02-rea-workflow.md](02-rea-workflow.md) | REA set-up, research runs, parity pass |
| [03-feature-inventory.md](03-feature-inventory.md) | Every feature with an id and a tier (P0 18, P1 134, P2 8, P3 24) |
| [04-architecture.md](04-architecture.md) | Diagram, design rules, repo layout, stack, one flow end to end |
| [15-roadmap.md](15-roadmap.md) | Milestones M0–M8 with acceptance criteria, demos and risks |
| [16-what-we-change.md](16-what-we-change.md) | What stays, what changes, D-ids, not in 1.0 |
| [17-naming-and-glossary.md](17-naming-and-glossary.md) | Reference → Platewise names, UI words, glossary, banned-pattern proposals |
| [18-phase-wise-build-plan.md](18-phase-wise-build-plan.md) | The task loop, weeks and tracks, every phase, after v1.0, proposed decisions |
| [phases/](phases/README.md) | Layout and conventions, the phase index, one task file per phase |
| [research/](research/) | Behaviour specs 01–07 (our words; read-only for builders) |
| [../internals/checks.md](../internals/checks.md) | The guards and their row formats |
| [../internals/traps-ledger.md](../internals/traps-ledger.md) | 162 traps, each owned by a task or a later phase |
| [../internals/acceptance-map.md](../internals/acceptance-map.md) | 225 acceptance ids for the 152 P0/P1 features, plus known gaps |
| [../notes/_template.md](../notes/_template.md) | The task-note template |
