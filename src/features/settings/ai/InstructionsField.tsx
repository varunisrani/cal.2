import { useId, useState } from 'react';
import { t } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import styles from './ai.module.css';

export interface InstructionsFieldProps {
  /** The notes stored when the page opened ('' when none are sent). */
  readonly saved: string;
  /** Stores the notes and resolves with them as stored (trimmed). */
  readonly onSave: (text: string) => Promise<string>;
}

type SaveState = 'idle' | 'saved' | 'failed';

/**
 * Notes for the AI (D-16.24): free text sent with every request, saved with a button. The text is
 * stored trimmed, and the field then shows it as stored; saving an empty field turns the notes
 * off. Save is offered only when the trimmed text differs from what is stored.
 */
export function InstructionsField({ saved, onSave }: InstructionsFieldProps) {
  const fieldId = useId();
  const hintId = useId();
  const [text, setText] = useState(saved);
  const [stored, setStored] = useState(saved);
  const [state, setState] = useState<SaveState>('idle');
  const changed = text.trim() !== stored;

  const save = async (): Promise<void> => {
    try {
      const result = await onSave(text);
      setStored(result);
      setText(result);
      setState('saved');
    } catch (error) {
      console.error('The notes for the AI could not be saved', error);
      setState('failed');
    }
  };

  let status: string | null = null;
  if (state === 'failed') status = t('aiSetup.page.saveFailed');
  else if (!changed && stored === '') status = t('aiSetup.page.notes.off');
  else if (!changed && state === 'saved') status = t('aiSetup.page.notes.saved');

  return (
    <Card heading={t('aiSetup.page.notes.heading')} className={styles.card} data-ui="ai.notes">
      <div className={styles.body}>
        <div className={styles.textField}>
          <label htmlFor={fieldId} className={styles.textLabel}>
            {t('aiSetup.page.notes.label')}
          </label>
          <textarea
            id={fieldId}
            className={styles.textArea}
            value={text}
            rows={4}
            aria-describedby={hintId}
            onChange={(event) => {
              setText(event.target.value);
              if (state === 'failed') setState('idle');
            }}
            data-ui="ai.notes.text"
          />
          <p id={hintId} className={styles.note}>
            {t('aiSetup.page.notes.hint')}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="primary" disabled={!changed} data-ui="ai.notes.save" onClick={save}>
            {t('aiSetup.page.notes.save')}
          </Button>
          {status ? (
            <p
              className={state === 'failed' ? styles.alert : styles.note}
              role={state === 'failed' ? 'alert' : 'status'}
              data-ui="ai.notes.status"
            >
              {status}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
