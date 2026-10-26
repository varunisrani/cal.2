import { beforeEach, describe, expect, it } from 'vitest';
import { formulaPlan } from '../../domain/goals/formulas';
import { checkPlan } from '../../domain/goals/planValidator';
import { FIXTURE_TODAY, defaultProfile } from '../../domain/goals/__fixtures__/profiles';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { advanceAsync, useFakeTime } from '../../test/time';
import { defaultModel } from '../catalog/presets';
import type { ProviderId } from '../catalog/providers';
import type { AiDeps } from '../client';
import { evidenceProfile, secretEvidence } from '../prompts/__fixtures__/evidence';
import { evidenceText } from '../prompts/evidenceText';
import { fitCheckPrompt, type FitCheckInput } from '../prompts/fitCheck';
import { planPrompt } from '../prompts/plan';
import type { DisplayUnits } from '../prompts/shared';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../settings';
import {
  fakeFetch,
  type FakeFetch,
  type FakeStep,
  type RecordedRequest,
} from '../testing/fakeFetch';
import { anthropicAnswer, geminiAnswer, geminiError, openAiAnswer } from '../testing/wire';
import { fitCheck, requestNutrientGoals, requestPlan } from './planning';

const START = '2026-10-26T18:00:00Z';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const KEYS = { gemini: 'gm-key-2468', anthropic: 'an-key-1357', mistral: 'mi-key-9753' };
const METRIC: DisplayUnits = { energy: 'kcal', weight: 'kg', height: 'cm' };

const choice = (provider: ProviderId) => ({
  on: true,
  provider,
  model: defaultModel(provider, 'text'),
});

/** No photos, so the text standby backs whoever serves: here Anthropic. */
const TEXT_STANDBY: Partial<AiSettings> = { textStandby: choice('anthropic') };

function depsFor(fake: FakeFetch, settings: Partial<AiSettings> = {}): AiDeps {
  return {
    settings: { ...DEFAULT_AI_SETTINGS, ...settings },
    keys: KEYS,
    fetch: fake.fetch,
  };
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  await advanceAsync(10_000);
  return promise;
}

const gemini = (reply: unknown): FakeStep => ({ json: geminiAnswer(JSON.stringify(reply)) });
const anthropic = (reply: unknown): FakeStep => ({
  json: anthropicAnswer(JSON.stringify(reply)),
});

const promptOf = (request: RecordedRequest | undefined): string => {
  const body = request?.body as { contents: { parts: { text?: string }[] }[] };
  return body.contents[0]?.parts.map((part) => part.text ?? '').join('') ?? '';
};

const FORMULA = formulaPlan(defaultProfile, FIXTURE_TODAY);
const PLAN_INPUT = { profile: defaultProfile, today: FIXTURE_TODAY, units: METRIC };
/** The formula plan as a model would send it back. */
const GOOD_PLAN = { ...FORMULA, why: 'Formula plan; no history yet.' };

beforeEach(() => {
  useFakeTime(START);
});

describe('requestPlan (01 §3.6, R01.2)', () => {
  it('returns the checked plan with its reason', async () => {
    const fake = fakeFetch().on(GEMINI, gemini(GOOD_PLAN));
    const result = await settle(requestPlan(PLAN_INPUT, depsFor(fake)));

    // Judged against the formula plan of the same day, as the plan check does it.
    expect(result).toEqual(checkPlan({ ...FORMULA, reason: GOOD_PLAN.why }, FORMULA));
    expect(result).toMatchObject({
      ok: true,
      value: { kcal: FORMULA.kcal, reason: GOOD_PLAN.why },
    });
    expect(promptOf(fake.requests[0])).toBe(planPrompt(PLAN_INPUT).prompt);
  });

  it('asks the standby when the plan is out of range, and returns its plan (D-16.22)', async () => {
    const fake = fakeFetch()
      .on(GEMINI, gemini({ ...GOOD_PLAN, kcal: 9_000 }))
      .on(ANTHROPIC, anthropic(GOOD_PLAN));
    const result = await settle(requestPlan(PLAN_INPUT, depsFor(fake, TEXT_STANDBY)));

    expect(result).toMatchObject({ ok: true, value: { kcal: FORMULA.kcal } });
    expect(fake.requests.map((request) => request.url.startsWith(GEMINI))).toEqual([true, false]);
  });

  it('gives bothFailed with the standby refusal when both plans are refused', async () => {
    const fake = fakeFetch()
      .on(GEMINI, gemini({ ...GOOD_PLAN, kcal: 9_000 }))
      .on(ANTHROPIC, anthropic({ ...GOOD_PLAN, protein: 'lots' }));
    const result = await settle(requestPlan(PLAN_INPUT, depsFor(fake, TEXT_STANDBY)));

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'bothFailed',
        primary: 'Gemini',
        standby: 'Anthropic',
        standbyFailure: { kind: 'invalidResponse', rejection: { step: 'notNumber' } },
      },
    });
  });

  it('sends the evidence text when there is an evidence pack', async () => {
    const evidence = secretEvidence();
    const fake = fakeFetch().on(GEMINI, gemini(GOOD_PLAN));
    await settle(
      requestPlan(
        { profile: evidenceProfile, today: FIXTURE_TODAY, units: METRIC, evidence },
        depsFor(fake),
      ),
    );
    expect(promptOf(fake.requests[0])).toContain(evidenceText(evidence));
  });
});

