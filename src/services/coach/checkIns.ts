// The check-ins the Coach schedules (P17, D-16.102): one message from the Coach for later, at a
// local day and time within the next 14 days, in the chat it was set in. At most 3 wait at once.
// They are kept in the `coach.checkIns` setting, so they travel in backups with the chats they
// belong to; the Android app plans each as a notification (`reminders/nativePlan.ts`) and, once its
// time has come, puts its message into its chat as the Coach's (`notifications/setup.ts`).
//
// Each change reads and writes the stored list in one settings transaction, so two adds at once
// cannot pass the limit and a check-in that came is taken off the list, and delivered, once.
// Nothing is written when a change would change nothing: every settings write plans again.

import type { SettingsRepo } from '../../data/repos/settingsRepo';
import type { StoredRecord } from '../../data/settingsSchema';
import { isDayKey } from '../../domain/dates/dayKey';
import { isTimeOfDay, textLength, tidyText } from '../../domain/reminders/custom';
import type { Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { err, ok, type Result } from '../../lib/result';
import { clockOn } from '../reminders/schedule';

/** The most check-ins waiting at once. */
export const CHECK_IN_LIMIT = 3;
/** The longest message, in characters (code points). */
export const CHECK_IN_TEXT_MAX = 120;
/** How far ahead a check-in may be, in days. */
export const CHECK_IN_AHEAD_DAYS = 14;

/** One waiting check-in. */
export interface CheckIn {
  readonly id: string;
  /** The chat it was set in, where its message appears. */
  readonly chatId: string;
  /** When it comes, epoch ms. */
  readonly at: number;
  /** The Coach's message. */
  readonly text: string;
  /** The reply that set it, once that reply is stored: its card sits under it. */
  readonly messageId?: string;
}

/** A check-in as the Coach asks for it: a local day and time, and the message. */
export interface CheckInInput {
  readonly chatId: string;
  readonly date: string;
  readonly time: string;
  readonly text: string;
}

/**
 * Why a check-in cannot be kept: no words, words over 120 characters, not a time of day, not a
 * calendar day, a moment that has passed, more than 14 days ahead, already 3 waiting.
 */
export type CheckInProblem =
  'noText' | 'textTooLong' | 'badTime' | 'badDate' | 'past' | 'tooFar' | 'full';

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

function readOne(raw: StoredRecord): CheckIn | null {
  const { id, chatId, at, text, messageId } = raw;
  if (!isText(id) || !isText(chatId) || !isText(text)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) return null;
  const checkIn: CheckIn = { id, chatId, at, text };
  return isText(messageId) ? { ...checkIn, messageId } : checkIn;
}

/** The stored list as check-ins, soonest first; a record that cannot be read is left out. */
export function readCheckIns(stored: readonly StoredRecord[]): CheckIn[] {
  return stored.flatMap((raw) => readOne(raw) ?? []).sort((a, b) => a.at - b.at);
}

/** The words and the moment of a check-in as kept, or why it cannot be. */
export function checkCheckIn(
  input: Omit<CheckInInput, 'chatId'>,
  now: number,
): Result<{ readonly at: number; readonly text: string }, CheckInProblem> {
  const text = tidyText(input.text);
  if (text === '') return err('noText');
  if (textLength(text) > CHECK_IN_TEXT_MAX) return err('textTooLong');
  if (!isTimeOfDay(input.time)) return err('badTime');
  if (!isDayKey(input.date)) return err('badDate');
  const at = clockOn(input.date, input.time);
  if (at <= now) return err('past');
  // By the calendar: the same clock time 14 days on, across a change of clocks too.
  const last = new Date(now);
  last.setDate(last.getDate() + CHECK_IN_AHEAD_DAYS);
  if (at > last.getTime()) return err('tooFar');
  return ok({ at, text });
}

export interface CheckInStore {
  /** Adds a check-in, or answers why not (`full` at 3). */
  add(input: CheckInInput): Promise<Result<CheckIn, CheckInProblem>>;
  /** Takes one off the list; resolves false when there was none with that id. */
  remove(id: string): Promise<boolean>;
  /** Ties check-ins to the reply that set them. */
  attach(ids: readonly string[], messageId: string): Promise<void>;
  /** Takes a deleted chat's check-ins off the list. */
  dropChat(chatId: string): Promise<void>;
  /** Takes off the list, and answers, those whose time has come by `now`, soonest first. */
  takeDue(now: number): Promise<CheckIn[]>;
}

export interface CheckInDeps {
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'update'>;
  readonly clock: Clock;
  /** Makes the id of a new check-in; random UUIDs unless a test passes its own. */
  readonly newId?: IdSource;
}

export function createCheckIns({
  settingsRepo,
  clock,
  newId = randomId,
}: CheckInDeps): CheckInStore {
  const read = async () => readCheckIns(await settingsRepo.get('coach.checkIns'));

  /**
   * Changes the list in one transaction when `wanted` holds for the list as read now; `change`
   * answers the list to keep.
   */
  async function change(
    wanted: (list: readonly CheckIn[]) => boolean,
    next: (list: CheckIn[]) => CheckIn[],
  ): Promise<void> {
    if (!wanted(await read())) return;
    await settingsRepo.update('coach.checkIns', (stored) => {
      const list = readCheckIns(stored);
      return wanted(list) ? next(list).map((checkIn) => ({ ...checkIn })) : stored;
    });
  }

  return {
    async add(input) {
      const checked = checkCheckIn(input, clock.now());
      if (!checked.ok) return checked;
      const checkIn: CheckIn = { id: newId(), chatId: input.chatId, ...checked.value };
      let result: Result<CheckIn, CheckInProblem> = err('full');
      await settingsRepo.update('coach.checkIns', (stored) => {
        const list = readCheckIns(stored);
        if (list.length >= CHECK_IN_LIMIT) return stored;
        result = ok(checkIn);
        return [...list, checkIn].map((each) => ({ ...each }));
      });
      return result;
    },

    async remove(id) {
      let found = false;
      await change(
        (list) => list.some((checkIn) => checkIn.id === id),
        (list) => {
          found = true;
          return list.filter((checkIn) => checkIn.id !== id);
        },
      );
      return found;
    },

    attach: (ids, messageId) =>
      change(
        (list) => list.some((checkIn) => ids.includes(checkIn.id)),
        (list) =>
          list.map((checkIn) => (ids.includes(checkIn.id) ? { ...checkIn, messageId } : checkIn)),
      ),

    dropChat: (chatId) =>
      change(
        (list) => list.some((checkIn) => checkIn.chatId === chatId),
        (list) => list.filter((checkIn) => checkIn.chatId !== chatId),
      ),

    async takeDue(now) {
      let due: CheckIn[] = [];
      await change(
        (list) => list.some((checkIn) => checkIn.at <= now),
        (list) => {
          due = list.filter((checkIn) => checkIn.at <= now);
          return list.filter((checkIn) => checkIn.at > now);
        },
      );
      return due;
    },
  };
}
