// Restoring a backup file (06 §3.17, R06.6, R06.8, D-16.42). `inspectBackup` does everything that
// can refuse a file before anything changes: every entry is read to its end and CRC checked
// (`unpackBackup`), the document's format id and version are checked (a later version needs a
// newer Platewise), every row is shaped as the store keeps it and must read, ids must be unique,
// every listed photo must be in the archive, the content hash must match what was read, and the
// free space must cover photo bytes + 64 KiB per photo + the document + a 16 MiB reserve. Its
// result is what the confirmation shows (R06.8); nothing is written until `applyBackup`.
//
// `applyBackup` checks the space again, then writes everything in one IndexedDB transaction: a
// failure anywhere leaves every table as it was. The rows are built in memory from the checked
// file first, which is all the "staging" a single transaction needs. After the commit: a fast
// left running while fasting is off is ended (R05.2), the `restoring` flag is cleared, photos
// nothing uses are pruned, and the `afterRestore` hook runs (reminders). Nothing in it stops when
// the screen that started it goes away. This device's own settings stay; `backup.lastAt` becomes
// the backup's time.

import { CryptoUnavailableError } from '../../data/crypto';
import type { BackupRepo, BackupTable, RestorePlan } from '../../data/repos/backupRepo';
import type { FastRepo } from '../../data/repos/fastRepo';
import type { PhotoRepo } from '../../data/repos/photoRepo';
import { TABLES, type PhotoRow } from '../../data/schema';
import type { StorageAccess } from '../../data/storage';
import type { Clock } from '../../lib/clock';
import { err, ok, type Result } from '../../lib/result';
import {
  BackupArchiveError,
  unpackBackup,
  type ArchivePhoto,
  type UnpackedBackup,
} from './archive';
import { LOCAL_SETTINGS, contentHash } from './hash';
import {
  BACKUP_TABLES,
  PHOTO_TABLE,
  readFrame,
  readPhotoListing,
  shapeRow,
  type DocumentFrame,
} from './payload';
import { ZipError } from './zip';

/** Why a backup file was not restored. Nothing was changed in every case. */
export type RestoreProblem =
  /** Not a ZIP, or a ZIP that is not a Platewise backup. */
  | 'notBackup'
  /** A Platewise backup that does not read back whole. */
  | 'damaged'
  /** Written by a later Platewise. */
  | 'newer'
  /** Not enough free storage. */
  | 'noSpace'
  /** No WebCrypto to check the hash: the page is not on a secure origin. */
  | 'insecure'
  | 'failed';

/** Room each restored photo gets for its thumbnail. */
export const PHOTO_ALLOWANCE_BYTES = 64 * 1024;
/** Storage kept free beyond everything the restore writes. */
export const RESERVE_BYTES = 16 * 1024 * 1024;

/** What a backup file holds, for the confirmation and for Welcome (P09-14). */
export interface BackupSummary {
  /** When it was made, epoch ms. */
  readonly madeAt: number;
  readonly appVersion: string;
  readonly entries: number;
  readonly photos: number;
  readonly messages: number;
  readonly hasProfile: boolean;
  readonly onboardingDone: boolean;
}

/** A file that passed every check, ready to restore. */
export interface CheckedBackup {
  readonly summary: BackupSummary;
  /** Free storage the restore needs. */
  readonly neededBytes: number;
  readonly plan: RestorePlan;
}

export interface InspectDeps {
  readonly storage: Pick<StorageAccess, 'estimate'>;
  /** For the hash; the page's WebCrypto by default. */
  readonly crypto?: Pick<Crypto, 'subtle'> | null;
}

export interface ApplyDeps {
  readonly backupRepo: Pick<BackupRepo, 'restore' | 'endRestore'>;
  readonly fastRepo: Pick<FastRepo, 'settleOnOpen'>;
  readonly photoRepo: Pick<PhotoRepo, 'prune'>;
  readonly storage: Pick<StorageAccess, 'estimate'>;
  readonly clock: Clock;
  /** Runs once the restore is in (the reminders re-read their settings here). */
  readonly afterRestore?: () => unknown;
}

/** Storage a restore needs: photos, a thumbnail allowance each, the document and the reserve. */
export function neededBytes(photoBytes: number, photoCount: number, documentBytes: number): number {
  return photoBytes + photoCount * PHOTO_ALLOWANCE_BYTES + documentBytes + RESERVE_BYTES;
}

/** True when the browser says there is room, or says nothing (it cannot be checked then). */
async function hasRoom(storage: Pick<StorageAccess, 'estimate'>, needed: number) {
  const estimate = await storage.estimate();
  return estimate === null || estimate.quota - estimate.usage >= needed;
}

function archiveProblem(error: unknown): RestoreProblem {
  if (error instanceof ZipError) {
    return error.problem === 'damaged' || error.problem === 'checksum' ? 'damaged' : 'notBackup';
  }
  if (error instanceof BackupArchiveError) {
    return error.problem === 'noPayload' ? 'notBackup' : 'damaged';
  }
  return 'failed';
}

/** The primary key field of a table, from its schema string. */
function keyField(table: BackupTable): string {
  return TABLES[table].split(',')[0]!.trim();
}

