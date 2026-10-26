// Opening the database without ever risking it (R06.4). A database written by a newer Platewise,
// a failed upgrade or a missing IndexedDB ends in a DbOpenError for the boot screen; no branch
// deletes or rewrites what is on disk. When another tab upgrades or deletes the database, this
// tab lets go of it at once and asks for a reload.

import { Dexie } from 'dexie';
import { appBus, type Bus } from './bus';
import {
  DB_NAME,
  UPGRADES,
  declareSchema,
  schemaVersion,
  type PlatewiseDb,
  type UpgradeStep,
} from './schema';

/**
 * Why the database could not be opened:
 * - `newer`: a newer version of the app wrote it; this build must not touch it.
 * - `upgrade`: moving it to this build's version failed; it stays at its old version.
 * - `unavailable`: the browser offers no IndexedDB here (some private modes).
 * - `failed`: anything else the browser reported.
 */
export type DbOpenErrorKind = 'newer' | 'upgrade' | 'unavailable' | 'failed';

const SUMMARIES: Record<DbOpenErrorKind, string> = {
  newer: 'The stored data was written by a newer version of the app',
  upgrade: 'The stored data could not be upgraded to this version of the app',
  unavailable: 'This browser offers no database storage here',
  failed: 'The database could not be opened',
};

export class DbOpenError extends Error {
  override readonly name = 'DbOpenError';
  readonly kind: DbOpenErrorKind;
  /** The schema version this build opens. */
  readonly expected: number;
  /** The schema version found on disk, when the probe could read one. */
  readonly found: number | null;

  constructor(
    kind: DbOpenErrorKind,
    details: { expected: number; found?: number | null; cause?: unknown },
  ) {
    super(SUMMARIES[kind], { cause: details.cause });
    this.kind = kind;
    this.expected = details.expected;
    this.found = details.found ?? null;
  }
}

export interface OpenOptions {
  /** Defaults to `platewise`. */
  name?: string;
  /** Defaults to the browser's; tests pass a fresh fake factory. */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  /** Defaults to `UPGRADES`; tests pass their own steps. */
  steps?: readonly UpgradeStep[];
  /** Where `reload-needed` goes; defaults to the app bus. */
  bus?: Bus;
}

/** Dexie stores version n as native version 10n (plus one per automatic schema patch). */
function dexieVersion(nativeVersion: number): number {
  return Math.floor(nativeVersion / 10);
}

/**
 * The schema version on disk, or null when there is no database. A bare open never upgrades an
 * existing database; when nothing exists it would create one, so that creation is aborted.
 */
export function installedVersion(factory: IDBFactory, name: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let missing = false;
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      missing = true;
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      const connection = request.result;
      const version = connection.version;
      connection.close();
      resolve(dexieVersion(version));
    };
    request.onerror = (event) => {
      if (!missing) {
        reject(request.error);
        return;
      }
      event.preventDefault();
      resolve(null);
    };
  });
}

function failureKind(cause: unknown, found: number | null, expected: number): DbOpenErrorKind {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'VersionError') return 'newer';
  if (name === 'MissingAPIError') return 'unavailable';
  // An upgrade step's own error comes through unwrapped, so tell it by what was on disk.
  if (found !== null && found < expected) return 'upgrade';
  return 'failed';
}

/**
 * Opens the database at this build's schema version, creating it on first run and running the
 * upgrade steps when an older version is on disk. Rejects with `DbOpenError`.
 */
export async function openDb(options: OpenOptions = {}): Promise<PlatewiseDb> {
  const name = options.name ?? DB_NAME;
  const steps = options.steps ?? UPGRADES;
  const expected = schemaVersion(steps);
  const factory = options.indexedDB ?? (typeof indexedDB === 'undefined' ? undefined : indexedDB);
  if (!factory) throw new DbOpenError('unavailable', { expected });

  // Dexie would open a newer database as it is and patch our tables into it; look first.
  let found: number | null;
  try {
    found = await installedVersion(factory, name);
  } catch (cause) {
    throw new DbOpenError('unavailable', { expected, cause });
  }
  if (found !== null && found > expected) throw new DbOpenError('newer', { expected, found });

  const db = new Dexie(name, {
    indexedDB: factory,
    ...(options.IDBKeyRange ? { IDBKeyRange: options.IDBKeyRange } : {}),
  }) as PlatewiseDb;
  declareSchema(db, steps);

  const bus = options.bus ?? appBus();
  db.on('versionchange', () => {
    // Closing for good (no automatic reopen) lets the other tab's upgrade or delete go ahead
    // and keeps this tab from reopening into a schema it does not know.
    db.close();
    bus.post({ type: 'reload-needed' }, 'this-tab');
    // Skip Dexie's own handler, which would close with automatic reopening on.
    return false;
  });

  try {
    await db.open();
  } catch (cause) {
    db.close();
    throw new DbOpenError(failureKind(cause, found, expected), { expected, found, cause });
  }

  // Another tab may have upgraded between the probe and the open.
  const opened = dexieVersion(db.backendDB().version);
  if (opened > expected) {
    db.close();
    throw new DbOpenError('newer', { expected, found: opened });
  }
  return db;
}
