# 00 · Intake decisions

Recorded 2026-10-26. These are the user's answers at intake, plus the defaults the lead chose.
This is an engineering record, not legal advice.

## Reference

| Item | Value |
|---|---|
| Reference | `apoorvdarshan/fud-ai` (https://github.com/apoorvdarshan/fud-ai) |
| Pinned commit | `10e14b67116c52b515d2389621266e32b3a99840` |
| Licence | MIT, Copyright (c) 2026 Apoorv Darshan |
| Where it lives | `~/reference/fud-ai` (outside this repo, read-only) |
| What ships | iOS app (App Store), Android app (Google Play), marketing site and worker APIs (fud-ai.app on Cloudflare) |
| Size at the pin | about 235k lines: iOS SwiftUI ~103k, Android Kotlin/Compose ~109k, web/worker TypeScript ~16k |

Licence row (skill reference 01 §3): permissive (MIT). We proceed. Nothing is copied; the MIT
notice is kept as credit in `THIRD_PARTY_NOTICES.md`, and the README says the design was inspired
by the reference. The reference's name, logo, icons, colours, illustrations and screenshots are
never used as ours.

## Product

| Decision | Value |
|---|---|
| Product name | **Platewise** (env prefix `PLATEWISE_`) |
| Banned in product code | the reference's product name and brand strings, its repo slug, its package id and package path, its author handle, and its distinctive identifiers. The full list is in `platewise/tooling/checks/banned-patterns.json` |
| Stack | Mobile-first installable PWA: React + TypeScript + Vite, local-first storage (IndexedDB), BYOK AI calls straight from the device. Can be wrapped later with Capacitor. Recorded as D-0.1 in the what-we-change doc |
| v1 scope | Core tracker + AI + Coach: onboarding and goals (BMR/TDEE, adaptive goals), food logging by photo, text, barcode and manual entry, BYOK AI providers with fallback, saved meals, Home, Progress, weight, water and fasting, AI Coach chat, settings, backup and export. Workouts, voice, i18n and the server features come in later phases |
| Location | Self-contained folder `platewise/` in the `Ai1` repo, branch `claude/elegant-cannon-peaxt4`. The rest of the repo is untouched |
| Clean-room variant | Read → Rewrite → Compare (permissive licence; one lead agent with builder sub-agents) |
| Agents | One lead agent in this session; no second account. PRs, tags and releases only when the user asks |

## REA

| Item | Value |
|---|---|
| REA | `rea-agents@6.8.0` (https://github.com/morluto/rea), used through its CLI on Node 24.22.1 |
| Why the CLI | MCP registration needs an agent restart, which this cloud session can't do. Every REA tool has a CLI twin, and its Evidence is the same |
| Smoke check | `analyze-javascript-application` on a one-file folder returned `ev_cb289a1f427ca22872484f206466f75df596fe8847dff83845c4e71e9c9a9454` |
| Live-site capture | `capture-browser-scenario` (connect mode) on the reference's marketing site returned `ev_fa243a1fe14ed63cc6252910410ee973c07740c25cc70484db1eab53b44d991a` |
| Lab folder | `~/rea-lab/` (evidence, captures, scenarios, sandboxes). Never committed |
| Not available here | Native engines (Hopper, Ghidra, IDA, JADX). No shipped APK or IPA can be fetched, so the mobile binaries can't be inspected; source reading plus the store screenshots and live site stand in for them |
