// The printed ingredient list as the product block shows it (02 §3.13, v1-lite D23): one
// paragraph whose allergens are bold. Open Food Facts gives the list twice: as plain text, which
// often carries no allergen marks, and as marked-up text whose allergens sit in
// `<span class="allergen">` tags. At lookup the tags become underscore markers (`_milk_`) on the
// plain words; when the marked-up text does not say the same words, the plain text is kept. The
// review then splits the markers into bold and plain pieces. Display only: nothing here makes
// nutrition lines.

import type { ProductInfo } from '../model';

/** One allergen span of the marked-up text and what it wraps. */
const ALLERGEN_SPAN = /<span\s+class\s*=\s*["']allergen["']\s*>([\s\S]*?)<\/span\s*>/gi;

/** Any other opening or closing span tag. */
const SPAN_TAG = /<\/?span\b[^>]*>/gi;

/** An HTML entity: a few named ones, or a decimal or hex character code. */
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Characters that stay outside a marker when a span wraps them: white space and the list
 * punctuation of the label languages (Latin, full-width, ideographic and Arabic commas, colons,
 * semicolons and stops).
 */
const MARKER_EDGE = /[\s:;,.：；，、。،؛]/u;

const MARKER = '_';

/** The highest Unicode code point. */
const MAX_CODE_POINT = 0x10ffff;

/** `text` with its entities decoded; an entity naming no character is left as it is. */
export function decodeEntities(text: string): string {
  return text.replace(
    ENTITY,
    (whole, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) return NAMED_ENTITIES[name] ?? whole;
      const code = decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? '', 16);
      const surrogate = code >= 0xd800 && code <= 0xdfff;
      return code <= MAX_CODE_POINT && !surrogate ? String.fromCodePoint(code) : whole;
    },
  );
}

/** The span's inner text as a marker: edge spaces and punctuation stay outside it. */
function markerFor(inner: string): string {
  const chars = [...inner.replace(SPAN_TAG, '').replaceAll(MARKER, '')];
  let start = 0;
  while (start < chars.length && MARKER_EDGE.test(chars[start] ?? '')) start++;
  let end = chars.length;
  while (end > start && MARKER_EDGE.test(chars[end - 1] ?? '')) end--;
  const word = chars.slice(start, end).join('');
  if (word === '') return chars.join('');
  return `${chars.slice(0, start).join('')}${MARKER}${word}${MARKER}${chars.slice(end).join('')}`;
}

/** The words of a label, for comparing: entities decoded, markers gone, white space single. */
function wordsForComparing(text: string): string {
  return decodeEntities(text).replaceAll(MARKER, '').replace(/\s+/g, ' ').trim();
}

/**
 * The ingredient list with Open Food Facts' allergens marked (`_milk_`): the allergen spans of
 * `markup` become markers, other span tags go, entities are decoded. The plain text (trimmed) is
 * the answer instead when there is no markup, when it leaves nothing, or when its words are not
 * the plain text's words (markers, entities and white space aside). Undefined when there is
 * neither.
 */
export function markAllergens(
  plain: string | undefined,
  markup: string | undefined,
): string | undefined {
  const fallback = plain?.trim() || undefined;
  if (markup === undefined || markup.trim() === '') return fallback;
  const marked = decodeEntities(
    markup.replace(ALLERGEN_SPAN, (_span, inner: string) => markerFor(inner)).replace(SPAN_TAG, ''),
  ).trim();
  if (marked === '') return fallback;
  if (fallback !== undefined && wordsForComparing(marked) !== wordsForComparing(fallback)) {
    return fallback;
  }
  return marked;
}

/** A run of label text, bold when it is an allergen. */
export interface LabelPiece {
  readonly text: string;
  readonly allergen: boolean;
}

/** A pair of markers and what they wrap. */
const MARKED = /_([^_]*)_/g;

/**
 * The label split at its markers: what a pair wraps is an allergen piece, unless it is only white
 * space; the rest is plain, with any unpaired underscore dropped. Neighbouring plain runs join.
 */
export function labelPieces(text: string): LabelPiece[] {
  const pieces: LabelPiece[] = [];
  const addPlain = (run: string): void => {
    if (run === '') return;
    const last = pieces.at(-1);
    if (last && !last.allergen)
      pieces[pieces.length - 1] = { text: last.text + run, allergen: false };
    else pieces.push({ text: run, allergen: false });
  };
  let from = 0;
  for (const match of text.matchAll(MARKED)) {
    const inner = match[1] ?? '';
    addPlain(text.slice(from, match.index));
    if (inner.trim() === '') addPlain(inner);
    else pieces.push({ text: inner, allergen: true });
    from = match.index + match[0].length;
  }
  addPlain(text.slice(from).replaceAll(MARKER, ''));
  return pieces;
}

/** The label's words without markers. */
export function labelWords(text: string): string {
  return labelPieces(text)
    .map((piece) => piece.text)
    .join('');
}

/** The ingredient list a product block shows: the marked one, else the plain one; none if blank. */
export function productLabel(
  product: Pick<ProductInfo, 'ingredients' | 'markedIngredients'>,
): string | undefined {
  return (product.markedIngredients ?? product.ingredients)?.trim() || undefined;
}
