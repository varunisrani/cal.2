// The nutrients Home shows as pillars: one to four of the 32 pillar keys, in the order they were
// picked (water, when tracked, is a fixed extra pillar the UI adds after them).

import { isPillarKey, type PillarKey } from './catalogue';

export const MAX_PILLARS = 4;

export const DEFAULT_PILLARS: readonly PillarKey[] = Object.freeze([
  'protein',
  'carbs',
  'fat',
  'fibre',
]);

/** Drops repeats (the first stays), keeps the first four, and falls back to the defaults. */
export function normalisePillars(keys: readonly PillarKey[]): PillarKey[] {
  const unique = [...new Set(keys)].slice(0, MAX_PILLARS);
  return unique.length > 0 ? unique : [...DEFAULT_PILLARS];
}

/**
 * Reads the stored choice: a comma-separated string or a list of names. Each name is trimmed,
 * unknown names are dropped, then the list is normalised (protein, carbs, fat and fibre when
 * nothing valid is left).
 */
export function readPillars(raw: unknown): PillarKey[] {
  const names: readonly unknown[] =
    typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : [];
  const keys = names
    .map((name) => (typeof name === 'string' ? name.trim() : name))
    .filter(isPillarKey);
  return normalisePillars(keys);
}

/**
 * The picker's tap on `key`. A chosen key is removed unless it is the only one left (then the
 * choice stays as it was). A new key is added at the end, or, when four are already chosen, takes
 * the place of the most recently added one.
 */
export function togglePillar(chosen: readonly PillarKey[], key: PillarKey): PillarKey[] {
  const current = normalisePillars(chosen);
  if (current.includes(key)) {
    return current.length > 1 ? current.filter((each) => each !== key) : current;
  }
  if (current.length < MAX_PILLARS) return [...current, key];
  return [...current.slice(0, MAX_PILLARS - 1), key];
}
