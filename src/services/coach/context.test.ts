import { describe, expect, it } from 'vitest';
import { defaultProfile, profileWith } from '../../domain/goals/__fixtures__/profiles';
import { makeBodyFat, makeProfile, makeWater } from '../../test/factories';
import {
  FIXTURE_FOOD_NAMES,
  at,
  entryOn,
  fastFrom,
  fixtureDiary,
  makeSnapshot,
  weighInOn,
} from './__fixtures__/snapshot';
import { coachContext } from './context';
import type { CoachSnapshot } from './snapshot';

/** Words that would point the model at workouts, which v1 does not have. */
const WORKOUT_WORDS = /workout|exercise|training|gym|lift|strength|sets? and reps/i;

/** A snapshot with every kind of data in it. */
function fullSnapshot(changes: Partial<CoachSnapshot> = {}): CoachSnapshot {
  return makeSnapshot({
    profile: makeProfile({ bodyFat: 0.28, goalBodyFat: 0.22 }),
    entries: fixtureDiary(),
    weighIns: [weighInOn('2026-10-20', 64.4), weighInOn('2026-10-25', 64)],
    bodyFat: [makeBodyFat({ at: at('2026-10-22'), fraction: 0.28 })],
    fasts: [fastFrom(at('2026-10-24', '20:00'), at('2026-10-25', '12:00'))],
    water: { on: true, goalMl: 2000, unit: 'ml', logs: [makeWater({ ml: 500 })] },
    ...changes,
  });
}

describe('coachContext: today', () => {
  it('names the local day with its weekday and the time zone', () => {
    expect(coachContext(makeSnapshot())).toContain(
      'Today is Monday 2026-10-26 in the time zone America/New_York.',
    );
  });
});

describe('coachContext: the person', () => {
  it('gives the profile in kg and cm, with the goal, its pace and the goal weight', () => {
    const text = coachContext(makeSnapshot());
    expect(text).toContain('- Sex: female');
    expect(text).toContain('- Age: 32');
    expect(text).toContain('- Height: 168 cm');
    expect(text).toContain('- Weight: 64.0 kg');
    expect(text).toContain('- Activity level: light');
    expect(text).toContain('- Goal: lose weight at 0.5 kg a week');
    expect(text).toContain('- Goal weight: 60.0 kg');
  });

  it('gives the profile in lb and feet and inches for a person who reads those', () => {
    const text = coachContext(
      makeSnapshot({ units: { energy: 'kcal', weight: 'lb', height: 'ftIn' } }),
    );
    expect(text).toContain('- Height: 5 ft 6 in');
    expect(text).toContain('- Weight: 141.1 lb');
    expect(text).toContain('- Goal: lose weight at 1.1 lb a week');
    expect(text).toContain('- Goal weight: 132.3 lb');
    expect(text).not.toMatch(/\d kg/);
  });

  it('gives body fat and goal body fat to one decimal only when they are set (D-16.64)', () => {
    const set = coachContext(
      makeSnapshot({ profile: makeProfile({ bodyFat: 0.245, goalBodyFat: 0.18 }) }),
    );
    expect(set).toContain('- Body fat: 24.5 %');
    expect(set).toContain('- Goal body fat: 18.0 %');
    const unset = coachContext(makeSnapshot());
    expect(unset).not.toContain('Body fat:');
    expect(unset).not.toContain('Goal body fat');
  });

  it('says a maintain goal keeps the weight and leaves out a goal weight that is not set', () => {
    const text = coachContext(makeSnapshot({ profile: defaultProfile }));
    expect(text).toContain('- Goal: keep their weight where it is');
    expect(text).not.toContain('Goal weight');
  });
});

describe('coachContext: energy numbers', () => {
  it('names the standard equation when no body fat is set and gives BMR, TDEE and the targets', () => {
    const text = coachContext(makeSnapshot({ profile: defaultProfile }));
    expect(text).toContain(
      '- Resting burn (BMR): 1673 kcal a day, from the Mifflin-St Jeor equation, because no body fat is set',
    );
    expect(text).toContain(
      '- Daily burn (TDEE): BMR × 1.465 for the moderate activity level = 2452 kcal a day',
    );
    expect(text).toContain(
      '- Daily targets in effect: 2452 kcal, protein 112 g, carbs 406 g, fat 42 g',
    );
  });

  it('names the lean-mass equation when body fat is set', () => {
    const text = coachContext(makeSnapshot({ profile: profileWith({ bodyFat: 0.2 }) }));
    expect(text).toContain('1579 kcal a day, from the Katch-McArdle equation');
    expect(text).toContain('because their body fat is set');
  });

  it('uses the saved targets where there are some', () => {
    const profile = profileWith({ saved: { kcal: 2000 } });
    expect(coachContext(makeSnapshot({ profile }))).toContain(
      '- Daily targets in effect: 2000 kcal,',
    );
  });
});

