import { useEffect, useRef, useState } from 'react';
import { useAppStateStore } from '../../app/appState';
import { useRouter, useSheet } from '../../app/useRoute';
import { t, type TKey } from '../../i18n/t';
import type { BackupSummary, RestoreProblem } from '../../services/backup/service';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/classes';
import { Icon } from '../../ui/icons';
import { RestoreSheet } from '../settings/data/RestoreSheet';
import styles from './onboarding.module.css';
import { StepHeader } from './steps/StepHeader';

/** The restore sheet has its own history entry over this screen, so Back closes it first. */
export const WELCOME_RESTORE_SHEET = 'welcome-restore';

/** What a refused file or a failed restore says; nothing was changed in every case. */
const PROBLEMS: Readonly<Record<RestoreProblem, TKey>> = {
  notBackup: 'backup.restoreSheet.problem.notBackup',
  damaged: 'backup.restoreSheet.problem.damaged',
  newer: 'backup.restoreSheet.problem.newer',
  noSpace: 'backup.restoreSheet.problem.noSpace',
  insecure: 'backup.restoreSheet.problem.insecure',
  failed: 'backup.restoreSheet.problem.failed',
};

type Phase =
  /** The sheet checks the file, then shows what it holds and waits for Restore. */
  | { readonly kind: 'asking' }
  /** Restore was pressed: it runs to its end, and nothing here can be left meanwhile. */
  | { readonly kind: 'restoring' }
  | { readonly kind: 'restored'; readonly summary: BackupSummary }
  | { readonly kind: 'problem'; readonly problem: RestoreProblem };

/**
 * A restore holds a finished setup only with both a profile and the done flag (01 §3.5): then
 * the app opens as it was; otherwise the wizard finishes setting up over the restored data.
 */
export function restoredSetup(summary: BackupSummary): boolean {
  return summary.hasProfile && summary.onboardingDone;
}

export interface RestoreFromFileProps {
  /** The backup file picked through Welcome's link (or Try again). */
  readonly file: File;
  /** Opens the file picker again (Try again). */
  readonly onPickAgain: () => void;
  /** Back to Welcome: the sheet was cancelled, or Back after a refusal. Nothing was changed. */
  readonly onLeave: () => void;
  /** Into the wizard's first question: Continue setup over restored data, or Start fresh. */
  readonly onSetUp: () => void;
}

/**
 * Restoring a backup file from Welcome (P09-14, 01 §3.5 as a web form, D-16.30). The P09-13
 * restore sheet checks the file and asks before anything changes (D-16.42); this screen stands
 * behind it and then says how it went. Once Restore is pressed nothing can leave until the restore
 * has finished: the sheet cannot be dismissed, Back is disabled, and closing the tab asks first.
 * Afterwards a restored setup offers "Open Platewise" (Home, nothing seeded), restored data
 * without one "Continue setup", and a refusal its message with "Try again" and "Start fresh".
 * Onboarding is held on screen meanwhile: the start-up gate would otherwise move to Home the
 * moment the restored setup is stored.
 */
export function RestoreFromFile({ file, onPickAgain, onLeave, onSetUp }: RestoreFromFileProps) {
  const router = useRouter();
  const sheet = useSheet(WELCOME_RESTORE_SHEET);
  const appState = useAppStateStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  // Set as soon as Restore is pressed or the file is refused, before the phase is drawn: the
  // sheet closing after that is not a Cancel.
  const answered = useRef(false);
  const sheetShown = useRef(false);

  useEffect(() => {
    appState.holdOnboarding(true);
    return () => appState.holdOnboarding(false);
  }, [appState]);

  useEffect(() => {
    router.openSheet(WELCOME_RESTORE_SHEET);
  }, [router]);

  // Cancel, Escape or Back before Restore: back to Welcome.
  useEffect(() => {
    if (sheet.open) sheetShown.current = true;
    else if (sheetShown.current && !answered.current) onLeave();
  }, [sheet.open, onLeave]);

  const restoring = phase.kind === 'restoring';
  useEffect(() => {
    if (!restoring) return undefined;
    const stay = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', stay);
    return () => window.removeEventListener('beforeunload', stay);
  }, [restoring]);

  // Focus goes to the heading when the screen changes under a closed sheet, as between wizard
  // steps (behind an open sheet the page cannot take focus).
  const body = useRef<HTMLDivElement>(null);
  const shownPhase = useRef(phase.kind);
  useEffect(() => {
    if (sheet.open || shownPhase.current === phase.kind) return;
    shownPhase.current = phase.kind;
    body.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus();
  }, [phase.kind, sheet.open]);

  const settle = (next: Phase): void => {
    answered.current = true;
    setPhase(next);
    sheet.close();
  };

  return (
    <main className={styles.screen} data-ui="screen.welcomeRestore" data-phase={phase.kind}>
      <div className={cx(styles.frame, styles.header)}>
        {phase.kind === 'restored' ? null : (
          <IconButton
            label={t('common.back')}
            icon={<Icon name="chevronLeft" />}
            disabled={restoring}
            data-ui="welcomeRestore.back"
            onClick={onLeave}
          />
        )}
      </div>
      <div ref={body} className={cx(styles.frame, styles.body)}>
        {phase.kind === 'restored' ? (
          <StepHeader
            title={t('onboarding.restore.restoredTitle')}
            subtitle={t(
              restoredSetup(phase.summary)
                ? 'onboarding.restore.restoredSetup'
                : 'onboarding.restore.restoredData',
            )}
          />
        ) : phase.kind === 'problem' ? (
          <>
            <StepHeader title={t('onboarding.restore.failedTitle')} />
            <p className={styles.problem} role="alert" data-ui="welcomeRestore.problem">
              {t(PROBLEMS[phase.problem])}
            </p>
          </>
        ) : (
          <>
            <StepHeader
              title={t('onboarding.restore.title')}
              subtitle={t('onboarding.restore.lead')}
            />
            {restoring ? (
              <p className={styles.note} role="status" data-ui="welcomeRestore.restoring">
                {t('onboarding.restore.restoring')}
              </p>
            ) : null}
          </>
        )}
      </div>
      <div className={cx(styles.frame, styles.footer)}>
        {phase.kind === 'restored' && restoredSetup(phase.summary) ? (
          // The gate, no longer held, moves to Home: the stored setup is the restored one.
          <Button
            variant="primary"
            block
            data-ui="welcomeRestore.open"
            onClick={() => appState.holdOnboarding(false)}
          >
            {t('onboarding.restore.open')}
          </Button>
        ) : null}
        {phase.kind === 'restored' && !restoredSetup(phase.summary) ? (
          <Button variant="primary" block data-ui="welcomeRestore.continue" onClick={onSetUp}>
            {t('onboarding.restore.continue')}
          </Button>
        ) : null}
        {phase.kind === 'problem' ? (
          <>
            <Button variant="primary" block data-ui="welcomeRestore.tryAgain" onClick={onPickAgain}>
              {t('onboarding.restore.tryAgain')}
            </Button>
            <Button variant="quiet" block data-ui="welcomeRestore.startFresh" onClick={onSetUp}>
              {t('onboarding.restore.startFresh')}
            </Button>
          </>
        ) : null}
      </div>
      <RestoreSheet
        file={sheet.open ? file : null}
        onClose={sheet.close}
        onRestoring={() => {
          answered.current = true;
          setPhase({ kind: 'restoring' });
        }}
        onRestored={(summary) => settle({ kind: 'restored', summary })}
        onProblem={(problem) => settle({ kind: 'problem', problem })}
      />
    </main>
  );
}
