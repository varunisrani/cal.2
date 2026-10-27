import { useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import type { DayKey } from '../../domain/dates/dayKey';
import { FIRST_READABLE_DAY } from '../../domain/progress/ranges';
import {
  WEIGHT_DISPLAY_UNITS,
  WEIGHT_WHEEL,
  weightFromWheel,
  weightShown,
  weightWheel,
  type WeightDisplayUnit,
} from '../../domain/units/body';
import { t, type TKey } from '../../i18n/t';
import type { ProgressService } from '../../services/progress';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { DateTimeField } from '../../ui/DateTimeField';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { WeightPicker } from '../onboarding/steps/WeightPicker';
import styles from './progress.module.css';

/** Where the wheels open when there is neither a weigh-in nor a profile weight. */
export const FALLBACK_LOG_KG = 70;

const UNIT_LABELS: Readonly<Record<WeightDisplayUnit, TKey>> = {
  kg: 'progress.logWeight.kg',
  lb: 'progress.logWeight.lb',
};

/** Where the wheels open: the newest weigh-in, else the profile weight, else 70 kg. */
export function seedWeightKg(latestKg: number | undefined, profileKg: number | undefined): number {
  return latestKg ?? profileKg ?? FALLBACK_LOG_KG;
}

/**
 * `kg` as the wheels in `unit` can hold it: unchanged when they show it, else held at their
 * nearer end, so what the wheels show is always what Save stores.
 */
function heldOnWheels(kg: number, unit: WeightDisplayUnit): number {
  const { min, max } = WEIGHT_WHEEL[unit];
  const shown = weightShown(kg, unit);
  return shown < min || shown > max ? weightFromWheel(weightWheel(kg, unit), unit) : kg;
}

/** The Progress service; `main.tsx` always provides it. */
export function useProgress(): ProgressService {
  const { progress } = useServices();
  if (!progress) throw new Error('Progress: no progress service above it');
  return progress;
}

export interface LogWeightSheetProps {
  readonly open: boolean;
  /** Where the wheels open, in kg (`seedWeightKg`). */
  readonly seedKg: number;
  /** The stored weight unit. The toggle changes it for the whole app (R05.11). */
  readonly unit: WeightDisplayUnit;
  readonly onClose: () => void;
}

/**
 * Log weight: a kg | lb toggle that stores the app's weight unit at once, whole and tenth wheels
 * (20–250 kg or 50–500 lb, D-16.37) that keep the weight across a unit change, and the day it was
 * weighed, never later than today. Save adds one weigh-in for that day; an unmoved wheel saves
 * the seed exactly. Renders nothing while closed, so every opening starts from the seed and today.
 */
export function LogWeightSheet(props: LogWeightSheetProps) {
  return props.open ? <OpenLogWeightSheet {...props} /> : null;
}

function OpenLogWeightSheet({ seedKg, unit: storedUnit, onClose }: LogWeightSheetProps) {
  const progress = useProgress();
  const toast = useToast();
  const today = useToday();
  const [unit, setUnit] = useState(storedUnit);
  const [kg, setKg] = useState(() => heldOnWheels(seedKg, storedUnit));
  const [picked, setPicked] = useState<DayKey>(today);
  // Midnight may pass while the sheet is open; a day is never later than today.
  const day = picked > today ? today : picked;

  const switchUnit = (next: WeightDisplayUnit): void => {
    setUnit(next);
    setKg((current) => heldOnWheels(current, next));
    progress.setWeightUnit(next).catch((error: unknown) => {
      console.error('Storing the weight unit failed', error);
      toast.show(t('progress.logWeight.unitFailed'));
    });
  };

  const save = async (): Promise<void> => {
    try {
      await progress.logWeight(kg, day);
      onClose();
    } catch (error) {
      console.error('Logging a weight failed', error);
      toast.show(t('progress.logWeight.saveFailed'));
    }
  };

  const title = t('progress.logWeight.title');
  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui="progress.logWeight"
      leading={
        <Button variant="quiet" data-ui="progress.logWeight.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui="progress.logWeight.save" onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.sheetBody}>
        <Segmented
          label={t('progress.logWeight.unit')}
          options={WEIGHT_DISPLAY_UNITS.map((value) => ({ value, label: t(UNIT_LABELS[value]) }))}
          value={unit}
          onChange={switchUnit}
          data-ui="progress.logWeight.unit"
        />
        <WeightPicker
          label={t('progress.weight.title')}
          kg={kg}
          unit={unit}
          onChange={setKg}
          data-ui="progress.logWeight.wheel"
        />
        <DateTimeField
          kind="date"
          label={t('common.date')}
          value={day}
          min={FIRST_READABLE_DAY}
          max={today}
          onChange={setPicked}
          data-ui="progress.logWeight.date"
        />
      </div>
    </Sheet>
  );
}
