import { useMemo, useState } from 'react';
import { useSheet } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import { KCAL_PER_GRAM } from '../../../domain/goals/formulas';
import {
  carbsWheel,
  PLAN_WHEELS,
  wheelStart,
  type PlanField,
} from '../../../domain/goals/planEdit';
import { MACRO_KEYS, type MacroKey, type Targets } from '../../../domain/model';
import {
  ENERGY_GOAL_WHEEL,
  formatEnergy,
  pickerSave,
  toDisplay,
  type EnergyDisplayUnit,
} from '../../../domain/units/energy';
import type { WheelRange } from '../../../domain/units/numbers';
import { formatInt } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t, type TKey } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Sheet } from '../../../ui/Sheet';
import { Wheel, type WheelOption } from '../../../ui/Wheel';
import { MethodsPage } from '../../about/MethodsPage';
import styles from '../onboarding.module.css';
import own from './planReady.module.css';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

/** Plans under this many kcal a day get the see-a-doctor card. The formulas have no floor. */
export const LOW_PLAN_KCAL = 1_200;

/** The sheets Plan ready opens over the wizard, so Back closes them first. */
export const PLAN_EDIT_SHEET = 'plan-edit';
export const METHODS_SHEET = 'methods';

const SETTINGS = ['units.energy'] as const;

const MACRO_LABELS: Readonly<Record<MacroKey, TKey>> = {
  protein: 'onboarding.planReady.macro.protein',
  carbs: 'onboarding.planReady.macro.carbs',
  fat: 'onboarding.planReady.macro.fat',
};

const EDIT_TITLES: Readonly<Record<MacroKey, TKey>> = {
  protein: 'onboarding.planReady.edit.protein',
  carbs: 'onboarding.planReady.edit.carbs',
  fat: 'onboarding.planReady.edit.fat',
};

const ENERGY_KEYS: Readonly<
  Record<EnergyDisplayUnit, { caption: TKey; title: TKey; unit: TKey; amount: TKey }>
> = {
  kcal: {
    caption: 'onboarding.planReady.energyCaption.kcal',
    title: 'onboarding.planReady.edit.kcal',
    unit: 'onboarding.planReady.unit.kcal',
    amount: 'onboarding.planReady.amount.kcal',
  },
  kJ: {
    caption: 'onboarding.planReady.energyCaption.kJ',
    title: 'onboarding.planReady.edit.kJ',
    unit: 'onboarding.planReady.unit.kJ',
    amount: 'onboarding.planReady.amount.kJ',
  },
};

/** "2,452 kcal" / "10,259 kJ": a kcal amount written in the person's unit. */
function energyAmount(kcal: number, unit: EnergyDisplayUnit): string {
  return t(ENERGY_KEYS[unit].amount, { amount: formatEnergy(kcal, unit, currentLocale()) });
}

/** The energy protein and fat hold on their own, which a kcal edit leaves in place. */
function proteinAndFatKcal(plan: Targets): number {
  return plan.protein * KCAL_PER_GRAM.protein + plan.fat * KCAL_PER_GRAM.fat;
}

/** A plan value's wheel, in the unit it is shown in, and the end that keeps the plan adding up. */
export interface PlanWheel {
  readonly range: WheelRange;
  /** The end the plan's other values hold in place, or null when only the Settings range does. */
  readonly held: 'min' | 'max' | null;
}

/**
 * The wheel for `field` on `plan` (D-16.12 ranges), narrowed so the four values keep adding up
 * (R01.7): kcal cannot go below what protein and fat alone hold, protein and fat stop where carbs
 * would fall under 0, and carbs stop where kcal would pass 6 000 (`carbsWheel`). Kcal is shown in
 * kcal or on the kJ goal wheel.
 */
