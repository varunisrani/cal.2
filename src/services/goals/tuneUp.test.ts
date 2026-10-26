import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../domain/model';
import { planInputsKey } from '../../domain/profile/signature';
import {
  GEMINI,
  LATER_PLAN,
  NEW_PLAN,
  NEW_PLAN_WHY,
  OWN_PLAN,
  REFUSED_KEY,
  STARTING_PROFILE,
  TODAY,
  goalsHarness,
  planReply,
  useFakeClock,
  type HarnessOptions,
} from './__fixtures__/harness';
import { createTuneUpRunner, type TuneUpOutcome } from './tuneUp';

beforeEach(() => {
  useFakeClock();
});

/** Seven days before the fixture day: a check is due. */
const WEEK_AGO = '2026-10-19';

async function setUp(options: HarnessOptions = {}) {
  const h = await goalsHarness({
    ...options,
    settings: { 'tuneUp.on': true, 'tuneUp.lastCheckDay': WEEK_AGO, ...options.settings },
  });
  return { ...h, runner: createTuneUpRunner(h.deps) };
}

type Harness = Awaited<ReturnType<typeof setUp>>;

async function tuneUpState(h: Harness) {
  return {
    on: await h.settingsRepo.get('tuneUp.on'),
    lastCheckDay: await h.settingsRepo.get('tuneUp.lastCheckDay'),
    savedPlan: await h.settingsRepo.get('tuneUp.savedPlan'),
  };
}

const withoutLocks = (profile: Profile): Profile => ({
  ...profile,
  caloriesLocked: false,
  lockedMacros: [],
});

/** The profile after a tune-up applied `plan`. */
const tunedTo = (plan: typeof NEW_PLAN | typeof LATER_PLAN): Profile => ({
  ...withoutLocks(STARTING_PROFILE),
  saved: { ...plan },
});

const CHANGED: TuneUpOutcome = { kind: 'changed', kcal: 2_300, reason: NEW_PLAN_WHY };

describe('check: when a check is due (D-16.45)', () => {
  it('rebuilds the plan once when the app opens 7 days after the last check (ACC-C8-1)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply());

    expect(await h.runner.check('open')).toEqual(CHANGED);
    expect(await h.runner.check('open')).toEqual({ kind: 'unchanged', why: 'notDue' });

    expect(h.fake.requests).toHaveLength(1);
    expect(await h.storedProfile()).toEqual(tunedTo(NEW_PLAN));
    expect(await tuneUpState(h)).toEqual({ on: true, lastCheckDay: TODAY, savedPlan: OWN_PLAN });
  });

  it('stores the rebuild baseline of the plan it applied', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply());

    await h.runner.check('visible');

    expect(await h.settingsRepo.get('goals.rebuildBaseline')).toBe(
      planInputsKey(tunedTo(NEW_PLAN)),
    );
  });

  it.each([
    ['checked 6 days ago', { 'tuneUp.lastCheckDay': '2026-10-20' }, 'notDue'],
    ['switched off', { 'tuneUp.on': false }, 'off'],
    ['onboarding not done', { 'onboarding.done': false }, 'notReady'],
  ] as const)('sends nothing when %s', async (_when, settings, why) => {
    const h = await setUp({ settings });

    expect(await h.runner.check('open')).toEqual({ kind: 'unchanged', why });
    expect(h.fake.requests).toHaveLength(0);
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
  });

  it('sends nothing when no profile is stored', async () => {
    const h = await setUp({ profile: null });

    expect(await h.runner.check('open')).toEqual({ kind: 'unchanged', why: 'notReady' });
    expect(h.fake.requests).toHaveLength(0);
  });

  it('makes one AI call for three visible events in a row (R01.5)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply());
    const hold = h.holdRequests();

    const outcomes = [
      h.runner.check('visible'),
      h.runner.check('visible'),
      h.runner.check('visible'),
    ];
    await hold.reached;
    hold.release();

    const settled = await Promise.all(outcomes);
    expect(settled.filter((outcome) => outcome.kind === 'changed')).toEqual([CHANGED]);
    expect(settled.filter((outcome) => outcome.kind === 'unchanged')).toEqual([
      { kind: 'unchanged', why: 'running' },
      { kind: 'unchanged', why: 'running' },
    ]);
    expect(h.fake.requests).toHaveLength(1);
  });
});

describe('check: failures keep the plan and count as the check (R01.5, D-16.45)', () => {
  it('marks today and keeps the plan when the provider refuses the key (R01.5)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, REFUSED_KEY);

    expect(await h.runner.check('open')).toMatchObject({
      kind: 'failed',
      failure: { kind: 'keyRejected' },
    });

    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
    expect(await tuneUpState(h)).toEqual({ on: true, lastCheckDay: TODAY, savedPlan: null });
    // The next open the same day does not call the broken key again.
    expect(await h.runner.check('open')).toEqual({ kind: 'unchanged', why: 'notDue' });
    expect(h.fake.requests).toHaveLength(1);
  });

  it('changes nothing without an AI plan and still marks the week: no formula fallback (R01.1, D-16.45)', async () => {
    const h = await setUp({ keys: {} });

    expect(await h.runner.check('open')).toEqual({ kind: 'failed', failure: { kind: 'noKey' } });

    expect(h.fake.requests).toHaveLength(0);
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe(TODAY);
  });

  it('marks nothing for a failure that arrives after the switch went off (R01.5)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, REFUSED_KEY);
    const hold = h.holdRequests();

    const outcome = h.runner.check('open');
    await hold.reached;
    await h.runner.turnOff();
    hold.release();

    expect(await outcome).toEqual({ kind: 'unchanged', why: 'abandoned' });
    expect(await h.settingsRepo.get('tuneUp.lastCheckDay')).toBe(WEEK_AGO);
  });
});

