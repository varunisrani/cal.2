import { ageOn } from '../../../domain/dates/age';
import { birthDateYearsBefore } from '../../../domain/profile/profile';
import { t } from '../../../i18n/t';
import { DateTimeField } from '../../../ui/DateTimeField';
import styles from '../onboarding.module.css';
import { OLDEST_AGE_YEARS } from '../wizard';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

/**
 * Step 2: the date of birth in the browser's own date input, 25 years ago to start, never after
 * today, and the age it gives.
 */
export function Birthday({ state, dispatch }: StepProps) {
  return (
    <>
      <StepHeader
        title={t('onboarding.birthday.title')}
        subtitle={t('onboarding.birthday.subtitle')}
      />
      <DateTimeField
        kind="date"
        label={t('onboarding.birthday.label')}
        value={state.birthDate}
        min={birthDateYearsBefore(state.today, OLDEST_AGE_YEARS)}
        max={state.today}
        onChange={(date) => dispatch({ type: 'birthDate', date })}
        data-ui="wizard.birthday.date"
      />
      <p className={styles.note} aria-live="polite">
        {t('onboarding.birthday.age', { age: ageOn(state.birthDate, state.today) })}
      </p>
    </>
  );
}
