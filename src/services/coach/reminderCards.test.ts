import { describe, expect, it, vi } from 'vitest';
import type { CoachMessage, CoachReminderCard } from '../../domain/model';
import { err, ok } from '../../lib/result';
import { makeCoachMessage } from '../../test/factories';
import { createReminderCards } from './reminderCards';

const CARD: CoachReminderCard = {
  text: 'Drink water',
  time: '10:00',
  days: ['mon', 'wed'],
  status: 'proposed',
};

/** A conversation of one reply with `cards`, and a patch the test can make fail. */
function storedReply(cards: CoachReminderCard[]) {
  let message: CoachMessage = makeCoachMessage({
    id: 'reply',
    role: 'assistant',
    reminders: cards,
  });
  const coachRepo = {
    get: vi.fn((id: string) => Promise.resolve(id === message.id ? message : null)),
    patch: vi.fn(async (_id: string, changes: { reminders?: readonly CoachReminderCard[] }) => {
      message = { ...message, reminders: [...(changes.reminders ?? [])] };
      return message;
    }),
  };
  return { coachRepo, stored: () => message.reminders };
}

describe('createReminderCards (P13, D-16.93)', () => {
  it('hands the card’s reminder to the service with its days or date and the switch', async () => {
    const { coachRepo } = storedReply([
      CARD,
      { text: 'Call', time: '17:00', date: '2026-10-28', status: 'proposed' },
    ]);
    const addCustomReminder = vi.fn(async () =>
      ok({ id: 'r1', text: 'x', time: '10:00', days: ['mon' as const], on: true }),
    );
    const cards = createReminderCards({
      coachRepo: coachRepo as never,
      reminders: { addCustomReminder },
    });

    await cards.add('reply', 0, true);
    await cards.add('reply', 1, false);

    expect(addCustomReminder.mock.calls).toEqual([
      [{ text: 'Drink water', time: '10:00', days: ['mon', 'wed'], on: true }],
      [{ text: 'Call', time: '17:00', date: '2026-10-28', on: false }],
    ]);
  });

  it('never adds twice, even when the added mark could not be stored', async () => {
    const { coachRepo, stored } = storedReply([CARD]);
    coachRepo.patch.mockRejectedValueOnce(new Error('storage refused'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const addCustomReminder = vi.fn(async () =>
      ok({ id: 'r1', text: 'Drink water', time: '10:00', days: ['mon' as const], on: true }),
    );
    const cards = createReminderCards({
      coachRepo: coachRepo as never,
      reminders: { addCustomReminder },
    });

    expect(await cards.add('reply', 0, true)).toEqual({ ok: true, reminderId: 'r1' });
    expect(stored()?.[0]?.status).toBe('proposed');
    expect(await cards.add('reply', 0, true)).toEqual({ ok: true, reminderId: 'r1' });

    expect(addCustomReminder).toHaveBeenCalledTimes(1);
    expect(stored()?.[0]).toEqual({ ...CARD, status: 'added', reminderId: 'r1' });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('answers the service’s problem, or unavailable without a service, and marks nothing', async () => {
    const { coachRepo, stored } = storedReply([CARD]);
    const refusing = createReminderCards({
      coachRepo: coachRepo as never,
      reminders: { addCustomReminder: async () => err('past' as const) },
    });
    const without = createReminderCards({ coachRepo: coachRepo as never });

    expect(await refusing.add('reply', 0, true)).toEqual({ ok: false, problem: 'past' });
    expect(await without.add('reply', 0, true)).toEqual({ ok: false, problem: 'unavailable' });
    expect(await without.add('reply', 5, true)).toEqual({ ok: false, problem: 'gone' });
    expect(stored()).toEqual([CARD]);
    expect(coachRepo.patch).not.toHaveBeenCalled();
  });
});
