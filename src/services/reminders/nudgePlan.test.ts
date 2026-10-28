import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../data/settingsSchema';
import { addDays, type DayKey } from '../../domain/dates/dayKey';
import { makeFast } from '../../test/factories';
import { REMINDER_SETTING_KEYS, type ReminderSettings } from './engine';
import { CUSTOM_SLOTS, NATIVE_IDS } from './nativePlan';
import { writeMessage } from './notifier';
import {
  DAY_SLOTS,
  NUDGE_IDS,
  daySlot,
  mealCheckTime,
  mealReminderDays,
  nudgeRequests,
  waterBehind,
  type DayLog,
  type NudgeFacts,
} from './nudgePlan';
import { channelOf, CHANNEL_ID, type NativeRequest } from './requests';

// Tests run in America/New_York. Monday 26 October 2026, 12:30.
const NOW = new Date('2026-10-26T12:30:00').getTime();
const TODAY: DayKey = '2026-10-26';
const local = (text: string) => new Date(text).getTime();

function stored(changes: Partial<ReminderSettings> = {}): ReminderSettings {
  const all = defaultSettings({ locale: 'en-US' });
  const picked: Partial<Record<keyof ReminderSettings, unknown>> = {};
  for (const key of REMINDER_SETTING_KEYS) picked[key] = all[key];
  return { ...(picked as ReminderSettings), ...changes };
}

const NOTHING: NudgeFacts = { days: new Map(), usual: {}, lastWeighIn: null };

function facts(days: Record<DayKey, Partial<DayLog>> = {}, more: Partial<NudgeFacts> = {}) {
  const map = new Map<DayKey, DayLog>();
  for (const [day, log] of Object.entries(days)) {
    map.set(day, { meals: [], waterMl: 0, any: false, ...log });
  }
  return { ...NOTHING, days: map, ...more };
}

function plan(
  settings: ReminderSettings,
  input: { facts?: NudgeFacts; now?: number; fast?: ReturnType<typeof makeFast> | null } = {},
) {
  return nudgeRequests(
    { settings, facts: input.facts ?? NOTHING, fast: input.fast ?? null, now: input.now ?? NOW },
    writeMessage,
  );
}

/** Only the nudges of one kind, as `[time, title, body]`. */
function ofKind(list: readonly NativeRequest[], kind: string) {
  return list
    .filter((each) => each.extra.kind === kind)
    .map((each) => {
      const when = each.schedule && 'at' in each.schedule ? each.schedule.at.getTime() : null;
      return { at: when, id: each.id, title: each.title, body: each.body, open: each.extra.open };
    });
}

/** Everything else off, to look at one kind. */
const ONLY = (kind: string, changes: Partial<ReminderSettings> = {}) =>
  stored({
    'notify.off': (
      ['mealCheck', 'waterPace', 'emptyDay', 'weighIn'] as ReminderSettings['notify.off']
    ).filter((each) => each !== kind),
    ...changes,
  });

describe('the meal check (P17-01, D-16.100)', () => {
  it('comes an hour after the reminder time without history, each day of the next 7, in its channel', () => {
    const list = ofKind(plan(ONLY('mealCheck')), 'mealCheck');
    // Breakfast (08:00 → 09:00) and lunch (12:00 → 13:00) today: breakfast is past.
    const today = list.filter((each) => each.at !== null && each.at < local('2026-10-27T00:00:00'));
    expect(today).toEqual([
      {
        at: local('2026-10-26T13:00:00'),
        id: NUDGE_IDS.mealCheck + DAY_SLOTS + daySlot(TODAY),
        title: 'Lunch',
        body: 'Nothing logged for lunch yet.',
        open: 'home',
      },
      expect.objectContaining({ at: local('2026-10-26T20:00:00'), title: 'Dinner' }),
    ]);
    // 2 today, then 3 a day for the next 6.
    expect(list).toHaveLength(2 + 3 * 6);
    expect(plan(ONLY('mealCheck'))[0]).toMatchObject({ channelId: channelOf('mealCheck') });
  });

  it('goes for a meal once it is logged that day, and history decides the time', () => {
    const usual = { lunch: '13:20' };
    const list = ofKind(
      plan(ONLY('mealCheck'), { facts: facts({ [TODAY]: { meals: ['lunch'] } }, { usual }) }),
      'mealCheck',
    );
    const lunches = list.filter((each) => each.title === 'Lunch').map((each) => each.at);
    expect(lunches).not.toContain(local('2026-10-26T14:20:00'));
    expect(lunches[0]).toBe(local('2026-10-27T14:20:00'));
    expect(lunches).toHaveLength(6);
  });

  it('drops a check that falls in quiet hours, unless they are off', () => {
    const late = { dinner: '21:30' };
    const quiet = ofKind(
      plan(ONLY('mealCheck'), { facts: facts({}, { usual: late }) }),
      'mealCheck',
    );
    expect(quiet.filter((each) => each.title === 'Dinner')).toEqual([]);
    const loud = ofKind(
      plan(ONLY('mealCheck', { 'notify.quiet': false }), { facts: facts({}, { usual: late }) }),
      'mealCheck',
    );
    expect(loud.filter((each) => each.title === 'Dinner')[0]?.at).toBe(
      local('2026-10-26T22:30:00'),
    );
    // Past midnight: never.
    expect(mealCheckTime('23:30')).toBeNull();
    expect(mealCheckTime('12:15')).toBe('13:15');
  });
});

