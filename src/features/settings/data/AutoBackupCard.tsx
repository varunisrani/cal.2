import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import type { AutoBackupEvery, AutoBackupProblem } from '../../../data/settingsSchema';
import { t, type TKey } from '../../../i18n/t';
import type { AutoBackupFile, AutoBackupService } from '../../../services/backup/auto';
import { useServices } from '../../../services/context';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Segmented, type SegmentedOption } from '../../../ui/Segmented';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import styles from './autoBackup.module.css';
import { RestoreSheet, backupTime } from './RestoreSheet';
import { formatBytes } from './StorageCard';

/** The restore sheet of a listed file; its own id, so it never opens with the Backup card's. */
export const LISTED_RESTORE_SHEET = 'backup-restore-listed';

const SETTINGS = ['backup.auto', 'backup.autoEvery', 'backup.autoState'] as const;

const PROBLEMS: Readonly<Record<AutoBackupProblem, TKey>> = {
  noSpace: 'backup.auto.problem.noSpace',
  denied: 'backup.auto.problem.denied',
  photoUnreadable: 'backup.auto.problem.photoUnreadable',
  tooLarge: 'backup.auto.problem.tooLarge',
  failed: 'backup.auto.problem.failed',
};

/**
 * The Automatic backup card of Settings › Your data (P14-02, D-16.95), drawn only in the Android
 * app (the only place with the service): the switch, Daily or Weekly, the last automatic backup,
 * where the files are, a line while one is being saved, why the last one failed and what to do,
 * and the automatic backups in the folder, each with Restore, which opens the same restore sheet
 * as Restore from a file. Nothing is drawn until the settings are read (R06.22).
 */
export function AutoBackupCard() {
  const { autoBackup } = useServices();
  return autoBackup ? <AutoBackupSettings service={autoBackup} /> : null;
}

function AutoBackupSettings({ service }: { readonly service: AutoBackupService }) {
  const settings = useSettings(SETTINGS);
  const status = useSyncExternalStore(service.subscribe, service.getSnapshot);
  const toast = useToast();
  const restoreSheet = useSheet(LISTED_RESTORE_SHEET);
  const [picked, setPicked] = useState<File | null>(null);

  // The folder may have changed since the last look (a file deleted in Files).
  useEffect(() => {
    void service.refresh();
  }, [service]);

  if (settings.status !== 'ready') return null;
  const on = settings.value['backup.auto'];
  const every = settings.value['backup.autoEvery'];
  const state = settings.value['backup.autoState'];

  const save = (work: Promise<void>): void => {
    work.catch((error: unknown) => {
      console.error('Platewise: an automatic backup setting could not be saved', error);
      toast.show(t('backup.auto.saveFailed'));
    });
  };

  const restore = async (file: AutoBackupFile): Promise<void> => {
    const opened = await service.open(file.name);
    if (!opened.ok) {
      toast.show(t('backup.auto.openFailed'));
      return;
    }
    setPicked(opened.value);
    restoreSheet.show();
  };

  const options: readonly SegmentedOption<AutoBackupEvery>[] = [
    { value: 'daily', label: t('backup.auto.daily') },
    { value: 'weekly', label: t('backup.auto.weekly') },
  ];
  const files = status.files ?? [];

  return (
    <Card heading={t('backup.auto.heading')} className={styles.card} data-ui="data.autoBackup">
      <Switch
        label={t('backup.auto.switch')}
        description={t('backup.auto.switchHint')}
        checked={on}
        onChange={(next) => save(service.setOn(next))}
        data-ui="data.autoBackup.switch"
      />
      <div className={styles.choice}>
        <span className={styles.choiceLabel} aria-hidden="true">
          {t('backup.auto.every')}
        </span>
        <Segmented
          label={t('backup.auto.every')}
          options={options}
          value={every}
          disabled={!on}
          onChange={(next) => save(service.setEvery(next))}
          data-ui="data.autoBackup.every"
        />
      </div>
      <p className={styles.last} data-ui="data.autoBackup.last">
        {state.lastAt === null
          ? t('backup.auto.never')
          : t('backup.auto.lastAt', { when: backupTime(state.lastAt) })}
      </p>
      {status.running ? (
        <p className={styles.status} role="status" data-ui="data.autoBackup.running">
          {t('backup.auto.running')}
        </p>
      ) : on && state.problem ? (
        <p className={styles.problem} role="status" data-ui="data.autoBackup.problem">
          {t(PROBLEMS[state.problem.kind])}
        </p>
      ) : null}
      <p className={styles.note} data-ui="data.autoBackup.where">
        {t('backup.auto.where')}
      </p>
      {files.length > 0 ? (
        <ul
          className={styles.list}
          aria-label={t('backup.auto.list')}
          data-ui="data.autoBackup.list"
        >
          {files.map((file) => {
            const when = backupTime(file.madeAt);
            return (
              <li key={file.name} className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.rowWhen}>{when}</span>
                  <span className={styles.rowSize}>{formatBytes(file.size)}</span>
                </span>
                <Button
                  variant="secondary"
                  aria-label={t('backup.auto.restoreLabel', { when })}
                  data-ui="data.autoBackup.restore"
                  onClick={() => restore(file)}
                >
                  {t('backup.auto.restore')}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <RestoreSheet file={restoreSheet.open ? picked : null} onClose={restoreSheet.close} />
    </Card>
  );
}
