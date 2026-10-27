import { useId, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import {
  AMOUNT_OPERATORS,
  evalAmount,
  hasOperation,
  pushOperator,
  type AmountOperator,
} from '../../../domain/servings/expression';
import { formatQuantity } from '../../../domain/units/numbers';
import { currentLocale } from '../../../i18n/locale';
import { t, type TKey } from '../../../i18n/t';
import { Icon } from '../../../ui/icons';
import styles from './review.module.css';

/** Each operator key's name for assistive tech and its hook. */
const OPERATOR_KEYS: Readonly<Record<AmountOperator, { name: TKey; hook: string }>> = {
  '+': { name: 'review.serving.keys.plus', hook: 'plus' },
  '−': { name: 'review.serving.keys.minus', hook: 'minus' },
  '×': { name: 'review.serving.keys.times', hook: 'times' },
  '÷': { name: 'review.serving.keys.divide', hook: 'divide' },
};

/** The amount the text reads as, or null unless it is a finite number above 0 (R02.22). */
export function readAmount(text: string, locale: string = currentLocale()): number | null {
  const value = evalAmount(text, locale);
  return value !== null && value > 0 ? value : null;
}

/** A press on a key or the clear button leaves the focus in the field. */
const keepFocus = (event: MouseEvent): void => event.preventDefault();

export interface AmountFieldProps {
  /** Names the field. */
  readonly label: string;
  /** The amount now, in the unit beside the field. */
  readonly value: number;
  /** Every amount above 0 the text reads as, as it is typed. */
  readonly onChange: (value: number) => void;
  /** The field's hook; the clear button, the key row and its keys hang off it. */
  readonly 'data-ui': string;
}

/** What is in the field while it is in use, and the amount it stood for when it was typed. */
interface Typed {
  readonly text: string;
  readonly value: number;
}

/**
 * The amount field (02 §3.3): it reads arithmetic (50+20 is 70, × and ÷ before + and −), and
 * every value above 0 it reads as becomes the amount at once. While it has focus a row of keys
 * offers C, the four operators (one replaces an operator already at the end) and =, which shows
 * the result once there is an operation and writes it. Leaving the field tidies a valid value and
 * puts anything else (empty, "50+", letters, ÷ 0) back to the amount. A clear button empties it.
 */
export function AmountField({ label, value, onChange, 'data-ui': ui }: AmountFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [typed, setTyped] = useState<Typed | null>(null);

  // Typed text shows while the amount is the one it stood for; a change from outside (a new
  // unit) shows the new amount instead.
  const text = typed !== null && typed.value === value ? typed.text : formatQuantity(value);
  const result = readAmount(text);

  const write = (next: string): void => {
    const read = readAmount(next);
    setTyped({ text: next, value: read ?? value });
    if (read !== null && read !== value) onChange(read);
  };

  const press = (next: string): void => {
    write(next);
    inputRef.current?.focus();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && groupRef.current?.contains(next)) return;
    // A valid amount is already the amount: showing it tidies the text; anything else reverts.
    setActive(false);
    setTyped(null);
  };

  return (
    <div ref={groupRef} className={styles.amount} onFocus={() => setActive(true)} onBlur={onBlur}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={styles.amountBox}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className={styles.amountInput}
          value={text}
          onChange={(event) => write(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          data-ui={ui}
        />
        {text !== '' ? (
          <button
            type="button"
            className={styles.clear}
            aria-label={t('review.serving.clear')}
            onMouseDown={keepFocus}
            onClick={() => press('')}
            data-ui={`${ui}.clear`}
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
      {active ? (
        <div
          className={styles.calculator}
          role="group"
          aria-label={t('review.serving.calculator')}
          data-ui={`${ui}.keys`}
        >
          <button
            type="button"
            className={styles.key}
            aria-label={t('review.serving.keys.clear')}
            onMouseDown={keepFocus}
            onClick={() => press('')}
            data-ui={`${ui}.keys.clear`}
          >
            {t('review.serving.keys.clearSymbol')}
          </button>
          {AMOUNT_OPERATORS.map((op) => (
            <button
              key={op}
              type="button"
              className={styles.key}
              aria-label={t(OPERATOR_KEYS[op].name)}
              onMouseDown={keepFocus}
              onClick={() => press(pushOperator(text, op))}
              data-ui={`${ui}.keys.${OPERATOR_KEYS[op].hook}`}
            >
              {op}
            </button>
          ))}
          <button
            type="button"
            className={styles.equals}
            // The result on the key names it; a bare "=" gets a word.
            aria-label={
              result !== null && hasOperation(text) ? undefined : t('review.serving.keys.equals')
            }
            onMouseDown={keepFocus}
            onClick={() => press(result === null ? text : formatQuantity(result))}
            data-ui={`${ui}.keys.equals`}
          >
            {result !== null && hasOperation(text)
              ? t('review.serving.result', { value: formatQuantity(result) })
              : '='}
          </button>
        </div>
      ) : null}
    </div>
  );
}
