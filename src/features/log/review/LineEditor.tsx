import { useState } from 'react';
import type { IngredientLine } from '../../../domain/model';
import {
  rescaleLine,
  toLine,
  validateLine,
  type LineFields,
  type LinePortion,
} from '../../../domain/servings/ingredients';
import { toDisplay, typedKcal, type EnergyDisplayUnit } from '../../../domain/units/energy';
import { formatMacro, formatQuantity, parseDecimal } from '../../../domain/units/numbers';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Sheet } from '../../../ui/Sheet';
import styles from './ingredients.module.css';

/** The fields that hold numbers; energy is in the person's unit on screen, kcal underneath. */
type NumberField = 'grams' | 'energy' | 'protein' | 'carbs' | 'fat';

/** Text the editor wrote into a field and the exact number it stands for (grams or kcal). */
interface Written {
  readonly text: string;
  readonly value: number;
}

interface Form {
  readonly name: string;
  /** What each field shows, typed or written. */
  readonly texts: Readonly<Record<NumberField, string>>;
  readonly written: Readonly<Record<NumberField, Written>>;
  /** What a weight change scales from: unrounded, kcal for energy. */
  readonly baseline: LinePortion;
}

const VALUE_FIELDS = ['protein', 'carbs', 'fat'] as const;

/** A new part: 100 g with nothing in it yet. */
const NEW_PART: LinePortion = { grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0 };

function portionOfLine(line: IngredientLine): LinePortion {
  const { grams, kcal, protein, carbs, fat } = line;
  return { grams, kcal, protein, carbs, fat };
}

/** The fields for a portion: an unknown weight (0 g) leaves the weight empty. */
function writtenFor(portion: LinePortion, unit: EnergyDisplayUnit): Record<NumberField, Written> {
  return {
    grams: { text: portion.grams > 0 ? formatQuantity(portion.grams) : '', value: portion.grams },
    energy: { text: String(toDisplay(portion.kcal, unit)), value: portion.kcal },
    protein: { text: formatMacro(portion.protein), value: portion.protein },
    carbs: { text: formatMacro(portion.carbs), value: portion.carbs },
    fat: { text: formatMacro(portion.fat), value: portion.fat },
  };
}

function textsOf(written: Record<NumberField, Written>): Record<NumberField, string> {
  return {
    grams: written.grams.text,
    energy: written.energy.text,
    protein: written.protein.text,
    carbs: written.carbs.text,
    fat: written.fat.text,
  };
}

function formFor(line: IngredientLine | null, unit: EnergyDisplayUnit): Form {
  const portion = line ? portionOfLine(line) : NEW_PART;
  const written = writtenFor(portion, unit);
  return { name: line?.name ?? '', texts: textsOf(written), written, baseline: portion };
}

/**
 * A field's number: exactly what the editor wrote while the text is unchanged, else the typed
 * text read in the locale (energy in the person's unit, turned into kcal); null when it does not
 * read.
 */
function valueOf(form: Form, field: NumberField, unit: EnergyDisplayUnit): number | null {
  const text = form.texts[field];
  if (text === form.written[field].text) return form.written[field].value;
  const locale = currentLocale();
  return field === 'energy' ? typedKcal(text, unit, locale) : parseDecimal(text, locale);
}

function fieldsOf(form: Form, unit: EnergyDisplayUnit): LineFields {
  return {
    name: form.name,
    grams: valueOf(form, 'grams', unit),
    kcal: valueOf(form, 'energy', unit),
    protein: valueOf(form, 'protein', unit),
    carbs: valueOf(form, 'carbs', unit),
    fat: valueOf(form, 'fat', unit),
  };
}

/** The numbers on screen as a portion; null while one does not read or the weight is not > 0. */
function shownPortion(form: Form, unit: EnergyDisplayUnit): LinePortion | null {
  const { grams, kcal, protein, carbs, fat } = fieldsOf(form, unit);
  if (grams === null || !(grams > 0) || kcal === null || kcal < 0) return null;
  if (protein === null || carbs === null || fat === null) return null;
  if (protein < 0 || carbs < 0 || fat < 0) return null;
  return { grams, kcal, protein, carbs, fat };
}

