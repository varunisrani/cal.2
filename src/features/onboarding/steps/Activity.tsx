import { ACTIVITY_FACTORS, type StepBand } from '../../../domain/goals/formulas';
import { ACTIVITIES, type Activity as ActivityId } from '../../../domain/model';
import { t, type TKey } from '../../../i18n/t';
import { ChoiceCards } from './ChoiceCards';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

const LEVEL_KEYS: Readonly<Record<ActivityId, { readonly name: TKey; readonly about: TKey }>> = {
  sedentary: {
    name: 'onboarding.activity.levels.sedentary.name',
    about: 'onboarding.activity.levels.sedentary.about',
  },
  light: {
    name: 'onboarding.activity.levels.light.name',
    about: 'onboarding.activity.levels.light.about',
  },
  moderate: {
    name: 'onboarding.activity.levels.moderate.name',
    about: 'onboarding.activity.levels.moderate.about',
  },
  active: {
    name: 'onboarding.activity.levels.active.name',
    about: 'onboarding.activity.levels.active.about',
  },
  hard: {
    name: 'onboarding.activity.levels.hard.name',
    about: 'onboarding.activity.levels.hard.about',
  },
  athlete: {
    name: 'onboarding.activity.levels.athlete.name',
    about: 'onboarding.activity.levels.athlete.about',
  },
};

/** The steps-a-day guide of a level, written from the formula table itself. */
export function stepsGuide(band: StepBand): string {
  if (band.below === null) return t('onboarding.activity.stepsFrom', { from: band.from });
  if (band.from === 0) return t('onboarding.activity.stepsBelow', { below: band.below });
  return t('onboarding.activity.stepsBetween', { from: band.from, to: band.below - 1 });
}

/** Step 5: six activity levels, least active first, each with a line and a steps guide. */
export function Activity({ state, dispatch }: StepProps) {
  return (
    <>
      <StepHeader
        title={t('onboarding.activity.title')}
        subtitle={t('onboarding.activity.subtitle')}
      />
      <ChoiceCards
        label={t('onboarding.activity.label')}
        choices={ACTIVITIES.map((level) => ({
          value: level,
          title: t(LEVEL_KEYS[level].name),
          detail: t(LEVEL_KEYS[level].about),
          extra: stepsGuide(ACTIVITY_FACTORS[level].steps),
        }))}
        value={state.activity}
        onChange={(activity) => dispatch({ type: 'activity', activity })}
        data-ui="wizard.activity"
      />
    </>
  );
}
