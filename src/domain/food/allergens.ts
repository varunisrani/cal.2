// The allergen check (02 §3.14, D24): how strongly a food is tied to the sensitivities the person
// keeps in their profile. The evidence is read from the strongest kind down and the first kind
// that names a sensitivity decides: the product's declared allergens, then its "may contain"
// list, then (only "possible") the printed ingredient list, the names of the meal's parts and the
// food's own name. When nothing names one, the answer is that it cannot be assessed: the check
// never calls a food safe.
//
// Matching works on words: accents folded, lower case, a database's `xx:` language prefix
// dropped, anything that is not a letter or a digit a gap. A word matches the same word with or
// without a trailing "s". A sensitivity of several words needs every one of them. A few common
// sensitivities also stand for the words a label uses for them (the alias groups below).

import type { NutritionDraft } from '../model';
import { productLabel } from './labelText';

/** The rungs of the check, strongest first. */
export const ALLERGEN_VERDICTS = ['declared', 'mayContain', 'possible', 'unknown'] as const;
export type AllergenVerdict = (typeof ALLERGEN_VERDICTS)[number];

/** Where the matches were found. */
export type AllergenEvidence = 'allergens' | 'traces' | 'ingredients' | 'lines' | 'name';

export interface AllergenCheck {
  readonly verdict: AllergenVerdict;
  /** The sensitivities found, as the person typed them (trimmed), once each, in their order. */
  readonly matches: readonly string[];
  /** The one source the matches came from; absent when nothing matched. */
  readonly evidence?: AllergenEvidence;
}

/** What the check reads of a food. */
export type AllergenFood = Pick<NutritionDraft, 'name' | 'lines' | 'product'>;

const CANNOT_TELL: AllergenCheck = { verdict: 'unknown', matches: [] };

/** A database tag's language prefix ("en:milk"). */
const LANGUAGE_PREFIX = /^[a-z]{2}:/;
const COMBINING_MARKS = /\p{M}+/gu;
const NOT_A_WORD = /[^\p{L}\p{N}]+/u;

/** The words of `text`: accents folded, lower case, a leading `xx:` dropped, split at the rest. */
export function allergenWords(text: string): string[] {
  const folded = text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
  return folded
    .replace(LANGUAGE_PREFIX, '')
    .split(NOT_A_WORD)
    .filter((word) => word !== '');
}

/** The same word, with or without a trailing "s" on either side. */
function sameWord(a: string, b: string): boolean {
  return a === b || a + 's' === b || b + 's' === a;
}

/** The seven common tree nuts. */
const TREE_NUTS = ['walnut', 'pistachio', 'pecan', 'cashew', 'almond', 'macadamia', 'hazelnut'];

/**
 * Sensitivities that stand for more words than their own: typed as any of `names`, a food that
 * mentions any of `words` matches (02 §3.14).
 */
const ALIAS_GROUPS: readonly {
  readonly names: readonly string[];
  readonly words: readonly string[];
}[] = [
  { names: ['dairy', 'milk'], words: ['lactose', 'whey', 'casein', 'dairy', 'milk'] },
  { names: ['soy', 'soya'], words: ['soybean', 'soya', 'soy'] },
  { names: ['peanut', 'peanuts'], words: ['groundnut', 'peanut'] },
  { names: ['nuts', 'tree nut'], words: TREE_NUTS },
  { names: ['wheat'], words: ['gluten', 'wheat'] },
  { names: ['gluten'], words: ['rye', 'oat', 'barley', 'wheat', 'gluten'] },
];

/** One sensitivity, ready to match: its own words and the words its alias group adds. */
interface Sensitivity {
  readonly typed: string;
  readonly words: readonly string[];
  readonly aliases: readonly string[];
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, index) => sameWord(word, b[index] ?? ''));
}

function aliasesOf(words: readonly string[]): readonly string[] {
  const group = ALIAS_GROUPS.find((candidate) =>
    candidate.names.some((name) => sameWords(allergenWords(name), words)),
  );
  return group?.words ?? [];
}

/** The sensitivities that have words, as typed (trimmed). */
function prepare(sensitivities: readonly string[]): Sensitivity[] {
  return sensitivities.flatMap((typed) => {
    const words = allergenWords(typed);
    return words.length === 0 ? [] : [{ typed: typed.trim(), words, aliases: aliasesOf(words) }];
  });
}

/** True when `text` names the sensitivity: any alias word, or every one of its own words. */
function names(sensitivity: Sensitivity, textWords: readonly string[]): boolean {
  const has = (word: string): boolean => textWords.some((candidate) => sameWord(word, candidate));
  return sensitivity.aliases.some(has) || sensitivity.words.every(has);
}

/** The sensitivities any of `texts` names, as typed, once each. */
function found(prepared: readonly Sensitivity[], texts: readonly string[]): string[] {
  const textWords = texts.map(allergenWords);
  const matches = prepared
    .filter((sensitivity) => textWords.some((words) => names(sensitivity, words)))
    .map((sensitivity) => sensitivity.typed);
  return [...new Set(matches)];
}

/** Checks `food` against the person's sensitivities: the first rung with a match decides. */
export function checkAllergens(
  food: AllergenFood,
  sensitivities: readonly string[],
): AllergenCheck {
  const prepared = prepare(sensitivities);
  if (prepared.length === 0) return CANNOT_TELL;
  const product = food.product;
  const label = product ? productLabel(product) : undefined;
  const rungs: readonly [AllergenVerdict, AllergenEvidence, readonly string[]][] = [
    ['declared', 'allergens', product?.allergens ?? []],
    ['mayContain', 'traces', product?.traces ?? []],
    ['possible', 'ingredients', label === undefined ? [] : [label]],
    ['possible', 'lines', food.lines.map((line) => line.name)],
    ['possible', 'name', [food.name]],
  ];
  for (const [verdict, evidence, texts] of rungs) {
    const matches = found(prepared, texts);
    if (matches.length > 0) return { verdict, matches, evidence };
  }
  return CANNOT_TELL;
}

/** True when `text` names any of the sensitivities (the ingredient label's warning). */
export function mentionsSensitivity(text: string, sensitivities: readonly string[]): boolean {
  return found(prepare(sensitivities), [text]).length > 0;
}