/** The form after the weight is typed: the values rescale from the baseline (02 §3.15). */
function withWeight(form: Form, text: string, unit: EnergyDisplayUnit): Form {
  const typed: Form = { ...form, texts: { ...form.texts, grams: text } };
  const grams = parseDecimal(text, currentLocale());
  if (grams === null || !(grams > 0)) return typed;
  if (!(form.baseline.grams > 0)) {
    // Nothing to scale from (an unknown weight): the values as they stand belong to this weight.
    return { ...typed, baseline: shownPortion(typed, unit) ?? form.baseline };
  }
  const scaled = rescaleLine(form.baseline, grams);
  if (!scaled) return typed;
  const fresh = writtenFor(scaled, unit);
  const written = { ...form.written, energy: fresh.energy };
  const texts = { ...typed.texts, energy: fresh.energy.text };
  for (const field of VALUE_FIELDS) {
    written[field] = fresh[field];
    texts[field] = fresh[field].text;
  }
  return { ...typed, texts, written };
}

/** The form after a value is typed: the numbers on screen become the baseline once they read. */
function withValue(
  form: Form,
  field: Exclude<NumberField, 'grams'>,
  text: string,
  unit: EnergyDisplayUnit,
): Form {
  const typed: Form = { ...form, texts: { ...form.texts, [field]: text } };
  return { ...typed, baseline: shownPortion(typed, unit) ?? form.baseline };
}

export interface LineEditorProps {
  readonly open: boolean;
  /** The part as the sheet shows it; null adds a new one. */
  readonly line: IngredientLine | null;
  readonly energyUnit: EnergyDisplayUnit;
  readonly onSave: (line: IngredientLine) => void;
  /** Removes the part; offered for an existing one only. */
  readonly onRemove?: () => void;
  /** After Cancel, Save and Remove. */
  readonly onClose: () => void;
}

/**
 * One part of the meal (02 §3.15): name, weight, energy in the person's unit, protein, carbs and
 * fat. Save is on while the domain's check passes (`validateLine`). A new weight rescales energy
 * and macros from an unrounded baseline, so 1, 15, 150 g never drift; a typed value makes the
 * numbers on screen the new baseline. A value left as the editor wrote it is saved exactly, so
 * opening a part and saving it unchanged changes nothing. Renders nothing while closed.
 */
export function LineEditor(props: LineEditorProps) {
  return props.open ? <OpenLineEditor {...props} /> : null;
}

function OpenLineEditor({ line, energyUnit, onSave, onRemove, onClose }: LineEditorProps) {
  const [form, setForm] = useState(() => formFor(line, energyUnit));
  const fields = fieldsOf(form, energyUnit);
  const valid = validateLine(fields).length === 0;

  const save = (): void => {
    const saved = toLine(fields, line ?? { photoIds: [] });
    if (!saved) return;
    onSave(saved);
    onClose();
  };

  const remove = (): void => {
    onRemove?.();
    onClose();
  };

  const gramWord = t('review.unit.g');
  return (
    <Sheet
      open
      title={t(line ? 'ingredients.editor.edit' : 'ingredients.editor.add')}
      onClose={onClose}
      dismissable={false}
      data-ui="ingredients.editor"
      leading={
        <Button variant="quiet" onClick={onClose} data-ui="ingredients.editor.cancel">
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={!valid}
          onClick={save}
          data-ui="ingredients.editor.save"
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.form}>
        <Field
          label={t('ingredients.editor.name')}
          value={form.name}
          onChange={(name) => setForm((current) => ({ ...current, name }))}
          autoComplete="off"
          enterKeyHint="next"
          data-ui="ingredients.editor.name"
        />
        <Field
          label={t('ingredients.editor.weight')}
          value={form.texts.grams}
          onChange={(text) => setForm((current) => withWeight(current, text, energyUnit))}
          unit={gramWord}
          inputMode="decimal"
          autoComplete="off"
          data-ui="ingredients.editor.grams"
        />
        <Field
          label={t(
            energyUnit === 'kJ' ? 'ingredients.editor.energy.kJ' : 'ingredients.editor.energy.kcal',
          )}
          value={form.texts.energy}
          onChange={(text) => setForm((current) => withValue(current, 'energy', text, energyUnit))}
          unit={t(energyUnit === 'kJ' ? 'review.unit.kJ' : 'review.unit.kcal')}
          inputMode="decimal"
          autoComplete="off"
          data-ui="ingredients.editor.energy"
        />
        {VALUE_FIELDS.map((field) => (
          <Field
            key={field}
            label={t(`ingredients.editor.${field}`)}
            value={form.texts[field]}
            onChange={(text) => setForm((current) => withValue(current, field, text, energyUnit))}
            unit={gramWord}
            inputMode="decimal"
            autoComplete="off"
            data-ui={`ingredients.editor.${field}`}
          />
        ))}
        {line && onRemove ? (
          <Button variant="danger" onClick={remove} data-ui="ingredients.editor.remove">
            {t('ingredients.editor.remove')}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
