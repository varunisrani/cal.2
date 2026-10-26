// The photo store's front door (02 §3.19, R02.19, D-16.21): every new meal photo is stored
// through `store`, which is the only place a photo is ever re-encoded. The browser decodes the
// file the right way up; a file it cannot decode (HEIC outside Safari, a damaged file) is refused
// and nothing is written. A photo over 2 048 px on its longest side is redrawn at 2 048 px as a
// JPEG at 0.80, and that copy is kept only when it is smaller than the file; otherwise, and for
// every smaller photo, the file's own bytes are kept. Each stored photo gets a 320 px JPEG
// thumbnail at 0.76, drawn from the upright pixels. Previews (720 px) and the viewer's copy
// (at most 2 048 px) are made on demand and never stored, and nothing here rewrites a stored
// photo: restored photos keep their bytes, and only a missing thumbnail is added later. Photos
// sent to the AI are prepared separately (src/ai/image.ts).

import type { PhotoRepo } from '../data/repos/photoRepo';
import {
  browserImageCodec,
  fitWithin,
  longestSide,
  type ImageCodec,
  type Picture,
} from '../lib/imageCodec';

/** The longest side a new photo is stored at when the smaller copy saves space. */
export const STORED_EDGE = 2048;
/** JPEG quality of that copy, and of the display copies. */
export const STORED_QUALITY = 0.8;
export const THUMB_EDGE = 320;
export const THUMB_QUALITY = 0.76;
/** Photo cards (the capture sheet, the review strip) show this size. */
export const PREVIEW_EDGE = 720;
/** The full-screen viewer never shows more than this. */
export const VIEWER_EDGE = 2048;

export type StorePhotoResult =
  | { readonly kind: 'stored'; readonly id: string }
  /** The browser cannot decode the file: nothing was written. */
  | { readonly kind: 'unsupportedImage' };

export interface PhotoService {
  /** Stores a new photo (camera or library) under a new id, by the rules above. */
  store(file: Blob): Promise<StorePhotoResult>;
  /** The photo's thumbnail, made and saved on first use; null when missing or undecodable. */
  thumbnail(id: string): Promise<Blob | null>;
  /** The photo at card size (720 px); null when missing or undecodable. */
  preview(id: string): Promise<Blob | null>;
  /** The photo for the full-screen viewer (at most 2 048 px); null when missing or undecodable. */
  viewer(id: string): Promise<Blob | null>;
}

export interface PhotoServiceDeps {
  readonly photoRepo: Pick<PhotoRepo, 'put' | 'get' | 'getThumb' | 'setThumb'>;
  /** Defaults to the browser's decoder and canvas. */
  readonly codec?: ImageCodec;
}

interface Kept {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

/** A JPEG of the picture, or null when the browser cannot encode it. */
async function jpegOrNull(picture: Picture, maxEdge: number, quality: number) {
  try {
    return await picture.toJpeg(maxEdge, quality);
  } catch {
    return null;
  }
}

/** What to store for a new photo: the capped copy when it saves space, else the file itself. */
async function keptForStorage(file: Blob, picture: Picture): Promise<Kept> {
  const original: Kept = { blob: file, width: picture.width, height: picture.height };
  if (longestSide(picture) <= STORED_EDGE) return original;
  const capped = await jpegOrNull(picture, STORED_EDGE, STORED_QUALITY);
  if (!capped || capped.size >= file.size) return original;
  return { blob: capped, ...fitWithin(picture.width, picture.height, STORED_EDGE) };
}

export function createPhotoService({
  photoRepo,
  codec = browserImageCodec,
}: PhotoServiceDeps): PhotoService {
  /** Runs `work` on the decoded picture and releases it after; null when it does not decode. */
  async function withPicture<T>(blob: Blob, work: (picture: Picture) => Promise<T>) {
    const picture = await codec.decode(blob);
    if (!picture) return null;
    try {
      return await work(picture);
    } finally {
      picture.close();
    }
  }

  /** A display copy of a stored photo: the photo itself when it is small enough. */
  async function displayCopy(id: string, maxEdge: number): Promise<Blob | null> {
    const photo = await photoRepo.get(id);
    if (!photo) return null;
    const size = longestSide(photo);
    if (size > 0 && size <= maxEdge) return photo.blob;
    return withPicture(photo.blob, (picture) => jpegOrNull(picture, maxEdge, STORED_QUALITY));
  }

  return {
    async store(file) {
      const stored = await withPicture(file, async (picture) => {
        const kept = await keptForStorage(file, picture);
        const thumb = await jpegOrNull(picture, THUMB_EDGE, THUMB_QUALITY);
        return photoRepo.put(kept.blob, {
          width: kept.width,
          height: kept.height,
          ...(thumb ? { thumb } : {}),
        });
      });
      return stored === null ? { kind: 'unsupportedImage' } : { kind: 'stored', id: stored };
    },

    async thumbnail(id) {
      const existing = await photoRepo.getThumb(id);
      if (existing) return existing;
      const photo = await photoRepo.get(id);
      if (!photo) return null;
      const thumb = await withPicture(photo.blob, (picture) =>
        jpegOrNull(picture, THUMB_EDGE, THUMB_QUALITY),
      );
      if (thumb) await photoRepo.setThumb(id, thumb);
      return thumb;
    },

    preview: (id) => displayCopy(id, PREVIEW_EDGE),

    viewer: (id) => displayCopy(id, VIEWER_EDGE),
  };
}
