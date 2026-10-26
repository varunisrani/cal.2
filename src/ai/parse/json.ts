/**
 * Reading the JSON a model was asked for. Models wrap the object in a code fence, add a sentence
 * before or after it, or both, so every reply reader starts here (R03.13): keep the inside of a
 * fenced block, then take the first object whose braces balance, skipping braces inside strings.
 * Never a greedy first-to-last-brace match: that glues two objects, or an object and a brace in
 * the prose after it, into text that does not parse.
 */
import { err, ok, type Result } from '../../lib/result';
import type { SingleFailure } from '../errors';

const FENCE = '```';
const JSON_FENCE = /```json/i;

/**
 * The value in a model's reply: the inside of a fenced block when there is one (a `json` fence
 * first, else any fence), then the first balanced `{…}`; with no `{` at all, the whole text. Text
 * that does not parse, an object that never closes and an empty reply are invalid answers.
 */
export function parseModelJson(text: string): Result<unknown, SingleFailure> {
  const body = withoutFence(text.trim());
  const start = body.indexOf('{');
  const json = start < 0 ? body : firstObject(body, start);
  if (json === undefined || json === '') return invalid();
  try {
    return ok(JSON.parse(json) as unknown);
  } catch {
    return invalid();
  }
}

/** A plain object (not an array, not null) whose keys can be read. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Digits with an optional fraction and exponent: "250", "-1.5", ".5", "1e3". Not hex, not "12 g".
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * A finite number from a reply value: a JSON number, or a string holding only a decimal number
 * (`"250"`, `" 12.5 "`). Anything else is undefined: booleans, `""`, `"12 g"`, `"NaN"`, `"0x10"`,
 * and numbers too large to be finite.
 */
export function readNumber(value: unknown): number | undefined {
  let n: number | undefined;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && DECIMAL.test(value.trim())) n = Number(value.trim());
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}

/**
 * What is inside the first fenced block, from the end of its opening marker to the last closing
 * fence. A fence with no `{` inside while the text has one is ignored: a reply that ends with a
 * stray closing fence still holds its object before it.
 */
function withoutFence(text: string): string {
  const json = JSON_FENCE.exec(text);
  const open = json?.index ?? text.indexOf(FENCE);
  if (open < 0) return text;
  const after = text.slice(open + (json ? json[0].length : FENCE.length));
  const close = after.lastIndexOf(FENCE);
  const inside = (close < 0 ? after : after.slice(0, close)).trim();
  return inside.includes('{') || !text.includes('{') ? inside : text;
}

/**
 * The object that opens at `start`, up to the brace that closes it, or undefined when it never
 * closes. Quotes open and close strings; inside a string a backslash escapes the next character
 * and braces do not count.
 */
function firstObject(text: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

function invalid(): Result<never, SingleFailure> {
  return err({ kind: 'invalidResponse' });
}
