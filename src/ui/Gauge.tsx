import { useId, type ReactNode } from 'react';
import styles from './display.module.css';

// The arc lives in a 240 × 120 box: a half circle around the middle of the bottom edge, its
// outer edge touching the box's sides and top.
const BOX_WIDTH = 240;
const BOX_HEIGHT = 120;
const STROKE = 16;
const RADIUS = BOX_WIDTH / 2 - STROKE / 2;
const CENTRE_X = BOX_WIDTH / 2;
const CENTRE_Y = BOX_HEIGHT;

/** The upper half circle, left end to right end over the top (clockwise on screen). */
const ARC = `M${CENTRE_X - RADIUS} ${CENTRE_Y}A${RADIUS} ${RADIUS} 0 0 1 ${CENTRE_X + RADIUS} ${CENTRE_Y}`;

/** Path lengths are given in degrees, so dashes and the sweep share one unit. */
const HALF_TURN = 180;

// 25 dashes with 24 equal gaps fill the half turn exactly, so both ends finish on a dash.
const DASHES = 25;
const GAP = 2.5;
const DASH = (HALF_TURN - (DASHES - 1) * GAP) / DASHES;

/**
 * How far the fill sweeps, in degrees: 180 × eaten ÷ goal, never below 0 and never past the full
 * half turn. `null` when there is no goal (≤ 0 or not a number): then nothing is filled at all.
 */
export function gaugeSweep(eaten: number, goal: number): number | null {
  if (!Number.isFinite(goal) || goal <= 0) return null;
  if (!Number.isFinite(eaten) || eaten <= 0) return 0;
  return HALF_TURN * Math.min(eaten / goal, 1);
}

export interface GaugeProps {
  /** Energy eaten so far, in the same unit as `goal` (the comparison is the caller's). */
  readonly eaten: number;
  readonly goal: number;
  /** The small title over the number, e.g. the energy unit's name. */
  readonly heading: ReactNode;
  /** The eaten amount as shown, already formatted in the display unit. */
  readonly value: ReactNode;
  /** The line under the number: what is left, over, reached, or that there is no goal. */
  readonly status: ReactNode;
  /** A small mark before the status (decorative). */
  readonly statusIcon?: ReactNode;
  readonly 'data-ui'?: string;
}

/**
 * The energy gauge: a dashed half arc whose filled part grows with eaten ÷ goal and stays full
 * past the goal. The arc is drawing only; the heading, value and status are text, and the gauge
 * is a group named by the heading and described by the value and the status.
 */
export function Gauge({
  eaten,
  goal,
  heading,
  value,
  status,
  statusIcon,
  'data-ui': dataUi,
}: GaugeProps) {
  const id = useId();
  const headingId = `${id}-heading`;
  const valueId = `${id}-value`;
  const statusId = `${id}-status`;
  const maskId = `${id}-sweep`;
  const sweep = gaugeSweep(eaten, goal);

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      aria-describedby={`${valueId} ${statusId}`}
      className={styles.gauge}
      data-ui={dataUi}
    >
      <svg
        className={styles.gaugeArc}
        viewBox={`0 0 ${BOX_WIDTH} ${BOX_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        <path
          className={styles.gaugeTrack}
          data-part="track"
          d={ARC}
          pathLength={HALF_TURN}
          strokeWidth={STROKE}
          strokeDasharray={`${DASH} ${GAP}`}
        />
        {sweep === null ? null : (
          <>
            <mask id={maskId} className={styles.gaugeMask} maskUnits="userSpaceOnUse">
              <path
                className={styles.gaugeSweep}
                data-part="sweep"
                d={ARC}
                pathLength={HALF_TURN}
                strokeWidth={STROKE + 4}
                strokeDasharray={`${sweep} ${HALF_TURN}`}
              />
            </mask>
            <path
              className={styles.gaugeFill}
              data-part="fill"
              data-sweep={sweep}
              d={ARC}
              pathLength={HALF_TURN}
              strokeWidth={STROKE}
              strokeDasharray={`${DASH} ${GAP}`}
              mask={`url(#${maskId})`}
            />
          </>
        )}
      </svg>
      <div className={styles.gaugeReadout}>
        <span id={headingId} className={styles.gaugeHeading}>
          {heading}
        </span>
        <span id={valueId} className={styles.gaugeValue}>
          {value}
        </span>
        <span id={statusId} className={styles.gaugeStatus}>
          {statusIcon}
          {status}
        </span>
      </div>
    </div>
  );
}
