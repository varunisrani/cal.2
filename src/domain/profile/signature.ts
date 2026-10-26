// The plan-input key behind the "inputs changed" nudge. A rebuild stores the key of the profile it
// built the plan from (`goals.rebuildBaseline`); while the current key differs, the rebuild row
// shows the nudge. Edits never rebuild on their own (R01.12). When no baseline is stored yet, the
// current key is stored silently, so the nudge never shows on first open.

import type { Profile } from '../model';

/** Bumped when the key covers different inputs; an older baseline then reads as missing. */
const KEY_FORMAT = 1;
const KEY_PREFIX = `[${KEY_FORMAT},`;

/**
 * One string over the inputs the plan is built from: sex, birth date, height, weight, activity,
 * goal, pace, target weight and body fat. Goal body fat, allergens, targets and locks are left
 * out, so editing them never raises the nudge. Weigh-ins update the profile weight, so a new
 * weigh-in does.
 */
export function planInputsKey(profile: Profile): string {
  return JSON.stringify([
    KEY_FORMAT,
    profile.sex,
    profile.birthDate,
    profile.heightCm,
    profile.weightKg,
    profile.activity,
    profile.goal,
    profile.weeklyKg ?? null,
    profile.goalWeightKg ?? null,
    profile.bodyFat ?? null,
  ]);
}

/** A stored baseline in the current format, or null when it is missing or cannot be used. */
function readBaseline(stored: unknown): string | null {
  return typeof stored === 'string' && stored.startsWith(KEY_PREFIX) ? stored : null;
}

/**
 * True when the nudge should show: a usable baseline is stored and the current inputs differ
 * from it. With no usable baseline there is no nudge (seed one with `baselineToSeed`).
 */
export function needsRebuild(current: Profile, baseline: unknown): boolean {
  const stored = readBaseline(baseline);
  return stored !== null && stored !== planInputsKey(current);
}

/**
 * The key to store silently when no usable baseline exists (first open, or a baseline written in
 * another format), else null (keep the stored one).
 */
export function baselineToSeed(current: Profile, baseline: unknown): string | null {
  return readBaseline(baseline) === null ? planInputsKey(current) : null;
}