describe('coachContext: the weight forecast (P01-18)', () => {
  it('lists the forecast with two food days and two weigh-ins (ACC-C13-1)', () => {
    const text = coachContext(
      makeSnapshot({
        profile: defaultProfile,
        entries: [
          entryOn('2026-10-24', '13:00', { kcal: 2400 }),
          entryOn('2026-10-25', '13:00', { kcal: 2500 }),
        ],
        weighIns: [weighInOn('2026-10-20', 70.2), weighInOn('2026-10-25', 70)],
      }),
    );
    expect(text).toContain('Weight forecast from the last 90 finished days (today not counted):');
    expect(text).toContain('- Days with food logged: 2');
    expect(text).toContain('- Weigh-ins used: 2');
    expect(text).toContain('- Average intake on the days with food logged: 2450 kcal');
    expect(text).toContain(
      '- Daily balance against the daily burn: -2 kcal (below 0 is a deficit)',
    );
    expect(text).toContain('- Pace the food log points to: +0.00 kg a week');
    expect(text).toMatch(/- Pace the scale shows: -0\.\d\d kg a week/);
    expect(text).toContain(
      '- Expected weight: 70.0 kg in 30 days, 70.0 kg in 60 days, 70.0 kg in 90 days',
    );
    expect(text).not.toContain('not enough data');
  });

  it('says there is not enough data with only one weigh-in, naming both minimums', () => {
    const text = coachContext(
      makeSnapshot({
        entries: [entryOn('2026-10-24', '13:00'), entryOn('2026-10-25', '13:00')],
        weighIns: [weighInOn('2026-10-25', 64)],
      }),
    );
    expect(text).toContain(
      'Weight forecast: not enough data yet. It needs at least 2 days with food logged and 2 ' +
        'weigh-ins in the last 90 finished days (today not counted); so far there are 2 days ' +
        'with food and 1 weigh-in.',
    );
    expect(text).not.toContain('Expected weight');
  });

  it('flags possible under-logging when the food log and the scale disagree', () => {
    const text = coachContext(
      makeSnapshot({
        profile: defaultProfile,
        entries: [
          entryOn('2026-10-24', '13:00', { kcal: 1000 }),
          entryOn('2026-10-25', '13:00', { kcal: 1000 }),
        ],
        weighIns: [weighInOn('2026-10-20', 70), weighInOn('2026-10-25', 70)],
      }),
    );
    expect(text).toContain('- Daily balance against the daily burn: -1452 kcal');
    expect(text).toContain('- Pace the food log points to: -1.32 kg a week');
    expect(text).toContain('- Pace the scale shows: +0.00 kg a week');
    expect(text).toContain(
      '- Expected weight: 64.3 kg in 30 days, 58.7 kg in 60 days, 53.0 kg in 90 days',
    );
    expect(text).toContain(
      '- The two paces are more than 0.3 kg a week apart, so some food may be going unlogged',
    );
  });

  it('gives the days to the goal weight in lb for a person losing toward it', () => {
    const text = coachContext(
      makeSnapshot({
        profile: profileWith({ goal: 'lose', goalWeightKg: 68, weeklyKg: 0.5 }),
        units: { energy: 'kcal', weight: 'lb', height: 'cm' },
        entries: [
          entryOn('2026-10-24', '13:00', { kcal: 1902 }),
          entryOn('2026-10-25', '13:00', { kcal: 1902 }),
        ],
        weighIns: [weighInOn('2026-10-18', 70.5), weighInOn('2026-10-25', 70)],
      }),
    );
    // 1 902 against a 2 452 burn: 550 kcal a day short, 0.5 kg a week, 2 kg in 28 days.
    expect(text).toContain('- Pace the food log points to: -1.10 lb a week');
    expect(text).toContain(
      '- Goal weight of 149.9 lb reached in about 28 days at this pace (around 2026-11-23)',
    );
    expect(text).not.toContain('unlogged');
  });
});

