# Task: backup archive codec and content hash (P09-12) · Phase: 09 · Owner: builder (wt-p09s12)

<!-- Save as platewise/docs/notes/P<nn>/<slug>.md. Write everything above "Compare checklist"
BEFORE writing code, in your own words. Never paste or paraphrase the reference line by line. -->

Read (reference @ `10e14b67`): `android/.../backup/CloudBackupArchive.kt` (all: policy, document,
hash, pack, inspect, photo walk), `ios/calorietracker/Services/CloudBackupArchive.swift` (all:
policy, hash, pack, the store-only zip writer and its local-header scanner), and their tests
`android/.../test/.../backup/CloudBackupArchiveTest.kt` and
`ios/calorietrackerTests/CloudBackupArchiveTests.swift` (for the cases: name lists, hostile entries,
hash stability, vanished photo, entry-count limit). Research spec `06-settings-data.md` §3.17
(archive format, content hash, safe names), §3.18 (local file), §6 traps R06.6, R06.7, R06.9.
Decision Proposed D-16.52 (`18-phase-wise-build-plan.md`). The ZIP layout itself follows the
public PKWARE APPNOTE (local file header, central directory header, end of central directory
record, CRC-32), not the reference's writer.

What it does (own words): the three pure pieces a backup file is made of; P09-13 builds the backup
and the restore on top of them, and nothing here touches the database, the network or the clock.
`zip.ts` writes and reads a ZIP whose entries are stored as they are (no compression: photos are
already JPEG, D-16.52). Every entry gets a CRC-32, a local header and a central-directory record;
the file ends with the end record. The reader starts from the end record, walks the central
directory, checks every local header against it and reads every entry to the end so its CRC is
checked before anyone uses the file; it refuses compressed, encrypted, ZIP64 and split archives and
any CRC mismatch, with a reason code. `archive.ts` is the backup layout: the archive opens with
`payload.json`, and each photo follows under `photos/<name>`. A photo name must be plain: ASCII
letters, digits, `.`, `_`, `-`, a jpg/jpeg/png/webp extension, at most 128 characters, no leading
dot, no `..`, no folder part.
Writing refuses any other name; reading skips any entry that is not `payload.json` or
`photos/<plain name>` and says which ones it skipped (R06.9). `hash.ts` turns what a backup holds
into one SHA-256 (WebCrypto): a canonical text of the kept table rows (keys sorted at every level,
lines sorted) followed by `photo:<name>:<size>` lines sorted by name, so photos count by name and
size and never by bytes. Backup bookkeeping and device-local state are left out, so making a backup
does not change the hash of the next one (R06.7).

Inputs → outputs:
- `crc32(bytes, previous?)` → unsigned 32-bit CRC (chainable over chunks).
- `writeZip(entries: {name, data: Blob | Uint8Array}[], {modifiedAt})` → `Promise<Blob>`
  (`application/zip`); throws `ZipError` (`tooMany`, `tooLarge`, `nameTooLong`, `changed`).
- `readZip(file: Blob)` → `Promise<ZipEntry[]>` (`{name, size, crc32, data: Blob}` in directory
  order, every CRC already checked); throws `ZipError` (`notZip`, `damaged`, `checksum`,
  `compressed`, `encrypted`, `zip64`, `split`).
- `isSafePhotoName(name)` → boolean; `packBackup({document, photos, madeAt})` → `Promise<Blob>`;
  `unpackBackup(file)` → `Promise<{document: unknown, documentBytes, photos, skipped}>`; throws
  `BackupArchiveError` (`unsafeName`, `duplicateName`, `noPayload`, `badPayload`) or a `ZipError`.
- `canonicalText({tables, photos})` → string; `contentHash({tables, photos})` → `Promise<string>`
  (64 lowercase hex characters).

Files: created `src/services/backup/{zip,archive,hash}.ts` and their tests, this note.

Edge cases / failure modes:
- Empty entries (size 0, CRC 0) and an archive with only `payload.json`.
- Entry data handed as a Blob is read once for its CRC; if its bytes no longer match its size (or
  reading it fails) the write fails rather than writing a short archive.
- Limits without ZIP64: at most 65 534 entries, each entry, every offset and the directory under
  4 GiB, names at most 65 535 UTF-8 bytes; checked from sizes before any byte is read.
- A comment after the end record is allowed; a ZIP64 locator in front of it is refused.
- Local header out of the file, overlapping the directory, or naming a different entry than the
  directory → `damaged`; a data-descriptor flag is accepted (sizes and CRC come from the directory).
- Names are UTF-8 (flag bit 11 set when a name is not ASCII); readers see the decoded text, and any
  non-ASCII name fails the safe-name rule anyway.
