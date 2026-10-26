import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { cx } from './classes';
import styles from './inputs.module.css';

export interface WheelOption<V extends string | number> {
  readonly value: V;
  readonly label: string;
}

export interface WheelProps<V extends string | number> {
  /** Names the wheel ("Kilograms", "Tenths"). */
  label: string;
  /** Every value the wheel offers, top to bottom. */
  options: readonly WheelOption<V>[];
  /** The value it opens on and shows; the first row when it is not in the list. */
  value: V;
  onChange: (value: V) => void;
  /** Rows on show; odd, so one sits in the middle. */
  rows?: number;
  className?: string;
  /** The hook of the wheel's control (its native select). */
  'data-ui': string;
}

const DEFAULT_ROWS = 5;

/** A scroll that has been still this long has come to rest on a row. */
const SETTLE_MS = 120;

/**
 * One column of a picker: a scroll-snap strip with the current row in a band at the centre.
 * Scrolling or tapping a row picks a value. The strip is drawn for the eye only; the control is
 * a native <select> with the same options laid over it, so assistive tech gets a real picker. It
 * takes the keys too: arrows move one row, Page keys a screenful, Home and End go to the ends.
 * Several wheels side by side make one picker (whole + tenths for a weight).
 */
export function Wheel<V extends string | number>({
  label,
  options,
  value,
  onChange,
  rows = DEFAULT_ROWS,
  className,
  'data-ui': ui,
}: WheelProps<V>) {
  const strip = useRef<HTMLDivElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const found = options.findIndex((option) => option.value === value);
  const current = found === -1 ? 0 : found;
  const last = options.length - 1;

  // What the scroll handler needs, kept fresh without re-binding it.
  const latest = useRef({ options, value, onChange });
  useLayoutEffect(() => {
    latest.current = { options, value, onChange };
  });

  /** The row a keyboard or select change is scrolling to; scroll stops on the way are ignored. */
  const heading = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const placed = useRef(false);

  const rowHeight = (): number =>
    strip.current?.querySelector<HTMLElement>('[data-row]')?.offsetHeight ?? 0;

  // Keep the strip on the current row: at once on the first paint, then with the strip's own
  // scroll behaviour (smooth, unless reduced motion asks otherwise).
  useLayoutEffect(() => {
    const element = strip.current;
    const height = rowHeight();
    // No layout yet (a hidden parent): nothing to place, and the first real placement is to come.
    if (!element || height <= 0) return;
    const top = current * height;
    const first = !placed.current;
    placed.current = true;
    if (Math.abs(element.scrollTop - top) < 1) {
      heading.current = null;
      return;
    }
    if (first || typeof element.scrollTo !== 'function') {
      if (typeof element.scrollTo === 'function') element.scrollTo({ top, behavior: 'instant' });
      else element.scrollTop = top;
      return;
    }
    heading.current = current;
    element.scrollTo({ top, behavior: 'auto' });
  }, [current]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const pick = (index: number): void => {
    const option = options[Math.min(Math.max(index, 0), last)];
    if (option && option.value !== value) onChange(option.value);
  };

  const settle = (): void => {
    const element = strip.current;
    const height = rowHeight();
    if (!element || height <= 0) return;
    const now = latest.current;
    const at = Math.min(
      Math.max(Math.round(element.scrollTop / height), 0),
      now.options.length - 1,
    );
    if (heading.current !== null) {
      if (at !== heading.current) return;
      heading.current = null;
    }
    const option = now.options[at];
    if (option && option.value !== now.value) now.onChange(option.value);
  };

  const onScroll = (): void => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, SETTLE_MS);
  };

  // The person took over the strip: wherever it comes to rest is their choice.
  const takeOver = (): void => {
    heading.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSelectElement>): void => {
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = current + 1;
        break;
      case 'ArrowUp':
        next = current - 1;
        break;
      case 'PageDown':
        next = current + rows;
        break;
      case 'PageUp':
        next = current - rows;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    pick(next);
  };

  const onSelectChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const index = options.findIndex((option) => String(option.value) === event.target.value);
    if (index !== -1) pick(index);
  };

  // Nothing to choose from: draw nothing rather than an empty band.
  if (options.length === 0) return null;

  return (
    <div className={cx(styles.wheel, className)} style={{ '--wheel-rows': rows } as CSSProperties}>
      <div
        ref={strip}
        className={styles.wheelStrip}
        aria-hidden="true"
        tabIndex={-1}
        onScroll={onScroll}
        onPointerDown={takeOver}
        onTouchStart={takeOver}
        onWheel={takeOver}
        // Keep focus on the select when a row is tapped, so the keys go on working.
        onMouseDown={(event) => event.preventDefault()}
      >
        {options.map((option, index) => (
          <div
            key={String(option.value)}
            data-row=""
            data-current={index === current ? '' : undefined}
            className={styles.wheelRow}
            onClick={() => {
              select.current?.focus({ preventScroll: true });
              pick(index);
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
      <select
        ref={select}
        className={styles.wheelSelect}
        aria-label={label}
        data-ui={ui}
        value={String(options[current]?.value ?? '')}
        onChange={onSelectChange}
        onKeyDown={onKeyDown}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
