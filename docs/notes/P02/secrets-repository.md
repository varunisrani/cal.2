# Task: secrets repository (P02-12) · Phase: 02 · Owner: builder (wt-p02s5)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `A/data/KeyStore.kt` (all: one encrypted key/value file, entries
named by provider plus the food-database key, blank deletes, a failed open wipes the file and the
master key and starts again), `I/Services/KeychainHelper.swift` (all: save deletes then adds,
load, delete), and the masking helper in `A/ui/settings/SettingsViewModel.kt` that spec 03 §3.12
points at. Research spec `03-ai-providers.md` §3.12 and §6 R03.27, `06-settings-data.md` §3.18
(secret store corruption), §3.19 and §5 (secret storage on the web); decisions D-16.7, Proposed
D-16.51. Neither platform has tests for its key store. No Evidence ids.

What it does (own words): the person's API keys (one per AI provider) and their food-database key
live in their own table, `secrets`, one row per slot. A value is trimmed before it is stored, and
saving a blank value removes the slot. Each value is encrypted with AES-GCM under one device key:
a non-extractable WebCrypto key made the first time a key is saved and kept in `meta` as the key
object itself (IndexedDB can store a CryptoKey without ever exposing its bytes). Each value gets a
fresh 12-byte IV, so the table holds only `{iv, data}`, never the plain key. This protects copies
of the raw storage files only; code running on the site can still use the key (the D-16.7 warning
stays). If the device key is missing or unusable, or any stored value cannot be decrypted, the
store cannot be trusted: every slot reads as unset and the table is emptied, so the person types
their keys again; nothing throws while the app starts (R03.27). Settings shows a saved key masked:
its first four characters, "…", its last four.

Inputs → outputs:
- `crypto.ts`: `createWrapKey(crypto, ids?)` → a non-extractable AES-GCM 256 key with an id;
  `readWrapKey(db)`
  / `storeWrapKey(db, wrap)` keep it in `meta` under `wrapKey`; `encryptText(key, text)` →
  `{iv, data}`; `decryptText(key, sealed)` → text, or rejects when the value cannot be opened.
  WebCrypto comes through a small seam (`CryptoLike`, default `globalThis.crypto`).
- `secretsRepo.ts`: `createSecretsRepo(db, {crypto?, clock?, ids?})` → `set(slot, value)` (trims;
  blank removes), `get(slot)` → string or null, `slots()` → the slots holding a key, sorted,
  without their values, `remove(slot)`. `mask(value)` → masked text. `FDC_SLOT = 'fdc'`; any other
  slot is a provider id.

Files: created `src/data/crypto.ts`, `src/data/crypto.test.ts`, `src/data/repos/secretsRepo.ts`,
`src/data/repos/secretsRepo.test.ts`, this note.

Edge cases / failure modes:
- `" sk-abc \n"` is stored as `sk-abc`; a value that trims to nothing deletes the slot.
- The device key row is missing (cleared storage, a partial restore) while rows remain: every read
  returns nothing and the rows are deleted; the next save makes a new key.
- A row whose value fails to decrypt (wrong key, damaged bytes) or whose shape cannot be read: same
  as above, for every slot, not only the broken one. A row that cannot be read is kept aside in
  `quarantine` by the guard before it is deleted (it holds ciphertext, never the plain key).
- The stored device key is not a usable non-extractable AES-GCM key: treated as missing; it is
  replaced (kept aside first) when the next key is saved.
- Making the device key: when two saves race, both generate, the first to write wins and the other
  uses the stored one; making a new key deletes any rows sealed by a lost key in the same
  transaction, so a fresh value never sits next to rows that would fail and take it down with them.
- The device key changes between encrypting and writing (another tab recovered at that moment):
  the write is refused, so a value sealed under a replaced key is never stored.
- Clearing after a failed read deletes the rows that read saw (and any unreadable row), not a row a
  save wrote in between.
- No WebCrypto (an insecure origin): reads return nothing, nothing is deleted, `set` rejects.
- Invalid slot names (empty, spaces, upper case, long) are refused with a TypeError: a programming
  error, not user input.
