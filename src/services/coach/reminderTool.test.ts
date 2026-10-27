import { describe, expect, it, vi } from 'vitest';
import { WEEKDAYS } from '../../domain/reminders/custom';
import { fixedClock } from '../../lib/clock';
import { FACTORY_NOW } from '../../test/factories';
import { createCustomRemindersService } from '../reminders/customReminders';
import {
  createReminderDesk,
  proposeReminder,
  readProposal,
  type ReminderDesk,
} from './reminderTool';
import { MAX_PROPOSALS } from './toolSchemas';

/** The real checks, at Monday 26 October 2026, 12:30 in New York. */
function desk(): ReminderDesk {
  const service = createCustomRemindersService({
    settingsRepo: { update: vi.fn() },
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  });
  return createReminderDesk(service);
}

function answer(raw: unknown, on: ReminderDesk): Record<string, unknown> {
  return JSON.parse(proposeReminder(raw, on)) as Record<string, unknown>;
}

describe('readProposal: reading what the model sent', () => {
  it('reads words, a time and a list of days, Monday first, each once', () => {
    expect(readProposal({ text: 'Gym bag', time: '07:30', days: 'fri, mon,wed mon' })).toEqual({
      text: 'Gym bag',
      time: '07:30',
      days: ['mon', 'wed', 'fri'],
    });
  });

  it('reads a one-digit hour, full and capitalised day names, and an array of days', () => {
    expect(readProposal({ text: 'Walk', time: '9:05', days: ['Tuesday', 'THURS'] })).toEqual({
      text: 'Walk',
      time: '09:05',
      days: ['tue', 'thu'],
    });
  });

  it('reads daily, every day, weekdays and weekends', () => {
    for (const words of ['daily', 'every day', 'Everyday', 'all']) {
      expect(readProposal({ text: 'x', time: '08:00', days: words }).days).toEqual(WEEKDAYS);
    }
    expect(readProposal({ text: 'x', time: '08:00', days: 'weekdays' }).days).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
    ]);
    expect(readProposal({ text: 'x', time: '08:00', days: 'weekends' }).days).toEqual([
      'sat',
      'sun',
    ]);
  });

  it('reads a date, and treats blank days or date as left out', () => {
    expect(readProposal({ text: 'Call', time: '17:00', days: ' ', date: '2026-10-28' })).toEqual({
      text: 'Call',
      time: '17:00',
      date: '2026-10-28',
    });
    expect(readProposal({ text: 'Call', time: '17:00', days: [], date: '' })).toEqual({
      text: 'Call',
      time: '17:00',
    });
  });

  it('keeps a word that names no day, and a time it cannot read, for the check to refuse', () => {
    expect(readProposal({ text: 'x', time: 'noon', days: 'mon, someday' })).toEqual({
      text: 'x',
      time: 'noon',
      days: ['mon', 'someday'],
    });
    expect(readProposal({ text: 'x', time: '08:00', days: 'Mondays, monthly' }).days).toEqual([
      'mon',
      'monthly',
    ]);
    expect(readProposal('not an object')).toEqual({ text: '', time: '' });
  });
});

describe('proposeReminder: a proposal waits for the person (P13, D-16.93)', () => {
  it('keeps a good proposal, tidied, and tells the model nothing is set until Add', () => {
    const on = desk();
    const result = answer(
      { text: '  Drink   a glass of water ', time: '10:00', days: 'daily' },
      on,
    );

    expect(on.proposals).toEqual([
      { text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS },
    ]);
    expect(result).toEqual({
      proposed: true,
      reminder: { text: 'Drink a glass of water', time: '10:00', days: 'daily' },
      note: expect.stringContaining('Nothing is set until they tap Add'),
    });
    expect(String(result.note)).toContain('do not say that the reminder is set');
  });

  it('keeps a once reminder on a date still ahead, and some weekdays as a list', () => {
    const on = desk();
    answer({ text: 'Call the dietitian', time: '17:30', date: '2026-10-28' }, on);
    const result = answer({ text: 'Gym bag', time: '07:00', days: 'mon,wed,fri' }, on);

    expect(on.proposals).toEqual([
      { text: 'Call the dietitian', time: '17:30', date: '2026-10-28' },
      { text: 'Gym bag', time: '07:00', days: ['mon', 'wed', 'fri'] },
    ]);
    expect(result.reminder).toEqual({ text: 'Gym bag', time: '07:00', days: 'mon,wed,fri' });
  });

  it('answers each problem in words with its code, and keeps nothing', () => {
    const on = desk();
    const cases: [Record<string, unknown>, string, string][] = [
      [{ text: ' ', time: '10:00', days: 'daily' }, 'noText', 'Ask the person what it should say'],
      [{ text: 'x'.repeat(81), time: '10:00', days: 'daily' }, 'textTooLong', 'longer than 80'],
      [{ text: 'Walk', days: 'daily' }, 'badTime', 'ask them for one rather than picking it'],
      [{ text: 'Walk', time: '10:00', days: 'someday' }, 'noDays', 'which days they mean'],
      [{ text: 'Walk', time: '10:00', date: '2026-02-30' }, 'badDate', 'YYYY-MM-DD'],
      [{ text: 'Walk', time: '10:00' }, 'daysOrDate', 'not both and not neither'],
      [{ text: 'Walk', time: '10:00', days: 'mon', date: '2026-10-28' }, 'daysOrDate', 'ask them'],
      [{ text: 'Walk', time: '12:00', date: '2026-10-26' }, 'past', 'already passed'],
    ];
    for (const [args, problem, words] of cases) {
      const result = answer(args, on);
      expect(result.problem).toBe(problem);
      expect(String(result.error)).toContain(words);
    }
    expect(on.proposals).toEqual([]);
  });

  it('keeps the same proposal once, however often the model sends it', () => {
    const on = desk();
    const args = { text: 'Walk', time: '18:00', days: 'mon,thu' };
    answer(args, on);
    const again = answer({ ...args, days: 'Thursday and Monday' }, on);

    expect(on.proposals).toHaveLength(1);
    expect(again.proposed).toBe(true);
  });

  it(`refuses more than ${MAX_PROPOSALS} proposals in one reply`, () => {
    const on = desk();
    for (let hour = 10; hour < 10 + MAX_PROPOSALS; hour += 1) {
      expect(answer({ text: 'Water', time: `${hour}:00`, days: 'daily' }, on).proposed).toBe(true);
    }
    const extra = answer({ text: 'Water', time: '20:00', days: 'daily' }, on);

    expect(String(extra.error)).toContain(`Only ${MAX_PROPOSALS} reminders`);
    expect(on.proposals).toHaveLength(MAX_PROPOSALS);
  });
});
