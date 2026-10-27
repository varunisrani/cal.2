import { describe, expect, it } from 'vitest';
import {
  CUSTOM_REMINDER_LIMIT,
  CUSTOM_TEXT_MAX,
  WEEKDAYS,
  checkCustomReminder,
  readCustomReminders,
  tidyText,
  weekdayOf,
  type CustomReminderInput,
} from './custom';

const DAILY: CustomReminderInput = { text: 'Take vitamins', time: '08:30', days: WEEKDAYS };

function stored(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    text: `Reminder ${index}`,
    time: '09:00',
    days: ['mon'],
    on: true,
  }));
}

describe('checkCustomReminder (D-16.93)', () => {
  it('keeps a reminder on its weekdays, on unless said otherwise', () => {
    expect(checkCustomReminder(DAILY)).toEqual({
      ok: true,
      value: { text: 'Take vitamins', time: '08:30', days: [...WEEKDAYS], on: true },
    });
    expect(checkCustomReminder({ ...DAILY, on: false })).toMatchObject({ value: { on: false } });
  });

  it('keeps a reminder once on a date', () => {
    expect(
      checkCustomReminder({ text: 'Dentist', time: '10:15', date: '2026-11-03', on: true }),
    ).toEqual({
      ok: true,
      value: { text: 'Dentist', time: '10:15', date: '2026-11-03', on: true },
    });
  });

  it('tidies the text: trimmed, runs of spaces and line breaks made one space', () => {
    expect(tidyText('  Stretch\n\n and   breathe \t')).toBe('Stretch and breathe');
    expect(checkCustomReminder({ ...DAILY, text: ' Walk\nafter lunch ' })).toMatchObject({
      value: { text: 'Walk after lunch' },
    });
  });

  it('needs 1 to 80 characters of text, counting an emoji as one', () => {
    expect(checkCustomReminder({ ...DAILY, text: '' })).toEqual({ ok: false, problem: 'noText' });
    expect(checkCustomReminder({ ...DAILY, text: ' \n ' })).toEqual({
      ok: false,
      problem: 'noText',
    });
    expect(checkCustomReminder({ ...DAILY, text: 'a'.repeat(CUSTOM_TEXT_MAX) }).ok).toBe(true);
    expect(checkCustomReminder({ ...DAILY, text: 'a'.repeat(CUSTOM_TEXT_MAX + 1) })).toEqual({
      ok: false,
      problem: 'textTooLong',
    });
    // 80 apples are 160 UTF-16 units but 80 characters.
    expect(checkCustomReminder({ ...DAILY, text: '🍎'.repeat(CUSTOM_TEXT_MAX) }).ok).toBe(true);
  });

  it.each(['8:30', '24:00', '12:60', '', 'noon'])('refuses the time %j', (time) => {
    expect(checkCustomReminder({ ...DAILY, time })).toEqual({ ok: false, problem: 'badTime' });
  });

  it('needs at least one real weekday, and keeps them once each, Monday first', () => {
    expect(checkCustomReminder({ ...DAILY, days: [] })).toEqual({ ok: false, problem: 'noDays' });
    expect(checkCustomReminder({ ...DAILY, days: ['mon', 'funday' as never] })).toEqual({
      ok: false,
      problem: 'noDays',
    });
    expect(checkCustomReminder({ ...DAILY, days: ['sun', 'wed', 'mon', 'wed'] })).toMatchObject({
      value: { days: ['mon', 'wed', 'sun'] },
    });
  });

  it('needs days or a date, not both and not neither', () => {
    expect(checkCustomReminder({ text: 'x', time: '09:00' })).toEqual({
      ok: false,
      problem: 'daysOrDate',
    });
    expect(checkCustomReminder({ ...DAILY, date: '2026-11-03' })).toEqual({
      ok: false,
      problem: 'daysOrDate',
    });
  });

  it.each(['2026-02-30', '03/11/2026', ''])('refuses the date %j', (date) => {
    expect(checkCustomReminder({ text: 'x', time: '09:00', date })).toEqual({
      ok: false,
      problem: 'badDate',
    });
  });

  it('reports the first problem in the order the form shows its fields', () => {
    expect(checkCustomReminder({ text: '', time: 'x', days: [] })).toEqual({
      ok: false,
      problem: 'noText',
    });
    expect(checkCustomReminder({ text: 'x', time: 'x', days: [] })).toEqual({
      ok: false,
      problem: 'badTime',
    });
  });
});

describe('readCustomReminders (the remind.custom setting)', () => {
  it('reads a stored list back, tidying the weekday order', () => {
    const list = [
      { id: 'a', text: 'Vitamins', time: '08:30', days: ['fri', 'mon'], on: true },
      { id: 'b', text: 'Dentist', time: '10:15', date: '2026-11-03', on: false },
    ];
    expect(readCustomReminders(list)).toEqual([
      { id: 'a', text: 'Vitamins', time: '08:30', days: ['mon', 'fri'], on: true },
      { id: 'b', text: 'Dentist', time: '10:15', date: '2026-11-03', on: false },
    ]);
    expect(readCustomReminders([])).toEqual([]);
  });

  it('keeps up to the limit and refuses a longer list', () => {
    expect(readCustomReminders(stored(CUSTOM_REMINDER_LIMIT))).toHaveLength(CUSTOM_REMINDER_LIMIT);
    expect(readCustomReminders(stored(CUSTOM_REMINDER_LIMIT + 1))).toBeUndefined();
  });

  it('refuses the whole list over one unusable reminder, so nothing is dropped unseen', () => {
    const good = stored(2);
    expect(readCustomReminders('[]')).toBeUndefined();
    expect(readCustomReminders([...good, { ...good[0], id: 'c', time: '9:00' }])).toBeUndefined();
    expect(readCustomReminders([...good, { ...good[0], id: 'c', on: 'yes' }])).toBeUndefined();
    expect(readCustomReminders([...good, { ...good[0], id: '' }])).toBeUndefined();
    expect(readCustomReminders([...good, { ...good[0], id: 'c', days: 'mon' }])).toBeUndefined();
    expect(
      readCustomReminders([...good, { ...good[0], id: 'c', date: '2026-11-03' }]),
    ).toBeUndefined();
    // A text the form would have tidied was not written by this app.
    expect(readCustomReminders([{ ...good[0], text: ' padded ' }])).toBeUndefined();
    // Two reminders under one id.
    expect(readCustomReminders([good[0], { ...good[1], id: good[0]!.id }])).toBeUndefined();
  });
});

describe('weekdayOf', () => {
  it('names the weekday of a calendar day', () => {
    expect(weekdayOf('2026-10-26')).toBe('mon');
    expect(weekdayOf('2026-11-01')).toBe('sun');
    expect(weekdayOf('1970-01-01')).toBe('thu');
    expect(weekdayOf('1969-12-28')).toBe('sun');
    expect(weekdayOf('2024-02-29')).toBe('thu');
  });
});
