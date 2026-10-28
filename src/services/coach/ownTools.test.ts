import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolCall } from '../../ai/chat/types';
import type { PlatewiseDb } from '../../data/schema';
import { CUSTOM_REMINDER_LIMIT, WEEKDAYS } from '../../domain/reminders/custom';
import { storedActions } from './__fixtures__/actions';
import { closeAll, openCoachStores } from './__fixtures__/stores';
import { readCheckIns } from './checkIns';
import { createOwnDesk, runOwnCalls, settleOwn, undoOwn } from './ownTools';
import { createReminderDesk, type ReminderDesk } from './reminderTool';

// The stores' clock: Monday 26 October 2026, 12:30 in New York.
const local = (text: string) => new Date(text).getTime();

type Json = Record<string, unknown>;

const opened: PlatewiseDb[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  closeAll(opened);
});

async function setUp(setsReminders = true) {
  const stores = await openCoachStores();
  opened.push(stores.db);
  const actions = storedActions(stores);
  const checks = { problemWith: actions.reminders.problemWith };
  const desk = (): ReminderDesk =>
    createReminderDesk(checks, createOwnDesk(actions, 'chat-1', setsReminders));
  return {
    ...stores,
    actions,
    desk,
    reminders: () => stores.settingsRepo.get('remind.custom'),
    checkIns: async () => readCheckIns(await stores.settingsRepo.get('coach.checkIns')),
  };
}

let calls = 0;
const call = (name: string, args: Json): ToolCall => ({ id: `c${++calls}`, name, args });

/** Runs one round's calls on `desk`; the answers in call order, as JSON. */
async function round(desk: ReminderDesk, ...list: ToolCall[]): Promise<(Json | undefined)[]> {
  const written = await runOwnCalls(list, desk);
  return list.map((one) => {
    const answer = written.get(one);
    return answer === undefined ? undefined : (JSON.parse(answer) as Json);
  });
}

const WATER = { text: 'Drink a glass of water', time: '10:00', days: 'daily' };
const CHECK_IN = { date: '2026-10-29', time: '19:00', message: 'How did the new breakfast go?' };

describe('set_reminder: the Coach sets a reminder at once (P17-03, D-16.102)', () => {
  it('adds it with the same checks as Settings and tells the model it is set', async () => {
    const s = await setUp();
    const desk = s.desk();

    const [answer] = await round(desk, call('set_reminder', WATER));

    expect(answer).toMatchObject({
      set: true,
      reminder: { text: 'Drink a glass of water', time: '10:00', days: 'daily' },
    });
    expect(String(answer?.note)).toContain('Say in your reply what you set');
    expect(await s.reminders()).toEqual([
      { id: 'set-1', text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, on: true },
    ]);
    expect(desk.proposals).toEqual([
      { text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, reminderId: 'set-1' },
    ]);
  });

  it('sets the same reminder once in one reply, and refuses a bad one with the reason', async () => {
    const s = await setUp();
    const desk = s.desk();

    const [first, again, bad] = await round(
      desk,
      call('set_reminder', WATER),
      call('set_reminder', { ...WATER, time: ' 10:00 ' }),
      call('set_reminder', { text: 'Stretch', time: '25:00', days: 'daily' }),
    );

    expect(again).toEqual(first);
    expect(bad).toMatchObject({ problem: 'badTime' });
    expect(await s.reminders()).toHaveLength(1);
  });

  it('refuses the 21st reminder: the limit of 20 holds', async () => {
    const s = await setUp();
    await s.settingsRepo.set(
      'remind.custom',
      Array.from({ length: CUSTOM_REMINDER_LIMIT }, (_, index) => ({
        id: `kept-${index}`,
        text: `Kept ${index}`,
        time: '08:00',
        days: ['mon' as const],
        on: true,
      })),
    );
    const desk = s.desk();

    const [answer] = await round(desk, call('set_reminder', WATER));

    expect(answer).toMatchObject({ problem: 'full' });
    expect(String(answer?.error)).toContain('20 reminders');
    expect(await s.reminders()).toHaveLength(CUSTOM_REMINDER_LIMIT);
    expect(desk.proposals).toEqual([]);
  });

  it('leaves set_reminder alone while the Coach only proposes, and every other call', async () => {
    const s = await setUp(false);
    const [set, other] = await round(
      s.desk(),
      call('set_reminder', WATER),
      call('food_log', { from: '2026-10-01', to: '2026-10-26' }),
    );
    expect(set).toBeUndefined();
    expect(other).toBeUndefined();
    expect(await s.reminders()).toEqual([]);
  });
});

