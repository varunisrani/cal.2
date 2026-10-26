/**
 * Our food reply contract (03 §3.5–3.6): the one JSON object every food request asks for. It is
 * spelled with the key constants the readers use (`parse/foodReply.ts`), so a prompt can never ask
 * for a key the parser does not read. The optional nutrients and the 8 sports compounds share the
 * `nutrients` object, which is where `readFoodReply` looks for both.
 */
import { EXTRA_KEYS } from '../../domain/model';
import { MAX_UNIT_CHOICES } from '../../domain/servings/units';
import {
  FOOD_REPLY_KEYS as FOOD,
  PART_REPLY_KEYS as PART,
  UNIT_REPLY_KEYS as UNIT,
} from '../parse/foodReply';
import { MAX_PARTS } from '../parse/parts';
import { bullets, jsonKey, lines, NUTRIENT_UNIT_LIST } from './shared';

/** The most parts a reply may list; the parts reader drops a longer list whole (R03.14). */
export { MAX_PARTS };

/** The most unit choices the units reader keeps; the first becomes the chosen one. */
export const MAX_UNITS = MAX_UNIT_CHOICES;

const UNIT_ITEM = `{${jsonKey(UNIT.unit)}: name, ${jsonKey(UNIT.count)}: how many, ${jsonKey(UNIT.gramsEach)}: grams in one}`;

/** The units list: complete objects only, counts with evidence, weights that add up (R03.16). */
export const UNIT_RULES = lines(
  `${jsonKey(FOOD.units)}: everyday units this amount can be counted in, best fit first, at most ${MAX_UNITS}. ` +
    `Each item is a complete object ${UNIT_ITEM}, never a bare word.`,
  bullets([
    `${UNIT.count} × ${UNIT.gramsEach} must come to ${FOOD.servingGrams}, give or take a few grams.`,
    'No gram units (g, gram, grams): grams are always offered anyway.',
    'Give a count only when it can be seen, the person stated it, or a single item makes it ' +
      'obvious. Never work a count out from the food name or the weight alone; leave out a ' +
      'unit whose count is a guess. An empty list [] is a complete answer.',
    'Pieces or slices for things that can be counted; ml, cup or fl oz for drinks; tbsp or tsp ' +
      'for spooned foods; can, packet, bar and similar only when the packaging is in view.',
    `For a whole food cut into pieces, count only the pieces in view and take ${UNIT.gramsEach} ` +
      'from the total weight.',
  ]),
);

const PART_ITEM =
  `{${jsonKey(PART.name)}, ${jsonKey(PART.grams)}, ${jsonKey(PART.kcal)}, ${jsonKey(PART.protein)}, ` +
  `${jsonKey(PART.carbs)}, ${jsonKey(PART.fat)}}`;

/** The parts list: each separate food once, adding up to the totals, or empty (R03.14). */
export const PART_RULES = lines(
  `${jsonKey(FOOD.parts)}: the clearly separate foods of the meal, each once, as ${PART_ITEM}, with ` +
    `${PART.grams} above 0. The parts must add up to about the totals.`,
  bullets([
    'An empty list [] when no breakdown can be trusted, for one simple food, or when the ' +
      'values come from a label.',
    'A screenshot of a menu, a recipe, a meal plan or another food app: one part per dish, ' +
      'with the values it shows.',
    `At most ${MAX_PARTS} parts: fold small extras into a nearby part. Never a total or ` +
      'subtotal row.',
  ]),
);

/** The whole reply contract: the object, its keys, the nutrient units and the list rules. */
export const FOOD_REPLY_CONTRACT = lines(
  'Reply with one JSON object and nothing else: no words before or after it, no code fence. ' +
    'Every number is a JSON number, never text. The keys:',
  bullets([
    `${jsonKey(FOOD.name)}: a short name for the food or meal.`,
    `${jsonKey(FOOD.emoji)}: one emoji for the food.`,
    `${jsonKey(FOOD.kcal)}: whole kilocalories for the whole amount analysed.`,
    `${jsonKey(FOOD.protein)}, ${jsonKey(FOOD.carbs)}, ${jsonKey(FOOD.fat)}: grams for the whole amount; ` +
      'decimals are welcome.',
    `${jsonKey(FOOD.servingGrams)}: the weight in grams of the whole amount analysed.`,
    `${jsonKey(FOOD.nutrients)}: an object with the optional amounts for the same amount, under the ` +
      'keys below and in their units. Use null for any you cannot judge.',
    `${jsonKey(FOOD.progressive)}: true or false, as this request says.`,
  ]),
  `Units inside ${jsonKey(FOOD.nutrients)}:`,
  NUTRIENT_UNIT_LIST,
  `The sports compounds ${EXTRA_KEYS.join(', ')} (arginine, carnitine and citrulline mean their ` +
    'L-forms) get a value only when a label prints it or the person names it; otherwise 0.',
  UNIT_RULES,
  PART_RULES,
);
