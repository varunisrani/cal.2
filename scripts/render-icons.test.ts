// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_DIR, ICONS, readPngSize } from './render-icons';

/** The first 24 bytes of a PNG: signature, then the IHDR chunk's length, type, width, height. */
function pngHeader(width: number, height: number, chunk = 'IHDR'): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(
    [...chunk].map((c) => c.charCodeAt(0)),
    12,
  );
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('readPngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(readPngSize(pngHeader(192, 180))).toEqual({ width: 192, height: 180 });
    expect(readPngSize(pngHeader(70_000, 1))).toEqual({ width: 70_000, height: 1 });
  });

  it('reads a header that sits inside a larger buffer', () => {
    const outer = new Uint8Array(40);
    outer.set(pngHeader(32, 32), 8);
    expect(readPngSize(outer.subarray(8))).toEqual({ width: 32, height: 32 });
  });

  it('refuses a file that is not a PNG', () => {
    const gif = pngHeader(1, 1);
    gif.set([0x47, 0x49, 0x46, 0x38], 0);
    expect(() => readPngSize(gif)).toThrow('wrong signature');
  });

  it('refuses a truncated header', () => {
    expect(() => readPngSize(pngHeader(1, 1).subarray(0, 20))).toThrow('shorter than its header');
  });

  it('refuses a PNG whose first chunk is not IHDR', () => {
    expect(() => readPngSize(pngHeader(1, 1, 'IDAT'))).toThrow('first chunk is "IDAT"');
  });
});

describe('icon set', () => {
  it('renders the five PNGs of the phase row from our two marks', () => {
    expect(ICONS.map(({ file, size, source }) => [file, size, source])).toEqual([
      ['favicon-32.png', 32, 'mark.svg'],
      ['icon-192.png', 192, 'mark.svg'],
      ['icon-512.png', 512, 'mark.svg'],
      ['icon-maskable-512.png', 512, 'mark-maskable.svg'],
      ['touch-180.png', 180, 'mark-maskable.svg'],
    ]);
  });

  it.each(ICONS)('has $file in public/icons at $size px', ({ file, size }) => {
    expect(readPngSize(readFileSync(join(ICON_DIR, file)))).toEqual({ width: size, height: size });
  });
});
