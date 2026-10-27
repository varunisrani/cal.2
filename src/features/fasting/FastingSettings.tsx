import { useMemo, useState } from 'react';
import { useSheet } from '../../app/useRoute';
import { useSettings } from '../../data/hooks';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { Wheel } from '../../ui/Wheel';
import { wheelOptions } from '../settings/goals/wheelOptions';
import styles from './fasting.module.css';
import { GOAL_HOURS, goalHoursOf, hoursText, useFasting } from './hours';

/** The default goal's wheel is a sheet with its own history entry, so Back closes it first. */
export const FASTING_GOAL_SHEET = 'fasting-goal';

const SETTINGS = ['fasting.on', 'fasting.defaultGoalMin'] as const;

/**
 * The fasting card of Settings › Tracking & reminders (05 §3.7.1, 06 §3.4): the tracking switch,
 * off until the person turns it on, and while it is on the default goal, opening a wheel of 1 to
 * 168 hours. Turning fasting off ends a running fast in the same write (it stays in the diary), so
 * food can be logged again (R05.2), and says so. Nothing is drawn until the settings are read, so
 * the switch never shows its default in place of the stored value (R06.22).
 */
export function FastingSettings() {
  const settings = useSettings(SETTINGS);
  const fasting = useFasting();
  const toast = useToast();
  const goalSheet = useSheet(FASTING_GOAL_SHEET);
  const [switching, setSwitching] = useState(false);

  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="fasting.settings.unavailable">
        {t('fasting.settings.unavailable')}
      </p>
    );
  }

  const on = settings.value['fasting.on'];
  const goalMin = settings.value['fasting.defaultGoalMin'];

  const failed = (error: unknown): void => {
    console.error('A fasting setting could not be saved', error);
    toast.show(t('fasting.settings.saveFailed'));
  };

  const switchTracking = async (next: boolean): Promise<void> => {
    setSwitching(true);
    try {
      const ended = await fasting().setTracking(next);
      if (ended.length > 0) toast.show(t('fasting.settings.ended'));
    } catch (error) {
      failed(error);
    } finally {
      setSwitching(false);
    }
  };

  const saveGoal = async (minutes: number): Promise<void> => {
    try {
      await fasting().setDefaultGoal(minutes);
      goalSheet.close();
    } catch (error) {
      failed(error);
    }
  };

  return (
    <Card
      heading={t('fasting.settings.heading')}
      className={styles.card}
      data-ui="fasting.settings"
    >
      <ul className={styles.rows}>
        <li className={`${styles.rowItem} ${styles.switchItem}`}>
          <Switch
            label={t('fasting.settings.tracking')}
            description={t('fasting.settings.trackingHint')}
            checked={on}
            disabled={switching}
            onChange={(next) => void switchTracking(next)}
            data-ui="fasting.tracking"
          />
        </li>
        {on ? (
          <li className={styles.rowItem}>
            <button
              type="button"
              className={styles.row}
              data-ui="fasting.goal"
              onClick={goalSheet.show}
            >
              <span className={styles.rowLabel}>{t('fasting.settings.goal')}</span>{' '}
              <span className={styles.rowValue}>{hoursText(goalHoursOf(goalMin))}</span>
              <Icon name="chevronRight" size={18} className={styles.chevron} />
            </button>
          </li>
        ) : null}
      </ul>

      {goalSheet.open && on ? (
        <GoalSheet goalMin={goalMin} onSave={saveGoal} onClose={goalSheet.close} />
      ) : null}
    </Card>
  );
}

interface GoalSheetProps {
  readonly goalMin: number;
  /** Receives the goal in minutes; a promise keeps Save busy until it settles. */
  readonly onSave: (minutes: number) => unknown;
  readonly onClose: () => void;
}

/**
 * The default goal wheel: 1 to 168 hours, opening on the stored goal's whole hours. Saved where it
 * opened, it keeps the stored minutes exactly.
 */
function GoalSheet({ goalMin, onSave, onClose }: GoalSheetProps) {
  const start = goalHoursOf(goalMin);
  const [picked, setPicked] = useState(start);
  const options = useMemo(() => wheelOptions(GOAL_HOURS, currentLocale()), []);
  const title = t('fasting.goal.title');

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui="fasting.goal.editor"
      leading={
        <Button variant="quiet" data-ui="fasting.goal.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          data-ui="fasting.goal.save"
          onClick={() => onSave(picked === start ? goalMin : picked * 60)}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.wheels}>
        <Wheel
          label={title}
          options={options}
          value={picked}
          onChange={setPicked}
          data-ui="fasting.goal.wheel"
        />
        <span className={styles.wheelUnit} aria-hidden="true">
          {t('fasting.hoursUnit')}
        </span>
      </div>
    </Sheet>
  );
}
