import { afterEach, describe, expect, it } from 'vitest';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import {
  CUSTOM_REMINDER_LIMIT,
  WEEKDAYS,
  type CustomReminderInput,
} from '../../domain/reminders/custom';
import { fixedClock } from '../../lib/clock';
import { withIdSequence } from '../../lib/ids';
import { openTestDb } from '../../test/db';
import { createCustomRemindersService } from './customReminders';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

// Monday 26 October 2026, 12:30 in New York (the zone tests run in).
const NOW = new Date('2026-10-26T12:30:00').getTime();

const VITAMINS: CustomReminderInput = { text: 'Take vitamins', time: '08:30', days: WEEKDAYS };

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  const service = createCustomRemindersService({
    settingsRepo,
    clock: fixedClock(NOW, 'America/New_York'),
    newId: withIdSequence('reminder'),
  });
  const stored = () => settingsRepo.get('remind.custom');
  return { settingsRepo, service, stored };
}

describe('addCustomReminder (the Coach will call it, D-16.93)', () => {
  it('stores a reminder on, at the end of the list, and answers it', async () => {
    const h = await setUp();

    const first = await h.service.addCustomReminder(VITAMINS);
    const second = await h.service.addCustomReminder({
      text: '  Call   the dentist ',
      time: '10:15',
      date: '2026-10-27',
    });

    expect(first).toEqual({
      ok: true,
      value: {
        id: 'reminder-1',
        text: 'Take vitamins',
        time: '08:30',
        days: [...WEEKDAYS],
        on: true,
      },
    });
    expect(second).toEqual({
      ok: true,
      value: {
        id: 'reminder-2',
        text: 'Call the dentist',
        time: '10:15',
        date: '2026-10-27',
        on: true,
      },
    });
    expect(await h.stored()).toEqual([first.ok && first.value, second.ok && second.value]);
  });

  it('stores one off when asked to', async () => {
    const h = await setUp();

    await h.service.addCustomReminder({ ...VITAMINS, on: false });

    expect(await h.stored()).toMatchObject([{ on: false }]);
  });

  it.each([
    [{ ...VITAMINS, text: ' ' }, 'noText'],
    [{ ...VITAMINS, text: 'x'.repeat(81) }, 'textTooLong'],
    [{ ...VITAMINS, time: '25:00' }, 'badTime'],
    [{ ...VITAMINS, days: [] }, 'noDays'],
    [{ text: 'x', time: '09:00', date: '2026-13-01' }, 'badDate'],
    [{ text: 'x', time: '09:00' }, 'daysOrDate'],
  ] as const)('refuses %j as %s and stores nothing', async (input, problem) => {
    const h = await setUp();

    await expect(h.service.addCustomReminder(input)).resolves.toEqual({
      ok: false,
      error: problem,
    });
    expect(h.service.problemWith(input)).toBe(problem);
    expect(await h.stored()).toEqual([]);
  });

  it('refuses a once reminder whose moment has passed, and keeps one later today', async () => {
    const h = await setUp();

    await expect(
      h.service.addCustomReminder({ text: 'Lunch call', time: '12:30', date: '2026-10-26' }),
    ).resolves.toEqual({ ok: false, error: 'past' });
    await expect(
      h.service.addCustomReminder({ text: 'Old', time: '09:00', date: '2026-10-25' }),
    ).resolves.toEqual({ ok: false, error: 'past' });
    expect(h.service.problemWith({ text: 'Later', time: '12:31', date: '2026-10-26' })).toBeNull();
    await expect(
      h.service.addCustomReminder({ text: 'Later', time: '12:31', date: '2026-10-26' }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('keeps at most 20, and says the list is full after that', async () => {
    const h = await setUp();
    for (let index = 0; index < CUSTOM_REMINDER_LIMIT; index += 1) {
      await h.service.addCustomReminder({ ...VITAMINS, text: `Reminder ${index}` });
    }

    await expect(h.service.addCustomReminder(VITAMINS)).resolves.toEqual({
      ok: false,
      error: 'full',
    });
    expect(await h.stored()).toHaveLength(CUSTOM_REMINDER_LIMIT);
  });

  it('never passes 20 when two adds race at 19', async () => {
    const h = await setUp();
    for (let index = 0; index < CUSTOM_REMINDER_LIMIT - 1; index += 1) {
      await h.service.addCustomReminder({ ...VITAMINS, text: `Reminder ${index}` });
    }

    const answers = await Promise.all([
      h.service.addCustomReminder({ ...VITAMINS, text: 'One' }),
      h.service.addCustomReminder({ ...VITAMINS, text: 'Two' }),
    ]);

    expect(answers.map((answer) => answer.ok).sort()).toEqual([false, true]);
    expect(await h.stored()).toHaveLength(CUSTOM_REMINDER_LIMIT);
  });
});

describe('changing, switching and deleting', () => {
  it('replaces a reminder in place, keeping its id and place', async () => {
    const h = await setUp();
    await h.service.addCustomReminder(VITAMINS);
    await h.service.addCustomReminder({ ...VITAMINS, text: 'Stretch' });

    const changed = await h.service.updateCustomReminder('reminder-1', {
      text: 'Vitamins with food',
      time: '13:00',
      days: ['mon', 'wed', 'fri'],
      on: false,
    });

    expect(changed).toEqual({
      ok: true,
      value: {
        id: 'reminder-1',
        text: 'Vitamins with food',
        time: '13:00',
        days: ['mon', 'wed', 'fri'],
        on: false,
      },
    });
    expect((await h.stored()).map((each) => each.text)).toEqual(['Vitamins with food', 'Stretch']);
  });

  it('refuses a change with a problem, or for a reminder that is gone', async () => {
    const h = await setUp();
    await h.service.addCustomReminder(VITAMINS);

    await expect(
      h.service.updateCustomReminder('reminder-1', { ...VITAMINS, days: [] }),
    ).resolves.toEqual({ ok: false, error: 'noDays' });
    await expect(h.service.updateCustomReminder('nope', VITAMINS)).resolves.toEqual({
      ok: false,
      error: 'notFound',
    });
    expect(await h.stored()).toMatchObject([{ text: 'Take vitamins', days: [...WEEKDAYS] }]);
  });

  it('switches one reminder', async () => {
    const h = await setUp();
    await h.service.addCustomReminder(VITAMINS);

    await expect(h.service.setCustomReminderOn('reminder-1', false)).resolves.toMatchObject({
      ok: true,
      value: { on: false },
    });
    expect(await h.stored()).toMatchObject([{ on: false }]);
    await expect(h.service.setCustomReminderOn('nope', true)).resolves.toEqual({
      ok: false,
      error: 'notFound',
    });
  });

  it('deletes one reminder, and says when there was none', async () => {
    const h = await setUp();
    await h.service.addCustomReminder(VITAMINS);
    await h.service.addCustomReminder({ ...VITAMINS, text: 'Stretch' });

    await expect(h.service.removeCustomReminder('reminder-1')).resolves.toBe(true);
    await expect(h.service.removeCustomReminder('reminder-1')).resolves.toBe(false);

    expect((await h.stored()).map((each) => each.id)).toEqual(['reminder-2']);
  });
});
