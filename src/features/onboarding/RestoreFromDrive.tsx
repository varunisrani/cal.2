import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../data/hooks';
import { t, type TKey } from '../../i18n/t';
import type { DriveBackupService, DriveFile } from '../../services/backup/drive';
import { useServices } from '../../services/context';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/classes';
import { Icon } from '../../ui/icons';
import {
  DriveBackupList,
  OPEN_PROBLEMS,
  connectProblemOf,
  useDriveStatus,
} from '../settings/data/DriveCard';
import styles from './onboarding.module.css';
import { StepHeader } from './steps/StepHeader';

const SETTINGS = ['backup.drive'] as const;

export interface RestoreFromDriveProps {
  /** A backup downloaded from Drive: the restore screen checks it and asks (P09-14's). */
  readonly onPicked: (file: File) => void;
  /** Back to Welcome; nothing was changed. */
  readonly onLeave: () => void;
}

/**
 * Welcome's "Restore from Google Drive" (P15-04, D-16.97), in the Android app only: Connect
 * (Google's own screens), then the backups Platewise put into this Drive, newest first. Restore
 * downloads one and hands it to the same restore screen as a picked file, which checks it and asks
 * before anything changes. Connecting here uploads nothing: the phone holds no setup yet.
 */
export function RestoreFromDrive(props: RestoreFromDriveProps) {
  const { drive } = useServices();
  return drive ? <DriveRestore service={drive} {...props} /> : null;
}

interface DriveRestoreProps extends RestoreFromDriveProps {
  readonly service: DriveBackupService;
}

function DriveRestore({ service, onPicked, onLeave }: DriveRestoreProps) {
  const settings = useSettings(SETTINGS);
  const status = useDriveStatus(service);
  const [problem, setProblem] = useState<TKey | null>(null);
  const [downloading, setDownloading] = useState(false);
  const ready = settings.status === 'ready';
  const state = ready ? settings.value['backup.drive'] : null;
  const connected = state?.connected === true;

  // A new screen: focus goes to its heading, as between wizard steps.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus();
  }, []);

  useEffect(() => {
    if (connected) void service.refresh();
  }, [service, connected]);

  const connect = async (): Promise<void> => {
    setProblem(null);
    setProblem(connectProblemOf(await service.connect()));
  };

  const restore = async (file: DriveFile): Promise<void> => {
    setProblem(null);
    setDownloading(true);
    const opened = await service.open(file.id);
    setDownloading(false);
    if (opened.ok) onPicked(opened.value);
    else setProblem(OPEN_PROBLEMS[opened.error]);
  };

  return (
    <main className={styles.screen} data-ui="screen.welcomeDrive">
      <div className={cx(styles.frame, styles.header)}>
        <IconButton
          label={t('common.back')}
          icon={<Icon name="chevronLeft" />}
          disabled={downloading}
          data-ui="welcomeDrive.back"
          onClick={onLeave}
        />
      </div>
      <div ref={body} className={cx(styles.frame, styles.body)}>
        <StepHeader
          title={t('onboarding.restoreDrive.title')}
          subtitle={t('onboarding.restoreDrive.lead')}
        />
        {connected && state ? (
          <>
            <p className={styles.note} data-ui="welcomeDrive.account">
              {state.email
                ? t('backup.drive.account', { email: state.email })
                : t('backup.drive.connected')}
            </p>
            {status.listProblem ? (
              <p className={styles.problem} role="status" data-ui="welcomeDrive.listProblem">
                {t('backup.drive.listProblem')}
              </p>
            ) : status.files === null ? (
              <p className={styles.note} role="status" data-ui="welcomeDrive.looking">
                {t('onboarding.restoreDrive.looking')}
              </p>
            ) : status.files.length === 0 ? (
              <p className={styles.note} data-ui="welcomeDrive.empty">
                {t('backup.drive.empty')}
              </p>
            ) : (
              <DriveBackupList
                files={status.files}
                disabled={downloading}
                onRestore={restore}
                thisInstall={state.installId}
                hooks="welcomeDrive"
              />
            )}
          </>
        ) : null}
        {downloading ? (
          <p className={styles.note} role="status" data-ui="welcomeDrive.downloading">
            {t('backup.drive.downloading')}
          </p>
        ) : null}
        {problem ? (
          <p className={styles.problem} role="alert" data-ui="welcomeDrive.problem">
            {t(problem)}
          </p>
        ) : null}
      </div>
      <div className={cx(styles.frame, styles.footer)}>
        {ready && !connected ? (
          <Button variant="primary" block data-ui="welcomeDrive.connect" onClick={connect}>
            {t('backup.drive.connect')}
          </Button>
        ) : null}
        {connected && status.listProblem ? (
          <Button
            variant="primary"
            block
            data-ui="welcomeDrive.tryAgain"
            onClick={() => service.refresh()}
          >
            {t('onboarding.restoreDrive.tryAgain')}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
