// The shapes that pass between Platewise and Health Connect (P11-03), as pure functions: the
// activity rows a sync stores from the plugin's answers, the weigh-ins it imports, the records
// write-back sends, and the plan that says what to send, remove and forget. Values the plugin
// gives that cannot be used (negative, not finite, a day outside the window, a time that does not
// parse) are dropped one by one; nothing here adds anything up.

import { fingerprint } from '../../data/guard';
import {
  importedWeighInId,
  isImportedWeighIn,
  type SentLedger,
  type SentRecord,
} from '../../data/repos/healthRepo';
import type { ActivityRow, ActivitySession } from '../../data/schema';
import { addDays, dayKeyOf, isDayKey, type DayKey } from '../../domain/dates/dayKey';
import { windowEnding, type DayWindow } from '../../domain/dates/ranges';
import type { DiaryEntry, MealKind, WeighIn } from '../../domain/model';
import type {
  DailyTotals,
  ExerciseSession,
  HealthWeight,
  NutritionRecord,
  WeightRecord,
} from './contract';

/** How many local days, today included, a sync reads and write-back keeps in step. */
export const SYNC_DAYS = 30;

/** The days a sync reads and write-back covers: the last `SYNC_DAYS` days, ending today. */
export function syncWindow(today: DayKey): DayWindow {
  return windowEnding(today, SYNC_DAYS);
}

function inWindow(day: DayKey, window: DayWindow): boolean {
  return day >= window.first && day <= window.last;
}

/** A finite number of 0 or more, else null. */
function amountOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** An ISO 8601 time as epoch ms, or null when it does not parse. */
function instantOf(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

function sessionOf(session: ExerciseSession): ActivitySession | null {
  const start = instantOf(session.start);
  const end = instantOf(session.end);
  if (typeof session.id !== 'string' || session.id === '') return null;
  if (start === null || end === null || end < start) return null;
  return {
    id: session.id,
    start,
    end,
    type: typeof session.type === 'string' ? session.type : '',
    title: typeof session.title === 'string' && session.title.trim() !== '' ? session.title : null,
    activeKcal: amountOrNull(session.activeKcal),
    source: typeof session.source === 'string' ? session.source : '',
  };
}

/**
 * One row per day of the window, oldest first, from the plugin's daily totals and workouts. A day
 * the plugin left out has every value null and no workout; a workout counts on the day the plugin
 * put it on, once per id, in start order.
 */
export function activityDays(
  window: DayWindow,
  totals: readonly DailyTotals[],
  sessions: readonly ExerciseSession[],
  now: number,
): ActivityRow[] {
  const totalsByDay = new Map<DayKey, DailyTotals>();
  for (const day of totals) {
    if (isDayKey(day.day) && inWindow(day.day, window)) totalsByDay.set(day.day, day);
  }
  const sessionsByDay = new Map<DayKey, Map<string, ActivitySession>>();
  for (const raw of sessions) {
    const session = sessionOf(raw);
    if (!session || !isDayKey(raw.day) || !inWindow(raw.day, window)) continue;
    const onDay = sessionsByDay.get(raw.day) ?? new Map<string, ActivitySession>();
    onDay.set(session.id, session);
    sessionsByDay.set(raw.day, onDay);
  }

  const rows: ActivityRow[] = [];
  for (let day = window.first; day <= window.last; day = addDays(day, 1)) {
    const totalsOfDay = totalsByDay.get(day);
    const sessionsOfDay = [...(sessionsByDay.get(day)?.values() ?? [])].sort(
      (a, b) => a.start - b.start || (a.id < b.id ? -1 : 1),
    );
    rows.push({
      day,
      steps: amountOrNull(totalsOfDay?.steps),
      activeKcal: amountOrNull(totalsOfDay?.activeKcal),
      totalKcal: amountOrNull(totalsOfDay?.totalKcal),
      distanceM: amountOrNull(totalsOfDay?.distanceM),
      sessions: sessionsOfDay,
      syncedAt: now,
    });
  }
  return rows;
}

/** Weigh-ins from Health Connect under their import ids; unusable readings are left out. */
export function importedReadings(weights: readonly HealthWeight[]): WeighIn[] {
  return weights.flatMap((weight) => {
    const at = instantOf(weight.time);
    const usable =
      typeof weight.id === 'string' &&
      weight.id !== '' &&
      at !== null &&
      typeof weight.kg === 'number' &&
      Number.isFinite(weight.kg) &&
      weight.kg > 0;
    return usable ? [{ id: importedWeighInId(weight.id), at, kg: weight.kg }] : [];
  });
}

/** Health Connect has no "other" meal. */
const MEAL_TYPES: Readonly<Record<MealKind, NutritionRecord['mealType']>> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'snack',
  other: null,
};

