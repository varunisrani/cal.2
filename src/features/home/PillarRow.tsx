import type { DiaryEntry, Targets } from '../../domain/model';
import { unitOf, type PillarKey } from '../../domain/nutrients/catalogue';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import { MAX_PILLARS, pillarGoal } from '../../domain/nutrients/pillars';
import { Pillar } from '../../ui/Pillar';
import {
  amountText,
  dayTotal,
  nutrientName,
  shownTotal,
  shownWater,
  statusLine,
  type WaterDay,
} from './dayNutrients';
import styles from './home.module.css';
import { tx } from './text';

export interface PillarRowProps {
  /** The day's food entries; water and fasts never count here (R05.4). */
  readonly entries: readonly DiaryEntry[];
  /** The chosen pillars in the order they were picked (setting `home.pillars`). */
  readonly pillars: readonly PillarKey[];
  /** The targets in effect: protein, carbs and fat fill toward these. */
  readonly targets: Targets;
  /** The optional nutrient goals: every other pillar fills toward its own. */
  readonly goals: Readonly<GoalValues>;
  /** The day's water against its goal, or null while water tracking is off. */
  readonly water: WaterDay | null;
}

/**
 * The pillars under the gauge (05 §3.2.3): the one to four chosen nutrients in their order, then
 * water while it is tracked. Each shows the day's total (one decimal only when not whole), a tube
 * toward the goal and a line in the nutrient's unit: left, over, reached, or no goal for 0.
 */
export function PillarRow({ entries, pillars, targets, goals, water }: PillarRowProps) {
  return (
    <div className={styles.pillars} data-ui="home.pillars">
      {pillars.slice(0, MAX_PILLARS).map((key) => {
        const shown = shownTotal(dayTotal(entries, key));
        const goal = pillarGoal(key, targets, goals);
        return (
          <Pillar
            key={key}
            current={shown}
            goal={goal}
            value={amountText(shown)}
            label={nutrientName(key)}
            status={statusLine(shown, goal, unitOf(key))}
            data-ui={`home.pillar.${key}`}
          />
        );
      })}
      {water ? <WaterPillar water={water} /> : null}
    </div>
  );
}

function WaterPillar({ water }: { readonly water: WaterDay }) {
  const { total, goal } = shownWater(water);
  return (
    <Pillar
      current={total}
      goal={goal}
      value={amountText(total)}
      label={tx('home.pillar.water')}
      status={statusLine(total, goal, water.unit)}
      data-ui="home.pillar.water"
    />
  );
}
