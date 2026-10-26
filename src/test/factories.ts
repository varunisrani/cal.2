/**
 * Builders of valid records for tests across the app. Each takes overrides; everything else has a
 * plain default. Ids count per kind (`entry-1`, `entry-2`, …) and times come from one fixed clock,
 * so stored rows are predictable. Every builder's record reads back unchanged through its codec
 * in src/data/codecs.ts (factories.test.ts).
 */
import { dayKeyOf } from '../domain/dates/dayKey';
import type {
  AnalysisDraft,
  BodyFatReading,
  CoachMessage,
  DiaryEntry,
  Fast,
  NutritionDraft,
  Profile,
  SavedMeal,
  WaterLog,
  WeighIn,
} from '../domain/model';
import { fixedClock, type Clock } from '../lib/clock';
import { withIdSequence } from '../lib/ids';
import type { PhotoRow, ProfileRow } from '../data/schema';

/** 12:30 on Monday 26 October 2026 in New York (16:30 UTC). */
export const FACTORY_NOW = Date.UTC(2026, 9, 26, 16, 30);
export const FACTORY_ZONE = 'America/New_York';

const HOUR = 3_600_000;

// Node's Blob survives fake-indexeddb's structured clone; jsdom's Blob comes back as a plain
// object. Tests run in Node, but the app's tsconfig has no Node types: this is all we use.
declare const process: { getBuiltinModule?: (id: string) => unknown } | undefined;

function storableBlobClass(): typeof Blob {
  const buffer = typeof process === 'object' ? process.getBuiltinModule?.('node:buffer') : null;
  return (buffer as { Blob?: typeof Blob } | null | undefined)?.Blob ?? Blob;
}

/** A Blob that keeps its bytes when stored in the fake IndexedDB. */
export function testBlob(content: string, type = 'image/jpeg'): Blob {
  const StorableBlob = storableBlobClass();
  return new StorableBlob([content], { type });
}

export interface Factories {
  /** The clock every default time comes from. */
  readonly clock: Clock;
  draft(overrides?: Partial<NutritionDraft>): NutritionDraft;
  entry(overrides?: Partial<DiaryEntry>): DiaryEntry;
  savedMeal(overrides?: Partial<SavedMeal>): SavedMeal;
  analysisDraft(overrides?: Partial<AnalysisDraft>): AnalysisDraft;
  weighIn(overrides?: Partial<WeighIn>): WeighIn;
  bodyFat(overrides?: Partial<BodyFatReading>): BodyFatReading;
  water(overrides?: Partial<WaterLog>): WaterLog;
  /** A finished 16-hour fast ending now; pass `end: null` for a running one. */
  fast(overrides?: Partial<Fast>): Fast;
  coachMessage(overrides?: Partial<CoachMessage>): CoachMessage;
  profile(overrides?: Partial<Profile>): Profile;
  /** The stored profile row (`id: 'me'`). */
  profileRow(overrides?: Partial<Profile>): ProfileRow;
  photo(overrides?: Partial<PhotoRow>): PhotoRow;
}

/** A fresh set of builders: ids start at 1 again, defaults use `now` (FACTORY_NOW by default). */
export function factories(options: { now?: number; zone?: string } = {}): Factories {
  const clock = fixedClock(options.now ?? FACTORY_NOW, options.zone ?? FACTORY_ZONE);
  const now = clock.now();
  const ids = {
    entry: withIdSequence('entry'),
    saved: withIdSequence('saved'),
    weighIn: withIdSequence('weigh'),
    bodyFat: withIdSequence('fat'),
    water: withIdSequence('water'),
    fast: withIdSequence('fast'),
    message: withIdSequence('msg'),
    photo: withIdSequence('photo'),
  };
  let savedCount = 0;

  const draft = (overrides: Partial<NutritionDraft> = {}): NutritionDraft => ({
    name: 'Lentil soup',
    kcal: 320,
    protein: 18,
    carbs: 45.5,
    fat: 7.2,
    nutrients: { fibre: 11, sodium: 640 },
    extras: {},
    basis: { kind: 'grams', grams: 400 },
    units: [{ unit: 'bowl', gramsEach: 400 }],
    lines: [],
    progressive: false,
    ...overrides,
  });

  const profile = (overrides: Partial<Profile> = {}): Profile => ({
    sex: 'female',
    birthDate: '1991-04-12',
    heightCm: 168,
    weightKg: 64,
    activity: 'moderate',
    goal: 'maintain',
    saved: {},
    allergens: [],
    caloriesLocked: false,
    lockedMacros: [],
    ...overrides,
  });

  return {
    clock,
    draft,
    entry(overrides = {}) {
      const loggedAt = overrides.loggedAt ?? now;
      return {
        ...draft(),
        id: ids.entry(),
        loggedAt,
        dayKey: dayKeyOf(loggedAt),
        meal: 'lunch',
        source: 'manual',
        photoIds: [],
        ...overrides,
      };
    },
    savedMeal(overrides = {}) {
      savedCount += 1;
      return {
        ...draft(),
        id: ids.saved(),
        order: savedCount - 1,
        source: 'manual',
        photoIds: [],
        ...overrides,
      };
    },
    analysisDraft(overrides = {}) {
      return {
        draft: draft(),
        photoIds: [],
        source: 'photo',
        createdAt: now,
        fromSavedLabel: false,
        ...overrides,
      };
    },
    weighIn(overrides = {}) {
      return { id: ids.weighIn(), at: now, kg: 72.4, ...overrides };
    },
    bodyFat(overrides = {}) {
      return { id: ids.bodyFat(), at: now, fraction: 0.21, ...overrides };
    },
    water(overrides = {}) {
      const at = overrides.at ?? now;
      return { id: ids.water(), at, dayKey: dayKeyOf(at), ml: 250, ...overrides };
    },
    fast(overrides = {}) {
      return { id: ids.fast(), start: now - 16 * HOUR, end: now, goalMin: 960, ...overrides };
    },
    coachMessage(overrides = {}) {
      return {
        id: ids.message(),
        role: 'user',
        text: 'Was today a good day?',
        at: now,
        ...overrides,
      };
    },
    profile,
    profileRow(overrides = {}) {
      return { ...profile(overrides), id: 'me' };
    },
    photo(overrides = {}) {
      const blob = overrides.blob ?? testBlob('photo bytes');
      const thumb = 'thumb' in overrides ? overrides.thumb : testBlob('thumb');
      return {
        id: ids.photo(),
        blob,
        width: 1024,
        height: 768,
        bytes: blob.size + (thumb?.size ?? 0),
        createdAt: now,
        ...(thumb ? { thumb } : {}),
        ...overrides,
      };
    },
  };
}
