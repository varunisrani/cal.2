import { useMemo } from 'react';
import {
  formatWeight,
  WEIGHT_WHEEL,
  weightFromWheel,
  weightWheel,
  type WeightDisplayUnit,
  type WeightWheel,
} from '../../../domain/units/body';
import { numberMarks } from '../../../domain/units/numbers';
import { formatInt } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t, type TKey } from '../../../i18n/t';
import { Wheel, type WheelOption } from '../../../ui/Wheel';
import styles from '../onboarding.module.css';

/** Unit words shown after a weight, and the name of the whole-units wheel. */
export const WEIGHT_UNIT_KEYS: Readonly<Record<WeightDisplayUnit, TKey>> = {
  kg: 'onboarding.wizard.units.kg',
  lb: 'onboarding.wizard.units.lb',
};

const WHOLE_WHEEL_KEYS: Readonly<Record<WeightDisplayUnit, TKey>> = {
  kg: 'onboarding.wizard.weight.wholeKg',
  lb: 'onboarding.wizard.weight.wholeLb',
};

/** "{value} kg" / "{value} lb": an amount already written as text, with its unit word. */
export const WEIGHT_AMOUNT_KEYS: Readonly<Record<WeightDisplayUnit, TKey>> = {
  kg: 'onboarding.wizard.weight.shownKg',
  lb: 'onboarding.wizard.weight.shownLb',
};

/** A stored weight as a screen shows it: one decimal in the person's unit, "70.0 kg". */
export function shownWeight(kg: number, unit: WeightDisplayUnit): string {
  return t(WEIGHT_AMOUNT_KEYS[unit], { value: formatWeight(kg, unit, currentLocale()) });
}

/** Whole numbers from `from` to `to` as wheel rows, written the locale's way. */
export function countingOptions(from: number, to: number): WheelOption<number>[] {
  const locale = currentLocale();
  const options: WheelOption<number>[] = [];
  for (let n = from; n <= to; n++) options.push({ value: n, label: formatInt(n, locale) });
  return options;
}

const TENTHS = countingOptions(0, 9);

export interface WeightPickerProps {
  /** Names the picker ("Weight", "Target weight"). */
  readonly label: string;
  /** The stored weight; the wheels show it in `unit`. */
  readonly kg: number;
  readonly unit: WeightDisplayUnit;
  /** Receives the picked weight in kg, unrounded. */
  readonly onChange: (kg: number) => void;
  /** The picker's hook; its wheels are `<data-ui>.whole` and `<data-ui>.tenth`. */
  readonly 'data-ui': string;
}

/** A weight as two wheels, whole units and tenths, in the person's unit (D-16.56 ranges). */
export function WeightPicker({ label, kg, unit, onChange, 'data-ui': ui }: WeightPickerProps) {
  const { min, max } = WEIGHT_WHEEL[unit];
  const wholeOptions = useMemo(() => countingOptions(min, max), [min, max]);
  const wheel = weightWheel(kg, unit);
  const pick = (next: WeightWheel): void => onChange(weightFromWheel(next, unit));
  return (
    <div role="group" aria-label={label} className={styles.wheels} data-ui={ui}>
      <Wheel
        label={t(WHOLE_WHEEL_KEYS[unit])}
        options={wholeOptions}
        value={wheel.whole}
        onChange={(whole) => pick({ ...wheel, whole })}
        data-ui={`${ui}.whole`}
      />
      <span className={styles.wheelMark} aria-hidden="true">
        {numberMarks(currentLocale()).decimal}
      </span>
      <Wheel
        label={t('onboarding.wizard.weight.tenths')}
        options={TENTHS}
        value={wheel.tenth}
        onChange={(tenth) => pick({ ...wheel, tenth })}
        className={styles.wheelTenths}
        data-ui={`${ui}.tenth`}
      />
      <span className={styles.wheelUnit} aria-hidden="true">
        {t(WEIGHT_UNIT_KEYS[unit])}
      </span>
    </div>
  );
}
