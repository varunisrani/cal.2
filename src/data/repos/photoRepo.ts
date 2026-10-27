// Food photos (R02.8, R06.18). Each photo is one row of the `photos` table: the image blob, its
// thumbnail, its size in pixels and bytes, and when it was stored. Entries, their parts, saved
// meals and the two drafts name photos by id, and one photo may have several such owners (a saved
// meal copied from an entry, a re-log, a combined meal, a draft), so a photo is deleted only when
// no owner names it. When any owner row cannot be read nobody knows what it names, and nothing is
// deleted. While a backup restore is replacing data (`meta.restoring`), nothing is deleted either.
// The flag check, the owner scan and the delete share one transaction, so an owner written or a
// restore begun in another tab cannot fall between "unused" and the delete.

import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeEntry, decodePhoto, decodeSavedMeal, isBlobLike } from '../codecs';
import { GUARD_TABLES, decodeRows, readAll, readOne, removeRows } from '../guard';
import type { IngredientLine } from '../../domain/model';
import type { PhotoRow, PlatewiseDb } from '../schema';
import { decodeDraftRow, draftRowPhotoIds } from './draftsRepo';

/** The `meta` key a backup restore sets while it replaces data; cleanup waits until it is gone. */
export const RESTORING_FLAG = 'restoring';

/** `prune` leaves photos younger than this alone: their owner may not be saved yet. */
export const FRESH_PHOTO_MS = 10 * 60_000;

/** Tables whose rows name photos. */
const OWNER_TABLES = ['entries', 'savedMeals', 'drafts'] as const;

/** Every table a cleanup reads or writes, for its one transaction. */
const CLEANUP_TABLES = ['photos', ...OWNER_TABLES, ...GUARD_TABLES] as const;

/** Photo ids in use: known, or unknown because some owner row could not be read. */
export type PhotoReferences = { kind: 'known'; ids: ReadonlySet<string> } | { kind: 'unknown' };

export interface PhotoDetails {
  thumb?: Blob;
  /** Pixels. */
  width: number;
  height: number;
}

export interface PhotoUsage {
  count: number;
  /** Bytes of the full photos. */
  photoBytes: number;
  /** Bytes of their thumbnails. */
  thumbBytes: number;
}

export interface PhotoRepo {
  /** Stores a photo under a new id. */
  put(blob: Blob, details: PhotoDetails): Promise<string>;
  /** The stored photo, or null when it is missing or unreadable. */
  get(id: string): Promise<PhotoRow | null>;
  /** The stored thumbnail, or null when there is none yet. */
  getThumb(id: string): Promise<Blob | null>;
  /** Stores a thumbnail on an existing photo; false when the photo is missing or unreadable. */
  setThumb(id: string, thumb: Blob): Promise<boolean>;
  references(): Promise<PhotoReferences>;
  /** Deletes those of `ids` that nothing uses (after an edit dropped them); returns the deleted. */
  releaseIfUnused(ids: readonly string[]): Promise<string[]>;
  /** Deletes every photo nothing uses, except fresh ones; returns the deleted ids. */
  prune(): Promise<string[]>;
  usage(): Promise<PhotoUsage>;
  /**
   * Drops the thumbnail of every readable photo (Clear cache); the photos stay and their
   * thumbnails are made again on demand. Changes nothing while a restore runs. Returns how many
   * thumbnails were dropped.
   */
  clearThumbs(): Promise<number>;
}

export interface PhotoRepoOptions {
  clock?: Clock;
  newId?: IdSource;
}

/** A record's own photos, then its parts' photos, in order and without repeats. */
export function photoIdsOf(record: {
  photoIds: readonly string[];
  lines: readonly Pick<IngredientLine, 'photoIds'>[];
}): string[] {
  return [...new Set([...record.photoIds, ...record.lines.flatMap((line) => line.photoIds)])];
}

/** Every string anywhere inside a value (a raw row kept in quarantine). */
function stringsIn(value: unknown, into: Set<string>, seen: Set<object>): void {
  if (typeof value === 'string') {
    into.add(value);
    return;
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return;
  seen.add(value);
  const items = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const item of items) stringsIn(item, into, seen);
}

