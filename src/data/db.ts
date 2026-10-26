// Opening the database, and the one transaction helper repositories use.
//
// Opening never deletes or rewrites what is on disk (R06.4). A database from a newer build is
// refused before Dexie sees it (Dexie 4 would open it at its own version and could add tables to
// it), and a failed upgrade step leaves the old version and its rows in place: IndexedDB rolls the
// upgrade transaction back. Both end in a DbOpenError the app can show, never a crash loop.

import { Dexie, type Table } from 'dexie';
import { appBus, type AppBus } from './bus';
import {
  DB_NAME,
  UPGRADE_STEPS,
  declareSchema,
  schemaVersion,
  type Rows,
  type TableName,
  type UpgradeStep,
} from './schema';

/** Primary key type per table: the quarantine counts its rows, every other table uses strings. */
export type KeyOf<Name extends TableName> = Name extends 'quarantine' ? number : string;

/** The opened database: a Dexie instance with one typed table per entry of `Rows`. */
export type PlatewiseDb = Dexie & {
  readonly [Name in TableName]: Table<Rows[Name], KeyOf<Name>>;
};

export type DbOpenErrorKind =
  /** The database on disk was written by a newer build. */
  | 'newer-schema'
  /** An upgrade step failed; the previous version is still on disk. */
  | 'upgrade-failed'
  /** This browser offers no IndexedDB here (some private modes, very old browsers). */
  | 'unavailable'
  | 'failed';

export class DbOpenError extends Error {
  override readonly name = 'DbOpenError';

  constructor(
    readonly kind: DbOpenErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface OpenOptions {
  /** Database name; tests give each database its own. */
  name?: string;
  /** IndexedDB factory; tests pass a fresh fake one. */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  /** Upgrade steps to declare; tests try sample steps. */
  steps?: readonly UpgradeStep[];
  /** Where to post `reload-needed`; the app's bus by default. */
  bus?: AppBus;
}

// Dexie asks IndexedDB for its version number times 10 and may add 1 to patch a schema in place,
// so version n covers the native versions n × 10 … n × 10 + 9.
const NATIVE_STEP = 10;

function dexieVersionOf(nativeVersion: number): number {
  return Math.floor(nativeVersion / NATIVE_STEP);
}

/** The native version of `name` on disk, or undefined when it is absent or the browser cannot say. */
async function versionOnDisk(factory: IDBFactory, name: string): Promise<number | undefined> {
  if (typeof factory.databases !== 'function') return undefined;
  try {
    const found = (await factory.databases()).find((info) => info.name === name);
    return found?.version;
  } catch {
    return undefined;
  }
}

function explain(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function openFailure(error: unknown, upgrading: boolean): DbOpenError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'MissingAPIError' || name === 'InvalidStateError') {
    return new DbOpenError('unavailable', `IndexedDB is not available: ${explain(error)}`, {
      cause: error,
    });
  }
  if (name === 'VersionError') {
    return new DbOpenError('newer-schema', 'The database was written by a newer version', {
      cause: error,
    });
  }
  if (upgrading || name === 'UpgradeError') {
    return new DbOpenError('upgrade-failed', `Upgrading the database failed: ${explain(error)}`, {
      cause: error,
    });
  }
  return new DbOpenError('failed', `Opening the database failed: ${explain(error)}`, {
    cause: error,
  });
}

function newerSchema(onDisk: number, ours: number): DbOpenError {
  return new DbOpenError(
    'newer-schema',
    `The database is at version ${dexieVersionOf(onDisk)}; this build knows version ${ours}`,
  );
}

/**
 * Opens (creating or upgrading as needed) the app's database. Rejects with a DbOpenError and
 * leaves the database on disk untouched when it cannot.
 */
export async function openDb(options: OpenOptions = {}): Promise<PlatewiseDb> {
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new DbOpenError('unavailable', 'IndexedDB is not available');
  const name = options.name ?? DB_NAME;
  const steps = options.steps ?? UPGRADE_STEPS;
  const ours = schemaVersion(steps);

  const onDisk = await versionOnDisk(factory, name);
  if (onDisk !== undefined && dexieVersionOf(onDisk) > ours) throw newerSchema(onDisk, ours);
  const upgrading = onDisk !== undefined && onDisk > 0 && dexieVersionOf(onDisk) < ours;

  const db = new Dexie(name, {
    indexedDB: factory,
    IDBKeyRange: options.IDBKeyRange ?? globalThis.IDBKeyRange,
  }) as PlatewiseDb;
  declareSchema(db, steps);

  // Another tab wants to upgrade or delete the database. Close at once so it is not blocked, and
  // close for good: a silent reopen would skip the checks above. Returning false stops Dexie's
  // own handler, which would allow that reopen.
  db.on('versionchange', (event: IDBVersionChangeEvent) => {
    db.close();
    (options.bus ?? appBus()).post({
      type: 'reload-needed',
      reason: event.newVersion === null ? 'deleted' : 'upgrade',
    });
    return false;
  });

  try {
    await db.open();
  } catch (error) {
    db.close();
    throw openFailure(error, upgrading);
  }

  // Another tab may have upgraded between the check above and the open, and Dexie then opens the
  // newer version as it is.
  const opened = db.backendDB().version;
  if (dexieVersionOf(opened) > ours) {
    db.close();
    throw newerSchema(opened, ours);
  }
  return db;
}

/** Read-only (`r`) or read-write (`rw`). */
export type TxMode = 'r' | 'rw';

/** Tables every read-write transaction also covers, so unreadable rows can be kept aside in it. */
export const GUARD_TABLES: readonly TableName[] = ['quarantine', 'meta'];

/**
 * Runs `body` in one transaction over `tables`. A read-write transaction also covers
 * `quarantine` and `meta`. A throw (or rejection) inside `body` rolls every change back. Inside
 * another transaction this joins it, so the outer one must cover the same tables.
 */
export function transact<T>(
  db: PlatewiseDb,
  mode: TxMode,
  tables: readonly TableName[],
  body: () => Promise<T>,
): Promise<T> {
  const names = mode === 'rw' ? [...new Set([...tables, ...GUARD_TABLES])] : [...tables];
  return db.transaction(mode, names, body);
}
