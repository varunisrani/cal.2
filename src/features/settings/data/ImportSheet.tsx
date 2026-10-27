import { useRef, useState, type ChangeEvent } from 'react';
import { useToday } from '../../../app/TodayProvider';
import { formatInt, formatPeriod } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type {
  DiaryImport,
  ImportMode,
  ImportProblem,
} from '../../../services/transfer/importDiary';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';
import styles from './data.module.css';

export interface ImportSheetProps {
  readonly open: boolean;
  /** Done (not while importing), and after an import. */
  readonly onClose: () => void;
}

/**
 * Import diary (06 §3.14): pick one of our own diary files; the whole file is checked before
 * anything changes and one bad value refuses all of it, saying what is wrong. A good file shows
 * how many foods and water logs it holds and its dates, with "Replace these dates" and "Add as
 * new". While the import runs the sheet cannot be closed (Done, Escape, the scrim and the pull do
 * nothing); afterwards it closes and a toast says what came in. Renders nothing while closed.
 */
export function ImportSheet(props: ImportSheetProps) {
  return props.open ? <OpenImportSheet {...props} /> : null;
}

type Step =
  | { readonly kind: 'pick' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'refused'; readonly problem: ImportProblem }
  | { readonly kind: 'preview'; readonly file: DiaryImport; readonly failed: boolean };

function problemText(problem: ImportProblem): string {
  switch (problem.kind) {
    case 'tooLarge':
    case 'unreadable':
    case 'notDiary':
    case 'version':
    case 'empty':
      return t(`transfer.import.problem.${problem.kind}`);
    default:
      return t(`transfer.import.problem.${problem.kind}`, { detail: problem.detail });
  }
}

function OpenImportSheet({ onClose }: ImportSheetProps) {
  const { transfer } = useServices();
  const toast = useToast();
  const today = useToday();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  /** The import running now, if any. */
  const [importing, setImporting] = useState<ImportMode | null>(null);

  const close = (): void => {
    if (importing === null) onClose();
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const picked = event.target.files?.[0];
    // The same file may be picked again after a refusal.
    event.target.value = '';
    if (!picked || !transfer) return;
    setStep({ kind: 'reading' });
    try {
      const result = await transfer.readImport(picked);
      setStep(
        result.ok
          ? { kind: 'preview', file: result.file, failed: false }
          : { kind: 'refused', problem: result.problem },
      );
    } catch (error) {
      console.error('Reading the diary file failed', error);
      setStep({ kind: 'refused', problem: { kind: 'unreadable' } });
    }
  };

  const apply = async (file: DiaryImport, mode: ImportMode): Promise<void> => {
    if (!transfer || importing !== null) return;
    setImporting(mode);
    try {
      const { foods, water } = await transfer.importDiary(file, mode);
      setImporting(null);
      toast.show(t('transfer.import.done', { foods, water }));
      onClose();
    } catch (error) {
      console.error('Importing the diary failed', error);
      setImporting(null);
      setStep({ kind: 'preview', file, failed: true });
    }
  };

  const chooser = (label: string, variant: 'primary' | 'quiet') => (
    <Button
      variant={variant}
      block
      disabled={importing !== null}
      onClick={() => input.current?.click()}
      data-ui="importDiary.choose"
    >
      {label}
    </Button>
  );

  let body;
  switch (step.kind) {
    case 'pick':
      body = (
        <>
          <p className={styles.text}>{t('transfer.import.intro')}</p>
          {chooser(t('transfer.import.choose'), 'primary')}
        </>
      );
      break;
    case 'reading':
      body = (
        <p className={styles.text} role="status" data-ui="importDiary.reading">
          {t('transfer.import.reading')}
        </p>
      );
      break;
    case 'refused':
      body = (
        <>
          <p className={styles.message} role="alert" data-ui="importDiary.problem">
            {problemText(step.problem)}
          </p>
          {chooser(t('transfer.import.chooseAnother'), 'quiet')}
        </>
      );
      break;
    case 'preview': {
      const { file } = step;
      body = (
        <>
          <dl className={styles.summary} data-ui="importDiary.preview">
            <div className={styles.summaryRow}>
              <dt>{t('transfer.import.foods')}</dt>
              <dd data-ui="importDiary.foods">{formatInt(file.foods.length)}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('transfer.import.water')}</dt>
              <dd data-ui="importDiary.water">{formatInt(file.water?.length ?? 0)}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>{t('transfer.import.days')}</dt>
              <dd data-ui="importDiary.days">
                {formatPeriod(file.range.start, file.range.end, today)}
              </dd>
            </div>
          </dl>
          <p className={styles.text}>{t('transfer.import.explain')}</p>
          {step.failed ? (
            <p className={styles.message} role="alert" data-ui="importDiary.failed">
              {t('transfer.import.failed')}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button
              variant="primary"
              block
              busy={importing === 'replace'}
              disabled={importing !== null}
              onClick={() => apply(file, 'replace')}
              data-ui="importDiary.replace"
            >
              {t('transfer.import.replace')}
            </Button>
            <Button
              variant="secondary"
              block
              busy={importing === 'add'}
              disabled={importing !== null}
              onClick={() => apply(file, 'add')}
              data-ui="importDiary.add"
            >
              {t('transfer.import.add')}
            </Button>
            {chooser(t('transfer.import.chooseAnother'), 'quiet')}
          </div>
        </>
      );
      break;
    }
  }

  return (
    <Sheet
      open
      title={t('transfer.import.title')}
      onClose={close}
      dismissable={importing === null}
      trailing={importing === null ? undefined : null}
      data-ui="importDiary"
    >
      <div
        className={styles.body}
        aria-busy={importing !== null || step.kind === 'reading' || undefined}
      >
        {body}
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className={styles.fileInput}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void pick(event)}
          data-ui="importDiary.file"
        />
      </div>
    </Sheet>
  );
}
