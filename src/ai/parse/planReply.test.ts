import { describe, expect, it } from 'vitest';
import { checkPlan } from '../../domain/goals/planValidator';
import type { Targets } from '../../domain/model';
import { parseModelJson } from './json';
import { PLAN_REPLY_KEYS, readPlanReply } from './planReply';

/** The person's formula plan the answer is judged against. */
const FORMULA: Targets = { kcal: 2_200, protein: 120, carbs: 250, fat: 70 };

/** A plausible plan answer in our keys; tests override single keys. */
function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kcal: 2_100,
    protein: 125,
    carbs: 230,
    fat: 70,
    why: '  A gentle deficit with protein near your formula.  ',
    ...overrides,
  };
}

describe('readPlanReply: our keys handed to the plan check (R01.2)', () => {
  it('gives exactly what the plan check gives, with why as the reason', () => {
    const result = readPlanReply(answer(), FORMULA);
    const expected = checkPlan(
      {
        kcal: 2_100,
        protein: 125,
        carbs: 230,
        fat: 70,
        reason: '  A gentle deficit with protein near your formula.  ',
      },
      FORMULA,
    );
    expect(expected.ok).toBe(true);
    expect(result).toEqual(expected);
    if (!result.ok) throw new Error('refused');
    expect(result.value.reason).toBe('A gentle deficit with protein near your formula.');
    const { kcal, protein, carbs, fat } = result.value;
    expect(4 * protein + 4 * carbs + 9 * fat).toBe(kcal);
  });

  it('reads an answer wrapped in prose, numeric strings included', () => {
    const parsed = parseModelJson(
      'Here is the plan:\n```json\n{"kcal":"2100","protein":"125","carbs":230,"fat":70,"why":"Steady"}\n```',
    );
    if (!parsed.ok) throw new Error('did not parse');
    const result = readPlanReply(parsed.value, FORMULA);
    expect(result).toMatchObject({ ok: true, value: { kcal: 2_100, reason: 'Steady' } });
  });

  it('leaves the reason out when why is blank, missing or not text', () => {
    for (const why of ['   ', undefined, 12]) {
      const result = readPlanReply(answer({ why }), FORMULA);
      if (!result.ok) throw new Error('refused');
      expect(result.value, String(why)).not.toHaveProperty('reason');
    }
    const named = readPlanReply(answer({ why: undefined, reason: 'Other key' }), FORMULA);
    if (!named.ok) throw new Error('refused');
    expect(named.value).not.toHaveProperty('reason');
  });

  it('lists our plan keys', () => {
    expect(Object.values(PLAN_REPLY_KEYS)).toEqual(['kcal', 'protein', 'carbs', 'fat', 'why']);
  });
});

describe('readPlanReply: a refused plan is an invalid answer, so the targets stay', () => {
  it('refuses a plan the check refuses and names the check', () => {
    expect(readPlanReply(answer({ kcal: 7_000 }), FORMULA)).toEqual({
      ok: false,
      error: {
        kind: 'invalidResponse',
        rejection: { step: 'outOfRange', field: 'kcal', value: 7_000, min: 800, max: 6_000 },
      },
    });
    expect(readPlanReply(answer({ protein: 300, carbs: 55 }), FORMULA)).toMatchObject({
      ok: false,
      error: { kind: 'invalidResponse', rejection: { step: 'implausible', field: 'protein' } },
    });
  });

  it('refuses a missing or non-numeric value', () => {
    expect(readPlanReply(answer({ fat: undefined }), FORMULA)).toEqual({
      ok: false,
      error: { kind: 'invalidResponse', rejection: { step: 'notNumber', field: 'fat' } },
    });
    expect(readPlanReply(answer({ carbs: true }), FORMULA)).toMatchObject({
      ok: false,
      error: { rejection: { step: 'notNumber', field: 'carbs' } },
    });
  });

  it('reads only our keys: kcal under another name is missing', () => {
    expect(readPlanReply(answer({ kcal: undefined, energy: 2_100 }), FORMULA)).toMatchObject({
      ok: false,
      error: { rejection: { step: 'notNumber', field: 'kcal' } },
    });
  });

  it('refuses an answer that is not an object', () => {
    for (const reply of [null, 'kcal 2100', [2_100, 125, 230, 70], 2_100]) {
      expect(readPlanReply(reply, FORMULA)).toEqual({
        ok: false,
        error: { kind: 'invalidResponse' },
      });
    }
  });
});
