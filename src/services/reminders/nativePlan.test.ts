import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../data/settingsSchema';
import { dayNumberOf } from '../../domain/dates/dayKey';
import { WEEKDAYS, type CustomReminder } from '../../domain/reminders/custom';
import { makeFast } from '../../test/factories';
import { REMINDER_SETTING_KEYS, type ReminderSettings } from './engine';
import { NOTICE_KINDS } from '../../domain/reminders/notices';
import { NOTICE_BASE_ID } from '../notifications/notices';
import {
  CHANNEL_ID,
  CHECK_IN_IDS,
  NATIVE_IDS,
  channelOf,
  SMALL_ICON,
  SUMMARY_DAYS,
  checkInIds,
  customBaseIds,
  immediateRequest,
  nativePlan,
  summaryDays,
  summaryId,
  systemWeekday,
  type NativePlanInput,
  type NativeRequest,
  type NudgeFacts,
} from './nativePlan';
import { writeMessage } from './notifier';
import { DAY_SLOTS, NUDGE_IDS } from './nudgePlan';
import type { DayTotals } from './schedule';

// Tests run in America/New_York. Monday 26 October 2026, 12:30.
const NOW = new Date('2026-10-26T12:30:00').getTime();
const MINUTE = 60_000;

function local(text: string): number {
  return new Date(text).getTime();
}

/** The stored reminder settings with the notifications switch on and every reminder off. */
function stored(changes: Partial<ReminderSettings> = {}): ReminderSettings {
  const all = defaultSettings({ locale: 'en-US' });
  const picked: Partial<Record<keyof ReminderSettings, unknown>> = {};
  for (const key of REMINDER_SETTING_KEYS) picked[key] = all[key];
  return { ...(picked as ReminderSettings), 'remind.master': true, ...changes };
}

function plan(settings: ReminderSettings, input: Partial<NativePlanInput> = {}): NativeRequest[] {
  return nativePlan(
    { settings, permitted: true, fast: null, totals: new Map(), now: NOW, ...input },
    writeMessage,
  );
}

function byId(list: readonly NativeRequest[]): Map<number, NativeRequest> {
  return new Map(list.map((each) => [each.id, each]));
}

const gym: CustomReminder = {
  id: 'gym',
  text: 'Gym bag',
  time: '07:05',
  days: ['mon', 'wed', 'fri'],
  on: true,
};

