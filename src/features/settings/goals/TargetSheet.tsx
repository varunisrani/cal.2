import { useMemo, useState } from 'react';
import { PLAN_WHEELS, wheelStart, type PlanField } from '../../../domain/goals/planEdit';
import type { Targets } from '../../../domain/model';
import {
  ENERGY_GOAL_WHEEL,
  fromDisplay,
  toDisplay,
  type EnergyDisplayUnit,
} from '../../../domain/units/energy';
import { currentLocale } from '../../../i18n/locale';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { Wheel } from '../../../ui/Wheel';
import styles from './goals.module.css';
import { wheelOptions } from './wheelOptions';

const TITLES: Readonly<Record<EnergyDisplayUnit | Exclude<PlanField, 'kcal'>, TKey>> = {
  kcal: 'goals.page.edit.title.kcal',
  kJ: 'goals.page.edit.title.kJ',
  protein: 'goals.page.edit.title.protein',
  carbs: 'goals.page.edit.title.carbs',
  fat: 'goals.page.edit.title.fat',
};

const UNIT_WORDS: Readonly<Record<EnergyDisplayUnit | 'g', TKey>> = {
  kcal: 'goals.page.unit.kcal',
  kJ: 'goals.page.unit.kJ',
  g: 'goals.page.unit.g',
};

export interface TargetSheetProps {
  readonly field: PlanField;
  /** The targets in effect; the wheel opens on this field's value. */
  readonly targets: Targets;
  /** The field is locked, so the sheet offers "Reset to auto". */
  readonly locked: boolean;
  readonly unit: EnergyDisplayUnit;
  /** Receives kcal for energy, grams for a macro; a promise keeps Save busy until it settles. */
  readonly onSave: (value: number) => unknown;
  /** A promise keeps the button busy until it settles. */
  readonly onReset: () => unknown;
  readonly onClose: () => void;
}

/**
 * The picker for one daily target (P01-13 ranges, D-16.12): energy 800–6 000 kcal in 50s or the
 * kJ goal wheel, protein 10–500, carbs 0–800 and fat 10–300 in 5s. The wheel opens on the value
 * snapped down onto its steps; saving it unmoved sends the exact value, so an AI's 2 452 kcal or a
 * kJ reader's kcal is not moved (R06.20) while the row still becomes locked. A locked row also
 * gets "Reset to auto".
 */
export function TargetSheet({
  field,
  targets,
  locked,
  unit,
  onSave,
  onReset,
  onClose,
}: TargetSheetProps) {
  const range = field === 'kcal' ? ENERGY_GOAL_WHEEL[unit] : PLAN_WHEELS[field];
  const shown = field === 'kcal' ? toDisplay(targets.kcal, unit) : targets[field];
  const start = wheelStart(range, shown);
  const [picked, setPicked] = useState(start);
  const options = useMemo(() => wheelOptions(range, currentLocale()), [range]);
  const title = t(TITLES[field === 'kcal' ? unit : field]);

  const save = (): unknown => {
    if (picked === start) return onSave(targets[field]);
    return onSave(field === 'kcal' ? fromDisplay(picked, unit) : picked);
  };

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui="goals.edit"
      leading={
        <Button variant="quiet" data-ui="goals.edit.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui="goals.edit.save" onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <div className={styles.wheels}>
          <Wheel
            label={title}
            options={options}
            value={picked}
            onChange={setPicked}
            data-ui="goals.edit.wheel"
          />
          <span className={styles.wheelUnit} aria-hidden="true">
            {t(UNIT_WORDS[field === 'kcal' ? unit : 'g'])}
          </span>
        </div>
        {locked ? (
          <Button variant="quiet" block data-ui="goals.edit.reset" onClick={onReset}>
            {t('goals.page.edit.reset')}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
