// The facts block every Coach turn starts from (04 §3.8, D-16.27). It is rebuilt from the turn's
// snapshot on every question, so the model always sees the data as it stood when the person
// pressed Send: the local day, time and zone, the profile in the person's own units, how the energy
// numbers are worked out, the weight forecast (P01-18) or what it still needs, how much data is
// stored, and today so far (eaten, left of each target, sugar against the Sugar limit with how many
// entries had a figure, D-16.98, what today's food cost when any entry has a price, D-16.108, and
// water). It holds counts and totals only:
// no food name, note or ingredient ever enters it. In the Android app, while Health Connect is
// connected, it ends with today's activity: steps, active and total calories, distance, the
// workouts (type, time and length, never their titles), and whether "Count active calories" adds
// today's active calories to the energy target, as Home does (D-16.94, D-16.89); what is left is
// then worked out from that target. Without Health Connect nothing about activity or workouts
// appears, except where the app records walks (D-16.96): then today's walks are listed and, while
// "Count active calories" is on, their active calories go on the target, as Home does. Energy
// figures are kcal; a kJ reader's block adds the rule for answering in kJ.

import type { ActivityRow } from '../../data/schema';
import { ageOn } from '../../domain/dates/age';
import { dayKeyOf, daysBetween, type DayKey } from '../../domain/dates/dayKey';
import { weekStart } from '../../domain/dates/week';
import {
  DISAGREE_KG_PER_WEEK,
  FORECAST_MIN_FOOD_DAYS,
  FORECAST_MIN_WEIGH_INS,
  forecastWeight,
  type WeightForecast,
} from '../../domain/forecast/forecast';
import { EVIDENCE_DAYS } from '../../domain/forecast/evidence';
import {
  ACTIVITY_FACTORS,
  DEFAULT_WEEKLY_KG,
  bmr,
  bmrMethod,
  formulaPlan,
  tdee,
} from '../../domain/goals/formulas';
import { effectiveTargets } from '../../domain/goals/targets';
import type { DiaryEntry, Profile, Targets } from '../../domain/model';
import { spendOf } from '../../domain/money/spending';
import { DEFAULT_GOAL_VALUES } from '../../domain/nutrients/goalDefaults';
import { sugarOfDay } from '../../domain/nutrients/sugar';
import {
  feetInches,
  formatPace,
  heightCmShown,
  weightShown,
  weightToDisplay,
  type WeightDisplayUnit,
} from '../../domain/units/body';
import { waterShown } from '../../domain/units/water';
import {
  bullets,
  energyAndMacros,
  kilojouleLine,
  lines,
  num,
  oneDecimal,
  paragraphs,
  type DisplayUnits,
} from '../../ai/prompts/shared';
import {
  snapshotDay,
  type CoachActivity,
  type CoachSnapshot,
  type CoachWalks,
  type CoachWater,
} from './snapshot';
import type { NutritionToolName } from './toolSchemas';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** The tool the data section points at for date spans. */
const OVERVIEW_TOOL: NutritionToolName = 'data_overview';

/** The Settings switch that adds the day's active calories to its energy target. */
const COUNT_SWITCH = '"Count active calories"';

const METRES_PER_KM = 1_000;
const METRES_PER_MILE = 1_609.344;

// ---- Small formats --------------------------------------------------------------------------

function weekdayOf(day: DayKey): string {
  return WEEKDAYS[daysBetween(weekStart(day, 'sun'), day)] ?? '';
}

/** A weight in the person's unit at one decimal: "70.0 kg", "154.3 lb". */
function weightText(kg: number, unit: WeightDisplayUnit): string {
  return `${oneDecimal(weightShown(kg, unit))} ${unit}`;
}

