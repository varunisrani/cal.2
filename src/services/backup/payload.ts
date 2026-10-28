// The backup document (06 §3.17, D-16.29, D-16.30): what `payload.json` holds, and how a table row
// is shaped on its way into a backup and on its way back. Both directions use the same shaping, so
// what a restore writes is exactly what the store's own repositories would have written: each row
// is read through its table's codec (unknown fields left behind), and the few fields a repository
// keeps beside the record are put back (the profile's key, an entry's barcode key, a Coach
// message's append sequence). A row the codec cannot read makes a file damaged; a setting this
// build does not know, or one that belongs to this device, is skipped. The Coach's chats (P16-02)
// are an added list like the walks, so the document version stays 1: a file from 1.3 or earlier
// has messages without a chat, and they are put in one (`withChats`).
//
// The document: `{format, version, exportedAt, appVersion, contentHash, payload: {tables}}`, with
// `tables` holding one list of rows per table the backup carries. Blobs inside rows (a Coach
// message's thumbnail) are written as `{"@blob": <type>, "data": <base64>}`; a thumbnail is kept
// only as a JPEG, PNG or WebP image, so a crafted file cannot store a page (`text/html`) or an SVG
// on our origin (S-6). The `photos` list holds each photo's id, its file in the archive and its
// size in pixels; the bytes are the file.

import { barcodeKey } from '../../data/barcodeKey';
import { isBlobLike } from '../../data/codecs';
import { chatForRows, chatIdOf, fieldOf } from '../../data/coachRows';
import { BACKUP_CODECS, type BackupTable } from '../../data/repos/backupRepo';
import { KEPT_ADDED_TABLES, PROFILE_KEY, TABLE_NAMES, type TableName } from '../../data/schema';
import { isSettingKey, readSetting } from '../../data/settingsSchema';
import { FIRST_CHAT_ID } from '../../domain/coach/chats';
import type { CoachMessage, DiaryEntry } from '../../domain/model';
import { isLocalSetting, isLocalTable } from './hash';

/** The format id a backup document carries. */
export const BACKUP_FORMAT = 'platewise-backup';
/** The newest document version this build writes and reads. */
export const BACKUP_VERSION = 1;

/**
 * The tables a backup carries, in schema order: every table of version 1 but the device-local
 * ones, then the added tables of the person's own records (the walks, P15-02). An older build
 * reading a newer file skips a list it does not know.
 */
export const BACKUP_TABLES: readonly BackupTable[] = [
  ...TABLE_NAMES.filter((name): name is Extract<BackupTable, TableName> => !isLocalTable(name)),
  ...KEPT_ADDED_TABLES,
];

/** The table whose rows describe photo files instead of holding them. */
export const PHOTO_TABLE = 'photos' satisfies BackupTable;

/** One photo as the document lists it. */
export interface PhotoListing {
  readonly id: string;
  /** Its plain file name under `photos/` in the archive. */
  readonly file: string;
  /** Pixels. */
  readonly width: number;
  readonly height: number;
  /** When it was first stored, epoch ms. */
  readonly createdAt: number;
}

/** The document as written (rows with their Blobs still in them; `encodeBlobs` turns them). */
export interface BackupDocument {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: number;
  /** When the backup was made, ISO 8601 in UTC. */
  readonly exportedAt: string;
  readonly appVersion: string;
  /** `contentHash` of the rows and photo files (`hash.ts`). */
  readonly contentHash: string;
  readonly payload: { readonly tables: Readonly<Record<string, readonly unknown[]>> };
}

/** A document whose frame has been checked; its rows are checked by the restore. */
export interface DocumentFrame {
  readonly version: number;
  /** Epoch ms. */
  readonly exportedAt: number;
  readonly appVersion: string;
  readonly contentHash: string;
  /** Rows by table name, every name the file has, Blobs decoded. */
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
}

export type FrameProblem = 'notBackup' | 'newer' | 'damaged';

