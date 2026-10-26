import { beforeEach, describe, expect, it } from 'vitest';
import { planPrompt } from '../../ai/prompts/plan';
import type { RecordedRequest } from '../../ai/testing/fakeFetch';
import type { InputSwitches } from '../../domain/adaptive/cadence';
import { buildEvidence } from '../../domain/forecast/evidence';
import type { Profile } from '../../domain/model';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { planInputsKey } from '../../domain/profile/signature';
import { makeEntry } from '../../test/factories';
import {
  GEMINI,
  NEW_PLAN,
  NEW_PLAN_WHY,
  REFUSED_KEY,
  STARTING_PROFILE,
  TODAY,
  goalsHarness,
  goalsReply,
  planReply,
  useFakeClock,
  type HarnessOptions,
} from './__fixtures__/harness';
import { createRebuildService } from './rebuild';

beforeEach(() => {
  useFakeClock();
});

async function setUp(options: HarnessOptions = {}) {
  const h = await goalsHarness(options);
  return { ...h, service: createRebuildService(h.deps) };
}

/** The profile after a stored rebuild: the new plan, no locks. */
const REBUILT: Profile = {
  ...STARTING_PROFILE,
  saved: { ...NEW_PLAN },
  caloriesLocked: false,
  lockedMacros: [],
};

const promptOf = (request: RecordedRequest | undefined): string => {
  const body = request?.body as { contents: { parts: { text?: string }[] }[] };
  return body.contents[0]?.parts.map((part) => part.text ?? '').join('') ?? '';
};

describe('rebuild: a stored plan', () => {
  it('stores all four targets, clears every lock and returns the kcal and the reason (ACC-C4-1)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    const outcome = await h.service.rebuild();

    expect(outcome).toEqual({
      kind: 'rebuilt',
      kcal: 2_300,
      reason: NEW_PLAN_WHY,
      nutrientGoals: 'refreshed',
    });
    expect(await h.storedProfile()).toEqual(REBUILT);
  });

  it('stores the plan-inputs key of the new plan as the rebuild baseline', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    await h.service.rebuild();

    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBe(planInputsKey(REBUILT));
  });

  it('sends the plan request with the evidence pack of the stored log and weigh-ins', async () => {
    const h = await setUp();
    const entries = [
      makeEntry({ loggedAt: Date.parse('2026-10-24T13:00:00'), kcal: 2_350 }),
      makeEntry({ loggedAt: Date.parse('2026-10-25T19:00:00'), kcal: 2_420 }),
      // Today is still being logged: the pack leaves it out.
      makeEntry({ loggedAt: Date.parse('2026-10-26T08:00:00'), kcal: 500 }),
    ];
    for (const entry of entries) await h.diaryRepo.add(entry);
    await h.weightRepo.addWeighIn({ at: Date.parse('2026-10-05T07:00:00'), kg: 70.6 });
    await h.weightRepo.addWeighIn({ at: Date.parse('2026-10-25T07:00:00'), kg: 70 });
    const profile = await h.storedProfile();
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    await h.service.rebuild();

    const evidence = buildEvidence({
      profile,
      entries: await h.diaryRepo.between('2026-07-01', TODAY),
      weighIns: await h.weightRepo.history(),
      bodyFat: [],
      today: TODAY,
    });
    const units = { energy: 'kcal', weight: 'kg', height: 'cm' } as const;
    expect(evidence.weights.rows).toHaveLength(2);
    expect(promptOf(h.fake.requests[0])).toBe(
      planPrompt({ profile, today: TODAY, units, evidence }).prompt,
    );
  });
});

describe('rebuild: a profile changed during the call (R01.4)', () => {
  const edits: [string, (profile: Profile) => Profile][] = [
    ['the weight', (profile) => ({ ...profile, weightKg: 71 })],
    ['a lock', (profile) => ({ ...profile, lockedMacros: ['protein', 'fat'] })],
    ['a target', (profile) => ({ ...profile, saved: { ...profile.saved, fat: 65 } })],
    ['the allergens', (profile) => ({ ...profile, allergens: ['sesame'] })],
  ];

  it.each(edits)(
    'drops the plan when %s changed, leaving targets and locks (R01.4, ACC-C4-2)',
    async (_what, edit) => {
      const h = await setUp();
      h.fake.on(GEMINI, planReply());
      const hold = h.holdRequests();

      const outcome = h.service.rebuild();
      await hold.reached;
      await h.profileRepo.update(edit);
      hold.release();

      expect(await outcome).toEqual({ kind: 'dropped' });
      expect(await h.storedProfile()).toEqual(edit(STARTING_PROFILE));
      expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBeNull();
      // No goals request follows a dropped plan.
      expect(h.fake.requests).toHaveLength(1);
    },
  );

  it('drops the plan when an input switch changed during the call', async () => {
    let switches: InputSwitches = { measuredEnergy: false };
    const h = await setUp({ switches: () => switches });
    h.fake.on(GEMINI, planReply());
    const hold = h.holdRequests();

    const outcome = h.service.rebuild();
    await hold.reached;
    switches = { measuredEnergy: true };
    hold.release();

    expect(await outcome).toEqual({ kind: 'dropped' });
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
  });
});

