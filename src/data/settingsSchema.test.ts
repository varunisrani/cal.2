import { describe, expect, expectTypeOf, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, decodeAiSettings, type AiSettings } from '../ai/settings';
import { planInputsKey } from '../domain/profile/signature';
import { DEFAULT_GOAL_VALUES } from '../domain/nutrients/goalDefaults';
import type { PillarKey } from '../domain/nutrients/catalogue';
import type { MealTimes, SavedTargets } from '../domain/model';
import { makeProfile } from '../test/factories';
import { APPEARANCES as THEME_APPEARANCES, DEFAULT_THEME } from '../ui/theme';
import { ACCENT_IDS, DEFAULT_ACCENT } from '../ui/tokens';
import {
  ACCENTS,
  APPEARANCES,
  REMINDER_KEYS,
  SETTING_KEYS,
  defaultSettings,
  isClockTime,
  isSettingKey,
  readSetting,
  settingDefault,
  type AccentSetting,
  type HideableTab,
  type ReminderSetting,
  type SettingValue,
  type Settings,
} from './settingsSchema';

const metric = { locale: 'en-GB' };

describe('SETTING_SPECS', () => {
  it('has exactly the v1 keys of the naming table', () => {
    expect([...SETTING_KEYS].sort()).toEqual(
      [
        'ai.settings',
        'alerts.goalReached',
        'backup.lastAt',
        'display.accent',
        'display.appearance',
        'display.weekStart',
        'fasting.defaultGoalMin',
        'fasting.on',
        'goals.nutrients',
        'goals.rebuildBaseline',
        'health.connected',
        'health.countActiveCalories',
        'health.importWeights',
        'health.writeBack',
        'home.pillars',
        'home.sort',
        'log.gramsFirst',
        'meals.times',
        'menu.layout',
        'onboarding.done',
        'onboarding.termsAccepted',
        'product.hiddenFields',
        'product.show',
        'progress.countToday',
        'remind.breakfast',
        'remind.dinner',
        'remind.fastGoal',
        'remind.lunch',
        'remind.master',
        'remind.summary',
        'remind.water',
        'storage.nudgeDone',
        'storage.persistAsked',
        'tabs.hidden',
        'tuneUp.lastCheckDay',
        'tuneUp.on',
        'tuneUp.savedPlan',
        'units.energy',
        'units.height',
        'units.weight',
        'water.goalMl',
        'water.on',
        'water.quickAddMl',
        'water.unit',
      ].sort(),
    );
    expect(isSettingKey('tabs.hidden')).toBe(true);
    expect(isSettingKey('tabs')).toBe(false);
    expect(isSettingKey('toString')).toBe(false);
  });

  it('starts every reminder and alert off, at the decided times (D-16.41, D-16.61)', () => {
    const settings = defaultSettings(metric);
    expect(settings['remind.master']).toBe(false);
    expect(REMINDER_KEYS.map((key) => settings[key])).toEqual([
      { on: false, at: '08:00' },
      { on: false, at: '12:00' },
      { on: false, at: '19:00' },
      { on: false, at: '20:00' },
      { on: false, at: '14:00' },
    ]);
    expect(settings['remind.fastGoal']).toBe(false);
    expect(settings['alerts.goalReached']).toBe(false);
  });

  it('starts Health Connect disconnected, counting active calories and importing weigh-ins, not writing back (P11-03)', () => {
    const settings = defaultSettings(metric);
    expect(settings['health.connected']).toBe(false);
    expect(settings['health.countActiveCalories']).toBe(true);
    expect(settings['health.writeBack']).toBe(false);
    expect(settings['health.importWeights']).toBe(true);
    expect(readSetting('health.writeBack', true)).toBe(true);
    expect(readSetting('health.connected', 'yes')).toBeUndefined();
  });

  it('reads the tune-up switch as on when nothing is stored', () => {
    expect(settingDefault('tuneUp.on', metric)).toBe(true);
    expect(readSetting('tuneUp.on', undefined)).toBeUndefined();
  });

  it('takes height and weight units together from the locale, energy always kcal (R01.18)', () => {
    const pick = (locale: string) => {
      const settings = defaultSettings({ locale });
      return [settings['units.energy'], settings['units.height'], settings['units.weight']];
    };
    expect(pick('en-US')).toEqual(['kcal', 'ftIn', 'lb']);
    expect(pick('de-DE')).toEqual(['kcal', 'cm', 'kg']);
    expect(pick('')).toEqual(['kcal', 'cm', 'kg']);
  });

  it('holds the remaining defaults from the specs and decisions', () => {
    expect(defaultSettings(metric)).toEqual({
      ...defaultSettings(metric),
      'display.appearance': 'system',
      'display.accent': 'basil',
      'display.weekStart': 'mon',
      'log.gramsFirst': false,
      'meals.times': { breakfast: 300, lunch: 720, dinner: 1_080, lateSnack: 1_380 },
      'home.sort': 'byMeal',
      'home.pillars': ['protein', 'carbs', 'fat', 'fibre'],
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
      'goals.nutrients': DEFAULT_GOAL_VALUES,
      'goals.rebuildBaseline': null,
      'tuneUp.lastCheckDay': null,
      'tuneUp.savedPlan': null,
      'onboarding.done': false,
      'onboarding.termsAccepted': false,
      'ai.settings': null,
      'storage.persistAsked': false,
      'storage.nudgeDone': false,
      'backup.lastAt': null,
    });
  });

  it('hands out a fresh copy of each default', () => {
    const first = defaultSettings(metric);
    (first['meals.times'] as MealTimes).breakfast = 0;
    (first['home.pillars'] as PillarKey[]).push('iron');
    (first['water.quickAddMl'] as number[]).length = 0;
    const second = defaultSettings(metric);
    expect(second['meals.times'].breakfast).toBe(300);
    expect(second['home.pillars']).toEqual(['protein', 'carbs', 'fat', 'fibre']);
    expect(second['water.quickAddMl']).toEqual([250, 500, 750]);
  });

  it('uses the accent and appearance ids the theme styles', () => {
    expect(ACCENTS).toEqual(ACCENT_IDS);
    expect(settingDefault('display.accent', metric)).toBe(DEFAULT_ACCENT);
    expect(APPEARANCES).toEqual(THEME_APPEARANCES);
    expect(settingDefault('display.appearance', metric)).toBe(DEFAULT_THEME.appearance);
  });

  it('types each value by its key', () => {
    expectTypeOf<SettingValue<'display.accent'>>().toEqualTypeOf<AccentSetting>();
    expectTypeOf<SettingValue<'tabs.hidden'>>().toEqualTypeOf<readonly HideableTab[]>();
    expectTypeOf<SettingValue<'remind.lunch'>>().toEqualTypeOf<Readonly<ReminderSetting>>();
    expectTypeOf<SettingValue<'tuneUp.savedPlan'>>().toEqualTypeOf<Readonly<SavedTargets> | null>();
    expectTypeOf<SettingValue<'fasting.on'>>().toEqualTypeOf<boolean>();
    expectTypeOf<Settings['backup.lastAt']>().toEqualTypeOf<number | null>();
  });
});

