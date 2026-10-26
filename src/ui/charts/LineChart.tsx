import { useId, useMemo, useRef, useState } from 'react';
import { dayKeyOf } from '../../domain/dates/dayKey';
import {
  downsample,
  niceTicks,
  paddedRange,
  timeAxisLabels,
  type SeriesPoint,
} from '../../domain/progress/chartMath';
import { formatDay, formatDecimal } from '../../i18n/format';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';
import { areaPath, smoothPath, type PlotPoint } from './paths';
import { chartT, formatAxisDate } from './text';
import {
  DATE_BAND,
  PLOT_HEIGHT,
  PLOT_RADIUS,
  TICK_COLUMN,
  useMeasuredWidth,
  usePlotGesture,
} from './usePlot';

/** The plot is drawn this far in from its sides, so the end dots show whole. */
const SIDE_INSET = 8;
/** Dots mark the points while there are at most this many. */
const DOT_LIMIT = 31;

export interface LineChartProps {
  /** The readings, in the display unit, in any order. */
  readonly points: readonly SeriesPoint[];
  /** A goal drawn as a dashed line; the value range always takes it in. */
  readonly goal?: number | null;
  /** The least padding above and below the values (weight 2, body fat 1). Default 2. */
  readonly minPad?: number;
  /** A value the axis never goes below (body fat: 0). */
  readonly floor?: number;
  /** The chart's name for assistive technology, e.g. "Weight chart". */
  readonly label: string;
  /** The heading of the values in the hidden table (default: the catalogue's "Value"). */
  readonly valueLabel?: string;
  /** A value with its unit, for the tooltip, the goal and the table: "70.4 kg". */
  readonly formatValue: (value: number) => string;
  /** A value-axis label (default: one decimal when not whole). */
  readonly formatTick?: (value: number) => string;
  readonly 'data-ui'?: string;
}

function defaultTick(value: number): string {
  return formatDecimal(value, 1);
}

/** The index of the x nearest to `x`; the xs are in ascending order. */
function nearestIndex(xs: readonly number[], x: number): number | null {
  let best: number | null = null;
  for (let index = 0; index < xs.length; index++) {
    const candidate = xs[index] ?? Infinity;
    const leader = best === null ? Infinity : (xs[best] ?? Infinity);
    if (Math.abs(candidate - x) < Math.abs(leader - x)) best = index;
  }
  return best;
}

/**
 * The trend chart of the weight and body-fat cards: a smooth accent line with a soft wash under
 * it, round-numbered grid lines with their labels on the right, dated guides, and the goal as a
 * dashed line. Long series are averaged into fewer points (dots only while there are few). A
 * sideways drag inspects the nearest point; it renders only when that point changes (R05.16).
 * A hidden table holds the plotted values.
 */
