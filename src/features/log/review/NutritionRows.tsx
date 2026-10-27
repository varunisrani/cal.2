import { useId, useState } from 'react';
import { baseFromTyped, scaledKcal } from '../../../domain/servings/scale';
import {
  formatEnergy,
  fromDisplay,
  parseEnergy,
  toDisplay,
  type EnergyDisplayUnit,
} from '../../../domain/units/energy';
import { formatMacro, formatNumber, parseDecimal } from '../../../domain/units/numbers';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { IconButton } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { cx } from '../../../ui/classes';
import { Icon } from '../../../ui/icons';
import styles from './review.module.css';

/** The four values every food has. */
export type CoreKey = 'kcal' | 'protein' | 'carbs' | 'fat';
export type CoreValues = Readonly<Record<CoreKey, number>>;

/** Identifies a stored value at a scale: typed text stays on screen while it is unchanged. */
export function valueKey(base: number | undefined, scale: number): string {
  return `${base ?? 'unknown'}@${scale}`;
}

/** Grams of a macro as text: whole numbers without decimals, else one decimal (02 §3.3). */
export function macroText(grams: number, locale: string = currentLocale()): string {
  const whole = Math.round(grams);
  if (Math.abs(grams - whole) < 0.0001) return formatNumber(whole, locale);
  return formatNumber(grams, locale, 1, 1);
}

export interface ValueRowProps {
  readonly label: string;
  readonly unit: string;
  /** The value as it reads while locked ("1,046", "12.5", "—"). */
  readonly text: string;
  /** What the field opens with: plain digits and a dot. */
  readonly editText: string;
  /** `valueKey` of the stored value now. */
  readonly storedKey: string;
  readonly unlocked: boolean;
  /** Stores what was typed and returns the `valueKey` of what it stored. */
  readonly onType: (text: string) => string;
  /** A quieter label (the micronutrients). */
  readonly muted?: boolean;
  readonly 'data-ui': string;
}

/**
 * One row of a nutrition list: a label, the value and its unit. Unlocked, the value is a decimal
 * field; locking again shows text.
 */
export function ValueRow({
  label,
  unit,
  text,
  editText,
  storedKey,
  unlocked,
  onType,
  muted = false,
  'data-ui': ui,
}: ValueRowProps) {
  const id = useId();
  const unitId = `${id}-unit`;
  return (
    <div className={styles.valueRow}>
      <dt className={cx(styles.valueLabel, muted && styles.muted)}>
        {unlocked ? <label htmlFor={id}>{label}</label> : label}
      </dt>
      <dd className={styles.valueData}>
        {unlocked ? (
          <ValueInput
            id={id}
            unitId={unitId}
            editText={editText}
            storedKey={storedKey}
            onType={onType}
            data-ui={ui}
          />
        ) : (
          <span className={styles.value} data-ui={ui}>
            {text}
          </span>
        )}
        <span id={unitId} className={styles.valueUnit}>
          {unit}
        </span>
      </dd>
    </div>
  );
}

interface ValueInputProps {
  readonly id: string;
  readonly unitId: string;
  readonly editText: string;
  readonly storedKey: string;
  readonly onType: (text: string) => string;
  readonly 'data-ui': string;
}

/** The open field. It shows what was typed for as long as the value it stored is unchanged. */
function ValueInput({ id, unitId, editText, storedKey, onType, 'data-ui': ui }: ValueInputProps) {
  const [typed, setTyped] = useState<{ readonly text: string; readonly key: string } | null>(null);
  const value = typed !== null && typed.key === storedKey ? typed.text : editText;
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={styles.valueInput}
      value={value}
      aria-describedby={unitId}
      onChange={(event) => {
        const text = event.target.value;
        setTyped({ text, key: onType(text) });
      }}
      data-ui={ui}
    />
  );
}

export interface NutritionRowsProps {
  /** Stored energy (kcal) and macros (g): they describe the draft's own amount. */
  readonly values: CoreValues;
  /** Shown amount ÷ the draft's amount. */
  readonly scale: number;
  readonly energyUnit: EnergyDisplayUnit;
  readonly unlocked: boolean;
  readonly onUnlockedChange: (unlocked: boolean) => void;
  /** The food has ingredient lines: their next change replaces values edited here (R02.5). */
  readonly hasLines: boolean;
  /** A typed value, already turned into a stored one (typed ÷ scale). */
  readonly onChange: (key: CoreKey, base: number) => void;
}

const MACROS = ['protein', 'carbs', 'fat'] as const;

/**
 * Energy (in the person's unit), protein, carbs and fat at the shown amount (02 §3.5). The lock
 * in the header opens every row as a field filled with the value on screen; a typed value
 * describes the shown amount, so it is stored divided by the scale (R02.3). Empty, negative or
 * unreadable text stores 0. An untouched energy field never converts back, so a kJ reading keeps
 * the stored kcal exact (R06.20).
 */
export function NutritionRows({
  values,
  scale,
  energyUnit,
  unlocked,
  onUnlockedChange,
  hasLines,
  onChange,
}: NutritionRowsProps) {
  const headingId = useId();
  const locale = currentLocale();
  const shownKcal = scaledKcal(values.kcal, scale);

  const typeEnergy = (text: string): string => {
    const typed = parseEnergy(text, locale);
    const base = baseFromTyped(typed === null ? 0 : fromDisplay(typed, energyUnit), scale);
    onChange('kcal', base);
    return valueKey(base, scale);
  };
  const typeMacro =
    (key: (typeof MACROS)[number]) =>
    (text: string): string => {
      const typed = parseDecimal(text, locale);
      const base = typed === null || typed < 0 ? 0 : baseFromTyped(typed, scale);
      onChange(key, base);
      return valueKey(base, scale);
    };

  return (
    <Card as="section" aria-labelledby={headingId} data-ui="review.nutrition">
      <div className={styles.cardHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          {t('review.nutrition.heading')}
        </h2>
        <IconButton
          label={t(unlocked ? 'review.nutrition.lock' : 'review.nutrition.unlock')}
          icon={<Icon name={unlocked ? 'unlock' : 'lock'} size={20} />}
          aria-pressed={unlocked}
          className={cx(unlocked && styles.lockOpen)}
          onClick={() => onUnlockedChange(!unlocked)}
          data-ui="review.lock"
        />
      </div>
      <dl className={styles.values}>
        <ValueRow
          label={t(
            energyUnit === 'kJ' ? 'review.nutrition.energy.kJ' : 'review.nutrition.energy.kcal',
          )}
          unit={t(energyUnit === 'kJ' ? 'review.unit.kJ' : 'review.unit.kcal')}
          text={formatEnergy(shownKcal, energyUnit, locale)}
          editText={String(toDisplay(shownKcal, energyUnit))}
          storedKey={valueKey(values.kcal, scale)}
          unlocked={unlocked}
          onType={typeEnergy}
          data-ui="review.kcal"
        />
        {MACROS.map((key) => (
          <ValueRow
            key={key}
            label={t(`review.nutrition.${key}`)}
            unit={t('review.unit.g')}
            text={macroText(values[key] * scale, locale)}
            editText={formatMacro(values[key] * scale)}
            storedKey={valueKey(values[key], scale)}
            unlocked={unlocked}
            onType={typeMacro(key)}
            data-ui={`review.${key}`}
          />
        ))}
      </dl>
      {unlocked && hasLines ? (
        <p className={styles.hint} data-ui="review.nutrition.hint">
          {t('review.nutrition.linesHint')}
        </p>
      ) : null}
    </Card>
  );
}
