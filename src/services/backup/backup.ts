// Making a backup file and handing it over (06 §3.17, D-16.29, D-16.30, R06.7). One read takes
// every table the backup carries (`payload.ts`); device-local settings are left out; each photo
// becomes a file named after its id. The content hash is taken over exactly the rows and photo
// files that go in, then the document and the photos are packed (`archive.ts`). A photo that can no
// longer be read when it is packed fails the whole backup: its name and size are already in the
// hash, and a file quietly missing a photo must never be made.
//
// The file is offered through the share sheet when the browser can share files, else downloaded
// as `platewise-backup-<yyyy-MM-dd>.zip`. Only a file that was handed over records
// `backup.lastAt`, and only when no erase happened since the backup started (R06.5).

import { CryptoUnavailableError } from '../../data/crypto';
import { decodePhoto } from '../../data/codecs';
import type { BackupRepo } from '../../data/repos/backupRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';
import { dayKeyOf } from '../../domain/dates/dayKey';
import type { Clock } from '../../lib/clock';
import { browserImageCodec, longestSide, type ImageCodec } from '../../lib/imageCodec';
import { err, ok, type Result } from '../../lib/result';
import { BackupArchiveError, isSafePhotoName, packBackup, type BackupPhotoFile } from './archive';
import { contentHash } from './hash';
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  PHOTO_TABLE,
  encodeBlobs,
  shapeRow,
  type BackupDocument,
  type PhotoListing,
} from './payload';
import { ZIP_TYPE, ZipError } from './zip';

/** Why no backup file was made. */
export type BackupProblem =
  /** A photo could not be read (gone, unreadable, changed, or not decodable for its copy). */
  | 'photoUnreadable'
  /** More than a ZIP without ZIP64 can hold (65 534 files or 4 GiB). */
  | 'tooLarge'
  /** No WebCrypto for the hash: the page is not on a secure origin. */
  | 'insecure'
  | 'failed';

export interface MadeBackup {
  readonly file: File;
  /** When it was made, epoch ms (its `exportedAt`). */
  readonly madeAt: number;
}

export interface MakeDeps {
  readonly backupRepo: Pick<BackupRepo, 'read'>;
  readonly clock: Clock;
  /** Written into the document. */
  readonly appVersion: string;
  /** Decodes photos that need a JPEG copy; the browser's by default. */
  readonly codec?: ImageCodec;
  /** For the hash; the page's WebCrypto by default. */
  readonly crypto?: Pick<Crypto, 'subtle'> | null;
}

/** File extensions for the photo types a backup keeps byte for byte. */
const KEPT_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Quality of the JPEG copy of a photo of another type. */
export const COPY_QUALITY = 0.9;

/**
 * The file extension a stored photo of `type` keeps, or null when it goes in as a JPEG copy (GIF,
 * HEIC, AVIF, no type): the archive takes only jpg, jpeg, png and webp names (R06.9).
 */
export function photoFileType(type: string): string | null {
  const bare = type.split(';')[0]?.trim().toLowerCase() ?? '';
  return KEPT_TYPES[bare] ?? null;
}

/** The file name of a backup made at `madeAt`, by the local day. */
export function backupFileName(madeAt: number): string {
  return `platewise-backup-${dayKeyOf(madeAt)}.zip`;
}

/** A photo that could not be read while the backup was made. */
class PhotoUnreadableError extends Error {
  override readonly name = 'PhotoUnreadableError';

  constructor(cause?: unknown) {
    super('A photo could not be read for the backup', { cause });
  }
}

/** The bytes a photo goes into the backup with, and their extension. */
async function photoData(blob: Blob, codec: ImageCodec): Promise<{ data: Blob; ext: string }> {
  const ext = photoFileType(blob.type);
  if (ext !== null) return { data: blob, ext };
  const picture = await codec.decode(blob);
  if (!picture) throw new PhotoUnreadableError();
  try {
    return { data: await picture.toJpeg(longestSide(picture), COPY_QUALITY), ext: 'jpg' };
  } catch (cause) {
    throw new PhotoUnreadableError(cause);
  } finally {
    picture.close();
  }
}

/** `<id>.<ext>`, or `photo-<n>.<ext>` for an id that is not a plain name; never one used. */
function photoFileName(id: string, ext: string, used: Set<string>): string {
  let name = `${id}.${ext}`;
  for (let n = 1; !isSafePhotoName(name) || used.has(name); n++) name = `photo-${n}.${ext}`;
  used.add(name);
  return name;
}

/** A photo file of the backup; its bytes are a Blob, so its size is known before packing. */
interface PhotoFile extends BackupPhotoFile {
  readonly data: Blob;
}

/** The kept photos as files, and the document's list of them. */
async function photoFiles(rows: readonly unknown[], codec: ImageCodec) {
  const files: PhotoFile[] = [];
  const listing: PhotoListing[] = [];
  const used = new Set<string>();
  for (const raw of rows) {
    const photo = decodePhoto(raw);
    if (!photo) continue;
    const { data, ext } = await photoData(photo.blob, codec);
    const file = photoFileName(photo.id, ext, used);
    files.push({ name: file, data });
    listing.push({
      id: photo.id,
      file,
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt,
    });
  }
  return { files, listing };
}

