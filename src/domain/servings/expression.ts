// Amount expressions: the serving amount field accepts a little arithmetic ("50+20", "300÷3").
//
// Reading happens in two steps. The text, with every space removed, is cut into numbers and
// operators; then one left-to-right pass multiplies and divides inside the current term and
// closes the term at each + or −, so × and ÷ bind tighter. Signs where a number is expected are
// unary. There are no parentheses. Anything incomplete or unsafe has no value (null), so the
// field can revert instead of saving 0 or infinity.

import { numberMarks } from '../units/numbers';

/** The operator keys of the calculator row, in the symbols they show. */
export const AMOUNT_OPERATORS = ['+', '−', '×', '÷'] as const;
export type AmountOperator = (typeof AMOUNT_OPERATORS)[number];

type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

/** Every character read as an operator: the shown symbols and their ASCII forms. */
const OPERATIONS = new Map<string, Operation>([
  ['+', 'add'],
  ['-', 'subtract'],
  ['−', 'subtract'],
  ['*', 'multiply'],
  ['×', 'multiply'],
  ['/', 'divide'],
  ['÷', 'divide'],
]);

type Token = { kind: 'number'; value: number } | { kind: 'operator'; operation: Operation };

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

/** Cuts the text into tokens, or null at the first character that is neither. */
function tokenize(text: string, decimalMarks: ReadonlySet<string>): Token[] | null {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const operation = OPERATIONS.get(text.charAt(at));
    if (operation) {
      tokens.push({ kind: 'operator', operation });
      at += 1;
      continue;
    }
    // A number: digits with at most one decimal mark, read as a plain dot number.
    let plain = '';
    let hasDigit = false;
    let hasMark = false;
    for (; at < text.length; at += 1) {
      const char = text.charAt(at);
      if (isDigit(char)) {
        plain += char;
        hasDigit = true;
      } else if (!hasMark && decimalMarks.has(char)) {
        plain += '.';
        hasMark = true;
      } else {
        break;
      }
    }
    if (!hasDigit) return null;
    tokens.push({ kind: 'number', value: Number(plain) });
  }
  return tokens;
}

/** Folds the tokens into a value, or null when they do not form a complete expression. */
function evaluate(tokens: readonly Token[]): number | null {
  let at = 0;

  // A number with any unary signs in front of it.
  const readOperand = (): number | null => {
    let sign = 1;
    for (let token = tokens[at]; token !== undefined; token = tokens[at]) {
      at += 1;
      if (token.kind === 'number') return sign * token.value;
      if (token.operation === 'subtract') sign = -sign;
      else if (token.operation !== 'add') return null;
    }
    return null;
  };

  const closedTerms: number[] = [];
  let term = readOperand();
  if (term === null) return null;
  while (at < tokens.length) {
    const token = tokens[at];
    at += 1;
    if (token === undefined || token.kind !== 'operator') return null;
    const operand = readOperand();
    if (operand === null) return null;
    if (token.operation === 'multiply') {
      term *= operand;
    } else if (token.operation === 'divide') {
      if (Math.abs(operand) <= Number.EPSILON) return null;
      term /= operand;
    } else {
      closedTerms.push(term);
      term = token.operation === 'add' ? operand : -operand;
    }
  }
  const total = closedTerms.reduce((sum, value) => sum + value, term);
  // Adding 0 turns a -0 result into 0.
  return Number.isFinite(total) ? total + 0 : null;
}

/**
 * The value of an amount expression, or null when it has none: empty text, a trailing operator,
 * letters or other characters, a divisor within machine epsilon of zero, or a result that is not
 * finite. A decimal may use a dot or the locale's decimal mark; spaces are ignored.
 */
export function evalAmount(text: string, locale: string): number | null {
  const marks = new Set(['.', numberMarks(locale).decimal]);
  const tokens = tokenize(text.replace(/\s+/gu, ''), marks);
  if (tokens === null || tokens.length === 0) return null;
  return evaluate(tokens);
}

/**
 * The text after an operator key: the operator replaces a trailing one instead of stacking a
 * second, and an empty field stays empty.
 */
export function pushOperator(text: string, operator: AmountOperator): string {
  const trimmed = text.trim();
  if (trimmed === '') return text;
  const endsWithOperator = OPERATIONS.has(trimmed.charAt(trimmed.length - 1));
  return `${endsWithOperator ? trimmed.slice(0, -1) : trimmed}${operator}`;
}

/** True when the text holds an operator after its first character (a leading sign is not one). */
export function hasOperation(text: string): boolean {
  const trimmed = text.trim();
  for (let at = 1; at < trimmed.length; at += 1) {
    if (OPERATIONS.has(trimmed.charAt(at))) return true;
  }
  return false;
}
