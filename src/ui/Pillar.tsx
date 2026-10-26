import { useId, type ReactNode } from 'react';
import styles from './display.module.css';

// The tube's size in px; display.module.css draws it at the same size.
const TUBE_WIDTH = 16;
const TUBE_HEIGHT = 64;

/**
 * The filled height of the tube in px: TUBE_HEIGHT × current ÷ goal, at least the tube's width
 * (so zero, or no goal, still shows a round dot) and at most the whole tube.
 */
export function pillarFill(current: number, goal: number): number {
  const share =
    Number.isFinite(goal) && goal > 0 && Number.isFinite(current)
      ? Math.min(Math.max(current / goal, 0), 1)
      : 0;
  return Math.max(TUBE_WIDTH, TUBE_HEIGHT * share);
}

export interface PillarProps {
  /** Today's amount and the goal, in the same unit. */
  readonly current: number;
  readonly goal: number;
  /** The amount as shown above the tube. */
  readonly value: ReactNode;
  /** The nutrient's name under the tube. */
  readonly label: ReactNode;
  /** The line under the name: left, over, reached, or no goal. */
  readonly status: ReactNode;
  readonly 'data-ui'?: string;
}

/**
 * One nutrient against its goal: a vertical tube filling bottom-up, the amount above it, the name
 * and status under it. The tube is drawing only; the group is named by the label and described
 * by the value and the status. Over the goal, the status takes the accent.
 */
export function Pillar({ current, goal, value, label, status, 'data-ui': dataUi }: PillarProps) {
  const id = useId();
  const valueId = `${id}-value`;
  const labelId = `${id}-label`;
  const statusId = `${id}-status`;
  const over = Number.isFinite(goal) && goal > 0 && current > goal;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={`${valueId} ${statusId}`}
      className={styles.pillar}
      data-ui={dataUi}
      data-over={over || undefined}
    >
      <span id={valueId} className={styles.pillarValue}>
        {value}
      </span>
      <span className={styles.pillarTube} aria-hidden="true">
        <span
          className={styles.pillarFill}
          data-part="fill"
          style={{ height: `${pillarFill(current, goal)}px` }}
        />
      </span>
      <span id={labelId} className={styles.pillarLabel}>
        {label}
      </span>
      <span id={statusId} className={styles.pillarStatus}>
        {status}
      </span>
    </div>
  );
}