- `mask`: 8 characters or fewer → dots only (eight, so a short key's length is not shown); blank →
  empty string; counted by code point.

Our design differences / decisions:
- One table with one encrypted row per slot, wrapped by a device key (D-16.51) instead of an
  encrypted key/value file or the Keychain; no encrypted key names (slot names are not secret).
- Values are trimmed on save for every slot (the reference trims only some fields, R03.20).
- Recovery is per read, not per open: there is no "open the store" step to fail, so any read that
  meets a lost key or a bad value empties the table instead of crashing (R03.27).
- No speech slots, challenge token or backup token in v1 (later phases add slots; the slot rule
  already allows them).
- Short keys are fully hidden; the reference shows them whole.
- Export and backup never read this table (P09 enforces it with a test).

Tests we will write:
- crypto: a value encrypted and decrypted comes back; each encryption uses a fresh 12-byte IV; the
  key is not extractable; a CryptoKey stored in `meta` through fake-indexeddb comes back usable; a
  different key or a changed byte fails to decrypt; an unusable stored key reads as null.
- secrets: round trip per slot; `" sk-abc \n"` stored as `sk-abc`; blank deletes; `slots()` lists
  only filled slots without values; stored bytes (row and meta) do not contain the plain key;
  deleting the device key → `get` null for all, table empty, no throw, and a new save works;
  a damaged value → all unset and the table empty; an unreadable row is kept aside then cleared;
  one key survives a reopen; two saves racing on a fresh store share one device key; a key replaced
  between encrypting and writing refuses the write; no WebCrypto → reads empty, `set` rejects;
  `mask` of a 40-character key shows 4 + … + 4, short keys show dots only (ACC-E14-1).

Compare checklist (filled after the rewrite; reopened `A/data/KeyStore.kt`,
`I/Services/KeychainHelper.swift`, the masking helper in `A/ui/settings/SettingsViewModel.kt` and
its callers):
- [x] One entry per provider plus the food-database key; save, load, delete
  (`src/data/repos/secretsRepo.test.ts > set and get > round-trips a key per slot`, `> replaces the
  key of a slot`, `> lists the slots that hold a key, without their values`).
- [x] Saving a blank value deletes the entry; the food-database key is trimmed (here every slot is)
  (`secretsRepo.test.ts > set and get > deletes the slot when the value is blank`, `> trims a key
  before storing it: " sk-abc " and a newline reads back as "sk-abc"`).
- [x] Values are encrypted at rest under a device key the app cannot export (D-16.51)
  (`secretsRepo.test.ts > set and get > never stores the plain key, in the table or beside the
  device key (D-16.51)`; `src/data/crypto.test.ts > device key > is an AES-GCM 256 key that cannot
  be exported`, `> survives a trip through IndexedDB as the key object and still opens what it
  sealed (D-16.51)`; `crypto.test.ts > encryptText and decryptText > draws a fresh 12-byte nonce
  for every encryption`, `> round-trips a text`).
- [x] A store that cannot be opened starts empty instead of crashing; only the keys are lost
  (R03.27) (`secretsRepo.test.ts > recovery (R03.27) > reads every slot as unset and empties the
  table when the device key is gone, without throwing`, `> reads every slot as unset when one
  value fails to decrypt, and empties the table`, `> reads every slot as unset when the device key
  is replaced by another`, `> starts a new device key without the rows of the lost one`, `> keeps
  an unreadable row aside before emptying the table`; `crypto.test.ts > device key > reads an
  unusable stored key as null and keeps the row aside`, `> encryptText and decryptText > refuses
  to open a value under another key`, `> refuses to open a value with one byte changed`).
- [x] A saved key is shown masked as first 4, an ellipsis, last 4 (ACC-E14-1)
  (`secretsRepo.test.ts > mask (ACC-E14-1) > shows the first four and the last four characters of
  a 40-character key`, `> shows dots only for a key of eight characters or fewer`, `> shows
  nothing for a blank key and ignores surrounding spaces`).
- [x] Keys survive restarts (`secretsRepo.test.ts > set and get > keeps the keys across a reopen
  with one device key`), and two tabs saving at once share one device key (`> makes one device key
  when two saves race on a fresh store`, `> refuses a save whose device key was replaced while it
  was encrypting`).
- Deliberate differences: every slot is trimmed (the reference trims only some fields, R03.20);
  keys of 8 characters or fewer are hidden whole (the reference shows them in full); recovery runs
  on every read instead of once at open, and keeps a usable device key (the reference rebuilds
  its master key too; a key that still encrypts and decrypts needs no replacing); slot names are
  not encrypted; the iOS delete-then-add save is one `put`.
- Not taken: speech-provider keys and their fall back to the matching AI key (voice phase), the
  challenge and backup tokens, keeping a challenge token through Delete All Data (no remote
  challenge in v1), the "AfterFirstUnlock" accessibility class (no web equivalent).

## Decisions for the lead

- `mask` hides a key of 8 characters or fewer as eight bullet dots whatever its length; blank → ''.
- Slot names match `/^[a-z0-9][a-z0-9._-]{0,63}$/` (provider ids and `fdc`; later slots such as
  speech keys fit); `set` and `remove` throw a TypeError for anything else, `get` returns null.
- Recovery deletes rows, not the device key: a usable key stays and seals the next values. A new
  device key is made only when none usable is stored, and that same transaction deletes any rows
  sealed by the lost key.
- A row of the wrong shape is kept aside in `quarantine` by the guard before it is deleted (it
  holds ciphertext only), which also raises `unreadableData`. P09 should leave `quarantine` rows of
  table `secrets` out of exports and backups too.
- `get` and `slots` decrypt outside IndexedDB and may delete rows, so call them from services or
  effects, not inside a live query (P02-15, P05 AI settings).
- No WebCrypto (an insecure origin): reads return nothing and delete nothing, `set` rejects with
  `CryptoUnavailableError`.
- CryptoKey storage was proven here (Node 22.22, fake-indexeddb 6.2.5, jsdom): the key comes back
  as a usable non-extractable CryptoKey. Typed arrays read back from fake-indexeddb belong to
  another realm in this environment (`instanceof Uint8Array` is false), so the codec checks
  binary fields without `instanceof`.

## Status

Done (2026-10-26). Device key, AES-GCM helpers, secrets repository and `mask` in place; nothing
outside the task's files changed. `crypto.test.ts` 9, `secretsRepo.test.ts` 19, all passing.
