import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import type { DriveUploadProblem } from '../../../data/settingsSchema';
import { t, type TKey } from '../../../i18n/t';
import type {
  DriveBackupService,
  DriveConnectOutcome,
  DriveFile,
  DriveOpenProblem,
} from '../../../services/backup/drive';
import { useServices } from '../../../services/context';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { useToast } from '../../../ui/Toast';
import styles from './drive.module.css';
import { RestoreSheet, backupTime } from './RestoreSheet';
import { formatBytes } from './StorageCard';

/** The restore sheet of a Drive copy; its own id, so it never opens with another card's. */
export const DRIVE_RESTORE_SHEET = 'backup-restore-drive';

const SETTINGS = ['backup.drive'] as const;

const CONNECT_PROBLEMS: Readonly<
  Record<Exclude<DriveConnectOutcome, 'connected' | 'cancelled'>, TKey>
> = {
  notConfigured: 'backup.drive.connectProblem.notConfigured',
  unavailable: 'backup.drive.connectProblem.unavailable',
  failed: 'backup.drive.connectProblem.failed',
};

/** What Connect says when it did not connect; nothing after Cancel. */
export function connectProblemOf(outcome: DriveConnectOutcome): TKey | null {
  return outcome === 'connected' || outcome === 'cancelled' ? null : CONNECT_PROBLEMS[outcome];
}

/** Why a Drive copy could not be downloaded for the restore sheet. */
export const OPEN_PROBLEMS: Readonly<Record<DriveOpenProblem, TKey>> = {
  offline: 'backup.drive.openProblem.offline',
  signIn: 'backup.drive.openProblem.signIn',
  missing: 'backup.drive.openProblem.missing',
  failed: 'backup.drive.openProblem.failed',
};

const UPLOAD_PROBLEMS: Readonly<Record<DriveUploadProblem, TKey>> = {
  offline: 'backup.drive.problem.offline',
  signIn: 'backup.drive.problem.signIn',
  quota: 'backup.drive.problem.quota',
  failed: 'backup.drive.problem.failed',
};

/** The Drive service's status, drawn again whenever it changes. */
export function useDriveStatus(service: DriveBackupService) {
  return useSyncExternalStore(service.subscribe, service.getSnapshot);
}

export interface DriveBackupListProps {
  readonly files: readonly DriveFile[];
  /** While one is downloading. */
  readonly disabled?: boolean;
  readonly onRestore: (file: DriveFile) => unknown;
  /** This install's id: its own copies say "This phone". */
  readonly thisInstall?: string | null;
  /** The hooks' prefix: `<prefix>.list`, and `<prefix>.restore` on each row's button. */
  readonly hooks: string;
}

/**
 * The copies in Drive, every phone's, newest first: date and time, size, "This phone" on this
 * install's own, and Restore (Settings and Welcome).
 */
