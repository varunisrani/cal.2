/**
 * Rolling window hashes over id streams. Two polynomial hashes modulo primes just under
 * 2^26 give a 52-bit key per window; every product stays below 2^53, so plain numbers
 * are exact. Keys are kept in sorted typed arrays and found by binary search.
 */

const P1 = 67108859;
const P2 = 67108837;
const B1 = 31415821;
const B2 = 27182813;
const SPLIT = 67108864; // 2^26

function powMod(base: number, exp: number, mod: number): number {
  let r = 1;
  for (let k = 0; k < exp; k++) r = (r * base) % mod;
  return r;
}

/**
 * Calls `onWindow(start, h1, h2)` for every window of `w` ids. The key of a window is
 * `h1 * 2^26 + h2` (see `keyOf`).
 */
export function rollWindows(
  ids: ArrayLike<number>,
  w: number,
  onWindow: (start: number, h1: number, h2: number) => void,
): void {
  const n = ids.length;
  if (w <= 0 || n < w) return;
  const top1 = powMod(B1, w - 1, P1);
  const top2 = powMod(B2, w - 1, P2);
  let h1 = 0;
  let h2 = 0;
  for (let k = 0; k < w; k++) {
    const x = ids[k]!;
    h1 = (h1 * B1 + (x % P1)) % P1;
    h2 = (h2 * B2 + (x % P2)) % P2;
  }
  onWindow(0, h1, h2);
  for (let s = 1; s + w <= n; s++) {
    const out = ids[s - 1]!;
    const inc = ids[s + w - 1]!;
    h1 = (h1 - (((out % P1) * top1) % P1) + P1) % P1;
    h2 = (h2 - (((out % P2) * top2) % P2) + P2) % P2;
    h1 = (h1 * B1 + (inc % P1)) % P1;
    h2 = (h2 * B2 + (inc % P2)) % P2;
    onWindow(s, h1, h2);
  }
}

export function keyOf(h1: number, h2: number): number {
  return h1 * SPLIT + h2;
}

/** Window keys of a stream, one per start position. */
export function windowKeys(ids: ArrayLike<number>, w: number): Float64Array {
  const keys = new Float64Array(Math.max(0, ids.length - w + 1));
  rollWindows(ids, w, (s, h1, h2) => {
    keys[s] = keyOf(h1, h2);
  });
  return keys;
}

/** Index of `key` in the sorted array, or -1. */
export function findKey(keys: Float64Array, key: number): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid]! < key) lo = mid + 1;
    else hi = mid;
  }
  return lo < keys.length && keys[lo] === key ? lo : -1;
}

/**
 * Stable LSD radix sort of `n` (h1, h2) pairs, 13 bits per pass. Returns the order
 * (indices into the inputs), so callers can carry payload arrays along.
 */
export function radixOrder(h1: Uint32Array, h2: Uint32Array, n: number): Uint32Array {
  let order = new Uint32Array(n);
  for (let k = 0; k < n; k++) order[k] = k;
  let spare = new Uint32Array(n);
  const counts = new Uint32Array(8192);
  const passes: Array<[Uint32Array, number]> = [
    [h2, 0],
    [h2, 13],
    [h1, 0],
    [h1, 13],
  ];
  for (const [arr, shift] of passes) {
    counts.fill(0);
    for (let k = 0; k < n; k++) counts[(arr[order[k]!]! >>> shift) & 8191]!++;
    let sum = 0;
    for (let b = 0; b < 8192; b++) {
      const c = counts[b]!;
      counts[b] = sum;
      sum += c;
    }
    for (let k = 0; k < n; k++) {
      const idx = order[k]!;
      spare[counts[(arr[idx]! >>> shift) & 8191]!++] = idx;
    }
    [order, spare] = [spare, order];
  }
  return order;
}
