/**
 * The object a model returns for a food analysis, read into the draft the review sheet shows.
 * The answer must name the food and give kcal, protein, carbs and fat; anything less is an
 * unusable answer, so the client tries the standby instead of showing a meal of zeros (D-16.22,
 * D-16.58). Unit choices and parts come from the same object but are read by `units.ts` and
 * `parts.ts`; this reader leaves them empty.
 */
import {
  EXTRA_KEYS,
  NUTRIENT_KEYS,
  type NutritionDraft,
  type ServingBasis,
} from '../../domain/model';
import { err, ok, type Result } from '../../lib/result';
import type { SingleFailure } from '../errors';
import { isRecord, readNumber } from './json';

/**
 * The keys of our food reply contract. The prompts (`prompts/contract.ts`) ask for exactly these
 * and the readers look for exactly these. `nutrients` holds the optional nutrients under the
 * `NutrientKey` names and the sports compounds under the `ExtraKey` names of the domain model.
 */
export const FOOD_REPLY_KEYS = {
  name: 'name',
  kcal: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  servingGrams: 'servingGrams',
  emoji: 'emoji',
  nutrients: 'nutrients',
  units: 'units',
  parts: 'parts',
  progressive: 'progressive',
} as const;

/** The keys of one element of the reply's `units` list. */
export const UNIT_REPLY_KEYS = { unit: 'unit', count: 'count', gramsEach: 'gramsEach' } as const;

/** The keys of one element of the reply's `parts` list. */
export const PART_REPLY_KEYS = {
  name: 'name',
  grams: 'grams',
  kcal: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
} as const;

/** What the request was sent with, kept on the draft. */
export interface FoodReplyContext {
  /** The person's note for the model. */
  readonly note?: string;
  /** The photos show one plate built up in steps; when left out, the reply's own flag is used. */
  readonly progressive?: boolean;
}

const K = FOOD_REPLY_KEYS;

/**
 * The draft for a food reply already cut out of the model's text (`parseModelJson`). kcal is
 * rounded, macros keep their decimals. A missing or non-positive serving weight leaves the weight
 * unknown: the draft describes one serving, never an invented 100 g, so the unit repair never
 * runs on it (R03.15). Optional values that are not finite and at least 0 are dropped (unknown).
 */
export function readFoodReply(
  reply: unknown,
  context: FoodReplyContext = {},
): Result<NutritionDraft, SingleFailure> {
  if (!isRecord(reply)) return invalid();
  const name = textOf(reply[K.name]);
  const kcal = required(reply[K.kcal]);
  const protein = required(reply[K.protein]);
  const carbs = required(reply[K.carbs]);
  const fat = required(reply[K.fat]);
  if (
    name === undefined ||
    kcal === undefined ||
    protein === undefined ||
    carbs === undefined ||
    fat === undefined
  ) {
    return invalid();
  }

  const optional = reply[K.nutrients];
  const listed = isRecord(optional) ? optional : {};
  const draft: NutritionDraft = {
    name,
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    nutrients: amounts(listed, NUTRIENT_KEYS),
    extras: amounts(listed, EXTRA_KEYS),
    basis: basisFor(readNumber(reply[K.servingGrams])),
    units: [],
    lines: [],
    progressive: context.progressive ?? reply[K.progressive] === true,
  };
  const emoji = textOf(reply[K.emoji]);
  if (emoji !== undefined) draft.emoji = emoji;
  const note = textOf(context.note);
  if (note !== undefined) draft.note = note;
  return ok(draft);
}

/** A required amount: present, finite and not negative (a negative kcal or macro is no food). */
function required(value: unknown): number | undefined {
  const n = readNumber(value);
  return n !== undefined && n >= 0 ? n + 0 : undefined; // + 0 turns -0 into 0
}

/** A known weight only for finite grams above 0; anything else is one serving of unknown weight. */
function basisFor(grams: number | undefined): ServingBasis {
  return grams !== undefined && grams > 0
    ? { kind: 'grams', grams }
    : { kind: 'servings', count: 1 };
}

/** The listed values for `keys` that are finite and at least 0; the rest stay unknown. */
function amounts<Key extends string>(
  listed: Readonly<Record<string, unknown>>,
  keys: readonly Key[],
): Partial<Record<Key, number>> {
  const values: Partial<Record<Key, number>> = {};
  for (const key of keys) {
    const n = Object.hasOwn(listed, key) ? readNumber(listed[key]) : undefined;
    if (n !== undefined && n >= 0) values[key] = n + 0; // + 0 turns -0 into 0
  }
  return values;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function invalid(): Result<never, SingleFailure> {
  return err({ kind: 'invalidResponse' });
}
