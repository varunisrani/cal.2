import { useRef, type KeyboardEvent } from 'react';
import styles from './inputs.module.css';
import { partHook } from './primitives';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedProps<T extends string> {
  /** Names the group for screen readers. */
  readonly label: string;
  /** The root hook; each option gets `<hook>.<value>`. */
  readonly 'data-ui': string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/** Moves within `count` options, wrapping at both ends. */
const KEY_MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * One choice out of a few, side by side: a radiogroup. Only the chosen option is in the tab
 * order; the arrow keys move to the next one and choose it, wrapping at the ends.
 */
export function Segmented<T extends string>({
  label,
  'data-ui': hook,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = options.findIndex((option) => option.value === value);
  const tabStop = chosen < 0 ? 0 : chosen;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = KEY_MOVES[event.key];
    if (!move) return;
    const nextIndex = move(index, options.length);
    const next = options[nextIndex];
    if (!next) return;
    event.preventDefault();
    buttons.current[nextIndex]?.focus();
    if (next.value !== value) onChange(next.value);
  };

  return (
    <div role="radiogroup" aria-label={label} data-ui={hook} className={styles.segmented}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={index === chosen}
          tabIndex={index === tabStop ? 0 : -1}
          data-ui={partHook(hook, option.value)}
          className={styles.segment}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