export type FrameResult =
  | { readonly ok: true; readonly frame: DocumentFrame }
  | { readonly ok: false; readonly problem: FrameProblem };

/** What shaping made of one row. */
export type Shaped =
  | { readonly kind: 'row'; readonly row: object }
  /** Left out on purpose: a setting of this device, or one this build does not know. */
  | { readonly kind: 'skip' }
  /** Cannot be read: the file is damaged. */
  | { readonly kind: 'bad' };

const SKIP: Shaped = { kind: 'skip' };
const BAD: Shaped = { kind: 'bad' };

type Fields = Record<string, unknown>;

function fieldsOf(raw: unknown): Fields | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Fields) : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function rowOf(value: object | null): Shaped {
  return value === null ? BAD : { kind: 'row', row: value };
}

function shapeSetting(raw: unknown): Shaped {
  const fields = fieldsOf(raw);
  if (!fields || typeof fields.key !== 'string' || !('value' in fields)) return BAD;
  const { key } = fields;
  if (isLocalSetting(key) || !isSettingKey(key)) return SKIP;
  const value = readSetting(key, fields.value);
  return value === undefined ? BAD : { kind: 'row', row: { key, value } };
}

function shapeEntry(raw: unknown): Shaped {
  const entry = BACKUP_CODECS.entries(raw) as DiaryEntry | null;
  if (!entry) return BAD;
  const key = entry.product ? barcodeKey(entry.product.barcode) : undefined;
  return { kind: 'row', row: key === undefined ? entry : { ...entry, barcodeKey: key } };
}

/** The only types a Blob inside a row may carry into the store: the app's own thumbnails. */
const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** A Coach message; a thumbnail of any other type is left behind and the message kept. */
function shapeMessage(raw: unknown): Shaped {
  const read = BACKUP_CODECS.coachMessages(raw) as CoachMessage | null;
  if (!read) return BAD;
  const { thumb, ...rest } = read;
  const message = thumb === undefined || IMAGE_TYPES.has(thumb.type) ? read : rest;
  const seq = fieldsOf(raw)?.seq;
  return { kind: 'row', row: isFiniteNumber(seq) ? { ...message, seq } : message };
}

/**
 * A stored or backed-up row of `table` (not `photos`) as the store keeps it: the codec's reading
 * plus the fields its repository keeps beside the record.
 */
export function shapeRow(table: Exclude<BackupTable, 'photos'>, raw: unknown): Shaped {
  switch (table) {
    case 'settings':
      return shapeSetting(raw);
    case 'entries':
      return shapeEntry(raw);
    case 'coachMessages':
      return shapeMessage(raw);
    case 'profile': {
      const profile = BACKUP_CODECS.profile(raw);
      return profile ? { kind: 'row', row: { ...profile, id: PROFILE_KEY } } : BAD;
    }
    default:
      return rowOf(BACKUP_CODECS[table](raw) as object | null);
  }
}

/**
 * A file's lists with every Coach message in a chat the file lists (P16-02). A message without a
 * chat (a file made by 1.3 or earlier) goes to the chat the conversation of those versions
 * becomes; a message whose chat the file does not list (that chat's record could not be read when
 * the backup was made) gets a chat made from its messages, so the file still restores. A row that
 * is not an object is left as it is, for its codec to refuse. The other lists stay as they are.
 */
export function withChats(
  tables: Readonly<Record<string, readonly unknown[]>>,
): Readonly<Record<string, readonly unknown[]>> {
  const messages = tables.coachMessages ?? [];
  const chats = tables.coachChats ?? [];
  const listed = new Set(chats.map((raw) => fieldOf(raw, 'id')));
  const unlisted = new Map<string, unknown[]>();
  const placed = messages.map((raw) => {
    const named = chatIdOf(raw);
    const chatId = named ?? FIRST_CHAT_ID;
    if (!listed.has(chatId)) unlisted.set(chatId, [...(unlisted.get(chatId) ?? []), raw]);
    const object = fieldsOf(raw);
    return named === null && object ? { ...object, chatId } : raw;
  });
  if (unlisted.size === 0) return tables;
  const made = [...unlisted].map(([chatId, rows]) => chatForRows(chatId, rows));
  return { ...tables, coachMessages: placed, coachChats: [...chats, ...made] };
}