describe('nativePlan (D-16.92)', () => {
  it('hands over nothing while the switch is off or Android does not allow notifications', () => {
    const on = stored({ 'remind.breakfast': { on: true, at: '08:00' } });
    expect(plan(on)).toHaveLength(1);
    expect(plan({ ...on, 'remind.master': false })).toEqual([]);
    expect(plan(on, { permitted: false })).toEqual([]);
  });

  it('repeats meals and water every day at their wall-clock time, opening Home', () => {
    const list = plan(
      stored({
        'remind.breakfast': { on: true, at: '07:30' },
        'remind.lunch': { on: true, at: '12:15' },
        'remind.dinner': { on: false, at: '19:00' },
        'remind.water': { on: true, at: '14:00' },
        'water.on': true,
      }),
    );

    expect(list).toEqual([
      {
        id: NATIVE_IDS.breakfast,
        title: 'Breakfast',
        body: 'Time to log your breakfast.',
        schedule: { on: { hour: 7, minute: 30 }, allowWhileIdle: true },
        smallIcon: SMALL_ICON,
        channelId: CHANNEL_ID,
        extra: { open: 'home', key: expect.any(String) },
      },
      expect.objectContaining({
        id: NATIVE_IDS.lunch,
        schedule: { on: { hour: 12, minute: 15 }, allowWhileIdle: true },
      }),
      expect.objectContaining({
        id: NATIVE_IDS.water,
        title: 'Water',
        schedule: { on: { hour: 14, minute: 0 }, allowWhileIdle: true },
      }),
    ]);
  });

  it('leaves water out while water is not tracked', () => {
    expect(plan(stored({ 'remind.water': { on: true, at: '14:00' } }))).toEqual([]);
  });

  it("hands the summary over as its next 7 days, each with that day's numbers", () => {
    const settings = stored({ 'remind.summary': { on: true, at: '20:00' } });
    const days = summaryDays('20:00', NOW);
    expect(days[0]).toBe('2026-10-26');
    expect(days).toHaveLength(SUMMARY_DAYS);
    const totals = new Map<string, DayTotals | null>([
      ['2026-10-26', { eatenKcal: 1_200, goalKcal: 2_000 }],
      ['2026-10-27', { eatenKcal: 0, goalKcal: 2_000 }],
    ]);

    const list = plan(settings, { totals });

    expect(list).toHaveLength(SUMMARY_DAYS);
    expect(list.map((each) => each.schedule)).toEqual(
      days.map((day) => ({ at: new Date(local(`${day}T20:00:00`)), allowWhileIdle: true })),
    );
    expect(list[0]).toMatchObject({
      id: summaryId('2026-10-26'),
      title: 'Your day so far',
      body: 'Eaten 1,200 of 2,000 kcal, 800 left.',
      extra: { open: 'home' },
    });
    expect(list[1]!.body).toBe('Eaten 0 of 2,000 kcal, 2,000 left.');
    // A day whose numbers could not be read says so plainly.
    expect(list[2]!.body).toBe('Open Platewise to see how today adds up.');
    expect(new Set(list.map((each) => each.id)).size).toBe(SUMMARY_DAYS);
  });

  it("starts the summary tomorrow once today's time has passed, never reusing today's id", () => {
    const evening = local('2026-10-26T20:00:00');
    const days = summaryDays('20:00', evening);
    expect(days[0]).toBe('2026-10-27');

    const list = plan(stored({ 'remind.summary': { on: true, at: '20:00' } }), { now: evening });
    // Today's notification may still be in the shade: none of the next 7 takes its id.
    expect(list.map((each) => each.id)).not.toContain(summaryId('2026-10-26'));
    expect(summaryId('2026-10-26')).toBe(NATIVE_IDS.summary + (dayNumberOf('2026-10-26') % 8));
  });

  it('hands over the fasting goal once at start + goal, opening the fast, in its own channel (P17)', () => {
    const fast = makeFast({ start: NOW - 10 * 60 * MINUTE, goalMin: 16 * 60, end: null });
    const settings = stored({ 'fasting.on': true, 'remind.fastGoal': true });

    expect(plan(settings, { fast })).toEqual([
      expect.objectContaining({
        id: NATIVE_IDS.fastGoal,
        title: 'Fasting goal met',
        body: '16h done. Your fast keeps running until you end it.',
        schedule: { at: new Date(NOW + 6 * 60 * MINUTE), allowWhileIdle: true },
        channelId: channelOf('fastGoal'),
        extra: { open: 'fast', key: expect.any(String), kind: 'fastGoal' },
      }),
    ]);
  });

  it('leaves the fasting goal out once it has passed, for an ended fast, or while it is not wanted', () => {
    const settings = stored({ 'fasting.on': true, 'remind.fastGoal': true });
    const running = makeFast({ start: NOW - 60 * MINUTE, goalMin: 16 * 60, end: null });

    expect(plan(settings, { fast: { ...running, start: NOW - 17 * 60 * MINUTE } })).toEqual([]);
    expect(plan(settings, { fast: { ...running, end: NOW } })).toEqual([]);
    expect(plan({ ...settings, 'fasting.on': false }, { fast: running })).toEqual([]);
    expect(plan({ ...settings, 'remind.fastGoal': false }, { fast: running })).toEqual([]);
  });

  it('repeats a written reminder weekly on each of its days', () => {
    const list = plan(stored({ 'remind.custom': [gym] }));
    const base = customBaseIds([gym]).get('gym')!;

    expect(list).toEqual(
      [2, 4, 6].map((weekday) =>
        expect.objectContaining({
          id: base + weekday,
          title: 'Reminder',
          body: 'Gym bag',
          schedule: { on: { hour: 7, minute: 5, weekday }, allowWhileIdle: true },
          extra: { open: 'home', key: expect.any(String) },
        }),
      ),
    );
  });

  it('repeats one on all seven days as one daily notification', () => {
    expect(plan(stored({ 'remind.custom': [{ ...gym, days: WEEKDAYS }] }))).toEqual([
      expect.objectContaining({
        id: customBaseIds([gym]).get('gym'),
        schedule: { on: { hour: 7, minute: 5 }, allowWhileIdle: true },
      }),
    ]);
  });

  it('hands over a once reminder at its moment, and nothing once it has passed', () => {
    const dentist: CustomReminder = {
      id: 'dentist',
      text: 'Dentist',
      time: '10:15',
      date: '2026-10-28',
      on: true,
    };
    expect(plan(stored({ 'remind.custom': [dentist] }))).toEqual([
      expect.objectContaining({
        body: 'Dentist',
        schedule: { at: new Date(local('2026-10-28T10:15:00')), allowWhileIdle: true },
      }),
    ]);
    expect(
      plan(stored({ 'remind.custom': [dentist] }), { now: local('2026-10-28T10:15:00') }),
    ).toEqual([]);
  });

  it('leaves out written reminders that are off', () => {
    expect(plan(stored({ 'remind.custom': [{ ...gym, on: false }] }))).toEqual([]);
  });

  it("gives every notification its own id, and keeps a reminder's ids when another is deleted", () => {
    const list: CustomReminder[] = Array.from({ length: 20 }, (_, index) => ({
      ...gym,
      id: `reminder-${index}`,
      days: WEEKDAYS.slice(0, 6),
    }));
    const settings = stored({
      'remind.breakfast': { on: true, at: '08:00' },
      'remind.summary': { on: true, at: '20:00' },
      'remind.custom': list,
    });

    const all = plan(settings);
    expect(all).toHaveLength(1 + SUMMARY_DAYS + 20 * 6);
    expect(new Set(all.map((each) => each.id)).size).toBe(all.length);
    expect(all.every((each) => each.id > 0 && each.id < 2 ** 31)).toBe(true);

    const before = byId(all);
    const after = plan({ ...settings, 'remind.custom': list.slice(1) });
    for (const each of after) expect(before.get(each.id)).toEqual(each);
  });

  it("changes a notification's key when its time or words change, and only then", () => {
    const at = (time: string) =>
      plan(stored({ 'remind.lunch': { on: true, at: time } }))[0]!.extra.key;
    expect(at('12:00')).toBe(at('12:00'));
    expect(at('12:00')).not.toBe(at('12:30'));
    const words = (text: string) =>
      plan(stored({ 'remind.custom': [{ ...gym, text }] }))[0]!.extra.key;
    expect(words('Gym bag')).not.toBe(words('Gym bag and towel'));
  });

  it("numbers weekdays the plugin's way: Sunday 1 to Saturday 7", () => {
    expect(WEEKDAYS.map(systemWeekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
  });

  it('makes the goal-weight alert a notification shown at once', () => {
    expect(immediateRequest(NATIVE_IDS.goalReached, 'Goal weight reached', 'Well done')).toEqual({
      id: NATIVE_IDS.goalReached,
      title: 'Goal weight reached',
      body: 'Well done',
      smallIcon: SMALL_ICON,
      channelId: CHANNEL_ID,
      extra: { open: 'home', key: expect.any(String) },
    });
  });
});

describe('nativePlan with the nudges (P17-01, D-16.100)', () => {
  const facts = (lunchToday = false): NudgeFacts => ({
    days: new Map([
      ['2026-10-26', { meals: lunchToday ? ['lunch'] : [], waterMl: 0, any: lunchToday }],
    ]),
    usual: {},
    lastWeighIn: null,
  });
  const meals = stored({
    'remind.lunch': { on: true, at: '13:00' },
    'notify.off': ['mealCheck', 'waterPace', 'emptyDay', 'weighIn'],
  });

  it('plans meal reminders day by day while Only if I haven’t logged it is on, taking back a logged day', () => {
    const open = plan(meals, { nudges: facts() });
    expect(open.map((each) => each.id)).not.toContain(NATIVE_IDS.lunch);
    expect(open).toHaveLength(7);
    expect(open[0]).toMatchObject({
      title: 'Lunch',
      schedule: { at: new Date(local('2026-10-26T13:00:00')), allowWhileIdle: true },
    });

    const logged = plan(meals, { nudges: facts(true) });
    expect(logged).toHaveLength(6);
    expect(logged[0]!.schedule).toEqual({
      at: new Date(local('2026-10-27T13:00:00')),
      allowWhileIdle: true,
    });
  });

  it('keeps the daily repeating meal reminder while it is off, or without the facts', () => {
    const daily = {
      id: NATIVE_IDS.lunch,
      schedule: { on: { hour: 13, minute: 0 }, allowWhileIdle: true },
    };
    expect(plan({ ...meals, 'notify.onlyIfNotLogged': false }, { nudges: facts(true) })).toEqual([
      expect.objectContaining(daily),
    ]);
    expect(plan(meals)).toEqual([expect.objectContaining(daily)]);
  });

  it('plans nudges without the reminders’ switch, but never without Android’s permission', () => {
    const nudgesOnly = stored({
      'remind.master': false,
      'notify.off': ['waterPace', 'emptyDay', 'weighIn'],
    });
    const list = plan(nudgesOnly, { nudges: facts() });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((each) => each.extra.kind === 'mealCheck')).toBe(true);
    expect(plan(nudgesOnly, { nudges: facts(), permitted: false })).toEqual([]);
  });

  it('holds the fasting goal until 07:00 when it would come in quiet hours', () => {
    const fast = makeFast({ start: local('2026-10-26T08:00:00'), goalMin: 16 * 60, end: null });
    const settings = stored({ 'fasting.on': true, 'remind.fastGoal': true });
    expect(plan(settings, { fast })[0]!.schedule).toEqual({
      at: new Date(local('2026-10-27T07:00:00')),
      allowWhileIdle: true,
    });
    expect(plan({ ...settings, 'notify.quiet': false }, { fast })[0]!.schedule).toEqual({
      at: new Date(local('2026-10-27T00:00:00')),
      allowWhileIdle: true,
    });
  });
});

describe('nativePlan: the Coach’s check-ins (P17-03, D-16.102)', () => {
  const checkIn = (id: string, at: string, chatId = 'chat-1') => ({
    id,
    chatId,
    at: local(at),
    text: `Check-in ${id}`,
  });

  it('plans each waiting check-in once at its time, in its own channel, opening its chat', () => {
    const list = plan(
      stored({
        'remind.master': false,
        'coach.checkIns': [checkIn('a', '2026-10-29T19:00:00', 'chat-7')],
      }),
    );

    expect(list).toEqual([
      {
        id: checkInIds([checkIn('a', '2026-10-29T19:00:00')]).get('a'),
        title: 'Coach check-in',
        body: 'Check-in a',
        schedule: { at: new Date(local('2026-10-29T19:00:00')), allowWhileIdle: true },
        smallIcon: SMALL_ICON,
        channelId: channelOf('coachCheckIn'),
        extra: {
          open: { coachChat: 'chat-7' },
          key: expect.any(String) as unknown as string,
          kind: 'coachCheckIn',
        },
      },
    ]);
  });

  it('keeps a check-in at its time in quiet hours: the person agreed to it', () => {
    const late = stored({ 'coach.checkIns': [checkIn('late', '2026-10-27T23:30:00')] });
    expect(late['notify.quiet']).toBe(true);
    expect(plan(late)[0]?.schedule).toEqual({
      at: new Date(local('2026-10-27T23:30:00')),
      allowWhileIdle: true,
    });
  });

  it('leaves out one whose time has come, and plans none without Android’s permission', () => {
    const settings = stored({
      'coach.checkIns': [
        checkIn('due', '2026-10-26T12:00:00'),
        checkIn('next', '2026-10-28T09:00:00'),
      ],
    });
    expect(plan(settings).map((each) => each.body)).toEqual(['Check-in next']);
    expect(plan(settings, { permitted: false })).toEqual([]);
  });

  it('gives each check-in its own id in 210–241, never one of any other notification', () => {
    const three = [
      checkIn('one', '2026-10-27T09:00:00'),
      checkIn('two', '2026-10-28T09:00:00'),
      checkIn('three', '2026-10-29T09:00:00'),
    ];
    const ids = [...checkInIds(three).values()];
    expect(new Set(ids).size).toBe(3);
    // The same ids whatever else changes, so an unchanged one is not handed over again.
    expect(checkInIds(three.slice(1)).get('two')).toBe(checkInIds(three).get('two'));

    const taken = new Set<number>([
      ...Object.values(NATIVE_IDS).filter((id) => id < NATIVE_IDS.custom),
      ...Array.from({ length: DAY_SLOTS }, (_, slot) => NATIVE_IDS.summary + slot),
    ]);
    const nudgeEnd = NUDGE_IDS.weighIn + DAY_SLOTS - 1;
    const noticeEnd = NOTICE_BASE_ID + NOTICE_KINDS.length * DAY_SLOTS - 1;
    for (let slot = 0; slot < CHECK_IN_IDS.slots; slot += 1) {
      const id = CHECK_IN_IDS.first + slot;
      expect(taken.has(id)).toBe(false);
      expect(id).toBeGreaterThan(nudgeEnd);
      expect(id).toBeLessThan(NOTICE_BASE_ID);
    }
    expect(noticeEnd).toBeLessThan(NATIVE_IDS.custom);
  });
});
