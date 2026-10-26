// SVG path strings for the charts: a smooth curve through points, the area under it, and a bar
// with rounded top corners. Coordinates are px with y growing downwards, as in SVG.

export interface PlotPoint {
  readonly x: number;
  readonly y: number;
}

/** Two decimals are finer than a device pixel and keep the strings short. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function pointAt(points: readonly PlotPoint[], index: number): PlotPoint {
  const point = points[Math.min(points.length - 1, Math.max(0, index))];
  if (!point) throw new RangeError('A curve needs at least one point');
  return point;
}

/**
 * The cubic pieces of a Catmull-Rom curve through `points`, as "C …" commands that start at the
 * first point. Each point's tangent is half the chord between its neighbours (at the ends, the
 * point itself stands in for the missing neighbour); a piece's handles sit a third of the
 * tangent away from its two ends.
 */
function curvePieces(points: readonly PlotPoint[]): string {
  const tangents = points.map((_, index) => {
    const before = pointAt(points, index - 1);
    const after = pointAt(points, index + 1);
    return { x: (after.x - before.x) / 2, y: (after.y - before.y) / 2 };
  });
  let pieces = '';
  for (let index = 1; index < points.length; index++) {
    const from = pointAt(points, index - 1);
    const to = pointAt(points, index);
    const leave = tangents[index - 1] ?? { x: 0, y: 0 };
    const arrive = tangents[index] ?? { x: 0, y: 0 };
    pieces +=
      `C${n(from.x + leave.x / 3)} ${n(from.y + leave.y / 3)} ` +
      `${n(to.x - arrive.x / 3)} ${n(to.y - arrive.y / 3)} ${n(to.x)} ${n(to.y)}`;
  }
  return pieces;
}

/** A smooth line through every point, in order. Empty for no points. */
export function smoothPath(points: readonly PlotPoint[]): string {
  if (points.length === 0) return '';
  const first = pointAt(points, 0);
  return `M${n(first.x)} ${n(first.y)}${curvePieces(points)}`;
}

/** The region between the smooth line and the horizontal line at `floorY`, closed. */
export function areaPath(points: readonly PlotPoint[], floorY: number): string {
  if (points.length === 0) return '';
  const first = pointAt(points, 0);
  const last = pointAt(points, points.length - 1);
  return (
    `M${n(first.x)} ${n(floorY)}L${n(first.x)} ${n(first.y)}` +
    `${curvePieces(points)}L${n(last.x)} ${n(floorY)}Z`
  );
}

/**
 * A bar standing on `y + height`, its top corners rounded by `radius` (less when the bar is too
 * narrow or too short for it). Empty for a bar with no width or height.
 */
export function roundedTopBar(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  if (!(width > 0) || !(height > 0)) return '';
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const bottom = y + height;
  const right = x + width;
  return (
    `M${n(x)} ${n(bottom)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}` +
    `H${n(right - r)}A${n(r)} ${n(r)} 0 0 1 ${n(right)} ${n(y + r)}V${n(bottom)}Z`
  );
}