/** A weekly pace in the person's unit, signed, two decimals: "-0.45 kg a week". */
function paceText(kgPerWeek: number, unit: WeightDisplayUnit): string {
  const value = Math.round(weightToDisplay(kgPerWeek, unit) * 100) / 100 + 0;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ${unit} a week`;
}

function percentText(fraction: number): string {
  return `${oneDecimal(fraction * 100)} %`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** A local wall-clock time: "07:05". */
function clockText(ms: number): string {
  const local = new Date(ms);
  return `${twoDigits(local.getHours())}:${twoDigits(local.getMinutes())}`;
}

// ---- Sections -------------------------------------------------------------------------------

function todaySection(today: DayKey, timeZone: string, now: number): string {
  return (
    `Today is ${weekdayOf(today)} ${today} in the time zone ${timeZone}. The time there is ` +
    `${clockText(now)}. Work out dates the person gives in relative terms (yesterday, last week, ` +
    'in March) from this day.'
  );
}

function goalText(profile: Profile, unit: WeightDisplayUnit): string {
  if (profile.goal === 'maintain') return 'keep their weight where it is';
  const pace = `${formatPace(profile.weeklyKg ?? DEFAULT_WEEKLY_KG, unit)} ${unit} a week`;
  return `${profile.goal === 'lose' ? 'lose' : 'gain'} weight at ${pace}`;
}

function profileSection(profile: Profile, today: DayKey, units: DisplayUnits): string {
  const { feet, inches } = feetInches(profile.heightCm);
  const height =
    units.height === 'ftIn' ? `${feet} ft ${inches} in` : `${heightCmShown(profile.heightCm)} cm`;
  return lines(
    'The person:',
    bullets(
      [
        `Sex: ${profile.sex}`,
        `Age: ${ageOn(profile.birthDate, today)}`,
        `Height: ${height}`,
        `Weight: ${weightText(profile.weightKg, units.weight)}`,
        `Activity level: ${profile.activity}`,
        `Goal: ${goalText(profile, units.weight)}`,
        profile.goalWeightKg !== undefined &&
          `Goal weight: ${weightText(profile.goalWeightKg, units.weight)}`,
        profile.bodyFat !== undefined && `Body fat: ${percentText(profile.bodyFat)}`,
        profile.goalBodyFat !== undefined && `Goal body fat: ${percentText(profile.goalBodyFat)}`,
      ].filter((line): line is string => typeof line === 'string'),
    ),
  );
}

function energySection(profile: Profile, today: DayKey, targets: Targets): string {
  const equation =
    bmrMethod(profile) === 'katch'
      ? 'the Katch-McArdle equation, which works from lean mass, because their body fat is set'
      : 'the Mifflin-St Jeor equation, because no body fat is set';
  const factor = ACTIVITY_FACTORS[profile.activity].multiplier;
  return lines(
    'How their energy numbers are worked out:',
    bullets([
      `Resting burn (BMR): ${Math.trunc(bmr(profile, today))} kcal a day, from ${equation}`,
      `Daily burn (TDEE): BMR × ${num(factor, 3)} for the ${profile.activity} activity level = ` +
        `${Math.trunc(tdee(profile, today))} kcal a day`,
      `Daily targets in effect: ${energyAndMacros(targets)}`,
    ]),
  );
}

function forecastLines(forecast: WeightForecast, profile: Profile, unit: WeightDisplayUnit) {
  const expected = forecast.expectedKg;
  return [
    `Days with food logged: ${forecast.daysLogged}`,
    `Weigh-ins used: ${forecast.weighInsUsed}`,
    `Average intake on the days with food logged: ${forecast.avgKcal} kcal`,
    `Daily balance against the daily burn: ${forecast.balanceKcal > 0 ? '+' : ''}` +
      `${forecast.balanceKcal} kcal (below 0 is a deficit)`,
    `Pace the food log points to: ${paceText(forecast.predictedWeeklyKg, unit)}`,
    forecast.observedWeeklyKg !== null &&
      `Pace the scale shows: ${paceText(forecast.observedWeeklyKg, unit)}`,
    `Expected weight: ${weightText(expected.d30, unit)} in 30 days, ` +
      `${weightText(expected.d60, unit)} in 60 days, ${weightText(expected.d90, unit)} in 90 days`,
    forecast.daysToGoal !== null &&
      profile.goalWeightKg !== undefined &&
      `Goal weight of ${weightText(profile.goalWeightKg, unit)} reached in about ` +
        `${forecast.daysToGoal} days at this pace (around ${forecast.goalDay ?? ''})`,
    forecast.trendsDisagree &&
      `The two paces are more than ${formatPace(DISAGREE_KG_PER_WEEK, unit)} ${unit} a week ` +
        'apart, so some food may be going unlogged',
  ].filter((line): line is string => typeof line === 'string');
}

function forecastSection(snapshot: CoachSnapshot, today: DayKey): string {
  const forecast = forecastWeight({
    profile: snapshot.profile,
    entries: snapshot.entries,
    weighIns: snapshot.weighIns,
    today,
  });
  const window = `the last ${EVIDENCE_DAYS} finished days (today not counted)`;
  if (!forecast.enoughData) {
    return (
      `Weight forecast: not enough data yet. It needs at least ${FORECAST_MIN_FOOD_DAYS} days ` +
      `with food logged and ${FORECAST_MIN_WEIGH_INS} weigh-ins in ${window}; so far there are ` +
      `${plural(forecast.daysLogged, 'day', 'days')} with food and ` +
      `${plural(forecast.weighInsUsed, 'weigh-in', 'weigh-ins')}. Encourage them to keep logging.`
    );
  }
  return lines(
    `Weight forecast from ${window}:`,
    bullets(forecastLines(forecast, snapshot.profile, snapshot.units.weight)),
  );
}

function dataSection(snapshot: CoachSnapshot): string {
  const running = snapshot.fasts.some((fast) => fast.end === null);
  return lines(
    'Data on record:',
    bullets([
      `${plural(snapshot.weighIns.length, 'weigh-in', 'weigh-ins')}, ` +
        `${plural(snapshot.bodyFat.length, 'body-fat reading', 'body-fat readings')} and ` +
        `${plural(snapshot.entries.length, 'food entry', 'food entries')} in all; ` +
        `${OVERVIEW_TOOL} gives the first and last day of each`,
      `${plural(snapshot.fasts.length, 'fast', 'fasts')} tracked with the fasting timer` +
        (running ? ', one of them running now' : ''),
      'A day without food entries only means nothing was logged that day. Never treat it as ' +
        'a fast or as a day of 0 kcal: the tracked fasts are the only fasting facts.',
    ]),
  );
}

function waterLine(water: CoachWater, today: DayKey): string {
  if (!water.on) return 'Water: not tracked (water tracking is switched off)';
  let drunk = 0;
  for (const log of water.logs) if (log.dayKey === today) drunk += log.ml;
  const reading =
    water.unit === 'flOz'
      ? ` (they read fl oz: ${num(waterShown(drunk, 'flOz'))} of ` +
        `${num(waterShown(water.goalMl, 'flOz'))} fl oz)`
      : '';
  return `Water: ${Math.round(drunk)} ml of a ${Math.round(water.goalMl)} ml goal${reading}`;
}

/**
 * Today's sugar against the Sugar limit, counted as Home's Sugar line counts it (D-16.98): only the
 * entries with a sugar figure add to it, and an entry without one is unknown, never 0 g.
 */
function sugarLine(todays: readonly DiaryEntry[], limitG: number): string {
  const { foods, withFigure, grams } = sugarOfDay(todays);
  const limit = limitG > 0 ? `daily limit ${num(limitG)} g` : 'no daily limit set';
  if (grams === null) {
    const why = foods > 0 ? 'not known, no entry today has a sugar figure' : 'nothing logged yet';
    return `Sugar: ${why} (${limit})`;
  }
  const part =
    withFigure < foods ? `, from ${withFigure} of ${foods} entries; the rest have no figure` : '';
  return `Sugar: ${num(grams)} g (${limit})${part}`;
}

/**
 * What today's food cost, counted as Home's spend line counts it (D-16.108): each currency apart,
 * never converted, and an entry without a price is unknown, never 0. No line while no entry today
 * has a price, so people who never type prices are not asked about them.
 */
function spendLine(todays: readonly DiaryEntry[]): string[] {
  const { foods, priced, totals } = spendOf(todays, '');
  if (priced === 0) return [];
  const amounts = totals.map((total) => `${num(total.amount, 2)} ${total.currency}`).join(' and ');
  const part = priced < foods ? `, from ${priced} of ${foods} entries; the rest have no price` : '';
  return [`Spent on food: ${amounts}${part}`];
}

/**
 * Whole kcal of today's active energy the energy target gains, or null when it gains nothing: the
 * switch is off, the goal is not above 0, or today has no active calories above 0. Home's rule
 * (P11-04, `countedBurn`), written again here because that one belongs to the screen.
 */
export function countedActiveKcal(
  goalKcal: number,
  activity: CoachActivity | null,
  day: ActivityRow | null,
): number | null {
  if (activity === null || !activity.countActive || !(goalKcal > 0)) return null;
  if (day === null || day.activeKcal === null) return null;
  const burned = Math.round(day.activeKcal);
  return burned > 0 ? burned : null;
}

function todaySoFar(
  snapshot: CoachSnapshot,
  today: DayKey,
  targets: Targets,
  counted: number | null,
): string {
  const eaten: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const todays: DiaryEntry[] = [];
  let count = 0;
  for (const entry of snapshot.entries) {
    if (entry.dayKey !== today) continue;
    todays.push(entry);
    count += 1;
    eaten.kcal += entry.kcal;
    eaten.protein += entry.protein;
    eaten.carbs += entry.carbs;
    eaten.fat += entry.fat;
  }
  const leftOf =
    counted === null ? 'the daily targets' : "today's targets, active calories counted in";
  const left: Targets = {
    kcal: targets.kcal - eaten.kcal,
    protein: targets.protein - eaten.protein,
    carbs: targets.carbs - eaten.carbs,
    fat: targets.fat - eaten.fat,
  };
  return lines(
    'Today so far:',
    bullets([
      count === 0
        ? 'Eaten: nothing logged yet today'
        : `Eaten: ${energyAndMacros(eaten)}, from ${plural(count, 'entry', 'entries')}`,
      `Left of ${leftOf}: ${energyAndMacros(left)} (a negative amount is over the target)`,
      sugarLine(todays, snapshot.sugarLimitG ?? DEFAULT_GOAL_VALUES.sugar),
      ...spendLine(todays),
      waterLine(snapshot.water, today),
    ]),
  );
}

/**
 * Whole kcal of today's recorded walks the energy target gains without Health Connect (Home's
 * `walkBurn`, D-16.96), or null: Health Connect is connected (its burn counts instead), the app
 * records no walks, the switch is off, the goal is not above 0, or today's walks add nothing.
 */
export function countedWalkKcal(
  goalKcal: number,
  activity: CoachActivity | null,
  walks: CoachWalks | null,
  today: DayKey,
): number | null {
  if (activity !== null || walks === null || !walks.countActive || !(goalKcal > 0)) return null;
  let burned = 0;
  for (const walk of walks.items) {
    if (dayKeyOf(walk.startedAt) === today) burned += Math.max(0, walk.activeKcal);
  }
  const whole = Math.round(burned);
  return whole > 0 ? whole : null;
}

/** "1800 kcal goal + 420 kcal active = 2220 kcal", or the goal alone, and why. */
function countingLine(activity: CoachActivity, goalKcal: number, counted: number | null): string {
  const goal = `${num(Math.round(goalKcal), 0)} kcal goal`;
  if (!activity.countActive) {
    return (
      `${COUNT_SWITCH} is off, so today's energy target is the ${goal}; active calories are ` +
      'not added to it'
    );
  }
  if (counted === null) {
    return (
      `${COUNT_SWITCH} is on, but there are no active calories to add yet, so today's energy ` +
      `target is the ${goal}`
    );
  }
  return (
    `${COUNT_SWITCH} is on, so today's energy target is the ${goal} + ${counted} kcal active ` +
    `= ${num(Math.round(goalKcal) + counted, 0)} kcal`
  );
}

