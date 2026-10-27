// The Coach's data tools as the model sees them (04 §3.9, R04.20): one JSON Schema per tool and a
// description in our own words saying what the tool returns and when it is worth a call. The
// three chat wires wrap these unchanged (OpenAI `parameters`, Anthropic `input_schema`, Gemini
// `functionDeclarations`), so the schemas use only the keywords all three accept: `type`,
// `description`, `properties` and `required`. The six nutrition tools are always offered; in the
// Android app, while Health Connect is connected, a seventh reads its activity copy (D-16.94); and
// where the app can keep reminders, `propose_reminder` puts one forward for the person to add
// (D-16.93): it sets nothing by itself. The later workout and suggestion tools are named here so
// a stray call can be told they are not available.

import { CUSTOM_TEXT_MAX } from '../../domain/reminders/custom';

/** The tools v1 offers, in the order the model sees them. */
export const NUTRITION_TOOL_NAMES = [
  'data_overview',
  'weight_log',
  'body_fat_log',
  'daily_energy_totals',
  'food_log',
  'fasting_log',
] as const;
export type NutritionToolName = (typeof NUTRITION_TOOL_NAMES)[number];

const NUTRITION_SET = new Set<string>(NUTRITION_TOOL_NAMES);

export function isNutritionToolName(value: unknown): value is NutritionToolName {
  return typeof value === 'string' && NUTRITION_SET.has(value);
}

/** The tool over Health Connect's activity copy (D-16.94): offered only while it is connected. */
export const ACTIVITY_TOOL_NAME = 'activity_log';
export type ActivityToolName = typeof ACTIVITY_TOOL_NAME;

/** The tool that proposes a reminder for the person to add (D-16.93). */
export const REMINDER_TOOL_NAME = 'propose_reminder';
export type ReminderToolName = typeof REMINDER_TOOL_NAME;

/** Any tool the Coach can offer. */
export type CoachToolName = NutritionToolName | ActivityToolName | ReminderToolName;

/** Workout and suggestion tools of a later phase (L3): never offered in v1. */
export const LATER_TOOL_NAMES = [
  'workout_log',
  'workout_plan_days',
  'training_profile',
  'training_rollup',
  'lift_log',
  'exercise_search',
  'suggest_new_exercise',
  'suggest_diary_exercise',
] as const;

const LATER_SET = new Set<string>(LATER_TOOL_NAMES);

export function isLaterToolName(value: unknown): boolean {
  return typeof value === 'string' && LATER_SET.has(value);
}

/** A range tool's row limit: what a call without `limit` gets, and the most a call can ask for. */
export interface RowLimit {
  readonly fallback: number;
  readonly max: number;
}

/** Row limits of the tools that take `limit`. A limit keeps the newest rows (D-16.32). */
export const ROW_LIMITS = {
  weight_log: { fallback: 365, max: 365 },
  body_fat_log: { fallback: 365, max: 365 },
  food_log: { fallback: 200, max: 365 },
  fasting_log: { fallback: 200, max: 365 },
} as const satisfies Readonly<Record<string, RowLimit>>;

/** Days before `to` that a range without a readable `from` starts. */
export const DEFAULT_SPAN_DAYS = 30;

/** The most days one `activity_log` call covers; a longer range keeps its newest days. */
export const ACTIVITY_MAX_DAYS = 90;

/** The days, `to` included, an `activity_log` range without a readable `from` covers. */
export const ACTIVITY_DEFAULT_DAYS = 7;

/** The most reminders one reply can propose; more are refused with a reason. */
export const MAX_PROPOSALS = 5;

export interface SchemaProperty {
  readonly type: 'string' | 'integer';
  readonly description: string;
}

/** The JSON Schema of a tool's arguments: always an object. */
export interface ToolParameters {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, SchemaProperty>>;
  readonly required?: readonly string[];
}

/** One tool as the chat wires send it. */
export interface ToolSchema {
  readonly name: CoachToolName;
  readonly description: string;
  readonly parameters: ToolParameters;
}

const FROM: SchemaProperty = {
  type: 'string',
  description:
    `First day of the range, YYYY-MM-DD, a local day, included. A day that cannot be read ` +
    `becomes ${DEFAULT_SPAN_DAYS} days before "to".`,
};

const TO: SchemaProperty = {
  type: 'string',
  description:
    'Last day of the range, YYYY-MM-DD, a local day, included. A day that cannot be read ' +
    'becomes today.',
};

function limitProperty({ fallback, max }: RowLimit): SchemaProperty {
  return {
    type: 'integer',
    description: `Most rows to return, 1 to ${max}; the newest rows are kept. Leave it out for ${fallback}.`,
  };
}

function rangeParameters(limit?: RowLimit): ToolParameters {
  return {
    type: 'object',
    properties:
      limit === undefined
        ? { from: FROM, to: TO }
        : { from: FROM, to: TO, limit: limitProperty(limit) },
    required: ['from', 'to'],
  };
}

const RANGE_RESULT =
  'Every result repeats the range it used. When the limit leaves rows out, the oldest go and ' +
  '"omittedOlder" says how many.';

