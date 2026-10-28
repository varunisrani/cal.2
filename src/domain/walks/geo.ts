// Distance along a walk's route (P15-02, D-16.96). GPS fixes wander while a person stands still,
// drop out under trees and jump now and then; summing every hop would add up all of that. So a
// move counts from the last point that counted (the anchor) only once it is longer than half the
// better accuracy of the two fixes (between 3 and 10 m), no faster than a person moves on foot,
// and within a minute of the anchor (a longer gap is a pause or a lost fix: it is not counted and
// the anchor moves on).

import type { RoutePoint } from './model';

/** Mean Earth radius, metres (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/** Fixes less accurate than this are left out. */
export const MAX_ACCURACY_M = 50;
/** Faster than this is a jump or a vehicle, not walking (14.4 km/h). */
export const MAX_SPEED_MPS = 4;
/** A longer gap between two counted points is a pause or a lost fix. */
export const MAX_GAP_MS = 60_000;
/** Bounds of the jitter allowance (half the better accuracy). */
const MIN_MOVE_M = 3;
const MAX_MOVE_M = 10;

/** One counted stretch of the route. */
export interface Move {
  readonly fromAt: number;
  readonly toAt: number;
  readonly metres: number;
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle metres between two positions (haversine). */
export function metresBetween(
  a: Pick<RoutePoint, 'lat' | 'lon'>,
  b: Pick<RoutePoint, 'lat' | 'lon'>,
): number {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A fix that can be used: a real position and time, accurate enough. */
export function isUsableFix(point: RoutePoint): boolean {
  return (
    Number.isFinite(point.at) &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180 &&
    Number.isFinite(point.accuracyM) &&
    point.accuracyM >= 0 &&
    point.accuracyM <= MAX_ACCURACY_M
  );
}

/** The usable fixes, oldest first. */
export function usableFixes(points: readonly RoutePoint[]): RoutePoint[] {
  return points.filter(isUsableFix).sort((a, b) => a.at - b.at);
}

/** How far a fix must be from the anchor before the move counts. */
function moveAllowance(a: RoutePoint, b: RoutePoint): number {
  const half = Math.min(a.accuracyM, b.accuracyM) / 2;
  return Math.min(MAX_MOVE_M, Math.max(MIN_MOVE_M, half));
}

/** The moves of a route that count, in order. */
export function countedMoves(points: readonly RoutePoint[]): Move[] {
  const moves: Move[] = [];
  let anchor: RoutePoint | undefined;
  for (const point of usableFixes(points)) {
    if (anchor === undefined) {
      anchor = point;
      continue;
    }
    const gap = point.at - anchor.at;
    if (gap > MAX_GAP_MS) {
      anchor = point;
      continue;
    }
    const metres = metresBetween(anchor, point);
    if (metres < moveAllowance(anchor, point)) continue;
    // A jump: this fix is left out and the anchor stays.
    if (gap <= 0 || metres / (gap / 1000) > MAX_SPEED_MPS) continue;
    moves.push({ fromAt: anchor.at, toAt: point.at, metres });
    anchor = point;
  }
  return moves;
}
