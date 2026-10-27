import { describe, expect, it } from 'vitest';
import { profileDefaults } from '../../domain/profile/profile';
import { ftInWheel, weightFromWheel, weightShown } from '../../domain/units/body';
import {
  canContinue,
  canGoBack,
  estimatedDays,
  LAST_STEP_INDEX,
  progressOf,
  reminderAnswerOf,
  remindersOn,
  startWizard,
  stepIndex,
  targetProblem,
  WIZARD_STEPS,
  wizardProfile,
  wizardReducer,
  type WizardAction,
  type WizardState,
  type WizardStep,
  type WizardUnits,
} from './wizard';

const TODAY = '2026-10-26';
const METRIC: WizardUnits = { height: 'cm', weight: 'kg' };
const FEET_INCHES: WizardUnits = { height: 'ftIn', weight: 'kg' };
const PLAN = { kcal: 2_100, protein: 120, carbs: 250, fat: 70 };

function run(state: WizardState, ...actions: WizardAction[]): WizardState {
  return actions.reduce(wizardReducer, state);
}

function at(step: WizardStep, changes: Partial<WizardState> = {}): WizardState {
  return { ...startWizard(TODAY, METRIC), step, ...changes };
}

/** Walks a fresh wizard to `step` with Continue only. */
function walkTo(step: WizardStep, start = startWizard(TODAY, METRIC)): WizardState {
  let state = start;
  while (state.step !== step) {
    const next = wizardReducer(state, { type: 'next' });
    if (next === state) throw new Error(`stuck on ${state.step}`);
    state = next;
  }
  return state;
}

describe('startWizard', () => {
  it('opens on Welcome with the default profile, a steady pace and nothing answered', () => {
    const state = startWizard(TODAY, METRIC);
    const defaults = profileDefaults(TODAY);

    expect(state.step).toBe('welcome');
    expect(state).toMatchObject({
      sex: 'male',
      birthDate: '2001-10-26',
      heightCm: defaults.heightCm,
      weightKg: 70,
      activity: 'moderate',
      goal: 'maintain',
      bodyFat: null,
      goalBodyFat: null,
      targetKg: 70,
      targetMoved: false,
      pace: 'steady',
      reminders: null,
      aiReady: false,
      buildRun: 0,
      plan: null,
      finished: false,
    });
    expect(wizardProfile(state)).toEqual(defaults);
  });

  it('numbers thirteen steps from Welcome (0) to Plan ready (12)', () => {
    expect(WIZARD_STEPS).toHaveLength(13);
    expect(LAST_STEP_INDEX).toBe(12);
    expect(stepIndex('reminders')).toBe(9);
    expect(stepIndex('aiAccess')).toBe(10);
    expect(stepIndex('planReady')).toBe(12);
  });
});

describe('units', () => {
  it('keeps 70.0 kg and 170 cm through cm → ft and in → cm: weight is kg only (R01.3, ACC-B3-1, D-16.91)', () => {
    const start = at('body', { heightCm: 170 });
    const feetInches = run(start, { type: 'heightUnit', unit: 'ftIn' });

    expect(feetInches.units).toEqual(FEET_INCHES);
    expect(feetInches.weightKg).toBe(70);
    expect(weightShown(feetInches.weightKg, feetInches.units.weight)).toBe(70);

    const metric = run(feetInches, { type: 'heightUnit', unit: 'cm' });
    expect(metric.units).toEqual(METRIC);
    expect(metric.heightCm).toBe(170);
    expect(metric.weightKg).toBe(70);
  });

  it('shows 170 cm as 5 ft 7 in and keeps 170 cm through a round trip (R01.3)', () => {
    const start = at('body', { heightCm: 170 });
    const feetInches = run(start, { type: 'heightUnit', unit: 'ftIn' });

    expect(ftInWheel(feetInches.heightCm)).toEqual({ feet: 5, inches: 7 });
    expect(run(feetInches, { type: 'heightUnit', unit: 'cm' }).heightCm).toBe(170);
  });

  it('holds a height the new unit cannot show to that unit wheel, and never moves the weight', () => {
    const tall = run(at('body', { units: FEET_INCHES }), { type: 'height', cm: 271.78 });
    expect(run(tall, { type: 'heightUnit', unit: 'cm' }).heightCm).toBe(250);

    const light = run(at('body'), { type: 'weight', kg: 20 }, { type: 'goal', goal: 'gain' });
    const moved = run(light, { type: 'heightUnit', unit: 'ftIn' });
    expect(moved).toMatchObject({ weightKg: 20, targetKg: 25 });
  });

  it('switching to the height unit already in use changes nothing', () => {
    const start = at('body');
    expect(run(start, { type: 'heightUnit', unit: 'cm' })).toBe(start);
  });
});

