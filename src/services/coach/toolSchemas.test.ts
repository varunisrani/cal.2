import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_DEFAULT_DAYS,
  ACTIVITY_MAX_DAYS,
  ACTIVITY_TOOL,
  LATER_TOOL_NAMES,
  MAX_PROPOSALS,
  NUTRITION_TOOLS,
  NUTRITION_TOOL_NAMES,
  REMINDER_TOOL,
  REMINDER_TOOL_NAME,
  ROW_LIMITS,
  coachTools,
  isLaterToolName,
  isNutritionToolName,
  type ToolSchema,
} from './toolSchemas';

/** The JSON Schema keywords all three wire formats accept. */
const PORTABLE_KEYWORDS = new Set(['type', 'description', 'properties', 'required', 'items']);

function keywordsIn(schema: unknown, found = new Set<string>()): Set<string> {
  if (typeof schema !== 'object' || schema === null) return found;
  for (const [key, value] of Object.entries(schema)) {
    found.add(key);
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      for (const property of Object.values(value)) keywordsIn(property, found);
    }
  }
  return found;
}

function tool(name: string): ToolSchema {
  const found = NUTRITION_TOOLS.find((schema) => schema.name === name);
  if (found === undefined) throw new Error(`no schema for ${name}`);
  return found;
}

describe('NUTRITION_TOOLS: the catalogue (R04.20)', () => {
  it('offers exactly the six nutrition tools, in order', () => {
    expect(NUTRITION_TOOLS.map((schema) => schema.name)).toEqual([
      'data_overview',
      'weight_log',
      'body_fat_log',
      'daily_energy_totals',
      'food_log',
      'fasting_log',
    ]);
    expect(NUTRITION_TOOL_NAMES).toEqual(NUTRITION_TOOLS.map((schema) => schema.name));
  });

  it('offers no later-phase workout or suggestion tool', () => {
    const offered = NUTRITION_TOOLS.map((schema) => schema.name as string);
    for (const later of LATER_TOOL_NAMES) {
      expect(offered).not.toContain(later);
      expect(isLaterToolName(later)).toBe(true);
      expect(isNutritionToolName(later)).toBe(false);
    }
    for (const schema of NUTRITION_TOOLS) {
      expect(schema.description).not.toMatch(/workout|exercise|training/i);
    }
  });

  it('tells nutrition names from others', () => {
    expect(isNutritionToolName('food_log')).toBe(true);
    expect(isNutritionToolName('Food_log')).toBe(false);
    expect(isNutritionToolName(undefined)).toBe(false);
    expect(isLaterToolName('food_log')).toBe(false);
  });
});

describe('NUTRITION_TOOLS: the schemas', () => {
  it('gives every tool an object schema that uses only portable keywords', () => {
    for (const schema of NUTRITION_TOOLS) {
      expect(schema.parameters.type).toBe('object');
      expect(schema.description.length).toBeGreaterThan(40);
      for (const keyword of keywordsIn(schema.parameters)) {
        expect(PORTABLE_KEYWORDS.has(keyword), `${schema.name} uses ${keyword}`).toBe(true);
      }
    }
  });

  it('takes no arguments for data_overview', () => {
    expect(tool('data_overview').parameters).toEqual({ type: 'object', properties: {} });
  });

  it('requires from and to on the range tools and offers limit where a limit applies', () => {
    for (const name of ['weight_log', 'body_fat_log', 'food_log', 'fasting_log'] as const) {
      const { parameters } = tool(name);
      expect(parameters.required).toEqual(['from', 'to']);
      expect(Object.keys(parameters.properties)).toEqual(['from', 'to', 'limit']);
      expect(parameters.properties.from?.type).toBe('string');
      expect(parameters.properties.to?.type).toBe('string');
      expect(parameters.properties.limit?.type).toBe('integer');
      const { fallback, max } = ROW_LIMITS[name];
      expect(parameters.properties.limit?.description).toContain(`1 to ${max}`);
      expect(parameters.properties.limit?.description).toContain(`Leave it out for ${fallback}.`);
      expect(tool(name).description).toContain(`At most ${max} rows.`);
    }
    const totals = tool('daily_energy_totals').parameters;
    expect(totals.required).toEqual(['from', 'to']);
    expect(Object.keys(totals.properties)).toEqual(['from', 'to']);
  });

  it('describes dates as inclusive local YYYY-MM-DD days with their defaults (R04.17)', () => {
    const { properties } = tool('food_log').parameters;
    expect(properties.from?.description).toContain('YYYY-MM-DD, a local day, included');
    expect(properties.from?.description).toContain('30 days before "to"');
    expect(properties.to?.description).toContain('becomes today');
  });

  it('keeps the limits of the spec: 365 for weights and body fat, 200 of 365 for food and fasts', () => {
    expect(ROW_LIMITS).toEqual({
      weight_log: { fallback: 365, max: 365 },
      body_fat_log: { fallback: 365, max: 365 },
      food_log: { fallback: 200, max: 365 },
      fasting_log: { fallback: 200, max: 365 },
    });
  });

  it('says the limit keeps the newest rows (R04.10)', () => {
    for (const name of ['weight_log', 'body_fat_log', 'food_log', 'fasting_log']) {
      expect(tool(name).description).toContain('the oldest go');
      expect(tool(name).parameters.properties.limit?.description).toContain(
        'the newest rows are kept',
      );
    }
  });
});

