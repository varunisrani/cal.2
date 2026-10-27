// Diary export (06 §3.13, D-16.2): which days a choice covers, the diary file's own JSON shape
// and the hand-over of a finished file to the person. The file is ours, not the reference's: a
// `platewise-diary` document, version 1.0, which the import (importDiary.ts) reads back.
//
// Energy in a file is always the stored kcal, whatever unit the person reads, so two files always
// compare and an import never converts twice (R06.14); exportFormats.ts says so to kJ readers.
// "This week" starts on the app's own week start, Monday or Sunday (R06.17).

import { addDays, splitDayKey, type DayKey } from '../../domain/dates/dayKey';
import { weekStart, type WeekStart } from '../../domain/dates/week';
import {
  EXTRA_KEYS,
  MEAL_KINDS,
  NUTRIENT_KEYS,
  type DiaryEntry,
  type ExtraKey,
  type IngredientLine,
  type MealKind,
  type NutrientKey,
  type Targets,
  type WaterLog,
} from '../../domain/model';
import { EXTRA_UNIT, NUTRIENT_UNITS, type MassUnit } from '../../domain/nutrients/catalogue';

/** The format id every diary file carries. */
export const DIARY_FORMAT = 'platewise-diary';
/** The version this build writes; an import takes any 1.x. */
export const DIARY_VERSION = '1.0';

export const EXPORT_RANGES = ['today', 'week', 'month', 'all', 'custom'] as const;
export type ExportRange = (typeof EXPORT_RANGES)[number];

export const EXPORT_FORMATS = ['json', 'markdown', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The days a range choice names; a custom one carries its own two ends, in either order. */
export type RangeChoice =
  | { readonly kind: Exclude<ExportRange, 'custom'> }
  | { readonly kind: 'custom'; readonly from: DayKey; readonly to: DayKey };

/** An inclusive run of days, `start` never after `end`. */
export interface DaySpan {
  readonly start: DayKey;
  readonly end: DayKey;
}

// ---- The document ------------------------------------------------------------------------

/** Energy in whole kcal and the three macros in grams. */
export interface FileMacros {
  readonly kcal: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
}

export interface FileLine extends FileMacros {
  readonly name: string;
  readonly grams: number;
}

export type FileSource = 'manual' | 'ai';

export interface FileItem extends FileMacros {
  readonly id: string;
  readonly name: string;
  /** The weight, when it is known. */
  readonly grams?: number;
  /** Known nutrients only, keyed with their unit (`fibreG`, `sodiumMg`, `vitaminB12Mcg`). */
  readonly nutrients: Readonly<Record<string, number>>;
  /** Known sports compounds only, in grams (`creatineG`). */
  readonly extras: Readonly<Record<string, number>>;
  /** Local wall-clock time, `HH:mm`. */
  readonly time: string;
  readonly source: FileSource;
  readonly note?: string;
  readonly lines: readonly FileLine[];
}

export interface FileMeal {
  readonly meal: MealKind;
  readonly items: readonly FileItem[];
}

export interface FileWater {
  readonly id: string;
  readonly time: string;
  readonly ml: number;
}

export interface FileDay {
  readonly date: DayKey;
  readonly totals: FileMacros;
  readonly targets: FileMacros;
  /** Target less eaten, never below 0. */
  readonly left: FileMacros;
  readonly meals: readonly FileMeal[];
  readonly water: readonly FileWater[];
  readonly waterTotalMl: number;
}

export interface DiaryDocument {
  readonly format: typeof DIARY_FORMAT;
  readonly version: string;
  readonly range: DaySpan;
  readonly days: readonly FileDay[];
}

/** A finished file: its name, its media type and its text. */
export interface DiaryFile {
  readonly name: string;
  readonly type: string;
  readonly text: string;
}

const EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  json: 'json',
  markdown: 'md',
  csv: 'csv',
};

export const MEDIA_TYPES: Readonly<Record<ExportFormat, string>> = {
  json: 'application/json',
  markdown: 'text/markdown',
  csv: 'text/csv',
};

const UNIT_SUFFIX: Readonly<Record<MassUnit, string>> = { g: 'G', mg: 'Mg', mcg: 'Mcg' };

