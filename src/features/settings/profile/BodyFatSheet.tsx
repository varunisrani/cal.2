import { useMemo, useState } from 'react';
import type { Profile } from '../../../domain/model';
import { formatDecimal } from '../../../i18n/format';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { Wheel, type WheelOption } from '../../../ui/Wheel';
import { BODY_FAT_WHEEL, bodyFatPercent, DEFAULT_BODY_FAT } from '../../onboarding/wizard';
import styles from './profile.module.css';
import { useProfileEdits, useSaveFailed } from './useProfileEdits';
import { percentText } from './values';

/** Body fat itself, or the goal shown next to it on Progress. */
export type BodyFatSheetKind = 'current' | 'goal';

export interface BodyFatSheetProps {
  readonly open: boolean;
  readonly kind: BodyFatSheetKind;
  readonly profile: Profile;
  readonly onClose: () => void;
}

/** A goal wheel with no goal and no body fat opens here (the goal row needs body fat anyway). */
const DEFAULT_GOAL_BODY_FAT = 0.15;

const UI: Readonly<Record<BodyFatSheetKind, string>> = {
  current: 'profile.bodyFat.sheet',
  goal: 'profile.goalBodyFat.sheet',
};

const TITLES: Readonly<Record<BodyFatSheetKind, TKey>> = {
  current: 'profile.rows.bodyFat',
  goal: 'profile.rows.goalBodyFat',
};

/** 3 to 60 in steps of 0.5, as wheel rows. */
function percentOptions(): WheelOption<number>[] {
  const { min, max, step } = BODY_FAT_WHEEL;
  const options: WheelOption<number>[] = [];
  for (let n = 0; min + n * step <= max; n++) {
    const value = min + n * step;
    options.push({ value, label: formatDecimal(value, 1) });
  }
  return options;
}

/**
 * Body fat or goal body fat in a sheet: a 3–60 % wheel in half steps (Proposed D-16.56), Save, and
 * Remove when a value is stored. Body fat opens on the stored value or 20 %; the goal on the
 * stored goal, else the body fat, else 15 %. Removing body fat also removes its goal. A wheel
 * nobody moved saves the exact stored value. Renders nothing while closed.
 */
export function BodyFatSheet(props: BodyFatSheetProps) {
  return props.open ? <OpenBodyFatSheet {...props} /> : null;
}

function OpenBodyFatSheet({ kind, profile, onClose }: BodyFatSheetProps) {
  const edits = useProfileEdits();
  const saveFailed = useSaveFailed();
  const options = useMemo(percentOptions, []);
  const stored = kind === 'current' ? profile.bodyFat : profile.goalBodyFat;
  const [fraction, setFraction] = useState(
    () =>
      stored ??
      (kind === 'current' ? DEFAULT_BODY_FAT : (profile.bodyFat ?? DEFAULT_GOAL_BODY_FAT)),
  );
  const ui = UI[kind];
  const title = t(TITLES[kind]);
  const write = (value: number | null) =>
    kind === 'current' ? edits.setBodyFat(value) : edits.setGoalBodyFat(value);

  const saveAs = (value: number | null) => async (): Promise<void> => {
    try {
      await write(value);
      onClose();
    } catch (error) {
      saveFailed(error);
    }
  };

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
        <Button variant="primary" data-ui={`${ui}.save`} onClick={saveAs(fraction)}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        {kind === 'goal' && profile.bodyFat !== undefined ? (
          <p className={styles.note}>
            {t('profile.bodyFat.current', { value: percentText(profile.bodyFat) })}
          </p>
        ) : null}
        <div className={styles.wheels}>
          <Wheel
            label={t(kind === 'current' ? 'profile.bodyFat.wheel' : 'profile.bodyFat.goalWheel')}
            options={options}
            value={bodyFatPercent(fraction)}
            onChange={(percent) => setFraction(percent / 100)}
            data-ui={`${ui}.wheel`}
          />
          <span className={styles.wheelUnit} aria-hidden="true">
            {t('onboarding.wizard.units.percent')}
          </span>
        </div>
        {kind === 'goal' ? <p className={styles.note}>{t('profile.bodyFat.goalNote')}</p> : null}
        {stored === undefined ? null : (
          <>
            {kind === 'current' && profile.goalBodyFat !== undefined ? (
              <p className={styles.note}>{t('profile.bodyFat.removeNote')}</p>
            ) : null}
            <Button variant="danger" data-ui={`${ui}.remove`} onClick={saveAs(null)}>
              {t(kind === 'current' ? 'profile.bodyFat.remove' : 'profile.bodyFat.removeGoal')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
