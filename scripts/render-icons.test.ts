// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  checkIcon,
  decodePng,
  ICON_DIR,
  ICON_TARGETS,
  pixelsOutsideSafeZone,
  readPngHeader,
  type RgbaImage,
} from './render-icons';

/** A seeded xorshift byte stream, so the test images are the same on every run. */
function bytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  out.set(data, 8);
  // The CRC stays zero: the reader does not check it.
  return out;
}

/**
 * A PNG whose row `y` uses filter `y % 5`, so every filter type is decoded. Rows are filtered
 * from the original bytes, the way an encoder does it.
 */
function encodePng(width: number, height: number, channels: 3 | 4, image: Uint8Array): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= channels ? image[at - channels]! : 0;
      const up = y > 0 ? image[at - stride]! : 0;
      const upLeft = y > 0 && x >= channels ? image[at - stride - channels]! : 0;
      const p = left + up - upLeft;
      const paeth =
        Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upLeft)
          ? left
          : Math.abs(p - up) <= Math.abs(p - upLeft)
            ? up
            : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][filter]!;
      raw[y * (stride + 1) + 1 + x] = (image[at]! - predicted) & 0xff;
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

/** A square image of one colour, with optional single pixels painted another colour. */
function square(size: number, background: number[], dots: Array<[x: number, y: number]> = []) {
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) pixels.set(background, i * 4);
  for (const [x, y] of dots) pixels.set([255, 255, 255, 255], (y * size + x) * 4);
  return { width: size, height: size, pixels } satisfies RgbaImage;
}

describe('readPngHeader', () => {
  it('reads the size, depth and colour type from IHDR', () => {
    const png = encodePng(7, 3, 4, bytes(7 * 3 * 4, 1));
    expect(readPngHeader(png)).toEqual({
      width: 7,
      height: 3,
      bitDepth: 8,
      colourType: 6,
      interlace: 0,
    });
  });

  it('refuses a file that is not a PNG', () => {
    const png = encodePng(2, 2, 3, bytes(12, 2));
    expect(() => readPngHeader(png.subarray(0, 20))).toThrow(/not a PNG/);
    const wrongSignature = Uint8Array.from(png);
    wrongSignature[1] = 0x51;
    expect(() => readPngHeader(wrongSignature)).toThrow(/not a PNG/);
    const wrongChunk = Uint8Array.from(png);
    wrongChunk.set(
      [...'IDAT'].map((c) => c.charCodeAt(0)),
      12,
    );
    expect(() => readPngHeader(wrongChunk)).toThrow(/IHDR/);
  });
});

describe('decodePng', () => {
  it('undoes every row filter of an RGBA image', () => {
    const image = bytes(6 * 10 * 4, 3);
    expect(decodePng(encodePng(6, 10, 4, image))).toEqual({ width: 6, height: 10, pixels: image });
  });

  it('expands an RGB image to opaque RGBA', () => {
    const image = bytes(4 * 5 * 3, 4);
    const { pixels } = decodePng(encodePng(4, 5, 3, image));
    for (let i = 0; i < 20; i++) {
      expect([...pixels.subarray(i * 4, i * 4 + 4)]).toEqual([
        ...image.subarray(i * 3, i * 3 + 3),
        255,
      ]);
    }
  });
});

describe('pixelsOutsideSafeZone', () => {
  it('counts nothing when only the centre is drawn', () => {
    expect(pixelsOutsideSafeZone(square(10, [1, 2, 3, 255], [[5, 5]]))).toBe(0);
  });

  it('counts each pixel drawn beyond the safe radius', () => {
    // On a 10 px square the radius is 4. Pixel centres: (1, 1) lies 4.95 from the middle and
    // (5, 0) 4.53, both outside; (5, 1) at 3.54 and (5, 5) at 0.71 are inside.
    const dots: Array<[number, number]> = [
      [1, 1],
      [5, 0],
      [5, 1],
      [5, 5],
    ];
    expect(pixelsOutsideSafeZone(square(10, [1, 2, 3, 255], dots))).toBe(2);
  });
});

describe('checkIcon', () => {
  const plain = ICON_TARGETS.find((t) => t.source === 'mark.svg')!;
  const maskable = ICON_TARGETS.find((t) => t.source === 'mark-maskable.svg')!;

  it('reports a PNG of the wrong size', () => {
    const png = encodePng(8, 8, 4, new Uint8Array(8 * 8 * 4));
    expect(checkIcon(plain, png)).toEqual([
      `${plain.file}: 8×8, expected ${plain.size}×${plain.size}`,
    ]);
  });

  it('reports a maskable render that draws outside the safe zone', () => {
    const image = square(maskable.size, [9, 9, 9, 255], [[0, maskable.size - 1]]);
    const png = encodePng(maskable.size, maskable.size, 4, image.pixels);
    expect(checkIcon(maskable, png)).toEqual([
      `${maskable.file}: 1 pixels drawn outside the maskable safe zone`,
    ]);
  });

  it('reports a file that is not a PNG', () => {
    expect(checkIcon(plain, new Uint8Array(40))).toEqual([
      `${plain.file}: not a PNG file (bad signature or too short)`,
    ]);
  });
});

describe('the committed icon set', () => {
  it('plans the five PNGs of P00-04', () => {
    expect(ICON_TARGETS.map((t) => [t.file, t.size, t.source])).toEqual([
      ['icon-192.png', 192, 'mark.svg'],
      ['icon-512.png', 512, 'mark.svg'],
      ['icon-maskable-512.png', 512, 'mark-maskable.svg'],
      ['touch-180.png', 180, 'mark-maskable.svg'],
      ['favicon-32.png', 32, 'mark.svg'],
    ]);
  });

  it.each(ICON_TARGETS)('$file has its size and stays in the safe zone', (target) => {
    expect(checkIcon(target, readFileSync(join(ICON_DIR, target.file)))).toEqual([]);
  });

  it.each(['mark.svg', 'mark-maskable.svg'])('%s is self-contained flat art', (name) => {
    const svg = readFileSync(join(ICON_DIR, name), 'utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512"/);
    expect(svg).not.toMatch(/gradient|<image|href=|url\(|<text|<script|<style/i);
    for (const colour of svg.match(/#[0-9a-f]{3,8}\b/gi) ?? []) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
