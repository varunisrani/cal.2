import { describe, expect, it } from 'vitest';
import type { Profile, Targets } from '../model';
import { profileDefaults } from '../profile/profile';
import {
  isDue,
  plan,
  settle,
  stillWanted,
  turnOff,
  turnOn,
  type RunNow,
  type RunReply,
  type RunStart,
  type TuneUpContext,
  type TuneUpState,
  type TuneUpTrigger,
  TUNE_UP_EVERY_DAYS,
} from './cadence';

const TODAY = '2026-10-26';

const profile: Profile = {
  ...profileDefaults(TODAY),
  goal: 'lose',
  weeklyKg: 0.5,
  goalWeightKg: 65,
  saved: { kcal: 2100, protein: 150 },
};

const onState: TuneUpState = { on: true, lastCheckDay: '2026-10-12', savedPlan: null };
const idle: TuneUpContext = { today: TODAY, ready: true, running: false };
const busy: TuneUpContext = { ...idle, running: true };
const notReady: TuneUpContext = { ...idle, ready: false };
const newPlan: Targets = { kcal: 1900, protein: 140, carbs: 190, fat: 63 };
const success: RunReply = { ok: true, targets: newPlan };
const failure: RunReply = { ok: false };

function start(over: Partial<RunStart> = {}): RunStart {
  return { profile, switches: {}, ...over };
}

function now(over: Partial<RunNow> = {}): RunNow {
  return { state: onState, profile, switches: {}, ...over };
}

describe('isDue', () => {
  const cases: Array<[label: string, lastCheck: unknown, today: string, due: boolean]> = [
    ['never checked', null, TODAY, true],
    ['nothing stored', undefined, TODAY, true],
    ['an empty string', '', TODAY, true],
    ['not a calendar day', '2026-13-01', TODAY, true],
    ['not a string', 20261020, TODAY, true],
    ['checked today', TODAY, TODAY, false],
    ['checked 6 days ago', '2026-10-20', TODAY, false],
    ['checked 7 days ago', '2026-10-19', TODAY, true],
    ['checked 30 days ago', '2026-09-26', TODAY, true],
    ['a check day after today', '2026-10-30', TODAY, false],
    ['7 calendar days across the end of daylight time', '2026-10-29', '2026-11-05', true],
    ['6 calendar days across the end of daylight time', '2026-10-30', '2026-11-05', false],
  ];
  it.each(cases)('%s → due %s', (_label, lastCheck, today, due) => {
    expect(isDue(lastCheck, today)).toBe(due);
  });

  it('uses a seven-day interval', () => {
    expect(TUNE_UP_EVERY_DAYS).toBe(7);
  });
});

describe('plan', () => {
  const recent: TuneUpState = { ...onState, lastCheckDay: '2026-10-21' };
  const off: TuneUpState = { ...onState, on: false };
  const cases: Array<
    [
      label: string,
      state: TuneUpState,
      trigger: TuneUpTrigger,
      context: TuneUpContext,
      kind: string,
    ]
  > = [
    ['open when due runs', onState, 'open', idle, 'run'],
    ['visible when due runs', onState, 'visible', idle, 'run'],
    ['open when never checked runs', { ...onState, lastCheckDay: null }, 'open', idle, 'run'],
    ['open when checked 5 days ago skips', recent, 'open', idle, 'skip:notDue'],
    ['open while off skips', off, 'open', idle, 'skip:off'],
    ['open before onboarding is done skips', onState, 'open', notReady, 'skip:notReady'],
    ['open while a run is in flight skips', onState, 'open', busy, 'skip:running'],
    ['forced enable runs when not due', recent, 'enable', idle, 'run'],
    ['forced enable still skips while a run is in flight', recent, 'enable', busy, 'skip:running'],
    ['enable while off skips', off, 'enable', idle, 'skip:off'],
    ['a manual rebuild while on marks today', recent, 'manualRebuildDone', idle, 'markChecked'],
    ['a manual rebuild while off marks nothing', off, 'manualRebuildDone', idle, 'skip:off'],
    ['onboarding completion marks today', off, 'onboardingDone', notReady, 'markChecked'],
  ];
  it.each(cases)('%s', (_label, state, trigger, context, kind) => {
    const decision = plan(state, trigger, context);
    const got = decision.kind === 'skip' ? `skip:${decision.reason}` : decision.kind;
    expect(got).toBe(kind);
  });

  it('forces only the enable run', () => {
    expect(plan(onState, 'open', idle)).toStrictEqual({ kind: 'run', forced: false });
    expect(plan(onState, 'enable', idle)).toStrictEqual({ kind: 'run', forced: true });
  });

  it('marks today after a manual rebuild while on, so the same tap is not followed by a tune-up (R01.5)', () => {
    const decision = plan(onState, 'manualRebuildDone', idle);
    expect(decision).toStrictEqual({
      kind: 'markChecked',
      state: { ...onState, lastCheckDay: TODAY },
    });
    if (decision.kind === 'markChecked') {
      expect(plan(decision.state, 'open', idle)).toStrictEqual({ kind: 'skip', reason: 'notDue' });
    }
  });

  it('sets the check day to today when onboarding completes (R01.5)', () => {
    const fresh: TuneUpState = { on: true, lastCheckDay: null, savedPlan: null };
    const decision = plan(fresh, 'onboardingDone', idle);
    expect(decision).toStrictEqual({
      kind: 'markChecked',
      state: { ...fresh, lastCheckDay: TODAY },
    });
  });

  it('runs once for three visible events in a row (R01.5)', () => {
    let running = false;
    let runs = 0;
    for (let i = 0; i < 3; i += 1) {
      const decision = plan(onState, 'visible', { ...idle, running });
      if (decision.kind === 'run') {
        runs += 1;
        running = true;
      }
    }
    expect(runs).toBe(1);
  });
});

