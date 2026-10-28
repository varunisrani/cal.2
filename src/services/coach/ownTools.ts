// What the Coach does by itself in the Android app (P17, D-16.102): it sets the reminders the
// person asked for at once while Let the Coach set reminders is on (`set_reminder`), and it
// schedules check-ins (`schedule_check_in`): one message for later, in the chat it was set in.
//
// The chat wires write a round's tool results synchronously, so these writes are made first, in
// the order of the calls, and their answers handed to the wire with the rest (`runOwnCalls`). What
// an attempt set is kept on its desk: when the attempt fails (a later round, Cancel, the standby
// taking over) it is all taken back (`undoOwn`), so a failed question leaves nothing set and a
// standby never sets anything twice; after the answer, the reply's check-ins are tied to it, or,
// when the reply was not stored (its chat went meanwhile), everything is taken back (`settleOwn`).

import type { ToolCall } from '../../ai/chat/types';
import { tidyText } from '../../domain/reminders/custom';
import type { CustomRemindersService } from '../reminders/customReminders';
import {
  CHECK_IN_AHEAD_DAYS,
  CHECK_IN_LIMIT,
  CHECK_IN_TEXT_MAX,
  type CheckIn,
  type CheckInProblem,
  type CheckInStore,
} from './checkIns';
import { argsOf, setReminder, textArg, timeArg, type ReminderDesk } from './reminderTool';
import { CHECK_IN_TOOL_NAME, SET_REMINDER_TOOL_NAME } from './toolSchemas';

/** What the Android app lets the Coach do (`notifications/setup.ts` makes it). */
export interface CoachActions {
  /** Let the Coach set reminders is on; read when each turn starts. */
  setsReminders(): Promise<boolean>;
  readonly reminders: Pick<CustomRemindersService, 'addCustomReminder' | 'removeCustomReminder'>;
  readonly checkIns: CheckInStore;
}

/** One attempt's own writes: what it may do, the chat it runs in, and what it set so far. */
export interface OwnDesk {
  readonly actions: CoachActions;
  readonly chatId: string;
  /** `set_reminder` is offered: reminders are set at once. */
  readonly setsReminders: boolean;
  /** The check-ins set so far, in order, each with the words of the call that set it. */
  readonly checkIns: { readonly key: string; readonly checkIn: CheckIn }[];
}

export function createOwnDesk(
  actions: CoachActions,
  chatId: string,
  setsReminders: boolean,
): OwnDesk {
  return { actions, chatId, setsReminders, checkIns: [] };
}

/** What the model hears for each problem with a check-in. */
const CHECK_IN_PROBLEMS: Readonly<Record<CheckInProblem, string>> = {
  noText: 'The check-in has no message. Write what you will say then.',
  textTooLong: `The message is longer than ${CHECK_IN_TEXT_MAX} characters. Make it shorter.`,
  badTime:
    'The time is not a time of day in 24 hours (HH:MM). If the person gave no time, ask them.',
  badDate: 'The date is not a real day written YYYY-MM-DD.',
  past: 'That day and time have already passed. Pick a time still ahead.',
  tooFar: `A check-in can be at most ${CHECK_IN_AHEAD_DAYS} days ahead. Pick a sooner time.`,
  full:
    `${CHECK_IN_LIMIT} check-ins are already waiting, the most the app keeps. Tell the person; ` +
    'they can delete one in Settings › Tracking & reminders.',
};

const SCHEDULED =
  'It is scheduled. A card under your reply shows it, where the person can cancel it. Say in ' +
  'your reply when you will check in.';

const NOT_SAVED = JSON.stringify({ error: 'It could not be saved, so nothing was set.' });

/** A check-in's day, time and message as the call gave them: the same words make the same one. */
function checkInArgs(raw: unknown): { date: string; time: string; text: string } {
  const args = argsOf(raw);
  const message = typeof args.message === 'string' ? args.message : '';
  return { date: textArg(args.date) ?? '', time: timeArg(args.time), text: message };
}

/**
 * Runs one `schedule_check_in` call: the store checks it (a time ahead, within 14 days, the
 * words, at most 3 waiting) and keeps it; the answer says it is scheduled, or why not. The same
 * check-in twice in one attempt is kept once.
 */
export async function scheduleCheckIn(raw: unknown, own: OwnDesk): Promise<string> {
  const { date, time, text } = checkInArgs(raw);
  const shown = { date, time, message: tidyText(text) };
  const answer = JSON.stringify({ scheduled: true, checkIn: shown, note: SCHEDULED });
  const key = JSON.stringify(shown);
  if (own.checkIns.some((each) => each.key === key)) return answer;
  const result = await own.actions.checkIns.add({ chatId: own.chatId, date, time, text });
  if (!result.ok) {
    return JSON.stringify({ error: CHECK_IN_PROBLEMS[result.error], problem: result.error });
  }
  own.checkIns.push({ key, checkIn: result.value });
  return answer;
}

/**
 * Makes the writes a round asks for, in call order: `set_reminder` while it is offered and
 * `schedule_check_in`. Answers each one's result by its call; other calls are left to the tools.
 */
export async function runOwnCalls(
  calls: readonly ToolCall[],
  desk: ReminderDesk | undefined,
): Promise<Map<ToolCall, string>> {
  const results = new Map<ToolCall, string>();
  const own = desk?.own;
  if (desk === undefined || own === undefined) return results;
  for (const call of calls) {
    let run: Promise<string> | null = null;
    if (call.name === SET_REMINDER_TOOL_NAME && own.setsReminders) {
      run = setReminder(call.args, desk, (input) => own.actions.reminders.addCustomReminder(input));
    } else if (call.name === CHECK_IN_TOOL_NAME) {
      run = scheduleCheckIn(call.args, own);
    }
    if (run === null) continue;
    results.set(call, await run.catch(() => NOT_SAVED));
  }
  return results;
}

/** Takes back every reminder and check-in the attempt set. Never rejects. */
export async function undoOwn(desk: ReminderDesk | undefined): Promise<void> {
  const own = desk?.own;
  if (desk === undefined || own === undefined) return;
  const reminders = desk.proposals.flatMap(({ reminderId }) => reminderId ?? []);
  try {
    for (const id of reminders) await own.actions.reminders.removeCustomReminder(id);
    for (const { checkIn } of own.checkIns) await own.actions.checkIns.remove(checkIn.id);
  } catch (error) {
    console.error('Platewise: what the Coach set could not be taken back', error);
  }
}

/**
 * What follows the answer once its reply was stored, or not (null): the reply's check-ins tied
 * to it, or everything the attempt set taken back. Never rejects.
 */
export function settleOwn(
  desk: ReminderDesk,
): (reply: { readonly id: string } | null) => Promise<void> {
  return async (reply) => {
    const own = desk.own;
    if (reply === null) return undoOwn(desk);
    if (own === undefined || own.checkIns.length === 0) return;
    await own.actions.checkIns
      .attach(
        own.checkIns.map(({ checkIn }) => checkIn.id),
        reply.id,
      )
      .catch((error: unknown) => {
        console.error('Platewise: a check-in could not be tied to its reply', error);
      });
  };
}
