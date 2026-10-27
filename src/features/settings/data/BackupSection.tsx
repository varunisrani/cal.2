import { useRef, useState, type ChangeEvent } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import { t, type TKey } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type { BackupProblem, BackupService, HeldBackup } from '../../../services/backup/service';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { useToast } from '../../../ui/Toast';
import styles from './backup.module.css';
import { RestoreSheet, backupTime } from './RestoreSheet';

/** The restore sheet has its own history entry, so Back closes it first. */
export const RESTORE_SHEET = 'backup-restore';

const SETTINGS = ['backup.lastAt'] as const;

const PROBLEMS: Readonly<Record<BackupProblem, TKey>> = {
  photoUnreadable: 'backup.problem.photoUnreadable',
  tooLarge: 'backup.problem.tooLarge',
  insecure: 'backup.problem.insecure',
  failed: 'backup.problem.failed',
};

type State =
  | { readonly kind: 'idle' }
  /** Made, but not handed over yet: the share sheet needs a new tap, or it was closed. */
  | { readonly kind: 'ready'; readonly made: HeldBackup }
  | { readonly kind: 'failed'; readonly problem: BackupProblem };

const IDLE: State = { kind: 'idle' };

/**
 * The Backup card of Settings › Your data (06 §3.17, D-16.30): when the last backup was made, Back
 * up now (one file, shared or downloaded), and Restore from a file, which opens the restore
 * sheet. The last backup line waits for the stored value (R06.22).
 */
export function BackupSection() {
  const settings = useSettings(SETTINGS);
  const { backup } = useServices();
  const toast = useToast();
  const restoreSheet = useSheet(RESTORE_SHEET);
  const picker = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(IDLE);
  const [picked, setPicked] = useState<File | null>(null);

  const service = (): BackupService => {
    if (!backup) throw new Error('No backup service above this screen');
    return backup;
  };

  const handOver = async (made: HeldBackup, afterTap: boolean): Promise<void> => {
    const result = await service().offer(made, { afterTap });
    if (result === 'shared' || result === 'downloaded') toast.show(t('backup.saved'));
    setState(result === 'cancelled' || result === 'needsTap' ? { kind: 'ready', made } : IDLE);
  };

  const backUp = async (): Promise<void> => {
    setState(IDLE);
    const made = await service().make();
    if (made.ok) await handOver(made.value, false);
    else setState({ kind: 'failed', problem: made.error });
  };

  const pickedFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    // Cleared, so picking the same file again still reports a change.
    event.target.value = '';
    if (!file) return;
    setPicked(file);
    restoreSheet.show();
  };

  const lastAt = settings.status === 'ready' ? settings.value['backup.lastAt'] : undefined;

  return (
    <Card heading={t('backup.heading')} className={styles.card} data-ui="backup">
      <p className={styles.intro}>{t('backup.intro')}</p>
      {lastAt !== undefined ? (
        <p className={styles.last} data-ui="backup.last">
          {lastAt === null ? t('backup.never') : t('backup.lastAt', { when: backupTime(lastAt) })}
        </p>
      ) : null}
      {state.kind === 'ready' ? (
        <p className={styles.note} role="status" data-ui="backup.ready">
          {t('backup.ready')}
        </p>
      ) : null}
      {state.kind === 'failed' ? (
        <p className={styles.problem} role="alert" data-ui="backup.problem">
          {t(PROBLEMS[state.problem])}
        </p>
      ) : null}
      <div className={styles.actions}>
        {state.kind === 'ready' ? (
          <Button
            variant="primary"
            block
            data-ui="backup.save"
            onClick={() => handOver(state.made, true)}
          >
            {t('backup.save')}
          </Button>
        ) : null}
        <Button
          variant={state.kind === 'ready' ? 'secondary' : 'primary'}
          block
          data-ui="backup.now"
          onClick={backUp}
        >
          {t('backup.now')}
        </Button>
        <Button
          variant="secondary"
          block
          data-ui="backup.restore"
          onClick={() => picker.current?.click()}
        >
          {t('backup.restore')}
        </Button>
      </div>
      <input
        ref={picker}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={pickedFile}
        data-ui="backup.file"
      />
      <RestoreSheet file={restoreSheet.open ? picked : null} onClose={restoreSheet.close} />
    </Card>
  );
}
