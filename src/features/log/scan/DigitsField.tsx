import { useState, type FormEvent, type Ref } from 'react';
import { readTypedBarcode, type TypedCodeProblem } from '../../../domain/food/barcode';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import styles from './scan.module.css';

const PROBLEMS: Record<TypedCodeProblem, TKey> = {
  empty: 'scan.digits.empty',
  notDigits: 'scan.digits.notDigits',
  tooLong: 'scan.digits.tooLong',
};

export interface DigitsFieldProps {
  /** A code of 1–24 digits, the spaces typed between them dropped. */
  readonly onSubmit: (code: string) => void;
  readonly inputRef?: Ref<HTMLInputElement>;
}

/**
 * "Type the digits" (D-16.18): the numbers printed under a barcode, for a camera that is refused,
 * missing or cannot read the code. Look up (or Enter) hands on the digits without their spaces;
 * letters, other characters and more than 24 digits are refused with a line under the field,
 * which goes as soon as the text changes.
 */
export function DigitsField({ onSubmit, inputRef }: DigitsFieldProps) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<TypedCodeProblem | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const read = readTypedBarcode(text);
    if (!read.ok) {
      setProblem(read.error);
      return;
    }
    onSubmit(read.value);
  };

  return (
    <form className={styles.digits} onSubmit={submit} noValidate data-ui="scan.digitsForm">
      <Field
        ref={inputRef}
        className={styles.digitsField}
        label={t('scan.digits.label')}
        value={text}
        onChange={(value) => {
          setText(value);
          setProblem(null);
        }}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={t('scan.digits.placeholder')}
        error={problem === null ? undefined : t(PROBLEMS[problem])}
        data-ui="scan.digits"
      />
      <Button
        type="submit"
        variant="primary"
        className={styles.digitsSubmit}
        disabled={text.trim() === ''}
        data-ui="scan.digits.submit"
      >
        {t('scan.digits.submit')}
      </Button>
    </form>
  );
}