describe('rebuild: optional nutrient goals', () => {
  it('asks for them again after the plan, changing only the goals the reply names', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    await h.service.rebuild();

    expect(h.fake.requests).toHaveLength(2);
    expect(await h.settingsRepo.get('goals.nutrients')).toEqual({
      ...DEFAULT_GOAL_VALUES,
      sodium: 1_800,
    });
  });

  it('keeps the goals as they were when their request fails', async () => {
    const h = await setUp({
      settings: { 'goals.nutrients': { ...DEFAULT_GOAL_VALUES, fibre: 40 } },
    });
    h.fake.on(GEMINI, planReply(), REFUSED_KEY);

    const outcome = await h.service.rebuild();

    expect(outcome).toMatchObject({ kind: 'rebuilt', kcal: 2_300, nutrientGoals: 'kept' });
    expect(await h.storedProfile()).toEqual(REBUILT);
    expect(await h.settingsRepo.get('goals.nutrients')).toEqual({
      ...DEFAULT_GOAL_VALUES,
      fibre: 40,
    });
  });

  it('keeps goals the person edited while their request ran', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));
    // The plan request goes through; the goals request waits.
    const hold = h.holdRequests(1);

    const outcome = h.service.rebuild();
    await hold.reached;
    await h.settingsRepo.set('goals.nutrients', { ...DEFAULT_GOAL_VALUES, sodium: 2_000 });
    hold.release();

    expect(await outcome).toMatchObject({ kind: 'rebuilt', nutrientGoals: 'kept' });
    expect((await h.settingsRepo.get('goals.nutrients')).sodium).toBe(2_000);
  });
});

describe('rebuild: the weekly tune-up (R01.5)', () => {
  it('counts as this week’s check while the tune-up is on (R01.5)', async () => {
    const h = await setUp({ settings: { 'tuneUp.on': true, 'tuneUp.lastCheckDay': '2026-10-20' } });
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    await h.service.rebuild();

    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe(TODAY);
  });

  it('leaves the check day alone while the tune-up is off', async () => {
    const h = await setUp({
      settings: { 'tuneUp.on': false, 'tuneUp.lastCheckDay': '2026-10-20' },
    });
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    await h.service.rebuild();

    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe('2026-10-20');
  });

  it('keeps the tune-up’s saved plan as it was', async () => {
    const kept = { kcal: 2_500 };
    const h = await setUp({ settings: { 'tuneUp.on': true, 'tuneUp.savedPlan': kept } });
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));

    await h.service.rebuild();

    expect(await h.settingsRepo.get('tuneUp.savedPlan')).toEqual(kept);
  });
});

describe('rebuild: failures leave the plan as it was', () => {
  it('returns the failure kind and changes nothing when the provider refuses the key', async () => {
    const h = await setUp({ settings: { 'tuneUp.on': true, 'tuneUp.lastCheckDay': '2026-10-20' } });
    h.fake.on(GEMINI, REFUSED_KEY);

    const outcome = await h.service.rebuild();

    expect(outcome).toMatchObject({ kind: 'failed', failure: { kind: 'keyRejected' } });
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBeNull();
    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe('2026-10-20');
    expect(h.fake.requests).toHaveLength(1);
  });

  it('sends nothing and uses no formula plan when no key is stored', async () => {
    const h = await setUp({ keys: {} });

    const outcome = await h.service.rebuild();

    expect(outcome).toEqual({ kind: 'failed', failure: { kind: 'noKey' } });
    expect(h.fake.requests).toHaveLength(0);
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
  });

  it('leaves the targets for an implausible plan: protein 300 for this body (ACC-C3-2)', async () => {
    const h = await setUp();
    // 4 × 300 + 4 × 177 + 9 × 48 = 2 340: coherent, but far above the formula protein of 112.
    h.fake.on(GEMINI, planReply({ kcal: 2_300, protein: 300, carbs: 177, fat: 48 }));

    const outcome = await h.service.rebuild();

    expect(outcome).toMatchObject({
      kind: 'failed',
      failure: { kind: 'invalidResponse', rejection: { step: 'implausible' } },
    });
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
  });
});

describe('rebuild: one at a time', () => {
  it('turns a second tap away while the first rebuild runs', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply(), goalsReply({ sodium: 1_800 }));
    const hold = h.holdRequests();

    const first = h.service.rebuild();
    const second = h.service.rebuild();
    await hold.reached;
    hold.release();

    expect(await second).toEqual({ kind: 'busy' });
    expect(await first).toMatchObject({ kind: 'rebuilt', kcal: 2_300 });
    expect(h.fake.requests).toHaveLength(2);
  });

  it('takes a new tap once a failed rebuild has finished', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, REFUSED_KEY, planReply(), goalsReply({ sodium: 1_800 }));

    expect(await h.service.rebuild()).toMatchObject({ kind: 'failed' });
    expect(await h.service.rebuild()).toMatchObject({ kind: 'rebuilt' });
  });

  it('sends nothing when no profile is stored', async () => {
    const h = await setUp({ profile: null });

    expect(await h.service.rebuild()).toEqual({ kind: 'noProfile' });
    expect(h.fake.requests).toHaveLength(0);
  });
});
