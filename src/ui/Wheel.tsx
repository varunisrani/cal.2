import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import styles from './inputs.module.css';
import { clamp, partHook } from './primitives';

/** Quiet time after the last scroll event that counts as "the wheel stopped" (no `scrollend`). */
export const WHEEL_SETTLE_MS = 150;

/** Rows moved by Page Up / Page Down when the caller does not say: the rows on show. */
export const WHEEL_PAGE_ROWS = 5;

export type WheelValue = string | number;

export interface WheelProps<T extends WheelValue> {
  /** Names the wheel's native select, e.g. "Weight, kilograms". */
  readonly label: string;
  /** The root hook; the native select gets `<hook>.select`. */
  readonly 'data-ui': string;
  /** Every value the wheel can stop at, in wheel order (e.g. 20…250 for whole kilograms). */
  readonly values: readonly T[];
  /** The wheel opens scrolled to this value (or the nearest number in `values`). */
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** A value as shown and read out; `String` by default. */
  readonly format?: (value: T) => string;
  /** Rows moved by Page Up / Page Down. */
  readonly pageSize?: number;
}

/** Where `value` sits in `values`: the same value, else the nearest number, else the first. */
export function wheelIndexOf<T extends WheelValue>(values: readonly T[], value: T): number {
  const exact = values.indexOf(value);
  if (exact >= 0 || typeof value !== 'number') return Math.max(exact, 0);
  let nearest = 0;
  let gap = Infinity;
  values.forEach((candidate, index) => {
    if (typeof candidate !== 'number') return;
    const distance = Math.abs(candidate - value);
    if (distance < gap) {
      nearest = index;
      gap = distance;
    }
  });
  return nearest;
}

/** The row in the middle of the wheel at a scroll offset. */
export function rowAtScroll(scrollTop: number, rowHeight: number, rowCount: number): number {
  return clamp(Math.round(scrollTop / rowHeight), 0, rowCount - 1);
}

/**
 * A scroll-snap wheel over a list of values. Touch and mouse scroll the column, which settles
 * on the row in the middle; the keyboard and screen readers use a native select that is
 * visually hidden and always in step (arrow keys one row, Page keys a page, Home / End the
 * ends). While the select has focus the wheel shows the focus ring.
 */
export function Wheel<T extends WheelValue>(props: WheelProps<T>) {
  if (props.values.length === 0) return null;
  return <WheelColumn {...props} />;
}

function rowHeightIn(list: HTMLElement): number {
  return list.querySelector<HTMLElement>('[data-row]')?.offsetHeight ?? 0;
}

function WheelColumn<T extends WheelValue>({
  label,
  'data-ui': hook,
  values,
  value,
  onChange,
  format = String,
  pageSize = WHEEL_PAGE_ROWS,
}: WheelProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const index = wheelIndexOf(values, value);
  // The scroll listeners outlive renders; they read the newest props from here.
  const latest = useRef({ index, values, onChange });
  useEffect(() => {
    latest.current = { index, values, onChange };
  });
  // The row a scroll settled on, so the move it causes does not scroll the wheel again.
  const settledRow = useRef<number | null>(null);

  const choose = (row: number) => {
    const next = clamp(row, 0, values.length - 1);
    const chosen = values[next];
    if (next !== index && chosen !== undefined) onChange(chosen);
  };

  // Bring the chosen row to the middle: on open, and on every change not made by scrolling.
  useLayoutEffect(() => {
    const fromScroll = settledRow.current === index;
    settledRow.current = null;
    const list = listRef.current;
    if (fromScroll || !list) return;
    const height = rowHeightIn(list);
    if (height <= 0) return;
    const top = index * height;
    if (Math.abs(list.scrollTop - top) >= 1) list.scrollTop = top;
  }, [index]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      const height = rowHeightIn(list);
      if (height <= 0) return;
      const now = latest.current;
      const row = rowAtScroll(list.scrollTop, height, now.values.length);
      const reached = now.values[row];
      if (row === now.index || reached === undefined) return;
      settledRow.current = row;
      now.onChange(reached);
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, WHEEL_SETTLE_MS);
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    list.addEventListener('scrollend', settle);
    return () => {
      clearTimeout(timer);
      list.removeEventListener('scroll', onScroll);
      list.removeEventListener('scrollend', settle);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    // Alt+Arrow opens the native list; leave that to the browser.
    if (event.altKey) return;
    const targets: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      PageDown: index + pageSize,
      PageUp: index - pageSize,
      Home: 0,
      End: values.length - 1,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    choose(target);
  };

  return (
    <div className={styles.wheel} data-ui={hook}>
      <select
        className={styles.wheelSelect}
        aria-label={label}
        value={String(index)}
        data-ui={partHook(hook, 'select')}
        onChange={(event) => choose(Number(event.target.value))}
        onKeyDown={onKeyDown}
      >
        {values.map((option, row) => (
          <option key={row} value={String(row)}>
            {format(option)}
          </option>
        ))}
      </select>
      <div className={styles.wheelFace} aria-hidden="true">
        <div className={styles.wheelBand} />
        <div ref={listRef} className={styles.wheelList} tabIndex={-1}>
          {values.map((option, row) => (
            <div
              key={row}
              data-row={row}
              data-chosen={row === index || undefined}
              className={styles.wheelRow}
              onClick={() => choose(row)}
            >
              {format(option)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
