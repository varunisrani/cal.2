import { describe, expect, it } from 'vitest';
import { defaultProfile, profileWith } from '../../domain/goals/__fixtures__/profiles';
import { countedBurn, walkBurn } from '../../features/home/burn';
import { makeBodyFat, makeProfile, makeWalk, makeWater } from '../../test/factories';
import {
  FIXTURE_FOOD_NAMES,
  SNAPSHOT_TODAY,
  activityOn,
  at,
  connectedActivity,
  entryOn,
  fastFrom,
  fixtureDiary,
  makeSnapshot,
  weighInOn,
  workoutOn,
} from './__fixtures__/snapshot';
import { coachContext, countedActiveKcal, countedWalkKcal } from './context';
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

  it('gives the local time now, for reminders and words like tonight (P13)', () => {
    expect(coachContext(makeSnapshot())).toContain(
      'in the time zone America/New_York. The time there is 12:30.',
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

  it('gives the height in feet and inches to a person who reads them, every weight in kg (D-16.91)', () => {
    const text = coachContext(
      makeSnapshot({ units: { energy: 'kcal', weight: 'kg', height: 'ftIn' } }),
    );
    expect(text).toContain('- Height: 5 ft 6 in');
    expect(text).toContain('- Weight: 64.0 kg');
    expect(text).toContain('- Goal: lose weight at 0.5 kg a week');
    expect(text).toContain('- Goal weight: 60.0 kg');
    expect(text).not.toMatch(/\d lb/);
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

  it('gives the days to the goal weight in kg for a person losing toward it (D-16.91)', () => {
    const text = coachContext(
      makeSnapshot({
        profile: profileWith({ goal: 'lose', goalWeightKg: 68, weeklyKg: 0.5 }),
        entries: [
          entryOn('2026-10-24', '13:00', { kcal: 1902 }),
          entryOn('2026-10-25', '13:00', { kcal: 1902 }),
        ],
        weighIns: [weighInOn('2026-10-18', 70.5), weighInOn('2026-10-25', 70)],
      }),
    );
    // 1 902 against a 2 452 burn: 550 kcal a day short, 0.5 kg a week, 2 kg in 28 days.
    expect(text).toContain('- Pace the food log points to: -0.50 kg a week');
    expect(text).toContain(
      '- Goal weight of 68.0 kg reached in about 28 days at this pace (around 2026-11-23)',
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

describe("coachContext: today's sugar against the Sugar limit (D-16.98)", () => {
  /** Today's two entries with these sugar figures (none for undefined), and yesterday's 90 g. */
  function sugarDay(today: readonly (number | undefined)[], changes: Partial<CoachSnapshot> = {}) {
    return coachContext(
      makeSnapshot({
        entries: [
          entryOn('2026-10-25', '19:00', { nutrients: { sugar: 90 } }),
          ...today.map((sugar, index) =>
            entryOn(SNAPSHOT_TODAY, `${String(8 + index).padStart(2, '0')}:00`, {
              nutrients: sugar === undefined ? { fibre: 3 } : { sugar, addedSugar: 2 },
            }),
          ),
        ],
        ...changes,
      }),
    );
  }

  it("gives today's grams against the limit, between what is left and water", () => {
    const text = sugarDay([20, 12], { sugarLimitG: 50 });
    expect(text).toMatch(
      /\n- Left of the daily targets: [^\n]+\n- Sugar: 32 g \(daily limit 50 g\)\n- Water: /,
    );
    expect(text).not.toContain('90 g');
  });

  it('gives the grams to one decimal, over the limit or not', () => {
    expect(sugarDay([40, 18.44], { sugarLimitG: 50 })).toContain(
      '- Sugar: 58.4 g (daily limit 50 g)',
    );
  });

  it("uses the person's own limit, and says when none is set", () => {
    expect(sugarDay([20, 12], { sugarLimitG: 25 })).toContain('- Sugar: 32 g (daily limit 25 g)');
    expect(sugarDay([20, 12], { sugarLimitG: 0 })).toContain('- Sugar: 32 g (no daily limit set)');
  });

  it('reads an unset limit as the default 50 g', () => {
    expect(sugarDay([20])).toContain('- Sugar: 20 g (daily limit 50 g)');
  });

  it('says how many entries had a figure when not all did, never counting the rest as 0 g', () => {
    expect(sugarDay([12, undefined, 6], { sugarLimitG: 50 })).toContain(
      '- Sugar: 18 g (daily limit 50 g), from 2 of 3 entries; the rest have no figure',
    );
  });

  it('says sugar is not known, rather than 0 g, when no entry today has a figure', () => {
    const text = sugarDay([undefined, undefined], { sugarLimitG: 50 });
    expect(text).toContain(
      '- Sugar: not known, no entry today has a sugar figure (daily limit 50 g)',
    );
    expect(text).not.toMatch(/Sugar: 0/);
  });

  it('gives the limit alone when nothing is logged today', () => {
    expect(coachContext(makeSnapshot({ sugarLimitG: 40 }))).toContain(
      '- Sugar: nothing logged yet (daily limit 40 g)',
    );
    expect(coachContext(makeSnapshot({ sugarLimitG: 0 }))).toContain(
      '- Sugar: nothing logged yet (no daily limit set)',
    );
  });
});

/** Today's Health Connect day: a run in the morning and a gym session in the evening. */
function activeToday() {
  return activityOn(SNAPSHOT_TODAY, {
    steps: 8412,
    activeKcal: 420.4,
    totalKcal: 2310.6,
    distanceM: 6234,
    sessions: [
      workoutOn(SNAPSHOT_TODAY, '18:00', 45, { type: 'strengthTraining' }),
      workoutOn(SNAPSHOT_TODAY, '07:10', 35, { activeKcal: 310.2, title: 'Run with Anna' }),
    ],
  });
}

/** The default profile (a 2452 kcal target) with the fixture diary and Health Connect. */
function withActivity(activity: CoachSnapshot['activity'], changes: Partial<CoachSnapshot> = {}) {
  return coachContext(
    makeSnapshot({ profile: defaultProfile, entries: fixtureDiary(), activity, ...changes }),
  );
}

describe('coachContext: Health Connect activity (D-16.94)', () => {
  it("gives today's figures and workouts, and the target with today's active calories counted in", () => {
    const yesterday = activityOn('2026-10-25', { steps: 15_001, activeKcal: 777 });
    const text = withActivity(connectedActivity([yesterday, activeToday()]));
    expect(text).toContain(
      [
        'Activity today, from Health Connect on their phone:',
        '- Steps: 8412',
        '- Active calories, burned by moving: 420 kcal',
        '- Total calories burned, resting burn included: 2311 kcal',
        '- Distance: 6.2 km',
        '- Workouts: running at 07:10 for 35 min (310 kcal active); strength training at 18:00 for 45 min',
        '- "Count active calories" is on, so today\'s energy target is the 2452 kcal goal + 420 kcal active = 2872 kcal',
      ].join('\n'),
    );
    // What is left is worked out from today's target, as Home shows it; the goal stays the goal.
    expect(text).toContain(
      "- Left of today's targets, active calories counted in: 1722 kcal, protein 63 g, carbs 266 g, fat 1.5 g",
    );
    expect(text).toContain('- Daily targets in effect: 2452 kcal,');
    expect(text).not.toContain('15001');
    expect(text).not.toContain('777');
  });

  it('keeps the target at the goal when counting is off, saying active calories are not added', () => {
    const text = withActivity(connectedActivity([activeToday()], { countActive: false }));
    expect(text).toContain(
      '- "Count active calories" is off, so today\'s energy target is the 2452 kcal goal; active calories are not added to it',
    );
    expect(text).toContain('- Left of the daily targets: 1302 kcal,');
    expect(text).toContain('- Active calories, burned by moving: 420 kcal');
  });

  it('adds nothing when counting is on but today has no active calories, and says each missing figure', () => {
    const text = withActivity(connectedActivity([activityOn(SNAPSHOT_TODAY, { steps: 2000 })]));
    expect(text).toContain('- Steps: 2000');
    expect(text).toContain('- Active calories, burned by moving: none recorded');
    expect(text).toContain('- Total calories burned, resting burn included: none recorded');
    expect(text).toContain('- Distance: none recorded');
    expect(text).toContain('- Workouts: none recorded');
    expect(text).toContain(
      '- "Count active calories" is on, but there are no active calories to add yet, so today\'s energy target is the 2452 kcal goal',
    );
    expect(text).toContain('- Left of the daily targets: 1302 kcal,');
  });

  it('says nothing is recorded yet today when Health Connect has no figure for today', () => {
    const text = withActivity(connectedActivity([activityOn('2026-10-25', { steps: 9000 })]));
    expect(text).toContain(
      'Activity today, from Health Connect on their phone:\n- Nothing recorded yet today\n- "Count active calories" is on, but there are no active calories to add yet',
    );
    expect(text).not.toContain('Steps:');
  });

  it('gives miles beside km to a person who reads feet and inches', () => {
    const text = withActivity(connectedActivity([activeToday()]), {
      units: { energy: 'kcal', weight: 'kg', height: 'ftIn' },
    });
    expect(text).toContain('- Distance: 6.2 km (they read miles: 3.9 mi)');
  });

  it('never carries a workout title or the app that recorded it', () => {
    const text = withActivity(connectedActivity([activeToday()]));
    expect(text).not.toContain('Run with Anna');
    expect(text).not.toContain('com.example.watch');
  });

  it('has no activity lines on the web or while Health Connect is not connected', () => {
    const text = withActivity(null);
    expect(text).not.toMatch(/Health Connect|Count active calories|Steps|Activity today/);
    expect(text).toContain('- Left of the daily targets: 1302 kcal,');
  });

  it("counts today's active calories in the target the way Home does (P11-04)", () => {
    const on = connectedActivity([]);
    const days = [
      null,
      activityOn(SNAPSHOT_TODAY),
      activityOn(SNAPSHOT_TODAY, { activeKcal: 0.4 }),
      activityOn(SNAPSHOT_TODAY, { activeKcal: 0.5 }),
      activityOn(SNAPSHOT_TODAY, { activeKcal: 420.6 }),
    ];
    for (const goal of [0, 1800]) {
      for (const day of days) {
        expect(countedActiveKcal(goal, on, day)).toBe(countedBurn(goal, day));
        expect(countedActiveKcal(goal, { ...on, countActive: false }, day)).toBeNull();
        expect(countedActiveKcal(goal, null, day)).toBeNull();
      }
    }
  });
});

describe('coachContext: recorded walks without Health Connect (D-16.96)', () => {
  const todaysWalk = makeWalk({ startedAt: at(SNAPSHOT_TODAY, '08:05'), activeKcal: 90 });
  const yesterdays = makeWalk({ startedAt: at('2026-10-25', '08:00'), activeKcal: 300 });
  const walks = (countActive = true) => ({ countActive, items: [todaysWalk, yesterdays] });

  it("lists today's walks and counts their active calories in the target, as Home does", () => {
    const text = withActivity(null, { walks: walks() });
    expect(text).toContain(
      [
        'Walks today, recorded in Platewise (Health Connect is not connected):',
        '- Walk at 08:05: 30 min, 2.6 km, 90 kcal active, walk score 81',
        '- "Count active calories" is on, so today\'s energy target is the 2452 kcal goal + 90 kcal from today\'s walks = 2542 kcal',
      ].join('\n'),
    );
    expect(text).toContain(
      "- Left of today's targets, active calories counted in: 1392 kcal, protein",
    );
    expect(text).not.toContain('300 kcal');
  });

  it('keeps the goal while counting is off, and says when no walk is recorded today', () => {
    const off = withActivity(null, { walks: walks(false) });
    expect(off).toContain(
      '- "Count active calories" is off, so today\'s energy target is the 2452 kcal goal; walks are not added to it',
    );
    expect(off).toContain('- Left of the daily targets: 1302 kcal,');
    const none = withActivity(null, { walks: { countActive: true, items: [yesterdays] } });
    expect(none).toContain('- No walk recorded yet today');
    expect(none).toContain('- Left of the daily targets: 1302 kcal,');
  });

  it("counts Health Connect's burn alone while it is connected", () => {
    const text = withActivity(connectedActivity([activeToday()]), { walks: walks() });
    expect(text).toContain('2452 kcal goal + 420 kcal active = 2872 kcal');
    expect(text).not.toContain('Walks today');
  });

  it("counts today's walks the way Home does (P15-03)", () => {
    for (const goal of [0, 1800]) {
      expect(countedWalkKcal(goal, null, walks(), SNAPSHOT_TODAY)).toBe(
        walkBurn(goal, [todaysWalk]),
      );
      expect(countedWalkKcal(goal, null, walks(false), SNAPSHOT_TODAY)).toBeNull();
      expect(countedWalkKcal(goal, connectedActivity([]), walks(), SNAPSHOT_TODAY)).toBeNull();
      expect(countedWalkKcal(goal, null, null, SNAPSHOT_TODAY)).toBeNull();
    }
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
