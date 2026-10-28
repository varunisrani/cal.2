// The week's moderate minutes against the WHO's 150 (P15-02, D-16.96): the brisk minutes of the
// walks recorded in Platewise, plus the walking sessions other apps put in Health Connect. A
// session counts whole (a recorded walking workout is moderate activity), except when it overlaps
// a walk recorded here: that is the same walk seen twice (a watch also recorded it, or our own
// session came back), so only ours counts. Health Connect's copy never holds Platewise's own
// sessions (the plugin leaves them out), and the overlap rule catches the rest.

import type { Walk } from './model';

/** Moderate minutes a week the WHO recommends for adults. */
export const MODERATE_GOAL_MINUTES = 150;

/** A Health Connect session as the activity copy keeps it. */
export interface WalkingSession {
  readonly start: number;
  readonly end: number;
  readonly type: string;
}

export interface WeekMinutes {
  /** Brisk minutes of walks recorded here. */
  readonly recorded: number;
  /** Minutes of other apps' walking sessions. */
  readonly other: number;
  readonly total: number;
}

/** True for a session of walking (Health Connect's type name). */
export function isWalkingSession(session: Pick<WalkingSession, 'type'>): boolean {
  return session.type.toLowerCase() === 'walking';
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Moderate minutes of the week `[from, to)` (instants). */
export function weekWalkingMinutes(input: {
  readonly walks: readonly Pick<Walk, 'startedAt' | 'endedAt' | 'briskMinutes'>[];
  readonly sessions: readonly WalkingSession[];
  readonly from: number;
  readonly to: number;
}): WeekMinutes {
  const { from, to } = input;
  const walks = input.walks.filter((walk) => walk.startedAt >= from && walk.startedAt < to);
  const recorded = walks.reduce((sum, walk) => sum + Math.max(0, walk.briskMinutes), 0);
  const spans = walks.map((walk) => ({ start: walk.startedAt, end: walk.endedAt }));
  let other = 0;
  for (const session of input.sessions) {
    if (!isWalkingSession(session) || session.start < from || session.start >= to) continue;
    if (!(session.end > session.start)) continue;
    if (spans.some((span) => overlaps(span, session))) continue;
    other += Math.round((session.end - session.start) / 60_000);
  }
  return { recorded, other, total: recorded + other };
}
