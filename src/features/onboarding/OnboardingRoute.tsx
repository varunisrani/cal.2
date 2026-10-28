import { Suspense, useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { onDemand } from '../../app/onDemand';
import { Skeleton } from '../../app/Skeleton';
import { useToday } from '../../app/TodayProvider';
import type { DayKey } from '../../domain/dates/dayKey';
import { defaultUnits } from '../../domain/units/defaults';
import { currentLocale } from '../../i18n/locale';
import { withPartitions } from '../../i18n/onDemand';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type { OnboardingAnswers } from '../../services/onboarding';
import { useToast } from '../../ui/Toast';
import { AiAccess } from './steps/AiAccess';
import { BuildingPlan } from './steps/BuildingPlan';
import { PlanReady } from './steps/PlanReady';
import { WizardPage, type LateSteps } from './WizardPage';
import {
  remindersOn,
  startWizard,
  wizardProfile,
  wizardReducer,
  type PermissionReply,
  type WizardState,
} from './wizard';

const LATE_STEPS: LateSteps = {
  aiAccess: AiAccess,
  buildingPlan: BuildingPlan,
  planReady: PlanReady,
};

// Fetched when a backup file is picked on Welcome (P09-14), with the restore sheet it opens.
const RestoreFromFile = onDemand(() =>
  withPartitions(['backup', 'onboarding'], import('./RestoreFromFile')).then(
    (module) => module.RestoreFromFile,
  ),
);

// Fetched when Welcome's "Restore from Google Drive" is pressed (P15-04, the Android app only).
const RestoreFromDrive = onDemand(() =>
  withPartitions(['backup', 'data', 'onboarding'], import('./RestoreFromDrive')).then(
    (module) => module.RestoreFromDrive,
  ),
);

/** A backup file picked on Welcome; each pick (Try again too) starts a restore of its own. */
interface PickedBackup {
  readonly key: number;
  readonly file: File;
  /** Where it came from: Try again and Back return there (the picker, or the Drive list). */
  readonly source: 'file' | 'drive';
}

/** The wizard on its first question, as Get started leaves it, for this browser's units. */
function firstQuestion(today: DayKey): WizardState {
  const { height, weight } = defaultUnits(currentLocale());
  return wizardReducer(startWizard(today, { height, weight }), { type: 'next' });
}

/**
 * Asks the browser for notification permission; `unsupported` where it has none to ask. Used
 * where no tracking settings service is given (screens tested without one).
 */
async function askNotifications(): Promise<PermissionReply> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

/** What onboarding stores, from a wizard that finished on Plan ready. */
export function answersOf(state: WizardState): OnboardingAnswers | null {
  if (!state.finished || state.plan === null) return null;
  return {
    profile: wizardProfile(state),
    plan: state.plan.draft.plan,
    planEdited: state.plan.draft.touched,
    remindersOn: remindersOn(state),
    units: state.units,
  };
}

/** A wizard opened again from `state` after a failed save, its last button live again. */
interface Reopened {
  readonly key: number;
  readonly state: WizardState;
}

/**
 * The onboarding address (P05-07): the wizard with AI access, Building plan and Plan ready. When
 * Plan ready's last button finishes the wizard, onboarding completes; the start-up gate then
 * moves the app to Home once the done flag is stored, so this screen never navigates itself. A
 * save that fails says so and opens Plan ready again with the same answers, to try once more.
 * Welcome's restore link picks a backup file and shows the restore screen (P09-14); in the Android
 * app its Google Drive link lists the backups in Drive and hands the one picked to the same screen
 * (P15-04). After a restore without a finished setup, or a refused file, the wizard goes on from
 * its first question.
 * Its completion then fills only what is empty (the first weigh-in) and starts the new plan's
 * tune-up week, over the restored diary.
 */
export function OnboardingRoute() {
  const { onboarding, clock, trackingSettings, drive } = useServices();
  // P13: through the service, so the Android app asks Android, as Settings does.
  const requestNotifications = useMemo(
    () => (trackingSettings ? () => trackingSettings.requestPermission() : askNotifications),
    [trackingSettings],
  );
  const today = useToday();
  const toast = useToast();
  const [reopened, setReopened] = useState<Reopened | null>(null);
  const saving = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedBackup | null>(null);
  const [fromDrive, setFromDrive] = useState(false);

  const onStateChange = useCallback(
    (state: WizardState) => {
      const answers = answersOf(state);
      if (answers === null || saving.current) return;
      saving.current = true;
      onboarding.complete(answers, { now: clock.now() }).catch((error: unknown) => {
        console.error('Finishing onboarding failed', error);
        saving.current = false;
        toast.show(t('onboarding.finishFailed'));
        setReopened((last) => ({
          key: (last?.key ?? 0) + 1,
          state: { ...state, finished: false },
        }));
      });
    },
    [onboarding, clock, toast],
  );

  const pickBackup = useCallback(() => picker.current?.click(), []);
  const pickedFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    // Cleared, so picking the same file again still reports a change.
    event.target.value = '';
    if (file) setPicked((last) => ({ key: (last?.key ?? 0) + 1, file, source: 'file' }));
  };
  const pickedFromDrive = useCallback((file: File) => {
    setPicked((last) => ({ key: (last?.key ?? 0) + 1, file, source: 'drive' }));
  }, []);
  const openDrive = useCallback(() => setFromDrive(true), []);
  const leaveDrive = useCallback(() => setFromDrive(false), []);
  const leaveRestore = useCallback(() => setPicked(null), []);
  const setUp = useCallback(() => {
    setPicked(null);
    setFromDrive(false);
    setReopened((last) => ({ key: (last?.key ?? 0) + 1, state: firstQuestion(today) }));
  }, [today]);

  const input = (
    <input
      ref={picker}
      type="file"
      accept=".zip,application/zip"
      hidden
      onChange={pickedFile}
      data-ui="wizard.restoreFile"
    />
  );

  if (picked) {
    return (
      <>
        <Suspense fallback={<Skeleton page data-ui="shell.screenLoading" />}>
          <RestoreFromFile
            key={picked.key}
            file={picked.file}
            onPickAgain={picked.source === 'drive' ? leaveRestore : pickBackup}
            onLeave={leaveRestore}
            onSetUp={setUp}
          />
        </Suspense>
        {input}
      </>
    );
  }
  if (fromDrive) {
    return (
      <>
        <Suspense fallback={<Skeleton page data-ui="shell.screenLoading" />}>
          <RestoreFromDrive onPicked={pickedFromDrive} onLeave={leaveDrive} />
        </Suspense>
        {input}
      </>
    );
  }
  return (
    <>
      <WizardPage
        key={reopened?.key ?? 0}
        today={today}
        requestNotifications={requestNotifications}
        onRestore={pickBackup}
        onRestoreDrive={drive ? openDrive : undefined}
        lateSteps={LATE_STEPS}
        initialState={reopened?.state}
        onStateChange={onStateChange}
      />
      {input}
    </>
  );
}
