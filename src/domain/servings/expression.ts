// The serving amount field doubles as a small calculator: "50+20×2" is 90. Multiplication and
// division bind tighter than addition and subtraction, a number may carry any run of + and −
// signs in front of it, decimals take a dot or the locale's decimal mark, and spaces between
// tokens are ignored. There are no parentheses. Anything that does not read cleanly gives null,
// so a half-typed or broken expression is never stored as 0 or infinity (R02.22).

import { numberMarks } from '../units/numbers';

/** The calculator keys. Typed text may also use the ASCII forms - * /. */
export const AMOUNT_OPERATORS = ['+', '−', '×', '÷'] as const;
export type AmountOperator = (typeof AMOUNT_OPERATORS)[number];

type Op = '+' | '-' | '*' | '/';

// Every spelling of an operator, mapped to the one the evaluator uses.
const OPERATOR_SPELLINGS: ReadonlyMap<string, Op> = new Map<string, Op>([
  ['+', '+'],
  ['-', '-'],
  ['−', '-'],
  ['*', '*'],
  ['×', '*'],
  ['/', '/'],
  ['÷', '/'],
]);

type Token = { kind: 'number'; value: number } | { kind: 'op'; op: Op };

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/** Splits text into numbers and operators, or null on any character that is neither. */
function tokenize(text: string, decimalMarks: ReadonlySet<string>): Token[] | null {
  const tokens: Token[] = [];
  const chars = Array.from(text);
  let at = 0;
  while (at < chars.length) {
    const char = chars[at] ?? '';
    const op = OPERATOR_SPELLINGS.get(char);
    if (/\s/.test(char)) {
      at += 1;
    } else if (op !== undefined) {
      tokens.push({ kind: 'op', op });
      at += 1;
    } else if (isDigit(char) || decimalMarks.has(char)) {
      // Digits with at most one decimal mark; a second mark starts a new (adjacent) number.
      let literal = '';
      let markSeen = false;
      let digitSeen = false;
      for (; at < chars.length; at += 1) {
        const next = chars[at] ?? '';
        if (isDigit(next)) {
          literal += next;
          digitSeen = true;
        } else if (decimalMarks.has(next) && !markSeen) {
          literal += '.';
          markSeen = true;
        } else {
          break;
        }
      }
      if (!digitSeen) return null;
      tokens.push({ kind: 'number', value: Number(literal) });
    } else {
      return null;
    }
  }
  return tokens;
}

/**
 * The value of an amount expression typed in `locale`, or null when the text is empty, ends in an
 * operator, holds letters or other characters, divides by a number whose magnitude is at most
 * `Number.EPSILON`, or gives a non-finite result.
 */
export function evalAmount(text: string, locale: string): number | null {
  const marks = new Set(['.', numberMarks(locale).decimal]);
  const tokens = tokenize(text, marks);
  if (tokens === null || tokens.length === 0) return null;

  let at = 0;
  // One operand: any run of unary signs, then a number.
  const operand = (): number | null => {
    let sign = 1;
    for (let token = tokens[at]; token?.kind === 'op'; token = tokens[at]) {
      if (token.op === '*' || token.op === '/') return null;
      if (token.op === '-') sign = -sign;
      at += 1;
    }
    const token = tokens[at];
    if (token?.kind !== 'number') return null;
    at += 1;
    return sign * token.value;
  };

  // Sum of finished terms, the sign the current term enters it with, and the current term.
  let sum = 0;
  let termSign = 1;
  let term = operand();
  while (term !== null && at < tokens.length) {
    const token = tokens[at];
    if (token?.kind !== 'op') return null;
    at += 1;
    if (token.op === '*' || token.op === '/') {
      const factor = operand();
      if (factor === null) return null;
      if (token.op === '/' && Math.abs(factor) <= Number.EPSILON) return null;
      term = token.op === '*' ? term * factor : term / factor;
    } else {
      sum += termSign * term;
      termSign = token.op === '-' ? -1 : 1;
      term = operand();
    }
  }
  if (term === null) return null;
  const result = sum + termSign * term;
  return Number.isFinite(result) ? result : null;
}

function isOperatorChar(char: string): boolean {
  return OPERATOR_SPELLINGS.has(char);
}

/**
 * The text after a calculator operator key: the operator replaces one already at the end (so
 * "50+" then × gives "50×") and is appended otherwise. Empty text stays as it is.
 */
export function pushOperator(text: string, op: AmountOperator): string {
  const trimmed = text.trim();
  if (trimmed === '') return text;
  const chars = Array.from(trimmed);
  const last = chars[chars.length - 1] ?? '';
  const kept = isOperatorChar(last) ? chars.slice(0, -1).join('') : trimmed;
  return `${kept}${op}`;
}

/**
 * True once the text holds an operation, i.e. an operator after its first character: drives the
 * "= result" preview. A leading sign alone ("-5") is not an operation.
 */
export function hasOperation(text: string): boolean {
  return Array.from(text.trimStart()).some((char, index) => index > 0 && isOperatorChar(char));
}
