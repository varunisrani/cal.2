import { useRef, useState, type FormEvent } from 'react';
import type { DayKey } from '../../domain/dates/dayKey';
import type { WaterLog } from '../../domain/model';
import { parseDecimal } from '../../domain/units/numbers';
import { amountToMl, filterAmountText, type WaterDisplayUnit } from '../../domain/units/water';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { maxAmountText, useWaterService, waterAmount } from './amounts';
import styles from './water.module.css';

export interface CustomWaterSheetProps {
  readonly open: boolean;
  /** The day the amount is logged on: now for today, else that day at the current clock time. */
  readonly day: DayKey;
  readonly unit: WaterDisplayUnit;
  /** Cancel, Escape, the scrim; also after a log, right after `onAdded`. */
  readonly onClose: () => void;
  /** The amount is stored. */
  readonly onAdded?: (log: WaterLog) => void;
}

/**
 * Custom amount (05 §3.6.3): one field in the person's unit with the unit after it, taking what
 * an amount can hold (ml: up to five digits; fl oz: one decimal place). Add is enabled once the
 * amount is above zero; more than 5 000 ml is refused with a message (D-16.39). The field opens
 * empty every time.
 */
export function CustomWaterSheet(props: CustomWaterSheetProps) {
  return props.open ? <OpenSheet {...props} /> : null;
}

function OpenSheet({ day, unit, onClose, onAdded }: CustomWaterSheetProps) {
  const water = useWaterService();
  const toast = useToast();
  const locale = currentLocale();
  const field = useRef<HTMLInputElement>(null);
  // A ref, so Enter pressed twice before a render never logs twice.
  const adding = useRef(false);
  const [text, setText] = useState('');

  const value = parseDecimal(text, locale);
  const ml = value === null ? null : amountToMl(value, unit);
  const tooMuch = value !== null && value > 0 && ml === null;

  const add = async (): Promise<void> => {
    if (ml === null || adding.current) return;
    adding.current = true;
    try {
      const log = await water.logWater(ml, day);
      toast.show(t('trackers.water.menu.logged', { amount: waterAmount(ml, unit) }));
      onAdded?.(log);
      onClose();
    } catch (error) {
      console.error('Logging water failed', error);
      toast.show(t('trackers.water.menu.logFailed'));
    } finally {
      adding.current = false;
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void add();
  };

  return (
    <Sheet
      open
      title={t('trackers.water.custom.title')}
      onClose={onClose}
      initialFocus={field}
      data-ui="water.custom"
      leading={
        <Button variant="quiet" data-ui="water.custom.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" disabled={ml === null} data-ui="water.custom.add" onClick={add}>
          {t('common.add')}
        </Button>
      }
    >
      <form className={styles.editor} onSubmit={submit} noValidate>
        <Field
          ref={field}
          label={t('trackers.water.custom.field')}
          value={text}
          onChange={(raw) => setText(filterAmountText(raw, unit, locale))}
          unit={t(`home.unit.${unit}`)}
          inputMode={unit === 'ml' ? 'numeric' : 'decimal'}
          autoComplete="off"
          error={
            tooMuch ? t('trackers.water.custom.tooMuch', { max: maxAmountText(unit) }) : undefined
          }
          data-ui="water.custom.amount"
        />
      </form>
    </Sheet>
  );
}