describe('stillWanted', () => {
  it('is true while on with the same switches', () => {
    expect(
      stillWanted(start({ switches: { energy: true } }), now({ switches: { energy: true } })),
    ).toBe(true);
  });

  it('is false once the switch is off or an input switch changed', () => {
    expect(stillWanted(start(), now({ state: { ...onState, on: false } }))).toBe(false);
    expect(
      stillWanted(start({ switches: { energy: true } }), now({ switches: { energy: false } })),
    ).toBe(false);
    expect(stillWanted(start(), now({ switches: { energy: true } }))).toBe(false);
  });
});

describe('settle', () => {
  it('marks today on a failure while still on, and keeps the plan (R01.5)', () => {
    expect(settle(start(), now(), failure, TODAY)).toStrictEqual({
      kind: 'failed',
      state: { ...onState, lastCheckDay: TODAY },
    });
  });

  it('marks nothing on a failure after the switch was turned off (R01.5)', () => {
    const turnedOff = now({ state: { ...onState, on: false } });
    expect(settle(start(), turnedOff, failure, TODAY)).toStrictEqual({ kind: 'abandoned' });
  });

  it('marks nothing on a failure after an input switch changed (R01.5)', () => {
    const changed = now({ switches: { energy: true } });
    expect(settle(start({ switches: { energy: false } }), changed, failure, TODAY)).toStrictEqual({
      kind: 'abandoned',
    });
  });

  it('marks today on a failure even when the profile changed meanwhile', () => {
    const edited = now({ profile: { ...profile, weightKg: 69 } });
    expect(settle(start(), edited, failure, TODAY).kind).toBe('failed');
  });

  it('applies and marks nothing on a success after the switch was turned off (R01.4)', () => {
    const turnedOff = now({ state: { ...onState, on: false } });
    expect(settle(start(), turnedOff, success, TODAY)).toStrictEqual({ kind: 'abandoned' });
  });

  it('applies and marks nothing on a success after an input switch changed (R01.4)', () => {
    const changed = now({ switches: { energy: false } });
    expect(settle(start({ switches: { energy: true } }), changed, success, TODAY)).toStrictEqual({
      kind: 'abandoned',
    });
  });

  const edits: Array<[field: string, edit: Partial<Profile>]> = [
    ['weight', { weightKg: 69.6 }],
    ['activity', { activity: 'active' }],
    ['goal body fat', { goalBodyFat: 0.2 }],
    ['allergens', { allergens: ['sesame'] }],
    ['a saved target', { saved: { kcal: 2200, protein: 150 } }],
    ['the calorie lock', { caloriesLocked: true }],
    ['a macro lock', { lockedMacros: ['fat'] }],
  ];
  it.each(edits)('drops a success when %s changed during the call (R01.4)', (_field, edit) => {
    const edited = now({ profile: { ...profile, ...edit } });
    expect(settle(start(), edited, success, TODAY)).toStrictEqual({ kind: 'dropped' });
  });

  it('drops a success when the profile is gone (R01.4)', () => {
    expect(settle(start(), now({ profile: null }), success, TODAY)).toStrictEqual({
      kind: 'dropped',
    });
  });

  it('applies all four targets, clears every lock and marks today', () => {
    const locked: Profile = { ...profile, caloriesLocked: true, lockedMacros: ['protein', 'fat'] };
    const result = settle(
      start({ profile: locked }),
      now({ profile: { ...locked } }),
      success,
      TODAY,
    );
    expect(result).toStrictEqual({
      kind: 'applied',
      state: { on: true, lastCheckDay: TODAY, savedPlan: { kcal: 2100, protein: 150 } },
      profile: { ...profile, saved: newPlan, caloriesLocked: false, lockedMacros: [] },
    });
  });

  it('keeps the first plan on the first success and the same snapshot on the second (R01.14)', () => {
    const first = settle(start(), now(), success, TODAY);
    expect(first.kind).toBe('applied');
    if (first.kind !== 'applied') return;
    expect(first.state.savedPlan).toStrictEqual({ kcal: 2100, protein: 150 });

    const nextWeek = '2026-11-02';
    const secondReply: RunReply = {
      ok: true,
      targets: { kcal: 1850, protein: 140, carbs: 180, fat: 62 },
    };
    const second = settle(
      start({ profile: first.profile }),
      now({ state: first.state, profile: first.profile }),
      secondReply,
      nextWeek,
    );
    expect(second.kind).toBe('applied');
    if (second.kind !== 'applied') return;
    expect(second.state.savedPlan).toStrictEqual({ kcal: 2100, protein: 150 });
    expect(second.state.lastCheckDay).toBe(nextWeek);
    expect(second.profile.saved).toStrictEqual(secondReply.targets);
  });

  it('keeps an all-automatic plan as an empty snapshot, not as nothing (R01.14)', () => {
    const automatic: Profile = { ...profile, saved: {} };
    const result = settle(
      start({ profile: automatic }),
      now({ profile: automatic }),
      success,
      TODAY,
    );
    expect(result.kind === 'applied' && result.state.savedPlan).toStrictEqual({});
  });
});