export function planWheel(field: PlanField, plan: Targets, unit: EnergyDisplayUnit): PlanWheel {
  if (field === 'kcal') {
    const base = ENERGY_GOAL_WHEEL[unit];
    const floor = Math.ceil(toDisplay(proteinAndFatKcal(plan), unit) / base.step) * base.step;
    const min = Math.min(base.max, Math.max(base.min, floor));
    return { range: { ...base, min }, held: min > base.min ? 'min' : null };
  }
  if (field === 'carbs') return { range: carbsWheel(plan), held: null };
  const base = PLAN_WHEELS[field];
  const other = field === 'protein' ? 'fat' : 'protein';
  const room = (plan.kcal - plan[other] * KCAL_PER_GRAM[other]) / KCAL_PER_GRAM[field];
  const max = Math.max(base.min, Math.min(base.max, Math.floor(room / base.step) * base.step));
  return { range: { ...base, max }, held: max < base.max ? 'max' : null };
}

/** The rows of a wheel from `min` to `max` in `step`s, grouped the locale's way ("6,000"). */
function wheelOptions(min: number, max: number, step: number): WheelOption<number>[] {
  const locale = currentLocale();
  const options: WheelOption<number>[] = [];
  for (let value = min; value <= max; value += step) {
    options.push({ value, label: formatInt(value, locale) });
  }
  return options;
}

interface PlanEditorProps {
  readonly field: PlanField;
  readonly plan: Targets;
  readonly unit: EnergyDisplayUnit;
  /** Receives kcal for the energy target, grams for a macro. */
  readonly onSave: (value: number) => void;
  readonly onClose: () => void;
}

/**
 * One value's wheel in a sheet. Saving a wheel that was not moved changes nothing: it opened on a
 * value snapped onto its steps, and storing that would move an exact value (an AI's 2 452 kcal,
 * or a kJ reader's kcal, R06.20).
 */
