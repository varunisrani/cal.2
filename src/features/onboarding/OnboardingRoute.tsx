import { useCallback, useRef, useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import { t } from '../../i18n/t';
import { useServices } from '../../services/context';
import type { OnboardingAnswers } from '../../services/onboarding';
import { useToast } from '../../ui/Toast';
import { AiAccess } from './steps/AiAccess';
import { BuildingPlan } from './steps/BuildingPlan';
import { PlanReady } from './steps/PlanReady';
import { WizardPage, type LateSteps } from './WizardPage';
import { remindersOn, wizardProfile, type PermissionReply, type WizardState } from './wizard';

const LATE_STEPS: LateSteps = {
  aiAccess: AiAccess,
  buildingPlan: BuildingPlan,
  planReady: PlanReady,
};

/** Asks the browser for notification permission; `unsupported` where it has none to ask. */
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
 */
export function OnboardingRoute() {
  const { onboarding, clock } = useServices();
  const today = useToday();
  const toast = useToast();
  const [reopened, setReopened] = useState<Reopened | null>(null);
  const saving = useRef(false);

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

  return (
    <WizardPage
      key={reopened?.key ?? 0}
      today={today}
      requestNotifications={askNotifications}
      lateSteps={LATE_STEPS}
      initialState={reopened?.state}
      onStateChange={onStateChange}
    />
  );
}
