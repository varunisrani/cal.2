/**
 * Builders for every stored record, for tests. Each takes overrides and fills the rest with
 * plain, valid defaults (every record passes its codec in `src/data/codecs.ts` unchanged). Ids
 * count up per kind (`entry-1`, `entry-2`, …) from the start of each test file; `resetFactories()`
 * starts them again. Day keys follow the record's instant in the current zone unless given.
 */
import { dayKeyOf } from '../domain/dates/dayKey';
import type {
  AnalysisDraft,
  BodyFatReading,
  CoachMessage,
  DiaryEntry,
  Fast,
  IngredientLine,
  NutritionDraft,
  ProductInfo,
  Profile,
  SavedMeal,
  WaterLog,
  WeighIn,
} from '../domain/model';
import { PROFILE_KEY, type PhotoRow, type ProfileRow } from '../data/schema';

/** The instant records default to: Monday 26 October 2026, 12:30 in New York (the test zone). */
export const FACTORY_NOW = Date.parse('2026-10-26T12:30:00-04:00');

const counters = new Map<string, number>();

/** The next id of a kind: `entry-1`, `entry-2`, … */
export function nextId(kind: string): string {
  const next = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, next);
  return `${kind}-${next}`;
}

/** Starts every id sequence again. */
export function resetFactories(): void {
  counters.clear();
}

export function makeLine(overrides: Partial<IngredientLine> = {}): IngredientLine {
  return {
    name: 'Brown rice',
    grams: 150,
    kcal: 168,
    protein: 3.5,
    carbs: 35,
    fat: 1.4,
    photoIds: [],
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<ProductInfo> = {}): ProductInfo {
  return {
    barcode: '4006381333931',
    package: '500 g',
    allergens: ['milk'],
    traces: [],
    nutri: 'b',
    nova: 3,
    labels: [],
    categories: ['yoghurts'],
    ...overrides,
  };
}

export function makeDraft(overrides: Partial<NutritionDraft> = {}): NutritionDraft {
  return {
    name: 'Lentil soup',
    kcal: 410,
    protein: 24,
    carbs: 58,
    fat: 9.5,
    nutrients: { fibre: 14, sodium: 820 },
    extras: {},
    basis: { kind: 'grams', grams: 420 },
    units: [{ unit: 'bowl', gramsEach: 420, count: 1 }],
    lines: [],
    progressive: false,
    ...overrides,
  };
}

/** A diary entry; `dayKey` follows `loggedAt` unless it is overridden too. */
export function makeEntry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  const loggedAt = overrides.loggedAt ?? FACTORY_NOW;
  return {
    ...makeDraft(),
    id: nextId('entry'),
    loggedAt,
    dayKey: dayKeyOf(loggedAt),
    meal: 'lunch',
    source: 'photo',
    photoIds: [],
    ...overrides,
  };
}

export function makeSavedMeal(overrides: Partial<SavedMeal> = {}): SavedMeal {
  return {
    ...makeDraft({ name: 'Porridge with berries', kcal: 320, protein: 11, carbs: 52, fat: 7 }),
    id: nextId('saved'),
    order: 0,
    source: 'manual',
    photoIds: [],
    ...overrides,
  };
}

export function makeAnalysisDraft(overrides: Partial<AnalysisDraft> = {}): AnalysisDraft {
  return {
    draft: makeDraft(),
    photoIds: [],
    source: 'photo',
    createdAt: FACTORY_NOW,
    fromSavedLabel: false,
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    sex: 'female',
    birthDate: '1994-03-14',
    heightCm: 168,
    weightKg: 64,
    activity: 'light',
    goal: 'lose',
    weeklyKg: 0.5,
    goalWeightKg: 60,
    saved: {},
    allergens: [],
    caloriesLocked: false,
    lockedMacros: [],
    ...overrides,
  };
}

/** The stored profile row (`id` = `me`). */
export function makeProfileRow(overrides: Partial<Profile> = {}): ProfileRow {
  return { ...makeProfile(overrides), id: PROFILE_KEY };
}

export function makeWeighIn(overrides: Partial<WeighIn> = {}): WeighIn {
  return { id: nextId('weigh'), at: FACTORY_NOW, kg: 64, ...overrides };
}

export function makeBodyFat(overrides: Partial<BodyFatReading> = {}): BodyFatReading {
  return { id: nextId('bodyfat'), at: FACTORY_NOW, fraction: 0.24, ...overrides };
}

/** A water log; `dayKey` follows `at` unless it is overridden too. */
export function makeWater(overrides: Partial<WaterLog> = {}): WaterLog {
  const at = overrides.at ?? FACTORY_NOW;
  return { id: nextId('water'), at, dayKey: dayKeyOf(at), ml: 250, ...overrides };
}

/** A finished 16-hour fast ending at `FACTORY_NOW`; pass `end: null` for a running one. */
export function makeFast(overrides: Partial<Fast> = {}): Fast {
  return {
    id: nextId('fast'),
    start: FACTORY_NOW - 16 * 3_600_000,
    end: FACTORY_NOW,
    goalMin: 960,
    ...overrides,
  };
}

export function makeCoachMessage(overrides: Partial<CoachMessage> = {}): CoachMessage {
  return {
    id: nextId('message'),
    role: 'user',
    text: 'How much protein did I eat this week?',
    at: FACTORY_NOW,
    ...overrides,
  };
}

/** A photo row with small blobs standing in for the image and its thumbnail. */
export function makePhoto(overrides: Partial<PhotoRow> = {}): PhotoRow {
  const blob = overrides.blob ?? new Blob([new Uint8Array(64)], { type: 'image/jpeg' });
  return {
    id: nextId('photo'),
    blob,
    thumb: new Blob([new Uint8Array(8)], { type: 'image/jpeg' }),
    width: 2048,
    height: 1536,
    bytes: blob.size,
    createdAt: FACTORY_NOW,
    ...overrides,
  };
}
