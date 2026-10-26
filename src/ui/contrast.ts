/**
 * WCAG 2.x contrast maths for hex colours: relative luminance, contrast ratio, and blending a
 * translucent colour over an opaque one (to measure a wash as it is seen).
 */

export interface Rgba {
  /** Channels 0–255. */
  r: number;
  g: number;
  b: number;
  /** Opacity 0–1. */
  a: number;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Reads `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`; throws on anything else. */
export function parseHex(colour: string): Rgba {
  const text = colour.trim();
  if (!HEX.test(text)) throw new RangeError(`"${colour}" is not a hex colour`);
  let digits = text.slice(1);
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
  const channel = (i: number): number => parseInt(digits.slice(i * 2, i * 2 + 2), 16);
  return {
    r: channel(0),
    g: channel(1),
    b: channel(2),
    a: digits.length === 8 ? channel(3) / 255 : 1,
  };
}

const toHexByte = (n: number): string => Math.round(n).toString(16).padStart(2, '0');

/** `#rrggbb` (alpha dropped). */
export function toHex({ r, g, b }: Rgba): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function opaque(colour: string): Rgba {
  const rgba = parseHex(colour);
  if (rgba.a < 1) {
    throw new RangeError(`"${colour}" is translucent; blend it over its background first`);
  }
  return rgba;
}

/** One sRGB channel (0–255) on the linear scale (0–1). */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an opaque colour: 0 for black, 1 for white. */
export function relativeLuminance(colour: string): number {
  const { r, g, b } = opaque(colour);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of two opaque colours, from 1 (same) to 21 (black on white); order-free. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The opaque colour seen when `top` (possibly translucent) lies over the opaque `bottom`. */
export function blend(top: string, bottom: string): string {
  const over = parseHex(top);
  const under = opaque(bottom);
  const mix = (t: number, u: number): number => t * over.a + u * (1 - over.a);
  return toHex({ r: mix(over.r, under.r), g: mix(over.g, under.g), b: mix(over.b, under.b), a: 1 });
}