describe('target weight', () => {
  const losing = run(at('goal'), { type: 'goal', goal: 'lose' }, { type: 'next' });

  it('blocks Continue for a lose target of 72 kg when the current weight is 70 (R01.6, ACC-B4-1)', () => {
    const state = run(losing, { type: 'target', kg: 72 });

    expect(state.step).toBe('target');
    expect(targetProblem(state)).toBe('notBelowCurrent');
    expect(canContinue(state)).toBe(false);
    expect(run(state, { type: 'next' }).step).toBe('target');
  });

  it('lets a lose target below the current weight pass and refuses an equal one (R01.6)', () => {
    expect(canContinue(run(losing, { type: 'target', kg: 69.9 }))).toBe(true);
    expect(targetProblem(run(losing, { type: 'target', kg: 70 }))).toBe('notBelowCurrent');
    expect(run(losing, { type: 'target', kg: 69.9 }, { type: 'next' }).step).toBe('pace');
  });

  it('refuses a gain target at or below the current weight (R01.6, D-16.11)', () => {
    const gaining = run(at('goal'), { type: 'goal', goal: 'gain' }, { type: 'next' });

    expect(targetProblem(run(gaining, { type: 'target', kg: 68 }))).toBe('notAboveCurrent');
    expect(targetProblem(run(gaining, { type: 'target', kg: 70 }))).toBe('notAboveCurrent');
    expect(canContinue(run(gaining, { type: 'target', kg: 70.1 }))).toBe(true);
  });

  it('skips the check for maintain', () => {
    const state = at('target', { goal: 'maintain', targetKg: 90, targetMoved: true });
    expect(targetProblem(state)).toBeNull();
    expect(canContinue(state)).toBe(true);
  });

  it('compares the weights as the person reads them, to the tenth of a kg', () => {
    // 70.02 kg reads 70.0 kg; a target of 69.98 kg is lower but reads the same.
    const heavier = run(losing, { type: 'weight', kg: 70.02 });
    const same = run(heavier, { type: 'target', kg: 69.98 });

    expect(same.targetKg).toBeLessThan(same.weightKg);
    expect(targetProblem(same)).toBe('notBelowCurrent');
    const below = run(heavier, {
      type: 'target',
      kg: weightFromWheel({ whole: 69, tenth: 9 }, 'kg'),
    });
    expect(targetProblem(below)).toBeNull();
  });

  it('seeds the target 5 kg under or over the current weight when a goal is chosen', () => {
    const start = at('goal');
    expect(run(start, { type: 'goal', goal: 'lose' }).targetKg).toBe(65);
    expect(run(start, { type: 'goal', goal: 'gain' }).targetKg).toBe(75);
    expect(
      run(start, { type: 'goal', goal: 'gain' }, { type: 'goal', goal: 'maintain' }).targetKg,
    ).toBe(70);
  });

  it('holds the seed to the weight wheel', () => {
    const light = run(at('goal'), { type: 'weight', kg: 22 }, { type: 'goal', goal: 'lose' });
    expect(light.targetKg).toBe(20);
  });

  it('re-seeds when the current weight changes, until the person moves the target', () => {
    const chosen = run(at('goal'), { type: 'goal', goal: 'lose' });
    expect(run(chosen, { type: 'weight', kg: 80 }).targetKg).toBe(75);

    const moved = run(chosen, { type: 'target', kg: 60 });
    const heavier = run(moved, { type: 'weight', kg: 80 });
    expect(heavier.targetKg).toBe(60);
    expect(heavier.targetMoved).toBe(true);
  });

  it('keeps a moved target when the same goal is picked again, and re-seeds for a new goal', () => {
    const moved = run(at('goal'), { type: 'goal', goal: 'lose' }, { type: 'target', kg: 60 });
    expect(run(moved, { type: 'goal', goal: 'lose' }).targetKg).toBe(60);

    const gaining = run(moved, { type: 'goal', goal: 'gain' });
    expect(gaining.targetKg).toBe(75);
    expect(gaining.targetMoved).toBe(false);
  });

  it('blocks again when the current weight moves past a target the person set', () => {
    const set = run(losing, { type: 'target', kg: 68 }, { type: 'next' });
    const lighter = run(
      set,
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
      { type: 'back' },
    );
    expect(lighter.step).toBe('bodyFat');

    const afterWeighIn = run(lighter, { type: 'back' }, { type: 'weight', kg: 66 });
    const back = walkTo('target', afterWeighIn);
    expect(back.targetKg).toBe(68);
    expect(canContinue(back)).toBe(false);
  });
});

