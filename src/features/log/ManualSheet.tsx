import { useId, useRef, useState } from 'react';
import { useSheet } from '../../app/useRoute';
import { useSettings } from '../../data/hooks';
import type { DayKey } from '../../domain/dates/dayKey';
import { stampForDay } from '../../domain/dates/ranges';
import { mealAtInstant } from '../../domain/meals/times';
import { MEAL_KINDS, type MealKind, type NutritionDraft } from '../../domain/model';
import { fromDisplay, parseEnergy, type EnergyDisplayUnit } from '../../domain/units/energy';
import { parseDecimal } from '../../domain/units/numbers';
import { currentLocale } from '../../i18n/locale';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Icon } from '../../ui/icons';
import { ListPicker } from '../../ui/ListPicker';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { tx, type TxKey } from '../home/text';
import styles from './log.module.css';
import { MEAL_NAME_KEYS } from './meals';

/** The meal picker's place on the sheet stack, above the manual sheet. */
export const MEAL_PICKER_SHEET = 'manual-meal';

const SETTINGS = ['units.energy', 'meals.times'] as const;

/** What the person typed, as typed. */
interface Typed {
  readonly name: string;
  readonly energy: string;
  readonly protein: string;
  readonly carbs: string;
  readonly fat: string;
  readonly fibre: string;
}

type NumberField = Exclude<keyof Typed, 'name'>;

const EMPTY: Typed = { name: '', energy: '', protein: '', carbs: '', fat: '', fibre: '' };

/** The form read: the draft to log when everything is in order, and a message per bad field. */
interface Reading {
  readonly draft: NutritionDraft | null;
  readonly errors: Partial<Record<NumberField, TxKey>>;
}

/**
 * Reads the form (02 §3.8). Name: required, trimmed. Energy: a required whole number in the
 * person's unit, stored as kcal. Protein, carbs and fat: optional amounts of 0 or more, empty
 * reads 0. Fibre: optional; empty or negative is unknown. Text that does not read as a number is
 * an error, never a silent 0.
 */
function readTyped(typed: Typed, unit: EnergyDisplayUnit, locale: string): Reading {
  const errors: Partial<Record<NumberField, TxKey>> = {};

  let kcal: number | null = null;
  if (typed.energy.trim() !== '') {
    const value = parseEnergy(typed.energy, locale);
    if (value === null || !Number.isInteger(value)) errors.energy = 'log.manual.wholeNumber';
    else kcal = fromDisplay(value, unit);
  }

  const grams = (field: 'protein' | 'carbs' | 'fat'): number => {
    if (typed[field].trim() === '') return 0;
    const value = parseDecimal(typed[field], locale);
    if (value === null || value < 0) {
      errors[field] = 'log.manual.number';
      return 0;
    }
    return value;
  };
  const protein = grams('protein');
  const carbs = grams('carbs');
  const fat = grams('fat');

  let fibre: number | undefined;
  if (typed.fibre.trim() !== '') {
    const value = parseDecimal(typed.fibre, locale);
    if (value === null) errors.fibre = 'log.manual.number';
    else if (value >= 0) fibre = value;
  }

  const name = typed.name.trim();
  const complete = name !== '' && kcal !== null && Object.keys(errors).length === 0;
  if (!complete || kcal === null) return { draft: null, errors };
  return {
    draft: {
      name,
      kcal,
      protein,
      carbs,
      fat,
      nutrients: fibre === undefined ? {} : { fibre },
      extras: {},
      // No weight and no serving data: the values describe one serving of whatever it was.
      basis: { kind: 'servings', count: 1 },
      units: [],
      lines: [],
      progressive: false,
    },
    errors,
  };
}

export interface ManualSheetProps {
  readonly open: boolean;
  /** Cancel, and after a successful save. */
  readonly onClose: () => void;
  /** The day the entry goes to: today logs at now, another day at the current clock time. */
  readonly dayKey: DayKey;
}

/**
 * Adding food by hand, without the AI: name, energy in the person's unit, optional macros and
 * fibre, and the meal (by default the meal for the entry's time). Save logs it straight into the
 * diary through the diary service, once per tap burst. Only Cancel and Save close the sheet:
 * Escape, the scrim and a pull do nothing. Renders nothing while closed, so every opening starts
 * empty.
 */
export function ManualSheet(props: ManualSheetProps) {
  return props.open ? <OpenManualSheet {...props} /> : null;
}

