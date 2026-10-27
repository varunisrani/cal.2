import type { DiaryEntry, Targets } from '../../domain/model';
import type { PillarKey } from '../../domain/nutrients/catalogue';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Gauge } from '../../ui/Gauge';
import { NO_TARGETS, type WaterDay } from './dayNutrients';
import { energyAmount } from './energy';
import styles from './home.module.css';
import { PillarRow } from './PillarRow';
import { tx } from './text';

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

export interface DaySummaryProps {
  /** The day's entries. */
  readonly entries: readonly DiaryEntry[];
  /** The targets in effect, or null without a readable profile (then no energy or macro goal). */
  readonly targets: Targets | null;
  /** The optional nutrient goals (setting `goals.nutrients`). */
  readonly goals: Readonly<GoalValues>;
  readonly energyUnit: EnergyDisplayUnit;
  /** The chosen pillars (setting `home.pillars`). */
  readonly pillars: readonly PillarKey[];
  /** The day's water, or null while water tracking is off. */
  readonly water: WaterDay | null;
  /** "All nutrients": opens the day's nutrient sheet. */
  readonly onShowAll: () => void;
  /**
   * The burn counted in the energy target (P11-04): `targets` already holds goal + burn, and a
   * line under the gauge says so. None while Health Connect's burn is not counted.
   */
  readonly burn?: { readonly goalKcal: number; readonly burnedKcal: number } | null;
}

/**
 * The top of Home for one day: the energy gauge (headed Calories or Kilojoules), with the counted
 * burn under it on the Android app, the chosen pillars with water after them, and the link to
 * every nutrient of the day.
 */
export function DaySummary({
  entries,
  targets,
  goals,
  energyUnit,
  pillars,
  water,
  onShowAll,
  burn = null,
}: DaySummaryProps) {
  const eaten = entries.reduce((sum, entry) => sum + entry.kcal, 0);
  const plan = targets ?? NO_TARGETS;

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
      {burn === null ? null : (
        <p className={styles.burn} data-ui="home.burn">
          {tx('health.home.budget', {
            goal: energyAmount(burn.goalKcal, energyUnit),
            burned: energyAmount(burn.burnedKcal, energyUnit),
          })}
        </p>
      )}
      <PillarRow entries={entries} pillars={pillars} targets={plan} goals={goals} water={water} />
      <Button
        variant="quiet"
        className={styles.allNutrients}
        data-ui="home.allNutrients"
        onClick={onShowAll}
      >
        {tx('home.nutrients.link')}
      </Button>
    </Card>
  );
}