export function DriveBackupList({
  files,
  disabled,
  onRestore,
  thisInstall,
  hooks,
}: DriveBackupListProps) {
  return (
    <ul className={styles.list} aria-label={t('backup.drive.list')} data-ui={`${hooks}.list`}>
      {files.map((file) => {
        const when = backupTime(file.createdAt);
        return (
          <li key={file.id} className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.rowWhen}>{when}</span>
              <span className={styles.rowSize}>
                {formatBytes(file.size)}
                {thisInstall && file.install === thisInstall ? (
                  <span className={styles.rowMine} data-ui={`${hooks}.thisPhone`}>
                    {t('backup.drive.thisPhone')}
                  </span>
                ) : null}
              </span>
            </span>
            <Button
              variant="secondary"
              disabled={disabled}
              aria-label={t('backup.drive.restoreLabel', { when })}
              data-ui={`${hooks}.restore`}
              onClick={() => onRestore(file)}
            >
              {t('backup.drive.restore')}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The Google Drive card of Settings › Your data (P15-04, D-16.97), drawn only in the Android app
 * (the only place with the service): Connect, then the account, the last upload and why it
 * failed, Upload now, the copies in Drive with Restore (the same restore sheet as Restore from a
 * file: the same check and question), and Disconnect. Nothing is drawn until the settings are
 * read (R06.22).
 */
export function DriveCard() {
  const { drive } = useServices();
  return drive ? <DriveSettings service={drive} /> : null;
}

function DriveSettings({ service }: { readonly service: DriveBackupService }) {
  const settings = useSettings(SETTINGS);
  const status = useDriveStatus(service);
  const toast = useToast();
  const restoreSheet = useSheet(DRIVE_RESTORE_SHEET);
  const [picked, setPicked] = useState<File | null>(null);
  const [connectProblem, setConnectProblem] = useState<TKey | null>(null);
  const [downloading, setDownloading] = useState(false);
  const connected = settings.status === 'ready' && settings.value['backup.drive'].connected;

  // Drive may have changed since the last look (a copy deleted there, another phone's upload).
  useEffect(() => {
    if (connected) void service.refresh();
  }, [service, connected]);

  if (settings.status !== 'ready') return null;
  const state = settings.value['backup.drive'];

  const connect = async (): Promise<void> => {
    setConnectProblem(null);
    setConnectProblem(connectProblemOf(await service.connect()));
  };

  const disconnect = async (): Promise<void> => {
    await service.disconnect();
    toast.show(t('backup.drive.disconnected'));
  };

  const restore = async (file: DriveFile): Promise<void> => {
    setDownloading(true);
    const opened = await service.open(file.id);
    setDownloading(false);
    if (!opened.ok) {
      toast.show(t(OPEN_PROBLEMS[opened.error]));
      return;
    }
    setPicked(opened.value);
    restoreSheet.show();
  };

  const problemLine = connectProblem ? (
    <p className={styles.problem} role="alert" data-ui="data.drive.connectProblem">
      {t(connectProblem)}
    </p>
  ) : null;

  return (
    <Card heading={t('backup.drive.heading')} className={styles.card} data-ui="data.drive">
      <p className={styles.intro}>{t('backup.drive.intro')}</p>
      {connected ? (
        <>
          <p className={styles.account} data-ui="data.drive.account">
            {state.email
              ? t('backup.drive.account', { email: state.email })
              : t('backup.drive.connected')}
          </p>
          <p className={styles.last} data-ui="data.drive.last">
            {state.lastUploadAt === null
              ? t('backup.drive.never')
              : t('backup.drive.lastUploadAt', { when: backupTime(state.lastUploadAt) })}
          </p>
          {status.uploading ? (
            <p className={styles.status} role="status" data-ui="data.drive.uploading">
              {t('backup.drive.uploading')}
            </p>
          ) : state.problem ? (
            <p className={styles.problem} role="status" data-ui="data.drive.problem">
              {t(UPLOAD_PROBLEMS[state.problem.kind])}
            </p>
          ) : null}
          {problemLine}
          <div className={styles.actions}>
            {state.problem?.kind === 'signIn' ? (
              <Button variant="primary" block data-ui="data.drive.reconnect" onClick={connect}>
                {t('backup.drive.reconnect')}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              block
              busy={status.uploading}
              data-ui="data.drive.uploadNow"
              onClick={() => service.uploadNow()}
            >
              {t('backup.drive.uploadNow')}
            </Button>
          </div>
          {downloading ? (
            <p className={styles.status} role="status" data-ui="data.drive.downloading">
              {t('backup.drive.downloading')}
            </p>
          ) : null}
          {status.listProblem ? (
            <p className={styles.problem} role="status" data-ui="data.drive.listProblem">
              {t('backup.drive.listProblem')}
            </p>
          ) : status.files === null ? null : status.files.length === 0 ? (
            <p className={styles.note} data-ui="data.drive.empty">
              {t('backup.drive.empty')}
            </p>
          ) : (
            <DriveBackupList
              files={status.files}
              disabled={downloading}
              onRestore={restore}
              thisInstall={state.installId}
              hooks="data.drive"
            />
          )}
          <Button variant="quiet" block data-ui="data.drive.disconnect" onClick={disconnect}>
            {t('backup.drive.disconnect')}
          </Button>
        </>
      ) : (
        <>
          {problemLine}
          <Button variant="primary" block data-ui="data.drive.connect" onClick={connect}>
            {t('backup.drive.connect')}
          </Button>
        </>
      )}
      <RestoreSheet file={restoreSheet.open ? picked : null} onClose={restoreSheet.close} />
    </Card>
  );
}
