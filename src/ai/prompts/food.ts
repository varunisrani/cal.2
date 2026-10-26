/**
 * The food analysis requests (03 §3.5, §3.7): photos of one meal, a typed description, a label
 * scan and the unit repair. Every one asks for our reply contract (`contract.ts`). The person's
 * notes for the AI are not here: the client adds them to the system part of every request
 * (D-16.24), so these texts stay fixed. Food answers are JSON in kcal and never speak to the
 * person, so they carry no kJ line.
 */
import { FOOD_REPLY_KEYS as FOOD, UNIT_REPLY_KEYS as UNIT } from '../parse/foodReply';
import { FOOD_REPLY_CONTRACT, UNIT_RULES } from './contract';
import {
  bullets,
  jsonKey,
  lines,
  num,
  paragraphs,
  quoted,
  textOrNone,
  type PromptText,
} from './shared';

const FOOD_SYSTEM =
  'You estimate the energy and nutrients of food for a personal food diary. You answer with ' +
  'the one JSON object the request describes and nothing around it.';

export interface PhotoMealInput {
  /** How many photos go with the request, in the order they were taken. */
  readonly photoCount: number;
  /** The person's note about the photos. */
  readonly note?: string;
  /** The person says the photos show one plate built up in steps. */
  readonly progressive?: boolean;
}

/** True when the step-by-step rules apply: asked for, and at least two photos to compare. */
export function usesProgressive(
  input: Pick<PhotoMealInput, 'photoCount' | 'progressive'>,
): boolean {
  return input.progressive === true && input.photoCount >= 2;
}

function progressiveLine(on: boolean): string {
  return `Set ${jsonKey(FOOD.progressive)} to ${on ? 'true' : 'false'}.`;
}

function noteParagraph(note: string | undefined, about: string): string | undefined {
  const text = textOrNone(note);
  if (text === undefined) return undefined;
  return lines(
    `The person added a note about ${about}. Use it to tell what the foods are, how much there ` +
      'is and how it was made:',
    quoted(text),
  );
}

/** What the photos are and how to read them: several views of one meal, or a plate in steps. */
function photoTask(input: PhotoMealInput): string {
  const many = input.photoCount >= 2;
  const opening = many
    ? `These ${input.photoCount} photos, in the order they were taken, show one meal to log. ` +
      'A photo may be another angle, another part of the meal, a scale display, a wrapper or a ' +
      'printed nutrition label.'
    : 'The photo shows one meal to log. It may include a scale display, a wrapper or a printed ' +
      'nutrition label.';
  const views = many
    ? [
        'Take the photos as views of the same food unless the foods are plainly different, and ' +
          'count each food once however many photos show it.',
        'Foods that are clearly separate add up to one meal total.',
      ]
    : [];
  const always = [
    'Where a scale display or a label can be read, use its figures rather than judging by eye.',
    'Estimate the amount actually shown. A whole or nearly whole cake, pizza, pie or loaf counts ' +
      'as the whole item, not as one slice.',
  ];
  if (!usesProgressive(input)) return lines(opening, bullets([...views, ...always]));
  return lines(
    opening,
    'The person says these photos show one plate built up in steps: each later photo adds one ' +
      'or more foods to what was there before.',
    bullets([
      'Report each food once, and give every newly added food its own part.',
      'If the plate stands on a scale with the same plate and tare throughout and the readings ' +
        'can be trusted, the first food weighs the first reading and each later food weighs the ' +
        'difference from the reading before it.',
      'After a tare or reset that can be seen, take that reading as it stands.',
      'Never subtract readings that cannot be read, do not belong together or go down; judge ' +
        'those foods from what changed in the picture and from the note.',
      `${FOOD.servingGrams} should match the last reliable reading, and the parts should add up ` +
        'to the totals.',
      ...always,
    ]),
  );
}

/** Photos of one meal (the main path, also for a single photo). */
export function photoMealPrompt(input: PhotoMealInput): PromptText {
  return {
    system: FOOD_SYSTEM,
    prompt: paragraphs(
      photoTask(input),
      noteParagraph(input.note, 'these photos'),
      progressiveLine(usesProgressive(input)),
      FOOD_REPLY_CONTRACT,
    ),
  };
}

export interface LabelScanInput {
  readonly photoCount: number;
  readonly note?: string;
}

/**
 * "Scan label" after a barcode miss (Proposed D-16.62): the photo request with one hint that a
 * nutrition label is in view. The caller stores the result with source label.
 */
export function labelScanPrompt(input: LabelScanInput): PromptText {
  const subject = input.photoCount >= 2 ? 'These photos are' : 'This photo is';
  const hint =
    `${subject} of a packaged food and its printed nutrition label. Read the printed values and ` +
    `report one serving as the label defines it, with ${FOOD.servingGrams} the printed serving ` +
    `size. For units, offer "serving" (${UNIT.count} 1, ${UNIT.gramsEach} the serving size) and ` +
    'only units the label itself prints, such as 1 bar or 2 biscuits. Leave ' +
    `${jsonKey(FOOD.parts)} empty.`;
  return {
    system: FOOD_SYSTEM,
    prompt: paragraphs(
      photoTask({ photoCount: input.photoCount }),
      hint,
      noteParagraph(input.note, 'these photos'),
      progressiveLine(false),
      FOOD_REPLY_CONTRACT,
    ),
  };
}

export interface TextMealInput {
  /** What the person typed. */
  readonly description: string;
}

/** A meal described in words: quantities, brands and several items, with one fitting emoji. */
export function textMealPrompt(input: TextMealInput): PromptText {
  return {
    system: FOOD_SYSTEM,
    prompt: paragraphs(
      lines(
        'The person described what they ate in their own words. Estimate the food described.',
        bullets([
          'Read the amounts, brands and every item mentioned; when you know the published values ' +
            'of a brand, use them.',
          'Add the items up into one total for the whole description.',
          `For ${jsonKey(FOOD.emoji)}, pick one emoji that fits this particular food; use a ` +
            'plain plate of food only when nothing closer fits.',
          'Give a unit count only for an amount the person stated.',
        ]),
      ),
      lines('Their description:', quoted(input.description)),
      progressiveLine(false),
      FOOD_REPLY_CONTRACT,
    ),
  };
}

export interface UnitRepairInput {
  /** The food's name from the first answer. */
  readonly name: string;
  /** The known total weight in grams. */
  readonly grams: number;
  readonly note?: string;
  /** The first photo goes with the request. */
  readonly withPhoto: boolean;
}

/**
 * The second request when the first answer had no usable units list (R03.17): only that list,
 * for the named food and its weight, under the same unit rules.
 */
export function unitRepairPrompt(input: UnitRepairInput): PromptText {
  return {
    system: FOOD_SYSTEM,
    prompt: paragraphs(
      lines(
        `An earlier answer about this food had no usable ${jsonKey(FOOD.units)} list. Give ` +
          'only that list now.',
        `Food: ${quoted(input.name)}`,
        `Total weight (${FOOD.servingGrams}): ${num(input.grams)} g`,
        input.withPhoto && 'The photo of the food is attached again.',
      ),
      noteParagraph(input.note, 'this food'),
      lines(
        `Reply with one JSON object holding only the key ${jsonKey(FOOD.units)}, and nothing ` +
          'around it.',
        UNIT_RULES,
        bullets([
          'Never assume the whole amount is a single unit.',
          `Every ${UNIT.count} and ${UNIT.gramsEach} is a JSON number above 0.`,
          'Scoop or bowl, like can, packet or bar, only when one can be seen.',
        ]),
      ),
    ),
  };
}
