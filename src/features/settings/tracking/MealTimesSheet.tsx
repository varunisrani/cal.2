import { useEffect, useRef, useState } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import {
  DEFAULT_MEAL_TIMES,
  MEAL_TIME_SLOTS,
  mealTimeChoices,
  type MealTimeSlot,
} from '../../../domain/meals/times';
import type { MealTimes } from '../../../domain/model';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type { TrackingSettingsService } from '../../../services/trackingSettings';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';
import { Wheel } from '../../../ui/Wheel';
import { clockText } from './clockText';
import styles from './tracking.module.css';

/** The editor is a sheet with its own history entry, so Back closes it first. */
export const MEAL_TIMES_SHEET = 'meal-times';

const SETTINGS = ['meals.times'] as const;

/**
 * The Tracking page's service, or a function that throws when there is none, so a card fails its
 * action (with its own message) rather than its render. `main.tsx` always provides it.
 */
export function useTrackingSettings(): () => TrackingSettingsService {
  const { trackingSettings } = useServices();
  return () => {
    if (!trackingSettings) throw new Error('No tracking settings service above this card');
    return trackingSettings;
  };
}

/**
 * The first card of Settings › Tracking & reminders (06 §3.4): one row opening the meal times
 * editor, and a line saying what the times are for. Nothing is drawn until the settings are
 * read (R06.22).
 */
export function MealTimesCard() {
  const settings = useSettings(SETTINGS);
  const service = useTrackingSettings();
  const toast = useToast();
  const sheet = useSheet(MEAL_TIMES_SHEET);

  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="mealTimes.unavailable">
        {t('trackers.mealTimes.unavailable')}
      </p>
    );
  }

  const save = async (times: MealTimes): Promise<void> => {
    try {
      await service().setMealTimes(times);
      sheet.close();
    } catch (error) {
      console.error('The meal times could not be saved', error);
      toast.show(t('trackers.mealTimes.saveFailed'));
    }
  };

  return (
    <Card
      heading={t('trackers.mealTimes.heading')}
      className={styles.card}
      data-ui="mealTimes.settings"
    >
      <ul className={styles.rows}>
        <li className={styles.rowItem}>
          <button
            type="button"
            className={styles.row}
            data-ui="mealTimes.open"
            onClick={sheet.show}
          >
            <span className={`${styles.rowLabel} ${styles.grow}`}>
              {t('trackers.mealTimes.row')}
            </span>
            <Icon name="chevronRight" size={18} className={styles.chevron} />
          </button>
        </li>
      </ul>
      <p className={`${styles.note} ${styles.cardNote}`}>{t('trackers.mealTimes.note')}</p>

      <MealTimesSheet
        open={sheet.open}
        times={settings.value['meals.times']}
        onSave={save}
        onClose={sheet.close}
      />
    </Card>
  );
}

export interface MealTimesSheetProps {
  readonly open: boolean;
  /** The stored starts: the editor's draft begins as a copy of them. */
  readonly times: MealTimes;
  /** Receives the draft; a promise keeps Save busy until it settles. */
  readonly onSave: (times: MealTimes) => Promise<unknown>;
  /** Cancel, Escape, the scrim, Back: nothing is stored. */
  readonly onClose: () => void;
}

/**
 * The meal times editor (06 §3.4.1, P01-08): the four starts with their times, each opening a
 * wheel of quarter hours kept at least 15 minutes from its neighbours, with the start's current
 * time always among them. Done puts the wheel's time into the draft; "Restore default times" puts
 * 05:00 / 12:00 / 18:00 / 23:00 there. Only Save stores the draft. Renders nothing while closed, so
 * every opening starts from the stored times.
 */
export function MealTimesSheet(props: MealTimesSheetProps) {
  return props.open ? <OpenEditor {...props} /> : null;
}

/** The start whose wheel is showing, and the time the wheel is on. */
interface Picking {
  readonly slot: MealTimeSlot;
  readonly minute: number;
}

function OpenEditor({ times, onSave, onClose }: MealTimesSheetProps) {
  const locale = currentLocale();
  const [draft, setDraft] = useState<MealTimes>(() => ({ ...times }));
  const [picking, setPicking] = useState<Picking | null>(null);
  // The start whose wheel was left last: its row takes focus back.
  const [left, setLeft] = useState<MealTimeSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const wheelBox = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const pickingSlot = picking?.slot ?? null;

  // The two views share one sheet, so focus is moved by hand: to the wheel, then back to the row.
  useEffect(() => {
    const target =
      pickingSlot !== null
        ? wheelBox.current?.querySelector('select')
        : left !== null
          ? list.current?.querySelector<HTMLElement>(`[data-ui="mealTimes.${left}"]`)
          : null;
    target?.focus({ preventScroll: true });
  }, [pickingSlot, left]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  if (picking) {
    const title = t(`trackers.mealTimes.starts.${picking.slot}`);
    const back = (): void => {
      setLeft(picking.slot);
      setPicking(null);
    };
    const options = mealTimeChoices(draft, picking.slot).map((minute) => ({
      value: minute,
      label: clockText(minute, locale),
    }));
    return (
      // Escape and the scrim go back to the list here: only the list's Cancel leaves the editor.
      <Sheet
        open
        title={title}
        onClose={back}
        data-ui="mealTimes.editor"
        leading={
          <Button variant="quiet" data-ui="mealTimes.wheel.cancel" onClick={back}>
            {t('common.cancel')}
          </Button>
        }
        trailing={
          <Button
            variant="primary"
            data-ui="mealTimes.wheel.done"
            onClick={() => {
              setDraft((current) => ({ ...current, [picking.slot]: picking.minute }));
              back();
            }}
          >
            {t('common.done')}
          </Button>
        }
      >
        <div ref={wheelBox} className={styles.wheels}>
          <Wheel
            label={title}
            options={options}
            value={picking.minute}
            onChange={(minute) => setPicking({ slot: picking.slot, minute })}
            data-ui="mealTimes.wheel"
          />
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      title={t('trackers.mealTimes.title')}
      onClose={onClose}
      data-ui="mealTimes.editor"
      leading={
        <Button variant="quiet" data-ui="mealTimes.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={saving}
          data-ui="mealTimes.save"
          onClick={() => void save()}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <ul ref={list} className={styles.list}>
          {MEAL_TIME_SLOTS.map((slot) => (
            <li key={slot} className={styles.rowItem}>
              <button
                type="button"
                className={styles.row}
                data-ui={`mealTimes.${slot}`}
                onClick={() => setPicking({ slot, minute: draft[slot] })}
              >
                <span className={styles.rowLabel}>{t(`trackers.mealTimes.starts.${slot}`)}</span>{' '}
                <span className={styles.rowValue}>{clockText(draft[slot], locale)}</span>
                <Icon name="chevronRight" size={18} className={styles.chevron} />
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.note}>{t('trackers.mealTimes.help')}</p>
        <Button
          variant="quiet"
          block
          data-ui="mealTimes.restore"
          onClick={() => setDraft({ ...DEFAULT_MEAL_TIMES })}
        >
          {t('trackers.mealTimes.restore')}
        </Button>
      </div>
    </Sheet>
  );
}