describe('readSetting', () => {
  it('refuses an accent or appearance the theme does not have', () => {
    expect(readSetting('display.accent', 'lagoon')).toBe('lagoon');
    expect(readSetting('display.accent', 'magenta')).toBeUndefined();
    expect(readSetting('display.accent', 'Basil')).toBeUndefined();
    expect(readSetting('display.appearance', 'dark')).toBe('dark');
    expect(readSetting('display.appearance', 'auto')).toBeUndefined();
    expect(readSetting('display.weekStart', 'sun')).toBe('sun');
    expect(readSetting('display.weekStart', true)).toBeUndefined();
  });

  it('reads units only from their own values', () => {
    expect(readSetting('units.energy', 'kJ')).toBe('kJ');
    expect(readSetting('units.energy', 'kj')).toBeUndefined();
    expect(readSetting('units.height', 'ftIn')).toBe('ftIn');
    expect(readSetting('units.weight', 'lbs')).toBeUndefined();
    expect(readSetting('water.unit', 'flOz')).toBe('flOz');
    expect(readSetting('water.unit', 'oz')).toBeUndefined();
  });

  it('reads switches only from booleans', () => {
    expect(readSetting('fasting.on', true)).toBe(true);
    expect(readSetting('fasting.on', 'true')).toBeUndefined();
    expect(readSetting('product.show', 0)).toBeUndefined();
    expect(readSetting('remind.master', null)).toBeUndefined();
  });

  it('accepts only meal times that increase inside one day, keeping the four starts', () => {
    const times = { breakfast: 360, lunch: 690, dinner: 1_110, lateSnack: 1_410 };
    expect(readSetting('meals.times', { ...times, extra: 1 })).toEqual(times);
    expect(readSetting('meals.times', { ...times, breakfast: 720, lunch: 300 })).toBeUndefined();
    expect(readSetting('meals.times', { ...times, lateSnack: 1_440 })).toBeUndefined();
    expect(readSetting('meals.times', [360, 690, 1_110, 1_410])).toBeUndefined();
  });

  it('drops unknown hidden tabs and keeps tab order, so ["home", "coach"] hides only Coach', () => {
    expect(readSetting('tabs.hidden', ['home', 'coach'])).toEqual(['coach']);
    expect(readSetting('tabs.hidden', ['coach', 'settings', 'progress', 'coach'])).toEqual([
      'progress',
      'coach',
    ]);
    expect(readSetting('tabs.hidden', [])).toEqual([]);
    expect(readSetting('tabs.hidden', 'progress,coach')).toBeUndefined();
  });

  it('drops unknown product fields and keeps the display order', () => {
    expect(readSetting('product.hiddenFields', ['traces', 'colour', 'barcode'])).toEqual([
      'barcode',
      'traces',
    ]);
    expect(readSetting('product.hiddenFields', { barcode: true })).toBeUndefined();
  });

  it('reads Home pillars from an array and refuses one with nothing usable in it', () => {
    expect(readSetting('home.pillars', ['fibre', 'unknown', 'protein'])).toEqual([
      'fibre',
      'protein',
    ]);
    expect(readSetting('home.pillars', [' iron '])).toEqual(['iron']);
    expect(readSetting('home.pillars', ['water'])).toBeUndefined();
    expect(readSetting('home.pillars', [])).toBeUndefined();
    expect(readSetting('home.pillars', 'protein,carbs')).toBeUndefined();
  });

  it('sorts quick-add amounts and refuses any other shape', () => {
    expect(readSetting('water.quickAddMl', [500, 250, 750])).toEqual([250, 500, 750]);
    expect(readSetting('water.quickAddMl', [330, 330, 1_000])).toEqual([330, 330, 1_000]);
    expect(readSetting('water.quickAddMl', [250, 500])).toBeUndefined();
    expect(readSetting('water.quickAddMl', [250, 500, 6_000])).toBeUndefined();
    expect(readSetting('water.quickAddMl', [250, 500, '750'])).toBeUndefined();
    expect(readSetting('water.quickAddMl', [250, 500, 750, 1_000])).toBeUndefined();
  });

  it('keeps the water goal whole and inside the goal wheel', () => {
    expect(readSetting('water.goalMl', 2_011)).toBe(2_011);
    expect(readSetting('water.goalMl', 50)).toBe(50);
    expect(readSetting('water.goalMl', 10_000)).toBe(10_000);
    expect(readSetting('water.goalMl', 49)).toBeUndefined();
    expect(readSetting('water.goalMl', 10_001)).toBeUndefined();
    expect(readSetting('water.goalMl', 2_000.5)).toBeUndefined();
  });

  it('clamps a stored default fast goal and refuses one that is not a number', () => {
    expect(readSetting('fasting.defaultGoalMin', 990)).toBe(990);
    expect(readSetting('fasting.defaultGoalMin', 30)).toBe(60);
    expect(readSetting('fasting.defaultGoalMin', 20_000)).toBe(10_080);
    expect(readSetting('fasting.defaultGoalMin', '960')).toBeUndefined();
    expect(readSetting('fasting.defaultGoalMin', Number.NaN)).toBeUndefined();
  });

  it('needs a switch and an HH:MM time for a timed reminder', () => {
    expect(readSetting('remind.breakfast', { on: true, at: '07:30', snooze: 5 })).toEqual({
      on: true,
      at: '07:30',
    });
    expect(readSetting('remind.breakfast', { on: true, at: '7:30' })).toBeUndefined();
    expect(readSetting('remind.water', { on: 'yes', at: '14:00' })).toBeUndefined();
    expect(readSetting('remind.summary', { on: false })).toBeUndefined();
    expect(isClockTime('00:00')).toBe(true);
    expect(isClockTime('23:59')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('12:60')).toBe(false);
    expect(isClockTime('12:5')).toBe(false);
  });

  it('keeps a kept plan of nothing apart from an all-automatic plan', () => {
    expect(readSetting('tuneUp.savedPlan', null)).toBeNull();
    expect(readSetting('tuneUp.savedPlan', {})).toEqual({});
    expect(readSetting('tuneUp.savedPlan', { kcal: 2_100.4, protein: 150, note: 'x' })).toEqual({
      kcal: 2_100,
      protein: 150,
    });
    expect(readSetting('tuneUp.savedPlan', { kcal: -1 })).toBeUndefined();
    expect(readSetting('tuneUp.savedPlan', { kcal: 2_000, fat: '70' })).toBeUndefined();
    expect(readSetting('tuneUp.savedPlan', [])).toBeUndefined();
  });

  it('reads the last tune-up day as a day key or null', () => {
    expect(readSetting('tuneUp.lastCheckDay', '2026-10-19')).toBe('2026-10-19');
    expect(readSetting('tuneUp.lastCheckDay', null)).toBeNull();
    expect(readSetting('tuneUp.lastCheckDay', '2026-13-01')).toBeUndefined();
    expect(readSetting('tuneUp.lastCheckDay', 1_761_000_000_000)).toBeUndefined();
  });

  it('keeps any rebuild baseline string, leaving its format to the signature rules', () => {
    const key = planInputsKey(makeProfile());
    expect(readSetting('goals.rebuildBaseline', key)).toBe(key);
    expect(readSetting('goals.rebuildBaseline', '[0,"older"]')).toBe('[0,"older"]');
    expect(readSetting('goals.rebuildBaseline', null)).toBeNull();
    expect(readSetting('goals.rebuildBaseline', 42)).toBeUndefined();
  });

  it('reads optional nutrient goals through their own defaults', () => {
    expect(readSetting('goals.nutrients', { fibre: 25, sodium: 'lots' })).toEqual({
      ...DEFAULT_GOAL_VALUES,
      fibre: 25,
    });
    expect(readSetting('goals.nutrients', [])).toBeUndefined();
    expect(readSetting('goals.nutrients', null)).toBeUndefined();
  });

  it('keeps records whose fields another module owns, or null', () => {
    const layout = { groups: [{ id: 'snapScan', methods: ['camera'] }], standalone: [] };
    expect(readSetting('menu.layout', layout)).toEqual(layout);
    expect(readSetting('menu.layout', null)).toBeNull();
    expect(readSetting('menu.layout', [])).toBeUndefined();
  });

  it('reads the AI settings through the AI layer, null until the person sets AI up', () => {
    expect(readSetting('ai.settings', null)).toBeNull();
    expect(readSetting('ai.settings', { maxTokens: 2_048 })).toEqual({
      ...DEFAULT_AI_SETTINGS,
      maxTokens: 2_048,
    });
    const ollama = {
      primary: { provider: 'ollama', model: 'qwen3.5:9b' },
      endpoints: { ollama: { main: 'http://localhost:11434/v1/', standby: '' } },
    };
    expect(readSetting('ai.settings', ollama)).toEqual(decodeAiSettings(ollama));
    expect(readSetting('ai.settings', ollama)?.endpoints.ollama?.main).toBe(
      'http://localhost:11434/v1',
    );
    expect(readSetting('ai.settings', 'openai')).toBeUndefined();
    expect(readSetting('ai.settings', [])).toBeUndefined();
    expectTypeOf<SettingValue<'ai.settings'>>().toEqualTypeOf<AiSettings | null>();
  });

  it('reads the last backup time as epoch ms or null', () => {
    expect(readSetting('backup.lastAt', 1_761_000_000_000)).toBe(1_761_000_000_000);
    expect(readSetting('backup.lastAt', null)).toBeNull();
    expect(readSetting('backup.lastAt', '2026-10-26')).toBeUndefined();
    expect(readSetting('backup.lastAt', -1)).toBeUndefined();
  });
});
