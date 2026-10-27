import { useMemo } from 'react';
import {
  cmFromFeetInches,
  cmWheel,
  ftInWheel,
  HEIGHT_DISPLAY_UNITS,
  HEIGHT_WHEEL,
  type HeightDisplayUnit,
} from '../../../domain/units/body';
import { t } from '../../../i18n/t';
import { cx } from '../../../ui/classes';
import { Segmented } from '../../../ui/Segmented';
import { Wheel } from '../../../ui/Wheel';
import styles from '../onboarding.module.css';
import type { WizardAction } from '../wizard';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';
import { countingOptions, WeightPicker } from './WeightPicker';

const FEET = {
  min: Math.floor(HEIGHT_WHEEL.inches.min / 12),
  max: Math.floor(HEIGHT_WHEEL.inches.max / 12),
};

interface HeightPickerProps {
  readonly cm: number;
  readonly unit: HeightDisplayUnit;
  readonly dispatch: (action: WizardAction) => void;
}

/** Height as one cm wheel (100–250) or feet and inches wheels (3′0″–8′11″). */
function HeightPicker({ cm, unit, dispatch }: HeightPickerProps) {
  const cmOptions = useMemo(() => countingOptions(HEIGHT_WHEEL.cm.min, HEIGHT_WHEEL.cm.max), []);
  const feetOptions = useMemo(() => countingOptions(FEET.min, FEET.max), []);
  const inchOptions = useMemo(() => countingOptions(0, 11), []);
  const setCm = (next: number): void => dispatch({ type: 'height', cm: next });

  if (unit === 'cm') {
    return (
      <div role="group" aria-label={t('onboarding.body.height')} className={styles.wheels}>
        <Wheel
          label={t('onboarding.body.centimetres')}
          options={cmOptions}
          value={cmWheel(cm)}
          onChange={setCm}
          data-ui="wizard.body.height.cm"
        />
        <span className={styles.wheelUnit} aria-hidden="true">
          {t('onboarding.wizard.units.cm')}
        </span>
      </div>
    );
  }
  const { feet, inches } = ftInWheel(cm);
  return (
    <div role="group" aria-label={t('onboarding.body.height')} className={styles.wheels}>
      <Wheel
        label={t('onboarding.body.feet')}
        options={feetOptions}
        value={feet}
        onChange={(next) => setCm(cmFromFeetInches(next, inches))}
        data-ui="wizard.body.height.feet"
      />
      <span className={styles.wheelUnit} aria-hidden="true">
        {t('onboarding.wizard.units.ft')}
      </span>
      <Wheel
        label={t('onboarding.body.inches')}
        options={inchOptions}
        value={inches}
        onChange={(next) => setCm(cmFromFeetInches(feet, next))}
        data-ui="wizard.body.height.inches"
      />
      <span className={styles.wheelUnit} aria-hidden="true">
        {t('onboarding.wizard.units.in')}
      </span>
    </div>
  );
}

/**
 * Step 3: a cm | ft and in toggle for the height unit, then the height wheels in that unit and the
 * weight wheels in kg, the only weight unit (D-16.91). The stored height is cm, so switching back
 * and forth shows the same height, and the weight never moves (R01.3).
 */
export function Body({ state, dispatch }: StepProps) {
  const heightUnits = HEIGHT_DISPLAY_UNITS.map((value) => ({
    value,
    label: t(`onboarding.body.${value}`),
  }));
  return (
    <>
      <StepHeader title={t('onboarding.body.title')} subtitle={t('onboarding.body.subtitle')} />
      <Segmented
        label={t('onboarding.body.heightUnit')}
        options={heightUnits}
        value={state.units.height}
        onChange={(unit) => dispatch({ type: 'heightUnit', unit })}
        data-ui="wizard.body.heightUnit"
      />
      <div className={styles.pickers}>
        <div className={styles.picker}>
          <p className={styles.pickerLabel} aria-hidden="true">
            {t('onboarding.body.height')}
          </p>
          <HeightPicker cm={state.heightCm} unit={state.units.height} dispatch={dispatch} />
        </div>
        <div className={cx(styles.picker, styles.pickerWide)}>
          <p className={styles.pickerLabel} aria-hidden="true">
            {t('onboarding.body.weight')}
          </p>
          <WeightPicker
            label={t('onboarding.body.weight')}
            kg={state.weightKg}
            unit={state.units.weight}
            onChange={(kg) => dispatch({ type: 'weight', kg })}
            data-ui="wizard.body.weight"
          />
        </div>
      </div>
    </>
  );
}
