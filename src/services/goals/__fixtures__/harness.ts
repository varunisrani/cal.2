// Test support for the goals services (P05-08, P05-09): real repositories on a fake IndexedDB, a
// Gemini setup on the fake fetch, and a way to hold a request open so a test can change things
// "while the call runs". Test code only.

import { vi } from 'vitest';
import { DEFAULT_AI_SETTINGS, type ProviderKeys } from '../../../ai/settings';
import { fakeFetch, type FakeFetch, type FakeStep } from '../../../ai/testing/fakeFetch';
import { geminiAnswer, geminiError } from '../../../ai/testing/wire';
import { createBodyFatRepo } from '../../../data/repos/bodyFatRepo';
import { createDiaryRepo } from '../../../data/repos/diaryRepo';
import { createProfileRepo } from '../../../data/repos/profileRepo';
import { createSettingsRepo, type SettingsRepo } from '../../../data/repos/settingsRepo';
import { createWeightRepo } from '../../../data/repos/weightRepo';
import type { SettingKey, SettingValue } from '../../../data/settingsSchema';
import type { InputSwitches } from '../../../domain/adaptive/cadence';
import { FIXTURE_TODAY, defaultProfile } from '../../../domain/goals/__fixtures__/profiles';
import type { Profile } from '../../../domain/model';
import { systemClock } from '../../../lib/clock';
import { openTestDb } from '../../../test/db';
import type { PlanServiceDeps } from '../planRequest';

/** Noon on the fixture day, in the zone tests run in. */
export const NOW = `${FIXTURE_TODAY}T12:00:00`;
export const TODAY = FIXTURE_TODAY;

export const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const KEYS: ProviderKeys = { gemini: 'gm-test-4821' };

/**
 * Fake timers and a fake `Date` from `at`. `setImmediate` stays real: the fake IndexedDB runs its
 * work on it, and nothing in these services waits on it.
 */
export function useFakeClock(at: string = NOW): number {
  const ms = new Date(at).getTime();
  vi.useFakeTimers({
    now: ms,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  return ms;
}

/** The person's own plan before a run: complete, with calories and protein locked. */
export const OWN_PLAN = { kcal: 2_400, protein: 130, carbs: 335, fat: 60 } as const;

/** The default body with `OWN_PLAN` saved and locked. */
export const STARTING_PROFILE: Profile = {
  ...defaultProfile,
  saved: { ...OWN_PLAN },
  caloriesLocked: true,
  lockedMacros: ['protein'],
};

/** A plan the plan check keeps exactly for the default body: 4 × 120 + 4 × 347 + 9 × 48 = 2 300. */
export const NEW_PLAN = { kcal: 2_300, protein: 120, carbs: 347, fat: 48 } as const;
export const NEW_PLAN_WHY = 'Intake and weight held steady for four weeks.';

/** A second plan, for runs after the first. */
export const LATER_PLAN = { kcal: 2_200, protein: 120, carbs: 322, fat: 48 } as const;

/** The reply text a model sends for `plan`, with `why` as its reason. */
export function planReply(
  plan: Readonly<Record<string, number>> = NEW_PLAN,
  why: string = NEW_PLAN_WHY,
): FakeStep {
  return { json: geminiAnswer(JSON.stringify({ ...plan, why })) };
}

/** A nutrient-goals reply naming only the goals given. */
export function goalsReply(goals: Readonly<Record<string, number>>): FakeStep {
  return { json: geminiAnswer(JSON.stringify(goals)) };
}

/** Gemini refusing the key. */
export const REFUSED_KEY: FakeStep = {
  status: 401,
  json: geminiError(401, 'UNAUTHENTICATED', 'The key was not accepted.'),
};

export interface HarnessOptions {
  /** The stored profile; `null` stores none. Defaults to `STARTING_PROFILE`. */
  readonly profile?: Profile | null;
  /** Settings stored before the test, besides `onboarding.done` = true. */
  readonly settings?: Partial<{ [K in SettingKey]: SettingValue<K> }>;
  readonly keys?: ProviderKeys;
  /** The input switches as they read at each moment. */
  readonly switches?: () => InputSwitches;
}

export interface RequestHold {
  /** Resolves once a request is waiting. */
  readonly reached: Promise<void>;
  /** Lets the waiting request, and every later one, through. */
  release(): void;
}

export async function goalsHarness(options: HarnessOptions = {}) {
  const { db, bus } = await openTestDb();
  const profileRepo = createProfileRepo(db);
  const settingsRepo: SettingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const weightRepo = createWeightRepo(db, { bus });
  const bodyFatRepo = createBodyFatRepo(db);
  const diaryRepo = createDiaryRepo(db);

  const profile = options.profile === undefined ? STARTING_PROFILE : options.profile;
  if (profile !== null) await profileRepo.save(profile);
  await settingsRepo.set('onboarding.done', true);
  for (const [key, value] of Object.entries(options.settings ?? {})) {
    await settingsRepo.set(key as SettingKey, value as never);
  }

  const fake: FakeFetch = fakeFetch();
  let sent = 0;
  let held: { from: number; arrive: () => void; opened: Promise<void> } | null = null;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const number = sent++;
    if (held && number >= held.from) {
      held.arrive();
      await held.opened;
    }
    return fake.fetch(input, init);
  };

  /** Holds requests until `release`, after letting `letThrough` more go out first. */
  function holdRequests(letThrough = 0): RequestHold {
    let release = (): void => {};
    let arrive = (): void => {};
    const opened = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => (arrive = resolve));
    held = { from: sent + letThrough, arrive, opened };
    return {
      reached,
      release() {
        held = null;
        release();
      },
    };
  }

  const switches = options.switches;
  const deps: PlanServiceDeps = {
    profileRepo,
    settingsRepo,
    weightRepo,
    bodyFatRepo,
    diaryRepo,
    clock: systemClock,
    aiAccess: async () => ({ settings: DEFAULT_AI_SETTINGS, keys: options.keys ?? KEYS }),
    fetch,
    ...(switches ? { inputSwitches: async () => switches() } : {}),
  };

  /** The stored profile; fails the test when none can be read. */
  async function storedProfile(): Promise<Profile> {
    const read = await profileRepo.get();
    if (read.kind !== 'ok') throw new Error(`No readable profile: ${read.kind}`);
    return read.value;
  }

  return {
    db,
    deps,
    fake,
    profileRepo,
    settingsRepo,
    weightRepo,
    diaryRepo,
    holdRequests,
    storedProfile,
  };
}

export type GoalsHarness = Awaited<ReturnType<typeof goalsHarness>>;
