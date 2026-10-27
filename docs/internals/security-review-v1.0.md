# Security review, v1.0 (P10-09)

Reviewed on 2026-10-27 against `e370445` plus this slice (P10 S4). Task note:
`docs/notes/P10/security-review.md`. Every claim below names the code, the test or the run it rests
on. This is an engineering review of the app as built, not an audit by a third party.

## Summary

- **No high or critical finding is open.** `pnpm audit`: 0 known vulnerabilities in 307
  dependencies.
- **Keys never reach an output.** New planted-key tests put a made-up key in every key slot (15
  AI providers and the food-database key) and search every output the app makes: the three diary
  export formats and the File handed over, the backup archive (bytes, decoded Blobs, photos) and a
  restore of it, Coach Details (stored, on screen, and in a backup made afterwards), food-request
  failure details on every wire format, every provider's request address, and the console.
  Nothing was found (§5.3).
- **The CSP holds in the built app.** 20 probes in Chromium 153 against `dist/` served by `vite
  preview`: inline scripts, inline handlers, inline styles, third-party scripts, styles and fonts,
  third-party images, frames, objects, `<base>`, blob workers and plain http beyond this device
  are all refused; the app's own scripts, CSSOM styles, Open Food Facts images, any https host
  and loopback http work (§5.1).
- **Fixed in this slice (small and local):** S-1 CSV exports could hand a spreadsheet a formula
  from a food name; S-2 the CORS probe (P03-19) could no longer load its page script under the CSP
  that P09-18 added.
- **Open, with a proposed fix:** S-3 to S-9 (one medium-low, the rest low or deployment). The
  `http://[::1]:*` CSP source: **drop it** (S-3).

## 1. What Platewise is, for this review

A local-first, bring-your-own-key web app. There is no Platewise server: the static files come
from whoever hosts them, and after that the page talks only to the AI provider the person chose
(the person's own key), Open Food Facts (no key) and FoodData Central (the person's own key). The
diary, photos, settings, Coach chat and keys live in the browser's IndexedDB on that device; a
service worker caches the app shell only.

## 2. What we protect

