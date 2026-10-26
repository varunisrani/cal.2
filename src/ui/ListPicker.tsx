import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { cx } from './classes';
import { Sheet } from './Sheet';
import styles from './inputs.module.css';

export interface ListPickerOption<V extends string | number> {
  readonly value: V;
  readonly label: string;
  /** A muted second line. */
  readonly description?: string;
}

export interface ListPickerProps<V extends string | number> {
  open: boolean;
  /** The sheet's title; it also names the list. */
  title: string;
  options: readonly ListPickerOption<V>[];
  /** The current choice, marked with a check; `undefined` when there is none. */
  value: V | undefined;
  /** Called with the chosen value; the picker then closes itself through `onClose`. */
  onSelect: (value: V) => void;
  onClose: () => void;
  /** The sheet's hook; each option gets `<data-ui>.<value>`. */
  'data-ui': string;
  /** Shown under the list (a note, a field for a value of one's own). */
  children?: ReactNode;
}

/**
 * A sheet listing options with a check on the current one. It is a listbox: Up and Down move
 * between options, Home and End go to the ends, Enter or Space chooses; focus opens on the
 * current option.
 */
export function ListPicker<V extends string | number>({
  open,
  title,
  options,
  value,
  onSelect,
  onClose,
  'data-ui': ui,
  children,
}: ListPickerProps<V>) {
  const firstFocus = useRef<HTMLLIElement | null>(null);
  const choose = (option: ListPickerOption<V>): void => {
    onSelect(option.value);
    onClose();
  };
  return (
    <Sheet open={open} title={title} onClose={onClose} initialFocus={firstFocus} data-ui={ui}>
      <OptionList
        title={title}
        options={options}
        value={value}
        onChoose={choose}
        firstFocus={firstFocus}
        ui={ui}
      />
      {children}
    </Sheet>
  );
}

interface OptionListProps<V extends string | number> {
  title: string;
  options: readonly ListPickerOption<V>[];
  value: V | undefined;
  onChoose: (option: ListPickerOption<V>) => void;
  firstFocus: RefObject<HTMLLIElement | null>;
  ui: string;
}

function OptionList<V extends string | number>({
  title,
  options,
  value,
  onChoose,
  firstFocus,
  ui,
}: OptionListProps<V>) {
  const baseId = useId();
  const items = useRef<Array<HTMLLIElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [active, setActive] = useState(selectedIndex === -1 ? 0 : selectedIndex);

  const moveTo = (index: number): void => {
    const target = Math.min(Math.max(index, 0), options.length - 1);
    setActive(target);
    items.current[target]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number): void => {
    switch (event.key) {
      case 'ArrowDown':
        moveTo(index + 1);
        break;
      case 'ArrowUp':
        moveTo(index - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(options.length - 1);
        break;
      case 'Enter':
      case ' ': {
        const option = options[index];
        if (option) onChoose(option);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <ul role="listbox" aria-label={title} className={styles.optionList}>
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const labelId = `${baseId}-${index}-label`;
        const descriptionId = `${baseId}-${index}-description`;
        return (
          <li
            key={String(option.value)}
            ref={(element) => {
              items.current[index] = element;
              if (index === active) firstFocus.current = element;
            }}
            role="option"
            aria-selected={selected}
            aria-labelledby={labelId}
            aria-describedby={option.description ? descriptionId : undefined}
            tabIndex={index === active ? 0 : -1}
            className={cx(styles.option, selected && styles.optionSelected)}
            data-ui={`${ui}.${String(option.value)}`}
            onClick={() => onChoose(option)}
            onFocus={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={styles.optionText}>
              <span id={labelId} className={styles.optionLabel}>
                {option.label}
              </span>
              {option.description ? (
                <span id={descriptionId} className={styles.optionDescription}>
                  {option.description}
                </span>
              ) : null}
            </span>
            <span className={cx(styles.check, !selected && styles.checkOff)} aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );
}
