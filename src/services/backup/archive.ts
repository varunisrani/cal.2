// The layout of a backup file (06 §3.17–3.18, Proposed D-16.52, R06.9): a stored ZIP whose first
// entry is `payload.json`, the backup document, followed by one `photos/<name>` entry per photo.
// The document's meaning (format id, version, tables) belongs to the backup and the restore
// (P09-13); here it is only JSON text.
//
// Photo names must be plain: ASCII letters, digits, `.`, `_` and `-`, a jpg, jpeg, png or webp
// extension, at most 128 characters, no leading dot and no `..`. The character set leaves no room
// for a folder part (`/`, `\`, `:`). Writing refuses any other name; reading skips every entry
// that is neither `payload.json` nor `photos/<plain name>` and lists what it skipped, so a crafted
// entry can never point a restore anywhere else. Names are never "cleaned up" into plain ones.

import { readZip, writeZip, type ZipData, type ZipEntry } from './zip';

export const PAYLOAD_ENTRY = 'payload.json';
export const PHOTO_FOLDER = 'photos/';
export const MAX_PHOTO_NAME = 128;

/**
 * The largest `payload.json` a restore reads into memory: 256 MiB, far above any real backup
 * (photos travel as entries of their own). A larger one is refused by its declared size (S-9).
 */
export const MAX_PAYLOAD_BYTES = 256 * 1024 * 1024;

/** Photo extensions a backup carries, with the type a restored photo gets. */
const PHOTO_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const PLAIN_CHARACTERS = /^[A-Za-z0-9._-]+$/;

/** Why a backup file could not be written or read (beyond the ZIP itself). */
export type BackupArchiveProblem =
  /** Writing: a photo name is not plain. */
  | 'unsafeName'
  /** Two photos (or two payloads) under one name. */
  | 'duplicateName'
  /** Reading: the file has no `payload.json`. */
  | 'noPayload'
  /** Reading: `payload.json` is not UTF-8 JSON. */
  | 'badPayload'
  /** Reading: `payload.json` is larger than `MAX_PAYLOAD_BYTES`. */
  | 'payloadTooLarge';

const PROBLEM_TEXT: Readonly<Record<BackupArchiveProblem, string>> = {
  unsafeName: 'not a plain photo name',
  duplicateName: 'two entries share a name',
  noPayload: 'the file has no backup document',
  badPayload: 'the backup document is not JSON',
  payloadTooLarge: 'the backup document is too large to read',
};

export class BackupArchiveError extends Error {
  override readonly name = 'BackupArchiveError';

  constructor(
    readonly problem: BackupArchiveProblem,
    /** The name concerned, when there is one. */
    readonly entry?: string,
  ) {
    super(entry === undefined ? PROBLEM_TEXT[problem] : `${PROBLEM_TEXT[problem]}: ${entry}`);
  }
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** True for a plain photo file name, by the rule above. */
export function isSafePhotoName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_PHOTO_NAME &&
    PLAIN_CHARACTERS.test(name) &&
    !name.startsWith('.') &&
    !name.includes('..') &&
    Object.hasOwn(PHOTO_TYPES, extensionOf(name))
  );
}

/** The photo name an archive entry stands for, or null when the entry is not a plain photo. */
export function photoNameOf(entryName: string): string | null {
  if (!entryName.startsWith(PHOTO_FOLDER)) return null;
  const name = entryName.slice(PHOTO_FOLDER.length);
  return isSafePhotoName(name) ? name : null;
}

// ---- Writing ----------------------------------------------------------------------------------

export interface BackupPhotoFile {
  /** A plain photo name, unique in the backup. */
  readonly name: string;
  readonly data: ZipData;
}

export interface PackInput {
  /** The backup document; written as JSON. */
  readonly document: unknown;
  readonly photos: readonly BackupPhotoFile[];
  /** When the backup was made, epoch ms: every entry's modified time. */
  readonly madeAt: number;
}

