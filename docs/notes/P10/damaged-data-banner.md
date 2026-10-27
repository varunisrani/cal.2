# Task: damaged-data banner (P10 slice S6, K9; no task id) · Phase: 10 · Owner: builder (wt-p10s6)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. The research spec asks for the banner as part of the rebuild
(`docs/plan/research/06-settings-data.md` §6 R06.1: "surface a 'some data could not be read'
banner"), and §3.18 describes only the guard, which P02-02 built; there is no reference screen to
compare against. Read instead: inventory row K9 (`docs/plan/03-feature-inventory.md`), R06.1 in
`docs/internals/traps-ledger.md`, the "Damaged-data banner" entry under Known gaps in
`docs/internals/acceptance-map.md`, `src/data/guard.ts`, `useUnreadableFlag` in
`src/data/hooks.ts`, and the shell's other notices (`src/app/UpdateBanner.tsx`,
`src/app/ReminderBanners.tsx`, `src/app/notices.module.css`).

What it does (own words): when the record guard finds a stored record it cannot read, it leaves the
record where it is, copies it into `quarantine` and sets `meta.unreadableData`. Until now nothing
showed that flag, so a person whose diary lost an entry to damage saw it silently missing. The
notice closes that: above the tab screen, in the page's flow like the update banner, a short card
says some saved data could not be read and was kept aside, not deleted. Dismiss clears the flag,
so the card goes and stays gone. Reading the same damaged record again does not bring it back; a
newly damaged record does.

Inputs → outputs: `meta.unreadableData` (through `useUnreadableFlag`) → the notice or nothing;
Dismiss → `meta.unreadableData` removed (through a small service) → the live read turns false.

Files: created `src/app/DamagedDataNotice.tsx`, `src/app/DamagedDataNotice.test.tsx`,
`src/services/damagedData.ts`; changed `src/data/guard.ts` (`clearUnreadableFlag`; the flag is
raised only when a new copy is kept aside), `src/data/guard.test.ts`, `src/i18n/en/shell.ts`
(three keys), and, shared: `src/app/App.tsx` (one line in the shell), `src/services/context.tsx`
(one optional service), `src/main.tsx` (its wiring). Docs: R06.1 in the traps ledger, K9 in the
acceptance map, the Known gaps entry removed.

Edge cases / failure modes:
- Flag not set, or still loading, or its read failed: nothing is drawn (the notice never blocks
  the app).
- Dismiss fails (storage refused): the card stays, and the failure is logged; pressing again
  retries.
- A damaged record stays in its table after Dismiss: every read drops it again, but its copy is
  already aside, so the flag stays down. A different damaged value (another record, or the same
  record damaged again differently) is a new copy and raises the flag.
- Another tab dismisses it: the live read re-runs there too (R06.3), so it goes in every tab.
- Onboarding: the wizard has no shell, so the notice shows once the tab screens do.
- No service (screens tested without one): nothing is drawn, and the data sources are not read.

Our design differences / decisions:
- The flag is raised only when a copy is newly kept aside. Before, every read of a damaged record
  raised it again, so a dismissed notice would come straight back on the next read. Decision for
  the lead: this is the smallest change that makes "Dismiss, and it stays gone" true; the
  quarantine still keeps one copy per distinct value.
- Dismiss removes the `meta` row rather than writing `false`, so the store looks as it did before
  anything was damaged.
- The write goes through a service (`damagedData.dismiss`), as screens never reach the data layer;
  the service holds no rules of its own.
- `role="status"`, not an alert: the data is safe, nothing needs doing now.
- Placed first among the shell's notices: it is about the person's own data.

Tests we will write:
- `src/data/guard.test.ts`: clearing the flag leaves the quarantine as it is; reading the same
  damaged record again leaves the flag down; a new damaged value raises it again.
- `src/app/DamagedDataNotice.test.tsx`: nothing while the flag is not set; the notice (role
  status, hooks, words) while it is; Dismiss clears it and it stays gone after the damaged record
  is read again and the notice is mounted afresh over the live state; a refused Dismiss keeps the
  notice and logs; nothing without the service.

Compare checklist (filled after the rewrite; no reference file to reopen):
- [x] Notice shows only while the flag is set (tested in `src/app/DamagedDataNotice.test.tsx` >
      DamagedDataNotice > draws nothing while no stored data has been set aside, and shows the
      notice once some has (R06.1, ACC-K9-2))
- [x] Dismiss clears the flag and the notice stays gone after a fresh mount and another read of
      the damaged record (tested in `src/app/DamagedDataNotice.test.tsx` > DamagedDataNotice >
      clears the flag on Dismiss, and stays gone after the live state is read again (R06.1,
      ACC-K9-2))
- [x] Clearing call in the data layer (tested in `src/data/guard.test.ts` > clearUnreadableFlag >
      lowers the flag, keeps the copies aside, and stays down until something new is set aside
      (R06.1))
- [x] A refused Dismiss keeps the notice (tested in `src/app/DamagedDataNotice.test.tsx` >
      DamagedDataNotice > keeps the notice when the flag cannot be cleared, and says so in the
      console)
- [x] Mutation check: with the old flag raising (raised on every read), both the guard test and
      the Dismiss test above fail.
- Deliberate differences: none against the reference (it has no such screen to compare).
- Not taken: a way to look at or export the kept-aside rows (not asked for in K9; the raw copies
  stay in `quarantine`, never in a backup).

## Status

Done (2026-10-27). Lines changed outside the task's files: `src/app/App.tsx` (the notice in the
shell), `src/services/context.tsx` (the optional `damagedData` service), `src/main.tsx` (its
wiring). Handed to the lead: the flag-raising change above, and ACC-K9-2 as a new acceptance id.
