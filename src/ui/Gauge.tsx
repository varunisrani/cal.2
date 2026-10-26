import { useId, type CSSProperties, type ReactNode } from 'react';
import styles from './display.module.css';
import { clamp, cx, partHook } from './primitives';

/** The drawing's box, in SVG units: twice as wide as tall, the circle's centre on the bottom edge. */
const BOX_WIDTH = 240;
const BOX_HEIGHT = BOX_WIDTH / 2;

/** The arc's thickness, in SVG units. */
export const GAUGE_STROKE = 14;

/** The dash pattern along the arc, drawn then left out, with flat ends. */
export const GAUGE_DASHES = '4 6';

const RADIUS = (BOX_WIDTH - GAUGE_STROKE) / 2;
const LEFT_END = GAUGE_STROKE / 2;
const RIGHT_END = BOX_WIDTH - GAUGE_STROKE / 2;

/**
 * The upper half of the circle, from its left end over the top to its right end: clockwise on
 * screen, so a dash of length L along it covers L ÷ length of the 180° from the left.
 */
export const GAUGE_ARC = `M ${LEFT_END} ${BOX_HEIGHT} A ${RADIUS} ${RADIUS} 0 0 1 ${RIGHT_END} ${BOX_HEIGHT}`;

/** The reveal arc measures its length in degrees, so its dash length is the sweep. */
const DEGREES = 180;

/**
 * How far the fill sweeps from the left end, in degrees: 180 × the share of the goal, never
 * below 0 and never past the right end. Null when there is no goal (0 or less): no fill at all.
 */
export function gaugeSweep(amount: number, goal: number): number | null {
  if (!(goal > 0)) return null;
  const sweep = (DEGREES * amount) / goal;
  return Number.isNaN(sweep) ? 0 : clamp(sweep, 0, DEGREES);
}

export interface GaugeProps {
  /** The root hook; parts get `<hook>.fill`, `<hook>.value` and `<hook>.status`. */
  readonly 'data-ui': string;
  /** What the fill measures (e.g. energy eaten), in the same unit as `goal`. */
  readonly amount: number;
  /** The amount that fills the arc; 0 or less draws no fill. */
  readonly goal: number;
  /** The small heading inside the dome; it also names the gauge for screen readers. */
  readonly heading: string;
  /** The big number inside the dome, formatted by the caller. */
  readonly value: string;
  /** The line under the number, e.g. how much is left; may start with an icon. */
  readonly status?: ReactNode;
  readonly className?: string;
}

/**
 * The energy gauge: a dashed half-circle whose accent fill sweeps clockwise from the left as the
 * amount nears the goal, and stays full past it. The drawing is hidden from screen readers; the
 * heading, value and status inside it are plain text, so what is read is what is shown.
 */
export function Gauge({
  'data-ui': hook,
  amount,
  goal,
  heading,
  value,
  status,
  className,
}: GaugeProps) {
  const headingId = useId();
  const revealId = useId();
  const sweep = gaugeSweep(amount, goal);
  // The fill is the whole dashed arc shown only under a solid arc of the sweep's length, so the
  // dashes never shift as the fill grows and the change can be animated with a dash transition.
  const reveal = { strokeDasharray: `${round(sweep ?? 0)} ${DEGREES}` };
  const valueLength = { '--gauge-chars': Math.max(value.length, 1) } as CSSProperties;

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-ui={hook}
      className={cx(styles.gauge, className)}
    >
      <svg
        viewBox={`0 0 ${BOX_WIDTH} ${BOX_HEIGHT}`}
        className={styles.gaugeDrawing}
        aria-hidden="true"
        focusable="false"
      >
        <path
          d={GAUGE_ARC}
          className={styles.gaugeTrack}
          fill="none"
          strokeWidth={GAUGE_STROKE}
          strokeDasharray={GAUGE_DASHES}
        />
        {sweep !== null && (
          <>
            <mask
              id={revealId}
              className={styles.gaugeMask}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={BOX_WIDTH}
              height={BOX_HEIGHT}
            >
              <path
                d={GAUGE_ARC}
                pathLength={DEGREES}
                className={styles.gaugeReveal}
                fill="none"
                strokeWidth={GAUGE_STROKE + 2}
                style={reveal}
              />
            </mask>
            <path
              d={GAUGE_ARC}
              className={styles.gaugeFill}
              fill="none"
              strokeWidth={GAUGE_STROKE}
              strokeDasharray={GAUGE_DASHES}
              mask={`url(#${revealId})`}
              data-ui={partHook(hook, 'fill')}
            />
          </>
        )}
      </svg>
      <div className={styles.gaugeReadout}>
        <span id={headingId} className={styles.gaugeHeading}>
          {heading}
        </span>
        <span className={styles.gaugeValue} style={valueLength} data-ui={partHook(hook, 'value')}>
          {value}
        </span>
        {status !== undefined && (
          <span className={styles.gaugeStatus} data-ui={partHook(hook, 'status')}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

/** Two decimals are plenty for a dash length. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
