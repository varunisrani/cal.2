// Diary import (06 §3.14, D-16.2, R06.16): reading one of our own diary files back. The whole
// file is checked before anything changes, and one bad value anywhere refuses all of it. A good
// file is applied in one of two ways, in one transaction:
//
// - Replace these dates: the file's dates end up holding the file's foods. A stored entry on
//   those dates that matches a food of the file keeps its id and photos and takes the file's
//   values; first every food is matched by id, then the rest by day, minute, meal and name, and
//   each stored entry is matched at most once. Foods that match nothing are added (with their own
//   id, or a new one when the id is used elsewhere); entries on those dates that match nothing
//   are removed. Other dates are never touched.
// - Add as new: every food is added with a new id; the diary keeps everything it had.
//
// Water changes only when the file has water lists, so an older food-only file never erases
// water. The merge is worked out inside the write (transferRepo.rewriteDays, R06.2); photos the
// write dropped are cleaned up afterwards.

import { isDayKey, splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import {
  EXTRA_KEYS,
  isMealKind,
  NUTRIENT_KEYS,
  type DiaryEntry,
  type ExtraValues,
  type IngredientLine,
  type MealKind,
  type NutrientValues,
  type ServingBasis,
  type WaterLog,
} from '../../domain/model';
import type { IdSource } from '../../lib/ids';
import type { DaysWrite, StoredDays, TransferRepo } from '../../data/repos/transferRepo';
import type { PhotoRepo } from '../../data/repos/photoRepo';
import {
  clockTime,
  DIARY_FORMAT,
  EXTRA_FILE_KEYS,
  NUTRIENT_FILE_KEYS,
  type DaySpan,
  type FileSource,
} from './exportDiary';

/** Files above this are refused before they are read: 20 MiB. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

/** The only major version this build reads. */
const READABLE_MAJOR = 1;

/** Why a file was refused; `detail` names the place in the file where it can. */
export type ImportProblem =
  | { readonly kind: 'tooLarge' | 'unreadable' | 'notDiary' | 'version' | 'empty' }
  | { readonly kind: 'date' | 'meal' | 'food' | 'water' | 'time'; readonly detail: string };

export type ImportMode = 'replace' | 'add';

export interface ImportLine {
  readonly name: string;
  readonly grams: number;
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

/** A food of a checked file. */
export interface ImportFood {
  /** Lower-case UUID, or null when the file gave none (a new one is made). */
  readonly id: string | null;
  readonly name: string;
  readonly date: DayKey;
  /** `HH:mm`, a time that exists on `date`. */
  readonly time: string;
  readonly loggedAt: number;
  readonly meal: MealKind;
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  /** The weight; null when the file gives none or 0. */
  readonly grams: number | null;
  readonly nutrients: NutrientValues;
  readonly extras: ExtraValues;
  readonly source: FileSource;
  readonly note?: string;
  readonly lines: readonly ImportLine[];
}

export interface ImportWater {
  /** Lower-case UUID. */
  readonly id: string;
  readonly date: DayKey;
  readonly at: number;
  readonly ml: number;
}

/** A file that passed every check. */
export interface DiaryImport {
  readonly range: DaySpan;
  readonly foods: readonly ImportFood[];
  /** Null when no day of the file has a water list (an older, food-only file). */
  readonly water: readonly ImportWater[] | null;
}

export type ReadResult =
  | { readonly ok: true; readonly file: DiaryImport }
  | { readonly ok: false; readonly problem: ImportProblem };

/** What the preview shows. */
export interface ImportPreview {
  readonly foods: number;
  readonly water: number;
  readonly range: DaySpan;
}

export interface ImportCounts {
  readonly foods: number;
  readonly water: number;
}

// ---- Checking a file ---------------------------------------------------------------------

class Refused extends Error {
  readonly problem: ImportProblem;

  constructor(problem: ImportProblem) {
    super(problem.kind);
    this.problem = problem;
  }
}

function refuse(problem: ImportProblem): never {
  throw new Refused(problem);
}

type Fields = Readonly<Record<string, unknown>>;

function fieldsOf(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null;
}

/** A list, or empty for a missing one; anything else is not our file. */
function listOf(value: unknown): readonly unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : refuse({ kind: 'notDiary' });
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const VERSION = /^(\d+)(?:\.\d+)*$/;

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * The instant of `time` on `date` in the device zone, or null when the clocks skip that time on
 * that day (a DST gap): the local fields of the instant must read back as written.
 */
export function wallClockInstant(date: DayKey, time: string): number | null {
  const clock = CLOCK.exec(time);
  if (!clock || !isDayKey(date)) return null;
  const { year, month, day } = splitDayKey(date);
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(hours, minutes, 0, 0);
  const readsBack =
    local.getFullYear() === year &&
    local.getMonth() === month - 1 &&
    local.getDate() === day &&
    local.getHours() === hours &&
    local.getMinutes() === minutes;
  return readsBack ? local.getTime() : null;
}

/** Amounts under the file's keys for the given ids; absent keys stay absent. */
function amounts<K extends string>(
  raw: unknown,
  keys: readonly K[],
  fileKey: Readonly<Record<K, string>>,
  where: string,
): Partial<Record<K, number>> {
  if (raw === undefined || raw === null) return {};
  const fields = fieldsOf(raw) ?? refuse({ kind: 'food', detail: where });
  const values: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const value = fields[fileKey[key]];
    if (value === undefined || value === null) continue;
    if (!isAmount(value)) refuse({ kind: 'food', detail: where });
    values[key] = value;
  }
  return values;
}

function lineOf(raw: unknown, where: string): ImportLine {
  const fields = fieldsOf(raw) ?? refuse({ kind: 'food', detail: where });
  const { name, grams, kcal, protein, carbs, fat } = fields;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (
    trimmed === '' ||
    !isAmount(grams) ||
    !isAmount(kcal) ||
    !isAmount(protein) ||
    !isAmount(carbs) ||
    !isAmount(fat)
  ) {
    refuse({ kind: 'food', detail: where });
  }
  return { name: trimmed, grams, kcal: Math.round(kcal), protein, carbs, fat };
}

function foodOf(raw: unknown, date: DayKey, meal: MealKind): ImportFood {
  const fields = fieldsOf(raw);
  const name = typeof fields?.name === 'string' ? fields.name.trim() : '';
  const where = name === '' ? date : `${name}, ${date}`;
  if (!fields || name === '') refuse({ kind: 'food', detail: where });
  const { kcal, protein, carbs, fat, grams, id, note } = fields;
  if (!isAmount(kcal) || !isAmount(protein) || !isAmount(carbs) || !isAmount(fat)) {
    refuse({ kind: 'food', detail: where });
  }
  if (grams !== undefined && grams !== null && !isAmount(grams)) {
    refuse({ kind: 'food', detail: where });
  }
  const ownId = id === undefined || id === null ? null : uuid(id);
  if (ownId === null && id !== undefined && id !== null) refuse({ kind: 'food', detail: where });
  if (note !== undefined && note !== null && typeof note !== 'string') {
    refuse({ kind: 'food', detail: where });
  }
  const time = typeof fields.time === 'string' ? fields.time : '';
  if (!CLOCK.test(time)) refuse({ kind: 'time', detail: `${date} ${time}`.trim() });
  const loggedAt =
    wallClockInstant(date, time) ?? refuse({ kind: 'time', detail: `${date} ${time}` });
  return {
    id: ownId,
    name,
    date,
    time,
    loggedAt,
    meal,
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    grams: typeof grams === 'number' && grams > 0 ? grams : null,
    nutrients: amounts(fields.nutrients, NUTRIENT_KEYS, NUTRIENT_FILE_KEYS, where),
    extras: amounts(fields.extras, EXTRA_KEYS, EXTRA_FILE_KEYS, where),
    source: fields.source === 'manual' ? 'manual' : 'ai',
    ...(typeof note === 'string' && note.trim() !== '' ? { note } : {}),
    lines: listOf(fields.lines).map((line) => lineOf(line, where)),
  };
}

function waterOf(raw: unknown, date: DayKey): ImportWater {
  const fields = fieldsOf(raw);
  const id = uuid(fields?.id);
  const ml = fields?.ml;
  if (!fields || id === null || typeof ml !== 'number' || !Number.isFinite(ml) || ml <= 0) {
    refuse({ kind: 'water', detail: date });
  }
  const time = typeof fields.time === 'string' ? fields.time : '';
  if (!CLOCK.test(time)) refuse({ kind: 'time', detail: `${date} ${time}`.trim() });
  const at = wallClockInstant(date, time) ?? refuse({ kind: 'time', detail: `${date} ${time}` });
  return { id, date, at, ml };
}

function dayKeyField(value: unknown): DayKey {
  return isDayKey(value) ? value : refuse({ kind: 'date', detail: String(value) });
}

function readDocument(text: string): DiaryImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    refuse({ kind: 'notDiary' });
  }
  const root = fieldsOf(parsed);
  if (!root || root.format !== DIARY_FORMAT || !Array.isArray(root.days)) {
    refuse({ kind: 'notDiary' });
  }
  const version = typeof root.version === 'string' ? VERSION.exec(root.version) : null;
  if (!version || Number(version[1]) !== READABLE_MAJOR) refuse({ kind: 'version' });

  const range = fieldsOf(root.range) ?? refuse({ kind: 'date', detail: String(root.range) });
  const first = dayKeyField(range.start);
  const last = dayKeyField(range.end);
  // Day keys are zero-padded, so text order is calendar order.
  const span: DaySpan = first <= last ? { start: first, end: last } : { start: last, end: first };

  const foods: ImportFood[] = [];
  let water: ImportWater[] | null = null;
  for (const rawDay of root.days as readonly unknown[]) {
    const day = fieldsOf(rawDay) ?? refuse({ kind: 'notDiary' });
    const date = dayKeyField(day.date);
    if (date < span.start || date > span.end) refuse({ kind: 'date', detail: date });
    for (const rawMeal of listOf(day.meals)) {
      const meal = fieldsOf(rawMeal) ?? refuse({ kind: 'notDiary' });
      const kind = typeof meal.meal === 'string' ? meal.meal.trim().toLowerCase() : meal.meal;
      if (!isMealKind(kind)) refuse({ kind: 'meal', detail: String(meal.meal) });
      for (const item of listOf(meal.items)) foods.push(foodOf(item, date, kind));
    }
    if (day.water === undefined || day.water === null) continue;
    water ??= [];
    for (const log of listOf(day.water)) water.push(waterOf(log, date));
  }
  if (foods.length === 0 && (water === null || water.length === 0)) refuse({ kind: 'empty' });
  return { range: span, foods, water };
}

