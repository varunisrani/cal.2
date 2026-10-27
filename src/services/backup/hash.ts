// The content hash of a backup (06 §3.17, R06.7): SHA-256 over a canonical text of what the backup
// holds, so two backups of the same diary carry the same hash however their rows were read.
//
// The text has one line per kept table row, `<table>=<row as JSON>` with the keys of every object
// sorted, the lines sorted; then one `photo:<name>:<bytes>` line per photo, sorted by name. Photos
// count by name and size, never by their bytes, and a Blob inside a row (a Coach thumbnail) counts
// by its type and size the same way. Left out: the tables that never leave the device (keys,
// damaged rows kept aside, device state in `meta`), the `photos` table (its photos are the photo
// lines), and the settings that describe this device or the backups themselves. Making a backup
// writes `backup.lastAt`; if that counted, no two backups would ever look the same (R06.7). The
// backup (P09-13) leaves the same things out of the file, using the lists below.

import { isBlobLike } from '../../data/codecs';
import { CryptoUnavailableError, webCrypto } from '../../data/crypto';
import type { TableName } from '../../data/schema';
import type { SettingKey } from '../../data/settingsSchema';

/** Tables that stay on this device: never in a backup, never in its hash. */
export const LOCAL_TABLES = [
  'secrets',
  'quarantine',
  'meta',
] as const satisfies readonly TableName[];

/** Settings that describe this device or its backups: never in a backup, never in its hash. */
export const LOCAL_SETTINGS = [
  'backup.lastAt',
  'storage.persistAsked',
  'storage.nudgeDone',
] as const satisfies readonly SettingKey[];

/** The table whose rows are counted as photo files instead. */
const PHOTO_TABLE: TableName = 'photos';
const SETTINGS_TABLE: TableName = 'settings';

export interface PhotoSize {
  readonly name: string;
  /** Bytes. */
  readonly size: number;
}

/** What a backup holds, as the hash reads it. */
export interface BackupContent {
  /** Rows by table name; `settings` rows are `{key, value}`. Tables may come in any order. */
  readonly tables: Readonly<Partial<Record<string, readonly unknown[]>>>;
  /** The photo files the backup carries. */
  readonly photos: readonly PhotoSize[];
}

export function isLocalTable(name: string): boolean {
  return (LOCAL_TABLES as readonly string[]).includes(name);
}

export function isLocalSetting(key: string): boolean {
  return (LOCAL_SETTINGS as readonly string[]).includes(key);
}

function isLocalSettingRow(row: unknown): boolean {
  if (typeof row !== 'object' || row === null) return false;
  const key = (row as { key?: unknown }).key;
  return typeof key === 'string' && isLocalSetting(key);
}

/** Leaves out what JSON leaves out of an object. */
function isAbsent(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

/** JSON with the keys of every object sorted; a Blob is written as its type and size. */
function canonicalJson(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'object' || value === null) return 'null';
  if (isBlobLike(value)) return `#blob:${JSON.stringify(value.type)}:${value.size}`;
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const toJson = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJson === 'function') return canonicalJson(toJson.call(value));
  const fields = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(fields)
    .filter((key) => !isAbsent(fields[key]))
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(fields[key])}`).join(',')}}`;
}

/** The text the hash is taken over (exported for tests and diagnostics). */
export function canonicalText(content: BackupContent): string {
  const rows: string[] = [];
  for (const [table, list] of Object.entries(content.tables)) {
    if (!list || isLocalTable(table) || table === PHOTO_TABLE) continue;
    for (const row of list) {
      if (table === SETTINGS_TABLE && isLocalSettingRow(row)) continue;
      rows.push(`${table}=${canonicalJson(row)}`);
    }
  }
  rows.sort();
  const photos = content.photos
    .map((photo) => ({ name: photo.name, line: `photo:${photo.name}:${photo.size}` }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return [...rows, ...photos.map((photo) => photo.line)].map((line) => `${line}\n`).join('');
}

/**
 * SHA-256 of the canonical text as 64 lowercase hex characters. Throws `CryptoUnavailableError`
 * where the page has no WebCrypto (not a secure origin).
 */
export async function contentHash(
  content: BackupContent,
  crypto: Pick<Crypto, 'subtle'> | null = webCrypto(),
): Promise<string> {
  if (!crypto) throw new CryptoUnavailableError();
  const text = new TextEncoder().encode(canonicalText(content));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', text));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
