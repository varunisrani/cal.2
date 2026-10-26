import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserImageCodec, fitWithin, longestSide } from './imageCodec';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fitWithin', () => {
  it('brings the longest side of a landscape or portrait photo down to the edge', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(4000, 3000, 320)).toEqual({ width: 320, height: 240 });
  });

  it('never enlarges, and keeps a photo exactly at the edge', () => {
    expect(fitWithin(1000, 750, 2048)).toEqual({ width: 1000, height: 750 });
    expect(fitWithin(2048, 1000, 2048)).toEqual({ width: 2048, height: 1000 });
  });

  it('rounds, and keeps at least one pixel on a very thin side', () => {
    expect(fitWithin(3001, 2001, 720)).toEqual({ width: 720, height: 480 });
    expect(fitWithin(9000, 2, 720)).toEqual({ width: 720, height: 1 });
  });

  it('measures the longest side', () => {
    expect(longestSide({ width: 300, height: 4000 })).toBe(4000);
  });
});

/** A decoded bitmap as `createImageBitmap` would give it. */
function fakeBitmap(width: number, height: number) {
  return { width, height, close: vi.fn() };
}

/** The 2d context calls a canvas received, in order. */
function recordingContext() {
  const calls: unknown[][] = [];
  const context = {
    set fillStyle(value: string) {
      calls.push(['fillStyle', value]);
    },
    set imageSmoothingQuality(value: string) {
      calls.push(['imageSmoothingQuality', value]);
    },
    fillRect: (...args: unknown[]) => calls.push(['fillRect', ...args]),
    drawImage: (_source: unknown, ...args: unknown[]) => calls.push(['drawImage', ...args]),
  };
  return { context, calls };
}

/** Stubs `createImageBitmap` and an OffscreenCanvas whose encoder gives `type`. */
function stubBrowser(bitmap: ReturnType<typeof fakeBitmap>, type = 'image/jpeg') {
  const decode = vi.fn(async () => bitmap);
  const { context, calls } = recordingContext();
  const canvases: Array<{ width: number; height: number }> = [];
  const encodeOptions: unknown[] = [];
  class FakeOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      canvases.push({ width, height });
    }
    getContext() {
      return context;
    }
    async convertToBlob(options: { type: string; quality: number }) {
      encodeOptions.push(options);
      return new Blob(['jpeg'], { type });
    }
  }
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return { decode, calls, canvases, encodeOptions };
}

describe('browserImageCodec', () => {
  it('decodes with the photo’s EXIF orientation applied and reports the upright size', async () => {
    const browser = stubBrowser(fakeBitmap(3000, 4000));
    const file = new Blob(['photo'], { type: 'image/jpeg' });

    const picture = await browserImageCodec.decode(file);

    expect(browser.decode).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(picture).toMatchObject({ width: 3000, height: 4000 });
  });

  it('draws at the fitted size on a white fill and asks for a JPEG at the quality', async () => {
    const browser = stubBrowser(fakeBitmap(4000, 3000));
    const picture = await browserImageCodec.decode(new Blob(['photo']));

    const jpeg = await picture?.toJpeg(2048, 0.8);

    expect(jpeg?.type).toBe('image/jpeg');
    expect(browser.canvases).toEqual([{ width: 2048, height: 1536 }]);
    expect(browser.encodeOptions).toEqual([{ type: 'image/jpeg', quality: 0.8 }]);
    expect(browser.calls).toEqual([
      ['fillStyle', '#ffffff'],
      ['fillRect', 0, 0, 2048, 1536],
      ['imageSmoothingQuality', 'high'],
      ['drawImage', 0, 0, 2048, 1536],
    ]);
  });

  it('never draws a small picture larger than it is', async () => {
    const browser = stubBrowser(fakeBitmap(640, 480));
    const picture = await browserImageCodec.decode(new Blob(['photo']));

    await picture?.toJpeg(720, 0.8);

    expect(browser.canvases).toEqual([{ width: 640, height: 480 }]);
  });

  it('rejects when the encoder gives something other than a JPEG', async () => {
    stubBrowser(fakeBitmap(4000, 3000), 'image/png');
    const picture = await browserImageCodec.decode(new Blob(['photo']));

    await expect(picture?.toJpeg(320, 0.76)).rejects.toThrow(/not a JPEG/);
  });

  it('releases the decoded pixels on close', async () => {
    const bitmap = fakeBitmap(800, 600);
    stubBrowser(bitmap);
    const picture = await browserImageCodec.decode(new Blob(['photo']));

    picture?.close();

    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('uses a canvas element where there is no OffscreenCanvas', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => fakeBitmap(4000, 3000)),
    );
    const { context, calls } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => context as unknown as CanvasRenderingContext2D,
    );
    const sizes: Array<[number, number]> = [];
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      done,
      type,
    ) {
      sizes.push([this.width, this.height]);
      done(new Blob(['jpeg'], { type }));
    });
    expect(typeof OffscreenCanvas).toBe('undefined');

    const picture = await browserImageCodec.decode(new Blob(['photo']));
    const jpeg = await picture?.toJpeg(320, 0.76);

    expect(jpeg?.type).toBe('image/jpeg');
    expect(sizes).toEqual([[320, 240]]);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.76);
    expect(calls).toContainEqual(['drawImage', 0, 0, 320, 240]);
  });

  it('rejects when the canvas element gives no image', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => fakeBitmap(4000, 3000)),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => recordingContext().context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(null));

    const picture = await browserImageCodec.decode(new Blob(['photo']));

    await expect(picture?.toJpeg(320, 0.76)).rejects.toThrow(/no image/);
  });

  it('decodes nothing when the browser cannot read the file, as HEIC outside Safari', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      }),
    );

    expect(await browserImageCodec.decode(new Blob(['heic'], { type: 'image/heic' }))).toBeNull();
  });

  it('decodes nothing in a browser without createImageBitmap', async () => {
    expect(typeof createImageBitmap).toBe('undefined');
    expect(await browserImageCodec.decode(new Blob(['photo']))).toBeNull();
  });

  it('decodes nothing for a picture of no size, and releases it', async () => {
    const bitmap = fakeBitmap(0, 300);
    stubBrowser(bitmap);

    expect(await browserImageCodec.decode(new Blob(['photo']))).toBeNull();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
