import { isMacroKey, isNutrientKey, type DiaryEntry, type Targets } from '../../domain/model';
import type { PillarKey } from '../../domain/nutrients/catalogue';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import { DEFAULT_PILLARS, pillarGoal } from '../../domain/nutrients/pillars';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { formatDecimal } from '../../i18n/format';
import { Card } from '../../ui/Card';
import { Gauge } from '../../ui/Gauge';
import { Pillar } from '../../ui/Pillar';
import { energyAmount } from './energy';
import styles from './home.module.css';
import { tx, type TxKey } from './text';

/** Goals of a day without a readable profile: nothing to fill toward. */
const NO_TARGETS: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** The names of the pillars Home can show for now; the picker (P07-03) brings the rest. */
const PILLAR_LABELS: Partial<Record<PillarKey, TxKey>> = {
  protein: 'home.pillar.protein',
  carbs: 'home.pillar.carbs',
  fat: 'home.pillar.fat',
  fibre: 'home.pillar.fibre',
};

/** How much of `key` an entry holds; an optional nutrient it does not know counts 0. */
export function amountIn(entry: DiaryEntry, key: PillarKey): number {
  if (isMacroKey(key)) return entry[key];
  if (isNutrientKey(key)) return entry.nutrients[key] ?? 0;
  return entry.extras[key] ?? 0;
}

/** The gauge's line: compared in kcal, the difference shown in the person's unit. */
function gaugeStatus(eatenKcal: number, goalKcal: number, unit: EnergyDisplayUnit): string {
  if (!(goalKcal > 0)) return tx('home.gauge.noGoal');
  if (eatenKcal < goalKcal) {
    return tx('home.gauge.left', { amount: energyAmount(goalKcal - eatenKcal, unit) });
  }
  if (eatenKcal > goalKcal) {
    return tx('home.gauge.over', { amount: energyAmount(eatenKcal - goalKcal, unit) });
  }
  return tx('home.gauge.reached');
}

const grams = (amount: number): string => formatDecimal(amount, 1);

/**
 * A pillar's line. The day's amount is compared as shown (to one decimal), so sums such as
 * 0.1 + 0.2 meet a goal of 0.3 exactly.
 */
function pillarStatus(current: number, goal: number): string {
  if (!(goal > 0)) return tx('home.pillar.noGoal');
  const shown = Math.round(current * 10) / 10;
  if (shown < goal) return tx('home.pillar.left', { amount: grams(goal - shown) });
  if (shown > goal) return tx('home.pillar.over', { amount: grams(shown - goal) });
  return tx('home.pillar.reached');
}

export interface DaySummaryProps {
  /** The day's entries. */
  readonly entries: readonly DiaryEntry[];
  /** The targets in effect, or null without a readable profile (then no energy or macro goal). */
  readonly targets: Targets | null;
  /** The optional nutrient goals (setting `goals.nutrients`). */
  readonly goals: Readonly<GoalValues>;
  readonly energyUnit: EnergyDisplayUnit;
}

/** The top of Home: the energy gauge and the nutrient pillars for one day. */
export function DaySummary({ entries, targets, goals, energyUnit }: DaySummaryProps) {
  const eaten = entries.reduce((sum, entry) => sum + entry.kcal, 0);
  const plan = targets ?? NO_TARGETS;
  const pillars = DEFAULT_PILLARS.flatMap((key) => {
    const label = PILLAR_LABELS[key];
    return label ? [{ key, label }] : [];
  });

  return (
    <Card className={styles.summary} data-ui="home.summary">
      <Gauge
        eaten={eaten}
        goal={plan.kcal}
        heading={tx(energyUnit === 'kJ' ? 'home.gauge.heading.kJ' : 'home.gauge.heading.kcal')}
        value={energyAmount(eaten, energyUnit)}
        status={gaugeStatus(eaten, plan.kcal, energyUnit)}
        data-ui="home.gauge"
      />
      <div className={styles.pillars}>
        {pillars.map(({ key, label }) => {
          const current = entries.reduce((sum, entry) => sum + amountIn(entry, key), 0);
          const goal = pillarGoal(key, plan, goals);
          return (
            <Pillar
              key={key}
              current={current}
              goal={goal}
              value={grams(current)}
              label={tx(label)}
              status={pillarStatus(current, goal)}
              data-ui={`home.pillar.${key}`}
            />
          );
        })}
      </div>
    </Card>
  );
}
