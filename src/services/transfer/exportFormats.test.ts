import { describe, expect, it } from 'vitest';
import { transfer } from '../../i18n/en/transfer';
import { FACTORY_NOW, makeEntry, makeLine, makeWater } from '../../test/factories';
import { buildDocument, type DiaryDocument } from './exportDiary';
import { CSV_COLUMNS, csvField, diaryFile, markdownCell, toCsv, toMarkdown } from './exportFormats';

const words = transfer.transfer.markdown;
const MON = '2026-10-26';
const SUN = '2026-10-25';
const at = (day: string, time: string) => Date.parse(`${day}T${time}:00-04:00`);
const TARGETS = { kcal: 2000, protein: 120, carbs: 200, fat: 60 };

/** RFC 4180 text back into rows of fields (quoted fields may hold commas, quotes, breaks). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += char;
  }
  return rows;
}

/** A Saturday with a breakfast and water, a Sunday with food only. */
function sample(): DiaryDocument {
  return buildDocument({
    range: { start: '2026-10-24', end: SUN },
    entries: [
      makeEntry({
        id: 'oats',
        name: 'Oats',
        meal: 'breakfast',
        kcal: 320,
        nutrients: { fibre: 8.04, sodium: 12 },
        extras: { creatine: 3 },
        lines: [makeLine({ name: 'Rolled oats', grams: 80, kcal: 300 })],
        loggedAt: at('2026-10-24', '08:05'),
      }),
      makeEntry({ id: 'soup', name: 'Soup', loggedAt: at(SUN, '13:00') }),
    ],
    water: [
      makeWater({ id: 'w1', at: at('2026-10-24', '09:00'), ml: 250 }),
      makeWater({ id: 'w2', at: at('2026-10-24', '15:30'), ml: 500 }),
    ],
    targets: TARGETS,
  });
}

describe('csvField', () => {
  it('quotes a field with a comma, a quote or a line break and doubles its quotes (RFC 4180)', () => {
    expect(csvField('Oats')).toBe('Oats');
    expect(csvField('Mac "n" cheese, large')).toBe('"Mac ""n"" cheese, large"');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('')).toBe('');
  });
});

describe('toCsv', () => {
  it('has one header with the energy column named in kcal, then rows of its width', () => {
    const rows = parseCsv(toCsv(sample()));

    expect(rows[0]).toEqual(CSV_COLUMNS);
    expect(rows[0]?.[6]).toBe('energy_kcal');
    expect(rows.filter((row) => row[0] === 'date')).toHaveLength(1);
    for (const row of rows) expect(row).toHaveLength(CSV_COLUMNS.length);
    // Every nutrient and extra has its own column, its unit in the name.
    expect(CSV_COLUMNS).toEqual(
      expect.arrayContaining(['fibre_g', 'sodium_mg', 'vitamin_b12_mcg', 'omega3_g', 'creatine_g']),
    );
    expect(CSV_COLUMNS).toHaveLength(10 + 23 + 8 + 5);
  });

  it('writes food rows, a row per water log and one water total per day, 0 included', () => {
    const rows = parseCsv(toCsv(sample())).slice(1);
    const column = (name: string) => CSV_COLUMNS.indexOf(name);
    const pick = (row: string[], ...names: string[]) => names.map((name) => row[column(name)]);

    expect(rows.map((row) => pick(row, 'date', 'time', 'kind', 'meal', 'name'))).toEqual([
      ['2026-10-24', '08:05', 'food', 'breakfast', 'Oats'],
      ['2026-10-24', '09:00', 'water', '', ''],
      ['2026-10-24', '15:30', 'water', '', ''],
      ['2026-10-24', '', 'day_water', '', ''],
      [SUN, '13:00', 'food', 'lunch', 'Soup'],
      [SUN, '', 'day_water', '', ''],
    ]);
    expect(
      pick(rows[0] ?? [], 'grams', 'energy_kcal', 'fibre_g', 'sodium_mg', 'creatine_g', 'source'),
    ).toEqual(['420', '320', '8', '12', '3', 'ai']);
    expect(pick(rows[0] ?? [], 'parts')).toEqual(['Rolled oats (80 g, 300 kcal)']);
    expect(rows.map((row) => pick(row, 'water_ml', 'day_water_ml'))).toEqual([
      ['', ''],
      ['250', ''],
      ['500', ''],
      ['', '750'],
      ['', ''],
      ['', '0'],
    ]);
  });

  it('quotes a name with a comma and a quote, and a note with a line break, so they read back', () => {
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [makeEntry({ name: 'Mac "n" cheese, large', note: 'Half\nportion' })],
      water: [],
      targets: TARGETS,
    });
    const text = toCsv(document);

    expect(text).toContain('"Mac ""n"" cheese, large"');
    const [, food] = parseCsv(text);
    expect(food?.[CSV_COLUMNS.indexOf('name')]).toBe('Mac "n" cheese, large');
    expect(food?.[CSV_COLUMNS.indexOf('note')]).toBe('Half\nportion');
    expect(food).toHaveLength(CSV_COLUMNS.length);
  });

  it('is the same for a kJ reader: the header names kcal and values stay kcal (R06.14, ACC-K1-2)', () => {
    const kj = diaryFile(sample(), 'csv', 'kJ');
    const kcal = diaryFile(sample(), 'csv', 'kcal');

    expect(kj.text).toBe(kcal.text);
    const [header, food] = parseCsv(kj.text);
    expect(header?.[6]).toBe('energy_kcal');
    expect(food?.[6]).toBe('320');
  });
});

