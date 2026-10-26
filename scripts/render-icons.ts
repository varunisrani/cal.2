/**
 * Renders the app's PNG icons from our two SVG marks: `tsx scripts/render-icons.ts`.
 * Playwright's Chromium (already installed; this script never installs one) draws each SVG as an
 * image at the exact pixel size, with a fixed viewport, scale 1 and an sRGB profile, so two runs
 * on one machine give byte-identical files. Every PNG's header is read back and its size
 * checked. Exit code: 0 all written, 1 a render or size problem.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const ICON_DIR = join(PRODUCT_ROOT, 'public', 'icons');

export interface IconJob {
  /** The PNG written in public/icons. */
  readonly file: string;
  /** The SVG it is drawn from: the rounded tile, or the full-bleed maskable one. */
  readonly source: 'mark.svg' | 'mark-maskable.svg';
  /** Width and height in pixels. */
  readonly size: number;
}

export const ICONS: readonly IconJob[] = [
  { file: 'favicon-32.png', source: 'mark.svg', size: 32 },
  { file: 'icon-192.png', source: 'mark.svg', size: 192 },
  { file: 'icon-512.png', source: 'mark.svg', size: 512 },
  { file: 'icon-maskable-512.png', source: 'mark-maskable.svg', size: 512 },
  // iOS rounds the corners itself and turns transparency black: the opaque maskable art suits it.
  { file: 'touch-180.png', source: 'mark-maskable.svg', size: 180 },
];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk, which must be the first chunk. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) throw new Error('not a PNG: shorter than its header');
  if (PNG_SIGNATURE.some((byte, i) => bytes[i] !== byte)) {
    throw new Error('not a PNG: wrong signature');
  }
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk !== 'IHDR') throw new Error(`not a PNG: first chunk is "${chunk}", not IHDR`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The page each icon is shot from: one image, no margins, transparent background. */
const SHOT_PAGE = `<!doctype html>
<html><head><style>
  html, body { margin: 0; background: transparent; }
  img { display: block; }
</style></head><body><img alt=""></body></html>`;

/** The parts of the page's `<img>` the script uses (scripts are compiled without DOM types). */
interface ShotImage {
  width: number;
  height: number;
  src: string;
  decode(): Promise<void>;
}

export async function renderIcons(log: (line: string) => void = console.log): Promise<void> {
  // Loaded here, not at the top, so tests can import this file without Playwright.
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--disable-gpu', '--disable-lcd-text'],
  });
  try {
    for (const icon of ICONS) {
      const page = await browser.newPage({
        viewport: { width: icon.size, height: icon.size },
        deviceScaleFactor: 1,
      });
      try {
        await page.setContent(SHOT_PAGE);
        const svg = readFileSync(join(ICON_DIR, icon.source)).toString('base64');
        await page.locator('img').evaluate(
          async (img: ShotImage, { url, size }) => {
            img.width = size;
            img.height = size;
            img.src = url;
            await img.decode();
          },
          { url: `data:image/svg+xml;base64,${svg}`, size: icon.size },
        );
        const png = await page.screenshot({
          type: 'png',
          omitBackground: true,
          clip: { x: 0, y: 0, width: icon.size, height: icon.size },
        });
        const { width, height } = readPngSize(png);
        if (width !== icon.size || height !== icon.size) {
          throw new Error(
            `${icon.file}: rendered ${width}×${height}, expected ${icon.size}×${icon.size}`,
          );
        }
        writeFileSync(join(ICON_DIR, icon.file), png);
        log(`${icon.file.padEnd(24)} ${icon.size}×${icon.size}  from ${icon.source}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  renderIcons().then(
    () => {
      process.exitCode = 0;
    },
    (error: unknown) => {
      console.error(`render-icons: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
