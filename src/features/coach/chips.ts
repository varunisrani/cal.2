// The Coach's suggested questions (P08-12, 04 §3.3): four per goal, in our own words, covering the
// same intents as the reference. A chip's words are sent as the person's own question. No chip
// for training in 1.0: workouts come later (L2, L3).

import { useMemo } from 'react';
import { useProfile } from '../../data/hooks';
import type { GoalKind } from '../../domain/model';
import { t, type TKey } from '../../i18n/t';

/** One suggested question: a stable id (`<goal>.<intent>`) and the words it sends. */
export interface CoachChip {
  readonly id: string;
  readonly text: string;
}

/** How many chips the empty chat shows as cards. */
export const CARD_CHIPS = 4;

/** Each goal's questions in the order they show. */
const CHIP_KEYS: Readonly<Record<GoalKind, readonly TKey[]>> = {
  lose: [
    'coach.chips.lose.projection',
    'coach.chips.lose.faster',
    'coach.chips.lose.intake',
    'coach.chips.lose.dinner',
  ],
  gain: [
    'coach.chips.gain.projection',
    'coach.chips.gain.healthy',
    'coach.chips.gain.intake',
    'coach.chips.gain.protein',
  ],
  maintain: [
    'coach.chips.maintain.stable',
    'coach.chips.maintain.average',
    'coach.chips.maintain.macros',
    'coach.chips.maintain.trend',
  ],
};

const KEY_PREFIX = 'coach.chips.';

/** The chips for `goal`; none while there is no goal to go by (no readable profile). */
export function chipsFor(goal: GoalKind | undefined): readonly CoachChip[] {
  if (goal === undefined) return [];
  return CHIP_KEYS[goal].map((key) => ({ id: key.slice(KEY_PREFIX.length), text: t(key) }));
}

/** The chips for the stored profile's goal; they change as soon as the goal does. */
export function useCoachChips(): readonly CoachChip[] {
  const profile = useProfile();
  const goal =
    profile.status === 'ready' && profile.value.kind === 'ok'
      ? profile.value.value.goal
      : undefined;
  return useMemo(() => chipsFor(goal), [goal]);
}
