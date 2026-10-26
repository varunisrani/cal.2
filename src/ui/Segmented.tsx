import { useRef, type KeyboardEvent } from 'react';
import { cx } from './classes';
import styles from './inputs.module.css';

export interface SegmentedOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

export interface SegmentedProps<V extends string> {
  /** Names the group ("Weight unit"). */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  /** The group's hook; each choice gets `<data-ui>.<value>`. */
  'data-ui': string;
}

/**
 * A short row of exclusive choices drawn as one control: a radiogroup with a single tab stop.
 * The arrow keys move to the next or previous choice and select it (wrapping), Home and End go
 * to the ends.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  'data-ui': ui,
}: SegmentedProps<V>) {
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = options.findIndex((option) => option.value === value);
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex;

  const choose = (index: number): void => {
    const count = options.length;
    const wrapped = ((index % count) + count) % count;
    const option = options[wrapped];
    if (!option) return;
    radios.current[wrapped]?.focus();
    if (option.value !== value) onChange(option.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    // In a right-to-left page the next choice is to the left.
    const forward = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl' ? -1 : 1;
    switch (event.key) {
      case 'ArrowRight':
        choose(index + forward);
        break;
      case 'ArrowLeft':
        choose(index - forward);
        break;
      case 'ArrowDown':
        choose(index + 1);
        break;
      case 'ArrowUp':
        choose(index - 1);
        break;
      case 'Home':
        choose(0);
        break;
      case 'End':
        choose(options.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={styles.segmented}
      data-ui={ui}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              radios.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={disabled}
            className={cx(styles.segment, checked && styles.segmentChecked)}
            data-ui={`${ui}.${option.value}`}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
