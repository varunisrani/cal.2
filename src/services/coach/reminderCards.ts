// Add and Dismiss on the reminder cards under the Coach's replies (P13, D-16.93). A card holds a
// reminder the Coach proposed; Add hands it to the custom reminders service (switched on, or off
// when notifications were refused) and marks the card added with the new reminder's id; Dismiss
// marks it dismissed. Both read the stored card first and run one at a time, so a second Add (a
// double tap, a second tab's button in this app) finds the card added and answers the same
// reminder instead of adding it again. A reminder added here is also remembered for the session,
// so a mark that storage refused cannot lead to a second add. Loaded on the first card press.

import type { CoachRepo } from '../../data/repos/coachRepo';
import type { CoachReminderCard } from '../../domain/model';
import type { CustomReminderProblem } from '../../domain/reminders/custom';
import type { CustomRemindersService } from '../reminders/customReminders';

/**
 * Why a card's reminder was not added: the service's reason, the card gone (its chat was deleted,
 * or it was dismissed), or no reminders service to add it with.
 */
export type ReminderCardProblem = CustomReminderProblem | 'gone' | 'unavailable';

export type ReminderCardOutcome =
  | { readonly ok: true; readonly reminderId: string }
  | { readonly ok: false; readonly problem: ReminderCardProblem };

export interface ReminderCards {
  /** Adds the card's reminder once; an added card answers its reminder again. */
  add(messageId: string, index: number, on: boolean): Promise<ReminderCardOutcome>;
  /** Marks a card that is still waiting as dismissed. */
  dismiss(messageId: string, index: number): Promise<void>;
}

export interface ReminderCardsDeps {
  readonly coachRepo: Pick<CoachRepo, 'get' | 'patch'>;
  readonly reminders?: Pick<CustomRemindersService, 'addCustomReminder'>;
}

interface FoundCard {
  readonly cards: readonly CoachReminderCard[];
  readonly card: CoachReminderCard;
}

export function createReminderCards({ coachRepo, reminders }: ReminderCardsDeps): ReminderCards {
  let tail: Promise<unknown> = Promise.resolve();
  /** Reminders added from cards since the app started, by card. */
  const added = new Map<string, string>();

  /** Runs `work` after every card press before it has settled. */
  function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work);
    tail = run.catch(() => undefined);
    return run;
  }

  async function find(messageId: string, index: number): Promise<FoundCard | null> {
    const cards = (await coachRepo.get(messageId))?.reminders;
    const card = cards?.[index];
    return cards && card ? { cards, card } : null;
  }

  async function mark(
    messageId: string,
    { cards }: FoundCard,
    index: number,
    change: Partial<CoachReminderCard>,
  ): Promise<void> {
    await coachRepo.patch(messageId, {
      reminders: cards.map((card, at) => (at === index ? { ...card, ...change } : card)),
    });
  }

  /** Marks the card added; a refused write leaves the reminder, which `added` remembers. */
  async function markAdded(
    messageId: string,
    found: FoundCard,
    index: number,
    reminderId: string,
  ): Promise<void> {
    try {
      await mark(messageId, found, index, { status: 'added', reminderId });
    } catch (error) {
      console.error('A reminder card could not be marked added', error);
    }
  }

  return {
    add: (messageId, index, on) =>
      oneAtATime(async (): Promise<ReminderCardOutcome> => {
        const key = `${messageId}#${index}`;
        const found = await find(messageId, index);
        if (found === null) return { ok: false, problem: 'gone' };
        const { card } = found;
        const known = card.reminderId ?? added.get(key);
        if (known !== undefined) {
          if (card.status !== 'added') await markAdded(messageId, found, index, known);
          return { ok: true, reminderId: known };
        }
        if (card.status !== 'proposed') return { ok: false, problem: 'gone' };
        if (reminders === undefined) return { ok: false, problem: 'unavailable' };
        const { text, time } = card;
        const result = await reminders.addCustomReminder(
          card.days === undefined
            ? { text, time, date: card.date, on }
            : { text, time, days: card.days, on },
        );
        if (!result.ok) return { ok: false, problem: result.error };
        added.set(key, result.value.id);
        await markAdded(messageId, found, index, result.value.id);
        return { ok: true, reminderId: result.value.id };
      }),

    dismiss: (messageId, index) =>
      oneAtATime(async () => {
        const found = await find(messageId, index);
        if (found === null || found.card.status !== 'proposed') return;
        await mark(messageId, found, index, { status: 'dismissed' });
      }),
  };
}
