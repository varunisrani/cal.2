/**
 * Photos prepared for a vision request. Every photo is decoded the right way up, shrunk so its
 * longest side fits, drawn on a canvas and encoded as a fresh JPEG: the model never gets the
 * bytes the person picked, because a HEIC or other file sent under a JPEG label made one vendor
 * hang until the timeout (R03.12). A photo the browser cannot read or encode fails as image
 * conversion (D-16.21). The person's stored photo is not touched.
 */
import { err, ok, type Result } from '../lib/result';
import type { SingleFailure } from './errors';

/** How large a prepared photo may be and how hard it is compressed. */
export interface ImageSize {
  /** The longest side in pixels; smaller photos are never enlarged. */
  readonly maxEdge: number;
  /** JPEG quality from 0 to 1. */
  readonly quality: number;
}

/** Food analysis photos. */
export const FOOD_PHOTO: ImageSize = { maxEdge: 1600, quality: 0.8 };
/** Photos sent to the Coach's model (P08). */
export const COACH_PHOTO: ImageSize = { maxEdge: 1600, quality: 0.78 };
/** The small copy the Coach keeps in its chat history (P08). */
export const COACH_THUMBNAIL: ImageSize = { maxEdge: 700, quality: 0.68 };

export interface PreparedImage {
  readonly mediaType: 'image/jpeg';
  /** The JPEG, base64-encoded for the request body. */
  readonly base64: string;
  /** The JPEG's size in bytes. */
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

/** A decoded photo, upright, ready to draw. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** Draws the photo at width × height on an opaque canvas and encodes it as JPEG. */
  toJpeg(width: number, height: number, quality: number): Promise<Uint8Array>;
  /** Frees the decoded pixels. */
  close(): void;
}

/** Decoding and drawing, behind one seam so tests in jsdom can use a fake. */
export interface ImageBackend {
  /** Reads the photo with its EXIF orientation applied; rejects when the format is unreadable. */
  decode(blob: Blob): Promise<DecodedImage>;
}

/**
 * The photo as a fresh JPEG whose longest side is at most `size.maxEdge`, at `size.quality`.
 * Anything that goes wrong (an unreadable format such as HEIC outside Safari, a broken file, an
 * encoder that fails or does not write JPEG) is an image-conversion failure, never a throw.
 */
export async function prepareImage(
  blob: Blob,
  size: ImageSize,
  backend: ImageBackend = browserImageBackend,
): Promise<Result<PreparedImage, SingleFailure>> {
  let decoded: DecodedImage | undefined;
  try {
    decoded = await backend.decode(blob);
    const { width, height } = fitWithin(decoded.width, decoded.height, size.maxEdge);
    if (!(width > 0 && height > 0)) return conversionFailed();
    const jpeg = await decoded.toJpeg(width, height, size.quality);
    if (!isJpeg(jpeg)) return conversionFailed();
    return ok({
      mediaType: 'image/jpeg',
      base64: toBase64(jpeg),
      bytes: jpeg.length,
      width,
      height,
    });
  } catch {
    return conversionFailed();
  } finally {
    try {
      decoded?.close();
    } catch {
      // Already released; nothing else to free.
    }
  }
}

/**
 * The base64 characters a set of prepared photos adds to a request body, so a caller can warn
 * before sending a very large set (R03.29).
 */
export function estimatePayload(images: readonly Pick<PreparedImage, 'base64'>[]): number {
  return images.reduce((sum, image) => sum + image.base64.length, 0);
}

/** The drawing size: the longest side brought down to `maxEdge`, never up; at least 1 px a side. */
function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A JPEG starts with the start-of-image marker FF D8 and then another marker (FF). */
function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// Bytes per String.fromCharCode call: large enough to be quick, small enough for the call stack.
const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function conversionFailed(): Result<never, SingleFailure> {
  return err({ kind: 'imageConversion' });
}

// ---- The browser backend --------------------------------------------------------------------

/** Decodes with `createImageBitmap` and draws on an OffscreenCanvas, or a canvas element. */
export const browserImageBackend: ImageBackend = {
  async decode(blob) {
    if (typeof createImageBitmap !== 'function') throw new Error('no image decoder');
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      toJpeg: async (width, height, quality) =>
        new Uint8Array(await (await drawJpeg(bitmap, width, height, quality)).arrayBuffer()),
      close: () => bitmap.close(),
    };
  },
};

type Context2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function paint(
  context: Context2d | null,
  source: ImageBitmap,
  width: number,
  height: number,
): void {
  if (!context) throw new Error('no 2d canvas');
  // JPEG has no transparency: without a fill, transparent areas would come out black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
}

async function drawJpeg(
  source: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    paint(canvas.getContext('2d'), source, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), source, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('the canvas gave no image'))),
      'image/jpeg',
      quality,
    );
  });
}
