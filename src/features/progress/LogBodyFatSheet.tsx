import { useMemo, useState } from 'react';
import { formatDecimal } from '../../i18n/format';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { Wheel, type WheelOption } from '../../ui/Wheel';
import { BODY_FAT_WHEEL, bodyFatPercent, DEFAULT_BODY_FAT } from '../onboarding/wizard';
import { useProgress } from './LogWeightSheet';
import styles from './progress.module.css';
import readingStyles from './readings.module.css';

/** Where the wheel opens: the newest reading, else the profile's body fat, else 20 %. */
export function seedBodyFat(latest: number | undefined, profileValue: number | undefined): number {
  return latest ?? profileValue ?? DEFAULT_BODY_FAT;
}

/**
 * `fraction` as the wheel can hold it: unchanged inside 3–60 %, else the nearer end, so an
 * untouched wheel never saves a value it does not show.
 */
function heldOnWheel(fraction: number): number {
  const { min, max } = BODY_FAT_WHEEL;
  const percent = fraction * 100;
  if (percent < min) return min / 100;
  if (percent > max) return max / 100;
  return fraction;
}

/** 3 to 60 in half steps, as wheel rows. */
function percentRows(): WheelOption<number>[] {
  const { min, max, step } = BODY_FAT_WHEEL;
  const rows: WheelOption<number>[] = [];
  for (let n = 0; min + n * step <= max; n++) {
    const value = min + n * step;
    rows.push({ value, label: formatDecimal(value, 1) });
  }
  return rows;
}

export interface LogBodyFatSheetProps {
  readonly open: boolean;
  /** Where the wheel opens, as a fraction (`seedBodyFat`). */
  readonly seed: number;
  readonly onClose: () => void;
}

/**
 * Log body fat: one wheel from 3 to 60 % in half steps (Proposed D-16.56), opening on the seed.
 * Save adds one reading stamped now; the profile's body fat follows it in the same write. A
 * wheel nobody moved saves the seed exactly. Renders nothing while closed, so every opening
 * starts from the seed.
 */
export function LogBodyFatSheet(props: LogBodyFatSheetProps) {
  return props.open ? <OpenLogBodyFatSheet {...props} /> : null;
}

function OpenLogBodyFatSheet({ seed, onClose }: LogBodyFatSheetProps) {
  const progress = useProgress();
  const toast = useToast();
  const rows = useMemo(percentRows, []);
  const [fraction, setFraction] = useState(() => heldOnWheel(seed));

  const save = async (): Promise<void> => {
    try {
      await progress.logBodyFat(fraction);
      onClose();
    } catch (error) {
      console.error('Logging body fat failed', error);
      toast.show(t('progress.logBodyFat.saveFailed'));
    }
  };

  return (
    <Sheet
      open
      title={t('progress.logBodyFat.title')}
      onClose={onClose}
      data-ui="progress.logBodyFat"
      leading={
        <Button variant="quiet" data-ui="progress.logBodyFat.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui="progress.logBodyFat.save" onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.sheetBody}>
        <div className={readingStyles.wheelRow}>
          <Wheel
            label={t('progress.logBodyFat.wheel')}
            options={rows}
            value={bodyFatPercent(fraction)}
            onChange={(percent) => setFraction(percent / 100)}
            data-ui="progress.logBodyFat.wheel"
          />
          <span className={readingStyles.wheelUnit} aria-hidden="true">
            {t('onboarding.wizard.units.percent')}
          </span>
        </div>
        <p className={readingStyles.note}>{t('progress.logBodyFat.note')}</p>
      </div>
    </Sheet>
  );
}
