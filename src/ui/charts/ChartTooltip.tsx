import styles from './charts.module.css';

/** The tooltip's width in px; the charts keep it inside the plot with this. */
export const TOOLTIP_WIDTH = 120;

/** Where a tooltip over the point at `x` starts: centred on it, kept inside the plot. */
export function tooltipLeft(x: number, plotWidth: number): number {
  return Math.min(Math.max(x - TOOLTIP_WIDTH / 2, 0), Math.max(plotWidth - TOOLTIP_WIDTH, 0));
}

export interface ChartTooltipProps {
  /** The point's x in plot px. */
  readonly x: number;
  readonly plotWidth: number;
  readonly date: string;
  readonly value: string;
  readonly 'data-ui'?: string;
}

/** The small card over the plot naming the inspected point's date and value. */
export function ChartTooltip({ x, plotWidth, date, value, 'data-ui': dataUi }: ChartTooltipProps) {
  return (
    <div
      className={styles.tooltip}
      data-part="tooltip"
      data-ui={dataUi}
      style={{ left: `${tooltipLeft(x, plotWidth)}px`, width: `${TOOLTIP_WIDTH}px` }}
    >
      <span className={styles.tooltipDate}>{date}</span>
      <span className={styles.tooltipValue}>{value}</span>
    </div>
  );
}
