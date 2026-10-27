import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../data/settingsSchema';
import { makeFast } from '../../test/factories';
import { inTimeZone } from '../../test/time';
import { t, type TKey } from '../../i18n/t';
import type { MessageParams } from '../../i18n/message';
import { WEEKDAYS, type CustomReminder } from '../../domain/reminders/custom';
import {
  DAILY_REMINDERS,
  REMINDERS,
  REMINDER_SETTING,
  clockOn,
  customMessage,
  customNoticeId,
  due,
  fastGoalMessage,
  fixedMessage,
  lastAt,
  lastOccurrence,
  nextAt,
  nextOccurrence,
  planCustom,
  planDaily,
  planFastGoal,
  summaryMessage,
  summaryNumbers,
  timingKey,
  type DailyMarks,
  type ReminderMessage,
} from './schedule';

// Tests run in America/New_York (vite.config.ts): summer time starts 2026-03-08 at 02:00 and
// ends 2026-11-01 at 02:00.
const HOUR = 3_600_000;
const MINUTE = 60_000;

/** A local wall-clock time in the zone the test runs in. */
function local(text: string): number {
  return new Date(text).getTime();
}

function clockText(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A message as the notifier will write it. */
function render(key: TKey, params?: MessageParams): string {
  return (t as (key: string, params?: MessageParams) => string)(key, params);
}

function words(message: ReminderMessage): [string, string] {
  return [render(message.title), render(message.body, message.params)];
}

describe('nextAt (R06.11)', () => {
  it("takes today's time while it is ahead and tomorrow's once it has come", () => {
    const morning = local('2026-06-10T07:59:00');
    expect(nextAt('08:00', morning)).toBe(local('2026-06-10T08:00:00'));
    expect(nextAt('08:00', local('2026-06-10T08:00:00'))).toBe(local('2026-06-11T08:00:00'));
    expect(nextAt('08:00', local('2026-06-10T21:30:00'))).toBe(local('2026-06-11T08:00:00'));
  });

  it('gives 08:00 the morning after the March DST change in New York, 23 hours later, never 09:00', () => {
    const lastShown = local('2026-03-07T08:00:00');
    const next = nextAt('08:00', lastShown);
    expect(next).toBe(local('2026-03-08T08:00:00'));
    expect(next - lastShown).toBe(23 * HOUR);
    expect(clockText(next)).toBe('08:00');
    // Re-arming 24 hours after the last one would have landed at 09:00.
    expect(clockText(lastShown + 24 * HOUR)).toBe('09:00');
  });

  it('stays at 08:00 every day from March to November, through both changes, without drifting', () => {
    let at = local('2026-03-01T08:00:00');
    const end = local('2026-11-15T00:00:00');
    let days = 0;
    while (at < end) {
      at = nextAt('08:00', at);
      expect(clockText(at)).toBe('08:00');
      days += 1;
    }
    expect(days).toBe(259);
  });

  it('moves a time the day skips forward: 02:30 on the March change day is 03:30', () => {
    expect(clockOn('2026-03-08', '02:30')).toBe(local('2026-03-08T03:30:00'));
    expect(nextAt('02:30', local('2026-03-08T00:00:00'))).toBe(local('2026-03-08T03:30:00'));
    expect(nextAt('02:30', local('2026-03-08T04:00:00'))).toBe(local('2026-03-09T02:30:00'));
  });

  it('has the hour the November change repeats only once', () => {
    const first = nextAt('01:30', local('2026-11-01T00:00:00'));
    expect(first).toBe(Date.parse('2026-11-01T01:30:00-04:00'));
    // An hour later the clock reads 01:30 again; the next one is still tomorrow's.
    const again = nextAt('01:30', first + 45 * MINUTE);
    expect(again).toBe(local('2026-11-02T01:30:00'));
    expect(again - first).toBe(25 * HOUR);
  });

  it('follows the zone it runs in: 08:00 across the change in Berlin', () => {
    inTimeZone('Europe/Berlin', () => {
      const lastShown = Date.parse('2026-03-28T08:00:00+01:00');
      const next = nextAt('08:00', lastShown);
      expect(next).toBe(Date.parse('2026-03-29T08:00:00+02:00'));
      expect(next - lastShown).toBe(23 * HOUR);
    });
  });

  it('refuses a time that is not HH:MM', () => {
    expect(() => nextAt('8:00', 0)).toThrow(RangeError);
    expect(() => nextAt('24:00', 0)).toThrow(RangeError);
  });
});

describe('lastAt', () => {
  it("is today's time once it has come, else yesterday's", () => {
    expect(lastAt('12:00', local('2026-06-10T12:00:00'))).toBe(local('2026-06-10T12:00:00'));
    expect(lastAt('12:00', local('2026-06-10T11:59:00'))).toBe(local('2026-06-09T12:00:00'));
  });
});

describe('due', () => {
  const lunch = [{ id: 'lunch', at: '12:00' }] as const;

  it('lists a reminder once when its time passed since it was dealt with (ACC-J11-2)', () => {
    const closed = { lunch: { at: '12:00', since: local('2026-06-10T11:00:00') } };
    const reopened = local('2026-06-10T15:00:00');
    expect(due(lunch, closed, reopened)).toEqual([
      { id: 'lunch', dueAt: local('2026-06-10T12:00:00') },
    ]);
    // Once dealt with at 15:00 it is not due again that day.
    const after = planDaily(lunch, closed, reopened).marks;
    expect(due(lunch, after, local('2026-06-10T23:59:00'))).toEqual([]);
  });

  it('lists it once however many days the app stayed closed', () => {
    const closed = { lunch: { at: '12:00', since: local('2026-06-01T09:00:00') } };
    expect(due(lunch, closed, local('2026-06-10T15:00:00'))).toEqual([
      { id: 'lunch', dueAt: local('2026-06-10T12:00:00') },
    ]);
  });

  it('shows nothing for a reminder turned on after its time today', () => {
    // No mark yet: it starts counting from now.
    expect(due(lunch, {}, local('2026-06-10T15:00:00'))).toEqual([]);
  });

  it('drops a reminder missed on an earlier day: no lunch reminder the next morning', () => {
    const closed = { lunch: { at: '12:00', since: local('2026-06-09T11:00:00') } };
    expect(due(lunch, closed, local('2026-06-10T07:00:00'))).toEqual([]);
  });

  it('starts again from now when the time was changed', () => {
    // Lunch moved from 13:00 to 10:00 at 11:00: 10:00 has passed but was never counted.
    const marks = { lunch: { at: '13:00', since: local('2026-06-10T08:00:00') } };
    const moved = [{ id: 'lunch', at: '10:00' }] as const;
    expect(due(moved, marks, local('2026-06-10T11:00:00'))).toEqual([]);
  });
});

describe('planDaily', () => {
  it('marks every reminder that is on up to now and wakes for the earliest next time', () => {
    const now = local('2026-06-10T13:00:00');
    const plan = planDaily(
      [
        { id: 'dinner', at: '19:00' },
        { id: 'water', at: '14:00' },
        { id: 'breakfast', at: '08:00' },
      ],
      {},
      now,
    );
    expect(plan.marks).toEqual({
      dinner: { at: '19:00', since: now },
      water: { at: '14:00', since: now },
      breakfast: { at: '08:00', since: now },
    });
    expect(plan.wakeAt).toBe(local('2026-06-10T14:00:00'));
    expect(plan.due).toEqual([]);
  });

  it('forgets the marks of reminders that are off and has nothing to wake for when none is on', () => {
    const marks: DailyMarks = {
      lunch: { at: '12:00', since: 1 },
      water: { at: '14:00', since: 1 },
    };
    const plan = planDaily([], marks, local('2026-06-10T13:00:00'));
    expect(plan).toEqual({ due: [], marks: {}, wakeAt: null });
  });
});

describe('the reminder list (D-16.41)', () => {
  it('has breakfast, lunch, dinner, the summary, water and the fasting goal, and no streak or food-log reminder (R06.12)', () => {
    expect(REMINDERS).toEqual(['breakfast', 'lunch', 'dinner', 'summary', 'water', 'fastGoal']);
    expect(REMINDERS.some((id) => /streak|log|weigh|fat/i.test(id))).toBe(false);
  });

  it('starts every reminder off, at 08:00, 12:00, 19:00, 20:00 and 14:00 (D-16.61, D-16.40)', () => {
    const settings = defaultSettings({ locale: 'en-US' });
    const defaults = DAILY_REMINDERS.map((id) => settings[REMINDER_SETTING[id]]);
    expect(defaults).toEqual([
      { on: false, at: '08:00' },
      { on: false, at: '12:00' },
      { on: false, at: '19:00' },
      { on: false, at: '20:00' },
      { on: false, at: '14:00' },
    ]);
    expect(settings['remind.master']).toBe(false);
    expect(settings['remind.fastGoal']).toBe(false);
  });
});

describe('planFastGoal (R05.20)', () => {
  const start = local('2026-06-10T20:00:00');
  const goal = local('2026-06-11T12:00:00');
  const running = makeFast({ id: 'fast-1', start, end: null, goalMin: 960 });

  it('arms a running fast for start + goal while that is ahead', () => {
    expect(planFastGoal(running, null, start + MINUTE)).toEqual({
      dueAt: null,
      mark: { fast: 'fast-1', goalAt: goal, done: false },
      wakeAt: goal,
    });
  });

  it('falls due once at the goal, then stays done', () => {
    const armed = { fast: 'fast-1', goalAt: goal, done: false };
    expect(planFastGoal(running, armed, goal - 1)).toEqual({
      dueAt: null,
      mark: armed,
      wakeAt: goal,
    });
    const reached = planFastGoal(running, armed, goal);
    expect(reached).toEqual({ dueAt: goal, mark: { ...armed, done: true }, wakeAt: null });
    expect(planFastGoal(running, reached.mark, goal + HOUR).dueAt).toBeNull();
  });

  it('never alerts for a fast first seen after its goal: the goal time must be ahead', () => {
    expect(planFastGoal(running, null, goal + MINUTE)).toEqual({
      dueAt: null,
      mark: { fast: 'fast-1', goalAt: goal, done: true },
      wakeAt: null,
    });
  });

  it('drops the mark when the fast ended, was cancelled or deleted', () => {
    const armed = { fast: 'fast-1', goalAt: goal, done: false };
    const ended = { ...running, end: goal - HOUR };
    expect(planFastGoal(ended, armed, goal + MINUTE)).toEqual({
      dueAt: null,
      mark: null,
      wakeAt: null,
    });
    expect(planFastGoal(null, armed, goal + MINUTE)).toEqual({
      dueAt: null,
      mark: null,
      wakeAt: null,
    });
  });

  it('re-arms for the new goal after an edit, and marks it done when the new goal has passed', () => {
    const armed = { fast: 'fast-1', goalAt: goal, done: false };
    const longer = { ...running, goalMin: 18 * 60 };
    expect(planFastGoal(longer, armed, goal + MINUTE)).toEqual({
      dueAt: null,
      mark: { fast: 'fast-1', goalAt: goal + 2 * HOUR, done: false },
      wakeAt: goal + 2 * HOUR,
    });
    const startedEarlier = { ...running, start: start - 4 * HOUR };
    expect(planFastGoal(startedEarlier, armed, goal - HOUR)).toEqual({
      dueAt: null,
      mark: { fast: 'fast-1', goalAt: goal - 4 * HOUR, done: true },
      wakeAt: null,
    });
  });

  it('treats a new fast as new, even with the same goal time', () => {
    const done = { fast: 'fast-0', goalAt: goal, done: true };
    expect(planFastGoal(running, done, start).mark).toEqual({
      fast: 'fast-1',
      goalAt: goal,
      done: false,
    });
  });
});

describe('the daily summary', () => {
  it('reads eaten 6 276 of 8 368 kJ with 2 092 left', () => {
    expect(summaryNumbers(1_500, 2_000, 'kJ')).toEqual({ eaten: 6_276, goal: 8_368, left: 2_092 });
    const message = summaryMessage({ eatenKcal: 1_500, goalKcal: 2_000 }, 'kJ');
    expect(words(message)).toEqual(['Your day so far', 'Eaten 6,276 of 8,368 kJ, 2,092 left.']);
  });

  it('converts to kJ before subtracting, so the three numbers add up', () => {
    // 1 800 kcal is 7 531 kJ and 1 020 kcal is 4 268 kJ; the 780 kcal between them would be 3 264.
    expect(summaryNumbers(1_020, 1_800, 'kJ')).toEqual({ eaten: 4_268, goal: 7_531, left: 3_263 });
  });

  it('reads kcal as stored and never has less than 0 left', () => {
    expect(words(summaryMessage({ eatenKcal: 1_240, goalKcal: 2_000 }, 'kcal'))[1]).toBe(
      'Eaten 1,240 of 2,000 kcal, 760 left.',
    );
    expect(summaryNumbers(2_350, 2_000, 'kcal')).toEqual({ eaten: 2_350, goal: 2_000, left: 0 });
  });

  it('says what was eaten when there is no goal, and a plain line when the day could not be read', () => {
    expect(words(summaryMessage({ eatenKcal: 500, goalKcal: null }, 'kJ'))[1]).toBe(
      'Eaten 2,092 kJ today.',
    );
    expect(words(summaryMessage({ eatenKcal: 500, goalKcal: 0 }, 'kcal'))[1]).toBe(
      'Eaten 500 kcal today.',
    );
    expect(words(summaryMessage(null, 'kcal'))[1]).toBe('Open Platewise to see how today adds up.');
  });
});

describe('notice words', () => {
  it('gives the meal and water reminders a title and a body from the catalogue', () => {
    expect(words(fixedMessage('breakfast'))).toEqual(['Breakfast', 'Time to log your breakfast.']);
    expect(words(fixedMessage('lunch'))).toEqual(['Lunch', 'Time to log your lunch.']);
    expect(words(fixedMessage('dinner'))).toEqual(['Dinner', 'Time to log your dinner.']);
    expect(words(fixedMessage('water'))[0]).toBe('Water');
  });

  it("names the fasting goal's length and says the fast keeps running", () => {
    expect(words(fastGoalMessage(990))).toEqual([
      'Fasting goal met',
      '16h 30m done. Your fast keeps running until you end it.',
    ]);
  });
});

describe('reminders the person wrote (P13, D-16.93)', () => {
  // Monday 26 October 2026.
  const MONDAY = '2026-10-26';
  const weekdays: CustomReminder = {
    id: 'gym',
    text: 'Gym bag',
    time: '07:00',
    days: ['mon', 'wed', 'fri'],
    on: true,
  };
  const daily: CustomReminder = { ...weekdays, id: 'pills', text: 'Pills', days: WEEKDAYS };
  const dentist: CustomReminder = {
    id: 'dentist',
    text: 'Dentist',
    time: '10:15',
    date: '2026-10-28',
    on: true,
  };

  it('comes next on its next weekday at its time, a week on once the last one passed', () => {
    expect(nextOccurrence(weekdays, local(`${MONDAY}T06:59:00`))).toBe(local(`${MONDAY}T07:00:00`));
    expect(nextOccurrence(weekdays, local(`${MONDAY}T07:00:00`))).toBe(
      local('2026-10-28T07:00:00'),
    );
    expect(nextOccurrence(weekdays, local('2026-10-30T08:00:00'))).toBe(
      local('2026-11-02T07:00:00'),
    );
    const mondaysOnly = { ...weekdays, days: ['mon'] as const };
    expect(nextOccurrence(mondaysOnly, local(`${MONDAY}T08:00:00`))).toBe(
      local('2026-11-02T07:00:00'),
    );
    expect(nextOccurrence(daily, local(`${MONDAY}T08:00:00`))).toBe(local('2026-10-27T07:00:00'));
  });

  it('keeps its wall-clock time across the November DST change', () => {
    const next = nextOccurrence(daily, local('2026-10-31T08:00:00'))!;
    expect(next).toBe(local('2026-11-01T07:00:00'));
    expect(clockText(next)).toBe('07:00');
  });

  it('comes once on its date, and never after it', () => {
    expect(nextOccurrence(dentist, local(`${MONDAY}T12:00:00`))).toBe(local('2026-10-28T10:15:00'));
    expect(nextOccurrence(dentist, local('2026-10-28T10:15:00'))).toBeNull();
    expect(lastOccurrence(dentist, local('2026-10-28T10:14:00'))).toBeNull();
    expect(lastOccurrence(dentist, local('2026-10-29T09:00:00'))).toBe(
      local('2026-10-28T10:15:00'),
    );
  });

  it('came last on its latest weekday at or before now', () => {
    expect(lastOccurrence(weekdays, local(`${MONDAY}T07:00:00`))).toBe(local(`${MONDAY}T07:00:00`));
    expect(lastOccurrence(weekdays, local('2026-10-27T12:00:00'))).toBe(
      local(`${MONDAY}T07:00:00`),
    );
    expect(lastOccurrence(weekdays, local(`${MONDAY}T06:00:00`))).toBe(
      local('2026-10-23T07:00:00'),
    );
  });

  it('is due once when its time passed since it was counted, today only', () => {
    const counted = planCustom([weekdays], {}, local(`${MONDAY}T06:00:00`));
    // Nothing is due for a reminder seen for the first time.
    expect(counted.due).toEqual([]);
    expect(counted.wakeAt).toBe(local(`${MONDAY}T07:00:00`));

    const at7 = planCustom([weekdays], counted.marks, local(`${MONDAY}T07:00:00`));
    expect(at7.due).toEqual([{ id: 'gym', text: 'Gym bag', dueAt: local(`${MONDAY}T07:00:00`) }]);
    expect(at7.wakeAt).toBe(local('2026-10-28T07:00:00'));

    // Dealt with: not again the same day.
    expect(planCustom([weekdays], at7.marks, local(`${MONDAY}T09:00:00`)).due).toEqual([]);
    // Tuesday is not one of its days; Wednesday's comes after a check before it.
    const tuesday = planCustom([weekdays], at7.marks, local('2026-10-27T07:30:00'));
    expect(tuesday.due).toEqual([]);
    // Missed for a day: Monday's is not shown on Tuesday.
    expect(planCustom([weekdays], counted.marks, local('2026-10-27T07:30:00')).due).toEqual([]);
  });

  it('starts counting again when its timing changes, and forgets reminders that are off', () => {
    const counted = planCustom([weekdays, dentist], {}, local(`${MONDAY}T06:00:00`));
    expect(Object.keys(counted.marks)).toEqual(['gym', 'dentist']);
    expect(counted.marks.gym!.key).toBe(timingKey(weekdays));

    const moved = { ...weekdays, time: '06:30' };
    expect(planCustom([moved], counted.marks, local(`${MONDAY}T06:45:00`)).due).toEqual([]);
    expect(Object.keys(planCustom([], counted.marks, local(`${MONDAY}T06:45:00`)).marks)).toEqual(
      [],
    );
  });

  it('shows a once reminder on its date, once', () => {
    const counted = planCustom([dentist], {}, local(`${MONDAY}T12:00:00`));
    expect(counted.wakeAt).toBe(local('2026-10-28T10:15:00'));
    const shown = planCustom([dentist], counted.marks, local('2026-10-28T10:15:00'));
    expect(shown.due).toMatchObject([{ id: 'dentist', dueAt: local('2026-10-28T10:15:00') }]);
    expect(shown.wakeAt).toBeNull();
    expect(planCustom([dentist], shown.marks, local('2026-10-28T11:00:00')).due).toEqual([]);
  });

  it("says the person's own words under a plain title", () => {
    expect(words(customMessage('Gym bag'))).toEqual(['Reminder', 'Gym bag']);
    expect(customNoticeId('gym')).toBe('custom-gym');
  });
});