describe('coachContext: data on record and the missing-log rule (R04.16)', () => {
  it('counts weigh-ins, body-fat readings, entries and tracked fasts, pointing at data_overview', () => {
    const text = coachContext(
      fullSnapshot({
        fasts: [
          fastFrom(at('2026-10-24', '20:00'), at('2026-10-25', '12:00')),
          fastFrom(at('2026-10-26', '10:00'), null),
        ],
      }),
    );
    expect(text).toContain(
      '- 2 weigh-ins, 1 body-fat reading and 4 food entries in all; data_overview gives the first and last day of each',
    );
    expect(text).toContain('- 2 fasts tracked with the fasting timer, one of them running now');
  });

  it('says a day without entries is neither a fast nor 0 kcal', () => {
    const text = coachContext(makeSnapshot());
    expect(text).toContain('- 0 weigh-ins, 0 body-fat readings and 0 food entries in all');
    expect(text).toContain('- 0 fasts tracked with the fasting timer');
    expect(text).toContain(
      'A day without food entries only means nothing was logged that day. Never treat it as a fast or as a day of 0 kcal',
    );
  });
});

describe('coachContext: today so far (D-16.27)', () => {
  it("gives today's intake, what is left of each target and water (ACC-I6-1)", () => {
    const text = coachContext(
      makeSnapshot({
        profile: defaultProfile,
        entries: fixtureDiary(),
        water: {
          on: true,
          goalMl: 2000,
          unit: 'ml',
          logs: [
            makeWater({ ml: 500 }),
            makeWater({ ml: 250 }),
            makeWater({ at: at('2026-10-25'), ml: 900 }),
          ],
        },
      }),
    );
    expect(text).toContain('Today so far:');
    expect(text).toContain(
      '- Eaten: 1150 kcal, protein 49 g, carbs 140 g, fat 40.5 g, from 2 entries',
    );
    expect(text).toContain(
      '- Left of the daily targets: 1302 kcal, protein 63 g, carbs 266 g, fat 1.5 g (a negative amount is over the target)',
    );
    expect(text).toContain('- Water: 750 ml of a 2000 ml goal');
  });

  it('shows the whole targets left when nothing is logged today', () => {
    const text = coachContext(makeSnapshot({ profile: defaultProfile }));
    expect(text).toContain('- Eaten: nothing logged yet today');
    expect(text).toContain(
      '- Left of the daily targets: 2452 kcal, protein 112 g, carbs 406 g, fat 42 g',
    );
  });

  it('shows an amount over a target as negative', () => {
    const text = coachContext(
      makeSnapshot({
        profile: profileWith({ saved: { kcal: 2000 } }),
        entries: [entryOn('2026-10-26', '09:00', { kcal: 2150 })],
      }),
    );
    expect(text).toContain('- Left of the daily targets: -150 kcal');
  });

  it('says water is not tracked when tracking is off, and gives fl oz to a person who reads them', () => {
    const off = coachContext(
      makeSnapshot({ water: { on: false, goalMl: 2000, unit: 'ml', logs: [makeWater()] } }),
    );
    expect(off).toContain('- Water: not tracked (water tracking is switched off)');
    const ounces = coachContext(
      makeSnapshot({
        water: { on: true, goalMl: 2000, unit: 'flOz', logs: [makeWater({ ml: 750 })] },
      }),
    );
    expect(ounces).toContain(
      '- Water: 750 ml of a 2000 ml goal (they read fl oz: 25.4 of 67.6 fl oz)',
    );
  });
});

describe('coachContext: energy unit', () => {
  it('adds the kJ rule, with tool arguments kept in kcal, only for a kJ reader', () => {
    const kj = coachContext(makeSnapshot({ units: { energy: 'kJ', weight: 'kg', height: 'cm' } }));
    expect(kj).toContain('The person reads energy in kilojoules.');
    expect(kj).toContain('4.184');
    expect(kj).toContain('energy you pass to a tool stays in kcal');
    const kcal = coachContext(makeSnapshot());
    expect(kcal).not.toContain('kilojoules');
    expect(kcal).not.toContain('kJ');
  });
});

describe('coachContext: what never enters it', () => {
  it('holds no food name or note from the diary', () => {
    const text = coachContext(fullSnapshot());
    for (const name of FIXTURE_FOOD_NAMES) expect(text).not.toContain(name);
    expect(text).not.toContain('Second helping');
    expect(text).not.toContain('Lentil soup');
  });

  it('holds no workout words (R04.20)', () => {
    expect(coachContext(fullSnapshot())).not.toMatch(WORKOUT_WORDS);
    expect(coachContext(makeSnapshot())).not.toMatch(WORKOUT_WORDS);
  });

  it('leaves the snapshot as it was', () => {
    const snapshot = fullSnapshot();
    const before = structuredClone(snapshot);
    coachContext(snapshot);
    expect(snapshot).toEqual(before);
  });
});