describe('maintain', () => {
  it('skips the target check and drops pace and target weight from the profile', () => {
    const losing = run(at('goal'), { type: 'goal', goal: 'lose' }, { type: 'pace', pace: 'fast' });
    expect(wizardProfile(losing)).toMatchObject({ goal: 'lose', weeklyKg: 1, goalWeightKg: 65 });

    const keeping = run(losing, { type: 'goal', goal: 'maintain' });
    const profile = wizardProfile(keeping);
    expect(profile.goal).toBe('maintain');
    expect(profile).not.toHaveProperty('weeklyKg');
    expect(profile).not.toHaveProperty('goalWeightKg');
    expect(targetProblem({ ...keeping, targetKg: 99 })).toBeNull();
    expect(estimatedDays(keeping)).toBeNull();
  });

  it('keeps goal body fat only next to body fat', () => {
    const both = run(
      at('bodyFat'),
      { type: 'bodyFatKnown', known: true },
      { type: 'goalBodyFatOn', on: true },
      { type: 'goalBodyFat', percent: 15 },
    );
    expect(wizardProfile(both)).toMatchObject({ bodyFat: 0.2, goalBodyFat: 0.15 });

    const cleared = run(both, { type: 'bodyFatKnown', known: false });
    expect(wizardProfile(cleared)).not.toHaveProperty('bodyFat');
    expect(wizardProfile(cleared)).not.toHaveProperty('goalBodyFat');
    expect(run(cleared, { type: 'goalBodyFatOn', on: true }).goalBodyFat).toBeNull();
    expect(run(cleared, { type: 'goalBodyFat', percent: 12 })).toBe(cleared);
  });
});

describe('body fat', () => {
  it('starts at 20 % when the person says they know it, and keeps a value already set', () => {
    const known = run(at('bodyFat'), { type: 'bodyFatKnown', known: true });
    expect(known.bodyFat).toBe(0.2);
    const set = run(known, { type: 'bodyFat', percent: 24.5 });
    expect(set.bodyFat).toBe(0.245);
    expect(run(set, { type: 'bodyFatKnown', known: true }).bodyFat).toBe(0.245);
  });

  it('holds a picked value to 3–60 % and seeds the goal with the current value', () => {
    const known = run(at('bodyFat'), { type: 'bodyFatKnown', known: true });
    expect(run(known, { type: 'bodyFat', percent: 75 }).bodyFat).toBe(0.6);
    expect(run(known, { type: 'bodyFat', percent: 1 }).bodyFat).toBe(0.03);
    const withGoal = run(
      known,
      { type: 'bodyFat', percent: 28 },
      { type: 'goalBodyFatOn', on: true },
    );
    expect(withGoal.goalBodyFat).toBe(0.28);
    expect(run(withGoal, { type: 'goalBodyFatOn', on: false }).goalBodyFat).toBeNull();
  });
});