/** Checks a whole file; any problem refuses all of it. */
export function readDiaryFile(text: string): ReadResult {
  try {
    return { ok: true, file: readDocument(text) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, problem: error.problem };
    throw error;
  }
}

/** The part of a picked file the import reads. */
export interface PickedFile {
  readonly size: number;
  text(): Promise<string>;
}

/** Refuses a file over the limit before reading it, then reads and checks it. */
export async function readPickedFile(picked: PickedFile): Promise<ReadResult> {
  if (picked.size > MAX_IMPORT_BYTES) return { ok: false, problem: { kind: 'tooLarge' } };
  let text: string;
  try {
    text = await picked.text();
  } catch {
    return { ok: false, problem: { kind: 'unreadable' } };
  }
  return readDiaryFile(text);
}

export function previewOf(file: DiaryImport): ImportPreview {
  return { foods: file.foods.length, water: file.water?.length ?? 0, range: file.range };
}

// ---- Planning the write --------------------------------------------------------------------

/** Trimmed, inner spaces collapsed, lower case. */
function normalName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function matchKey(day: DayKey, time: string, meal: MealKind, name: string): string {
  return JSON.stringify([day, time, meal, normalName(name)]);
}

function basisOf(food: ImportFood, before?: DiaryEntry): ServingBasis {
  if (food.grams !== null) {
    // A weight that only differs by the file's rounding keeps the stored one (and its unit).
    if (before?.basis.kind === 'grams' && Math.abs(before.basis.grams - food.grams) <= 0.05) {
      return before.basis;
    }
    return { kind: 'grams', grams: food.grams };
  }
  return before?.basis.kind === 'servings' ? before.basis : { kind: 'servings', count: 1 };
}