/** Packs, turning a failure to read a photo's bytes into `PhotoUnreadableError`. */
async function pack(document: BackupDocument, files: readonly PhotoFile[], madeAt: number) {
  try {
    return await packBackup({ document, photos: files, madeAt });
  } catch (error) {
    if (error instanceof ZipError && error.problem !== 'changed') throw error;
    if (error instanceof BackupArchiveError || error instanceof TypeError) throw error;
    throw new PhotoUnreadableError(error);
  }
}

function problemOf(error: unknown): BackupProblem {
  if (error instanceof PhotoUnreadableError) return 'photoUnreadable';
  if (error instanceof CryptoUnavailableError) return 'insecure';
  if (error instanceof ZipError) return 'tooLarge';
  return 'failed';
}

/** Makes the backup file of everything stored now. Never rejects. */
export async function makeBackup(deps: MakeDeps): Promise<Result<MadeBackup, BackupProblem>> {
  try {
    const madeAt = deps.clock.now();
    const stored = await deps.backupRepo.read(BACKUP_TABLES);

    const tables: Record<string, readonly unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      if (table === PHOTO_TABLE) continue;
      tables[table] = stored[table].flatMap((raw) => {
        const shaped = shapeRow(table, raw);
        return shaped.kind === 'row' ? [shaped.row] : [];
      });
    }
    const { files, listing } = await photoFiles(stored.photos, deps.codec ?? browserImageCodec);
    tables[PHOTO_TABLE] = listing;

    const sizes = files.map((photo) => ({ name: photo.name, size: photo.data.size }));
    // An absent `crypto` takes the hash's own default, the page's WebCrypto.
    const hash = await contentHash({ tables, photos: sizes }, deps.crypto);
    const document: BackupDocument = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date(madeAt).toISOString(),
      appVersion: deps.appVersion,
      contentHash: hash,
      payload: { tables: (await encodeBlobs(tables)) as Record<string, readonly unknown[]> },
    };
    const zip = await pack(document, files, madeAt);
    return ok({ file: new File([zip], backupFileName(madeAt), { type: ZIP_TYPE }), madeAt });
  } catch (error) {
    console.error('Platewise: the backup could not be made', error);
    return err(problemOf(error));
  }
}

// ---- Handing the file over ------------------------------------------------------------------------

/** How the file left the app, or why it did not. */
export type OfferResult =
  /** The share sheet took it. */
  | 'shared'
  /** It was downloaded. */
  | 'downloaded'
  /** The person closed the share sheet. */
  | 'cancelled'
  /** The tap that started the backup is too old for the share sheet: offer it on a new tap. */
  | 'needsTap'
  /** Everything was erased since the backup started; it is not offered (R06.5). */
  | 'invalidated';

/** The browser's share sheet and download. */
export interface ShareEnv {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly canShare?: (data: ShareData) => boolean;
  /** Starts a download of the file under its name. */
  readonly download: (file: File) => void;
}

/** How long a download's object URL is kept, so slow browsers still start it. */
const DOWNLOAD_URL_MS = 60_000;

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_MS);
}

/** The page's share sheet (when it can share files) and a link download. */
export function browserShareEnv(): ShareEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    ...(typeof nav?.share === 'function' ? { share: (data) => nav.share(data) } : {}),
    ...(typeof nav?.canShare === 'function' ? { canShare: (data) => nav.canShare(data) } : {}),
    download: downloadFile,
  };
}

export interface OfferDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'set'>;
  /** False once everything was erased after the backup started. */
  readonly stillCurrent: () => boolean;
  /** The browser's by default. */
  readonly share?: ShareEnv;
}

export interface OfferOptions {
  /** Called from a new tap ("Save backup file"): a refused share then downloads instead. */
  readonly afterTap?: boolean;
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

async function handOver(file: File, env: ShareEnv, afterTap: boolean): Promise<OfferResult> {
  const data: ShareData = { files: [file] };
  if (env.share && env.canShare?.(data)) {
    try {
      await env.share(data);
      return 'shared';
    } catch (error) {
      const name = errorName(error);
      if (name === 'AbortError') return 'cancelled';
      if (name === 'NotAllowedError' && !afterTap) return 'needsTap';
      // Any other refusal: the download below still gets the file out.
    }
  }
  env.download(file);
  return 'downloaded';
}

/**
 * Offers a made backup; records `backup.lastAt` (its own time) once it was shared or downloaded
 * and nothing was erased since it started. A failure to record does not undo the hand-over.
 */
export async function offerBackup(
  made: MadeBackup,
  deps: OfferDeps,
  options: OfferOptions = {},
): Promise<OfferResult> {
  if (!deps.stillCurrent()) return 'invalidated';
  const result = await handOver(made.file, deps.share ?? browserShareEnv(), !!options.afterTap);
  if ((result === 'shared' || result === 'downloaded') && deps.stillCurrent()) {
    await deps.settingsRepo.set('backup.lastAt', made.madeAt).catch((error: unknown) => {
      console.error('Platewise: the backup time could not be saved', error);
    });
  }
  return result;
}
