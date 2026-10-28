// A walk's route as Platewise keeps and draws it (P15-02, D-16.96). The stored route is thinned to
// at most 2 000 fixes (evenly by index, the first and last kept) and written as compact text: a
// version mark, then for each fix the change from the one before in latitude and longitude
// (1e-5 degree, about a metre) and in whole seconds from the start, each change zigzagged (so a
// small negative is a small number) and written 5 bits per character with a sixth bit saying
// that more follow. Drawing projects the fixes onto a box with north up, longitudes squeezed by
// the cosine of the middle latitude so the shape keeps its proportions.

import { usableFixes } from './geo';
import type { RoutePoint } from './model';

/** The most fixes a stored route keeps. */
export const MAX_ROUTE_POINTS = 2_000;

/** A fix of a stored route: seconds from the walk's start. */
export interface RouteFix {
  readonly lat: number;
  readonly lon: number;
  readonly sec: number;
}

const VERSION = 'r1:';
const SCALE = 1e5;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MORE = 0x20;
const BITS = 0x1f;

/** At most `max` fixes, spread evenly by index, the first and last always kept. */
export function thinRoute<T>(points: readonly T[], max = MAX_ROUTE_POINTS): T[] {
  if (points.length <= max) return [...points];
  if (max <= 1) return points.slice(0, Math.max(0, max));
  const kept: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let index = 0; index < max; index++) kept.push(points[Math.round(index * step)]!);
  return kept;
}

/** The usable fixes of a walk, thinned, with times in seconds from `startedAt`. */
export function routeFixes(points: readonly RoutePoint[], startedAt: number): RouteFix[] {
  return thinRoute(usableFixes(points)).map((point) => ({
    lat: point.lat,
    lon: point.lon,
    sec: Math.max(0, Math.round((point.at - startedAt) / 1000)),
  }));
}

function writeNumber(value: number, out: string[]): void {
  let rest = value < 0 ? -2 * value - 1 : 2 * value;
  do {
    let chunk = rest % 32;
    rest = Math.floor(rest / 32);
    if (rest > 0) chunk |= MORE;
    out.push(ALPHABET[chunk]!);
  } while (rest > 0);
}

/** The route as text; empty for no fixes. */
export function encodeRoute(fixes: readonly RouteFix[]): string {
  if (fixes.length === 0) return '';
  const out: string[] = [VERSION];
  let lat = 0;
  let lon = 0;
  let sec = 0;
  for (const fix of fixes) {
    const nextLat = Math.round(fix.lat * SCALE);
    const nextLon = Math.round(fix.lon * SCALE);
    const nextSec = Math.round(fix.sec);
    writeNumber(nextLat - lat, out);
    writeNumber(nextLon - lon, out);
    writeNumber(nextSec - sec, out);
    lat = nextLat;
    lon = nextLon;
    sec = nextSec;
  }
  return out.join('');
}

/** The fixes of a stored route; empty for empty text, null for text that does not read. */
export function decodeRoute(text: string): RouteFix[] | null {
  if (text === '') return [];
  if (!text.startsWith(VERSION)) return null;
  const numbers: number[] = [];
  let value = 0;
  let scale = 1;
  for (const char of text.slice(VERSION.length)) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return null;
    value += (index & BITS) * scale;
    scale *= 32;
    if ((index & MORE) === 0) {
      numbers.push(value % 2 === 0 ? value / 2 : -(value + 1) / 2);
      value = 0;
      scale = 1;
    }
  }
  if (scale !== 1 || numbers.length % 3 !== 0) return null;
  const fixes: RouteFix[] = [];
  let lat = 0;
  let lon = 0;
  let sec = 0;
  for (let index = 0; index < numbers.length; index += 3) {
    lat += numbers[index]!;
    lon += numbers[index + 1]!;
    sec += numbers[index + 2]!;
    fixes.push({ lat: lat / SCALE, lon: lon / SCALE, sec });
  }
  return fixes;
}

export interface RouteShape {
  /** SVG path data in the box's units; empty with fewer than two fixes. */
  readonly path: string;
  readonly start: { readonly x: number; readonly y: number } | null;
  readonly end: { readonly x: number; readonly y: number } | null;
}

/** The route drawn into a `width` × `height` box with `pad` kept clear on every side. */
export function routeShape(
  fixes: readonly Pick<RouteFix, 'lat' | 'lon'>[],
  width: number,
  height: number,
  pad = 0,
): RouteShape {
  if (fixes.length === 0) return { path: '', start: null, end: null };
  const lats = fixes.map((fix) => fix.lat);
  const lons = fixes.map((fix) => fix.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const squeeze = Math.cos((midLat * Math.PI) / 180);
  const xs = lons.map((lon) => lon * squeeze);
  const minX = Math.min(...xs);
  const maxY = Math.max(...lats);
  const spanX = Math.max(...xs) - minX;
  const spanY = maxY - Math.min(...lats);
  const innerW = Math.max(0, width - 2 * pad);
  const innerH = Math.max(0, height - 2 * pad);
  const span = Math.max(spanX / (innerW || 1), spanY / (innerH || 1));
  const scale = span > 0 ? 1 / span : 0;
  // Centred in the box.
  const offsetX = pad + (innerW - spanX * scale) / 2;
  const offsetY = pad + (innerH - spanY * scale) / 2;
  const round = (n: number) => Math.round(n * 10) / 10;
  const placed = fixes.map((_, index) => ({
    x: round(offsetX + (xs[index]! - minX) * scale),
    y: round(offsetY + (maxY - lats[index]!) * scale),
  }));
  const path =
    placed.length < 2
      ? ''
      : placed.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return { path, start: placed[0]!, end: placed[placed.length - 1]! };
}
