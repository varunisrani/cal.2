import { useRef } from 'react';
import { useSheet } from '../../app/useRoute';
import { useSettings } from '../../data/hooks';
import type { DayKey } from '../../domain/dates/dayKey';
import { t } from '../../i18n/t';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { useWaterService, waterAmount } from './amounts';
import { CustomWaterSheet } from './CustomWaterSheet';
import styles from './water.module.css';

/** The custom amount sheet's place on the sheet stack, so Back closes it first. */
export const WATER_CUSTOM_SHEET = 'water-custom';

const SETTINGS = ['water.unit', 'water.quickAddMl'] as const;

export interface WaterMenuPageProps {
  /** The day Home shows: every log lands on it (now for today, else at the current clock time). */
  readonly day: DayKey;
  /** A log is stored: the menu can close. Never called for Back or a cancelled custom amount. */
  readonly onDone: () => void;
  /** The Back row: the menu's previous page. */
  readonly onBack: () => void;
  /**
   * Custom amount, for a host that shows `CustomWaterSheet` itself (one that closes the menu, and
   * the page with it, first). Without it the page opens its own sheet.
   */
  readonly onCustom?: () => void;
}

/**
 * The + menu's Water page (05 §3.4, §3.6.3): the three quick-add amounts in the person's unit,
 * smallest first, each logging at once with a short confirmation; "Custom amount"; and Back.
 * Unless the host takes Custom amount (`onCustom`), the page opens the custom sheet itself and
 * must stay mounted until `onDone` or the sheet's Cancel.
 */
export function WaterMenuPage({ day, onDone, onBack, onCustom }: WaterMenuPageProps) {
  const settings = useSettings(SETTINGS);
  const water = useWaterService();
  const toast = useToast();
  const custom = useSheet(WATER_CUSTOM_SHEET);
  // A ref, so a second tap before the first log is stored never logs twice.
  const logging = useRef(false);

  if (settings.status === 'loading') return null;

  const back = (
    <li>
      <button type="button" className={styles.menuRow} data-ui="water.menu.back" onClick={onBack}>
        <span className={`${styles.menuIcon} ${styles.backIcon}`}>
          <Icon name="chevronLeft" size={20} />
        </span>
        <span className={styles.menuLabel}>{t('common.back')}</span>
      </button>
    </li>
  );

  if (settings.status === 'error') {
    return (
      <div role="group" aria-label={t('trackers.water.heading')} data-ui="water.menu">
        <p className={styles.note} data-ui="water.menu.unavailable">
          {t('trackers.water.menu.unavailable')}
        </p>
        <ul className={styles.menu}>{back}</ul>
      </div>
    );
  }

  const unit = settings.value['water.unit'];
  const amounts = settings.value['water.quickAddMl'];

  const log = async (ml: number): Promise<void> => {
    if (logging.current) return;
    logging.current = true;
    try {
      await water.logWater(ml, day);
    } catch (error) {
      console.error('Logging water failed', error);
      toast.show(t('trackers.water.menu.logFailed'));
      return;
    } finally {
      logging.current = false;
    }
    toast.show(t('trackers.water.menu.logged', { amount: waterAmount(ml, unit) }));
    onDone();
  };

  return (
    <div role="group" aria-label={t('trackers.water.heading')} data-ui="water.menu">
      <ul className={styles.menu}>
        {amounts.map((ml, index) => (
          // Two amounts may be equal, so the place keys the row.
          <li key={index}>
            <button
              type="button"
              className={styles.menuRow}
              data-ui={`water.menu.amount.${index}`}
              onClick={() => void log(ml)}
            >
              <span className={styles.menuIcon}>
                <Icon name="drop" size={20} />
              </span>
              <span className={styles.menuLabel}>{waterAmount(ml, unit)}</span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={styles.menuRow}
            data-ui="water.menu.custom"
            onClick={onCustom ?? custom.show}
          >
            <span className={styles.menuIcon}>
              <Icon name="pencil" size={20} />
            </span>
            <span className={styles.menuLabel}>{t('trackers.water.menu.custom')}</span>
          </button>
        </li>
        <li role="separator" className={styles.menuSeparator} />
        {back}
      </ul>
      <CustomWaterSheet
        open={custom.open}
        day={day}
        unit={unit}
        onAdded={onDone}
        onClose={custom.close}
      />
    </div>
  );
}
