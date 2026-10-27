import { useId, useState } from 'react';
import { EXTRA_UNIT, NUTRIENT_UNITS, type MassUnit } from '../../../domain/nutrients/catalogue';
import { baseFromTyped, shownTenth } from '../../../domain/servings/scale';
import {
  EXTRA_KEYS,
  NUTRIENT_KEYS,
  type ExtraKey,
  type ExtraValues,
  type NutrientKey,
  type NutrientValues,
} from '../../../domain/model';
import { parseDecimal, plainText } from '../../../domain/units/numbers';
import { formatDecimal } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { valueKey, ValueRow } from './NutritionRows';
import styles from './review.module.css';

/**
 * The stored value for text typed at the shown amount: typed ÷ scale, or unknown (undefined)
 * for empty, negative or unreadable text — never 0.
 */
export function optionalBase(text: string, scale: number, locale: string): number | undefined {
  const typed = parseDecimal(text, locale);
  return typed === null || typed < 0 ? undefined : baseFromTyped(typed, scale);
}

export interface MoreNutritionProps {
  /** Stored optional nutrients; a missing key is unknown. */
  readonly nutrients: NutrientValues;
  /** Stored sports extras (g); a missing key is unknown. */
  readonly extras: ExtraValues;
  readonly scale: number;
  /** Shared with the nutrition rows' lock. */
  readonly unlocked: boolean;
  readonly onNutrientChange: (key: NutrientKey, base: number | undefined) => void;
  readonly onExtraChange: (key: ExtraKey, base: number | undefined) => void;
}

interface Row {
  readonly id: string;
  readonly label: string;
  readonly unit: MassUnit;
  readonly base: number | undefined;
  readonly store: (base: number | undefined) => void;
}

/**
 * The micronutrients (02 §3.5): a collapsed row that opens the 23 optional nutrients, then the 8
 * sports extras, each at the shown amount to 0.1 with its unit, or a dash when unknown. Unlocked,
 * each is a field like the nutrition rows; empty, negative or unreadable text makes it unknown.
 */
export function MoreNutrition({
  nutrients,
  extras,
  scale,
  unlocked,
  onNutrientChange,
  onExtraChange,
}: MoreNutritionProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const locale = currentLocale();

  const rows: Row[] = [
    ...NUTRIENT_KEYS.map((key) => ({
      id: key,
      label: t(`review.nutrient.${key}`),
      unit: NUTRIENT_UNITS[key],
      base: nutrients[key],
      store: (base: number | undefined) => onNutrientChange(key, base),
    })),
    ...EXTRA_KEYS.map((key) => ({
      id: key,
      label: t(`review.extra.${key}`),
      unit: EXTRA_UNIT,
      base: extras[key],
      store: (base: number | undefined) => onExtraChange(key, base),
    })),
  ];

  return (
    <Card data-ui="review.more">
      <button
        type="button"
        className={styles.disclosure}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        data-ui="review.more.toggle"
      >
        <span className={styles.cardTitle}>{t('review.more.heading')}</span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={20} />
      </button>
      {open ? (
        <dl id={listId} className={styles.values}>
          {rows.map((row) => {
            const shown = shownTenth(row.base === undefined ? undefined : row.base * scale);
            return (
              <ValueRow
                key={row.id}
                label={row.label}
                unit={t(`review.unit.${row.unit}`)}
                text={shown === null ? t('review.unknown') : formatDecimal(shown, 1, locale)}
                editText={shown === null ? '' : plainText(shown, 1)}
                storedKey={valueKey(row.base, scale)}
                unlocked={unlocked}
                onType={(text) => {
                  const base = optionalBase(text, scale, locale);
                  row.store(base);
                  return valueKey(base, scale);
                }}
                muted
                data-ui={`review.more.${row.id}`}
              />
            );
          })}
        </dl>
      ) : null}
    </Card>
  );
}