describe('birthday', () => {
  it('holds a future date to today and a date over 120 years back to that limit', () => {
    const start = at('birthday');
    expect(run(start, { type: 'birthDate', date: '1990-05-04' }).birthDate).toBe('1990-05-04');
    expect(run(start, { type: 'birthDate', date: '2026-12-01' }).birthDate).toBe(TODAY);
    expect(run(start, { type: 'birthDate', date: '1800-01-01' }).birthDate).toBe('1906-10-26');
  });

  it('ignores a date that is not a real day', () => {
    const start = at('birthday');
    expect(run(start, { type: 'birthDate', date: '1990-02-30' })).toBe(start);
  });
});

describe('Continue and Back', () => {
  it('moves one step at a time from Welcome to AI access', () => {
    expect(walkTo('aiAccess').step).toBe('aiAccess');
  });

  it('holds AI access until its setup is ready', () => {
    const state = at('aiAccess');
    expect(canContinue(state)).toBe(false);
    expect(run(state, { type: 'next' })).toBe(state);
    expect(run(state, { type: 'aiReady', ready: true }, { type: 'next' }).step).toBe(
      'buildingPlan',
    );
  });

  it('does nothing on Back from Welcome or Building plan', () => {
    const welcome = at('welcome');
    const building = at('buildingPlan', { buildRun: 1 });

    expect(canGoBack(welcome)).toBe(false);
    expect(canGoBack(building)).toBe(false);
    expect(run(welcome, { type: 'back' })).toBe(welcome);
    expect(run(building, { type: 'back' })).toBe(building);
  });

  it('goes back from Plan ready to AI access, skipping Building plan', () => {
    const ready = run(at('buildingPlan', { buildRun: 1 }), {
      type: 'planBuilt',
      run: 1,
      plan: PLAN,
      aiUnavailable: false,
    });
    expect(ready.step).toBe('planReady');

    const back = run(ready, { type: 'back' });
    expect(back.step).toBe('aiAccess');
    expect(back.plan).toEqual(ready.plan);
  });

  it('steps back one step elsewhere and keeps every answer', () => {
    const answered = run(at('activity'), { type: 'activity', activity: 'hard' });
    const back = run(answered, { type: 'back' }, { type: 'back' });
    expect(back.step).toBe('body');
    expect(back.activity).toBe('hard');
    expect(run(at('aiAccess'), { type: 'back' }).step).toBe('reminders');
  });
});

describe('building the plan', () => {
  it('starts a new run on each visit and accepts that run’s plan', () => {
    const building = run(at('aiAccess', { aiReady: true }), { type: 'next' });
    expect(building).toMatchObject({ step: 'buildingPlan', buildRun: 1 });
    expect(canContinue(building)).toBe(false);
    expect(run(building, { type: 'next' })).toBe(building);

    const ready = run(building, { type: 'planBuilt', run: 1, plan: PLAN, aiUnavailable: true });
    expect(ready.step).toBe('planReady');
    expect(ready.plan).toEqual({ draft: { plan: PLAN, touched: false }, aiUnavailable: true });
    expect(wizardProfile(ready).saved).toEqual(PLAN);
  });

  it('ignores a completion that arrives after the person left (R01.8)', () => {
    const first = run(at('aiAccess', { aiReady: true }), { type: 'next' });
    const ready = run(first, { type: 'planBuilt', run: 1, plan: PLAN, aiUnavailable: false });
    const left = run(ready, { type: 'back' });

    // A late second answer of the first run lands on AI access: nothing changes.
    const late = { ...PLAN, kcal: 1_500 };
    expect(run(left, { type: 'planBuilt', run: 1, plan: late, aiUnavailable: false })).toBe(left);

    // Back in Building plan, the old run's answer is still ignored; the new run's is taken.
    const second = run(left, { type: 'next' });
    expect(second.buildRun).toBe(2);
    expect(run(second, { type: 'planBuilt', run: 1, plan: late, aiUnavailable: false })).toBe(
      second,
    );
    const fresh = { ...PLAN, kcal: 1_900, carbs: 200 };
    const done = run(second, { type: 'planBuilt', run: 2, plan: fresh, aiUnavailable: false });
    expect(done.step).toBe('planReady');
    expect(done.plan?.draft.plan).toEqual(fresh);
  });

  it('edits the plan on Plan ready through the coupled plan rules', () => {
    const ready = run(at('buildingPlan', { buildRun: 1 }), {
      type: 'planBuilt',
      run: 1,
      plan: { kcal: 2_000, protein: 150, carbs: 200, fat: 60 },
      aiUnavailable: false,
    });
    const edited = run(ready, { type: 'planEdit', field: 'protein', value: 160 });

    expect(edited.plan?.draft).toEqual({
      plan: { kcal: 2_000, protein: 160, carbs: 205, fat: 60 },
      touched: true,
    });
    expect(run(at('pace'), { type: 'planEdit', field: 'kcal', value: 1_800 }).plan).toBeNull();
  });
});