describe('check: replies that come too late (R01.4)', () => {
  it('applies and marks nothing when the switch is turned off during the call', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply());
    const hold = h.holdRequests();

    const outcome = h.runner.check('open');
    await hold.reached;
    expect(await h.runner.turnOff()).toEqual({ restored: false });
    hold.release();

    expect(await outcome).toEqual({ kind: 'unchanged', why: 'abandoned' });
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
    expect(await tuneUpState(h)).toEqual({ on: false, lastCheckDay: WEEK_AGO, savedPlan: null });
  });

  it('drops the reply and marks nothing when the profile changed during the call (R01.4)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply());
    const hold = h.holdRequests();
    const edited: Profile = { ...STARTING_PROFILE, weightKg: 69.4 };

    const outcome = h.runner.check('open');
    await hold.reached;
    await h.profileRepo.save(edited);
    hold.release();

    expect(await outcome).toEqual({ kind: 'unchanged', why: 'dropped' });
    expect(await h.storedProfile()).toEqual(edited);
    expect(await tuneUpState(h)).toEqual({ on: true, lastCheckDay: WEEK_AGO, savedPlan: null });
  });

  it('drops the reply when an input switch changed during the call', async () => {
    let measured = false;
    const h = await setUp({ switches: () => ({ measuredEnergy: measured }) });
    h.fake.on(GEMINI, planReply());
    const hold = h.holdRequests();

    const outcome = h.runner.check('open');
    await hold.reached;
    measured = true;
    hold.release();

    expect(await outcome).toEqual({ kind: 'unchanged', why: 'abandoned' });
    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
  });
});

describe('the plan from before the tune-up (R01.14)', () => {
  it('restores the plan from before the first tune-up after two runs (R01.14, ACC-C8-2)', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply(), planReply(LATER_PLAN, 'Weight drifted up.'));

    expect(await h.runner.check('open')).toMatchObject({ kind: 'changed', kcal: 2_300 });
    vi.setSystemTime(new Date('2026-11-02T12:00:00'));
    expect(await h.runner.check('open')).toMatchObject({ kind: 'changed', kcal: 2_200 });
    expect(await h.storedProfile()).toEqual(tunedTo(LATER_PLAN));
    expect(await h.settingsRepo.get('tuneUp.savedPlan')).toEqual(OWN_PLAN);

    expect(await h.runner.turnOff()).toEqual({ restored: true });

    // The targets come back; the locks were never part of the kept plan.
    expect(await h.storedProfile()).toEqual({ ...withoutLocks(STARTING_PROFILE), saved: OWN_PLAN });
    expect(await tuneUpState(h)).toEqual({
      on: false,
      lastCheckDay: '2026-11-02',
      savedPlan: null,
    });
  });

  it('keeps an all-automatic plan as {} and puts it back as all automatic', async () => {
    const automatic: Profile = {
      ...STARTING_PROFILE,
      saved: {},
      caloriesLocked: false,
      lockedMacros: [],
    };
    const h = await setUp({ profile: automatic });
    h.fake.on(GEMINI, planReply());

    await h.runner.check('open');
    expect(await h.settingsRepo.get('tuneUp.savedPlan')).toEqual({});
    await h.runner.turnOff();

    expect(await h.storedProfile()).toEqual(automatic);
  });

  it('leaves the profile as it is when nothing is kept', async () => {
    const h = await setUp();

    expect(await h.runner.turnOff()).toEqual({ restored: false });

    expect(await h.storedProfile()).toEqual(STARTING_PROFILE);
    expect(await h.settingsRepo.get('tuneUp.on')).toBe(false);
  });
});

describe('turnOn', () => {
  it('clears every lock and runs although no check is due, returning the new kcal and reason', async () => {
    const h = await setUp({ settings: { 'tuneUp.on': false, 'tuneUp.lastCheckDay': TODAY } });
    h.fake.on(GEMINI, planReply());

    expect(await h.runner.turnOn()).toEqual(CHANGED);

    expect(h.fake.requests).toHaveLength(1);
    expect(await h.storedProfile()).toEqual(tunedTo(NEW_PLAN));
    expect(await tuneUpState(h)).toEqual({ on: true, lastCheckDay: TODAY, savedPlan: OWN_PLAN });
  });

  it('returns the failure kind when the provider cannot be reached, with locks cleared', async () => {
    const h = await setUp({ settings: { 'tuneUp.on': false } });
    h.fake.on(GEMINI, REFUSED_KEY);

    expect(await h.runner.turnOn()).toMatchObject({
      kind: 'failed',
      failure: { kind: 'keyRejected' },
    });

    expect(await h.storedProfile()).toEqual(withoutLocks(STARTING_PROFILE));
    expect(await tuneUpState(h)).toEqual({ on: true, lastCheckDay: TODAY, savedPlan: null });
  });

  it('returns unchanged when a run is already in flight, which then drops its reply', async () => {
    const h = await setUp();
    h.fake.on(GEMINI, planReply());
    const hold = h.holdRequests();

    const running = h.runner.check('open');
    await hold.reached;
    // Clearing the locks changes the profile the running request was built from.
    expect(await h.runner.turnOn()).toEqual({ kind: 'unchanged', why: 'running' });
    hold.release();

    expect(await running).toEqual({ kind: 'unchanged', why: 'dropped' });
    expect(h.fake.requests).toHaveLength(1);
    expect(await h.storedProfile()).toEqual(withoutLocks(STARTING_PROFILE));
  });
});
