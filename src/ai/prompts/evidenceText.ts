/**
 * The goal evidence pack (01 §3.8, `buildEvidence`) as compact text for a plan request. Only what
 * the pack holds is written, and the pack holds numbers and day keys only, so no food name, note,
 * ingredient or photo can reach the model this way (R01.16, ACC-C9-1). The text says so, explains
 * how days are judged, and labels every day and period with its coverage: a day with nothing
 * logged is unknown intake, never zero.
 */
import {
  CONFIDENCE_SPAN_DAYS,
  COVERAGE_FLOOR_KCAL,
  FULL_DAY_SHARE,
  MULTI_LOG_SHARE,
  NUTRITION_POINTS_MAX,
  type DatedBodyFat,
  type DatedWeight,
  type EvidencePack,
  type EvidencePeriod,
  type LoggedDay,
  type RecentRows,
  type SignalPeriod,
} from '../../domain/forecast/evidence';
import { bullets, lines, num } from './shared';

/** Stated with every pack: what it holds and what it never holds. */
export const EVIDENCE_PRIVACY_LINE =
  'Privacy: everything below is numbers and dates. It never holds what a food or exercise was ' +
  'called, notes, ingredients, meal descriptions or photos.';

const UNKNOWN = 'unknown';

function percent(share: number): string {
  return `${num(share * 100, 0)} %`;
}

function grams(value: number | null): string {
  return value === null ? UNKNOWN : `${num(value)} g`;
}

function kcal(value: number | null): string {
  return value === null ? UNKNOWN : `${num(value, 0)} kcal`;
}

function kg(value: number): string {
  return num(value, 2);
}

function signedKg(value: number): string {
  return value > 0 ? `+${kg(value)}` : kg(value);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function olderNote(rows: RecentRows<unknown>, what: string): string {
  return rows.older > 0
    ? ` (${plural(rows.older, `older ${what}`, `older ${what}s`)} left out)`
    : '';
}

function judgingLine(goalKcal: number): string {
  return (
    `How each day is judged against the ${goalKcal} kcal goal: "full" from ` +
    `${percent(FULL_DAY_SHARE)} of it, or from ${percent(MULTI_LOG_SHARE)} (at least ` +
    `${COVERAGE_FLOOR_KCAL} kcal) with two or more logs; "partial" when something was logged ` +
    'but less than that; "none" when nothing was logged, which means intake is unknown, not zero. ' +
    'Never read a partial or none day as a day of low eating.'
  );
}

function confidenceLine(pack: EvidencePack): string {
  const c = pack.confidence;
  return lines(
    `Confidence: ${c.level}, ${c.score} of 100 (food logging ${c.nutritionPoints} of ` +
      `${NUTRITION_POINTS_MAX}, weigh-ins ${c.weightPoints}, measured energy ${c.energyPoints}).`,
    bullets([
      `${plural(c.fullDaysInSpan, 'full day', 'full days')} in the latest ${CONFIDENCE_SPAN_DAYS}`,
      `${plural(c.weighInDays, 'weigh-in day', 'weigh-in days')} spanning ` +
        `${plural(c.weighInSpanDays, 'day', 'days')}`,
      `${plural(c.energyDays, 'day', 'days')} of measured energy`,
    ]),
  );
}

function periodLine(period: EvidencePeriod): string {
  const none = period.days - period.loggedDays;
  return (
    `Last ${period.days} days: ${period.fullDays} full, ${period.loggedDays - period.fullDays} ` +
    `partial, ${none} none (coverage ${period.coveragePercent} %), ` +
    `${plural(period.logs, 'log', 'logs')}; average ${kcal(period.avgKcal)} on logged days and ` +
    `${kcal(period.avgFullKcal)} on full days; protein ${grams(period.avgProtein)}, carbs ` +
    `${grams(period.avgCarbs)}, fat ${grams(period.avgFat)} on logged days; fibre ` +
    `${grams(period.avgFibre)} on days that recorded it`
  );
}

function signalLine(signal: SignalPeriod): string {
  const change =
    signal.weightChangeKg === null || signal.weightSpanDays === null
      ? 'change unknown'
      : `change ${signedKg(signal.weightChangeKg)} kg over ${plural(signal.weightSpanDays, 'day', 'days')}`;
  return (
    `Last ${signal.days} days: ${plural(signal.weighIns, 'weigh-in', 'weigh-ins')}, ${change}; ` +
    `${plural(signal.bodyFatReadings, 'body-fat reading', 'body-fat readings')}`
  );
}

function weightsLine(weights: RecentRows<DatedWeight>): string {
  if (weights.rows.length === 0) return 'Weigh-ins (kg): none';
  const readings = weights.rows.map((row) => `${row.day} ${kg(row.kg)}`).join(', ');
  return `Weigh-ins (kg, the last of each day)${olderNote(weights, 'day')}: ${readings}`;
}

function bodyFatLine(bodyFat: RecentRows<DatedBodyFat>): string {
  if (bodyFat.rows.length === 0) return 'Body fat (%): none';
  const readings = bodyFat.rows.map((row) => `${row.day} ${num(row.percent)}`).join(', ');
  return `Body fat (%, the last of each day)${olderNote(bodyFat, 'day')}: ${readings}`;
}

/** One logged day, short: "2026-10-25 full, 2 logs: 1900 kcal, P 95, C 237.5, F 47.5, fibre 6 (1 of 2)". */
function dayLine(day: LoggedDay): string {
  const fibre =
    day.fibre === null
      ? 'fibre unknown'
      : `fibre ${num(day.fibre)} (${day.fibreLogs} of ${day.logs})`;
  return (
    `${day.day} ${day.coverage}, ${plural(day.logs, 'log', 'logs')}: ${num(day.kcal, 0)} kcal, ` +
    `P ${num(day.protein)}, C ${num(day.carbs)}, F ${num(day.fat)}, ${fibre}`
  );
}

function loggedDaysSection(days: RecentRows<LoggedDay>): string {
  if (days.rows.length === 0) return 'Logged days: none';
  return lines(
    `Logged days, oldest first${olderNote(days, 'logged day')}. P, C and F are protein, carbs ` +
      'and fat in g; fibre is in g, with how many of the logs recorded it:',
    bullets(days.rows.map(dayLine)),
  );
}

/** The pack as text: window, privacy line, judging rule, confidence, periods, signals, detail. */
export function evidenceText(pack: EvidencePack): string {
  return lines(
    `Evidence from the person's own logs, finished days ${pack.first} to ${pack.last}. Today is ` +
      'left out because it is still being logged.',
    EVIDENCE_PRIVACY_LINE,
    judgingLine(pack.goalKcal),
    confidenceLine(pack),
    'Food by period:',
    bullets(pack.periods.map(periodLine)),
    'Weight and body fat by period:',
    bullets(pack.signals.map(signalLine)),
    weightsLine(pack.weights),
    bodyFatLine(pack.bodyFat),
    loggedDaysSection(pack.loggedDays),
  );
}
