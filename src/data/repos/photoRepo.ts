// Food photos: one row per photo in `photos`, holding the image blob and its thumbnail.
//
// Diary rows, their ingredient lines, saved meals and both drafts point at photos by id, and one
// photo may be shared by several of them (a re-log, a saved meal and the original row). So a photo
// is deleted only after every owner was read and none names it (R02.8). If any owner row cannot be
// read, nobody knows what it points at and nothing is deleted (R06.18); nothing is deleted while a
// backup restore is replacing data either (the `restoring` flag in `meta`). The flag check, the
// owner reads and the deletes share one transaction, so neither a restore nor a new owner can slip
// in between.

import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import type { IngredientLine } from '../../domain/model';
import { decodeEntry, decodePhoto, decodeSavedMeal } from '../codecs';
import { transact, type PlatewiseDb } from '../db';
import { guardKey, readAll, readOne, writeOne } from '../guard';
import type { PhotoRow, TableName } from '../schema';
import { decodeDraftRow, draftPhotoIds } from './draftsRepo';

/** The `meta` key a restore sets while it replaces data; any truthy value pauses deletion. */
export const RESTORING_FLAG = 'restoring';

/** Tables a transaction that releases photos must cover (besides those `transact` adds). */
export const PHOTO_RELEASE_TABLES: readonly TableName[] = [
  'photos',
  'entries',
  'savedMeals',
  'drafts',
];

/** What `put` stores beside the image. */
export interface PhotoDetails {
  thumb?: Blob;
  /** Pixels. */
  width: number;
  height: number;
}

export interface PutOptions {
  /** Stamps `createdAt`; the device clock by default. */
  clock?: Clock;
  /** Makes the photo id; a random UUID by default. */
  newId?: IdSource;
}

/** Every photo id in use, or `unknown` when an owner row could not be read. */
export type PhotoReferences = ReadonlySet<string> | 'unknown';

/** Space the photos take, for the storage card. */
export interface PhotoUsage {
  photos: number;
  photoBytes: number;
  thumbBytes: number;
}

/** The photos a row uses (its own, then its lines'), in order and without repeats. */
export function photoIdsOf(food: {
  photoIds: readonly string[];
  lines: readonly IngredientLine[];
}): string[] {
  return [...new Set([...food.photoIds, ...food.lines.flatMap((line) => line.photoIds)])];
}

// ---- Storing and reading ----------------------------------------------------------------------

/** Stores a photo (and its thumbnail, when there is one yet). Returns the new id. */
export async function put(
  db: PlatewiseDb,
  blob: Blob,
  details: PhotoDetails,
  options: PutOptions = {},
): Promise<string> {
  const { thumb, width, height } = details;
  const row: PhotoRow = {
    id: (options.newId ?? randomId)(),
    blob,
    width,
    height,
    bytes: blob.size + (thumb?.size ?? 0),
    createdAt: (options.clock ?? systemClock).now(),
    ...(thumb ? { thumb } : {}),
  };
  await writeOne(db, 'photos', row, decodePhoto);
  return row.id;
}

/** The photo row, or undefined when it is gone or cannot be read. */
export async function get(db: PlatewiseDb, id: string): Promise<PhotoRow | undefined> {
  const read = await readOne(db, 'photos', id, decodePhoto);
  return read.kind === 'ok' ? read.value : undefined;
}

/** The thumbnail, or undefined when there is none yet (or no such photo). */
export async function getThumb(db: PlatewiseDb, id: string): Promise<Blob | undefined> {
  return (await get(db, id))?.thumb;
}

/** Stores a thumbnail made later. False when the photo is gone or cannot be read. */
export function setThumb(db: PlatewiseDb, id: string, thumb: Blob): Promise<boolean> {
  return transact(db, 'rw', ['photos'], async () => {
    const read = await readOne(db, 'photos', id, decodePhoto);
    if (read.kind !== 'ok') return false;
    const photo = read.value;
    await db.photos.put({ ...photo, thumb, bytes: photo.blob.size + thumb.size });
    return true;
  });
}

/** Bytes of every readable photo and thumbnail. */
export async function usage(db: PlatewiseDb): Promise<PhotoUsage> {
  const { items } = await readAll(db, 'photos', decodePhoto);
  return items.reduce<PhotoUsage>(
    (sum, photo) => ({
      photos: sum.photos + 1,
      photoBytes: sum.photoBytes + photo.blob.size,
      thumbBytes: sum.thumbBytes + (photo.thumb?.size ?? 0),
    }),
    { photos: 0, photoBytes: 0, thumbBytes: 0 },
  );
}

// ---- Owners and cleanup -----------------------------------------------------------------------

/** Reads every owner in the current transaction. */
async function collectReferences(db: PlatewiseDb): Promise<PhotoReferences> {
  const entries = await readAll(db, 'entries', decodeEntry);
  const saved = await readAll(db, 'savedMeals', decodeSavedMeal);
  const drafts = await readAll(db, 'drafts', decodeDraftRow);
  if (entries.dropped + saved.dropped + drafts.dropped > 0) return 'unknown';
  return new Set([
    ...entries.items.flatMap(photoIdsOf),
    ...saved.items.flatMap(photoIdsOf),
    ...drafts.items.flatMap(draftPhotoIds),
  ]);
}

/** Every photo id an entry, ingredient line, saved meal or draft uses; `unknown` if any is unreadable. */
export function references(db: PlatewiseDb): Promise<PhotoReferences> {
  return transact(db, 'r', ['entries', 'savedMeals', 'drafts'], async () => collectReferences(db));
}

async function restoring(db: PlatewiseDb): Promise<boolean> {
  return Boolean((await db.meta.get(RESTORING_FLAG))?.value);
}

/** Deletes the candidates nothing uses. Runs in the caller's read-write transaction. */
async function deleteUnused(db: PlatewiseDb, candidates: readonly string[]): Promise<string[]> {
  if (candidates.length === 0 || (await restoring(db))) return [];
  const used = await collectReferences(db);
  if (used === 'unknown') return [];
  const unused = [...new Set(candidates)].filter((id) => !used.has(id));
  const stored = new Set(await db.photos.where('id').anyOf(unused).primaryKeys());
  const deleted: string[] = [];
  for (const id of unused) {
    if (!stored.has(id)) continue;
    // An unreadable photo row is kept aside before it goes, like any other.
    await guardKey(db, 'photos', id, decodePhoto);
    await db.photos.delete(id);
    deleted.push(id);
  }
  return deleted;
}

/**
 * Deletes those of `ids` that nothing uses any more (after an edit or delete dropped them).
 * Returns the ids it deleted. Inside another read-write transaction it joins it, which must then
 * cover `PHOTO_RELEASE_TABLES`.
 */
export function releaseIfUnused(db: PlatewiseDb, ids: readonly string[]): Promise<string[]> {
  return transact(db, 'rw', PHOTO_RELEASE_TABLES, async () => deleteUnused(db, ids));
}

/** Deletes every photo nothing uses (at start-up, after a restore or an import). */
export function prune(db: PlatewiseDb): Promise<string[]> {
  return transact(db, 'rw', PHOTO_RELEASE_TABLES, async () =>
    deleteUnused(db, await db.photos.toCollection().primaryKeys()),
  );
}
