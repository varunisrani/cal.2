import { PACE_IDS, type PaceId } from '../../../domain/profile/editRules';
import { weightToDisplay } from '../../../domain/units/body';
import { formatDecimal } from '../../../i18n/format';
import { t, type TKey } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Segmented } from '../../../ui/Segmented';
import styles from '../onboarding.module.css';
import { estimatedDays, weeklyKgOf } from '../wizard';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';
import { WEIGHT_AMOUNT_KEYS } from './WeightPicker';

const PACE_KEYS: Readonly<Record<PaceId, { readonly label: TKey; readonly note: TKey }>> = {
  slow: { label: 'onboarding.pace.slow', note: 'onboarding.pace.slowNote' },
  steady: { label: 'onboarding.pace.steady', note: 'onboarding.pace.steadyNote' },
  fast: { label: 'onboarding.pace.fast', note: 'onboarding.pace.fastNote' },
};

/**
 * Step 8. Keeping weight needs no pace, so it only confirms that. Losing or gaining shows the
 * weekly amount in the person's unit, Slow / Steady / Fast (0.25, 0.5 or 1 kg a week) and how
 * many days the target is at that pace.
 */
export function Pace({ state, dispatch }: StepProps) {
  if (state.goal === 'maintain') {
    return (
      <>
        <StepHeader
          title={t('onboarding.pace.maintainTitle')}
          subtitle={t('onboarding.pace.maintainSubtitle')}
        />
        <div className={styles.confirm}>
          <Icon name="check" size={48} className={styles.confirmIcon} />
          <p className={styles.confirmTitle}>{t('onboarding.pace.maintainDone')}</p>
          <p className={styles.subtitle}>{t('onboarding.pace.maintainBody')}</p>
        </div>
      </>
    );
  }

  const unit = state.units.weight;
  const amount = formatDecimal(weightToDisplay(weeklyKgOf(state), unit), 2);
  return (
    <>
      <StepHeader
        title={t('onboarding.pace.title')}
        subtitle={t(
          state.goal === 'lose' ? 'onboarding.pace.loseSubtitle' : 'onboarding.pace.gainSubtitle',
        )}
      />
      <div className={styles.readout}>
        <p className={styles.readoutValue} data-ui="wizard.pace.amount">
          {t(WEIGHT_AMOUNT_KEYS[unit], { value: amount })}
        </p>
        <p className={styles.subtitle}>{t('onboarding.pace.perWeek')}</p>
      </div>
      <Segmented
        label={t('onboarding.pace.label')}
        options={PACE_IDS.map((pace) => ({ value: pace, label: t(PACE_KEYS[pace].label) }))}
        value={state.pace}
        onChange={(pace) => dispatch({ type: 'pace', pace })}
        data-ui="wizard.pace.choice"
      />
      <p className={styles.note}>{t(PACE_KEYS[state.pace].note)}</p>
      <Card heading={t('onboarding.pace.daysTitle')} data-ui="wizard.pace.days">
        <p className={styles.days}>
          {t('onboarding.pace.days', { days: estimatedDays(state) ?? 0 })}
        </p>
      </Card>
    </>
  );
}