describe('markdownCell', () => {
  it('escapes the column bar and backslashes and keeps a cell on one line', () => {
    expect(markdownCell('Rice | beans')).toBe('Rice \\| beans');
    expect(markdownCell('a\\b')).toBe('a\\\\b');
    expect(markdownCell('two\n  lines')).toBe('two lines');
  });
});

describe('toMarkdown', () => {
  /** The cells of a table row, split on bars that are not escaped. */
  const cells = (line: string) => line.slice(2, -2).split(/(?<!\\) \| /);

  it('has a title, the days and where it came from, and no kcal line for a kcal reader', () => {
    const text = toMarkdown(sample(), 'kcal');

    expect(text.startsWith(`# ${words.title}\n`)).toBe(true);
    expect(text).toContain('Days 2026-10-24 to 2026-10-25');
    expect(text).toContain(words.madeWith);
    expect(text).not.toContain(words.kcalNote);
  });

  it('tells a kJ reader the energy is in kcal and keeps the kcal numbers (R06.14, ACC-K1-2)', () => {
    const kj = toMarkdown(sample(), 'kJ');

    expect(kj).toContain(words.kcalNote);
    expect(kj).toContain('Energy: 320 of 2000 kcal, 1680 left');
    expect(kj.replace(`\n${words.kcalNote}\n`, '')).toBe(toMarkdown(sample(), 'kcal'));
  });

  it('gives each day its totals against the targets, its water and a table per meal', () => {
    const text = toMarkdown(sample(), 'kcal');

    expect(text).toContain('## Saturday, October 24, 2026');
    expect(text).toContain('- Protein: 24 of 120 g');
    expect(text).toContain('- Water: 750 ml');
    expect(text).toContain('- Water logs: 09:00 250 ml, 15:30 500 ml');
    expect(text).toContain('## Sunday, October 25, 2026');
    expect(text).toContain('- Water: 0 ml');
    expect(text).toContain('### Breakfast');
    expect(text).toContain('### Lunch');
    const oats = text.split('\n').find((line) => line.startsWith('| 08:05 |')) ?? '';
    expect(cells(oats)).toEqual([
      '08:05',
      'Oats',
      '420 g',
      '320',
      '24',
      '58',
      '9.5',
      'Fibre 8 g · Sodium 12 mg · Creatine 3 g',
      'Rolled oats (80 g, 300 kcal)',
      words.source.ai,
      '—',
    ]);
  });

  it('escapes a bar in a name so the row keeps its columns', () => {
    const document = buildDocument({
      range: { start: MON, end: MON },
      entries: [makeEntry({ name: 'Rice | beans', loggedAt: FACTORY_NOW })],
      water: [],
      targets: TARGETS,
    });
    const text = toMarkdown(document, 'kcal');
    const lines = text.split('\n');
    const header = lines.find((line) => line.startsWith(`| ${words.column.time} |`)) ?? '';
    const row = lines.find((line) => line.includes('Rice')) ?? '';

    expect(row).toContain('Rice \\| beans');
    expect(cells(row)).toHaveLength(cells(header).length);
  });
});

describe('diaryFile', () => {
  it('names and types each format', () => {
    const name = 'platewise-diary-2026-10-24_to_2026-10-25';
    expect(diaryFile(sample(), 'json', 'kcal')).toMatchObject({
      name: `${name}.json`,
      type: 'application/json',
    });
    expect(diaryFile(sample(), 'markdown', 'kcal')).toMatchObject({
      name: `${name}.md`,
      type: 'text/markdown',
    });
    expect(diaryFile(sample(), 'csv', 'kcal')).toMatchObject({
      name: `${name}.csv`,
      type: 'text/csv',
    });
  });
});
