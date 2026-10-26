import { useEffect, useLayoutEffect, useReducer, useRef, type ComponentType } from 'react';
import type { DayKey } from '../../domain/dates/dayKey';
import { defaultUnits } from '../../domain/units/defaults';
import { currentLocale } from '../../i18n/locale';
import { t, type TKey } from '../../i18n/t';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/classes';
import { Icon } from '../../ui/icons';
import { ProgressBar } from '../../ui/ProgressBar';
import styles from './onboarding.module.css';
import { Activity } from './steps/Activity';
import { Birthday } from './steps/Birthday';
import { Body } from './steps/Body';
import { BodyFat } from './steps/BodyFat';
import { Goal } from './steps/Goal';
import { Pace } from './steps/Pace';
import { Reminders } from './steps/Reminders';
import { Sex } from './steps/Sex';
import { StepHeader } from './steps/StepHeader';
import type { StepProps } from './steps/stepProps';
import { Target } from './steps/Target';
import { Welcome } from './steps/Welcome';
import {
  canContinue,
  canGoBack,
  LAST_STEP_INDEX,
  progressOf,
  startWizard,
  stepIndex,
  wizardReducer,
  type AskNotifications,
  type WizardState,
} from './wizard';

/** The steps after Reminders, which the AI setup slice (P05-04..06) provides. */
export type LateStepId = 'aiAccess' | 'buildingPlan' | 'planReady';

/**
 * A view for each late step. AI access reports readiness with `aiReady`; Building plan reads
 * `state.buildRun` when it starts and finishes with `planBuilt` for that run; Plan ready edits
 * with `planEdit` and draws its own finish button. Each opens with a `StepHeader`, whose title
 * takes the focus when the step shows.
 */
export type LateSteps = Readonly<Record<LateStepId, ComponentType<StepProps>>>;

const PENDING_TITLE_KEYS: Readonly<Record<LateStepId, TKey>> = {
  aiAccess: 'onboarding.wizard.pending.aiAccess',
  buildingPlan: 'onboarding.wizard.pending.buildingPlan',
  planReady: 'onboarding.wizard.pending.planReady',
};

function pendingStep(id: LateStepId): ComponentType<StepProps> {
  return function PendingStep() {
    return <StepHeader title={t(PENDING_TITLE_KEYS[id])} />;
  };
}

/** Stand-ins for the late steps until their slice lands: a heading and nothing else. */
export const PENDING_LATE_STEPS: LateSteps = {
  aiAccess: pendingStep('aiAccess'),
  buildingPlan: pendingStep('buildingPlan'),
  planReady: pendingStep('planReady'),
};

export interface WizardPageProps {
  /** Today's local day: the birthday starts 25 years before it and cannot pass it. */
  readonly today: DayKey;
  /** The browser locale the first units follow (D-16.10); the current one when left out. */
  readonly locale?: string;
  /** Asks the browser for notification permission on the Reminders step (D-16.15). */
  readonly requestNotifications: AskNotifications;
  /** The Welcome step's "Restore from a backup file" (P09-14). */
  readonly onRestore?: () => void;
  /** Views for the AI access, Building plan and Plan ready steps; stand-ins when left out. */
  readonly lateSteps?: Partial<LateSteps>;
  /** Where the wizard starts instead of a fresh Welcome. */
  readonly initialState?: WizardState;
  /** Hears every new state, the first one included (onboarding completes from it, P05-07). */
  readonly onStateChange?: (state: WizardState) => void;
}

/** The steps whose footer holds the Continue button: Sex to AI access. */
function hasContinue(state: WizardState): boolean {
  const index = stepIndex(state.step);
  return index >= stepIndex('sex') && index <= stepIndex('aiAccess');
}

/**
 * The onboarding wizard: a header with Back and a thin progress bar, the current step, and
 * Continue at the bottom, all driven by the P05-01 state machine. When the step changes, focus
 * moves to its heading.
 */
export function WizardPage({
  today,
  locale,
  requestNotifications,
  onRestore,
  lateSteps,
  initialState,
  onStateChange,
}: WizardPageProps) {
  const [state, dispatch] = useReducer(wizardReducer, null, () => {
    if (initialState) return initialState;
    const { height, weight } = defaultUnits(locale ?? currentLocale());
    return startWizard(today, { height, weight });
  });

  const report = useRef(onStateChange);
  useLayoutEffect(() => {
    report.current = onStateChange;
  });
  useEffect(() => {
    report.current?.(state);
  }, [state]);

  const body = useRef<HTMLDivElement>(null);
  const shownStep = useRef(state.step);
  useEffect(() => {
    if (shownStep.current === state.step) return;
    shownStep.current = state.step;
    body.current?.querySelector<HTMLElement>('[data-step-heading]')?.focus();
  }, [state.step]);

  const step = (() => {
    const props = { state, dispatch };
    switch (state.step) {
      case 'welcome':
        return <Welcome {...props} onRestore={onRestore} />;
      case 'sex':
        return <Sex {...props} />;
      case 'birthday':
        return <Birthday {...props} />;
      case 'body':
        return <Body {...props} />;
      case 'bodyFat':
        return <BodyFat {...props} />;
      case 'activity':
        return <Activity {...props} />;
      case 'goal':
        return <Goal {...props} />;
      case 'target':
        return <Target {...props} />;
      case 'pace':
        return <Pace {...props} />;
      case 'reminders':
        return <Reminders {...props} requestNotifications={requestNotifications} />;
      case 'aiAccess':
      case 'buildingPlan':
      case 'planReady': {
        const Late = lateSteps?.[state.step] ?? PENDING_LATE_STEPS[state.step];
        return <Late {...props} />;
      }
    }
  })();

  const index = stepIndex(state.step);
  const share = progressOf(state);
  return (
    <main className={styles.screen} data-ui="screen.onboarding" data-step={state.step}>
      <div className={cx(styles.frame, styles.header)}>
        {canGoBack(state) ? (
          <IconButton
            label={t('common.back')}
            icon={<Icon name="chevronLeft" />}
            data-ui="wizard.back"
            onClick={() => dispatch({ type: 'back' })}
          />
        ) : null}
        {share === null ? null : (
          <div className={styles.progress}>
            <ProgressBar
              value={index}
              max={LAST_STEP_INDEX}
              label={t('onboarding.wizard.progress')}
              valueText={t('onboarding.wizard.progressValue', {
                step: index,
                total: LAST_STEP_INDEX,
              })}
              data-ui="wizard.progress"
            />
          </div>
        )}
      </div>
      <div ref={body} className={cx(styles.frame, styles.body)}>
        {step}
      </div>
      <div className={cx(styles.frame, styles.footer)}>
        {hasContinue(state) ? (
          <Button
            variant="primary"
            block
            disabled={!canContinue(state)}
            data-ui="wizard.continue"
            onClick={() => dispatch({ type: 'next' })}
          >
            {t('onboarding.wizard.continue')}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
