import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayKey } from '../../domain/dates/dayKey';
import {
  barCentre,
  barIndexAt,
  barLabelIndices,
  barLayout,
  barScale,
  MIN_LABEL_WIDTH,
} from '../../domain/progress/chartMath';
import { formatDay, formatInt } from '../../i18n/format';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import styles from './charts.module.css';
import { roundedTopBar } from './paths';
import { chartT, formatAxisDate } from './text';
import {
  DATE_BAND,
  PLOT_HEIGHT,
  PLOT_RADIUS,
  TICK_COLUMN,
  useMeasuredWidth,
  usePlotGesture,
} from './usePlot';

/** The rounding of a bar's top corners, in px (less on thin bars). */
const BAR_RADIUS = 4;

/** One day of the chart: its day and its value in the display unit. */
export interface BarChartDay {
  readonly day: DayKey;
  readonly value: number;
}

export interface BarChartProps {
  /** The days with a value. Days left out, or with 0, get no bar and no slot. */
  readonly days: readonly BarChartDay[];
  /** A goal drawn as a dashed line; the axis always reaches it. None when missing or 0. */
  readonly goal?: number | null;
  /** The chart's name for assistive technology, e.g. "Calories chart". */
  readonly label: string;
  /** The heading of the values in the hidden table (default: the catalogue's "Value"). */
  readonly valueLabel?: string;
  /** A value with its unit, for the tooltip, the goal and the table: "2,140 kcal". */
  readonly formatValue: (value: number) => string;
  /** A value-axis label (default: a whole number). */
  readonly formatTick?: (value: number) => string;
  readonly 'data-ui'?: string;
}

function defaultTick(value: number): string {
  return formatInt(value);
}

/** The pinned or scrubbed bar, tied to the days it was chosen among. */
interface Choice {
  readonly days: string;
  readonly index: number;
}

/**
 * The calorie history: one accent bar with rounded top corners per day with a value, a dashed
 * goal line, an axis from 0 to a round tick at or above the highest day and the goal, and
 * thinned dates under the bars. The bars always fit the plot, however many there are, so the
 * newest day stays within reach (R05.15). A tap pins the nearest bar's tooltip; tapping it
 * again or anywhere outside the chart clears it. A clearly sideways drag scrubs and clears on
 * release; other drags are the page's scroll and leave a pin alone (R05.16). A hidden table
 * holds every day's value.
 */
export function BarChart({
  days,
  goal,
  label,
  valueLabel,
  formatValue,
  formatTick = defaultTick,
  'data-ui': dataUi,
}: BarChartProps) {
  const [frameRef, width] = useMeasuredWidth<HTMLDivElement>();
  const figureRef = useRef<HTMLElement>(null);
  const goalValue =
    goal !== undefined && goal !== null && Number.isFinite(goal) && goal > 0 ? goal : null;

  const bars = useMemo(
    () =>
      days
        .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    [days],
  );
  const daysKey = useMemo(() => bars.map((entry) => entry.day).join(), [bars]);
  const peak = bars.reduce((highest, entry) => Math.max(highest, entry.value), 0);
  const scale = barScale(peak, goalValue ?? 0);
  const plotWidth = Math.max(0, width - TICK_COLUMN);
  const layout = barLayout(plotWidth, bars.length);
  const yAt = (value: number) => PLOT_HEIGHT * (1 - value / scale.top);

  // The chosen bar renders the chart only when it changes; a choice made among other days (a
  // new period) no longer counts.
  const [choice, setChoice] = useState<Choice | null>(null);
  const latest = useRef<Choice | null>(null);
  const chosen =
    choice !== null && choice.days === daysKey && choice.index < bars.length ? choice.index : null;
  const chosenNow = () => (latest.current?.days === daysKey ? latest.current.index : null);
  const choose = (index: number | null) => {
    if (chosenNow() === index) return;
    latest.current = index === null ? null : { days: daysKey, index };
    setChoice(latest.current);
  };
  const clear = useCallback(() => {
    latest.current = null;
    setChoice(null);
  }, []);

  const gesture = usePlotGesture(plotWidth, {
    onScrub: (x) => choose(barIndexAt(layout, bars.length, x)),
    onScrubEnd: () => choose(null),
    onTap: (x) => {
      const index = barIndexAt(layout, bars.length, x);
      choose(index === chosenNow() ? null : index);
    },
  });

  // A pinned tooltip goes away at the next press anywhere outside the chart.
  useEffect(() => {
    if (chosen === null) return;
    const pressedSomewhere = (event: PointerEvent) => {
      const figure = figureRef.current;
      if (figure && event.target instanceof Node && figure.contains(event.target)) return;
      clear();
    };
    document.addEventListener('pointerdown', pressedSomewhere, true);
    return () => document.removeEventListener('pointerdown', pressedSomewhere, true);
  }, [chosen, clear]);

  const selected = chosen === null ? undefined : bars[chosen];
  const labelled = barLabelIndices(layout, bars.length);
  const drawn = bars.length > 0 && plotWidth > 0;
  const halfLabel = MIN_LABEL_WIDTH / 2;

  const notes =
    goalValue === null ? [] : [chartT('charts.goal', { value: formatValue(goalValue) })];
  const rows = bars.map((entry) => ({
    key: entry.day,
    date: formatDay(entry.day, 'medium'),
    value: formatValue(entry.value),
  }));

  return (
    <figure ref={figureRef} className={styles.chart} aria-label={label} data-ui={dataUi}>
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
              <rect
                className={styles.plotArea}
                width={plotWidth}
                height={PLOT_HEIGHT}
                rx={PLOT_RADIUS}
              />
              {scale.ticks.map((tick) => (
                <line
                  key={tick}
                  className={styles.grid}
                  x1={0}
                  x2={plotWidth}
                  y1={yAt(tick)}
                  y2={yAt(tick)}
                />
              ))}
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
              {bars.map((entry, index) => {
                const top = yAt(entry.value);
                const left = layout.start + index * (layout.bar + layout.gap);
                return (
                  <path
                    key={entry.day}
                    className={styles.bar}
                    data-part="bar"
                    data-day={entry.day}
                    data-x={left}
                    data-width={layout.bar}
                    data-dimmed={(chosen !== null && chosen !== index) || undefined}
                    d={roundedTopBar(left, top, layout.bar, PLOT_HEIGHT - top, BAR_RADIUS)}
                  />
                );
              })}
              {chosen === null ? null : (
                <line
                  className={styles.cursor}
                  data-part="cursor"
                  x1={barCentre(layout, chosen)}
                  x2={barCentre(layout, chosen)}
                  y1={0}
                  y2={PLOT_HEIGHT}
                />
              )}
              {scale.ticks.map((tick) => (
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
              {labelled.map((index) => {
                const entry = bars[index];
                if (!entry) return null;
                const centre = barCentre(layout, index);
                return (
                  <text
                    key={entry.day}
                    className={styles.dateLabel}
                    data-part="date"
                    data-day={entry.day}
                    x={Math.min(
                      Math.max(centre, halfLabel),
                      Math.max(halfLabel, width - halfLabel),
                    )}
                    y={PLOT_HEIGHT + DATE_BAND - 6}
                    textAnchor="middle"
                  >
                    {formatAxisDate(entry.day, 'day')}
                  </text>
                );
              })}
            </svg>
          ) : null}
          {drawn && selected && chosen !== null ? (
            <ChartTooltip
              x={barCentre(layout, chosen)}
              plotWidth={plotWidth}
              date={formatDay(selected.day, 'medium')}
              value={formatValue(selected.value)}
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
