/** WCAG 2 contrast maths for opaque sRGB colours written as hex (`#rgb` or `#rrggbb`). */

export interface Rgb {
  /** 0–255. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Reads `#rgb` or `#rrggbb` (either case). Anything else throws, alpha forms included: the
 * contrast of a translucent colour depends on what lies behind it.
 */
export function parseHex(hex: string): Rgb {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const channels = short ? short.slice(1).map((digit) => digit + digit) : long?.slice(1);
  if (!channels) throw new Error(`Not an opaque hex colour: "${hex}"`);
  const [r = 0, g = 0, b = 0] = channels.map((pair) => Number.parseInt(pair, 16));
  return { r, g, b };
}

/** One sRGB channel (0–255) as linear light (0–1). */
function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance: 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of two colours, from 1 (equal) to 21 (black on white); order is free. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