export function LineChart({
  points,
  goal,
  minPad = 2,
  floor,
  label,
  valueLabel,
  formatValue,
  formatTick = defaultTick,
  'data-ui': dataUi,
}: LineChartProps) {
  const clipId = `${useId()}-plot`;
  const [frameRef, width] = useMeasuredWidth<HTMLDivElement>();
  const goalValue = goal !== undefined && goal !== null && Number.isFinite(goal) ? goal : null;

  const plotted = useMemo(() => downsample(points), [points]);
  const range = useMemo(() => {
    const values = points.map((point) => point.value);
    if (goalValue !== null) values.push(goalValue);
    return paddedRange(values, { minPad, floor });
  }, [points, goalValue, minPad, floor]);
  const firstAt = points.length > 0 ? Math.min(...points.map((point) => point.at)) : 0;
  const lastAt = points.length > 0 ? Math.max(...points.map((point) => point.at)) : 0;
  const axis = useMemo(() => timeAxisLabels(firstAt, lastAt), [firstAt, lastAt]);

  const plotWidth = Math.max(0, width - TICK_COLUMN);
  const xAt = (at: number) =>
    lastAt > firstAt
      ? SIDE_INSET + ((at - firstAt) / (lastAt - firstAt)) * Math.max(0, plotWidth - 2 * SIDE_INSET)
      : plotWidth / 2;
  const yAt = (value: number) =>
    range ? (PLOT_HEIGHT * (range.max - value)) / (range.max - range.min) : PLOT_HEIGHT / 2;
  const coords: PlotPoint[] = plotted.map((point) => ({ x: xAt(point.at), y: yAt(point.value) }));

  // The inspected point. The press itself lives in the gesture's ref; this changes, and the
  // chart renders, only when the nearest point does.
  const [inspected, setInspected] = useState<number | null>(null);
  const shown = useRef<number | null>(null);
  const inspect = (index: number | null) => {
    if (shown.current === index) return;
    shown.current = index;
    setInspected(index);
  };
  const gesture = usePlotGesture(plotWidth, {
    onScrub: (x) =>
      inspect(
        nearestIndex(
          coords.map((coord) => coord.x),
          x,
        ),
      ),
    onScrubEnd: () => inspect(null),
  });

  const selectedPoint = inspected === null ? undefined : plotted[inspected];
  const selectedCoord = inspected === null ? undefined : coords[inspected];
  const ticks = range ? niceTicks(range.min, range.max) : [];
  const drawn = range !== null && plotWidth > 0;

  const notes: string[] = [];
  if (goalValue !== null) notes.push(chartT('charts.goal', { value: formatValue(goalValue) }));
  if (plotted.length < points.length) notes.push(chartT('charts.averaged'));
  const rows = plotted.map((point, index) => ({
    key: String(index),
    date: formatDay(dayKeyOf(point.at), 'medium'),
    value: formatValue(point.value),
  }));

  return (
    <figure className={styles.chart} aria-label={label} data-ui={dataUi}>
      <div ref={frameRef} className={styles.frame}>
        <div
          className={styles.plot}
          data-part="plot"
          data-ui={dataUi ? `${dataUi}.plot` : undefined}
          style={{ height: `${PLOT_HEIGHT + DATE_BAND}px` }}
          {...gesture}
        >
          {drawn ? (
            <svg
              className={styles.svg}
              width={width}
              height={PLOT_HEIGHT + DATE_BAND}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <clipPath id={clipId}>
                  <rect width={plotWidth} height={PLOT_HEIGHT} rx={PLOT_RADIUS} />
                </clipPath>
              </defs>
              <rect
                className={styles.plotArea}
                width={plotWidth}
                height={PLOT_HEIGHT}
                rx={PLOT_RADIUS}
              />
              {ticks.map((tick) => (
                <line
                  key={tick}
                  className={styles.grid}
                  x1={0}
                  x2={plotWidth}
                  y1={yAt(tick)}
                  y2={yAt(tick)}
                />
              ))}
              {axis.labels.map((date) => (
                <line
                  key={date.at}
                  className={styles.guide}
                  x1={xAt(date.at)}
                  x2={xAt(date.at)}
                  y1={0}
                  y2={PLOT_HEIGHT}
                />
              ))}
              <g clipPath={`url(#${clipId})`}>
                {goalValue === null ? null : (
                  <line
                    className={styles.goal}
                    data-part="goal"
                    x1={0}
                    x2={plotWidth}
                    y1={yAt(goalValue)}
                    y2={yAt(goalValue)}
                  />
                )}
                <path className={styles.area} d={areaPath(coords, PLOT_HEIGHT)} />
                <path className={styles.line} data-part="line" d={smoothPath(coords)} />
                {coords.length <= DOT_LIMIT
                  ? coords.map((coord, index) => (
                      <circle
                        key={index}
                        className={styles.dot}
                        data-part="dot"
                        cx={coord.x}
                        cy={coord.y}
                        r={3}
                      />
                    ))
                  : null}
                {selectedCoord ? (
                  <>
                    <line
                      className={styles.cursor}
                      data-part="cursor"
                      x1={selectedCoord.x}
                      x2={selectedCoord.x}
                      y1={0}
                      y2={PLOT_HEIGHT}
                    />
                    <circle
                      className={styles.ring}
                      data-part="marker"
                      cx={selectedCoord.x}
                      cy={selectedCoord.y}
                      r={5}
                    />
                  </>
                ) : null}
              </g>
              {ticks.map((tick) => (
                <text
                  key={tick}
                  className={styles.tickLabel}
                  data-part="tick"
                  x={plotWidth + 6}
                  y={yAt(tick)}
                  dominantBaseline="middle"
                >
                  {formatTick(tick)}
                </text>
              ))}
              {axis.labels.map((date) => (
                <text
                  key={date.at}
                  className={styles.dateLabel}
                  data-part="date"
                  x={xAt(date.at)}
                  y={PLOT_HEIGHT + DATE_BAND - 6}
                  textAnchor={date.share === 0 ? 'start' : date.share === 1 ? 'end' : 'middle'}
                >
                  {formatAxisDate(date.day, axis.style)}
                </text>
              ))}
            </svg>
          ) : null}
          {drawn && selectedPoint && selectedCoord ? (
            <ChartTooltip
              x={selectedCoord.x}
              plotWidth={plotWidth}
              date={formatDay(dayKeyOf(selectedPoint.at), 'medium')}
              value={formatValue(selectedPoint.value)}
              data-ui={dataUi ? `${dataUi}.tooltip` : undefined}
            />
          ) : null}
        </div>
      </div>
      <ChartTable
        caption={label}
        valueLabel={valueLabel ?? chartT('charts.value')}
        rows={rows}
        notes={notes}
        data-ui={dataUi ? `${dataUi}.table` : undefined}
      />
    </figure>
  );
}
