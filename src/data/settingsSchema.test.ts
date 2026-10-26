import { describe, expect, it } from 'vitest';
import { readTuneUpOn } from '../domain/adaptive/cadence';
import { DEFAULT_MEAL_TIMES } from '../domain/meals/times';
import { DEFAULT_NUTRIENT_GOALS } from '../domain/nutrients/goalDefaults';
import { DEFAULT_PILLARS } from '../domain/nutrients/pillars';
import { APPEARANCES, DEFAULT_THEME } from '../ui/theme';
import { ACCENT_IDS, DEFAULT_ACCENT } from '../ui/tokens';
import {
  ACCENT_VALUES,
  APPEARANCE_VALUES,
  SETTING_KEYS,
  TIMED_REMINDER_KEYS,
  defaultOf,
  defaultSettings,
  isClockTime,
  isDeviceOnly,
  isSettingKey,
  readSetting,
} from './settingsSchema';

describe('settings defaults', () => {
  it('lists every v1 setting with the value it shows while nothing is stored', () => {
    expect(defaultSettings()).toEqual({
      'display.appearance': 'system',
      'display.accent': 'basil',
      'display.weekStart': 'mon',
      'units.energy': 'kcal',
      'units.height': 'cm',
      'units.weight': 'kg',
      'log.gramsFirst': false,
      'meals.times': DEFAULT_MEAL_TIMES,
      'home.pillars': DEFAULT_PILLARS,
      'home.sort': 'byMeal',
      'tabs.hidden': [],
      'menu.layout': null,
      'product.show': true,
      'product.hiddenFields': [],
      'progress.countToday': true,
      'water.on': false,
      'water.goalMl': 2_000,
      'water.unit': 'ml',
      'water.quickAddMl': [250, 500, 750],
      'fasting.on': false,
      'fasting.defaultGoalMin': 960,
      'remind.master': false,
      'remind.breakfast': { on: false, at: '08:00' },
      'remind.lunch': { on: false, at: '12:00' },
      'remind.dinner': { on: false, at: '19:00' },
      'remind.summary': { on: false, at: '20:00' },
      'remind.water': { on: false, at: '14:00' },
      'remind.fastGoal': false,
      'alerts.goalReached': true,
      'ai.settings': null,
      'goals.nutrients': DEFAULT_NUTRIENT_GOALS,
      'goals.rebuildBaseline': null,
      'tuneUp.on': true,
      'tuneUp.lastCheckDay': null,
      'tuneUp.savedPlan': null,
      'onboarding.done': false,
      'onboarding.termsAccepted': false,
      'storage.persistAsked': false,
      'storage.nudgeDone': false,
      'backup.lastAt': null,
    });
  });

  it('defaults every reminder to off, at 08:00, 12:00, 19:00, 20:00 and 14:00 (D-16.41)', () => {
    expect(defaultOf('remind.master')).toBe(false);
    expect(defaultOf('remind.fastGoal')).toBe(false);
    expect(TIMED_REMINDER_KEYS.map((key) => defaultOf(key))).toEqual([
      { on: false, at: '08:00' },
      { on: false, at: '12:00' },
      { on: false, at: '19:00' },
      { on: false, at: '20:00' },
      { on: false, at: '14:00' },
    ]);
  });

  it('reads the tune-up switch as on when it is absent or unusable, like the tune-up rules', () => {
    expect(defaultOf('tuneUp.on')).toBe(true);
    expect(defaultOf('tuneUp.on')).toBe(readTuneUpOn(undefined));
    expect(readSetting('tuneUp.on', 'yes')).toBeUndefined();
    expect(readSetting('tuneUp.on', false)).toBe(false);
  });

  it('reads every default back as itself, so a default can be stored as it is', () => {
    for (const key of SETTING_KEYS) {
      expect(readSetting(key, defaultOf(key)), key).toEqual(defaultOf(key));
    }
  });

  it('freezes the defaults that are records or lists', () => {
    for (const key of SETTING_KEYS) {
      const value: unknown = defaultOf(key);
      if (typeof value === 'object' && value !== null)
        expect(Object.isFrozen(value), key).toBe(true);
    }
  });

  it('offers the same appearances and accents as the theme, with the same defaults', () => {
    expect(APPEARANCE_VALUES).toEqual(APPEARANCES);
    expect(ACCENT_VALUES).toEqual(ACCENT_IDS);
    expect(defaultOf('display.accent')).toBe(DEFAULT_ACCENT);
    expect(defaultOf('display.appearance')).toBe(DEFAULT_THEME.appearance);
  });

  it('marks persistence, the storage nudge and the last backup as this device only', () => {
    expect(SETTING_KEYS.filter(isDeviceOnly)).toEqual([
      'storage.persistAsked',
      'storage.nudgeDone',
      'backup.lastAt',
    ]);
  });

  it('knows its own keys only', () => {
    expect(isSettingKey('display.accent')).toBe(true);
    expect(isSettingKey('display.colour')).toBe(false);
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey(7)).toBe(false);
  });
});

