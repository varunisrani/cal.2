import { describe, expect, it } from 'vitest';
import { addDays } from '../../domain/dates/dayKey';
import { SNAPSHOT_TODAY, entryOn, makeSnapshot } from './__fixtures__/snapshot';
import { TOOL_RESULT_MAX_CHARS, limitToolResult } from './limiter';
import { runCoachTool } from './tools';

type Json = Record<string, unknown>;

/** A result shaped like a tool's: a range, a count and `count` rows, oldest first. */
function rowsResult(count: number): string {
  const items = Array.from({ length: count }, (_, index) => ({
    date: addDays('2021-01-01', index),
    name: `Row ${index + 1} with a name long enough to take some room`,
    kcal: 300 + index,
    proteinG: 12.5,
  }));
  return JSON.stringify({ from: '2021-01-01', to: '2026-10-26', count, items });
}

function read(text: string): Json {
  return JSON.parse(text) as Json;
}

const TOO_LARGE = {
  error: 'result too large',
  note: 'This result was too long to send. Ask again with a narrower date range.',
};

describe('limitToolResult: within the cap', () => {
  it('returns a small result unchanged', () => {
    const text = rowsResult(3);
    expect(limitToolResult(text)).toBe(text);
  });

  it('returns a result of exactly 60 000 characters unchanged, even when it is not JSON', () => {
    expect(TOOL_RESULT_MAX_CHARS).toBe(60_000);
    const text = 'x'.repeat(60_000);
    expect(limitToolResult(text)).toBe(text);
  });
});

describe('limitToolResult: cutting a long list (R04.9, D-16.32)', () => {
  it('fits 2 000 rows under 60 000, keeping count and the newest rows, with the markers', () => {
    const text = rowsResult(2_000);
    expect(text.length).toBeGreaterThan(TOOL_RESULT_MAX_CHARS);
    const cut = limitToolResult(text);
    expect(cut.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);

    const result = read(cut);
    const rows = result.items as Json[];
    expect(rows.length).toBeGreaterThan(100);
    expect(result.count).toBe(2_000);
    expect(result).toMatchObject({ from: '2021-01-01', to: '2026-10-26', truncated: true });
    expect(result.omittedItems).toBe(2_000 - rows.length);
    expect(result.note).toBe(
      'This result was too long, so its oldest rows were left out. Ask again with a narrower date range to see them.',
    );
    expect(rows[rows.length - 1]?.name).toMatch(/^Row 2000 /);
    expect(rows[0]?.name).toMatch(new RegExp(`^Row ${2_000 - rows.length + 1} `));
    const original = (read(text).items as Json[]).slice(-rows.length);
    expect(rows).toEqual(original);
  });

  it('keeps as many rows as fit: one more would go over the cap', () => {
    const text = rowsResult(2_000);
    const result = read(limitToolResult(text));
    const kept = (result.items as Json[]).length;
    const all = read(text).items as Json[];
    const oneMore = JSON.stringify({
      ...result,
      items: all.slice(all.length - kept - 1),
      omittedItems: 2_000 - kept - 1,
    });
    expect(oneMore.length).toBeGreaterThan(TOOL_RESULT_MAX_CHARS);
  });

  it('cuts only the longest of two lists and keeps the fields in their places', () => {
    const big = read(rowsResult(1_500));
    const text = JSON.stringify({ short: [1, 2, 3], ...big });
    const result = read(limitToolResult(text, 20_000));
    expect(result.short).toEqual([1, 2, 3]);
    expect(Object.keys(result)).toEqual([
      'short',
      'from',
      'to',
      'count',
      'items',
      'truncated',
      'omittedItems',
      'note',
    ]);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(20_000);
  });

  it('trims a year of food_log output and keeps the newest days (ACC-I9-1)', () => {
    const entries = Array.from({ length: 365 * 3 }, (_, index) => {
      const day = addDays(SNAPSHOT_TODAY, Math.floor(index / 3) - 364);
      return entryOn(day, ['08:00', '13:00', '19:00'][index % 3] ?? '12:00', {
        name: `Meal ${index + 1}`,
        nutrients: { fibre: 6, sugar: 12, sodium: 700, potassium: 900, calcium: 300, iron: 4 },
      });
    });
    const snapshot = makeSnapshot({ entries });
    const raw = runCoachTool(
      'food_log',
      { from: addDays(SNAPSHOT_TODAY, -364), to: SNAPSHOT_TODAY, limit: 365 },
      snapshot,
    );
    expect(raw.length).toBeGreaterThan(TOOL_RESULT_MAX_CHARS);

    const cut = limitToolResult(raw);
    expect(cut.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    const result = read(cut);
    const rows = result.items as Json[];
    expect(result).toMatchObject({ count: 365, limited: true, omittedOlder: 730, truncated: true });
    expect(result.omittedItems).toBe(365 - rows.length);
    expect(rows[rows.length - 1]).toMatchObject({ date: SNAPSHOT_TODAY, name: 'Meal 1095' });
  });
});

describe('limitToolResult: what cannot be cut', () => {
  it('replaces a long text that is not a JSON object with the error', () => {
    const long = 'x'.repeat(70_000);
    for (const text of [long, JSON.stringify(long), JSON.stringify([long]), `{${long}`]) {
      expect(read(limitToolResult(text))).toEqual(TOO_LARGE);
    }
  });

  it('replaces a long object without a list with the error', () => {
    expect(read(limitToolResult(JSON.stringify({ text: 'x'.repeat(70_000) })))).toEqual(TOO_LARGE);
  });

  it('replaces an object whose other fields alone are over the cap with the error', () => {
    const text = JSON.stringify({ text: 'x'.repeat(70_000), items: [1, 2, 3] });
    expect(read(limitToolResult(text))).toEqual(TOO_LARGE);
  });
});