/** The file's parts; a part named like one the stored entry had keeps its photos and emoji. */
function linesOf(food: ImportFood, before?: DiaryEntry): IngredientLine[] {
  const unused = [...(before?.lines ?? [])];
  return food.lines.map((line) => {
    const index = unused.findIndex((old) => normalName(old.name) === normalName(line.name));
    const old = index === -1 ? undefined : unused.splice(index, 1)[0];
    return {
      ...line,
      photoIds: old?.photoIds ?? [],
      ...(old?.emoji === undefined ? {} : { emoji: old.emoji }),
    };
  });
}

/** A food the diary did not have. */
function newEntry(food: ImportFood, id: string): DiaryEntry {
  return {
    id,
    name: food.name,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    nutrients: food.nutrients,
    extras: food.extras,
    basis: basisOf(food),
    units: [],
    lines: linesOf(food),
    progressive: false,
    ...(food.note === undefined ? {} : { note: food.note }),
    loggedAt: food.loggedAt,
    dayKey: food.date,
    meal: food.meal,
    source: food.source === 'manual' ? 'manual' : 'text',
    photoIds: [],
  };
}

/** A stored entry taking the file's values: id, photos, product and units stay. */
function mergedEntry(food: ImportFood, before: DiaryEntry): DiaryEntry {
  const { note: _note, chosenUnit, chosenCount, ...kept } = before;
  const basis = basisOf(food, before);
  const sameBasis = basis === before.basis;
  return {
    ...kept,
    name: food.name,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    nutrients: food.nutrients,
    extras: food.extras,
    basis,
    // The unit choice describes the stored weight; a new weight shows in grams.
    ...(sameBasis && chosenUnit !== undefined ? { chosenUnit } : {}),
    ...(sameBasis && chosenCount !== undefined ? { chosenCount } : {}),
    lines: linesOf(food, before),
    ...(food.note === undefined ? {} : { note: food.note }),
    loggedAt: food.loggedAt,
    dayKey: food.date,
    meal: food.meal,
    // "ai" covers every source but manual: a stored photo or barcode entry stays one.
    source:
      food.source === 'manual' ? 'manual' : before.source === 'manual' ? 'text' : before.source,
  };
}