/** Each nutrient's key in a file: its id with its unit (`sodium` → `sodiumMg`). */
export const NUTRIENT_FILE_KEYS = Object.fromEntries(
  NUTRIENT_KEYS.map((key) => [key, `${key}${UNIT_SUFFIX[NUTRIENT_UNITS[key]]}`]),
) as Readonly<Record<NutrientKey, string>>;

/** Each sports compound's key in a file (`creatine` → `creatineG`). */
export const EXTRA_FILE_KEYS = Object.fromEntries(
  EXTRA_KEYS.map((key) => [key, `${key}${UNIT_SUFFIX[EXTRA_UNIT]}`]),
) as Readonly<Record<ExtraKey, string>>;

// ---- Days ------------------------------------------------------------------------------------

function span(a: DayKey, b: DayKey): DaySpan {
  // Day keys are zero-padded, so text order is calendar order.
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/**
 * The days a choice covers, ending today: today alone; this week from the app's week start; this
 * month from its 1st; all time from the earliest day with food or water (today when there is
 * none); a custom pair of days in either order.
 */
export function resolveRange(
  choice: RangeChoice,
  today: DayKey,
  start: WeekStart,
  firstDay: DayKey | null,
): DaySpan {
  switch (choice.kind) {
    case 'today':
      return { start: today, end: today };
    case 'week':
      return { start: weekStart(today, start), end: today };
    case 'month': {
      const { day } = splitDayKey(today);
      return { start: addDays(today, 1 - day), end: today };
    }
    case 'all':
      return span(firstDay ?? today, today);
    case 'custom':
      return span(choice.from, choice.to);
  }
}

/** `platewise-diary-<start>_to_<end>.<ext>` */
export function diaryFileName(range: DaySpan, format: ExportFormat): string {
  return `platewise-diary-${range.start}_to_${range.end}.${EXTENSIONS[format]}`;
}

// ---- Building the document -------------------------------------------------------------------

/** To one decimal. */
export function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** To milligram precision, for grams of compounds that come in milligrams. */
function milligrams(grams: number): number {
  return Math.round(grams * 1000) / 1000;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local wall-clock time of an instant, `HH:mm`. */
export function clockTime(ms: number): string {
  const local = new Date(ms);
  return `${pad2(local.getHours())}:${pad2(local.getMinutes())}`;
}

function lineOf(line: IngredientLine): FileLine {
  return {
    name: line.name,
    grams: oneDecimal(line.grams),
    kcal: Math.round(line.kcal),
    protein: oneDecimal(line.protein),
    carbs: oneDecimal(line.carbs),
    fat: oneDecimal(line.fat),
  };
}

function itemOf(entry: DiaryEntry): FileItem {
  const nutrients: Record<string, number> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = entry.nutrients[key];
    if (value !== undefined) nutrients[NUTRIENT_FILE_KEYS[key]] = oneDecimal(value);
  }
  const extras: Record<string, number> = {};
  for (const key of EXTRA_KEYS) {
    const value = entry.extras[key];
    if (value !== undefined) extras[EXTRA_FILE_KEYS[key]] = milligrams(value);
  }
  const note = entry.note?.trim() ? entry.note : undefined;
  return {
    id: entry.id,
    name: entry.name,
    ...(entry.basis.kind === 'grams' ? { grams: oneDecimal(entry.basis.grams) } : {}),
    kcal: Math.round(entry.kcal),
    protein: oneDecimal(entry.protein),
    carbs: oneDecimal(entry.carbs),
    fat: oneDecimal(entry.fat),
    nutrients,
    extras,
    time: clockTime(entry.loggedAt),
    source: entry.source === 'manual' ? 'manual' : 'ai',
    ...(note === undefined ? {} : { note }),
    lines: entry.lines.map(lineOf),
  };
}

function wholeTargets(targets: Targets | null): FileMacros {
  return {
    kcal: Math.round(targets?.kcal ?? 0),
    protein: oneDecimal(targets?.protein ?? 0),
    carbs: oneDecimal(targets?.carbs ?? 0),
    fat: oneDecimal(targets?.fat ?? 0),
  };
}

function dayOf(
  date: DayKey,
  entries: readonly DiaryEntry[],
  water: readonly WaterLog[],
  targets: FileMacros,
): FileDay {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const entry of entries) {
    kcal += entry.kcal;
    protein += entry.protein;
    carbs += entry.carbs;
    fat += entry.fat;
  }
  const totals: FileMacros = {
    kcal: Math.round(kcal),
    protein: oneDecimal(protein),
    carbs: oneDecimal(carbs),
    fat: oneDecimal(fat),
  };
  const meals = MEAL_KINDS.flatMap((meal): FileMeal[] => {
    const items = entries
      .filter((entry) => entry.meal === meal)
      .sort((a, b) => a.loggedAt - b.loggedAt)
      .map(itemOf);
    return items.length === 0 ? [] : [{ meal, items }];
  });
  const logs = [...water].sort((a, b) => a.at - b.at);
  return {
    date,
    totals,
    targets,
    left: {
      kcal: Math.max(0, targets.kcal - totals.kcal),
      protein: oneDecimal(Math.max(0, targets.protein - protein)),
      carbs: oneDecimal(Math.max(0, targets.carbs - carbs)),
      fat: oneDecimal(Math.max(0, targets.fat - fat)),
    },
    meals,
    water: logs.map((log) => ({ id: log.id, time: clockTime(log.at), ml: oneDecimal(log.ml) })),
    waterTotalMl: oneDecimal(logs.reduce((sum, log) => sum + log.ml, 0)),
  };
}

