// The facts block every Coach turn starts from (04 §3.8, D-16.27). It is rebuilt from the turn's
// snapshot on every question, so the model always sees the data as it stood when the person
// pressed Send: the local day and zone, the profile in the person's own units, how the energy
// numbers are worked out, the weight forecast (P01-18) or what it still needs, how much data is
// stored, and today so far (eaten, left of each target, water). It holds counts and totals only:
// no food name, note or ingredient ever enters it, and nothing about workouts (v1 has none).
// Energy figures are kcal; a kJ reader's block adds the rule for answering in kJ.

import { ageOn } from '../../domain/dates/age';
import { daysBetween, type DayKey } from '../../domain/dates/dayKey';
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
import type { Profile, Targets } from '../../domain/model';
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
import { snapshotDay, type CoachSnapshot, type CoachWater } from './snapshot';
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

// ---- Sections -------------------------------------------------------------------------------

function todaySection(today: DayKey, timeZone: string): string {
  return (
    `Today is ${weekdayOf(today)} ${today} in the time zone ${timeZone}. Work out dates the ` +
    'person gives in relative terms (yesterday, last week, in March) from this day.'
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

function todaySoFar(snapshot: CoachSnapshot, today: DayKey, targets: Targets): string {
  const eaten: Targets = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let count = 0;
  for (const entry of snapshot.entries) {
    if (entry.dayKey !== today) continue;
    count += 1;
    eaten.kcal += entry.kcal;
    eaten.protein += entry.protein;
    eaten.carbs += entry.carbs;
    eaten.fat += entry.fat;
  }
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
      `Left of the daily targets: ${energyAndMacros(left)} (a negative amount is over the target)`,
      waterLine(snapshot.water, today),
    ]),
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
  return paragraphs(
    todaySection(today, snapshot.timeZone),
    profileSection(profile, today, snapshot.units),
    kilojouleRule(snapshot),
    energySection(profile, today, targets),
    forecastSection(snapshot, today),
    dataSection(snapshot),
    todaySoFar(snapshot, today, targets),
  );
}
