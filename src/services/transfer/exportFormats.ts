// The diary file as Markdown and as CSV (06 §3.13, R06.14), and the finished file in each format.
// Both hold the document's own numbers: energy in kcal for every reader. A kJ reader's Markdown
// says so in one line; the CSV's energy column is named `energy_kcal` for everyone, so its header
// always names the unit, like every other amount column. The Markdown's words come from the
// catalogue; the CSV's header and row kinds are fixed ids, not copy.

import { formatDay } from '../../i18n/format';
import { t } from '../../i18n/t';
import {
  EXTRA_KEYS,
  NUTRIENT_KEYS,
  type ExtraKey,
  type MealKind,
  type NutrientKey,
} from '../../domain/model';
import { EXTRA_UNIT, NUTRIENT_UNITS } from '../../domain/nutrients/catalogue';
import type { EnergyDisplayUnit } from '../../domain/units/energy';
import {
  diaryFileName,
  EXTRA_FILE_KEYS,
  MEDIA_TYPES,
  NUTRIENT_FILE_KEYS,
  toJson,
  type DiaryDocument,
  type DiaryFile,
  type ExportFormat,
  type FileDay,
  type FileItem,
  type FileLine,
} from './exportDiary';

/** The file of a document in one format. */
export function diaryFile(
  document: DiaryDocument,
  format: ExportFormat,
  energyUnit: EnergyDisplayUnit,
): DiaryFile {
  const text =
    format === 'json'
      ? toJson(document)
      : format === 'markdown'
        ? toMarkdown(document, energyUnit)
        : toCsv(document);
  return { name: diaryFileName(document.range, format), type: MEDIA_TYPES[format], text };
}

/** A number as the files write it: no grouping, a point for decimals. */
function plain(value: number): string {
  return String(value);
}

function partsText(lines: readonly FileLine[]): string {
  return lines.map((line) => `${line.name} (${line.grams} g, ${line.kcal} kcal)`).join('; ');
}

// ---- CSV -------------------------------------------------------------------------------------

/** `vitaminB12` → `vitamin_b12`. */
function snake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const NUTRIENT_COLUMNS = NUTRIENT_KEYS.map((key) => `${snake(key)}_${NUTRIENT_UNITS[key]}`);
const EXTRA_COLUMNS = EXTRA_KEYS.map((key) => `${snake(key)}_${EXTRA_UNIT}`);

/** The one header every row follows. */
export const CSV_COLUMNS: readonly string[] = [
  'date',
  'time',
  'kind',
  'meal',
  'name',
  'grams',
  'energy_kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  ...NUTRIENT_COLUMNS,
  ...EXTRA_COLUMNS,
  'source',
  'note',
  'parts',
  'water_ml',
  'day_water_ml',
];

/** RFC 4180: a field with a comma, a quote or a line break is quoted, its quotes doubled. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Free text a spreadsheet would take for a formula (it starts with `=`, `+`, `-`, `@`, a tab or a
 * carriage return) gets a leading apostrophe, so opening the file never runs a food name from a
 * food database or an AI reply as a formula (P10-09). Numbers never come through here.
 */
export function inertText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

type Row = Partial<Record<string, string>>;

function csvLine(row: Row): string {
  return CSV_COLUMNS.map((column) => csvField(row[column] ?? '')).join(',');
}

function foodRow(date: string, meal: MealKind, item: FileItem): Row {
  const row: Row = {
    date,
    time: item.time,
    kind: 'food',
    meal,
    name: inertText(item.name),
    grams: item.grams === undefined ? '' : plain(item.grams),
    energy_kcal: plain(item.kcal),
    protein_g: plain(item.protein),
    carbs_g: plain(item.carbs),
    fat_g: plain(item.fat),
    source: item.source,
    note: inertText(item.note ?? ''),
    parts: inertText(partsText(item.lines)),
  };
  NUTRIENT_KEYS.forEach((key, index) => {
    const value = item.nutrients[NUTRIENT_FILE_KEYS[key]];
    if (value !== undefined) row[NUTRIENT_COLUMNS[index] ?? ''] = plain(value);
  });
  EXTRA_KEYS.forEach((key, index) => {
    const value = item.extras[EXTRA_FILE_KEYS[key]];
    if (value !== undefined) row[EXTRA_COLUMNS[index] ?? ''] = plain(value);
  });
  return row;
}

function dayRows(day: FileDay): Row[] {
  const rows: Row[] = [];
  for (const { meal, items } of day.meals) {
    for (const item of items) rows.push(foodRow(day.date, meal, item));
  }
  for (const log of day.water) {
    rows.push({ date: day.date, time: log.time, kind: 'water', water_ml: plain(log.ml) });
  }
  // Every day has its water total, 0 included, so a sheet can sum the days.
  rows.push({ date: day.date, kind: 'day_water', day_water_ml: plain(day.waterTotalMl) });
  return rows;
}

/** One header, then per day its food rows, a row per water log and the day's water total. */
export function toCsv(document: DiaryDocument): string {
  const lines = [CSV_COLUMNS.join(','), ...document.days.flatMap(dayRows).map(csvLine)];
  return `${lines.join('\r\n')}\r\n`;
}

