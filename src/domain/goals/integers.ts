// Whole-number arithmetic for the plan maths. The goal rules are written with integer division and
// a true modulo, and swapping either for `Math.round`, `Math.floor` or `%` moves results by one
// (R01.9), so every goal module uses these two instead.

/** Integer division cut toward zero: 7 div 2 = 3, −7 div 2 = −3. */
export function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

/**
 * The remainder that takes the divisor's sign: floorMod(−1, 4) = 3, where JavaScript's `-1 % 4`
 * is −1 (R01.9).
 */
export function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}