function distanceLine(metres: number, units: CoachSnapshot['units']): string {
  const km = `${oneDecimal(metres / METRES_PER_KM)} km`;
  return units.height === 'ftIn'
    ? `Distance: ${km} (they read miles: ${oneDecimal(metres / METRES_PER_MILE)} mi)`
    : `Distance: ${km}`;
}

/** "strengthTraining" → "strength training"; an empty type is "other". */
function workoutType(type: string): string {
  return type === '' ? 'other' : type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function workoutsLine(day: ActivityRow): string {
  if (day.sessions.length === 0) return 'Workouts: none recorded';
  const workouts = [...day.sessions]
    .sort((a, b) => a.start - b.start)
    .map((session) => {
      const minutes = Math.round((session.end - session.start) / 60_000);
      const burned =
        session.activeKcal === null ? '' : ` (${Math.round(session.activeKcal)} kcal active)`;
      return `${workoutType(session.type)} at ${clockText(session.start)} for ${minutes} min${burned}`;
    });
  return `Workouts: ${workouts.join('; ')}`;
}

/** A figure Health Connect gave, or "none recorded". */
function figure(label: string, value: number | null, unit = ''): string {
  return `${label}: ${value === null ? 'none recorded' : `${Math.round(value)}${unit}`}`;
}

function hasAnything(day: ActivityRow | null): day is ActivityRow {
  return (
    day !== null &&
    (day.steps !== null ||
      day.activeKcal !== null ||
      day.totalKcal !== null ||
      day.distanceM !== null ||
      day.sessions.length > 0)
  );
}

function activitySection(
  snapshot: CoachSnapshot,
  activity: CoachActivity,
  day: ActivityRow | null,
  goalKcal: number,
  counted: number | null,
): string {
  const recorded = hasAnything(day)
    ? [
        figure('Steps', day.steps),
        figure('Active calories, burned by moving', day.activeKcal, ' kcal'),
        figure('Total calories burned, resting burn included', day.totalKcal, ' kcal'),
        day.distanceM === null
          ? 'Distance: none recorded'
          : distanceLine(day.distanceM, snapshot.units),
        workoutsLine(day),
      ]
    : ['Nothing recorded yet today'];
  return lines(
    'Activity today, from Health Connect on their phone:',
    bullets([...recorded, countingLine(activity, goalKcal, counted)]),
  );
}

/** Today's recorded walks and what they add to the target, without Health Connect (D-16.96). */
function walksSection(
  walks: CoachWalks,
  today: DayKey,
  goalKcal: number,
  counted: number | null,
): string {
  const todays = walks.items
    .filter((walk) => dayKeyOf(walk.startedAt) === today)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((walk) => {
      const parts = [`${Math.round(walk.activeSeconds / 60)} min`];
      if (walk.distanceM !== null) parts.push(`${oneDecimal(walk.distanceM / METRES_PER_KM)} km`);
      parts.push(`${Math.round(walk.activeKcal)} kcal active`);
      if (walk.score !== null) parts.push(`walk score ${Math.round(walk.score)}`);
      return `Walk at ${clockText(walk.startedAt)}: ${parts.join(', ')}`;
    });
  const goal = `${num(Math.round(goalKcal), 0)} kcal goal`;
  let counting: string;
  if (!walks.countActive) {
    counting = `${COUNT_SWITCH} is off, so today's energy target is the ${goal}; walks are not added to it`;
  } else if (counted === null) {
    counting = `${COUNT_SWITCH} is on, but no walk adds active calories yet, so today's energy target is the ${goal}`;
  } else {
    counting =
      `${COUNT_SWITCH} is on, so today's energy target is the ${goal} + ${counted} kcal from ` +
      `today's walks = ${num(Math.round(goalKcal) + counted, 0)} kcal`;
  }
  return lines(
    'Walks today, recorded in Platewise (Health Connect is not connected):',
    bullets([...(todays.length > 0 ? todays : ['No walk recorded yet today']), counting]),
  );
}

/** The kJ rule for people who read energy in kilojoules; nothing for kcal readers. */
function kilojouleRule(snapshot: CoachSnapshot): string | undefined {
  const base = kilojouleLine(snapshot.units.energy);
  if (base === undefined) return undefined;
  return (
    `${base} Tool results are in kcal too, and energy you pass to a tool stays in kcal: turn ` +
    'any kJ amount the person mentions into kcal first.'
  );
}

/** The facts block for one turn, from the snapshot taken when the person pressed Send. */
export function coachContext(snapshot: CoachSnapshot): string {
  const today = snapshotDay(snapshot);
  const { profile } = snapshot;
  const targets = effectiveTargets(profile.saved, formulaPlan(profile, today));
  const { activity } = snapshot;
  const day = activity?.days.find((row) => row.day === today) ?? null;
  const { walks } = snapshot;
  const counted =
    countedActiveKcal(targets.kcal, activity, day) ??
    countedWalkKcal(targets.kcal, activity, walks, today);
  const todayTargets = counted === null ? targets : { ...targets, kcal: targets.kcal + counted };
  return paragraphs(
    todaySection(today, snapshot.timeZone, snapshot.now),
    profileSection(profile, today, snapshot.units),
    kilojouleRule(snapshot),
    energySection(profile, today, targets),
    forecastSection(snapshot, today),
    dataSection(snapshot),
    todaySoFar(snapshot, today, todayTargets, counted),
    activity !== null && activitySection(snapshot, activity, day, targets.kcal, counted),
    activity === null && walks !== null && walksSection(walks, today, targets.kcal, counted),
  );
}
