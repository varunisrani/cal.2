// The Coach's data tools as the model sees them (04 §3.9, R04.20): one JSON Schema per tool and a
// description in our own words saying what the tool returns and when it is worth a call. The
// three chat wires wrap these unchanged (OpenAI `parameters`, Anthropic `input_schema`, Gemini
// `functionDeclarations`), so the schemas use only the keywords all three accept: `type`,
// `description`, `properties` and `required`. Version 1 offers the six nutrition tools only; the
// later workout and suggestion tools are named here so a stray call can be told they are not
// available.

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
  readonly name: NutritionToolName;
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
      'Weigh-ins from one local day to another, oldest first: the day and the weight in kg ' +
      `and in lb. At most ${ROW_LIMITS.weight_log.max} rows. ${RANGE_RESULT}`,
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
