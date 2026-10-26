import { SEXES, type Sex as SexId } from '../../../domain/model';
import { t, type TKey } from '../../../i18n/t';
import { ChoiceCards } from './ChoiceCards';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

const SEX_KEYS: Readonly<Record<SexId, TKey>> = {
  male: 'onboarding.sex.male',
  female: 'onboarding.sex.female',
  other: 'onboarding.sex.other',
};

/** Step 1: male, female or other as three cards (male to start). */
export function Sex({ state, dispatch }: StepProps) {
  return (
    <>
      <StepHeader title={t('onboarding.sex.title')} subtitle={t('onboarding.sex.subtitle')} />
      <ChoiceCards
        label={t('onboarding.sex.label')}
        choices={SEXES.map((sex) => ({ value: sex, title: t(SEX_KEYS[sex]) }))}
        value={state.sex}
        onChange={(sex) => dispatch({ type: 'sex', sex })}
        data-ui="wizard.sex"
      />
    </>
  );
}
