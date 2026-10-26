import { useMemo } from 'react';
import { formatDecimal } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import { Wheel, type WheelOption } from '../../../ui/Wheel';
import styles from '../onboarding.module.css';
import { BODY_FAT_WHEEL, bodyFatPercent } from '../wizard';
import { ChoiceCards } from './ChoiceCards';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

type Known = 'yes' | 'no';

/** 3 to 60 in steps of 0.5, as wheel rows. */
function bodyFatOptions(): WheelOption<number>[] {
  const { min, max, step } = BODY_FAT_WHEEL;
  const locale = currentLocale();
  const options: WheelOption<number>[] = [];
  for (let n = 0; min + n * step <= max; n++) {
    const value = min + n * step;
    options.push({ value, label: formatDecimal(value, 1, locale) });
  }
  return options;
}

interface PercentWheelProps {
  readonly label: string;
  readonly fraction: number;
  readonly onChange: (percent: number) => void;
  readonly 'data-ui': string;
}

function PercentWheel({ label, fraction, onChange, 'data-ui': ui }: PercentWheelProps) {
  const options = useMemo(bodyFatOptions, []);
  return (
    <div className={styles.wheels}>
      <Wheel
        label={label}
        options={options}
        value={bodyFatPercent(fraction)}
        onChange={onChange}
        data-ui={ui}
      />
      <span className={styles.wheelUnit} aria-hidden="true">
        {t('onboarding.wizard.units.percent')}
      </span>
    </div>
  );
}

/**
 * Step 4: whether the person knows their body fat (No to start). Yes shows a 3–60 % wheel in
 * half steps from 20 %, a hint with common ranges and an optional goal that starts at the current
 * value; No says the standard formula is used and clears both values.
 */
export function BodyFat({ state, dispatch }: StepProps) {
  const known: Known = state.bodyFat === null ? 'no' : 'yes';
  return (
    <>
      <StepHeader
        title={t('onboarding.bodyFat.title')}
        subtitle={t('onboarding.bodyFat.subtitle')}
      />
      <ChoiceCards<Known>
        label={t('onboarding.bodyFat.label')}
        choices={[
          { value: 'yes', title: t('onboarding.bodyFat.yes') },
          { value: 'no', title: t('onboarding.bodyFat.no') },
        ]}
        value={known}
        onChange={(choice) => dispatch({ type: 'bodyFatKnown', known: choice === 'yes' })}
        data-ui="wizard.bodyFat.known"
      />
      {state.bodyFat === null ? (
        <Card>
          <p className={styles.subtitle}>{t('onboarding.bodyFat.formulaNote')}</p>
        </Card>
      ) : (
        <>
          <PercentWheel
            label={t('onboarding.bodyFat.wheel')}
            fraction={state.bodyFat}
            onChange={(percent) => dispatch({ type: 'bodyFat', percent })}
            data-ui="wizard.bodyFat.value"
          />
          <p className={styles.note}>{t('onboarding.bodyFat.ranges')}</p>
          <Switch
            label={t('onboarding.bodyFat.goalSwitch')}
            description={t('onboarding.bodyFat.goalDescription')}
            checked={state.goalBodyFat !== null}
            onChange={(on) => dispatch({ type: 'goalBodyFatOn', on })}
            data-ui="wizard.bodyFat.goal"
          />
          {state.goalBodyFat === null ? null : (
            <PercentWheel
              label={t('onboarding.bodyFat.goalWheel')}
              fraction={state.goalBodyFat}
              onChange={(percent) => dispatch({ type: 'goalBodyFat', percent })}
              data-ui="wizard.bodyFat.goalValue"
            />
          )}
        </>
      )}
    </>
  );
}