/** A photo listing of a document, or null when it cannot be used. */
export function readPhotoListing(raw: unknown): PhotoListing | null {
  const fields = fieldsOf(raw);
  if (!fields) return null;
  const { id, file, width, height, createdAt } = fields;
  if (typeof id !== 'string' || id === '' || typeof file !== 'string') return null;
  const sizes = [width, height, createdAt];
  if (!sizes.every((value) => isFiniteNumber(value) && value >= 0)) return null;
  return {
    id,
    file,
    width: width as number,
    height: height as number,
    createdAt: createdAt as number,
  };
}

// ---- Blobs inside rows --------------------------------------------------------------------------

const BLOB_TAG = '@blob';

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** A copy of `value` with every Blob in it written as tagged base64, ready for JSON. */
export async function encodeBlobs(value: unknown): Promise<unknown> {
  if (isBlobLike(value)) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    return { [BLOB_TAG]: value.type, data: toBase64(bytes) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeBlobs));
  const fields = fieldsOf(value);
  if (!fields) return value;
  const out: Fields = {};
  for (const [key, item] of Object.entries(fields)) out[key] = await encodeBlobs(item);
  return out;
}

function taggedBlob(fields: Fields): Blob | null {
  const keys = Object.keys(fields);
  if (keys.length !== 2 || !(BLOB_TAG in fields)) return null;
  const type = fields[BLOB_TAG];
  if (typeof type !== 'string' || typeof fields.data !== 'string') return null;
  return new Blob([fromBase64(fields.data)], { type });
}

/** `value` with every tagged base64 Blob turned back into a Blob. Throws on bad base64. */
export function decodeBlobs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeBlobs);
  const fields = fieldsOf(value);
  if (!fields) return value;
  const blob = taggedBlob(fields);
  if (blob) return blob;
  const out: Fields = {};
  for (const [key, item] of Object.entries(fields)) out[key] = decodeBlobs(item);
  return out;
}

// ---- The frame ----------------------------------------------------------------------------------

const HASH_TEXT = /^[0-9a-f]{64}$/;

/**
 * Checks what every backup document must have: our format id (else `notBackup`), a version this
 * build reads (a later one is `newer`), the export time, the app version, the hash and a list of
 * rows for every table named. Rows themselves are the restore's to check.
 */
export function readFrame(document: unknown): FrameResult {
  const fields = fieldsOf(document);
  if (!fields || fields.format !== BACKUP_FORMAT) return { ok: false, problem: 'notBackup' };
  const { version, exportedAt, appVersion, contentHash } = fields;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, problem: 'damaged' };
  }
  if (version > BACKUP_VERSION) return { ok: false, problem: 'newer' };

  const madeAt = typeof exportedAt === 'string' ? Date.parse(exportedAt) : Number.NaN;
  const tables = fieldsOf(fieldsOf(fields.payload)?.tables);
  const framed =
    Number.isFinite(madeAt) &&
    typeof appVersion === 'string' &&
    typeof contentHash === 'string' &&
    HASH_TEXT.test(contentHash) &&
    tables !== null &&
    Object.values(tables).every(Array.isArray);
  if (!framed) return { ok: false, problem: 'damaged' };

  let decoded: Record<string, readonly unknown[]>;
  try {
    decoded = decodeBlobs(tables) as Record<string, readonly unknown[]>;
  } catch {
    return { ok: false, problem: 'damaged' };
  }
  return {
    ok: true,
    frame: { version, exportedAt: madeAt, appVersion, contentHash, tables: decoded },
  };
}