describe('progress', () => {
  it('is index ÷ 12 on Sex to AI access and hidden on Welcome, Building plan and Plan ready', () => {
    expect(progressOf(at('sex'))).toBe(1 / 12);
    expect(progressOf(at('reminders'))).toBe(9 / 12);
    expect(progressOf(at('aiAccess'))).toBe(10 / 12);
    expect(progressOf(at('welcome'))).toBeNull();
    expect(progressOf(at('buildingPlan'))).toBeNull();
    expect(progressOf(at('planReady'))).toBeNull();
  });
});

describe('estimated days', () => {
  it('is trunc(|target − current| ÷ weekly × 7): 70 → 65 kg at 0.5 kg a week is 70 days', () => {
    const losing = run(at('pace'), { type: 'goal', goal: 'lose' });
    expect(losing.targetKg).toBe(65);
    expect(estimatedDays(losing)).toBe(70);
    expect(estimatedDays(run(losing, { type: 'pace', pace: 'fast' }))).toBe(35);
    expect(estimatedDays(run(losing, { type: 'pace', pace: 'slow' }))).toBe(140);
    expect(estimatedDays(run(losing, { type: 'target', kg: 64.9 }))).toBe(71);
  });
});

describe('reminders', () => {
  it('turns reminders on only for a grant', () => {
    expect(reminderAnswerOf('granted')).toBe('granted');
    expect(reminderAnswerOf('denied')).toBe('denied');
    expect(reminderAnswerOf('default')).toBe('dismissed');
    expect(reminderAnswerOf('unsupported')).toBe('unsupported');

    const start = at('reminders');
    expect(remindersOn(start)).toBe(false);
    expect(remindersOn(run(start, { type: 'remindersAnswered', answer: 'denied' }))).toBe(false);
    expect(remindersOn(run(start, { type: 'remindersAnswered', answer: 'granted' }))).toBe(true);
  });
});

describe('finishing', () => {
  it('sets finished only on Plan ready with a plan, once', () => {
    const ready = run(at('buildingPlan', { buildRun: 1 }), {
      type: 'planBuilt',
      run: 1,
      plan: PLAN,
      aiUnavailable: false,
    });
    const finished = run(ready, { type: 'finish' });

    expect(finished.finished).toBe(true);
    expect(finished.step).toBe('planReady');
    expect(finished.plan).toEqual(ready.plan);
    expect(run(finished, { type: 'finish' })).toBe(finished);

    // Anywhere else, or on Plan ready without a plan, nothing happens.
    const pace = at('pace');
    expect(run(pace, { type: 'finish' })).toBe(pace);
    const empty = at('planReady');
    expect(run(empty, { type: 'finish' })).toBe(empty);
  });
});
