/**
 * Decoding, scaling and encoding photos in the browser, behind one small seam so tests in jsdom
 * (which has neither `createImageBitmap` nor a canvas) can use a fake. The browser codec decodes
 * with the photo's EXIF orientation applied, so every size and every copy made from a picture is
 * the right way up, and draws on an OffscreenCanvas, or a canvas element where there is none.
 * The photo store (src/services/photos.ts) builds on it; photos for the AI have their own
 * preparation (src/ai/image.ts).
 */

/** A decoded picture, already the right way up. */
export interface Picture {
  readonly width: number;
  readonly height: number;
  /**
   * The picture as a JPEG at `quality` (0–1), scaled so its longest side is at most `maxEdge`
   * (never enlarged). Rejects when the browser cannot draw or encode it.
   */
  toJpeg(maxEdge: number, quality: number): Promise<Blob>;
  /** Frees the decoded pixels; the picture cannot be drawn afterwards. */
  close(): void;
}

export interface ImageCodec {
  /**
   * The picture in `blob`, upright; null when this browser cannot decode it (HEIC outside
   * Safari, a damaged or empty file). Never rejects.
   */
  decode(blob: Blob): Promise<Picture | null>;
}

/** The longest side of a size. */
export function longestSide(size: { readonly width: number; readonly height: number }): number {
  return Math.max(size.width, size.height);
}

/**
 * The size that fits within `maxEdge`: the longest side brought down to it, never up, the other
 * in proportion, rounded, and never below one pixel.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// ---- The browser codec ------------------------------------------------------------------------

type Context2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function draw(context: Context2d | null, source: ImageBitmap, width: number, height: number) {
  if (!context) throw new Error('No 2d canvas context');
  // A JPEG has no transparency: without a fill, clear parts of a PNG would turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
}

async function encodeJpeg(
  source: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    draw(canvas.getContext('2d'), source, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), source, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The canvas gave no image'))),
      'image/jpeg',
      quality,
    );
  });
}

function pictureOf(bitmap: ImageBitmap): Picture {
  return {
    width: bitmap.width,
    height: bitmap.height,
    async toJpeg(maxEdge, quality) {
      const size = fitWithin(bitmap.width, bitmap.height, maxEdge);
      const jpeg = await encodeJpeg(bitmap, size.width, size.height, quality);
      // A canvas asked for a type it cannot write quietly gives PNG instead.
      if (jpeg.type !== 'image/jpeg') throw new Error(`The encoder gave ${jpeg.type}, not a JPEG`);
      return jpeg;
    },
    close: () => bitmap.close(),
  };
}

/** Decodes with `createImageBitmap` (EXIF orientation applied) and encodes on a canvas. */
export const browserImageCodec: ImageCodec = {
  async decode(blob) {
    if (typeof createImageBitmap !== 'function') return null;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      return null;
    }
    const usable =
      Number.isFinite(bitmap.width) &&
      Number.isFinite(bitmap.height) &&
      bitmap.width > 0 &&
      bitmap.height > 0;
    if (!usable) {
      bitmap.close();
      return null;
    }
    return pictureOf(bitmap);
  },
};