export interface DocumentInput {
  readonly range: DaySpan;
  /** The entries and water logs to put in; anything on a day outside `range` is left out. */
  readonly entries: readonly DiaryEntry[];
  readonly water: readonly WaterLog[];
  /** The targets in effect, the same for every day; null (no profile) writes 0. */
  readonly targets: Targets | null;
}

/** The document of the days in `range` that have food or water, oldest day first. */
export function buildDocument({ range, entries, water, targets }: DocumentInput): DiaryDocument {
  const inRange = (day: DayKey) => day >= range.start && day <= range.end;
  const foodByDay = new Map<DayKey, DiaryEntry[]>();
  for (const entry of entries) {
    if (!inRange(entry.dayKey)) continue;
    foodByDay.set(entry.dayKey, [...(foodByDay.get(entry.dayKey) ?? []), entry]);
  }
  const waterByDay = new Map<DayKey, WaterLog[]>();
  for (const log of water) {
    if (!inRange(log.dayKey)) continue;
    waterByDay.set(log.dayKey, [...(waterByDay.get(log.dayKey) ?? []), log]);
  }
  const fileTargets = wholeTargets(targets);
  const dates = [...new Set([...foodByDay.keys(), ...waterByDay.keys()])].sort();
  return {
    format: DIARY_FORMAT,
    version: DIARY_VERSION,
    range,
    days: dates.map((date) =>
      dayOf(date, foodByDay.get(date) ?? [], waterByDay.get(date) ?? [], fileTargets),
    ),
  };
}

/** The document as the JSON file holds it. */
export function toJson(document: DiaryDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

// ---- Handing the file over -------------------------------------------------------------------

/** The parts of the browser a hand-over uses; tests pass their own. */
export interface FileHandOver {
  /** Web Share with files, when the browser has it. */
  readonly canShare?: (data: ShareData) => boolean;
  readonly share?: (data: ShareData) => Promise<void>;
  /** Saves a file through a download link. */
  readonly download: (file: File) => void;
}

export type HandOverResult = 'shared' | 'downloaded' | 'cancelled';

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Offers the file to the share sheet when the browser can share that file, else downloads it. The
 * person closing the share sheet is `cancelled`; a share that fails for another reason (a type
 * the target refuses, a lost user gesture) downloads instead.
 */
export async function handOver(file: DiaryFile, browser: FileHandOver): Promise<HandOverResult> {
  const blob = new File([file.text], file.name, { type: file.type });
  const data: ShareData = { files: [blob] };
  if (browser.share && browser.canShare?.(data)) {
    try {
      await browser.share(data);
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  browser.download(blob);
  return 'downloaded';
}

/** How long a download link's object URL stays alive after the click. */
const DOWNLOAD_URL_MS = 60_000;

/** The browser's own share sheet and download link. */
export function browserHandOver(): FileHandOver {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    canShare: nav?.canShare ? (data) => nav.canShare(data) : undefined,
    share: nav?.share ? (data) => nav.share(data) : undefined,
    download(file) {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_MS);
    },
  };
}