/** Hands out ids: the wanted one while it is free, else a new one. */
function idKeeper(taken: ReadonlySet<string>, newId: IdSource) {
  const given = new Set<string>();
  return {
    reserve(id: string): void {
      given.add(id);
    },
    take(wanted: string | null): string {
      let id = wanted !== null && !taken.has(wanted) && !given.has(wanted) ? wanted : newId();
      while (taken.has(id) || given.has(id)) id = newId();
      given.add(id);
      return id;
    },
  };
}

function waterWrite(
  file: DiaryImport,
  mode: ImportMode,
  stored: StoredDays,
  newId: IdSource,
): Pick<DaysWrite, 'putWater' | 'removeWaterIds'> {
  // A file without water lists leaves water alone.
  if (file.water === null) return { putWater: [], removeWaterIds: [] };
  const ids = idKeeper(stored.takenWaterIds, newId);
  if (mode === 'add') {
    // The day's logs stay, so their ids are not free either.
    for (const log of stored.water) ids.reserve(log.id);
  }
  const putWater = file.water.map((log): WaterLog => ({
    id: ids.take(mode === 'add' ? null : log.id),
    at: log.at,
    dayKey: log.date,
    ml: log.ml,
  }));
  return {
    putWater,
    removeWaterIds: mode === 'replace' ? stored.water.map((log) => log.id) : [],
  };
}

/**
 * What an import stores, worked out from what the file's days hold now. Pure: `stored` comes
 * from inside the write's transaction.
 */
export function planImport(
  file: DiaryImport,
  mode: ImportMode,
  stored: StoredDays,
  newId: IdSource,
): DaysWrite {
  const water = waterWrite(file, mode, stored, newId);
  const ids = idKeeper(stored.takenEntryIds, newId);

  if (mode === 'add') {
    for (const entry of stored.entries) ids.reserve(entry.id);
    return {
      putEntries: file.foods.map((food) => newEntry(food, ids.take(null))),
      removeEntryIds: [],
      ...water,
    };
  }

  const matches: (DiaryEntry | undefined)[] = file.foods.map(() => undefined);
  const matched = new Set<string>();
  const byId = new Map(stored.entries.map((entry) => [entry.id, entry]));
  // First by id, for every food; only then by day, minute, meal and name.
  file.foods.forEach((food, index) => {
    const entry = food.id === null ? undefined : byId.get(food.id);
    if (!entry || matched.has(entry.id)) return;
    matches[index] = entry;
    matched.add(entry.id);
  });
  const byKey = new Map<string, DiaryEntry[]>();
  for (const entry of stored.entries) {
    if (matched.has(entry.id)) continue;
    const key = matchKey(entry.dayKey, clockTime(entry.loggedAt), entry.meal, entry.name);
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }
  file.foods.forEach((food, index) => {
    if (matches[index]) return;
    const waiting = byKey.get(matchKey(food.date, food.time, food.meal, food.name));
    const entry = waiting?.shift();
    if (!entry) return;
    matches[index] = entry;
    matched.add(entry.id);
  });

  for (const id of matched) ids.reserve(id);
  const putEntries = file.foods.map((food, index) => {
    const before = matches[index];
    return before ? mergedEntry(food, before) : newEntry(food, ids.take(food.id));
  });
  return {
    putEntries,
    removeEntryIds: stored.entries.filter((entry) => !matched.has(entry.id)).map((e) => e.id),
    ...water,
  };
}

// ---- Applying it ---------------------------------------------------------------------------

export interface ImportDeps {
  readonly transferRepo: Pick<TransferRepo, 'rewriteDays'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  readonly newId: IdSource;
}

/**
 * Applies a checked file in one transaction, then cleans up the photos it dropped. Rejects when
 * the write fails; nothing has changed then.
 */
export async function importDiary(
  deps: ImportDeps,
  file: DiaryImport,
  mode: ImportMode,
): Promise<ImportCounts> {
  const { releasedPhotoIds } = await deps.transferRepo.rewriteDays(
    file.range.start,
    file.range.end,
    (stored) => planImport(file, mode, stored, deps.newId),
  );
  if (releasedPhotoIds.length > 0) {
    // The import itself is done; a failed cleanup leaves photos for the next one.
    await deps.photoRepo.releaseIfUnused(releasedPhotoIds).catch((error: unknown) => {
      console.error('Platewise: cleaning up photos after an import failed', error);
    });
  }
  return { foods: file.foods.length, water: file.water?.length ?? 0 };
}
