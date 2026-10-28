// The store's side of a backup and a restore (P09-13, R06.6). `read` takes every row of the named
// tables in one read transaction, so a backup never mixes rows from before and after a change;
// rows that cannot be read are left out and kept aside by the guard, as every read does. `restore`
// writes everything a restore brings in one read-write transaction: when any step fails, IndexedDB
// rolls the whole transaction back and every table is as it was. Inside it, stored rows that
// cannot be read are copied aside before they are deleted or replaced (R06.1), and the `restoring`
// flag is set, so photo cleanup in any tab waits until `endRestore` (after the restore's own
// follow-up steps). The flag lives in the same transaction, so a restore that fails never leaves
// it behind.

import { systemClock, type Clock } from '../../lib/clock';
import {
  decodeBodyFat,
  decodeCoachChat,
  decodeCoachMessage,
  decodeEntry,
  decodeFast,
  decodePhoto,
  decodeProfile,
  decodeSavedMeal,
  decodeWalk,
  decodeWater,
  decodeWeighIn,
  type Codec,
} from '../codecs';
import { GUARD_TABLES, WriteBlockedError, decodeRows, keepAside } from '../guard';
import { PROFILE_KEY, type PlatewiseDb, type TableName, type KEPT_ADDED_TABLES } from '../schema';
import { isSettingKey, readSetting } from '../settingsSchema';
import { decodeDraftRow } from './draftsRepo';
import { RESTORING_FLAG } from './photoRepo';

/**
 * Tables a backup may carry: every table of version 1 but the keys, the rows kept aside and device
 * state, and the added tables of the person's own records (the walks, P15-02; the Coach's chats,
 * P16-02).
 */
export type BackupTable =
  Exclude<TableName, 'secrets' | 'quarantine' | 'meta'> | (typeof KEPT_ADDED_TABLES)[number];

/** Rows by table. */
export type TableRows = Partial<Record<BackupTable, readonly object[]>>;

function fieldsOf(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

// A settings row is damage only when its key is a v1 setting and the value cannot be used; a key
// this build does not know is an older or newer build's setting, ignored like the settings
// repository ignores it.
const decodeSettingRow: Codec<object> = (raw) => {
  const fields = fieldsOf(raw);
  if (!fields || typeof fields.key !== 'string' || !('value' in fields)) return null;
  if (!isSettingKey(fields.key)) return fields;
  return readSetting(fields.key, fields.value) === undefined ? null : fields;
};

/** The profile row must sit under its one key. */
const decodeProfileRow: Codec<object> = (raw) =>
  fieldsOf(raw)?.id === PROFILE_KEY ? decodeProfile(raw) : null;

/** How each table tells a readable row from one that cannot be read. */
export const BACKUP_CODECS: Readonly<Record<BackupTable, Codec<unknown>>> = {
  profile: decodeProfileRow,
  entries: decodeEntry,
  photos: decodePhoto,
  savedMeals: decodeSavedMeal,
  weighIns: decodeWeighIn,
  bodyFat: decodeBodyFat,
  water: decodeWater,
  fasts: decodeFast,
  coachMessages: decodeCoachMessage,
  settings: decodeSettingRow,
  drafts: decodeDraftRow,
  walks: decodeWalk,
  coachChats: decodeCoachChat,
};

export interface RestorePlan {
  /** Tables whose stored rows are all replaced by these. */
  readonly replace: TableRows;
  /** Tables whose rows are written over the stored ones with the same key; others stay. */
  readonly upsert: TableRows;
  /** When `settings` is replaced, the stored rows under these keys stay as they are. */
  readonly keepSettings: readonly string[];
}

export interface BackupRepo {
  /** The readable rows of `tables` as stored, read together in one transaction. */
  read(tables: readonly BackupTable[]): Promise<Record<BackupTable, unknown[]>>;
  /**
   * Applies a restore in one transaction and sets the `restoring` flag in it. Rejects, changing
   * nothing, when any write fails or an unreadable row cannot be kept aside (`WriteBlockedError`).
   */
  restore(plan: RestorePlan): Promise<void>;
  /** Clears the `restoring` flag (after the restore's follow-up, or one a closed tab left). */
  endRestore(): Promise<void>;
}

export interface BackupRepoOptions {
  /** The time kept-aside copies are stamped with. */
  clock?: Clock;
}

function tablesOf(rows: TableRows): BackupTable[] {
  return (Object.keys(rows) as BackupTable[]).filter((name) => rows[name] !== undefined);
}

export function createBackupRepo(db: PlatewiseDb, options: BackupRepoOptions = {}): BackupRepo {
  const clock = options.clock ?? systemClock;

  function keyOf(table: BackupTable, raw: unknown): string {
    const path = db.table(table).schema.primKey.keyPath;
    return typeof path === 'string' ? String(fieldsOf(raw)?.[path]) : '';
  }

  /** Inside the restore: copies an unreadable stored row aside, or stops the whole restore. */
  async function keepIfUnreadable(table: BackupTable, raw: unknown): Promise<void> {
    if (raw === undefined || BACKUP_CODECS[table](raw) !== null) return;
    const key = keyOf(table, raw);
    try {
      await keepAside(db, table, key, raw, clock);
    } catch (cause) {
      throw new WriteBlockedError(table, key, cause);
    }
  }

  async function replaceTable(
    table: BackupTable,
    rows: readonly object[],
    keep: ReadonlySet<string>,
  ): Promise<void> {
    const store = db.table(table);
    const stored: unknown[] = await store.toArray();
    const kept: object[] = [];
    for (const raw of stored) {
      await keepIfUnreadable(table, raw);
      const key = fieldsOf(raw)?.key;
      if (table === 'settings' && typeof key === 'string' && keep.has(key))
        kept.push(raw as object);
    }
    await store.clear();
    await store.bulkPut([...rows, ...kept]);
  }

  async function upsertTable(table: BackupTable, rows: readonly object[]): Promise<void> {
    const store = db.table(table);
    const stored: unknown[] = await store.bulkGet(rows.map((row) => keyOf(table, row)));
    for (const raw of stored) await keepIfUnreadable(table, raw);
    await store.bulkPut([...rows]);
  }

  return {
    read(tables) {
      return db.transaction('r', [...tables], async () => {
        const result = {} as Record<BackupTable, unknown[]>;
        for (const table of tables) {
          const codec = BACKUP_CODECS[table];
          const rows: unknown[] = await db.table(table).toArray();
          // The guard keeps the unreadable rows aside later, outside this read.
          decodeRows(
            db,
            table,
            rows.filter((raw) => codec(raw) === null),
            codec,
            clock,
          );
          result[table] = rows.filter((raw) => codec(raw) !== null);
        }
        return result;
      });
    },

    restore(plan) {
      const replaced = tablesOf(plan.replace);
      const upserted = tablesOf(plan.upsert);
      const keep = new Set(plan.keepSettings);
      const scope = [...new Set([...replaced, ...upserted, ...GUARD_TABLES])];
      return db.transaction('rw', scope, async () => {
        await db.meta.put({ key: RESTORING_FLAG, value: true });
        for (const table of replaced) await replaceTable(table, plan.replace[table] ?? [], keep);
        for (const table of upserted) await upsertTable(table, plan.upsert[table] ?? []);
      });
    },

    async endRestore() {
      await db.meta.delete(RESTORING_FLAG);
    },
  };
}
