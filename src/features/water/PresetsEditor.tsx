import { useState } from 'react';
import {
  amountText,
  DEFAULT_QUICK_ADD_ML,
  filterAmountText,
  quickAddFieldMl,
  quickAddFromFields,
  type WaterDisplayUnit,
} from '../../domain/units/water';
import { currentLocale } from '../../i18n/locale';
import { t } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { maxAmountText } from './amounts';
import styles from './water.module.css';

export interface PresetsEditorProps {
  readonly open: boolean;
  /** The stored quick-add amounts in ml, smallest first: the fields open on them. */
  readonly saved: readonly number[];
  readonly unit: WaterDisplayUnit;
  /** Receives the three amounts to store, smallest first; a promise keeps Save busy. */
  readonly onSave: (amounts: number[]) => unknown;
  /** Cancel, Escape, the scrim: nothing is stored. */
  readonly onClose: () => void;
}

/**
 * The quick-add editor (05 §3.6.2): three amount fields in the person's unit with the field rules
 * of the custom amount. A field that is empty, zero or above 5 000 ml says so, naming the largest
 * amount, and Save stays disabled. A field still showing the text it opened with keeps its exact
 * stored ml, so 250 ml stays 250 through a save in fl oz (R05.10). Reset fills in 250 / 500 /
 * 750 ml, which then count as untouched. Nothing is stored before Save.
 */
export function PresetsEditor(props: PresetsEditorProps) {
  return props.open ? <OpenEditor {...props} /> : null;
}

function textsFor(amounts: readonly number[], unit: WaterDisplayUnit, locale: string): string[] {
  return amounts.map((ml) => amountText(ml, unit, locale));
}

function OpenEditor({ saved, unit, onSave, onClose }: PresetsEditorProps) {
  const locale = currentLocale();
  // The amounts the fields were filled from: the stored ones, or the defaults after Reset.
  const [seeds, setSeeds] = useState<readonly number[]>(saved);
  const [texts, setTexts] = useState<readonly string[]>(() => textsFor(saved, unit, locale));
  const amounts = quickAddFromFields(texts, seeds, unit, locale);

  const fieldError = (index: number): string | undefined => {
    const text = texts[index] ?? '';
    const seed = seeds[index];
    const ml = seed === undefined ? null : quickAddFieldMl(text, seed, unit, locale);
    return ml === null
      ? t('trackers.water.quickAdd.invalid', { max: maxAmountText(unit) })
      : undefined;
  };

  const type = (index: number, raw: string): void => {
    const text = filterAmountText(raw, unit, locale);
    setTexts((current) => current.map((each, at) => (at === index ? text : each)));
  };

  const reset = (): void => {
    setSeeds(DEFAULT_QUICK_ADD_ML);
    setTexts(textsFor(DEFAULT_QUICK_ADD_ML, unit, locale));
  };

  const save = (): unknown => (amounts === null ? undefined : onSave(amounts));

  return (
    <Sheet
      open
      title={t('trackers.water.quickAdd.title')}
      onClose={onClose}
      data-ui="water.quickAdd.editor"
      leading={
        <Button variant="quiet" data-ui="water.quickAdd.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={amounts === null}
          data-ui="water.quickAdd.save"
          onClick={save}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        {texts.map((text, index) => (
          <Field
            // The three fields never move, so the place keys each one.
            key={index}
            label={t('trackers.water.quickAdd.field', { number: index + 1 })}
            value={text}
            onChange={(raw) => type(index, raw)}
            unit={t(`home.unit.${unit}`)}
            inputMode={unit === 'ml' ? 'numeric' : 'decimal'}
            autoComplete="off"
            error={fieldError(index)}
            data-ui={`water.quickAdd.field.${index}`}
          />
        ))}
        <p className={styles.note}>{t('trackers.water.quickAdd.note')}</p>
        <Button variant="quiet" block data-ui="water.quickAdd.reset" onClick={reset}>
          {t('trackers.water.quickAdd.reset')}
        </Button>
      </div>
    </Sheet>
  );
}
