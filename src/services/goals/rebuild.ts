// The rebuild (P05-08, 01 §3.6): the person asks their AI for a new plan, built from the profile,
// the formulas and the evidence pack of their own logging. There is no formula plan here: a
// failure leaves every target as it was and says why. A plan that comes back after the person
// changed anything in the profile, or an input switch, is dropped (R01.4). A stored plan clears
// every lock, becomes the rebuild baseline (the "inputs changed" nudge goes away) and, while the
// weekly tune-up is on, counts as this week's check (R01.5). The optional nutrient goals are asked
// for again afterwards; their failure keeps the goals the person has. One rebuild at a time.

import { plan as tuneUpDecision } from '../../domain/adaptive/cadence';
import type { DayKey } from '../../domain/dates/dayKey';
import type { Profile, Targets } from '../../domain/model';
import { GOAL_KEYS } from '../../domain/nutrients/catalogue';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import { planInputsKey } from '../../domain/profile/signature';
import type { AiFailure } from '../../ai/errors';
import type { DisplayUnits } from '../../ai/prompts/shared';
import { requestNutrientGoals } from '../../ai/tasks/planning';
import {
  aiDepsOf,
  preparePlanRequest,
  readSwitches,
  readTuneUpState,
  replaceIfUnchanged,
  sameSwitches,
  sendPlanRequest,
  todayOf,
  withPlan,
  type PlanServiceDeps,
} from './planRequest';

/** What the follow-up request did to the optional nutrient goals. */
export type NutrientGoalsRefresh = 'refreshed' | 'kept';

export type RebuildOutcome =
  /** The new plan is stored: all four targets, no locks, the new baseline. */
  | {
      readonly kind: 'rebuilt';
      /** The new daily target in kcal; the page shows it in the person's energy unit. */
      readonly kcal: number;
      /** The AI's short why, when it gave one. */
      readonly reason?: string;
      readonly nutrientGoals: NutrientGoalsRefresh;
    }
  /** The AI gave no usable plan (any failure kind); nothing changed. */
  | { readonly kind: 'failed'; readonly failure: AiFailure }
  /** The profile or an input switch changed while the request ran; the plan was dropped. */
  | { readonly kind: 'dropped' }
  /** No readable profile is stored; nothing was sent. */
  | { readonly kind: 'noProfile' }
  /** A rebuild was already running; this call did nothing. */
  | { readonly kind: 'busy' };

export interface RebuildService {
  /** Asks the AI for a new plan and stores it when it is still wanted. Storage failures reject. */
  rebuild(): Promise<RebuildOutcome>;
}

const DROPPED = { kind: 'dropped' } as const;
const NO_PROFILE = { kind: 'noProfile' } as const;
const BUSY = { kind: 'busy' } as const;

function sameGoals(a: Readonly<GoalValues>, b: Readonly<GoalValues>): boolean {
  return GOAL_KEYS.every((key) => a[key] === b[key]);
}

export function createRebuildService(deps: PlanServiceDeps): RebuildService {
  const { settingsRepo } = deps;
  let busy = false;

  /** While the tune-up is on, a stored rebuild is this week's check (the reducer decides). */
  async function markTuneUpChecked(today: DayKey): Promise<void> {
    const state = await readTuneUpState(deps);
    const decision = tuneUpDecision(state, 'manualRebuildDone', {
      today,
      ready: true,
      running: false,
    });
    if (decision.kind === 'markChecked') {
      await settingsRepo.set('tuneUp.lastCheckDay', decision.state.lastCheckDay);
    }
  }

  /**
   * New optional goals for the new plan. Written only over the goals the request was built from,
   * so goals the person edited meanwhile stay theirs.
   */
  async function refreshNutrientGoals(
    profile: Profile,
    targets: Targets,
    today: DayKey,
    units: DisplayUnits,
  ): Promise<NutrientGoalsRefresh> {
    const current = await settingsRepo.get('goals.nutrients');
    const reply = await requestNutrientGoals(
      { profile, today, units, targets, current },
      await aiDepsOf(deps),
    );
    if (!reply.ok) return 'kept';
    let written = false;
    await settingsRepo.update('goals.nutrients', (stored) => {
      if (!sameGoals(stored, current)) return stored;
      written = true;
      return reply.value;
    });
    return written ? 'refreshed' : 'kept';
  }

  async function run(): Promise<RebuildOutcome> {
    const today = todayOf(deps);
    const read = await deps.profileRepo.get();
    if (read.kind !== 'ok') return NO_PROFILE;
    const profile = read.value;
    const switches = await readSwitches(deps);

    const input = await preparePlanRequest(deps, profile, today);
    if (!sameSwitches(switches, await readSwitches(deps))) return DROPPED;
    const reply = await sendPlanRequest(deps, input);
    if (!sameSwitches(switches, await readSwitches(deps))) return DROPPED;
    if (!reply.ok) return { kind: 'failed', failure: reply.error };

    const { kcal, protein, carbs, fat, reason } = reply.value;
    const next = withPlan(profile, { kcal, protein, carbs, fat });
    if (!(await replaceIfUnchanged(deps, profile, next))) return DROPPED;
    await settingsRepo.set('goals.rebuildBaseline', planInputsKey(next));
    // Before the goals request, which can take a while: an app reopen meanwhile must not start
    // a tune-up for the same data.
    await markTuneUpChecked(today);
    const nutrientGoals = await refreshNutrientGoals(
      next,
      { kcal, protein, carbs, fat },
      today,
      input.units,
    );
    return { kind: 'rebuilt', kcal, reason, nutrientGoals };
  }

  return {
    async rebuild() {
      if (busy) return BUSY;
      // Taken before the first await, so a second tap in the same tick is turned away.
      busy = true;
      try {
        return await run();
      } finally {
        busy = false;
      }
    },
  };
}
