import { useEffect, useId, useRef, useState } from 'react';
import { t, type TKey } from '../../i18n/t';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import styles from './analysis.module.css';

/** How long each example meal stays in the empty field. */
export const EXAMPLE_MS = 2_000;

/** Example meals for the empty field, in the order they come round. */
const EXAMPLES = [
  'capture.describe.example1',
  'capture.describe.example2',
  'capture.describe.example3',
  'capture.describe.example4',
] as const satisfies readonly TKey[];

export interface DescribeSheetProps {
  readonly open: boolean;
  /** After Cancel, and after Analyse has started the analysis (its overlay takes over). */
  readonly onClose: () => void;
}

/**
 * The typed meal (02 §3.11): a field of three to five lines with focus on open, whose empty
 * placeholder shows a new example meal every 2 s until the person types. Analyse is on when the
 * text holds more than spaces and line breaks, and starts a text analysis with the trimmed text.
 * Only Cancel and Analyse close it, so a long description is not lost to a stray tap. Each
 * opening starts empty; renders nothing while closed.
 */
export function DescribeSheet(props: DescribeSheetProps) {
  return props.open ? <OpenDescribeSheet {...props} /> : null;
}

function useAnalysisService() {
  const { analysis } = useServices();
  if (!analysis) throw new Error('DescribeSheet: no analysis service above it');
  return analysis;
}

function OpenDescribeSheet({ onClose }: DescribeSheetProps) {
  const analysis = useAnalysisService();
  const fieldId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [example, setExample] = useState(0);
  const empty = text === '';
  const description = text.trim();

  // The examples move on only while the field is empty.
  useEffect(() => {
    if (!empty) return undefined;
    const timer = setInterval(() => {
      setExample((index) => (index + 1) % EXAMPLES.length);
    }, EXAMPLE_MS);
    return () => clearInterval(timer);
  }, [empty]);

  const analyse = (): void => {
    if (description === '') return;
    // Never rejects; the overlay shows how it goes.
    void analysis.start('text', { text: description });
    onClose();
  };

  return (
    <Sheet
      open
      title={t('capture.describe.title')}
      onClose={onClose}
      dismissable={false}
      initialFocus={fieldRef}
      data-ui="describe"
      leading={
        <Button variant="quiet" onClick={onClose} data-ui="describe.cancel">
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={description === ''}
          onClick={analyse}
          data-ui="describe.analyse"
        >
          {t('capture.analyse')}
        </Button>
      }
    >
      <div className={styles.describe}>
        <label htmlFor={fieldId} className={styles.describeLabel}>
          {t('capture.describe.label')}
        </label>
        <textarea
          ref={fieldRef}
          id={fieldId}
          className={styles.describeInput}
          rows={3}
          value={text}
          placeholder={t(EXAMPLES[example] ?? EXAMPLES[0])}
          onChange={(event) => setText(event.target.value)}
          data-ui="describe.text"
        />
      </div>
    </Sheet>
  );
}
