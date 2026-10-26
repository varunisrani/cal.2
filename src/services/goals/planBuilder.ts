// The plan Building plan shows (P05-05, 01 §3.4): the person's AI asked for a daily plan from the
// wizard's answers, with no evidence pack, and the formula plan whenever that cannot work. One
// 60 s deadline covers the whole request, retries and standby included (D-16.14); at the cap, on
// any failure, or with no AI set up, the formula plan comes back flagged `aiUnavailable` so Plan
// ready can say so. The builder never rejects, so the step can never hang on it (R01.8).

import { isProviderId, type ProviderId } from '../../ai/catalog/providers';
import { startDeadline, type Deadline } from '../../ai/deadline';
import { missingFor, roleFor, type AiSettings, type ProviderKeys } from '../../ai/settings';
import { requestPlan } from '../../ai/tasks/planning';
import type { DisplayUnits } from '../../ai/prompts/shared';
import type { DayKey } from '../../domain/dates/dayKey';
import { carbsLeft, formulaPlan } from '../../domain/goals/formulas';
import type { Profile, Targets } from '../../domain/model';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import type { SecretsRepo } from '../../data/repos/secretsRepo';
import type { SettingsRepo } from '../../data/repos/settingsRepo';

/** The longest Building plan waits for the AI, all of the request together (D-16.14). */
export const PLAN_CAP_SECONDS = 60;

/** The AI setup as stored: the `ai.settings` row (null until AI is set up) and the keys. */
export interface StoredAiAccess {
  readonly settings: AiSettings | null;
  readonly keys: ProviderKeys;
}

/** What the plan is built for. */
export interface PlanRequest {
  /** The wizard's profile (`wizardProfile`); its saved targets are ignored. */
  readonly profile: Profile;
  /** The local day the plan is for (the age in the formulas). */
  readonly today: DayKey;
  /** The units the person reads height and weight in; the energy unit comes from settings. */
  readonly units: Pick<DisplayUnits, 'height' | 'weight'>;
  /** Stops the request (the step went away); the answer is then the formula plan. */
  readonly cancel?: AbortSignal;
}

export interface BuiltPlan {
  readonly plan: Targets;
  /** The formulas stood in: no AI set up, the AI failed, or it took longer than the cap. */
  readonly aiUnavailable: boolean;
}

export interface PlanBuilderDeps {
  /** Reads the stored AI setup (`storedAiAccess` in the app). */
  readonly aiAccess: () => Promise<StoredAiAccess>;
  /** Reads the energy unit the person reads (for the request's kJ line). */
  readonly energyUnit: () => Promise<EnergyDisplayUnit>;
  /** Handed to the AI client; only `src/ai/transport.ts` calls it. */
  readonly fetch: typeof fetch;
}

/** The plan builder as a service: `buildPlan` bound to its deps. */
export interface PlanBuilder {
  /** Never rejects. */
  build(request: PlanRequest): Promise<BuiltPlan>;
}

/** The formula plan of the request, standing in for the AI's (D-16.14). */
export function formulaStandIn(request: Pick<PlanRequest, 'profile' | 'today'>): BuiltPlan {
  return { plan: formulaPlan(request.profile, request.today), aiUnavailable: true };
}

/** Resolves with null once the deadline has stopped (the cap or a cancel). */
function whenStopped(deadline: Deadline): Promise<null> {
  return new Promise((resolve) => {
    if (deadline.signal.aborted) resolve(null);
    else deadline.signal.addEventListener('abort', () => resolve(null), { once: true });
  });
}

/** The AI's plan, or null when it cannot be had (no setup, any failure). */
async function askAi(
  request: PlanRequest,
  deps: PlanBuilderDeps,
  deadline: Deadline,
): Promise<BuiltPlan | null> {
  const { settings, keys } = await deps.aiAccess();
  // Nothing set up ("Set up later"), or the role that would answer cannot send yet.
  if (settings === null || missingFor(roleFor({}, settings), keys).length > 0) return null;
  const energy = await deps.energyUnit();
  const answer = await requestPlan(
    { profile: request.profile, today: request.today, units: { ...request.units, energy } },
    { settings, keys, fetch: deps.fetch, deadline },
  );
  if (!answer.ok) return null;
  const { kcal, protein, fat } = answer.value;
  return {
    plan: { kcal, protein, carbs: carbsLeft(kcal, protein, fat), fat },
    aiUnavailable: false,
  };
}

/**
 * The plan for Building plan: the AI's when it answers within the cap with a plan the plan check
 * accepts (carbs then re-derived from kcal, protein and fat), else the formula plan flagged
 * `aiUnavailable`. With no AI set up the formula plan comes at once and nothing is sent.
 */
export async function buildPlan(request: PlanRequest, deps: PlanBuilderDeps): Promise<BuiltPlan> {
  const deadline = startDeadline({ timeoutSeconds: PLAN_CAP_SECONDS, cancel: request.cancel });
  try {
    // The race keeps the cap even if something inside did not stop on the deadline's signal.
    const answer = await Promise.race([askAi(request, deps, deadline), whenStopped(deadline)]);
    return answer ?? formulaStandIn(request);
  } catch {
    return formulaStandIn(request);
  } finally {
    deadline.end();
  }
}

export function createPlanBuilder(deps: PlanBuilderDeps): PlanBuilder {
  return { build: (request) => buildPlan(request, deps) };
}

export interface AiAccessSources {
  readonly settingsRepo: Pick<SettingsRepo, 'get'>;
  readonly secretsRepo: Pick<SecretsRepo, 'slots' | 'get'>;
}

/** A reader of the stored AI setup: the `ai.settings` row and every AI provider's saved key. */
export function storedAiAccess(sources: AiAccessSources): () => Promise<StoredAiAccess> {
  const { settingsRepo, secretsRepo } = sources;
  return async () => {
    const settings = await settingsRepo.get('ai.settings');
    const keys: Partial<Record<ProviderId, string>> = {};
    // The food-database key shares the table; only provider slots are AI keys.
    for (const slot of await secretsRepo.slots()) {
      if (!isProviderId(slot)) continue;
      const key = await secretsRepo.get(slot);
      if (key !== null) keys[slot] = key;
    }
    return { settings, keys };
  };
}
