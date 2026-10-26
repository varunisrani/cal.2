/**
 * The planning requests (03 §3.11, 01 §3.6): the daily plan, the optional nutrient goals and the
 * fit check. Each sends one of our prompts through the client. The plan and the goals are read
 * inside the client, so a plan the plan rules refuse, or goals with nothing usable, send the
 * standby in (D-16.22); the person's targets and goals are never touched here. The fit check is
 * prose: JSON mode off, served like every request without photos by the text provider when it is
 * on, backed by the text standby.
 */
import type { CheckedPlan } from '../../domain/goals/planValidator';
import { formulaPlan } from '../../domain/goals/formulas';
import type { GoalValues } from '../../domain/nutrients/goalDefaults';
import { err, type Result } from '../../lib/result';
import { complete, type AiDeps } from '../client';
import type { AiFailure, SingleFailure } from '../errors';
import { parseModelJson } from '../parse/json';
import { readNutrientGoals } from '../parse/nutrientGoals';
import { readPlanReply } from '../parse/planReply';
import { fitCheckPrompt, type FitCheckInput } from '../prompts/fitCheck';
import { nutrientGoalsPrompt, type NutrientGoalsPromptInput } from '../prompts/nutrientGoals';
import { planPrompt, type PlanPromptInput } from '../prompts/plan';

/**
 * The daily plan for the profile, with the evidence pack when there is one (none during
 * onboarding). The answer must pass the plan check against the formula plan of the same day
 * (`checkPlan`, R01.2), or the standby is asked.
 */
export function requestPlan(
  input: PlanPromptInput,
  deps: AiDeps,
): Promise<Result<CheckedPlan, AiFailure>> {
  const formula = formulaPlan(input.profile, input.today);
  return complete(
    {
      purpose: 'plan',
      ...planPrompt(input),
      json: true,
      validate: (text) => readJson(text, (reply) => readPlanReply(reply, formula)),
    },
    deps,
  );
}

/**
 * New optional nutrient goals: the person's current goals with the keys the answer gave
 * overwritten (R03.25). The caller saves them; a failure leaves the goals as they are.
 */
export function requestNutrientGoals(
  input: NutrientGoalsPromptInput,
  deps: AiDeps,
): Promise<Result<GoalValues, AiFailure>> {
  return complete(
    {
      purpose: 'nutrientGoals',
      ...nutrientGoalsPrompt(input),
      json: true,
      validate: (text) => readJson(text, (reply) => readNutrientGoals(reply, input.current)),
    },
    deps,
  );
}

/** Whether the meal fits today: a few plain sentences, the answer text trimmed. */
export function fitCheck(input: FitCheckInput, deps: AiDeps): Promise<Result<string, AiFailure>> {
  return complete({ purpose: 'fitCheck', ...fitCheckPrompt(input), json: false }, deps);
}

/** The object in the answer text, then `read` on it. */
function readJson<T>(
  text: string,
  read: (reply: unknown) => Result<T, SingleFailure>,
): Result<T, SingleFailure> {
  const reply = parseModelJson(text);
  return reply.ok ? read(reply.value) : err(reply.error);
}
