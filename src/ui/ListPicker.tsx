import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './inputs.module.css';
import { clamp, partHook } from './primitives';
import { Sheet } from './Sheet';

export interface ListPickerOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** A second, quieter line under the label. */
  readonly detail?: string;
}

export interface ListPickerProps<T extends string> {
  readonly open: boolean;
  /** The sheet's title; it also names the list. */
  readonly title: string;
  /** The sheet's hook; each option gets `<hook>.<value>`. */
  readonly 'data-ui': string;
  readonly options: readonly ListPickerOption<T>[];
  /** The chosen option, or null when nothing is chosen yet. */
  readonly value: T | null;
  /** Called with a new choice, just before the sheet closes. */
  readonly onChange: (value: T) => void;
  /** Done, Escape, the backdrop, the drag, and after a choice. */
  readonly onClose: () => void;
  /** Shown under the list, e.g. a field for a value that is not among the options. */
  readonly children?: ReactNode;
}

/**
 * A sheet listing options with a check mark on the chosen one. Choosing an option (tap, Enter
 * or Space) reports it and closes; the arrow keys only move focus, so a key press never
 * chooses by accident.
 */
export function ListPicker<T extends string>(props: ListPickerProps<T>) {
  const { open, title, 'data-ui': hook, onClose, children } = props;
  const focusRef = useRef<HTMLLIElement | null>(null);
  return (
    <Sheet open={open} title={title} data-ui={hook} onClose={onClose} initialFocusRef={focusRef}>
      <OptionList {...props} focusRef={focusRef} />
      {children !== undefined && <div className={styles.optionExtra}>{children}</div>}
    </Sheet>
  );
}

interface OptionListProps<T extends string> extends ListPickerProps<T> {
  readonly focusRef: { current: HTMLLIElement | null };
}

function OptionList<T extends string>({
  title,
  'data-ui': hook,
  options,
  value,
  onChange,
  onClose,
  focusRef,
}: OptionListProps<T>) {
  const chosen = options.findIndex((option) => option.value === value);
  const [active, setActive] = useState(chosen < 0 ? 0 : chosen);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  const choose = (option: ListPickerOption<T>) => {
    if (option.value !== value) onChange(option.value);
    onClose();
  };

  const moveTo = (index: number) => {
    const next = clamp(index, 0, options.length - 1);
    setActive(next);
    items.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    const option = options[index];
    if (!option) return;
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveTo(index + 1),
      ArrowUp: () => moveTo(index - 1),
      Home: () => moveTo(0),
      End: () => moveTo(options.length - 1),
      Enter: () => choose(option),
      ' ': () => choose(option),
    };
    const act = keys[event.key];
    if (!act) return;
    event.preventDefault();
    act();
  };

  return (
    <ul role="listbox" aria-label={title} className={styles.optionList}>
      {options.map((option, index) => (
        <li
          key={option.value}
          ref={(element) => {
            items.current[index] = element;
            if (index === active) focusRef.current = element;
          }}
          role="option"
          aria-selected={index === chosen}
          tabIndex={index === active ? 0 : -1}
          data-ui={partHook(hook, option.value)}
          className={styles.option}
          onClick={() => choose(option)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className={styles.optionText}>
            <span className={styles.optionLabel}>{option.label}</span>
            {option.detail !== undefined && (
              <span className={styles.optionDetail}>{option.detail}</span>
            )}
          </span>
          <span className={styles.optionCheck} aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}