/** The six tools v1 offers, in `NUTRITION_TOOL_NAMES` order. */
export const NUTRITION_TOOLS: readonly ToolSchema[] = [
  {
    name: 'data_overview',
    description:
      'How much data the person has. For weigh-ins, body-fat readings and food entries: the ' +
      'count and the first and last day. For fasts: the count and whether one is running now. ' +
      'Call it to learn how far back the data goes before asking for a long range.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'weight_log',
    description:
      'Weigh-ins from one local day to another, oldest first: the day and the weight in kg. ' +
      `At most ${ROW_LIMITS.weight_log.max} rows. ${RANGE_RESULT}`,
    parameters: rangeParameters(ROW_LIMITS.weight_log),
  },
  {
    name: 'body_fat_log',
    description:
      'Body-fat readings from one local day to another, oldest first: the day and the body ' +
      `fat in percent. At most ${ROW_LIMITS.body_fat_log.max} rows. ${RANGE_RESULT}`,
    parameters: rangeParameters(ROW_LIMITS.body_fat_log),
  },
  {
    name: 'daily_energy_totals',
    description:
      'The kcal eaten on each day from one local day to another: one row for every day that ' +
      'has food entries. A day without entries has no row. It means nothing was logged that ' +
      'day: never read it as 0 kcal or as a fast.',
    parameters: rangeParameters(),
  },
  {
    name: 'food_log',
    description:
      'Single food entries from one local day to another, oldest first: the day, name, kcal, ' +
      'protein, carbs and fat in grams, the meal, how it was logged, its weight when known and ' +
      'every nutrient on record, with the unit at the end of the key (sodiumMg, vitaminDMcg). ' +
      'Use it for what was eaten on a day or for macro and nutrient detail. ' +
      `At most ${ROW_LIMITS.food_log.max} rows. ${RANGE_RESULT}`,
    parameters: rangeParameters(ROW_LIMITS.food_log),
  },
  {
    name: 'fasting_log',
    description:
      'Fasts the person tracked with the fasting timer that touch the range, oldest first: ' +
      'start and end time, minutes fasted, the goal in minutes and whether it was reached; a ' +
      'running fast is measured up to now. These tracked fasts are the only fasting facts: a ' +
      'day without food entries is not a fast. ' +
      `At most ${ROW_LIMITS.fasting_log.max} rows. ${RANGE_RESULT}`,
    parameters: rangeParameters(ROW_LIMITS.fasting_log),
  },
];

/** The activity tool (D-16.94): Health Connect's figures, day by day. */
export const ACTIVITY_TOOL: ToolSchema = {
  name: ACTIVITY_TOOL_NAME,
  description:
    'What Health Connect recorded on their phone, day by day from one local day to another, ' +
    'oldest first: steps, activeKcal (burned by moving, on top of resting burn), totalKcal (the ' +
    "whole day's burn, resting burn included), distanceM in metres, and the day's workouts with " +
    'their type, start, minutes and activeKcal. Today is the day so far. A value Health Connect ' +
    'did not have is left out, never 0, and a day it had nothing for has no row: that means no ' +
    `data, not a day without moving. At most ${ACTIVITY_MAX_DAYS} days: a longer range keeps ` +
    'its newest days and "omittedOlderDays" says how many older days it left out. Every result ' +
    'repeats the range it used.',
  parameters: {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description:
          'First day of the range, YYYY-MM-DD, a local day, included. A day that cannot be read ' +
          `gives the ${ACTIVITY_DEFAULT_DAYS} days ending on "to".`,
      },
      to: TO,
    },
    required: ['from', 'to'],
  },
};

/** The reminder tool (D-16.93): a proposal the person adds, or not, from a card in the chat. */
export const REMINDER_TOOL: ToolSchema = {
  name: REMINDER_TOOL_NAME,
  description:
    'Puts forward a reminder the person asked for: a notification at a local time of day, ' +
    'repeating on some weekdays or coming once on one date. It sets nothing by itself. The app ' +
    'shows it as a card under your reply, and it is set only when the person taps Add on that ' +
    'card. Call it only when they asked to be reminded and you know what it should say, the ' +
    'time, and the days or the date; when any of these is missing or unclear, ask them instead. ' +
    'The result says that it is waiting for the person, or what is wrong with it so you can ask ' +
    `again. At most ${MAX_PROPOSALS} per reply.`,
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description:
          'What the notification says, short and in the language of the conversation, 1 to ' +
          `${CUSTOM_TEXT_MAX} characters.`,
      },
      time: {
        type: 'string',
        description: 'The local time of day in 24 hours, HH:MM, such as 07:30 or 18:00.',
      },
      days: {
        type: 'string',
        description:
          'For a reminder that repeats: the weekdays as three-letter English names joined by ' +
          'commas (mon,wed,fri), or "daily" for every day. Leave it out for a one-time reminder.',
      },
      date: {
        type: 'string',
        description:
          'For a one-time reminder: the local day, YYYY-MM-DD, today or later. Leave it out for ' +
          'a reminder that repeats.',
      },
    },
    required: ['text', 'time'],
  },
};

/**
 * The tools one turn offers, in the order the model sees them: activity after the six when Health
 * Connect is connected, the reminder tool last when the turn can take proposals.
 */
export function coachTools(activity: boolean, reminders = false): readonly ToolSchema[] {
  const tools = activity ? [...NUTRITION_TOOLS, ACTIVITY_TOOL] : NUTRITION_TOOLS;
  return reminders ? [...tools, REMINDER_TOOL] : tools;
}
