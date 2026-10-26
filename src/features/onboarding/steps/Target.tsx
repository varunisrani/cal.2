import type { GoalWeightProblem } from '../../../domain/profile/editRules';
import { t, type TKey } from '../../../i18n/t';
import styles from '../onboarding.module.css';
import { targetProblem } from '../wizard';
import { GOAL_LABEL_KEYS } from './Goal';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';
import { shownWeight, WeightPicker } from './WeightPicker';

const PROBLEM_KEYS: Readonly<Record<GoalWeightProblem, TKey>> = {
  notBelowCurrent: 'onboarding.target.notBelowCurrent',
  notAboveCurrent: 'onboarding.target.notAboveCurrent',
};

/**
 * Step 7: the target weight on whole + tenths wheels in the person's unit, under the goal's name
 * and the current weight. A lose target that is not below the current weight, or a gain target
 * not above it, shows why here while the wizard holds Continue (D-16.11).
 */
export function Target({ state, dispatch }: StepProps) {
  const problem = targetProblem(state);
  const current = shownWeight(state.weightKg, state.units.weight);
  return (
    <>
      <StepHeader title={t('onboarding.target.title')} subtitle={t(GOAL_LABEL_KEYS[state.goal])} />
      <p className={styles.subtitle}>{t('onboarding.target.current', { weight: current })}</p>
      <WeightPicker
        label={t('onboarding.target.label')}
        kg={state.targetKg}
        unit={state.units.weight}
        onChange={(kg) => dispatch({ type: 'target', kg })}
        data-ui="wizard.target.weight"
      />
      {problem === null ? null : (
        <p className={styles.problem} role="alert" data-ui="wizard.target.problem">
          {t(PROBLEM_KEYS[problem], { weight: current })}
        </p>
      )}
    </>
  );
}
