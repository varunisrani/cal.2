// The IndexedDB layout: one database, its tables and indexes, and the numbered steps that move a
// database from one version to the next. Dexie reads the store strings below: the first field is
// the primary key (`++` = counted by the database), the rest are indexes (`[a+b]` = compound).

import type { Dexie, IndexableType, Transaction } from 'dexie';
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

/** The version every install starts at; later versions come from `UPGRADE_STEPS`. */
export const BASE_VERSION = 1;

/** Version 1: every table and its indexes. */
export const BASE_STORES = {
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

export type TableName = keyof typeof BASE_STORES;

export const TABLE_NAMES = Object.keys(BASE_STORES) as readonly TableName[];

// ---- Rows ---------------------------------------------------------------------------------------

/** The one profile row. */
export interface ProfileRow extends Profile {
  id: 'me';
}

/** A diary row: the entry plus the normalised barcode the diary repository derives on write. */
export interface EntryRow extends DiaryEntry {
  barcodeKey?: string;
}

/** A stored photo and its thumbnail. */
export interface PhotoRow {
  id: string;
  blob: Blob;
  thumb?: Blob;
  width: number;
  height: number;
  /** Size of `blob` plus `thumb` in bytes. */
  bytes: number;
  createdAt: number;
}

/** A key-value row (`settings`, `meta`). */
export interface KeyedRow {
  key: string;
  value: unknown;
}

/** A row whose shape belongs to a later task (`secrets`: P02-12, `drafts`: P02-13). */
export interface LooseRow {
  id: string;
  [field: string]: unknown;
}

/** A stored value that could not be read, kept aside untouched (P02-02). */
export interface QuarantineRow {
  /** Counted by the database. */
  seq?: number;
  table: TableName;
  /** The primary key the value was stored under. */
  key: IndexableType;
  at: number;
  /** The value exactly as it was read. */
  raw: unknown;
  /** Fingerprint of `raw`, to find an earlier copy of the same value. */
  hash: string;
}

/** The row type of each table. */
export interface Rows {
  profile: ProfileRow;
  entries: EntryRow;
  photos: PhotoRow;
  savedMeals: SavedMeal;
  weighIns: WeighIn;
  bodyFat: BodyFatReading;
  water: WaterLog;
  fasts: Fast;
  coachMessages: CoachMessage;
  settings: KeyedRow;
  secrets: LooseRow;
  drafts: LooseRow;
  quarantine: QuarantineRow;
  meta: KeyedRow;
}

// ---- Upgrade steps ------------------------------------------------------------------------------

/** One move to the next version. Every step must keep every row (schema.test.ts checks). */
export interface UpgradeStep {
  /** A whole number above the previous step's (the first step is 2). */
  version: number;
  /** Store strings of the tables this version adds or re-indexes; `null` removes a table. */
  stores: Record<string, string | null>;
  /** Rewrites rows inside the upgrade transaction. A throw leaves the old version as it was. */
  migrate?: (tx: Transaction) => PromiseLike<unknown> | void;
  /** What changes and why, in one line. */
  why: string;
}

/** Every upgrade step, oldest first. Empty until a phase needs version 2. */
export const UPGRADE_STEPS: readonly UpgradeStep[] = [];

/** The version a build with these steps opens. */
export function schemaVersion(steps: readonly UpgradeStep[] = UPGRADE_STEPS): number {
  return steps.reduce((latest, step) => Math.max(latest, step.version), BASE_VERSION);
}

/** Problems with a step list: versions must be whole, above 1 and strictly increasing. */
export function checkSteps(steps: readonly UpgradeStep[]): string[] {
  const problems: string[] = [];
  let previous = BASE_VERSION;
  for (const step of steps) {
    if (!Number.isInteger(step.version)) {
      problems.push(`version ${step.version} is not a whole number`);
    } else if (step.version <= previous) {
      problems.push(`version ${step.version} does not come after ${previous}`);
    }
    if (!step.why.trim()) problems.push(`version ${step.version} does not say why`);
    previous = Math.max(previous, step.version);
  }
  return problems;
}

/** Declares version 1 and every step on a Dexie instance that has not been opened yet. */
export function declareSchema(db: Dexie, steps: readonly UpgradeStep[] = UPGRADE_STEPS): void {
  const problems = checkSteps(steps);
  if (problems.length > 0) throw new RangeError(`Bad upgrade steps: ${problems.join('; ')}`);
  db.version(BASE_VERSION).stores(BASE_STORES);
  for (const step of steps) {
    const version = db.version(step.version).stores(step.stores);
    const { migrate } = step;
    if (migrate) version.upgrade((tx) => migrate(tx));
  }
}
