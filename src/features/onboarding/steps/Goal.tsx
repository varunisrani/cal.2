import { GOAL_KINDS, type GoalKind } from '../../../domain/model';
import { t, type TKey } from '../../../i18n/t';
import { ChoiceCards } from './ChoiceCards';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

/** The goal names, also the Target step's subtitle. */
export const GOAL_LABEL_KEYS: Readonly<Record<GoalKind, TKey>> = {
  lose: 'onboarding.goal.lose',
  maintain: 'onboarding.goal.maintain',
  gain: 'onboarding.goal.gain',
};

/** Step 6: lose, keep or gain (keep to start). A new goal re-seeds the target weight. */
export function Goal({ state, dispatch }: StepProps) {
  return (
    <>
      <StepHeader title={t('onboarding.goal.title')} subtitle={t('onboarding.goal.subtitle')} />
      <ChoiceCards
        label={t('onboarding.goal.label')}
        choices={GOAL_KINDS.map((goal) => ({ value: goal, title: t(GOAL_LABEL_KEYS[goal]) }))}
        value={state.goal}
        onChange={(goal) => dispatch({ type: 'goal', goal })}
        data-ui="wizard.goal"
      />
    </>
  );
}