function byName(left: { name: string }, right: { name: string }): number {
  if (left.name === right.name) return 0;
  return left.name < right.name ? -1 : 1;
}

/**
 * The backup file: `payload.json`, then the photos sorted by name. Throws `BackupArchiveError`
 * for a photo name that is not plain or used twice (nothing is written), and the ZIP writer's
 * errors (`ZipError`, or a photo Blob that cannot be read) as they come.
 */
export async function packBackup(input: PackInput): Promise<Blob> {
  const seen = new Set<string>();
  for (const photo of input.photos) {
    if (!isSafePhotoName(photo.name)) throw new BackupArchiveError('unsafeName', photo.name);
    if (seen.has(photo.name)) throw new BackupArchiveError('duplicateName', photo.name);
    seen.add(photo.name);
  }
  const text = JSON.stringify(input.document) as string | undefined;
  if (text === undefined) throw new TypeError('The backup document has no JSON form');

  return writeZip(
    [
      { name: PAYLOAD_ENTRY, data: new TextEncoder().encode(text) },
      ...[...input.photos]
        .sort(byName)
        .map((photo) => ({ name: PHOTO_FOLDER + photo.name, data: photo.data })),
    ],
    { modifiedAt: input.madeAt },
  );
}

// ---- Reading ----------------------------------------------------------------------------------

export interface ArchivePhoto {
  /** The plain photo name, without the folder. */
  readonly name: string;
  /** Bytes. */
  readonly size: number;
  /** The photo's bytes (a slice of the file, CRC checked), typed by its extension. */
  readonly data: Blob;
}

export interface UnpackedBackup {
  /** `payload.json` parsed, not yet checked: the restore validates its format and shape. */
  readonly document: unknown;
  /** Bytes of `payload.json`, for the restore's free-space estimate. */
  readonly documentBytes: number;
  /** The photos under plain names, in file order. */
  readonly photos: readonly ArchivePhoto[];
  /** Names of the entries that were skipped: neither the payload nor a plain photo. */
  readonly skipped: readonly string[];
}

async function readDocument(entry: ZipEntry): Promise<unknown> {
  const bytes = new Uint8Array(await entry.data.arrayBuffer());
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new BackupArchiveError('badPayload', PAYLOAD_ENTRY);
  }
}

/**
 * Reads a backup file: every entry is read to the end and CRC checked first (`readZip`), so a
 * damaged file fails before anything is used. Throws `ZipError` for a file that is not a readable
 * stored ZIP and `BackupArchiveError` when the payload is missing, larger than
 * `MAX_PAYLOAD_BYTES` or not JSON, or when the payload or a plain photo name appears twice. Other
 * entries are skipped and listed.
 */
export async function unpackBackup(file: Blob): Promise<UnpackedBackup> {
  const entries = await readZip(file);
  let payload: ZipEntry | null = null;
  const photos: ArchivePhoto[] = [];
  const used = new Set<string>();
  const skipped: string[] = [];

  for (const entry of entries) {
    const isPayload = entry.name === PAYLOAD_ENTRY;
    const photoName = isPayload ? null : photoNameOf(entry.name);
    if (!isPayload && photoName === null) {
      skipped.push(entry.name);
      continue;
    }
    if (used.has(entry.name)) throw new BackupArchiveError('duplicateName', entry.name);
    used.add(entry.name);
    if (photoName === null) {
      payload = entry;
    } else {
      const type = PHOTO_TYPES[extensionOf(photoName)];
      photos.push({
        name: photoName,
        size: entry.size,
        data: entry.data.slice(0, entry.size, type),
      });
    }
  }

  if (payload === null) throw new BackupArchiveError('noPayload');
  // By its declared size, before a byte of it is held in memory.
  if (payload.size > MAX_PAYLOAD_BYTES) {
    throw new BackupArchiveError('payloadTooLarge', PAYLOAD_ENTRY);
  }
  return {
    document: await readDocument(payload),
    documentBytes: payload.size,
    photos,
    skipped,
  };
}