// ---- Markdown ------------------------------------------------------------------------------

/** A table cell: escapes what would end the cell or the row. */
export function markdownCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*[\r\n]+\s*/g, ' ');
}

const MEAL_KEYS = {
  breakfast: 'log.meal.breakfast',
  lunch: 'log.meal.lunch',
  dinner: 'log.meal.dinner',
  snack: 'log.meal.snack',
  other: 'log.meal.other',
} as const satisfies Record<MealKind, string>;

function nutrientName(key: NutrientKey): string {
  return t(`review.nutrient.${key}`);
}

function extraName(key: ExtraKey): string {
  return t(`review.extra.${key}`);
}

/** The known nutrients and extras of an item: "Fibre 3.3 g · Sodium 820 mg". */
function nutrientsText(item: FileItem): string {
  const parts: string[] = [];
  for (const key of NUTRIENT_KEYS) {
    const value = item.nutrients[NUTRIENT_FILE_KEYS[key]];
    if (value !== undefined) {
      parts.push(`${nutrientName(key)} ${plain(value)} ${t(`review.unit.${NUTRIENT_UNITS[key]}`)}`);
    }
  }
  for (const key of EXTRA_KEYS) {
    const value = item.extras[EXTRA_FILE_KEYS[key]];
    if (value !== undefined) parts.push(`${extraName(key)} ${plain(value)} ${t('review.unit.g')}`);
  }
  return parts.join(' · ');
}

function tableRow(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function mealTable(meal: MealKind, items: readonly FileItem[]): string[] {
  const empty = t('review.unknown');
  const or = (value: string) => (value === '' ? empty : markdownCell(value));
  const header = [
    t('transfer.markdown.column.time'),
    t('transfer.markdown.column.food'),
    t('transfer.markdown.column.weight'),
    t('transfer.markdown.column.kcal'),
    t('transfer.markdown.column.protein'),
    t('transfer.markdown.column.carbs'),
    t('transfer.markdown.column.fat'),
    t('transfer.markdown.column.nutrients'),
    t('transfer.markdown.column.parts'),
    t('transfer.markdown.column.source'),
    t('transfer.markdown.column.note'),
  ];
  // Numbers line up on the right; text stays on the left.
  const align = ['---', '---', '--:', '--:', '--:', '--:', '--:', '---', '---', '---', '---'];
  const rows = items.map((item) =>
    tableRow([
      item.time,
      or(item.name),
      item.grams === undefined ? empty : `${plain(item.grams)} ${t('review.unit.g')}`,
      plain(item.kcal),
      plain(item.protein),
      plain(item.carbs),
      plain(item.fat),
      or(nutrientsText(item)),
      or(partsText(item.lines)),
      t(`transfer.markdown.source.${item.source}`),
      or(item.note ?? ''),
    ]),
  );
  return [`### ${t(MEAL_KEYS[meal])}`, '', tableRow(header), tableRow(align), ...rows, ''];
}

function daySection(day: FileDay): string[] {
  const macro = (name: string, eaten: number, target: number) =>
    `- ${t('transfer.markdown.macro', { name, eaten: plain(eaten), target: plain(target) })}`;
  const lines = [
    `## ${formatDay(day.date, 'long')}`,
    '',
    `- ${t('transfer.markdown.energy', {
      eaten: plain(day.totals.kcal),
      target: plain(day.targets.kcal),
      left: plain(day.left.kcal),
    })}`,
    macro(t('review.nutrition.protein'), day.totals.protein, day.targets.protein),
    macro(t('review.nutrition.carbs'), day.totals.carbs, day.targets.carbs),
    macro(t('review.nutrition.fat'), day.totals.fat, day.targets.fat),
    `- ${t('transfer.markdown.water', { total: plain(day.waterTotalMl) })}`,
  ];
  if (day.water.length > 0) {
    const logs = day.water
      .map((log) => t('transfer.markdown.waterLog', { time: log.time, ml: plain(log.ml) }))
      .join(', ');
    lines.push(`- ${t('transfer.markdown.waterLogs', { logs })}`);
  }
  lines.push('');
  for (const { meal, items } of day.meals) lines.push(...mealTable(meal, items));
  return lines;
}

/**
 * A title, the days, where it came from and (for a kJ reader) that energy is in kcal; then per
 * day the totals against the targets and the water, and one table per meal.
 */
export function toMarkdown(document: DiaryDocument, energyUnit: EnergyDisplayUnit): string {
  const lines = [
    `# ${t('transfer.markdown.title')}`,
    '',
    t('transfer.markdown.range', { start: document.range.start, end: document.range.end }),
    '',
    t('transfer.markdown.madeWith'),
  ];
  if (energyUnit === 'kJ') lines.push('', t('transfer.markdown.kcalNote'));
  lines.push('');
  for (const day of document.days) lines.push(...daySection(day));
  return `${lines.join('\n').trimEnd()}\n`;
}