describe('NUTRITION_TOOLS: a missing log is not a fast (R04.16)', () => {
  it('says in the fasting tool that only tracked fasts count and an empty day is not a fast', () => {
    const { description } = tool('fasting_log');
    expect(description).toContain('tracked with the fasting timer');
    expect(description).toContain('a day without food entries is not a fast');
  });

  it('says in the daily totals tool that a day without entries has no row and is not 0 kcal', () => {
    const { description } = tool('daily_energy_totals');
    expect(description).toContain('A day without entries has no row.');
    expect(description).toContain('never read it as 0 kcal or as a fast');
  });
});

describe('ACTIVITY_TOOL: Health Connect day by day (D-16.94)', () => {
  it('is offered after the six only when the turn has Health Connect activity', () => {
    expect(coachTools(false)).toEqual(NUTRITION_TOOLS);
    expect(coachTools(true).map((schema) => schema.name)).toEqual([
      ...NUTRITION_TOOL_NAMES,
      'activity_log',
    ]);
    expect(isNutritionToolName('activity_log')).toBe(false);
    expect(isLaterToolName('activity_log')).toBe(false);
  });

  it('takes a from and to day range like the other range tools, with portable keywords only', () => {
    const { parameters } = ACTIVITY_TOOL;
    expect(parameters.type).toBe('object');
    expect(parameters.required).toEqual(['from', 'to']);
    expect(Object.keys(parameters.properties)).toEqual(['from', 'to']);
    expect(parameters.properties.from?.type).toBe('string');
    expect(parameters.properties.to).toEqual(tool('food_log').parameters.properties.to);
    for (const keyword of keywordsIn(parameters)) expect(PORTABLE_KEYWORDS.has(keyword)).toBe(true);
  });

  it('keeps the range limits: the last 7 days by default, at most 90', () => {
    expect([ACTIVITY_DEFAULT_DAYS, ACTIVITY_MAX_DAYS]).toEqual([7, 90]);
    expect(ACTIVITY_TOOL.parameters.properties.from?.description).toContain(
      'gives the 7 days ending on "to"',
    );
    expect(ACTIVITY_TOOL.description).toContain('At most 90 days');
    expect(ACTIVITY_TOOL.description).toContain('keeps its newest days');
    expect(ACTIVITY_TOOL.description).toContain('"omittedOlderDays"');
  });

  it('says what a row holds, in kcal and metres, and that resting burn is in the total', () => {
    const { description } = ACTIVITY_TOOL;
    for (const words of [
      'steps',
      'activeKcal (burned by moving, on top of resting burn)',
      "totalKcal (the whole day's burn, resting burn included)",
      'distanceM in metres',
      'workouts with their type, start, minutes and activeKcal',
    ]) {
      expect(description).toContain(words);
    }
  });

  it('says a missing value or day means no data, never 0', () => {
    const { description } = ACTIVITY_TOOL;
    expect(description).toContain('left out, never 0');
    expect(description).toContain('has no row: that means no data, not a day without moving');
  });
});

describe('REMINDER_TOOL: a reminder for the person to add (P13, D-16.93)', () => {
  it('is offered last, after activity when there is one, only when the turn takes proposals', () => {
    expect(coachTools(false)).toEqual(NUTRITION_TOOLS);
    expect(coachTools(false, true).map((schema) => schema.name)).toEqual([
      ...NUTRITION_TOOL_NAMES,
      'propose_reminder',
    ]);
    expect(coachTools(true, true).map((schema) => schema.name)).toEqual([
      ...NUTRITION_TOOL_NAMES,
      'activity_log',
      'propose_reminder',
    ]);
    expect(REMINDER_TOOL.name).toBe(REMINDER_TOOL_NAME);
    expect(isNutritionToolName(REMINDER_TOOL_NAME)).toBe(false);
    expect(isLaterToolName(REMINDER_TOOL_NAME)).toBe(false);
  });

  it('takes the words and a time, and days or a date, with portable keywords only', () => {
    const { parameters } = REMINDER_TOOL;
    expect(parameters.type).toBe('object');
    expect(Object.keys(parameters.properties)).toEqual(['text', 'time', 'days', 'date']);
    expect(parameters.required).toEqual(['text', 'time']);
    for (const property of Object.values(parameters.properties)) {
      expect(property.type).toBe('string');
    }
    for (const keyword of keywordsIn(parameters)) expect(PORTABLE_KEYWORDS.has(keyword)).toBe(true);
  });

  it('describes each field: 1 to 80 characters, HH:MM in 24 hours, weekday names or daily, YYYY-MM-DD', () => {
    const { text, time, days, date } = REMINDER_TOOL.parameters.properties;
    expect(text?.description).toContain('1 to 80 characters');
    expect(time?.description).toContain('24 hours, HH:MM');
    expect(days?.description).toContain('three-letter English names joined by commas');
    expect(days?.description).toContain('"daily" for every day');
    expect(days?.description).toContain('Leave it out for a one-time reminder');
    expect(date?.description).toContain('YYYY-MM-DD, today or later');
    expect(date?.description).toContain('Leave it out for a reminder that repeats');
  });

  it('says it only proposes: nothing is set until the person taps Add, and to ask rather than guess', () => {
    const { description } = REMINDER_TOOL;
    expect(description).toContain('It sets nothing by itself.');
    expect(description).toContain('it is set only when the person taps Add on that card');
    expect(description).toContain('when any of these is missing or unclear, ask them instead');
    expect(description).toContain(`At most ${MAX_PROPOSALS} per reply.`);
    expect(MAX_PROPOSALS).toBe(5);
  });
});