- Two entries with the same name in a backup are ambiguous → refused (`duplicateName`), on both
  write and read; never "the later one wins".
- `payload.json` missing, not UTF-8 or not JSON → refused; its meaning (format id, version, shape)
  is checked by the restore (P09-13).
- Hash: row order, key order and table order do not matter; `undefined` fields count as absent; a
  Blob inside a row (a Coach thumbnail) counts by type and size; tables `secrets`, `quarantine`,
  `meta` and the `photos` table rows are left out (photos count through the photo list); settings
  `backup.lastAt`, `storage.persistAsked`, `storage.nudgeDone` are left out.
- No WebCrypto (not a secure origin) → `CryptoUnavailableError` from `src/data/crypto.ts`.

Our design differences / decisions:
- Our names: `payload.json` (not the reference's payload name), `photos/`, `zip.ts`, `archive.ts`,
  `hash.ts`, `ZipError`, `BackupArchiveError`; the document format id and version belong to P09-13.
- One store-only codec for both directions (the reference deflated on one platform and stored on
  the other); the reader works from the central directory as the APPNOTE describes and checks every
  CRC (the reference's store-only reader scanned local headers and checked none).
- Unsafe photo names are refused on write (the reference dropped them silently, which would hide a
  bug in the photo store); duplicates are refused on both sides.
- The hash input is the backup's table rows plus the photo list, not typed string values: our data
  lives in IndexedDB tables, so the canonical text is canonical JSON per row (keys sorted, lines
  sorted). Exclusion lists are exported (`LOCAL_TABLES`, `LOCAL_SETTINGS`) so P09-13 leaves the
  same things out of the payload (R06.7: out of both the hash and the archive).
- Output is a Blob built in pieces of about 8 MiB, so a large backup never sits in one array;
  reading takes a Blob (the picked file) and checks entries chunk by chunk; photo data comes back as
  typed slices of the file.
- Decisions for the lead: (1) `meta` is left out (device key, restore and damaged-data flags, Coach
  generation are all device state), although P09-13's row names only `secrets` and `quarantine`;
  (2) `storage.nudgeDone` is left out as device-local (the install nudge is per device), beyond the
  three kinds P09-13 names; (3) the reminder "last shown" times are not stored anywhere yet (P09-08
  runs alongside): if they become a setting, add its key to `LOCAL_SETTINGS`.

Tests we will write:
- zip: CRC-32 check value of "123456789" and chunked = whole; write then read round trip (three
  entries, an empty one, Blob and byte inputs); the APPNOTE layout (signatures, method 0, DOS time,
  end record counts and offsets, UTF-8 flag); a flipped data byte → `checksum`; truncated and
  non-ZIP input → `notZip`/`damaged`; crafted compressed, encrypted, ZIP64 and split archives
  refused; local/central name mismatch → `damaged`; an archive written by Info-ZIP (`zip -0`, with
  extra fields) is read; entry-count and size limits refused before reading; a Blob whose bytes
  changed size fails the write.
- archive: round trip with three photos (`payload.json` first, photos sorted, bytes, sizes, types);
  `../x.jpg`, `.hidden.jpg`, `a/b.jpg`, a 129-character name and `x.exe` refused on write and
  skipped on read (R06.9), with other hostile entry names; the name rule's accept and reject lists;
  no payload, bad payload, duplicate names; a flipped byte surfaces the CRC failure.
- hash: stable for equal content regardless of order; changing `backup.lastAt` (and the other
  local settings and tables) leaves it unchanged (R06.7); changing an entry, a setting, a photo's
  size or adding a photo changes it; the canonical text's shape; a Blob counts by type and size;
  SHA-256 known answer; no WebCrypto → error.

Compare checklist (filled after the rewrite; reopened `CloudBackupArchive.kt`,
`CloudBackupArchive.swift`, `CloudBackupArchiveTest.kt`, `CloudBackupArchiveTests.swift`):
- [x] Plain photo names: character set, extension list (any case), 128 characters, no leading dot,
  no `..`, no folder part (`archive.test.ts > isSafePhotoName > takes plain names with a photo
  extension, up to 128 characters`, `> refuses every other name rather than cleaning it up
  (R06.9)`)
- [x] Only `photos/<plain name>` is a photo entry (`archive.test.ts > photoNameOf > gives the plain
  name of an entry directly under photos/, and null for anything else`)
- [x] Hostile entries skipped on read, the good photo kept, and only kept photos counted
  (`archive.test.ts > packBackup and unpackBackup > skips the same names when reading, with every
  other stray entry, and lists them (R06.9)`)
- [x] Unsafe names on write (`archive.test.ts > packBackup and unpackBackup > refuses to write a
  photo named %s, reading nothing (R06.9)`: `../x.jpg`, `.hidden.jpg`, `a/b.jpg`, 129 characters,
  `x.exe`)
- [x] Payload first, then photos; round trip keeps ids (inside the document) and photo bytes
  (`archive.test.ts > packBackup and unpackBackup > writes payload.json first, then three photos by
  name, and reads them all back`, `> round trips two hundred photos byte for byte`)
- [x] Missing payload is refused (`archive.test.ts > … > refuses a file without payload.json, or
  with one that is not UTF-8 JSON`)
- [x] Every entry read to the end and CRC checked before anything is used; a flipped byte fails
  (`zip.test.ts > readZip refuses a damaged or unsupported file > fails the CRC when one byte of an
  entry is flipped`, `archive.test.ts > … > fails the CRC of a file with one flipped byte before
  handing out anything`, `zip.test.ts > writeZip and readZip > handles an archive larger than the
  pieces it is written and checked in`)
- [x] A photo that cannot be read when packing fails the whole archive (`zip.test.ts > writeZip
  refuses what a ZIP without ZIP64 cannot hold > passes on the error of a photo that can no longer
  be read`, `> fails when an entry reads back shorter than its size`)
- [x] Photos read one at a time while packing (`zip.test.ts > writeZip and readZip > reads the
  entries to write one at a time`)
- [x] Entry-count and 4 GiB limits refused instead of overflowing (`zip.test.ts > writeZip refuses
  what a ZIP without ZIP64 cannot hold > refuses more entries than it can count, before reading
  any`, `> refuses an entry of 4 GiB from its size, without reading it`)
- [x] Hash: same content → same hash, a changed value → a new hash; photos by name and size
  (`hash.test.ts > contentHash > gives one 64-character hash for the same content, whatever the
  order`, `> changes when an entry, a setting or a photo changes`, `canonicalText > lists kept rows
  as sorted lines with sorted keys, then photo lines sorted by name`)
- [x] Bookkeeping and device-local state left out of the hash (`hash.test.ts > contentHash > does
  not change when backup.lastAt changes, appears or goes (R06.7)`, `> leaves out every device-local
  setting and table (R06.7)`)
- Gaps found on reopening: two tests added (photos read one at a time; two hundred photos round
  trip). Interop checked by hand as well: `unzip -t` and Python's `zipfile.testzip()` accept an
  archive from `writeZip` (four entries, a 3 MiB one, a UTF-8 name, an empty one), and `readZip`
  reads a stored ZIP written by Python's `zipfile`; the unit test reads one written by Info-ZIP.
- Deliberate differences: one store-only codec for both directions, reading from the central
  directory and checking every CRC, refusing compressed, encrypted, ZIP64 and split archives
  (D-16.52); version fields 1.0 needed / 6.3 made by, as the APPNOTE gives for stored entries with
  UTF-8 names; at most 65 534 entries (all ones is the ZIP64 marker); overlapping entries refused;
  unsafe names refused on write instead of dropped; duplicate names refused instead of "the later
  one wins"; our entry name `payload.json`; the hash reads table rows as canonical JSON, not typed
  string values (our data lives in IndexedDB tables); `backup.lastAt` is out of the hash (R06.7:
  the reference hashed its own bookkeeping).
- Not taken: the document's format id and version checks, "needs a newer app", free-space
  figures beyond sizes, and the photo walk for staging (P09-13, on top of `unpackBackup`); temp
  archive files and their cleanup (no file system on the web); the typed value tags and legacy
  byte-for-byte compatibility (no earlier Platewise format); binary `__fixtures__/*.zip` files
  (the archives are built in the tests, one Info-ZIP archive inline as base64; the "newer
  version" fixture is about the document, P09-13); a cap on the size of `payload.json`.
- Mutation check: no CRC check fails 3 tests; local settings counted fails 3; local tables counted
  fails 1; any name accepted on read fails 2, on write 5; no overlap check fails 1; no directory
  method check fails 1.

## Status

Done (2026-10-27). Created `src/services/backup/{zip,archive,hash}.ts` with their tests (50 tests)
and this note; nothing changed outside the slice's files. For P09-13: build the document, hash the
same rows it packs with `contentHash` (photos as `{name, size}` of the files packed), leave out
`LOCAL_TABLES` and `LOCAL_SETTINGS` from the payload too, name each photo file `<id>.<ext>` with a
plain name, and map `ZipError` and `BackupArchiveError` to the restore's messages.
