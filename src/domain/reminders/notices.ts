// What Platewise sends by itself in the Android app (P17, D-16.100–D-16.102): the kinds of nudge
// and notice, which of them have a switch, and quiet hours. Pure.

/** Every kind: the planned nudges, the event notices and the Coach's own (P17 S2). */
export const NOTICE_KINDS = [
  // Planned ahead with the reminders (D-16.100).
  'mealCheck',
  'waterPace',
  'emptyDay',
  'weighIn',
  // Posted at once (D-16.101).
  'sugarOver',
  'caloriesOver',
  'proteinReached',
  'activeWeek',
  'fastGoal',
  'analysisReady',
  'backupFailed',
  // The Coach's (D-16.102).
  'coachReplied',
  'coachCheckIn',
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/**
 * The kinds with a switch in Smart notifications, in its order. The fasting goal keeps its own
 * switch among the reminders; the Coach's check-ins have none (each was agreed to, and Settings
 * lists them with Delete).
 */
export const SMART_KINDS = [
  'mealCheck',
  'waterPace',
  'emptyDay',
  'weighIn',
  'sugarOver',
  'caloriesOver',
  'proteinReached',
  'activeWeek',
  'analysisReady',
  'backupFailed',
  'coachReplied',
] as const satisfies readonly NoticeKind[];
export type SmartKind = (typeof SMART_KINDS)[number];

/** Quiet hours, local clock hours: from 22:00 until 07:00. */
export const QUIET_HOURS = { from: 22, until: 7 } as const;

/** True when the local clock at `at` is within quiet hours. */
export function isQuietAt(at: number): boolean {
  const hour = new Date(at).getHours();
  return hour >= QUIET_HOURS.from || hour < QUIET_HOURS.until;
}

/** The first instant at or after `at` outside quiet hours: `at` itself, or the next 07:00. */
export function afterQuiet(at: number): number {
  if (!isQuietAt(at)) return at;
  const next = new Date(at);
  if (next.getHours() >= QUIET_HOURS.from) next.setDate(next.getDate() + 1);
  next.setHours(QUIET_HOURS.until, 0, 0, 0);
  return next.getTime();
}