/** A diary entry as a nutrition record, under the entry's own id. */
export function nutritionRecord(entry: DiaryEntry): NutritionRecord {
  return {
    clientId: entry.id,
    time: new Date(entry.loggedAt).toISOString(),
    name: entry.name,
    mealType: MEAL_TYPES[entry.meal],
    kcal: entry.kcal,
    proteinG: entry.protein,
    carbsG: entry.carbs,
    fatG: entry.fat,
  };
}

/** A weigh-in typed here as a weight record, under its own id. */
export function weightRecord(weighIn: WeighIn): WeightRecord {
  return { clientId: weighIn.id, time: new Date(weighIn.at).toISOString(), kg: weighIn.kg };
}

/** What one write-back pass sends, removes and forgets. */
export interface WriteBackPlan {
  /** New or changed entries. */
  readonly nutrition: NutritionRecord[];
  /** Client ids of entries sent before and gone since (deleted, or moved out of the window). */
  readonly removeNutrition: string[];
  /** New or changed weigh-ins typed here. */
  readonly weights: WeightRecord[];
  readonly removeWeights: string[];
  /** The ledger records of what will be sent, by client id. */
  readonly sent: Record<string, SentRecord>;
  /** Ledger ids whose day is before the window: dropped without removing anything. */
  readonly forget: string[];
  /**
   * The earliest time, epoch ms, of the records held back because they are dated after `now`
   * (and not sent as they are already); null when nothing waits.
   */
  readonly heldBackUntil: number | null;
}

export interface WriteBackInput {
  /** The entries of the window. */
  readonly entries: readonly DiaryEntry[];
  /** The weigh-ins of the window, imported ones included (they are left out here). */
  readonly weighIns: readonly WeighIn[];
  readonly ledger: SentLedger;
  readonly window: DayWindow;
  /** Epoch ms. Health Connect refuses a record dated after this, so such records wait. */
  readonly now: number;
}

/**
 * Compares what is stored in the window with what was last sent: a record is sent when it is new
 * or its fingerprint changed, removed when it was sent from a day in the window and is no longer
 * stored there, and forgotten when its day is before the window. Imported weigh-ins are never sent
 * back. A record dated after `now` (an entry logged for later today) waits: it is neither sent
 * nor removed nor forgotten, and the first pass after its time sends it, since Health Connect
 * refuses it until then and one refused record fails the whole call. `heldBackUntil` says when
 * the first of them can go.
 */
export function writeBackPlan({
  entries,
  weighIns,
  ledger,
  window,
  now,
}: WriteBackInput): WriteBackPlan {
  const plan: Omit<WriteBackPlan, 'heldBackUntil'> = {
    nutrition: [],
    removeNutrition: [],
    weights: [],
    removeWeights: [],
    sent: {},
    forget: [],
  };
  const stored = new Set<string>();
  let heldBackUntil: number | null = null;
  /** True when a record dated `at` must wait, keeping the earliest such time. */
  const holdBack = (at: number): boolean => {
    if (at <= now) return false;
    if (heldBackUntil === null || at < heldBackUntil) heldBackUntil = at;
    return true;
  };

  for (const entry of entries) {
    if (!inWindow(entry.dayKey, window)) continue;
    stored.add(entry.id);
    const record = nutritionRecord(entry);
    const sig = fingerprint(record);
    if (ledger[entry.id]?.sig === sig || holdBack(entry.loggedAt)) continue;
    plan.nutrition.push(record);
    plan.sent[entry.id] = { kind: 'nutrition', day: entry.dayKey, sig };
  }
  for (const weighIn of weighIns) {
    const day = dayKeyOf(weighIn.at);
    if (isImportedWeighIn(weighIn.id) || !inWindow(day, window)) continue;
    stored.add(weighIn.id);
    const record = weightRecord(weighIn);
    const sig = fingerprint(record);
    if (ledger[weighIn.id]?.sig === sig || holdBack(weighIn.at)) continue;
    plan.weights.push(record);
    plan.sent[weighIn.id] = { kind: 'weight', day, sig };
  }
  for (const [id, record] of Object.entries(ledger)) {
    if (stored.has(id)) continue;
    if (record.day < window.first) plan.forget.push(id);
    else if (record.kind === 'nutrition') plan.removeNutrition.push(id);
    else plan.removeWeights.push(id);
  }
  return { ...plan, heldBackUntil };
}
