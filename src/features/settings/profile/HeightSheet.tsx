import { useMemo, useState } from 'react';
import type { Profile } from '../../../domain/model';
import {
  CM_PER_INCH,
  cmFromFeetInches,
  cmWheel,
  ftInWheel,
  HEIGHT_DISPLAY_UNITS,
  HEIGHT_WHEEL,
  type HeightDisplayUnit,
} from '../../../domain/units/body';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Segmented } from '../../../ui/Segmented';
import { Sheet } from '../../../ui/Sheet';
import { Wheel } from '../../../ui/Wheel';
import { countingOptions } from '../../onboarding/steps/WeightPicker';
import styles from './profile.module.css';
import { useProfileEdits, useSaveFailed } from './useProfileEdits';

export interface HeightSheetProps {
  readonly open: boolean;
  readonly profile: Profile;
  /** The stored height unit; the toggle stores a new one at once. */
  readonly unit: HeightDisplayUnit;
  readonly onClose: () => void;
}

const UI = 'profile.height.sheet';

const UNIT_LABELS: Readonly<Record<HeightDisplayUnit, TKey>> = {
  cm: 'profile.units.cm',
  ftIn: 'profile.units.ftIn',
};

const FEET = {
  min: Math.floor(HEIGHT_WHEEL.inches.min / 12),
  max: Math.floor(HEIGHT_WHEEL.inches.max / 12),
};

/**
 * `cm` as the wheels in `unit` can hold it: unchanged when they show it (whole cm, or the nearest
 * inch), else the nearest end of 100–250 cm or 3 ft 0 in–8 ft 11 in.
 */
export function heldHeight(cm: number, unit: HeightDisplayUnit): number {
  if (unit === 'cm') {
    const { min, max } = HEIGHT_WHEEL.cm;
    const shown = Math.round(cm);
    return shown < min ? min : shown > max ? max : cm;
  }
  const { min, max } = HEIGHT_WHEEL.inches;
  const inches = Math.round(cm / CM_PER_INCH);
  return inches < min ? min * CM_PER_INCH : inches > max ? max * CM_PER_INCH : cm;
}

/**
 * Height in a sheet: one cm wheel or feet and inches wheels, and a cm | ft-in toggle that stores
 * the height unit at once and keeps the value. Save stores the height (unrounded for a feet and
 * inches pick); a wheel nobody moved saves the exact stored height. Renders nothing while closed.
 */
export function HeightSheet(props: HeightSheetProps) {
  return props.open ? <OpenHeightSheet {...props} /> : null;
}

function OpenHeightSheet({ profile, unit: storedUnit, onClose }: HeightSheetProps) {
  const edits = useProfileEdits();
  const saveFailed = useSaveFailed();
  const [unit, setUnit] = useState(storedUnit);
  const [cm, setCm] = useState(() => heldHeight(profile.heightCm, unit));
  const cmOptions = useMemo(() => countingOptions(HEIGHT_WHEEL.cm.min, HEIGHT_WHEEL.cm.max), []);
  const feetOptions = useMemo(() => countingOptions(FEET.min, FEET.max), []);
  const inchOptions = useMemo(() => countingOptions(0, 11), []);

  const switchUnit = (next: HeightDisplayUnit): void => {
    setUnit(next);
    setCm((current) => heldHeight(current, next));
    edits.setHeightUnit(next).catch(saveFailed);
  };

  const save = async (): Promise<void> => {
    try {
      await edits.setHeight(cm);
      onClose();
    } catch (error) {
      saveFailed(error);
    }
  };

  const title = t('profile.rows.height');
  const { feet, inches } = ftInWheel(cm);

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui={UI}
      leading={
        <Button variant="quiet" data-ui={`${UI}.cancel`} onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui={`${UI}.save`} onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <Segmented
          label={t('profile.units.height')}
          options={HEIGHT_DISPLAY_UNITS.map((value) => ({ value, label: t(UNIT_LABELS[value]) }))}
          value={unit}
          onChange={switchUnit}
          data-ui={`${UI}.unit`}
        />
        {unit === 'cm' ? (
          <div role="group" aria-label={title} className={styles.wheels}>
            <Wheel
              label={t('onboarding.body.centimetres')}
              options={cmOptions}
              value={cmWheel(cm)}
              onChange={setCm}
              data-ui={`${UI}.cm`}
            />
            <span className={styles.wheelUnit} aria-hidden="true">
              {t('onboarding.wizard.units.cm')}
            </span>
          </div>
        ) : (
          <div role="group" aria-label={title} className={styles.wheels}>
            <Wheel
              label={t('onboarding.body.feet')}
              options={feetOptions}
              value={feet}
              onChange={(next) => setCm(cmFromFeetInches(next, inches))}
              data-ui={`${UI}.feet`}
            />
            <span className={styles.wheelUnit} aria-hidden="true">
              {t('onboarding.wizard.units.ft')}
            </span>
            <Wheel
              label={t('onboarding.body.inches')}
              options={inchOptions}
              value={inches}
              onChange={(next) => setCm(cmFromFeetInches(feet, next))}
              data-ui={`${UI}.inches`}
            />
            <span className={styles.wheelUnit} aria-hidden="true">
              {t('onboarding.wizard.units.in')}
            </span>
          </div>
        )}
      </div>
    </Sheet>
  );
}