function PlanEditor({ field, plan, unit, onSave, onClose }: PlanEditorProps) {
  const { range, held } = planWheel(field, plan, unit);
  const shown = field === 'kcal' ? toDisplay(plan.kcal, unit) : plan[field];
  const start = wheelStart(range, shown);
  const [picked, setPicked] = useState(start);
  const { min, max, step } = range;
  const options = useMemo(() => wheelOptions(min, max, step), [min, max, step]);

  const title = t(field === 'kcal' ? ENERGY_KEYS[unit].title : EDIT_TITLES[field]);
  const unitWord = t(field === 'kcal' ? ENERGY_KEYS[unit].unit : 'onboarding.planReady.unit.g');
  const atHeldEnd = (held === 'min' && picked === min) || (held === 'max' && picked === max);

  const save = (): void => {
    if (picked === start) {
      onClose();
      return;
    }
    onSave(field === 'kcal' ? pickerSave(picked, start, plan.kcal, unit) : picked);
  };

  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      data-ui="wizard.plan.edit"
      leading={
        <Button variant="quiet" data-ui="wizard.plan.edit.cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
      trailing={
        <Button variant="primary" data-ui="wizard.plan.edit.save" onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <div className={own.editor}>
        <div className={styles.wheels}>
          <Wheel
            label={title}
            options={options}
            value={picked}
            onChange={setPicked}
            data-ui="wizard.plan.edit.wheel"
          />
          <span className={styles.wheelUnit} aria-hidden="true">
            {unitWord}
          </span>
        </div>
        {atHeldEnd ? (
          <p className={styles.note} data-ui="wizard.plan.edit.held">
            {held === 'min'
              ? t('onboarding.planReady.edit.lowest', {
                  amount: energyAmount(proteinAndFatKcal(plan), unit),
                })
              : t('onboarding.planReady.edit.highest')}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * Step 12: the plan Building plan produced. The energy target is one big number in the person's
 * unit and protein, carbs and fat are three cards; tapping any of them opens its wheel, and a
 * change goes through `planEdit`, so calories and macros keep adding up and the plan is marked
 * edited (R01.7). Notes say how the weekly tune-up treats the plan and when the formulas stood
 * in for the AI (D-16.14); under 1 200 kcal a card suggests a doctor. "How is this calculated?"
 * opens the methods page in a sheet, and the last button finishes onboarding.
 */
export function PlanReady({ state, dispatch }: StepProps) {
  const settings = useSettings(SETTINGS);
  const editSheet = useSheet(PLAN_EDIT_SHEET);
  const methodsSheet = useSheet(METHODS_SHEET);
  const [editing, setEditing] = useState<PlanField>('kcal');

  // Wait for the energy unit so a kJ reader never sees kcal first; an unreadable setting is kcal.
  const unit: EnergyDisplayUnit | null =
    settings.status === 'ready'
      ? settings.value['units.energy']
      : settings.status === 'error'
        ? 'kcal'
        : null;
  const built = state.plan;

  const header = (
    <StepHeader
      title={t('onboarding.planReady.title')}
      subtitle={t('onboarding.planReady.subtitle')}
    />
  );
  if (built === null || unit === null) return header;

  const { plan, touched } = built.draft;
  const edit = (field: PlanField): void => {
    setEditing(field);
    editSheet.show();
  };

  return (
    <>
      {header}
      <button
        type="button"
        className={own.energy}
        data-ui="wizard.plan.kcal"
        onClick={() => edit('kcal')}
      >
        <span className={own.energyValue}>{formatEnergy(plan.kcal, unit, currentLocale())}</span>{' '}
        <span className={own.energyCaption}>{t(ENERGY_KEYS[unit].caption)}</span>
      </button>
      <div className={own.macros}>
        {MACRO_KEYS.map((macro) => (
          <button
            key={macro}
            type="button"
            className={own.macro}
            data-ui={`wizard.plan.${macro}`}
            onClick={() => edit(macro)}
          >
            <span className={own.macroLabel}>{t(MACRO_LABELS[macro])}</span>{' '}
            <span className={own.macroValue}>
              {t('onboarding.planReady.grams', { amount: plan[macro] })}
            </span>
          </button>
        ))}
      </div>
      {plan.kcal < LOW_PLAN_KCAL ? (
        <Card className={own.warning} data-ui="wizard.plan.low">
          <Icon name="info" size={20} className={own.warningIcon} />
          <div className={own.warningText}>
            <p className={own.warningTitle}>{t('onboarding.planReady.low.title')}</p>
            <p className={styles.note}>
              {t('onboarding.planReady.low.body', { amount: energyAmount(LOW_PLAN_KCAL, unit) })}
            </p>
          </div>
        </Card>
      ) : null}
      {built.aiUnavailable ? (
        <p className={styles.note} data-ui="wizard.plan.aiUnavailable">
          {t('onboarding.planReady.aiUnavailable')}
        </p>
      ) : null}
      <p className={styles.note} data-ui="wizard.plan.tuneUp">
        {t(touched ? 'onboarding.planReady.tuneUpEdited' : 'onboarding.planReady.tuneUp')}
      </p>
      <div className={own.actions}>
        <Button variant="quiet" data-ui="wizard.plan.methods" onClick={methodsSheet.show}>
          {t('onboarding.planReady.methods')}
        </Button>
        <Button
          variant="primary"
          block
          disabled={state.finished}
          data-ui="wizard.plan.finish"
          onClick={() => dispatch({ type: 'finish' })}
        >
          {t('onboarding.planReady.finish')}
        </Button>
      </div>

      {editSheet.open ? (
        <PlanEditor
          key={editing}
          field={editing}
          plan={plan}
          unit={unit}
          onSave={(value) => {
            dispatch({ type: 'planEdit', field: editing, value });
            editSheet.close();
          }}
          onClose={editSheet.close}
        />
      ) : null}
      <Sheet
        open={methodsSheet.open}
        title={t('about.methods.title')}
        onClose={methodsSheet.close}
        data-ui="wizard.plan.methodsSheet"
      >
        <MethodsPage headingLevel={3} />
      </Sheet>
    </>
  );
}