describe('turnOff', () => {
  it('restores the kept plan and deletes it (R01.14)', () => {
    const state: TuneUpState = {
      on: true,
      lastCheckDay: TODAY,
      savedPlan: { kcal: 2100, protein: 150 },
    };
    const tuned: Profile = { ...profile, saved: newPlan };
    const result = turnOff(state, tuned);
    expect(result.state).toStrictEqual({ on: false, lastCheckDay: TODAY, savedPlan: null });
    expect(result.profile).toStrictEqual({ ...profile, saved: { kcal: 2100, protein: 150 } });
  });

  it('restores the plan from before the first tune-up after two runs (R01.14)', () => {
    const first = settle(start(), now(), success, TODAY);
    if (first.kind !== 'applied') throw new Error('expected the first run to apply');
    const second = settle(
      start({ profile: first.profile }),
      now({ state: first.state, profile: first.profile }),
      { ok: true, targets: { kcal: 1800, protein: 135, carbs: 175, fat: 60 } },
      '2026-11-02',
    );
    if (second.kind !== 'applied') throw new Error('expected the second run to apply');
    expect(turnOff(second.state, second.profile).profile?.saved).toStrictEqual(profile.saved);
  });

  it('leaves locks as they are: they are not part of the kept plan', () => {
    const state: TuneUpState = { ...onState, savedPlan: { kcal: 2000 } };
    const locked: Profile = { ...profile, caloriesLocked: true, lockedMacros: ['protein'] };
    const result = turnOff(state, locked);
    expect(result.profile?.caloriesLocked).toBe(true);
    expect(result.profile?.lockedMacros).toStrictEqual(['protein']);
  });

  it('writes no profile when nothing is kept', () => {
    expect(turnOff(onState, profile)).toStrictEqual({
      state: { ...onState, on: false },
      profile: null,
    });
  });
});

describe('turnOn', () => {
  const offState: TuneUpState = { on: false, lastCheckDay: '2026-10-24', savedPlan: null };

  it('clears every lock and forces a run even when not due', () => {
    const locked: Profile = { ...profile, caloriesLocked: true, lockedMacros: ['carbs'] };
    const result = turnOn(offState, locked, idle);
    expect(result.state).toStrictEqual({ ...offState, on: true });
    expect(result.profile).toStrictEqual({ ...profile, caloriesLocked: false, lockedMacros: [] });
    expect(result.decision).toStrictEqual({ kind: 'run', forced: true });
  });

  it('writes no profile when nothing is locked', () => {
    expect(turnOn(offState, profile, idle).profile).toBeNull();
  });

  it('does not start a second run while one is in flight (R01.5)', () => {
    expect(turnOn(offState, profile, busy).decision).toStrictEqual({
      kind: 'skip',
      reason: 'running',
    });
  });
});