/** Reads every owner; must run inside a transaction over the owner tables and `quarantine`. */
async function collectReferences(db: PlatewiseDb, clock: Clock): Promise<PhotoReferences> {
  const ids = new Set<string>();

  const entries = decodeRows(db, 'entries', await db.entries.toArray(), decodeEntry, clock);
  const saved = decodeRows(db, 'savedMeals', await db.savedMeals.toArray(), decodeSavedMeal, clock);
  const drafts = decodeRows(db, 'drafts', await db.drafts.toArray(), decodeDraftRow, clock);
  if (entries.dropped + saved.dropped + drafts.dropped > 0) return { kind: 'unknown' };

  for (const owner of [...entries.items, ...saved.items]) {
    for (const id of photoIdsOf(owner)) ids.add(id);
  }
  for (const row of drafts.items) {
    for (const id of draftRowPhotoIds(row)) ids.add(id);
  }

  // A row moved aside because it could not be read may be recovered later: whatever it names
  // stays. Photo ids are random UUIDs, so treating every string in it as one costs nothing.
  const kept = await db.quarantine
    .where('table')
    .anyOf([...OWNER_TABLES])
    .toArray();
  const seen = new Set<object>();
  for (const row of kept) stringsIn(row.raw, ids, seen);

  return { kind: 'known', ids };
}

async function isRestoring(db: PlatewiseDb): Promise<boolean> {
  const row = await db.meta.get(RESTORING_FLAG);
  return row?.value === true;
}

export function createPhotoRepo(db: PlatewiseDb, options: PhotoRepoOptions = {}): PhotoRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;

  /**
   * One read-write transaction: when no restore is running and every owner reads, deletes the
   * candidates `pick` chooses from the photos nobody uses.
   */
  function cleanUp(pick: (unused: (id: string) => boolean) => Promise<string[]>) {
    return db.transaction('rw', [...CLEANUP_TABLES], async () => {
      if (await isRestoring(db)) return [];
      const references = await collectReferences(db, clock);
      if (references.kind === 'unknown') return [];
      const doomed = await pick((id) => !references.ids.has(id));
      if (doomed.length > 0) await removeRows(db, 'photos', doomed, decodePhoto, clock);
      return doomed;
    });
  }

  return {
    async put(blob, details) {
      if (!isBlobLike(blob)) throw new TypeError('A photo must be a Blob');
      const row: PhotoRow = {
        id: newId(),
        blob,
        width: details.width,
        height: details.height,
        bytes: blob.size,
        createdAt: clock.now(),
      };
      if (details.thumb) row.thumb = details.thumb;
      await db.photos.add(row);
      return row.id;
    },

    async get(id) {
      const stored = await readOne(db, 'photos', id, decodePhoto, clock);
      return stored.kind === 'ok' ? stored.value : null;
    },

    async getThumb(id) {
      const stored = await readOne(db, 'photos', id, decodePhoto, clock);
      return stored.kind === 'ok' ? (stored.value.thumb ?? null) : null;
    },

    setThumb(id, thumb) {
      if (!isBlobLike(thumb)) return Promise.reject(new TypeError('A thumbnail must be a Blob'));
      return db.transaction('rw', db.photos, async () => {
        const photo = decodePhoto(await db.photos.get(id));
        if (!photo) return false;
        await db.photos.put({ ...photo, thumb });
        return true;
      });
    },

    references: () =>
      db.transaction('r', [...OWNER_TABLES, 'quarantine'], () => collectReferences(db, clock)),

    releaseIfUnused: (ids) =>
      cleanUp(async (unused) => {
        const wanted = [...new Set(ids)].filter(unused);
        const stored = await db.photos.bulkGet(wanted);
        return wanted.filter((_, index) => stored[index] !== undefined);
      }),

    prune: () =>
      cleanUp(async (unused) => {
        const freshFrom = clock.now() - FRESH_PHOTO_MS;
        const doomed: string[] = [];
        await db.photos.each((raw: unknown) => {
          const photo = decodePhoto(raw);
          // An unreadable row has no trustworthy age; the delete keeps a copy of it aside.
          const key = photo?.id ?? (raw as { id?: unknown }).id;
          if (typeof key !== 'string' || !unused(key)) return;
          if (photo && photo.createdAt > freshFrom) return;
          doomed.push(key);
        });
        return doomed;
      }),

    async usage() {
      const { items } = await readAll(db, 'photos', decodePhoto, clock);
      return {
        count: items.length,
        photoBytes: items.reduce((sum, photo) => sum + photo.bytes, 0),
        thumbBytes: items.reduce((sum, photo) => sum + (photo.thumb?.size ?? 0), 0),
      };
    },

    clearThumbs: () =>
      db.transaction('rw', db.photos, db.meta, async () => {
        if (await isRestoring(db)) return 0;
        const bare: PhotoRow[] = [];
        // A row that cannot be read is left exactly as it is.
        for (const raw of await db.photos.toArray()) {
          const photo = decodePhoto(raw);
          if (!photo || photo.thumb === undefined) continue;
          const { thumb: _dropped, ...rest } = photo;
          bare.push(rest);
        }
        if (bare.length > 0) await db.photos.bulkPut(bare);
        return bare.length;
      }),
  };
}
