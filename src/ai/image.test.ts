import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserImageBackend,
  COACH_THUMBNAIL,
  estimatePayload,
  FOOD_PHOTO,
  prepareImage,
  type ImageBackend,
  type PreparedImage,
} from './image';

/** The smallest bytes that pass for a JPEG: the start-of-image marker, then an APP0 marker. */
const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46);
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** A photo the person picked; its bytes must never reach the request. */
const picked = (type = 'image/heic'): Blob => new Blob([Uint8Array.of(1, 2, 3, 4, 5)], { type });

interface FakeOptions {
  decode?: 'reject' | 'throw';
  encode?: 'reject' | Uint8Array;
}

/** A backend with a decoded size of width × height that records every encode and release. */
function fakeBackend(width: number, height: number, options: FakeOptions = {}) {
  const encodes: Array<{ width: number; height: number; quality: number }> = [];
  let closed = 0;
  const backend: ImageBackend = {
    decode: (blob) => {
      if (options.decode === 'throw') throw new TypeError('not callable');
      if (options.decode === 'reject') {
        return Promise.reject(new DOMException(`cannot read ${blob.type}`, 'InvalidStateError'));
      }
      return Promise.resolve({
        width,
        height,
        toJpeg: (w, h, quality) => {
          encodes.push({ width: w, height: h, quality });
          if (options.encode === 'reject') return Promise.reject(new Error('encoder failed'));
          return Promise.resolve(options.encode ?? JPEG);
        },
        close: () => {
          closed += 1;
        },
      });
    },
  };
  return { backend, encodes, closed: () => closed };
}

/** The prepared photo, failing the test when preparation failed. */
async function prepared(...args: Parameters<typeof prepareImage>): Promise<PreparedImage> {
  const result = await prepareImage(...args);
  if (!result.ok) throw new Error(`failed: ${result.error.kind}`);
  return result.value;
}

const bytesOfBase64 = (base64: string): number[] =>
  Array.from(atob(base64), (char) => char.charCodeAt(0));

const FAILED = { ok: false, error: { kind: 'imageConversion' } };

describe('prepareImage: size (03 §3.5)', () => {
  it('sends a 3 200 × 1 200 photo at 1 600 × 600 (ACC-E7-1)', async () => {
    const fake = fakeBackend(3200, 1200);
    const image = await prepared(picked('image/jpeg'), FOOD_PHOTO, fake.backend);
    expect(fake.encodes).toEqual([{ width: 1600, height: 600, quality: 0.8 }]);
    expect(image).toMatchObject({ width: 1600, height: 600, mediaType: 'image/jpeg' });
  });

  it('shrinks a portrait photo by its longest side', async () => {
    const fake = fakeBackend(1200, 3200);
    await prepared(picked(), FOOD_PHOTO, fake.backend);
    expect(fake.encodes[0]).toMatchObject({ width: 600, height: 1600 });
  });

  it('never enlarges a small photo, and keeps one exactly at the limit', async () => {
    const small = fakeBackend(800, 400);
    expect(await prepared(picked(), FOOD_PHOTO, small.backend)).toMatchObject({
      width: 800,
      height: 400,
    });
    expect(small.encodes).toEqual([{ width: 800, height: 400, quality: 0.8 }]);

    const edge = fakeBackend(1600, 900);
    await prepared(picked(), FOOD_PHOTO, edge.backend);
    expect(edge.encodes[0]).toMatchObject({ width: 1600, height: 900 });
  });

  it('keeps at least one pixel on the short side of a very thin photo', async () => {
    const fake = fakeBackend(10_000, 2);
    await prepared(picked(), FOOD_PHOTO, fake.backend);
    expect(fake.encodes[0]).toMatchObject({ width: 1600, height: 1 });
  });

  it('uses the smaller thumbnail size when asked', async () => {
    const fake = fakeBackend(1400, 1050);
    await prepared(picked(), COACH_THUMBNAIL, fake.backend);
    expect(fake.encodes).toEqual([{ width: 700, height: 525, quality: 0.68 }]);
  });
});

describe('prepareImage: always a fresh JPEG (R03.12)', () => {
  it('re-encodes a photo that needs no shrinking and sends the JPEG, not the picked bytes', async () => {
    const fake = fakeBackend(800, 400);
    const image = await prepared(picked('image/jpeg'), FOOD_PHOTO, fake.backend);
    expect(fake.encodes).toHaveLength(1);
    expect(bytesOfBase64(image.base64)).toEqual(Array.from(JPEG));
    expect(image.bytes).toBe(JPEG.length);
  });

  it('passes the quality through to the encoder', async () => {
    const fake = fakeBackend(2000, 2000);
    await prepared(picked(), { maxEdge: 1000, quality: 0.42 }, fake.backend);
    expect(fake.encodes).toEqual([{ width: 1000, height: 1000, quality: 0.42 }]);
  });

  it('encodes a large JPEG to base64 without losing a byte', async () => {
    const large = new Uint8Array(100_003).map((_, i) => (i * 7) % 256);
    large.set(JPEG.subarray(0, 4));
    const fake = fakeBackend(1600, 1200, { encode: large });
    const image = await prepared(picked(), FOOD_PHOTO, fake.backend);
    expect(image.bytes).toBe(100_003);
    expect(bytesOfBase64(image.base64)).toEqual(Array.from(large));
  });

  it('fails as image conversion when the photo cannot be decoded, as HEIC outside Safari', async () => {
    const fake = fakeBackend(3000, 4000, { decode: 'reject' });
    expect(await prepareImage(picked('image/heic'), FOOD_PHOTO, fake.backend)).toEqual(FAILED);
    expect(fake.encodes).toEqual([]);
  });

  it('fails as image conversion when encoding fails or does not give a JPEG', async () => {
    for (const encode of ['reject', PNG, new Uint8Array(0)] as const) {
      const fake = fakeBackend(800, 600, { encode });
      expect(await prepareImage(picked(), FOOD_PHOTO, fake.backend)).toEqual(FAILED);
      expect(fake.closed()).toBe(1);
    }
  });

  it('fails as image conversion for a decoded size of zero or not a number', async () => {
    for (const [width, height] of [
      [0, 0],
      [640, 0],
      [Number.NaN, 480],
    ] as const) {
      const fake = fakeBackend(width, height);
      expect(await prepareImage(picked(), FOOD_PHOTO, fake.backend)).toEqual(FAILED);
      expect(fake.encodes).toEqual([]);
    }
  });

  it('turns a backend that throws into a failure value, never a throw', async () => {
    const fake = fakeBackend(800, 600, { decode: 'throw' });
    await expect(prepareImage(picked(), FOOD_PHOTO, fake.backend)).resolves.toEqual(FAILED);
  });

  it('releases the decoded photo after encoding', async () => {
    const fake = fakeBackend(800, 600);
    await prepared(picked(), FOOD_PHOTO, fake.backend);
    expect(fake.closed()).toBe(1);
  });
});

