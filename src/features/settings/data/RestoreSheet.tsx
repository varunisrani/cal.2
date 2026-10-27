import { useEffect, useRef, useState } from 'react';
import { dayKeyOf } from '../../../domain/dates/dayKey';
import { formatDay, formatTime } from '../../../i18n/format';
import { t, type TKey } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type {
  BackupService,
  BackupSummary,
  CheckedBackup,
  RestoreProblem,
} from '../../../services/backup/service';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';
import styles from './backup.module.css';

const PROBLEMS: Readonly<Record<RestoreProblem, TKey>> = {
  notBackup: 'backup.restoreSheet.problem.notBackup',
  damaged: 'backup.restoreSheet.problem.damaged',
  newer: 'backup.restoreSheet.problem.newer',
  noSpace: 'backup.restoreSheet.problem.noSpace',
  insecure: 'backup.restoreSheet.problem.insecure',
  failed: 'backup.restoreSheet.problem.failed',
};

/** A moment as the backup card and sheet show it: "Oct 26, 2026 at 12:30 PM". */
export function backupTime(ms: number): string {
  return t('backup.when', { day: formatDay(dayKeyOf(ms), 'medium'), time: formatTime(ms) });
}

/** The backup service; the app always provides one. */
export function useBackup(): BackupService {
  const { backup } = useServices();
  if (!backup) throw new Error('No backup service above this screen');
  return backup;
}

export interface RestoreSheetProps {
  /** The picked file; the sheet is open while there is one. */
  readonly file: Blob | null;
  readonly onClose: () => void;
  /** After a restore went in (the Welcome restore continues from here, P09-14). */
  readonly onRestored?: (summary: BackupSummary) => void;
}

type Step =
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready'; readonly checked: CheckedBackup }
  | { readonly kind: 'restoring' }
  | { readonly kind: 'done' }
  | { readonly kind: 'problem'; readonly problem: RestoreProblem };

/**
 * Restoring a backup file (06 §3.17, R06.6, R06.8, D-16.42): the file is read and checked whole
 * first; then the sheet says when the backup was made, what it holds and that it replaces
 * everything on this device, and nothing changes until Restore. While restoring the sheet cannot
 * be dismissed; if it goes away anyway (Back, leaving the page) the restore still finishes and a
 * toast says so.
 */
export function RestoreSheet({ file, onClose, onRestored }: RestoreSheetProps) {
  return file ? <OpenRestoreSheet file={file} onClose={onClose} onRestored={onRestored} /> : null;
}

interface OpenProps {
  readonly file: Blob;
  readonly onClose: () => void;
  readonly onRestored: ((summary: BackupSummary) => void) | undefined;
}

function OpenRestoreSheet({ file, onClose, onRestored }: OpenProps) {
  const backup = useBackup();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  const shown = useRef(true);

  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setStep({ kind: 'checking' });
    void backup.inspect(file).then((result) => {
      if (!current) return;
      setStep(result.ok ? { kind: 'ready', checked: result.value } : problem(result.error));
    });
    return () => {
      current = false;
    };
  }, [backup, file]);

  const restore = async (checked: CheckedBackup): Promise<void> => {
    setStep({ kind: 'restoring' });
    // Not tied to this sheet: once started, the restore runs to its end (R06.6).
    const result = await backup.apply(checked);
    if (result.ok) onRestored?.(result.value);
    if (!shown.current) {
      if (result.ok) toast.show(t('backup.restoreSheet.done'));
      return;
    }
    setStep(result.ok ? { kind: 'done' } : problem(result.error));
  };

  const restoring = step.kind === 'restoring';
  return (
    <Sheet
      open
      title={t('backup.restoreSheet.title')}
      onClose={onClose}
      dismissable={!restoring}
      data-ui="restore"
      leading={
        step.kind === 'ready' ? (
          <Button variant="quiet" data-ui="restore.cancel" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        ) : undefined
      }
      trailing={
        step.kind === 'ready' ? (
          <Button variant="danger" data-ui="restore.confirm" onClick={() => restore(step.checked)}>
            {t('backup.restoreSheet.confirm')}
          </Button>
        ) : restoring ? null : undefined
      }
    >
      <div className={styles.body}>
        {step.kind === 'checking' ? (
          <p className={styles.status} role="status" data-ui="restore.checking">
            {t('backup.restoreSheet.checking')}
          </p>
        ) : null}
        {step.kind === 'ready' ? <Preview summary={step.checked.summary} /> : null}
        {restoring ? (
          <p className={styles.status} role="status" data-ui="restore.restoring">
            {t('backup.restoreSheet.restoring')}
          </p>
        ) : null}
        {step.kind === 'done' ? (
          <p className={styles.status} role="status" data-ui="restore.restored">
            {t('backup.restoreSheet.done')}
          </p>
        ) : null}
        {step.kind === 'problem' ? (
          <p className={styles.problem} role="alert" data-ui="restore.problem">
            {t(PROBLEMS[step.problem])}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function problem(kind: RestoreProblem): Step {
  return { kind: 'problem', problem: kind };
}

/** What the file holds and what restoring it replaces (R06.8). */
function Preview({ summary }: { readonly summary: BackupSummary }) {
  return (
    <>
      <p className={styles.madeAt} data-ui="restore.madeAt">
        {t('backup.restoreSheet.madeAt', { when: backupTime(summary.madeAt) })}
      </p>
      <ul className={styles.counts} data-ui="restore.counts">
        <li>{t('backup.restoreSheet.entries', { count: summary.entries })}</li>
        <li>{t('backup.restoreSheet.photos', { count: summary.photos })}</li>
        <li>{t('backup.restoreSheet.messages', { count: summary.messages })}</li>
      </ul>
      <p className={styles.note} data-ui="restore.replaces">
        {t('backup.restoreSheet.replaces')}
      </p>
    </>
  );
}
