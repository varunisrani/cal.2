import { useId } from 'react';
import {
  findUnit,
  switchUnit,
  unitLabel,
  withCount,
  type PickerUnit,
  type ShownAmount,
} from '../../../domain/servings/units';
import { formatDecimal } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { AmountField } from './AmountField';
import styles from './review.module.css';

/** The word after a count: grams, the serving count, or a named unit (slice, slices). */
export function unitName(unit: PickerUnit, count: number | undefined): string {
  if (unit.kind === 'grams') return t('review.unit.g');
  return unitLabel(unit.id, count, {
    one: t('review.serving.servingOne'),
    other: t('review.serving.servingOther'),
  });
}

export interface ServingCardProps {
  /** What the picker offers (`pickerUnits`): grams and named units, or the serving count. */
  readonly units: readonly PickerUnit[];
  /** The amount on screen. */
  readonly shown: ShownAmount;
  readonly onChange: (shown: ShownAmount) => void;
}

/**
 * How much was eaten (02 §3.3): the amount field and its unit. With a known weight the picker
 * offers grams first and then the food's named units, and a named unit says about how many grams
 * it comes to; with an unknown weight the only unit is a count of servings and grams never show
 * (R02.1). Switching unit keeps the weight and rewrites the count.
 */
export function ServingCard({ units, shown, onChange }: ServingCardProps) {
  const pickerId = useId();
  const choose = (id: string): void => {
    const unit = findUnit(units, id);
    if (unit && unit.id !== shown.unit.id) onChange(switchUnit(shown, unit));
  };

  return (
    <Card heading={t('review.serving.heading')} data-ui="review.serving">
      <div className={styles.servingRow}>
        <AmountField
          label={t('review.serving.amount')}
          value={shown.count}
          onChange={(count) => onChange(withCount(shown, count))}
          data-ui="review.amount"
        />
        {units.length > 1 ? (
          <div className={styles.unitPicker}>
            <label htmlFor={pickerId} className={styles.fieldLabel}>
              {t('review.serving.unit')}
            </label>
            <select
              id={pickerId}
              className={styles.unitSelect}
              value={shown.unit.id}
              onChange={(event) => choose(event.target.value)}
              data-ui="review.unit"
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unitName(unit, unit.id === shown.unit.id ? shown.count : undefined)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className={styles.unitOnly} data-ui="review.unit">
            {unitName(shown.unit, shown.count)}
          </p>
        )}
      </div>
      {shown.unit.kind === 'unit' ? (
        <p className={styles.grams} data-ui="review.grams">
          {t('review.serving.approx', { grams: formatDecimal(shown.amount, 1) })}
        </p>
      ) : null}
    </Card>
  );
}