describe('the water pace (P17-01)', () => {
  it('is behind when under an even share of the goal over 08:00–21:00', () => {
    // At 13:00, 5 of 13 hours: 1 000 ml of 2 600.
    expect(waterBehind(999, 2_600, '13:00')).toBe(true);
    expect(waterBehind(1_000, 2_600, '13:00')).toBe(false);
    expect(waterBehind(2_000, 2_600, '19:00')).toBe(true);
    expect(waterBehind(0, 0, '19:00')).toBe(false);
  });

  it('comes at 13:00, 16:00 and 19:00 while behind, opening the water, only while water is tracked', () => {
    const on = ONLY('waterPace', { 'water.on': true, 'water.goalMl': 2_600 });
    const behind = ofKind(
      plan(on, { facts: facts({ [TODAY]: { waterMl: 500, any: true } }) }),
      'waterPace',
    );
    const todays = behind.filter((each) => each.at! < local('2026-10-27T00:00:00'));
    expect(todays.map((each) => each.at)).toEqual([
      local('2026-10-26T13:00:00'),
      local('2026-10-26T16:00:00'),
      local('2026-10-26T19:00:00'),
    ]);
    expect(behind[0]).toMatchObject({ title: 'Water', open: 'water' });
    expect(behind).toHaveLength(3 * 7);

    // 1 700 ml by 12:30: on pace for 13:00 and 16:00 (1 600), behind for 19:00 (2 200).
    const ahead = ofKind(
      plan(on, { facts: facts({ [TODAY]: { waterMl: 1_700, any: true } }) }),
      'waterPace',
    );
    expect(
      ahead.filter((each) => each.at! < local('2026-10-27T00:00:00')).map((each) => each.at),
    ).toEqual([local('2026-10-26T19:00:00')]);

    expect(ofKind(plan({ ...on, 'water.on': false }), 'waterPace')).toEqual([]);
  });
});

describe('the empty day (P17-01)', () => {
  it('comes at 20:30 on a day with nothing logged, food or water', () => {
    const list = ofKind(plan(ONLY('emptyDay')), 'emptyDay');
    expect(list[0]).toMatchObject({
      at: local('2026-10-26T20:30:00'),
      title: 'Nothing logged today',
      id: NUDGE_IDS.emptyDay + daySlot(TODAY),
    });
    expect(list).toHaveLength(7);
    const logged = ofKind(
      plan(ONLY('emptyDay'), { facts: facts({ [TODAY]: { any: true } }) }),
      'emptyDay',
    );
    expect(logged[0]?.at).toBe(local('2026-10-27T20:30:00'));
  });

  it('leaves out a day a running fast is expected to fill', () => {
    // Started this morning, a 36 h goal: tonight is a fasting evening, tomorrow's is not.
    const fast = makeFast({ start: local('2026-10-26T08:00:00'), goalMin: 36 * 60, end: null });
    const list = ofKind(plan(ONLY('emptyDay'), { fast }), 'emptyDay');
    expect(list[0]?.at).toBe(local('2026-10-27T20:30:00'));
  });
});

