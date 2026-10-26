// Home pillars: the 1–4 nutrients Home shows as gauges (setting `home.pillars`), kept in the
// order they were picked. Water is never one of them; Home adds its own water pillar after them.

import { isMacroKey, type Targets } from '../model';
import { isPillarKey, type PillarKey } from './catalogue';
import type { GoalValues } from './goalDefaults';

export const MAX_PILLARS = 4;
export const DEFAULT_PILLARS: readonly PillarKey[] = ['protein', 'carbs', 'fat', 'fibre'];

/**
 * Reads a stored pillar list: a comma-separated string or an array of strings. Each name is
 * trimmed; unknown names and repeats are dropped and the first four kept. When nothing valid is
 * left (or the value is neither form) the result is the default four.
 */
export function decodePillars(stored: unknown): PillarKey[] {
  let names: unknown[];
  if (typeof stored === 'string') names = stored.split(',');
  else if (Array.isArray(stored)) names = stored;
  else return [...DEFAULT_PILLARS];

  const picked: PillarKey[] = [];
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const key = name.trim();
    if (isPillarKey(key) && !picked.includes(key)) picked.push(key);
    if (picked.length === MAX_PILLARS) break;
  }
  return picked.length > 0 ? picked : [...DEFAULT_PILLARS];
}

/**
 * The picker's tap on `key`. A chosen key is removed unless it is the only one (then nothing
 * changes and `selection` itself is returned). A new key is added at the end; when four are
 * already chosen it takes the place of the most recently added one.
 */
export function togglePillar(
  selection: readonly PillarKey[],
  key: PillarKey,
): readonly PillarKey[] {
  if (selection.includes(key)) {
    if (selection.length <= 1) return selection;
    return selection.filter((chosen) => chosen !== key);
  }
  return [...selection.slice(0, MAX_PILLARS - 1), key];
}

/**
 * The goal a pillar fills toward: the day's effective target for a macro, the optional goal for
 * everything else (0 means no goal).
 */
export function pillarGoal(key: PillarKey, targets: Targets, goals: Readonly<GoalValues>): number {
  return isMacroKey(key) ? targets[key] : goals[key];
}
