/**
 * The plan a model returns when it rebuilds the person's daily targets. This reader only maps our
 * reply keys onto the plan check of the goals area (`checkPlan`, R01.2), which owns every rule:
 * ranges, 4/4/9 coherence, the exact fit and plausibility against the formula plan. A refused
 * plan is an unusable answer, so the client tries the standby (D-16.22) and the person's targets
 * stay as they are.
 */
import { checkPlan, type CheckedPlan, type PlanRejection } from '../../domain/goals/planValidator';
import type { Targets } from '../../domain/model';
import { err, type Result } from '../../lib/result';
import type { SingleFailure } from '../errors';
import { isRecord } from './json';

/** The keys of our plan reply. `why` is a short reason the plan screen may show. */
export const PLAN_REPLY_KEYS = {
  kcal: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  why: 'why',
} as const;

/** An unusable plan answer; `rejection` names the check that refused it, when one did. */
export interface PlanReplyFailure extends SingleFailure {
  readonly kind: 'invalidResponse';
  readonly rejection?: PlanRejection;
}

const K = PLAN_REPLY_KEYS;

/**
 * The checked plan for a plan answer already cut out of the model's text (`parseModelJson`),
 * judged against the person's formula plan (`formulaPlan(profile, today)`). `why` becomes the
 * plan's reason.
 */
export function readPlanReply(
  reply: unknown,
  formula: Targets,
): Result<CheckedPlan, PlanReplyFailure> {
  if (!isRecord(reply)) return err({ kind: 'invalidResponse' });
  const checked = checkPlan(
    {
      kcal: reply[K.kcal],
      protein: reply[K.protein],
      carbs: reply[K.carbs],
      fat: reply[K.fat],
      reason: reply[K.why],
    },
    formula,
  );
  return checked.ok ? checked : err({ kind: 'invalidResponse', rejection: checked.error });
}
