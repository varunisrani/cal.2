import { useMemo, useState } from 'react';
import { useSheet } from '../../app/useRoute';
import { useSettings } from '../../data/hooks';
import {
  WATER_DISPLAY_UNITS,
  WATER_GOAL_WHEEL,
  waterGoalSave,
  waterGoalStart,
  type WaterDisplayUnit,
} from '../../domain/units/water';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import { ListPicker } from '../../ui/ListPicker';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { Wheel } from '../../ui/Wheel';
import { wheelOptions } from '../settings/goals/wheelOptions';
import { quickAddSummary, useWaterService, waterAmount } from './amounts';
import { PresetsEditor } from './PresetsEditor';
import styles from './water.module.css';

/** Each row's editor is a sheet with its own history entry, so Back closes it first. */
export const WATER_SHEETS = {
  goal: 'water-goal',
  unit: 'water-unit',
  quickAdd: 'water-quick-add',
} as const;

const SETTINGS = ['water.on', 'water.goalMl', 'water.unit', 'water.quickAddMl'] as const;

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly onOpen: () => void;
  readonly 'data-ui': string;
}

/** A setting's name, its value, and a chevron to its editor. */
function Row({ label, value, onOpen, 'data-ui': ui }: RowProps) {
  return (
    <li className={styles.rowItem}>
      <button type="button" className={styles.row} data-ui={ui} onClick={onOpen}>
        <span className={styles.rowLabel}>{label}</span>{' '}
        <span className={styles.rowValue}>{value}</span>
        <Icon name="chevronRight" size={18} className={styles.chevron} />
      </button>
    </li>
  );
}

/**
 * The water card of Settings › Tracking & reminders (05 §3.6.1, 06 §3.4): the tracking switch,
 * off until the person turns it on, and while it is on the daily goal, the unit and the quick-add
 * amounts, each opening its editor. Turning water off also switches its reminder off; the logs
 * stay. Nothing is drawn until the settings are read, so the switch never shows its default in
 * place of the stored value (R06.22).
 */
export function WaterSettings() {
  const settings = useSettings(SETTINGS);
  const water = useWaterService();
  const toast = useToast();
  const goalSheet = useSheet(WATER_SHEETS.goal);
  const unitSheet = useSheet(WATER_SHEETS.unit);
  const quickAddSheet = useSheet(WATER_SHEETS.quickAdd);
  const [switching, setSwitching] = useState(false);

  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="water.settings.unavailable">
        {t('trackers.water.settings.unavailable')}
      </p>
    );
  }

  const on = settings.value['water.on'];
  const goalMl = settings.value['water.goalMl'];
  const unit = settings.value['water.unit'];
  const quickAdd = settings.value['water.quickAddMl'];

  const failed = (error: unknown): void => {
    console.error('A water setting could not be saved', error);
    toast.show(t('trackers.water.settings.saveFailed'));
  };

  const switchTracking = async (next: boolean): Promise<void> => {
    setSwitching(true);
    try {
      await water.setTracking(next);
    } catch (error) {
      failed(error);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Card heading={t('trackers.water.heading')} className={styles.card} data-ui="water.settings">
      <ul className={styles.rows}>
        <li className={`${styles.rowItem} ${styles.switchItem}`}>
          <Switch
            label={t('trackers.water.settings.tracking')}
            description={t('trackers.water.settings.trackingHint')}
            checked={on}
            disabled={switching}
            onChange={(next) => void switchTracking(next)}
            data-ui="water.tracking"
          />
        </li>
        {on ? (
          <>
            <Row
              label={t('trackers.water.settings.goal')}
              value={waterAmount(goalMl, unit)}
              onOpen={goalSheet.show}
              data-ui="water.goal"
            />
            <Row
              label={t('trackers.water.settings.unit')}
              value={t(`home.unit.${unit}`)}
              onOpen={unitSheet.show}
              data-ui="water.unit"
            />
            <Row
              label={t('trackers.water.settings.quickAdd')}
              value={quickAddSummary(quickAdd, unit)}
              onOpen={quickAddSheet.show}
              data-ui="water.quickAdd"
            />
          </>
        ) : null}
      </ul>

      {goalSheet.open && on ? (
        <GoalSheet
          goalMl={goalMl}
          unit={unit}
          onSave={(ml) => water.setGoal(ml).then(goalSheet.close, failed)}
          onClose={goalSheet.close}
        />
      ) : null}
      <ListPicker
        open={unitSheet.open && on}
        title={t('trackers.water.settings.unit')}
        options={WATER_DISPLAY_UNITS.map((value) => ({
          value,
          label: t(`trackers.water.unitChoice.${value}`),
        }))}
        value={unit}
        onSelect={(next) => {
          water.setUnit(next).catch(failed);
        }}
        onClose={unitSheet.close}
        data-ui="water.unit.picker"
      />
      <PresetsEditor
        open={quickAddSheet.open && on}
        saved={quickAdd}
        unit={unit}
        onSave={(amounts) => water.setQuickAdd(amounts).then(quickAddSheet.close, failed)}
        onClose={quickAddSheet.close}
      />
    </Card>
  );
}

interface GoalSheetProps {
  readonly goalMl: number;
  readonly unit: WaterDisplayUnit;
  /** Receives the goal in ml; a promise keeps Save busy until it settles. */
  readonly onSave: (ml: number) => unknown;
  readonly onClose: () => void;
}

/**
 * The daily goal wheel: 50–10 000 ml in 50s or 2–338 fl oz in whole ounces, opening on the stored
 * goal's nearest step. Saved where it opened, it keeps the stored ml exactly, in either unit.
 */
function GoalSheet({ goalMl, unit, onSave, onClose }: GoalSheetProps) {
  const range = WATER_GOAL_WHEEL[unit];
  const start = waterGoalStart(goalMl, unit);
  const [picked, setPicked] = useState(start);
  const options = useMemo(() => wheelOptions(range, currentLocale()), [range]);
  const title = t('trackers.water.goal.title');

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui="water.goal.editor"
      leading={
        <Button variant="quiet" data-ui="water.goal.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          data-ui="water.goal.save"
          onClick={() => onSave(waterGoalSave(picked, start, goalMl, unit))}
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
          data-ui="water.goal.wheel"
        />
        <span className={styles.wheelUnit} aria-hidden="true">
          {t(`home.unit.${unit}`)}
        </span>
      </div>
    </Sheet>
  );
}
