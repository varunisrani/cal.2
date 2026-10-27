import { useState } from 'react';
import type { Profile } from '../../../domain/model';
import type { GoalWeightProblem } from '../../../domain/profile/editRules';
import {
  WEIGHT_WHEEL,
  weightFromWheel,
  weightShown,
  weightWheel,
  type WeightDisplayUnit,
} from '../../../domain/units/body';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { WeightPicker } from '../../onboarding/steps/WeightPicker';
import styles from './profile.module.css';
import { useProfileEdits, useSaveFailed } from './useProfileEdits';
import { weightText } from './values';

/** The current weight (Save adds a weigh-in) or the goal weight (checked against the current). */
export type WeightSheetKind = 'current' | 'goal';

export interface WeightSheetProps {
  readonly open: boolean;
  readonly kind: WeightSheetKind;
  readonly profile: Profile;
  /** The stored weight unit: kg, the only one (D-16.91). */
  readonly unit: WeightDisplayUnit;
  readonly onClose: () => void;
}

const UI: Readonly<Record<WeightSheetKind, string>> = {
  current: 'profile.weight.sheet',
  goal: 'profile.goalWeight.sheet',
};

const TITLES: Readonly<Record<WeightSheetKind, TKey>> = {
  current: 'profile.rows.weight',
  goal: 'profile.rows.goalWeight',
};

const PROBLEM_KEYS: Readonly<Record<GoalWeightProblem, TKey>> = {
  notBelowCurrent: 'profile.weight.notBelowCurrent',
  notAboveCurrent: 'profile.weight.notAboveCurrent',
};

/**
 * `kg` as the wheel in `unit` can hold it: unchanged when the wheel shows it, else the wheel's
 * nearest end (the wizard's rule, D-16.80), so what the wheel shows is what Save stores.
 */
export function heldOnWheel(kg: number, unit: WeightDisplayUnit): number {
  const { min, max } = WEIGHT_WHEEL[unit];
  const shown = weightShown(kg, unit);
  return shown < min || shown > max ? weightFromWheel(weightWheel(kg, unit), unit) : kg;
}

/**
 * A weight in a sheet: whole + tenths wheels in kg (20–250 kg; kg is the only weight unit,
 * D-16.91). For the current weight, Save adds one weigh-in for now. For the goal weight, Save is
 * refused with the reason, and nothing stored, when the goal is on the wrong side of the current
 * weight. A wheel nobody moved saves the exact stored weight. Renders nothing while closed, so
 * every opening starts from the stored values.
 */
export function WeightSheet(props: WeightSheetProps) {
  return props.open ? <OpenWeightSheet {...props} /> : null;
}

function OpenWeightSheet({ kind, profile, unit, onClose }: WeightSheetProps) {
  const edits = useProfileEdits();
  const saveFailed = useSaveFailed();
  const ui = UI[kind];
  const [kg, setKg] = useState(() =>
    heldOnWheel(
      kind === 'goal' ? (profile.goalWeightKg ?? profile.weightKg) : profile.weightKg,
      unit,
    ),
  );
  const [problem, setProblem] = useState<GoalWeightProblem | null>(null);

  const pick = (next: number): void => {
    setKg(next);
    setProblem(null);
  };

  const save = async (): Promise<void> => {
    try {
      if (kind === 'current') {
        await edits.saveWeight(kg);
        onClose();
        return;
      }
      const result = await edits.setGoalWeight(kg, unit);
      if (result.ok) onClose();
      else setProblem(result.error);
    } catch (error) {
      saveFailed(error);
    }
  };

  const title = t(TITLES[kind]);
  const current = weightText(profile.weightKg, unit);

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui={ui}
      leading={
        <Button variant="quiet" data-ui={`${ui}.cancel`} onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui={`${ui}.save`} onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <WeightPicker label={title} kg={kg} unit={unit} onChange={pick} data-ui={`${ui}.wheel`} />
        {kind === 'current' ? (
          <p className={styles.note}>{t('profile.weight.addsWeighIn')}</p>
        ) : (
          <p className={styles.note}>{t('profile.weight.current', { weight: current })}</p>
        )}
        {problem === null ? null : (
          <p className={styles.problem} role="alert" data-ui={`${ui}.problem`}>
            {t(PROBLEM_KEYS[problem], { weight: current })}
          </p>
        )}
      </div>
    </Sheet>
  );
}
