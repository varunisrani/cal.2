/**
 * Renders the PNG icons from the hand-written SVGs in public/icons: `tsx scripts/render-icons.ts`.
 * Uses the Playwright Chromium that is already installed (it never installs a browser). The
 * output is deterministic: a second run writes byte-identical files. After writing, it reads each
 * PNG back and checks the size in its header, and that the maskable renders draw nothing outside
 * the central safe circle. Exit code: 0 done, 1 a check failed, 2 the browser could not run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ICON_DIR = join(PRODUCT_ROOT, 'public/icons');

/** Share of the icon size that a maskable icon's drawing must stay within (radius from centre). */
export const SAFE_ZONE_RADIUS = 0.4;

export interface IconTarget {
  /** The PNG written to the icon folder. */
  file: string;
  /** The SVG it is rendered from. */
  source: 'mark.svg' | 'mark-maskable.svg';
  /** Width and height in pixels. */
  size: number;
}

export const ICON_TARGETS: readonly IconTarget[] = [
  { file: 'icon-192.png', source: 'mark.svg', size: 192 },
  { file: 'icon-512.png', source: 'mark.svg', size: 512 },
  { file: 'icon-maskable-512.png', source: 'mark-maskable.svg', size: 512 },
  // iOS fills transparent corners with black and rounds the icon itself: a full-bleed square.
  { file: 'touch-180.png', source: 'mark-maskable.svg', size: 180 },
  { file: 'favicon-32.png', source: 'mark.svg', size: 32 },
];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  interlace: number;
}

/** Reads the IHDR chunk, which a valid PNG has right after its signature. Throws otherwise. */
export function readPngHeader(bytes: Uint8Array): PngHeader {
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error('not a PNG file (bad signature or too short)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCharCode(...bytes.subarray(12, 16));
  if (view.getUint32(8) !== 13 || type !== 'IHDR')
    throw new Error('the PNG does not start with IHDR');
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    bitDepth: bytes[24]!,
    colourType: bytes[25]!,
    interlace: bytes[28]!,
  };
}

export interface RgbaImage {
  width: number;
  height: number;
  /** Four bytes per pixel, rows top to bottom. */
  pixels: Uint8Array;
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what Chromium writes) to RGBA pixels. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const header = readPngHeader(bytes);
  const channels = header.colourType === 6 ? 4 : header.colourType === 2 ? 3 : 0;
  if (header.bitDepth !== 8 || channels === 0 || header.interlace !== 0) {
    throw new Error('only 8-bit, non-interlaced RGB or RGBA PNGs are decoded');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const data: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const { width, height } = header;
  const stride = width * channels;
  if (raw.length !== height * (stride + 1))
    throw new Error('the PNG image data has the wrong length');

  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? rows[out + x - channels]! : 0;
      const up = y > 0 ? rows[out - stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? rows[out - stride + x - channels]! : 0;
      let predicted: number;
      if (filter === 0) predicted = 0;
      else if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else throw new Error(`unknown PNG row filter ${filter}`);
      rows[out + x] = (line[x]! + predicted) & 0xff;
    }
  }
  if (channels === 4) return { width, height, pixels: rows };
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < rows.length; i += 3, j += 4) {
    pixels.set(rows.subarray(i, i + 3), j);
    pixels[j + 3] = 255;
  }
  return { width, height, pixels };
}

/**
 * Pixels outside the centred circle of radius `share × width` that differ from the top-left
 * pixel (the background). Zero means the drawing fits the safe zone.
 */
export function pixelsOutsideSafeZone(image: RgbaImage, share = SAFE_ZONE_RADIUS): number {
  const { width, height, pixels } = image;
  const radius = share * width;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - width / 2;
      const dy = y + 0.5 - height / 2;
      if (dx * dx + dy * dy <= radius * radius) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        if (pixels[i + c] !== pixels[c]) {
          count++;
          break;
        }
      }
    }
  }
  return count;
}

/** Problems with a written icon, as readable lines; an empty list means it is right. */
export function checkIcon(target: IconTarget, png: Uint8Array): string[] {
  const problems: string[] = [];
  let header: PngHeader;
  try {
    header = readPngHeader(png);
  } catch (error) {
    return [`${target.file}: ${(error as Error).message}`];
  }
  if (header.width !== target.size || header.height !== target.size) {
    problems.push(
      `${target.file}: ${header.width}×${header.height}, expected ${target.size}×${target.size}`,
    );
  }
  if (target.source === 'mark-maskable.svg') {
    const outside = pixelsOutsideSafeZone(decodePng(png));
    if (outside > 0) {
      problems.push(`${target.file}: ${outside} pixels drawn outside the maskable safe zone`);
    }
  }
  return problems;
}

/** The page that shows one SVG at `size` pixels on a transparent background. */
function pageFor(svg: Uint8Array, size: number): string {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return (
    '<!doctype html><html><head><style>html,body{margin:0;background:transparent}' +
    `img{display:block}</style></head><body><img alt="" width="${size}" height="${size}" ` +
    `src="${src}"></body></html>`
  );
}

/** Renders every target into `dir` with one headless Chromium. */
export async function renderIcons(
  dir: string = ICON_DIR,
  targets: readonly IconTarget[] = ICON_TARGETS,
): Promise<void> {
  // Loaded here so the helpers above can be tested without Playwright.
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const target of targets) {
      await page.setViewportSize({ width: target.size, height: target.size });
      await page.setContent(pageFor(readFileSync(join(dir, target.source)), target.size));
      // The SVG is a data URL: wait until it is decoded, never on a timer.
      await page.evaluate('document.querySelector("img").decode()');
      const png = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: target.size, height: target.size },
        omitBackground: true,
        animations: 'disabled',
        caret: 'hide',
      });
      writeFileSync(join(dir, target.file), png);
    }
  } finally {
    await browser.close();
  }
}

export async function main(dir: string = ICON_DIR): Promise<number> {
  try {
    await renderIcons(dir);
  } catch (error) {
    console.error(
      `render-icons: Chromium could not render the icons (${(error as Error).message})`,
    );
    return 2;
  }
  const problems = ICON_TARGETS.flatMap((target) =>
    checkIcon(target, readFileSync(join(dir, target.file))),
  );
  for (const target of ICON_TARGETS) {
    const ok = !problems.some((p) => p.startsWith(`${target.file}:`));
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${target.file} (${target.size} px, from ${target.source})`,
    );
  }
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    return 1;
  }
  return 0;
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  process.exitCode = await main();
}