/** The rows of every table but `photos`, shaped; null when any row is bad or a key repeats. */
function shapedTables(frame: DocumentFrame): Partial<Record<BackupTable, object[]>> | null {
  const tables: Partial<Record<BackupTable, object[]>> = {};
  for (const table of BACKUP_TABLES) {
    if (table === PHOTO_TABLE) continue;
    const field = keyField(table);
    const keys = new Set<unknown>();
    const rows: object[] = [];
    for (const raw of frame.tables[table] ?? []) {
      const shaped = shapeRow(table, raw);
      if (shaped.kind === 'bad') return null;
      if (shaped.kind === 'skip') continue;
      const key = (shaped.row as Record<string, unknown>)[field];
      if (keys.has(key)) return null;
      keys.add(key);
      rows.push(shaped.row);
    }
    tables[table] = rows;
  }
  return tables;
}

/** The photo rows to store, each with its file's bytes; null when the list does not hold up. */
function photoRows(frame: DocumentFrame, files: readonly ArchivePhoto[]): PhotoRow[] | null {
  const byName = new Map(files.map((file) => [file.name, file]));
  const ids = new Set<string>();
  const named = new Set<string>();
  const rows: PhotoRow[] = [];
  for (const raw of frame.tables[PHOTO_TABLE] ?? []) {
    const listing = readPhotoListing(raw);
    const file = listing ? byName.get(listing.file) : undefined;
    if (!listing || !file || ids.has(listing.id) || named.has(listing.file)) return null;
    ids.add(listing.id);
    named.add(listing.file);
    rows.push({
      id: listing.id,
      blob: file.data,
      width: listing.width,
      height: listing.height,
      bytes: file.size,
      createdAt: listing.createdAt,
    });
  }
  return rows;
}

function settingValue(rows: readonly object[] | undefined, key: string): unknown {
  return (rows as readonly { key: string; value: unknown }[] | undefined)?.find(
    (row) => row.key === key,
  )?.value;
}

/**
 * Reads and checks a picked file, changing nothing. Never rejects: every refusal is a problem.
 */
export async function inspectBackup(
  file: Blob,
  deps: InspectDeps,
): Promise<Result<CheckedBackup, RestoreProblem>> {
  try {
    let unpacked: UnpackedBackup;
    try {
      unpacked = await unpackBackup(file);
    } catch (error) {
      return err(archiveProblem(error));
    }
    const framed = readFrame(unpacked.document);
    if (!framed.ok) return err(framed.problem);
    const { frame } = framed;

    const tables = shapedTables(frame);
    const photos = photoRows(frame, unpacked.photos);
    if (!tables || !photos) return err('damaged');
    const sizes = unpacked.photos.map((photo) => ({ name: photo.name, size: photo.size }));
    const hash = await contentHash({ tables: frame.tables, photos: sizes }, deps.crypto);
    if (hash !== frame.contentHash) return err('damaged');

    const photoBytes = photos.reduce((sum, photo) => sum + photo.bytes, 0);
    const needed = neededBytes(photoBytes, photos.length, unpacked.documentBytes);
    if (!(await hasRoom(deps.storage, needed))) return err('noSpace');

    // This device's own settings stay; the backup's time becomes the last backup.
    const kept = LOCAL_SETTINGS.filter((key) => key !== 'backup.lastAt');
    const settings = [
      ...(tables.settings ?? []),
      { key: 'backup.lastAt', value: frame.exportedAt },
    ];
    return ok({
      summary: {
        madeAt: frame.exportedAt,
        appVersion: frame.appVersion,
        entries: tables.entries?.length ?? 0,
        photos: photos.length,
        messages: tables.coachMessages?.length ?? 0,
        hasProfile: (tables.profile?.length ?? 0) > 0,
        onboardingDone: settingValue(tables.settings, 'onboarding.done') === true,
      },
      neededBytes: needed,
      plan: {
        replace: { ...tables, settings },
        upsert: { [PHOTO_TABLE]: photos },
        keepSettings: kept,
      },
    });
  } catch (error) {
    if (error instanceof CryptoUnavailableError) return err('insecure');
    console.error('Platewise: the backup file could not be checked', error);
    return err('failed');
  }
}

/** Logs a follow-up step that failed; the restore itself is in by then. */
function logged(step: string): (error: unknown) => void {
  return (error) => console.error(`Platewise: after the restore, ${step} failed`, error);
}

/**
 * Restores a checked file: all of it, or nothing when it fails. Never rejects. Runs to its end
 * once started, whatever happens to the screen that started it.
 */
export async function applyBackup(
  checked: CheckedBackup,
  deps: ApplyDeps,
): Promise<Result<BackupSummary, RestoreProblem>> {
  try {
    if (!(await hasRoom(deps.storage, checked.neededBytes))) return err('noSpace');
    await deps.backupRepo.restore(checked.plan);
  } catch (error) {
    console.error('Platewise: the backup could not be restored', error);
    return err('failed');
  }

  await deps.fastRepo.settleOnOpen(deps.clock.now()).catch(logged('ending a running fast'));
  await deps.backupRepo.endRestore().catch(logged('clearing the restore flag'));
  await deps.photoRepo.prune().catch(logged('removing unused photos'));
  try {
    await deps.afterRestore?.();
  } catch (error) {
    logged('the follow-up hook')(error);
  }
  return ok(checked.summary);
}