describe('the weigh-in (P17-01)', () => {
  it('comes at 08:30 seven days after the newest weigh-in, then every 7 days', () => {
    const weighedOn = local('2026-10-20T07:45:00');
    const list = ofKind(
      plan(ONLY('weighIn'), { facts: facts({}, { lastWeighIn: weighedOn }) }),
      'weighIn',
    );
    expect(list).toEqual([
      {
        at: local('2026-10-27T08:30:00'),
        id: NUDGE_IDS.weighIn + daySlot('2026-10-27'),
        title: 'Time to weigh in',
        body: 'A week since your last one.',
        open: 'weight',
      },
    ]);
    const older = ofKind(
      plan(ONLY('weighIn'), { facts: facts({}, { lastWeighIn: local('2026-10-14T09:00:00') }) }),
      'weighIn',
    );
    // 12 days old: the nudge 14 days after it.
    expect(older.map((each) => each.at)).toEqual([local('2026-10-28T08:30:00')]);
    expect(ofKind(plan(ONLY('weighIn')), 'weighIn')).toEqual([]);
    // Weighed this morning: nothing in the 7 days planned.
    const fresh = facts({}, { lastWeighIn: local('2026-10-26T08:00:00') });
    expect(ofKind(plan(ONLY('weighIn'), { facts: fresh }), 'weighIn')).toEqual([]);
  });
});

describe('the nudges together (P17-01)', () => {
  it('plans nothing of a kind turned off', () => {
    const all = stored({
      'notify.off': ['mealCheck', 'waterPace', 'emptyDay', 'weighIn'],
      'water.on': true,
    });
    expect(plan(all, { facts: facts({}, { lastWeighIn: local('2026-10-19T08:00:00') }) })).toEqual(
      [],
    );
  });

  it('never gives two notifications one id, nor one of the ids of P13', () => {
    const everything = stored({
      'water.on': true,
      'remind.breakfast': { on: true, at: '07:00' },
      'remind.lunch': { on: true, at: '13:00' },
      'remind.dinner': { on: true, at: '19:30' },
      'notify.quiet': false,
    });
    const input = {
      settings: everything,
      facts: facts({}, { lastWeighIn: local('2026-10-19T08:00:00') }),
      fast: null,
      now: local('2026-10-26T00:30:00'),
    };
    const ids = [
      ...nudgeRequests(input, writeMessage),
      ...mealReminderDays(input, writeMessage),
    ].map((each) => each.id);
    expect(new Set(ids).size).toBe(ids.length);
    const p13 = [...Object.values(NATIVE_IDS)].filter((id) => id < NATIVE_IDS.custom);
    for (const id of ids) {
      expect(p13).not.toContain(id);
      expect(id).toBeGreaterThan(Math.max(...p13, NATIVE_IDS.summary + 7));
      expect(id).toBeLessThan(NATIVE_IDS.custom);
    }
    expect(NATIVE_IDS.custom + CUSTOM_SLOTS * 8).toBeGreaterThan(Math.max(...ids));
  });

  it("never reuses yesterday's id for a day of the next 7", () => {
    const slots = [-1, 0, 1, 2, 3, 4, 5, 6].map((offset) => daySlot(addDays(TODAY, offset)));
    expect(new Set(slots).size).toBe(8);
  });
});

describe('meal reminders day by day: Only if I haven’t logged it (P17-01)', () => {
  it('plans each meal reminder that is on for the next 7 days, leaving out a day with the meal', () => {
    const settings = stored({
      'remind.lunch': { on: true, at: '13:00' },
      'remind.dinner': { on: false, at: '19:00' },
    });
    const input = {
      settings,
      facts: facts({ [TODAY]: { meals: ['lunch'] } }),
      fast: null,
      now: NOW,
    };
    const list = mealReminderDays(input, writeMessage);
    expect(list).toHaveLength(6);
    expect(list[0]).toMatchObject({
      title: 'Lunch',
      body: 'Time to log your lunch.',
      schedule: { at: new Date(local('2026-10-27T13:00:00')), allowWhileIdle: true },
      channelId: CHANNEL_ID,
      extra: { open: 'home', key: expect.any(String) },
    });
    expect(list[0]!.extra).not.toHaveProperty('kind');
    // The person's own reminders: quiet hours never touch them.
    const late = { ...input, settings: stored({ 'remind.dinner': { on: true, at: '23:00' } }) };
    expect(mealReminderDays(late, writeMessage)).toHaveLength(7);
  });
});
