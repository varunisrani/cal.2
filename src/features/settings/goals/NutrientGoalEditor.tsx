import { useMemo, useState } from 'react';
import { unitOf, type GoalKey } from '../../../domain/nutrients/catalogue';
import {
  filterGoalText,
  GOAL_SPECS,
  GOAL_VALUE_MAX,
  goalFromText,
  goalWheelStart,
  isAboveUpperHint,
  isWheelValue,
  vitaminDIu,
} from '../../../domain/nutrients/goalDefaults';
import { formatDecimal, formatInt } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Sheet } from '../../../ui/Sheet';
import { Wheel } from '../../../ui/Wheel';
import styles from './goals.module.css';
import { wheelOptions } from './wheelOptions';

export interface NutrientGoalEditorProps {
  readonly goalKey: GoalKey;
  /** The stored goal, in the nutrient's storage unit. */
  readonly value: number;
  /** Receives the goal to store; a promise keeps Save busy until it settles. */
  readonly onSave: (value: number) => unknown;
  readonly onClose: () => void;
}

/** "2,345 mg": an amount in the nutrient's unit (a stored fraction keeps two decimals). */
export function goalAmount(key: GoalKey, value: number): string {
  return t(`goals.nutrients.amount.${unitOf(key)}`, {
    amount: formatDecimal(value, 2, currentLocale()),
  });
}

/**
 * One optional goal's editor (01 §3.11, Proposed D-16.57): the nutrient's wheel, or a typing mode
 * for any whole number (digits only, at most 7) that opens by itself when the stored goal is not
 * on the wheel. A typed goal is clamped to 0–999 999 and never moved onto the wheel's steps.
 * Under the value, vitamin D also reads in IU, and a goal over the general adult upper limit gets
 * a word of caution that does not block saving. Saving the stored goal unchanged writes nothing.
 */
export function NutrientGoalEditor({ goalKey, value, onSave, onClose }: NutrientGoalEditorProps) {
  const spec = GOAL_SPECS[goalKey];
  const name = t(`goals.nutrients.name.${goalKey}`);
  const unitWord = t(`goals.nutrients.unit.${unitOf(goalKey)}`);
  const locale = currentLocale();

  // A stored goal with a fraction (kept by the decoder) shows as it is until the person types.
  const storedText = String(value);
  const [typing, setTyping] = useState(() => !isWheelValue(goalKey, value));
  const [picked, setPicked] = useState(() => goalWheelStart(goalKey, value));
  const [text, setText] = useState(storedText);
  const options = useMemo(() => wheelOptions(spec.wheel, locale), [spec.wheel, locale]);

  const untouchedText = text === storedText;
  const shown: number | null = typing ? (untouchedText ? value : goalFromText(text)) : picked;
  const overMax = typing && !untouchedText && text !== '' && Number(text) > GOAL_VALUE_MAX;

  const switchMode = (): void => {
    if (typing) {
      setPicked(goalWheelStart(goalKey, shown ?? value));
      setTyping(false);
    } else {
      setText(String(picked));
      setTyping(true);
    }
  };

  const save = (): unknown => {
    if (shown === null) return undefined;
    if (shown === value) {
      onClose();
      return undefined;
    }
    return onSave(shown);
  };

  return (
    <Sheet
      open
      title={name}
      onClose={onClose}
      data-ui="goals.nutrient"
      leading={
        <Button variant="quiet" data-ui="goals.nutrient.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button
          variant="primary"
          disabled={shown === null}
          data-ui="goals.nutrient.save"
          onClick={save}
        >
          {t('common.save')}
        </Button>
      }
    >
      <div className={styles.editor}>
        <p className={styles.note}>{t(`goals.nutrients.kindLine.${spec.kind}`)}</p>
        {typing ? (
          <Field
            label={name}
            value={text}
            onChange={(raw) => setText(filterGoalText(raw))}
            inputMode="numeric"
            autoComplete="off"
            unit={unitWord}
            error={text === '' ? t('goals.nutrients.editor.empty') : undefined}
            hint={
              overMax
                ? t('goals.nutrients.editor.tooLarge', { max: formatInt(GOAL_VALUE_MAX, locale) })
                : undefined
            }
            data-ui="goals.nutrient.field"
          />
        ) : (
          <div className={styles.wheels}>
            <Wheel
              label={name}
              options={options}
              value={picked}
              onChange={setPicked}
              data-ui="goals.nutrient.wheel"
            />
            <span className={styles.wheelUnit} aria-hidden="true">
              {unitWord}
            </span>
          </div>
        )}
        {goalKey === 'vitaminD' && shown !== null ? (
          <p className={styles.detail} data-ui="goals.nutrient.iu">
            {t('goals.nutrients.iu', { amount: formatInt(vitaminDIu(shown), locale) })}
          </p>
        ) : null}
        {shown !== null && spec.upperHint !== undefined && isAboveUpperHint(goalKey, shown) ? (
          <p className={styles.caution} data-ui="goals.nutrient.upper">
            {t('goals.nutrients.editor.upper', { limit: goalAmount(goalKey, spec.upperHint) })}
          </p>
        ) : null}
        <Button variant="quiet" block data-ui="goals.nutrient.mode" onClick={switchMode}>
          {t(typing ? 'goals.nutrients.editor.useWheel' : 'goals.nutrients.editor.typeAmount')}
        </Button>
      </div>
    </Sheet>
  );
}
