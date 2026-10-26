import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ProviderKeys } from '../../ai/settings';
import { fakeFetch, type FakeFetch, type FakeStep } from '../../ai/testing/fakeFetch';
import { geminiAnswer } from '../../ai/testing/wire';
import { formulaPlan } from '../../domain/goals/formulas';
import { FIXTURE_TODAY, defaultProfile } from '../../domain/goals/__fixtures__/profiles';
import { createSecretsRepo, FDC_SLOT } from '../../data/repos/secretsRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { openTestDb } from '../../test/db';
import { advanceAsync, useFakeTime } from '../../test/time';
import {
  buildPlan,
  createPlanBuilder,
  PLAN_CAP_SECONDS,
  storedAiAccess,
  type PlanBuilderDeps,
  type PlanRequest,
  type StoredAiAccess,
} from './planBuilder';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GEMINI_KEY = 'gm-key-8642';
const SET_UP: StoredAiAccess = { settings: DEFAULT_AI_SETTINGS, keys: { gemini: GEMINI_KEY } };

/** The formula plan of the default profile: 2 452 kcal, 112 g protein, 406 g carbs, 42 g fat. */
const FORMULA = formulaPlan(defaultProfile, FIXTURE_TODAY);
const REQUEST: PlanRequest = {
  profile: defaultProfile,
  today: FIXTURE_TODAY,
  units: { height: 'cm', weight: 'kg' },
};

/** A plan reply as the model sends it, inside a Gemini answer. */
const reply = (plan: Record<string, unknown>, delayMs = 0): FakeStep => ({
  json: geminiAnswer(JSON.stringify(plan)),
  delayMs,
});

/** Inside the default profile's bounds; carbs 300 is 80 kcal short, which the check allows. */
const AI_PLAN = { kcal: 2_300, protein: 120, carbs: 300, fat: 60, why: 'A little under upkeep.' };

function depsFor(
  fake: FakeFetch,
  access: StoredAiAccess | (() => Promise<StoredAiAccess>) = SET_UP,
): PlanBuilderDeps {
  return {
    aiAccess: typeof access === 'function' ? access : async () => access,
    energyUnit: async () => 'kcal',
    fetch: fake.fetch,
  };
}

/** Starts `promise` and records when it settles, so a test can say it has not yet. */
function watch<T>(promise: Promise<T>) {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  return { promise, settled: () => settled };
}