describe('readSetting', () => {
  it('accepts a closed choice exactly as listed', () => {
    expect(readSetting('display.accent', 'ember')).toBe('ember');
    expect(readSetting('display.accent', 'Ember')).toBeUndefined();
    expect(readSetting('display.accent', 'magenta')).toBeUndefined();
    expect(readSetting('display.weekStart', 'sun')).toBe('sun');
    expect(readSetting('display.weekStart', 'monday')).toBeUndefined();
    expect(readSetting('units.energy', 'kJ')).toBe('kJ');
    expect(readSetting('units.energy', 'kj')).toBeUndefined();
    expect(readSetting('units.height', 'ftIn')).toBe('ftIn');
    expect(readSetting('water.unit', 'flOz')).toBe('flOz');
    expect(readSetting('home.sort', 'newestFirst')).toBe('newestFirst');
  });

  it('reads switches only from true and false', () => {
    expect(readSetting('water.on', true)).toBe(true);
    expect(readSetting('water.on', 'true')).toBeUndefined();
    expect(readSetting('water.on', 1)).toBeUndefined();
  });

  it('keeps hidden tabs in tab order, without repeats, Home, Settings or unknown names (R05.13)', () => {
    expect(readSetting('tabs.hidden', ['coach', 'home', 'progress', 'coach', 'kitchen'])).toEqual([
      'progress',
      'coach',
    ]);
    expect(readSetting('tabs.hidden', ['settings'])).toEqual([]);
    expect(readSetting('tabs.hidden', 'coach')).toBeUndefined();
  });

  it('keeps hidden product fields in display order and drops unknown ones', () => {
    expect(readSetting('product.hiddenFields', ['traces', 'nova', 'colour', 'barcode'])).toEqual([
      'barcode',
      'nova',
      'traces',
    ]);
    expect(readSetting('product.hiddenFields', { nova: true })).toBeUndefined();
  });

  it('reads meal times with the meal-time rules and refuses an order that does not increase', () => {
    const stored = { breakfast: 420, lunch: 750, dinner: 1_110, lateSnack: 1_320, extra: 1 };
    expect(readSetting('meals.times', stored)).toEqual({
      breakfast: 420,
      lunch: 750,
      dinner: 1_110,
      lateSnack: 1_320,
    });
    expect(readSetting('meals.times', { ...stored, lunch: 400 })).toBeUndefined();
    expect(readSetting('meals.times', 'early')).toBeUndefined();
  });

  it('reads Home pillars with the pillar rules, from a list', () => {
    expect(readSetting('home.pillars', ['sugar', 'protein', 'sugar', 'colour'])).toEqual([
      'sugar',
      'protein',
    ]);
    expect(readSetting('home.pillars', ['fibre', 'iron', 'zinc', 'sodium', 'calcium'])).toEqual([
      'fibre',
      'iron',
      'zinc',
      'sodium',
    ]);
    expect(readSetting('home.pillars', ['colour'])).toEqual(DEFAULT_PILLARS);
    expect(readSetting('home.pillars', 4)).toBeUndefined();
  });

  it('reads quick-add amounts as three whole ml of 1–5 000, smallest first', () => {
    expect(readSetting('water.quickAddMl', [750, 250, 500])).toEqual([250, 500, 750]);
    expect(readSetting('water.quickAddMl', [330, 330, 1_000])).toEqual([330, 330, 1_000]);
    expect(readSetting('water.quickAddMl', [250, 500])).toBeUndefined();
    expect(readSetting('water.quickAddMl', [250, 500, 6_000])).toBeUndefined();
    expect(readSetting('water.quickAddMl', [250.5, 500, 750])).toBeUndefined();
    expect(readSetting('water.quickAddMl', [250, 500, '750'])).toBeUndefined();
  });

  it('rounds the water goal to whole ml inside the goal wheel range', () => {
    expect(readSetting('water.goalMl', 2_499.6)).toBe(2_500);
    expect(readSetting('water.goalMl', 50)).toBe(50);
    expect(readSetting('water.goalMl', 10_000)).toBe(10_000);
    expect(readSetting('water.goalMl', 40)).toBeUndefined();
    expect(readSetting('water.goalMl', 10_001)).toBeUndefined();
    expect(readSetting('water.goalMl', '2000')).toBeUndefined();
  });

  it('clamps the default fasting goal to 1 hour – 7 days, like every fast goal', () => {
    expect(readSetting('fasting.defaultGoalMin', 720)).toBe(720);
    expect(readSetting('fasting.defaultGoalMin', 30)).toBe(60);
    expect(readSetting('fasting.defaultGoalMin', 20_000)).toBe(10_080);
    expect(readSetting('fasting.defaultGoalMin', 900.6)).toBe(901);
    expect(readSetting('fasting.defaultGoalMin', Number.NaN)).toBeUndefined();
    expect(readSetting('fasting.defaultGoalMin', '16h')).toBeUndefined();
  });

  it('reads a reminder as a switch and an HH:MM time, keeping what it can of a damaged one', () => {
    expect(readSetting('remind.lunch', { on: true, at: '12:45' })).toEqual({
      on: true,
      at: '12:45',
    });
    expect(readSetting('remind.lunch', { on: 'yes', at: '7:30' })).toEqual({
      on: false,
      at: '12:00',
    });
    expect(readSetting('remind.water', { on: true, at: '24:00' })).toEqual({
      on: true,
      at: '14:00',
    });
    expect(readSetting('remind.lunch', '12:45')).toBeUndefined();
  });

  it('accepts clock times from 00:00 to 23:59 only', () => {
    expect(['00:00', '09:05', '23:59'].every(isClockTime)).toBe(true);
    expect(['24:00', '7:30', '12:60', '12:30:00', ''].some(isClockTime)).toBe(false);
  });

  it('keeps an opaque record as stored, and null as none', () => {
    const layout = { version: 1, groups: [{ id: 'a', name: '', methods: ['camera'] }], loose: [] };
    expect(readSetting('menu.layout', layout)).toEqual(layout);
    expect(readSetting('menu.layout', null)).toBeNull();
    expect(readSetting('menu.layout', [])).toBeUndefined();
    expect(readSetting('ai.settings', { primary: 'gemini' })).toEqual({ primary: 'gemini' });
    expect(readSetting('ai.settings', 'gemini')).toBeUndefined();
    expect(readSetting('ai.settings', new Date(0))).toBeUndefined();
  });

  it('reads the tune-up day as a real day key and the saved plan as whole targets', () => {
    expect(readSetting('tuneUp.lastCheckDay', '2026-10-26')).toBe('2026-10-26');
    expect(readSetting('tuneUp.lastCheckDay', '2026-02-30')).toBeUndefined();
    expect(readSetting('tuneUp.lastCheckDay', null)).toBeNull();
    expect(
      readSetting('tuneUp.savedPlan', { kcal: 2_000.4, protein: -5, carbs: 'x', fat: 61 }),
    ).toEqual({ kcal: 2_000, fat: 61 });
    expect(readSetting('tuneUp.savedPlan', [2_000])).toBeUndefined();
  });

  it('reads nutrient goals with the goal rules, from a record only', () => {
    const read = readSetting('goals.nutrients', { fibre: 25, sodium: 'lots' });
    expect(read?.fibre).toBe(25);
    expect(read?.sodium).toBe(DEFAULT_NUTRIENT_GOALS.sodium);
    expect(readSetting('goals.nutrients', [25])).toBeUndefined();
  });

  it('reads the rebuild baseline and the last backup time, or none', () => {
    expect(readSetting('goals.rebuildBaseline', '["female"]')).toBe('["female"]');
    expect(readSetting('goals.rebuildBaseline', '')).toBeUndefined();
    expect(readSetting('backup.lastAt', 1_793_000_000_000)).toBe(1_793_000_000_000);
    expect(readSetting('backup.lastAt', Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(readSetting('backup.lastAt', null)).toBeNull();
  });
});
