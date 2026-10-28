import { useId, type ReactNode } from 'react';
import type { DayKey } from '../../domain/dates/dayKey';
import { MACRO_KEYS, type DiaryEntry, type Targets } from '../../domain/model';
import { isGoalKey, unitOf, type PillarKey } from '../../domain/nutrients/catalogue';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import { MAX_PILLARS } from '../../domain/nutrients/pillars';
import type { SourceNutrient } from '../../domain/nutrients/sources';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDay, formatNameList } from '../../i18n/format';
import { Icon } from '../../ui/icons';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import {
  amountText,
  amountWithUnit,
  dayTotal,
  DETAIL_ORDER,
  NO_TARGETS,
  nutrientName,
  shownTotal,
  shownWater,
  unitWord,
  type AmountUnit,
  type WaterDay,
} from './dayNutrients';
import { energyAmount, energyText } from './energy';
import styles from './nutrients.module.css';
import { tx } from './text';

export interface DayNutrientsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The day the values are for: Home's selected day. */
  readonly day: DayKey;
  readonly isToday: boolean;
  /** That day's food entries. */
  readonly entries: readonly DiaryEntry[];
  /** The targets in effect, or null without a readable profile (then the macros have no goal). */
  readonly targets: Targets | null;
  /** The optional nutrient goals (setting `goals.nutrients`). */
  readonly goals: Readonly<GoalValues>;
  readonly energyUnit: EnergyDisplayUnit;
  /** The pillars Home shows, named in the first row. */
  readonly pillars: readonly PillarKey[];
  /** The day's water, or null while water tracking is off. */
  readonly water: WaterDay | null;
  /** The first row: opens the pillar picker over the sheet. */
  readonly onChoosePillars: () => void;
  /** The Sugar line is switched on (setting `home.sugarLine`, D-16.98). */
  readonly sugarLine: boolean;
  /** The Sugar on Home switch was turned; the stored value follows. */
  readonly onSugarLineChange: (on: boolean) => void;
  /** A nutrient's row: opens the foods it came from (D-16.105). */
  readonly onOpenSources: (nutrient: SourceNutrient) => void;
  /** The spend line is switched on (setting `home.spendLine`, D-16.108). */
  readonly spendLine: boolean;
  /** The Spending on Home switch was turned; the stored value follows. */
  readonly onSpendLineChange: (on: boolean) => void;
}

/**
 * Every nutrient of Home's selected day (05 §3.2.4): the pillars Home shows (a row that opens
 * the picker), the Sugar on Home switch (D-16.98) and the Spending on Home switch (D-16.108), the
 * water while it is tracked, the energy and macros against the targets, then the
 * optional nutrients and the sports compounds, each with its unit and goal. A detailed total of
 * exactly 0 reads as a dash. Each food nutrient's row opens the foods it came from (D-16.105);
 * water's opens nothing (it is never food).
 */
export function DayNutrientsSheet({ open, onClose, ...day }: DayNutrientsSheetProps) {
  return (
    <Sheet
      open={open}
      title={tx('home.nutrients.title')}
      onClose={onClose}
      data-ui="home.nutrients"
    >
      <SheetBody {...day} />
    </Sheet>
  );
}

type BodyProps = Omit<DayNutrientsSheetProps, 'open' | 'onClose'>;