| Asset | Why it matters | Where it lives |
|---|---|---|
| AI provider keys and the FoodData Central key | They cost money and identify the person to a vendor | `secrets` table, each value AES-GCM sealed under a non-extractable device key kept in `meta` (D-16.51); never in settings, exports or backups (D-16.7, D-16.30) |
| The diary, weigh-ins, body fat, fasts, water | Health data | IndexedDB tables; leave the device only in files the person makes (export, backup) or in the requests the person starts (a photo or text to the AI, the Coach's snapshot) |
| Photos and Coach thumbnails | Personal images | `photos` table, Coach message rows; sent only to the chosen AI provider |
| The app's integrity | Code that runs on the origin can use the keys (D-16.7) | Static files and the service worker cache |

## 3. Who could attack, and where they come in

| Entry point | Attacker | What they control |
|---|---|---|
| AI replies (food analysis, plans, fit check, Coach) | A malicious, compromised or confused model; a prompt injected through text the model reads | Reply text, Markdown, JSON values, error bodies |
| Open Food Facts product data | Anyone (crowd-sourced) | Product names, ingredient text with allergen markup, image URL bytes |
| A backup or diary file the person opens | Whoever made or altered the file | Every byte of the file: entry names, sizes, MIME types, JSON values |
| Other web sites | Any site the person visits | Framing, links, cross-origin requests |
| The device or its storage files | Someone with the device, a backup of the browser profile | IndexedDB files, local storage |
| Dependencies and the build | A compromised package or action | Code in the bundle or in CI |
| The network | A proxy, captive portal or local network | Plain-http traffic |

## 4. Threat model

| # | Threat | What stops it | Evidence | Left over |
|---|---|---|---|---|
| T1 | Script injection from AI text, product data or a file (XSS), then key theft | No HTML sinks: every string reaches the DOM through React text nodes; no `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `DOMParser` or `srcdoc` in `src/` or `scripts/` (grep, §5.7). The CSP refuses inline and third-party script as a second wall (§5.1) | §5.1, §5.6, §5.7 | None known |
| T2 | A Coach reply with a `javascript:` or tracking link | Only `http:`/`https:` links become anchors, read through `new URL`; `rel="noopener noreferrer"`; images are never drawn from Markdown | §5.6 | A person can still click a deceptive https link (by design) |
| T3 | Keys leaking into exports, backups, error details or logs | Exports and backups never read `secrets`; error details have every stored AI key cut out before they are kept (`src/ai/errors.ts` `fromReply`); the network error text is never kept; services log only our own sentences plus error objects that carry no key | §5.3 (planted-key tests) | The food-database key is not in the AI redaction list (S-10, accepted) |
| T4 | A key sent somewhere else (another provider, an address, plain http) | Each request carries only its own provider's key, in a header, never in the address (`src/ai/plantedKey.test.ts`); plain http only to this device (D-16.26, CSP `connect-src`) | §5.3, §5.4 | Anthropic's direct-browser header is required for browser calls (inherent to BYOK) |
| T5 | A crafted backup writing outside its tables, over keys, or blowing up memory | Stored-only ZIP (no decompression bombs), CRC on every entry, plain photo names only, unknown entries skipped and listed, local tables (`secrets`, `meta`, `quarantine`) never written, all-or-nothing transaction, free-space check | §5.5 | No upper bound on `payload.json` before it is read (S-9); a Coach thumbnail keeps the file's MIME type (S-6) |
| T6 | A crafted diary file | 20 MiB cap before reading; JSON only; every value checked; one bad value refuses the whole file; replace mode touches only the file's date range, shown before the person confirms | §5.5 | Error details echo file text without a length cap (S-8) |
| T7 | A spreadsheet running a formula from an exported name | Formula-looking text gets a leading apostrophe in the CSV | S-1 (fixed), `src/services/transfer/csvFormula.test.ts` | — |
| T8 | Third-party code at run time (scripts, fonts, CDNs) | None in `dist/` (§5.2); the CSP refuses them; the barcode decoder's WASM is served from our build, not the library's CDN default | §5.1, §5.2 | `connect-src https:` would allow a CDN fetch if code asked for one (S-14, info) |
| T9 | Someone with the device's storage files | Keys sealed under a non-extractable device key (D-16.51) | `src/data/crypto.ts`, `secretsRepo.test.ts` | Code on the origin can still use the key; a passphrase lock is a later item (D-16.7) |
| T10 | Clickjacking or framing | Modern browsers partition a framed app's storage, so a frame sees an empty app; the CSP's `frame-src` blocks frames inside the app | §5.1 | `frame-ancestors` cannot be set from a meta tag (S-4: hosting header) |
| T11 | Vulnerable or hostile dependencies, CI | 4 production dependencies; exact versions; frozen lockfile in CI; actions pinned by SHA; `contents: read`; `persist-credentials: false`; licence check | §5.8, `.github/workflows/ci.yml` | `pnpm audit` is not a CI gate yet (S-15, proposed) |
| T12 | Data leaving for an unexpected host | Services never use the global `fetch` (lint rule); the CSP limits `img-src`; the service worker never caches cross-origin responses | `eslint.config.js`, `src/sw/sw.ts` | Hosts at run time are P10-08's inventory |

## 5. Checks

### 5.1 CSP, verified in the built app

The policy (`index.html`, kept as-is in `dist/index.html`; Vite's dev server strips it, the build
keeps it):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self';
img-src 'self' blob: data: https://images.openfoodfacts.org;
connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*;
worker-src 'self'; object-src 'none'; base-uri 'none'
```

Run: `pnpm build`, then a throwaway Playwright script (scratchpad, not committed) that serves
`dist/` with Vite's preview API on 127.0.0.1 and a free port, opens Chromium 153.0.8010.12 with
service workers allowed and the policy in force, answers every https request locally (nothing left
the machine), and records `securitypolicyviolation` events. `dist/index.html` has 0 inline
scripts and 0 external `src`/`href`. The preview server sends no CSP header: the meta tag is the
policy. The page loaded with no page error and no violation; the service worker began installing.

| Probe | Expected | Result | Violation reported |
|---|---|---|---|
| Inline `<script>` added to the page | refused | refused | `script-src-elem` inline |
| Inline event handler (`onerror=`) | refused | refused | `script-src-attr` inline |
| `<script src>` from another host | refused | refused | `script-src-elem` |
| `<script src>` from our own origin (control) | runs | runs | — |
| Inline `<style>` | refused | refused | `style-src-elem` inline |
| `style=""` attribute | refused | refused | `style-src-attr` inline |
| CSSOM `element.style` (what React uses; control) | applies | applies | — |
| Font stylesheet from fonts.googleapis.com | refused | refused | `style-src-elem` |
| Image from images.openfoodfacts.org | loads | loads | — |
| Image from another https host | refused | refused | `img-src` |
| `fetch` to any https host (an AI provider) | allowed | 200 | — |
| `fetch` to `http://127.0.0.1:<port>` | allowed | 200 | — |
| `fetch` to `http://localhost:<port>` | allowed | 200 | — |
| `fetch` to `http://[::1]:<port>` | see below | refused | `connect-src` |
| `fetch` to `http://192.168.1.10:11434` (LAN) | refused | refused | `connect-src` |
| `fetch` to plain http on the internet | refused | refused | `connect-src` |
| Worker from a `blob:` URL | refused | refused | `worker-src` |
| `<object>` | refused | refused | `object-src` |
| `<base href>` to another host | ignored | base stays ours | `base-uri` |
| `<iframe>` of another host | refused | refused | `frame-src` |

One more run: an HTML Blob made by the page and opened at the top level renders under the app's
origin but **inherits the policy**: its inline script was refused (`script-src`). So a
crafted file can at worst show static HTML on our origin, never run code (S-6).

**`http://[::1]:*`.** Chromium logs, on every load: "The source list for the Content Security
Policy directive 'connect-src' contains an invalid source: 'http://[::1]:*'. It will be ignored."
The CSP grammar has no IPv6 literals, so the source allows nothing (the `[::1]` probe above was
refused) and only adds a console error. Meanwhile `checkServerUrl` (`src/ai/endpoint.ts`) accepts
`http://[::1]:11434/v1` as a loopback address, so a person who saves it gets a connection failure
with no reason given. **Proposal: drop it** (S-3).

Not expressible in a meta tag, so left to hosting (S-4): `frame-ancestors`, `report-to`,
`sandbox`.

### 5.2 No third-party scripts or fonts

`dist/` holds no font file; no CSS `@import`, `@font-face` or `url()` to another host; no code
that creates a `<script>` or calls `importScripts`; `index.html` links only our own files. The
only CDN address in the bundle is zxing-wasm's built-in default for its `.wasm` file
(`fastly.jsdelivr.net`), which `src/services/barcode/wasmReader.ts` replaces with the build's own
copy (`dist/assets/zxing_reader-*.wasm`) before the reader is used. The other external hosts in
the bundle are the AI providers' and food databases' API addresses, the providers' key pages
(opened only by the person, `rel="noopener noreferrer"`), citation links (doi.org, fao.org),
package homepages on the Credits page (https only, filtered by `scripts/notices.ts`) and strings
inside library error messages. A full inventory of hosts contacted at run time is P10-08's.

### 5.3 Keys never in logs, exports, backups or error details

Shared helper `src/test/plantedKeys.ts`: one made-up key per slot (every provider that takes a
key, plus `fdc`), stored sealed through the real `secretsRepo`; a search that finds a key as typed,
URL-encoded, in UTF-16 and inside base64 at any byte offset, in text or raw bytes; and a console
recorder that reads errors through their message, stack, cause and own fields. Its own tests:
`src/test/plantedKeys.test.ts` (10).

| Output | Test file | What is searched | Result |
|---|---|---|---|
| Diary export, JSON, Markdown, CSV | `src/services/transfer/plantedKey.test.ts` (4) | Each file's text, the File handed to the share sheet and to the download (bytes, also for the sealed ciphertexts), the console, a failing download | no key |
| Backup archive | `src/services/backup/plantedKey.test.ts` (4) | The file made by the real service and handed over (share and download): bytes, every Blob decoded from `payload.json`, every photo; a restore on a fresh device (every restored table, Blobs included; no `secrets` row); a restore on a device with its own key (its `secrets` rows unchanged); a backup that fails part-way (console) | no key |
| Coach Details | `src/services/coach/plantedKey.test.tsx` (2) | Primary alone, and primary plus standby, both refusing with every AI key in the error text; keys read through the real AI access from the sealed store: each request's own key only, the stored mark, the Details text on screen, a backup made afterwards, the console | no key; Details still shows the provider's words with `•••` |
| AI requests and failure details | `src/ai/plantedKey.test.ts` (20) | Food and Coach requests of all 16 providers (address, body, headers); a photo request on Gemini, Anthropic, Mistral and OpenAI wires failing on the primary and on its standby with every key echoed (status 400, 401 and an error inside a 200): the failure, the messages we show, the console | no key in any address or body; each header holds only its own provider's key; no key in any failure or message |
| Live check output | `scripts/ai-live-check.test.ts` | Every printed line, including a browser string and a log line that carry a key | redacted |

Mutation checks (run, then reverted): a key hidden in a Coach thumbnail's bytes fails the backup
tests (3 of 4, including the restore); turning the redaction in `src/ai/errors.ts` off fails 6
tests (4 in `src/ai/plantedKey.test.ts`, 2 in the Coach file).

What the console logs today: 76 `console.error`/`console.warn` calls in `src/`, each with
our own sentence and the caught error. None is in the AI layer or the Coach session (both say so
and keep failures as values), and no error type in the app carries a request, a header or a key.

### 5.4 Loopback-only plain HTTP

Two walls. Saving: `checkServerUrl` accepts https anywhere and plain http only for `localhost`,
`127.0.0.1` and `[::1]`, and refuses user names and passwords in the address
(`src/ai/endpoint.test.ts`, R03.3, ACC-E13-1). Sending: the CSP's `connect-src` allows plain http
only to `localhost:*` and `127.0.0.1:*` (§5.1; `[::1]` is dropped by the browser, S-3). A LAN
server must sit behind https (D-16.26). The fake AI server used by e2e listens on 127.0.0.1 only.

### 5.5 Import and restore: paths and sizes

- **Backup restore** (`src/services/backup/{zip,archive,restore}.ts`): stored entries only
  (compressed, encrypted, ZIP64 and split archives refused, so no decompression bomb); every entry
  read to its end and CRC checked before anything is used; at most 65 534 entries; photo names
  must be plain (ASCII letters, digits, `.`, `_`, `-`, a jpg/jpeg/png/webp extension, at most 128
  characters, no leading dot, no `..`, no folder part); any other entry is skipped and listed, so
  nothing can point elsewhere (R06.9); names map to rows in IndexedDB, never to file system
  paths. The document is checked whole (format, version, every row through its codec, unique ids,
  every listed photo present, the content hash), free space must cover the photos, 64 KiB per
  photo, the document and a 16 MiB reserve, and the write is one transaction (R06.6). Device
  tables (`secrets`, `meta`, `quarantine`) and device settings are never written, even from a file
  that carries them (`restore.test.ts`; this slice's restore test also shows a device's own keys
  survive). Restored photos are typed from their extension (JPEG, PNG or WebP only, never SVG).
- **Diary import** (`src/services/transfer/importDiary.ts`): files over 20 MiB are refused before
  they are read; JSON only, our own format and major version; any bad value refuses the whole file
  (R06.16); no photos travel in it.
- Left over: S-6, S-8, S-9.

### 5.6 Markdown link sanitising

`src/features/coach/markdown.tsx` reads a reply into blocks and inline nodes and draws React
elements, so text always lands in text nodes. A link becomes an anchor only when its address
parses with `new URL` as `http:` or `https:` and has no whitespace; it opens with
`target="_blank" rel="noopener noreferrer"`. Anything else stays visible as the text it was.
There is no image syntax, so a reply can never make the page fetch a URL by itself. Tests:
`src/features/coach/markdown.test.tsx > MarkdownReply: safety` (script and `onerror` markup
shown as text; `javascript:`, `mailto:`, `data:`, relative, bare and spaced addresses left as
text).

### 5.7 User strings never injected as HTML

- No HTML sink in product code: a search of `src/` and `scripts/` for `dangerouslySetInnerHTML`,
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`,
  `DOMParser`, `createContextualFragment` and `srcdoc` finds none.
- Open Food Facts' allergen markup is never parsed as HTML: `src/domain/food/labelText.ts` turns
  the `<span class="allergen">` runs into markers on the plain text, and `LabelText.tsx` draws text
  and `<strong>` elements (`labelText.test.ts`).
- Every `href` in the app is a constant (key pages, links config with an https/mailto test,
  citations), an https-only package homepage, or a sanitised Coach link; every `<img src>` is an
  object URL of a stored Blob or our own icon.
- React 19 also refuses `javascript:` URLs, and the CSP refuses inline script.

### 5.8 `pnpm audit`

Run on 2026-10-27 (pnpm 10.28.0, Node 22.22.0): `pnpm audit` → "No known vulnerabilities found";
`pnpm audit --json`: info 0, low 0, moderate 0, high 0, critical 0, 307 dependencies;
`pnpm audit --prod`: none. **Decision:** nothing to update or override. Production dependencies
are four (dexie 4.4.6, react 19.3.0, react-dom 19.3.0, zxing-wasm 3.1.5), all at exact versions.
Proposed (S-15): run `pnpm audit --audit-level high` in CI so a new advisory is seen on the next
push.

## 6. Findings

| Id | Severity | Finding | Status |
|---|---|---|---|
| S-1 | Medium-low | CSV export wrote food names, notes and parts as they were; a name from an AI reply or Open Food Facts that starts with `=`, `+`, `-` or `@` (`=IMPORTXML(...)`, `=HYPERLINK(...)`) would run as a formula when the file is opened in a spreadsheet, and could send other cells to a web address | **Fixed**: `inertText` in `src/services/transfer/exportFormats.ts` puts a leading apostrophe on free text that starts with `=`, `+`, `-`, `@`, a tab or a carriage return (OWASP's advice); numbers never pass through it; JSON and Markdown keep names exactly. Test: `src/services/transfer/csvFormula.test.ts` (12) |
| S-2 | Tooling | The CORS probe (`scripts/ai-cors-probe/browser.ts`, P03-19) added its bundle as an inline script; since P09-18's CSP the page refuses it ("Executing inline script violates … script-src"), so the probe could not run against the built app | **Fixed**: the bundle is answered from an address on the app's origin (`/__platewise-cors-probe.js`, routed by Playwright) and loaded with `<script src>`. Checked: the session now opens and the probe global loads (Chromium 153) |
| S-3 | Low | `http://[::1]:*` in `connect-src` is invalid for the CSP parser, allows nothing and logs a console error on every load; `checkServerUrl` still accepts `http://[::1]` addresses, which then fail as a bare connection error | Open: drop the source from `index.html` (and from the exact-directives test in `src/app/InstallPrompt.test.tsx`), and either refuse `[::1]` in `checkServerUrl` with a hint to use `localhost` or `127.0.0.1` (change `LOOPBACK_HOSTS` and its test in `src/ai/endpoint.test.ts`), or keep accepting it and add a hint. Recommended: refuse with the hint; it changes D-16.26's list, so the lead decides |
| S-4 | Deployment | A meta CSP cannot carry `frame-ancestors`, `report-to` or `sandbox`; the static host sends no security headers | Open: when a host is chosen, send `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a long `Strict-Transport-Security`. Record them in the release checklist (P10-14) |
| S-5 | Low | `form-action` is not set and does not fall back to `default-src`: an HTML page under our origin (S-6) could post a form anywhere | Open: add `form-action 'none'` to the CSP (every form in the app handles `submit` in script) and to the exact-directives test |
| S-6 | Low | A Coach thumbnail restored from a backup keeps the MIME type written in the file (`{"@blob": <type>}`), so a crafted file can store `text/html`; opened at the top level (for example "open image in new tab") it renders static HTML on our origin. Scripts stay blocked (the Blob inherits the CSP, §5.1) | Open: in the restore, accept a thumbnail only as `image/jpeg`, `image/png` or `image/webp` (the app only ever writes JPEG), else treat the row as damaged or drop the thumbnail; together with S-5 this leaves nothing to exploit |
| S-7 | Low | The Markdown export copies names and notes into table cells with only `|`, `\` and line breaks escaped; a name with HTML or Markdown (`<img src=https://…>`, `![](…)`) will be drawn by Markdown viewers that render HTML or images, which can fetch a tracking URL when the file is previewed | Open: in `markdownCell`, also escape `<`, `>`, `[`, `]`, `!`, `` ` ``, `*` and `_` with backslashes (`exportFormats.test.ts` gains a case) |
| S-8 | Low | Diary import errors put file text into the message (`detail: String(value)`) with no length limit; a crafted file can make a very long message | Open: cut `detail` to about 40 characters with an ellipsis in `importDiary.ts` |
| S-9 | Low | Restore reads all of `payload.json` into memory before checking it; a crafted multi-gigabyte entry can exhaust the tab's memory (no code runs; the person picked the file) | Open: refuse a backup whose `payload.json` entry is over, say, 256 MiB before reading it (the app's own documents are far smaller: photos travel as separate entries) |
| S-10 | Accepted | The AI layer cuts every stored AI key out of a provider's error text, but not the food-database key | Accepted: that key is sent only to FoodData Central, in its `X-Api-Key` header, never to an AI provider, so no AI reply can echo it; `src/services/coach/plantedKey.test.tsx` checks each request carries only its own provider's key |
| S-11 | Info | The build ships source maps (`build.sourcemap: true`) | Accepted: the source is public; maps help people report problems |
| S-12 | Info | Requests to providers carry the default `Referer` policy, so a provider sees the app's origin | Open, optional: pass `referrerPolicy: 'no-referrer'` in the transport's `fetch` init (OpenRouter's attribution uses its own header, not `Referer`) |
| S-13 | Inherent | Any script running on the origin can use the stored keys (the device key is non-extractable but usable) | Accepted (D-16.7, said plainly in Settings); the CSP and the absence of HTML sinks are what keep foreign script out; a passphrase lock is a later item |
| S-14 | Info | `connect-src https:` lets the page reach any https host, as BYOK custom endpoints need | Accepted: the CSP here guards against script injection, not against exfiltration; services never use the global `fetch` (lint), and P10-08 inventories the hosts |
| S-15 | Process | `pnpm audit` is not part of CI | Open: add `pnpm audit --audit-level high` to `.github/workflows/ci.yml` (lead's file) |

## 7. Evidence

- Planted-key and CSV tests: `pnpm vitest run src/test/plantedKeys.test.ts
  src/services/transfer/plantedKey.test.ts src/services/backup/plantedKey.test.ts
  src/services/coach/plantedKey.test.tsx src/ai/plantedKey.test.ts
  src/services/transfer/csvFormula.test.ts --maxWorkers=1` (52 tests).
- CSP: `pnpm build`, then the scratchpad script described in §5.1 (20/20 probes as expected).
- Audit: `pnpm audit`, `pnpm audit --json`, `pnpm audit --prod` (§5.8).
- Sinks: `grep -rnE "dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|DOMParser|createContextualFragment|srcdoc" src scripts`
  (no product hit).