describe('buildPlan', () => {
  it('gives the formula plan at once, sending nothing, when no AI is set up (Set up later)', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch();

    const built = await buildPlan(REQUEST, depsFor(fake, { settings: null, keys: {} }));

    expect(built).toEqual({ plan: FORMULA, aiUnavailable: true });
    expect(fake.requests).toHaveLength(0);
  });

  it('gives the formula plan at once when the provider still lacks its key', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch();

    const built = await buildPlan(REQUEST, depsFor(fake, { ...SET_UP, keys: {} }));

    expect(built).toEqual({ plan: FORMULA, aiUnavailable: true });
    expect(fake.requests).toHaveLength(0);
  });

  it("uses the AI's plan when it answers at 2 s, with carbs worked out from what kcal, protein and fat leave", async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch().on(GEMINI, reply(AI_PLAN, 2_000));
    const pending = watch(buildPlan(REQUEST, depsFor(fake)));

    await advanceAsync(1_999);
    expect(pending.settled()).toBe(false);
    await advanceAsync(1);

    // (2 300 − 4 × 120 − 9 × 60) ÷ 4 = 320, not the 300 the reply said.
    expect(await pending.promise).toEqual({
      plan: { kcal: 2_300, protein: 120, carbs: 320, fat: 60 },
      aiUnavailable: false,
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.headers['x-goog-api-key']).toBe(GEMINI_KEY);
  });

  it('asks without an evidence pack, in the energy unit the person reads', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch().on(GEMINI, reply(AI_PLAN));
    const deps: PlanBuilderDeps = { ...depsFor(fake), energyUnit: async () => 'kJ' };

    await buildPlan(REQUEST, deps);

    const prompt = JSON.stringify(fake.requests[0]?.body);
    expect(prompt).toContain('kJ');
    expect(prompt).not.toMatch(/evidence/i);
  });

  it('falls back to the formula plan when the plan check refuses the reply', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    // 300 g protein is far outside what the default profile allows (78–146 g).
    const refused = { kcal: 2_452, protein: 300, carbs: 100, fat: 50, why: 'Lots of protein.' };
    const fake = fakeFetch().on(GEMINI, reply(refused));

    const built = await buildPlan(REQUEST, depsFor(fake));

    expect(built).toEqual({ plan: FORMULA, aiUnavailable: true });
    expect(fake.requests).toHaveLength(1);
  });

  it('falls back to the formula plan when the provider cannot be reached', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch().on(GEMINI, { fail: 'network' });

    expect(await buildPlan(REQUEST, depsFor(fake))).toEqual({
      plan: FORMULA,
      aiUnavailable: true,
    });
  });

  it('stops waiting at 60 s and gives the formula plan, even with a 600 s time limit (R01.8, D-16.14)', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch().on(GEMINI, reply(AI_PLAN, 120_000));
    const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, timeoutSec: 600 };
    const pending = watch(buildPlan(REQUEST, depsFor(fake, { ...SET_UP, settings })));

    await advanceAsync(PLAN_CAP_SECONDS * 1_000 - 100);
    expect(pending.settled()).toBe(false);
    await advanceAsync(100);

    expect(pending.settled()).toBe(true);
    expect(await pending.promise).toEqual({ plan: FORMULA, aiUnavailable: true });
    expect(fake.requests[0]?.signal?.aborted).toBe(true);
  });

  it('keeps the 60 s cap even while the stored setup never finishes reading', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch();
    const pending = watch(
      buildPlan(
        REQUEST,
        depsFor(fake, () => new Promise(() => {})),
      ),
    );

    await advanceAsync(PLAN_CAP_SECONDS * 1_000);

    expect(await pending.promise).toEqual({ plan: FORMULA, aiUnavailable: true });
  });

  it('gives the formula plan when reading the stored setup fails', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch();
    const failing = () => Promise.reject(new Error('The database is closed'));

    expect(await buildPlan(REQUEST, depsFor(fake, failing))).toEqual({
      plan: FORMULA,
      aiUnavailable: true,
    });
  });

  it('stops the request on cancel and gives the formula plan', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const fake = fakeFetch().on(GEMINI, reply(AI_PLAN, 10_000));
    const cancel = new AbortController();
    const pending = watch(buildPlan({ ...REQUEST, cancel: cancel.signal }, depsFor(fake)));

    await advanceAsync(1_000);
    cancel.abort();

    expect(await pending.promise).toEqual({ plan: FORMULA, aiUnavailable: true });
    expect(fake.requests[0]?.signal?.aborted).toBe(true);
  });

  it('is what the plan builder service runs', async () => {
    useFakeTime('2026-10-26T09:00:00Z');
    const builder = createPlanBuilder(depsFor(fakeFetch(), { settings: null, keys: {} }));

    expect(await builder.build(REQUEST)).toEqual({ plan: FORMULA, aiUnavailable: true });
  });
});

describe('storedAiAccess', () => {
  const closers: Array<() => void> = [];
  afterEach(() => {
    for (const close of closers.splice(0)) close();
  });

  it('reads the AI settings row and the AI keys, leaving the food-database key out', async () => {
    const { db, bus } = await openTestDb();
    closers.push(() => db.close());
    const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
    const secretsRepo = createSecretsRepo(db);
    const read = storedAiAccess({ settingsRepo, secretsRepo });

    expect(await read()).toEqual({ settings: null, keys: {} });

    await settingsRepo.set('ai.settings', DEFAULT_AI_SETTINGS);
    await secretsRepo.set('gemini', GEMINI_KEY);
    await secretsRepo.set('anthropic', 'an-key-1357');
    await secretsRepo.set(FDC_SLOT, 'fdc-key-0000');

    const keys: ProviderKeys = { gemini: GEMINI_KEY, anthropic: 'an-key-1357' };
    expect(await read()).toEqual({ settings: DEFAULT_AI_SETTINGS, keys });
  });
});
