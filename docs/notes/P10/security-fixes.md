# Task: security fixes S-3, S-5–S-9, S-12, S-15 (P10 slice S6; no task id) · Phase: 10 · Owner: builder (wt-p10s6)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): none. Every finding is about the web build (its CSP, its backup and
diary files, its `fetch` calls, its CI), which the native reference does not have. Read instead:
`docs/internals/security-review-v1.0.md` §5–§6 (the findings and their proposed fixes, and the
lead's decisions in this slice's prompt), `index.html`, `src/app/InstallPrompt.test.tsx` (the
exact-directives test), `src/ai/endpoint.ts` and its test, `src/features/ai-setup/ProviderForm.tsx`
(how a refused address is explained), `src/services/backup/{archive,payload,restore,hash}.ts`,
`src/services/transfer/{exportFormats,importDiary}.ts`, `src/ai/transport.ts`,
`src/services/barcode/http.ts`, `.github/workflows/ci.yml`.

What it does (own words): closes the open, low-severity findings of the v1.0 security review that
the lead decided, each with a test:
- S-3: the CSP's `http://[::1]:*` source is invalid in a CSP and allowed nothing, while the
  server-address check accepted `[::1]`; the source goes, and the check now refuses `[::1]` with a
  hint to type `localhost` or `127.0.0.1` instead (the browser could never reach it from the app).
- S-5: `form-action 'none'`, so no HTML on our origin can post a form anywhere.
- S-6: a Coach thumbnail coming back from a backup keeps its stored type only when it is JPEG,
  PNG or WebP; any other type (`text/html`, SVG) drops the thumbnail, the message stays.
- S-7: the Markdown export also escapes `<`, `>`, `[`, `]`, `!`, backtick, `*` and `_` in cells,
  so a name cannot become HTML, a link or an image in a Markdown viewer.
- S-8: a diary-import refusal repeats at most 40 characters of file text, with an ellipsis.
- S-9: a backup whose `payload.json` entry says it is over 256 MiB is refused before it is read.
- S-12: AI and food-database requests carry `referrerPolicy: 'no-referrer'`.
- S-15: CI runs `pnpm audit --audit-level high` after the install.

Inputs → outputs: as above, per finding.

Files: `index.html`, `src/app/InstallPrompt.test.tsx`, `src/ai/endpoint.ts`,
`src/ai/endpoint.test.ts`, `src/features/ai-setup/ProviderForm.tsx` and `src/i18n/en/aiSetup.ts`
(the new refusal's words; shared), `src/services/backup/payload.ts`,
`src/services/backup/restore.test.ts`, `src/services/backup/archive.ts`,
`src/services/backup/archive.test.ts`, `src/services/transfer/exportFormats.ts`,
`src/services/transfer/exportFormats.test.ts`, `src/services/transfer/importDiary.ts`,
`src/services/transfer/importDiary.test.ts`, `src/ai/transport.ts`, `src/ai/transport.test.ts`,
`src/services/barcode/http.ts` and a test for it, `.github/workflows/ci.yml`,
`docs/internals/security-review-v1.0.md`.

Edge cases / failure modes:
- S-3: `http://[0:0:0:0:0:0:0:1]` is written `[::1]` by the URL parser, so it is refused too;
  `https://[::1]` stays accepted (https to any host). Addresses saved before this change are not
  re-checked; they failed to connect anyway.
- S-6: the content hash is taken over the file as written (the decoded Blob's type and size), so
  dropping the thumbnail happens in the shaping step, after the hash check: a crafted file with a
  correct hash is restored without the thumbnail, never refused. The backup direction shares the
  shaping, so a stored thumbnail of another type is not carried into a new backup either.
- S-7: escaping changes the Markdown source, not what a viewer shows: `\*` renders as `*`.
- S-8: the cut counts code points, so an emoji is never split. A food's detail is its name and its
  date: the name is cut first, so the date that locates it stays.
- S-9: the size is the ZIP entry's declared size (the reader already checks every entry against its
  declared size and CRC in pieces, so nothing is held in memory before this check).
- S-12: the policy is set after the caller's init, so no caller can turn it off by accident.

Our design differences / decisions:
- S-3: a new address problem, `ipv6Loopback`, rather than folding `[::1]` into `plainHttp`: the
  fix for the person is different (another spelling of this device, not https).
- S-6: no count of dropped thumbnails: the restore result has no count of anything left out
  (`BackupSummary` counts what is restored), and the prompt asks for one only if it exists.
- S-9: refused as a damaged backup (`BackupArchiveError` `payloadTooLarge` → `damaged`), the same
  words a person sees for any file that does not read back; our own backups are far below the cap.
- S-15: `pnpm audit` runs right after Install and before Lint, so a new high advisory fails fast.
- D-16.26's loopback list changes (`localhost`, `127.0.0.1`): written up for the lead,
  who recorded it as D-16.88.

Tests we will write:
- `src/app/InstallPrompt.test.tsx`: the exact-directives test without `[::1]` and with
  `form-action 'none'`.
- `src/ai/endpoint.test.ts`: `[::1]` refused as `ipv6Loopback`, the others still accepted.
- `src/features/ai-setup/ProviderForm.test.tsx`: the refusal shows its hint.
- `src/services/backup/restore.test.ts`: a crafted `text/html` thumbnail is dropped, the message
  and a JPEG thumbnail kept.
- `src/services/backup/archive.test.ts`: a payload entry declaring 256 MiB + 1 is refused without
  reading its bytes (a stubbed entry size); exactly 256 MiB is not refused for its size.
- `src/services/transfer/exportFormats.test.ts`: the new characters escaped.
- `src/services/transfer/importDiary.test.ts`: a long name, meal and date cut to 40 characters.
- `src/ai/transport.test.ts`, `src/services/barcode/http.test.ts`: the init carries
  `referrerPolicy: 'no-referrer'`.

Compare checklist (filled after the rewrite; no reference file to reopen):
- [x] S-3 CSP (tested in `src/app/InstallPrompt.test.tsx` > index.html > carries the CSP with
      exactly these directives, before anything loads (ACC-L6-1))
- [x] S-3 address check (tested in `src/ai/endpoint.test.ts` > checkServerUrl: which addresses can
      be saved (D-16.26, R03.3) > refuses [::1], which the CSP cannot allow, with a hint to use
      localhost or 127.0.0.1)
- [x] S-5 (same CSP test)
- [x] S-6 (tested in `src/services/backup/restore.test.ts` > inspectBackup and applyBackup > drops
      a Coach thumbnail that is not a JPEG, PNG or WebP image, and keeps its message (S-6); fails
      with the type check taken out)
- [x] S-7 (tested in `src/services/transfer/exportFormats.test.ts`)
- [x] S-8 (tested in `src/services/transfer/importDiary.test.ts`)
- [x] S-9 (tested in `src/services/backup/archive.test.ts`)
- [x] S-12 (tested in `src/ai/transport.test.ts` and `src/services/barcode/http.test.ts`)
- [x] S-15 (`.github/workflows/ci.yml`; the command run here: "No known vulnerabilities found")
- Deliberate differences: none against the reference (nothing to compare).
- Not taken: S-4 (hosting headers) stays open for the release checklist (P10-14).

## Status

Done (2026-10-27). Lines changed outside the task's files: `src/features/ai-setup/ProviderForm.tsx`
and `src/i18n/en/aiSetup.ts` (the words for the new address refusal),
`src/features/ai-setup/ProviderForm.test.tsx` (one case), `docs/user/ai-keys.md` (one sentence:
`[::1]` is no longer accepted). Handed to the lead: the text for S-3,
recorded as D-16.88.