describe('requestNutrientGoals (03 §3.11, R03.25)', () => {
  const input = {
    profile: defaultProfile,
    today: FIXTURE_TODAY,
    units: METRIC,
    targets: FORMULA,
    current: { ...DEFAULT_GOAL_VALUES, sodium: 2_100 },
  };

  it('changes only the goals the answer gave, starting from the current ones', async () => {
    const fake = fakeFetch().on(GEMINI, gemini({ sodium: 1_800, fibre: '32' }));
    const result = await settle(requestNutrientGoals(input, depsFor(fake)));

    expect(result).toEqual({ ok: true, value: { ...input.current, sodium: 1_800, fibre: 32 } });
  });

  it('asks the standby when the answer holds no usable goal', async () => {
    const fake = fakeFetch()
      .on(GEMINI, gemini({ kcal: 2_000, protein: 140 }))
      .on(ANTHROPIC, anthropic({ potassium: 3_400 }));
    const result = await settle(requestNutrientGoals(input, depsFor(fake, TEXT_STANDBY)));

    expect(result).toEqual({ ok: true, value: { ...input.current, potassium: 3_400 } });
    expect(input.current.potassium).toBe(DEFAULT_GOAL_VALUES.potassium);
  });
});

describe('fitCheck (03 §3.11)', () => {
  const input: FitCheckInput = {
    profile: defaultProfile,
    today: FIXTURE_TODAY,
    units: METRIC,
    targets: FORMULA,
    eaten: { kcal: 1_400, protein: 80, carbs: 160, fat: 45 },
    meal: { name: 'Chicken wrap', kcal: 520, protein: 32, carbs: 48, fat: 20 },
    todaysMeals: [{ name: 'Porridge', kcal: 380, protein: 14, carbs: 60, fat: 9 }],
  };
  /** A photo primary on Anthropic, a text provider on Gemini backed by Mistral. */
  const roles: Partial<AiSettings> = {
    primary: { provider: 'anthropic', model: defaultModel('anthropic', 'image') },
    imageStandby: { ...choice('openai'), model: defaultModel('openai', 'image') },
    textRole: choice('gemini'),
    textStandby: choice('mistral'),
  };

  it('uses the text role when it is on, with JSON mode off, and returns the trimmed sentences', async () => {
    const fake = fakeFetch().on(GEMINI, { json: geminiAnswer('  It fits: 280 kcal left.  ') });
    const result = await settle(fitCheck(input, depsFor(fake, roles)));

    expect(result).toEqual({ ok: true, value: 'It fits: 280 kcal left.' });
    const body = fake.requests[0]?.body as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig).not.toHaveProperty('responseMimeType');
    expect(promptOf(fake.requests[0])).toBe(fitCheckPrompt(input).prompt);
  });

  it('falls back to the text standby, never the photo standby', async () => {
    const fake = fakeFetch()
      .on(GEMINI, { status: 500, json: geminiError(500, 'INTERNAL', 'Something broke.') })
      .on(MISTRAL, { json: openAiAnswer('It fits if dinner stays light.') });
    const result = await settle(fitCheck(input, depsFor(fake, roles)));

    expect(result).toEqual({ ok: true, value: 'It fits if dinner stays light.' });
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.url).toBe(MISTRAL);
  });
});