describe('estimatePayload (R03.29)', () => {
  it('sums the base64 lengths of the prepared photos', () => {
    const images = [{ base64: 'QUJD' }, { base64: 'REVGR0g=' }, { base64: '' }];
    expect(estimatePayload(images)).toBe(4 + 8 + 0);
    expect(estimatePayload([])).toBe(0);
  });

  it('matches the photos prepareImage gives', async () => {
    const one = await prepared(picked(), FOOD_PHOTO, fakeBackend(800, 600).backend);
    const two = await prepared(
      picked(),
      FOOD_PHOTO,
      fakeBackend(800, 600, { encode: Uint8Array.of(...JPEG, 9, 9, 9) }).backend,
    );
    expect(estimatePayload([one, two])).toBe(one.base64.length + two.base64.length);
    expect(estimatePayload([one, two])).toBe(12 + 16);
  });
});

// ---- The browser backend, with the browser's canvas APIs stubbed ----------------------------

/** A 2D context that records what was drawn. */
function fakeContext() {
  return {
    fillStyle: '',
    imageSmoothingQuality: 'low',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

/** A decoded bitmap of width × height, and the options `createImageBitmap` was called with. */
function stubDecoder(width: number, height: number) {
  const bitmap = { width, height, close: vi.fn() };
  const decode = vi.fn((_blob: Blob, _options?: ImageBitmapOptions) => Promise.resolve(bitmap));
  vi.stubGlobal('createImageBitmap', decode);
  return { bitmap, decode };
}

describe('browserImageBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes upright, draws at the scaled size on an OffscreenCanvas and asks for JPEG', async () => {
    const { bitmap, decode } = stubDecoder(3200, 1200);
    const canvases: Array<{ width: number; height: number; options?: ImageEncodeOptions }> = [];
    const context = fakeContext();
    class FakeOffscreenCanvas {
      readonly record: { width: number; height: number; options?: ImageEncodeOptions };
      constructor(width: number, height: number) {
        this.record = { width, height };
        canvases.push(this.record);
      }
      getContext() {
        return context;
      }
      convertToBlob(options: ImageEncodeOptions) {
        this.record.options = options;
        return Promise.resolve(new Blob([JPEG], { type: 'image/jpeg' }));
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);

    const photo = picked('image/jpeg');
    const image = await prepared(photo, FOOD_PHOTO, browserImageBackend);

    expect(decode).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' });
    expect(canvases).toEqual([
      { width: 1600, height: 600, options: { type: 'image/jpeg', quality: 0.8 } },
    ]);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1600, 600);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 600);
    expect(bytesOfBase64(image.base64)).toEqual(Array.from(JPEG));
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('uses a canvas element where there is no OffscreenCanvas', async () => {
    const { bitmap } = stubDecoder(800, 400);
    vi.stubGlobal('OffscreenCanvas', undefined);
    const context = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never);
    const encoded: Array<{ width: number; height: number; type?: string; quality?: unknown }> = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: unknown,
    ) {
      encoded.push({ width: this.width, height: this.height, type, quality });
      callback(new Blob([JPEG], { type: 'image/jpeg' }));
    });

    const image = await prepared(picked(), COACH_THUMBNAIL, browserImageBackend);

    expect(encoded).toEqual([{ width: 700, height: 350, type: 'image/jpeg', quality: 0.68 }]);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 700, 350);
    expect(image).toMatchObject({ width: 700, height: 350, bytes: JPEG.length });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('fails as image conversion when the canvas element gives no image', async () => {
    stubDecoder(800, 400);
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => fakeContext() as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(null);
    });
    expect(await prepareImage(picked(), FOOD_PHOTO, browserImageBackend)).toEqual(FAILED);
  });

  it('fails as image conversion when the browser cannot decode the photo', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.reject(new DOMException('unreadable', 'InvalidStateError'))),
    );
    expect(await prepareImage(picked('image/heic'), FOOD_PHOTO, browserImageBackend)).toEqual(
      FAILED,
    );
  });

  it('fails as image conversion in a browser without createImageBitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await prepareImage(picked(), FOOD_PHOTO, browserImageBackend)).toEqual(FAILED);
  });
});
