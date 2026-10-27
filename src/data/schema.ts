// The one IndexedDB database: its name, its tables and indexes, the row types stored in them, and
// the numbered upgrade steps that move data from one schema version to the next.
//
// Rows read straight from a table are untrusted (another app version or a damaged import may
// have written them): read them through the codecs and the guard (`codecs.ts`, `guard.ts`).

import type { Dexie, EntityTable, Table, Transaction } from 'dexie';
import type { DayKey } from '../domain/dates/dayKey';
import type {
  BodyFatReading,
  CoachMessage,
  DiaryEntry,
  Fast,
  Profile,
  SavedMeal,
  WaterLog,
  WeighIn,
} from '../domain/model';

export const DB_NAME = 'platewise';

/** Dexie schema strings of version 1: primary key first, then the indexes. */
export const TABLES = {
  profile: 'id',
  entries: 'id, dayKey, loggedAt, [dayKey+loggedAt], barcodeKey',
  photos: 'id',
  savedMeals: 'id, order, originEntryId',
  weighIns: 'id, at',
  bodyFat: 'id, at',
  water: 'id, at, dayKey',
  fasts: 'id, start, end',
  coachMessages: 'id, at',
  settings: 'key',
  secrets: 'id',
  drafts: 'id',
  quarantine: '++seq, table, at',
  meta: 'key',
} as const;

export type TableName = keyof typeof TABLES;

export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

/**
 * Tables added after version 1, each by its upgrade step below. They hold copies of data read from
 * elsewhere, so backups leave them out (`TABLE_NAMES` lists version 1's tables only).
 */
export const ADDED_TABLES = {
  /** Version 2 (P11-03): one row per local day of activity read from Health Connect. */
  activity: 'day',
} as const;

/** Every table the current schema holds. */
export type StoreName = TableName | keyof typeof ADDED_TABLES;

// ---- Rows -----------------------------------------------------------------------------------

/** The key of the one profile row. */
export const PROFILE_KEY = 'me';

export type ProfileRow = Profile & { id: typeof PROFILE_KEY };

/** A diary entry as stored: `barcodeKey` is derived on write (P02-06) for label lookups. */
export type EntryRow = DiaryEntry & { barcodeKey?: string };

/** A photo and its thumbnail. Sizes in pixels, `bytes` of the full photo. */
export interface PhotoRow {
  id: string;
  blob: Blob;
  thumb?: Blob;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
}

/** A raw value kept aside because it could not be read (P02-02). Never decoded. */
export interface QuarantineRow {
  seq: number;
  /** The table the value came from. */
  table: string;
  /** Its primary key there. */
  key: string;
  /** When it was kept aside, epoch ms. */
  at: number;
  raw: unknown;
  /** `fingerprint(raw)`, so the same value is kept once. */
  hash: string;
}

/** A row of the key/value tables (`settings`, `meta`); the value is checked per key. */
export interface KeyValueRow {
  key: string;
  value: unknown;
}

/** A row whose shape belongs to its repository (`secrets`: P02-12, `drafts`: P02-13). */
export type OwnedRow = { id: string } & Record<string, unknown>;

/** A workout another app recorded in Health Connect (P11-03). Instants are epoch ms. */
export interface ActivitySession {
  /** Health Connect's own id of the record. */
  id: string;
  start: number;
  end: number;
  /** The exercise type as the plugin names it. */
  type: string;
  title: string | null;
  activeKcal: number | null;
  /** The app that recorded it. */
  source: string;
}

/**
 * One local day of activity read from Health Connect (P11-03). A value is null when it was not
 * allowed or Health Connect had none; nothing here is ever added up by Platewise.
 */
export interface ActivityRow {
  day: DayKey;
  steps: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  /** Metres. */
  distanceM: number | null;
  /** The day's workouts, by start. */
  sessions: ActivitySession[];
  /** When these values were stored, epoch ms. */
  syncedAt: number;
}

/** The database with typed tables. */
export type PlatewiseDb = Dexie & {
  profile: Table<ProfileRow, string>;
  entries: Table<EntryRow, string>;
  photos: Table<PhotoRow, string>;
  savedMeals: Table<SavedMeal, string>;
  weighIns: Table<WeighIn, string>;
  bodyFat: Table<BodyFatReading, string>;
  water: Table<WaterLog, string>;
  fasts: Table<Fast, string>;
  coachMessages: Table<CoachMessage, string>;
  settings: Table<KeyValueRow, string>;
  secrets: Table<OwnedRow, string>;
  drafts: Table<OwnedRow, string>;
  quarantine: EntityTable<QuarantineRow, 'seq'>;
  meta: Table<KeyValueRow, string>;
  activity: Table<ActivityRow, string>;
};

// ---- Upgrades -------------------------------------------------------------------------------

/**
 * One schema version after 1. `stores` lists only the tables that change (a schema string, or
 * `null` to delete a table, which needs a `migrate` that moved its rows first). `migrate` runs
 * inside the upgrade transaction; if it throws, IndexedDB rolls the whole upgrade back and the
 * database stays at the previous version with every row.
 */
export interface UpgradeStep {
  readonly version: number;
  readonly stores: Readonly<Record<string, string | null>>;
  readonly migrate?: (tx: Transaction) => Promise<void> | void;
}

/** The upgrade steps in version order: 2, 3, … */
export const UPGRADES: readonly UpgradeStep[] = [
  // P11-03: the Health Connect activity copy. A new, empty table: nothing to move.
  { version: 2, stores: { activity: ADDED_TABLES.activity } },
];

/** The schema version the given steps lead to (1 with no steps). */
export function schemaVersion(steps: readonly UpgradeStep[] = UPGRADES): number {
  return steps.length === 0 ? 1 : Math.max(...steps.map((step) => step.version));
}

/** Problems with a list of steps (empty when it is usable): order, numbering, unsafe deletes. */
export function checkSteps(steps: readonly UpgradeStep[]): string[] {
  const problems: string[] = [];
  let previous = 1;
  for (const step of steps) {
    if (!Number.isInteger(step.version) || step.version <= previous) {
      problems.push(`version ${step.version} must be a whole number above ${previous}`);
    }
    previous = Math.max(previous, step.version);
    for (const [table, spec] of Object.entries(step.stores)) {
      if (spec === null && !step.migrate) {
        problems.push(`version ${step.version} deletes ${table} without moving its rows`);
      }
    }
  }
  return problems;
}

/** Declares version 1 and every step on a Dexie instance that has not been opened yet. */
export function declareSchema(db: Dexie, steps: readonly UpgradeStep[] = UPGRADES): void {
  const problems = checkSteps(steps);
  if (problems.length > 0) throw new RangeError(`Bad upgrade steps: ${problems.join('; ')}`);
  db.version(1).stores(TABLES);
  for (const step of steps) {
    const version = db.version(step.version).stores({ ...step.stores });
    if (step.migrate) version.upgrade(step.migrate);
  }
}