function OpenManualSheet({ onClose, dayKey }: ManualSheetProps) {
  const { diary, clock } = useServices();
  const toast = useToast();
  const settings = useSettings(SETTINGS);
  const picker = useSheet(MEAL_PICKER_SHEET);
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [openedAt] = useState(() => clock.now());
  const [typed, setTyped] = useState<Typed>(EMPTY);
  const [chosenMeal, setChosenMeal] = useState<MealKind | null>(null);
  const [saving, setSaving] = useState(false);

  const loaded = settings.status === 'ready' ? settings.value : null;
  const unit = loaded?.['units.energy'] ?? 'kcal';
  const reading = readTyped(typed, unit, currentLocale());
  const meal: MealKind =
    chosenMeal ??
    (loaded ? mealAtInstant(stampForDay(dayKey, openedAt), loaded['meals.times']) : 'other');

  const change = (field: keyof Typed) => (value: string) =>
    setTyped((current) => ({ ...current, [field]: value }));
  const errorOf = (field: NumberField): string | undefined => {
    const key = reading.errors[field];
    return key ? tx(key) : undefined;
  };

  const save = async (): Promise<void> => {
    const draft = reading.draft;
    if (!loaded || !draft || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await diary.logEntry(draft, {
        loggedAt: stampForDay(dayKey, clock.now()),
        meal,
        source: 'manual',
      });
      if (result.kind === 'logged') {
        // The sheet goes; the gate stays shut, so nothing more is logged from it.
        onClose();
        return;
      }
      if (result.kind === 'fastActive') toast.show(tx('log.manual.paused'));
    } catch (error) {
      console.error('Saving a manual entry failed', error);
      toast.show(tx('log.manual.failed'));
    }
    inFlight.current = false;
    setSaving(false);
  };

  const grams = tx('home.unit.g');

  return (
    <Sheet
      open
      title={tx('log.manual.title')}
      onClose={onClose}
      dismissable={false}
      initialFocus={nameRef}
      data-ui="manual"
      leading={
        <Button variant="quiet" data-ui="manual.cancel" onClick={onClose}>
          {tx('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          type="submit"
          form={formId}
          busy={saving}
          disabled={!loaded || reading.draft === null}
          data-ui="manual.save"
        >
          {tx('common.save')}
        </Button>
      }
    >
      {loaded ? (
        <form
          id={formId}
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field
            ref={nameRef}
            label={tx('log.manual.name')}
            placeholder={tx('log.manual.namePlaceholder')}
            value={typed.name}
            onChange={change('name')}
            // The form appears once the settings are read, after the sheet took the focus.
            autoFocus
            autoComplete="off"
            enterKeyHint="next"
            data-ui="manual.name"
          />
          <Field
            label={tx(unit === 'kJ' ? 'log.manual.energy.kJ' : 'log.manual.energy.kcal')}
            unit={tx(unit === 'kJ' ? 'home.unit.kJ' : 'home.unit.kcal')}
            value={typed.energy}
            onChange={change('energy')}
            error={errorOf('energy')}
            inputMode="numeric"
            autoComplete="off"
            data-ui="manual.energy"
          />
          <div className={styles.grid}>
            <Field
              label={tx('log.manual.protein')}
              unit={grams}
              placeholder="0"
              value={typed.protein}
              onChange={change('protein')}
              error={errorOf('protein')}
              inputMode="decimal"
              autoComplete="off"
              data-ui="manual.protein"
            />
            <Field
              label={tx('log.manual.carbs')}
              unit={grams}
              placeholder="0"
              value={typed.carbs}
              onChange={change('carbs')}
              error={errorOf('carbs')}
              inputMode="decimal"
              autoComplete="off"
              data-ui="manual.carbs"
            />
            <Field
              label={tx('log.manual.fat')}
              unit={grams}
              placeholder="0"
              value={typed.fat}
              onChange={change('fat')}
              error={errorOf('fat')}
              inputMode="decimal"
              autoComplete="off"
              data-ui="manual.fat"
            />
            <Field
              label={tx('log.manual.fibre')}
              unit={grams}
              hint={tx('log.manual.fibreHint')}
              value={typed.fibre}
              onChange={change('fibre')}
              error={errorOf('fibre')}
              inputMode="decimal"
              autoComplete="off"
              data-ui="manual.fibre"
            />
          </div>
          <button
            type="button"
            className={styles.mealRow}
            aria-haspopup="dialog"
            data-ui="manual.meal"
            onClick={picker.show}
          >
            <span className={styles.mealLabel}>{tx('log.manual.meal')}</span>{' '}
            <span className={styles.mealValue}>{tx(MEAL_NAME_KEYS[meal])}</span>
            <Icon name="chevronRight" size={18} className={styles.mealChevron} />
          </button>
        </form>
      ) : null}
      <ListPicker
        open={picker.open}
        title={tx('log.manual.mealPicker')}
        options={MEAL_KINDS.map((kind) => ({ value: kind, label: tx(MEAL_NAME_KEYS[kind]) }))}
        value={meal}
        onSelect={setChosenMeal}
        onClose={picker.close}
        data-ui="manual.mealPicker"
      />
    </Sheet>
  );
}