function SheetBody({
  day,
  isToday,
  entries,
  targets,
  goals,
  energyUnit,
  pillars,
  water,
  onChoosePillars,
  sugarLine,
  onSugarLineChange,
  onOpenSources,
  spendLine,
  onSpendLineChange,
}: BodyProps) {
  const plan = targets ?? NO_TARGETS;
  const kcal = entries.reduce((sum, entry) => sum + entry.kcal, 0);
  const shown = pillars.slice(0, MAX_PILLARS).map(nutrientName);
  if (water) shown.push(tx('home.pillar.water'));
  const names = formatNameList(shown);

  return (
    <div className={styles.body}>
      <p className={styles.day} data-ui="home.nutrients.day">
        {isToday ? tx('home.nutrients.today') : formatDay(day, 'long')}
      </p>

      <Section heading={tx('home.nutrients.pillarsHeading')} ui="home.nutrients.pillars">
        <button
          type="button"
          className={styles.choose}
          data-ui="home.nutrients.choose"
          onClick={onChoosePillars}
        >
          <span className={styles.lineText}>
            <span className={styles.lineLabel}>{tx('home.nutrients.pillarsRow')}</span>{' '}
            <span className={styles.lineSub}>{names}</span>
          </span>
          <Icon name="chevronRight" size={18} className={styles.mark} />
        </button>
        <div className={styles.switch}>
          <Switch
            label={tx('home.nutrients.sugarLine')}
            description={tx('home.nutrients.sugarLineHint')}
            checked={sugarLine}
            onChange={onSugarLineChange}
            data-ui="home.nutrients.sugarLine"
          />
        </div>
        <div className={styles.switch}>
          <Switch
            label={tx('home.nutrients.spendLine')}
            description={tx('home.nutrients.spendLineHint')}
            checked={spendLine}
            onChange={onSpendLineChange}
            data-ui="spending.home.switch"
          />
        </div>
      </Section>

      {water ? (
        <Section heading={tx('home.nutrients.waterHeading')} ui="home.nutrients.water">
          <ul className={styles.lines}>
            <WaterLine water={water} />
          </ul>
          <p className={styles.note}>{tx('home.nutrients.waterNote')}</p>
        </Section>
      ) : null}

      <Section heading={tx('home.nutrients.macrosHeading')} ui="home.nutrients.macros">
        <ul className={styles.lines}>
          <Line
            id="energy"
            label={tx(`home.nutrients.energy.${energyUnit}`)}
            value={energyAmount(kcal, energyUnit)}
            unit={tx(`home.unit.${energyUnit}`)}
            goal={
              plan.kcal > 0
                ? tx('home.nutrients.goal', { amount: energyText(plan.kcal, energyUnit) })
                : tx('home.pillar.noGoal')
            }
            onOpen={() => onOpenSources('kcal')}
          />
          {MACRO_KEYS.map((key) => (
            <Line
              key={key}
              id={key}
              label={nutrientName(key)}
              value={amountText(shownTotal(dayTotal(entries, key)))}
              unit={unitWord('g')}
              goal={goalText(plan[key], 'g')}
              onOpen={() => onOpenSources(key)}
            />
          ))}
        </ul>
      </Section>

      <Section heading={tx('home.nutrients.detailHeading')} ui="home.nutrients.detail">
        <ul className={styles.lines}>
          {DETAIL_ORDER.map((id) => {
            const total = dayTotal(entries, id);
            const unit = unitOf(id);
            // Mono- and polyunsaturated fat are tracked but never get a goal.
            const goal = isGoalKey(id) ? goalText(goals[id], unit) : undefined;
            // Exactly nothing reads as a dash, without a unit.
            const none = total === 0;
            return (
              <Line
                key={id}
                id={id}
                label={nutrientName(id)}
                value={none ? tx('home.nutrients.none') : amountText(total)}
                unit={none ? undefined : unitWord(unit)}
                goal={goal}
                onOpen={() => onOpenSources(id)}
              />
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

/** "/ 2,300 mg", or "No goal" for a goal of 0. */
function goalText(goal: number, unit: AmountUnit): string {
  return goal > 0
    ? tx('home.nutrients.goal', { amount: amountWithUnit(goal, unit) })
    : tx('home.pillar.noGoal');
}

function WaterLine({ water }: { readonly water: WaterDay }) {
  const { total, goal } = shownWater(water);
  return (
    <Line
      id="water"
      label={tx('home.pillar.water')}
      value={amountText(total)}
      unit={unitWord(water.unit)}
      goal={goalText(goal, water.unit)}
    />
  );
}

interface SectionProps {
  readonly heading: string;
  readonly ui: string;
  readonly children: ReactNode;
}

function Section({ heading, ui, children }: SectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.section} data-ui={ui}>
      <h3 id={headingId} className={styles.heading}>
        {heading}
      </h3>
      {children}
    </section>
  );
}

interface LineProps {
  readonly id: string;
  readonly label: string;
  /** The day's amount as shown, or the dash. */
  readonly value: string;
  /** The unit after the amount; none after the dash. */
  readonly unit?: string | undefined;
  /** "/ goal" or "No goal"; none for a nutrient that never has a goal. */
  readonly goal?: string | undefined;
  /** Opens the nutrient's sources; the row is a button then, named by its words. */
  readonly onOpen?: () => void;
}

/** One nutrient: its name, the day's amount with its unit, and the goal after it. */
function Line({ id, label, value, unit, goal, onOpen }: LineProps) {
  const words = (
    <>
      <span className={styles.lineLabel}>{label}</span>{' '}
      <span className={styles.amount}>
        <span className={styles.value}>{value}</span>
        {unit === undefined ? null : (
          <>
            {' '}
            <span className={styles.unit}>{unit}</span>
          </>
        )}
      </span>
      {goal === undefined ? null : (
        <>
          {' '}
          <span className={styles.goal}>{goal}</span>
        </>
      )}
    </>
  );
  if (onOpen === undefined) {
    return (
      <li className={styles.line} data-ui={`home.nutrients.row.${id}`}>
        {words}
      </li>
    );
  }
  return (
    <li data-ui={`home.nutrients.row.${id}`}>
      <button type="button" className={styles.choose} onClick={onOpen}>
        {words}
        <Icon name="chevronRight" size={18} className={styles.mark} />
      </button>
    </li>
  );
}