describe('schedule_check_in: the Coach schedules a check-in (P17-03, D-16.102)', () => {
  it('keeps it for this chat and tells the model it is scheduled', async () => {
    const s = await setUp();
    const desk = s.desk();

    const [answer] = await round(desk, call('schedule_check_in', CHECK_IN));

    expect(answer).toMatchObject({ scheduled: true, checkIn: CHECK_IN });
    expect(String(answer?.note)).toContain('Say in your reply when you will check in');
    expect(await s.checkIns()).toEqual([
      {
        id: 'check-1',
        chatId: 'chat-1',
        at: local('2026-10-29T19:00:00'),
        text: 'How did the new breakfast go?',
      },
    ]);
  });

  it.each([
    ['in the past', { date: '2026-10-26', time: '09:00' }, 'past', 'already passed'],
    ['more than 14 days ahead', { date: '2026-11-20' }, 'tooFar', 'at most 14 days ahead'],
    ['over 120 characters', { message: 'a'.repeat(121) }, 'textTooLong', '120 characters'],
    ['without words', { message: ' ' }, 'noText', 'no message'],
    ['without a time', { time: 'evening' }, 'badTime', 'HH:MM'],
  ] as const)('refuses one %s, with the reason', async (_name, change, problem, words) => {
    const s = await setUp();
    const [answer] = await round(s.desk(), call('schedule_check_in', { ...CHECK_IN, ...change }));
    expect(answer).toMatchObject({ problem });
    expect(String(answer?.error)).toContain(words);
    expect(await s.checkIns()).toEqual([]);
  });

  it('keeps at most 3 waiting, and the same one once per reply', async () => {
    const s = await setUp();
    const answers = await round(
      s.desk(),
      call('schedule_check_in', CHECK_IN),
      call('schedule_check_in', CHECK_IN),
      call('schedule_check_in', { ...CHECK_IN, time: '19:30' }),
      call('schedule_check_in', { ...CHECK_IN, time: '20:00' }),
      call('schedule_check_in', { ...CHECK_IN, time: '20:30' }),
    );

    expect(answers[1]).toEqual(answers[0]);
    expect(answers.slice(2, 4)).toMatchObject([{ scheduled: true }, { scheduled: true }]);
    expect(answers[4]).toMatchObject({ problem: 'full' });
    expect(String(answers[4]?.error)).toContain('3 check-ins are already waiting');
    expect(await s.checkIns()).toHaveLength(3);
  });

  it('answers that nothing was set when storage refuses', async () => {
    const s = await setUp();
    vi.spyOn(s.actions.checkIns, 'add').mockRejectedValue(new Error('storage refused'));
    const [answer] = await round(s.desk(), call('schedule_check_in', CHECK_IN));
    expect(answer).toEqual({ error: 'It could not be saved, so nothing was set.' });
  });
});

describe('what the Coach set, after the attempt (P17-03, D-16.102)', () => {
  it('takes everything back when the attempt fails', async () => {
    const s = await setUp();
    const desk = s.desk();
    await round(desk, call('set_reminder', WATER), call('schedule_check_in', CHECK_IN));

    await undoOwn(desk);

    expect(await s.reminders()).toEqual([]);
    expect(await s.checkIns()).toEqual([]);
  });

  it('ties the check-ins to the stored reply, or takes everything back without one', async () => {
    const s = await setUp();
    const kept = s.desk();
    await round(kept, call('set_reminder', WATER), call('schedule_check_in', CHECK_IN));
    await settleOwn(kept)({ id: 'reply-1' });
    expect((await s.checkIns()).map(({ messageId }) => messageId)).toEqual(['reply-1']);
    expect(await s.reminders()).toHaveLength(1);

    const dropped = s.desk();
    await round(dropped, call('schedule_check_in', { ...CHECK_IN, time: '21:00' }));
    await settleOwn(dropped)(null);
    expect(await s.checkIns()).toHaveLength(1);
  });

  it('never rejects when taking back fails', async () => {
    const s = await setUp();
    const desk = s.desk();
    await round(desk, call('schedule_check_in', CHECK_IN));
    vi.spyOn(s.actions.checkIns, 'remove').mockRejectedValue(new Error('storage refused'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(undoOwn(desk)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
