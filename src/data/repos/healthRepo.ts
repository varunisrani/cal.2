// What the Android app keeps from Health Connect (P11-03, D-16.89): one activity row per local day
// (steps, active and total energy, distance, the day's workouts), the weigh-ins other apps
// recorded, and three pieces of device state in `meta`: the ids of the weigh-ins imported so far,
// what was last sent back to Health Connect under each client id, and when the last sync ended.
//
// The activity rows are a copy: a sync writes a day only when its values changed, and a day with
// nothing in it only over a stored one, so a second sync with the same answers writes nothing. An
// imported weigh-in's id is made from its Health Connect id, so reading it again never doubles it;
// an id imported before that is no longer stored was deleted here and is never brought back
// (R07.22). Rows that cannot be read are kept aside by the guard, as everywhere.

import type { PromiseExtended } from 'dexie';
import { isDayKey, type DayKey } from '../../domain/dates/dayKey';
import type { WeighIn } from '../../domain/model';
import { systemClock, type Clock } from '../../lib/clock';
import { decodeWeighIn, type Codec } from '../codecs';
import { GUARD_TABLES, decodeRows, fingerprint, readAll, readOne, writeOne } from '../guard';
import type { ActivityRow, ActivitySession, PlatewiseDb } from '../schema';
import { followNewestWeighIn } from './weightRepo';

/** The start of every imported weigh-in's id; the rest is its Health Connect id. */
export const IMPORTED_WEIGH_IN_PREFIX = 'health-';

/** The `meta` keys of the device state kept here. */
export const HEALTH_META_KEYS = {
  imported: 'healthImported',
  sent: 'healthSent',
  lastSync: 'healthLastSync',
} as const;

/** The weigh-in id of a reading Health Connect holds under `recordId`. */
export function importedWeighInId(recordId: string): string {
  return `${IMPORTED_WEIGH_IN_PREFIX}${recordId}`;
}

/** True for a weigh-in that came from Health Connect rather than being typed here. */
export function isImportedWeighIn(id: string): boolean {
  return id.startsWith(IMPORTED_WEIGH_IN_PREFIX);
}

/** What was last sent to Health Connect under one client id. */
export interface SentRecord {
  readonly kind: 'nutrition' | 'weight';
  /** The local day the record belongs to; a record whose day leaves the window is forgotten. */
  readonly day: DayKey;
  /** A fingerprint of the record as sent: an equal one needs no new send. */
  readonly sig: string;
}

/** Sent records by client id (an entry's or a weigh-in's own id). */
export type SentLedger = Readonly<Record<string, SentRecord>>;

export interface ImportOutcome {
  /** Readings stored for the first time. */
  readonly added: number;
  /** Stored readings whose value or time changed in Health Connect. */
  readonly replaced: number;
  /** Readings left out because the person deleted them here. */
  readonly skipped: number;
}

export interface HealthRepo {
  /** The stored days `firstKey`…`lastKey`, oldest first. */
  between(firstKey: DayKey, lastKey: DayKey): PromiseExtended<ActivityRow[]>;
  /**
   * Stores each row whose values differ from the stored day's (`syncedAt` aside); a row with
   * nothing in it is stored only over an existing day. Resolves with how many were written.
   */
  putDays(rows: readonly ActivityRow[]): Promise<number>;
  /**
   * Stores readings from Health Connect under their own ids (`importedWeighInId`): new ones are
   * added, changed ones replaced, deleted ones skipped; then the profile weight follows the
   * newest reading. No goal check: an import is history, not a reading typed in.
   */
  importWeighIns(readings: readonly WeighIn[]): Promise<ImportOutcome>;
  /** What was last sent back, by client id. */
  sent(): Promise<SentLedger>;
  /** Records new sends and forgets ids, in one write. */
  updateSent(changes: {
    readonly set?: SentLedger;
    readonly remove?: readonly string[];
  }): Promise<void>;
  /** When the last sync ended, epoch ms, or null before the first. */
  lastSyncAt(): Promise<number | null>;
  setLastSyncAt(ms: number): Promise<void>;
}

export interface HealthRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
}

// ---- Codecs ---------------------------------------------------------------------------------

type Fields = Record<string, unknown>;

function fieldsOf(raw: unknown): Fields | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Fields) : null;
}

/** A finite number of 0 or more, else null. */
function amountOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function decodeSession(raw: unknown): ActivitySession | null {
  const fields = fieldsOf(raw);
  if (!fields) return null;
  const { id, start, end, type, title, source } = fields;
  if (typeof id !== 'string' || id === '' || typeof type !== 'string') return null;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return {
    id,
    start,
    end,
    type,
    title: typeof title === 'string' && title !== '' ? title : null,
    activeKcal: amountOrNull(fields.activeKcal),
    source: typeof source === 'string' ? source : '',
  };
}

/** An activity row; unreadable only without a day key or a time it was stored. */
export const decodeActivity: Codec<ActivityRow> = (raw) => {
  const fields = fieldsOf(raw);
  if (!fields || !isDayKey(fields.day)) return null;
  const syncedAt = fields.syncedAt;
  if (typeof syncedAt !== 'number' || !Number.isFinite(syncedAt)) return null;
  const sessions = Array.isArray(fields.sessions)
    ? fields.sessions.flatMap((session) => decodeSession(session) ?? [])
    : [];
  return {
    day: fields.day,
    steps: amountOrNull(fields.steps),
    activeKcal: amountOrNull(fields.activeKcal),
    totalKcal: amountOrNull(fields.totalKcal),
    distanceM: amountOrNull(fields.distanceM),
    sessions,
    syncedAt,
  };
};

function valueOf(raw: unknown): unknown {
  return fieldsOf(raw)?.value;
}

const decodeImported: Codec<string[]> = (raw) => {
  const value = valueOf(raw);
  return Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : null;
};

function readSent(raw: unknown): SentRecord | null {
  const fields = fieldsOf(raw);
  if (!fields) return null;
  const { kind, day, sig } = fields;
  if ((kind !== 'nutrition' && kind !== 'weight') || !isDayKey(day)) return null;
  return typeof sig === 'string' ? { kind, day, sig } : null;
}

const decodeSent: Codec<Record<string, SentRecord>> = (raw) => {
  const value = fieldsOf(valueOf(raw));
  if (!value) return null;
  const ledger: Record<string, SentRecord> = {};
  for (const [id, record] of Object.entries(value)) {
    const read = readSent(record);
    // One damaged record makes the ledger unreadable: guessing would resend or lose a delete.
    if (!read) return null;
    ledger[id] = read;
  }
  return ledger;
};

const decodeLastSync: Codec<number> = (raw) => {
  const value = valueOf(raw);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
};

/** True when a row holds nothing: no value and no workout. */
export function isEmptyDay(row: ActivityRow): boolean {
  return (
    row.steps === null &&
    row.activeKcal === null &&
    row.totalKcal === null &&
    row.distanceM === null &&
    row.sessions.length === 0
  );
}

/** A fingerprint of a row's values, `syncedAt` aside. */
function valuesOf(row: ActivityRow): string {
  return fingerprint({ ...row, syncedAt: 0 });
}

// ---- The repository ---------------------------------------------------------------------------

export function createHealthRepo(db: PlatewiseDb, options: HealthRepoOptions = {}): HealthRepo {
  const clock = options.clock ?? systemClock;
  const dayTables = [db.activity, ...GUARD_TABLES];
  const weighInTables = [db.weighIns, db.profile, ...GUARD_TABLES];

  async function readMeta<T>(key: string, codec: Codec<T>): Promise<T | null> {
    const stored = await readOne(db, 'meta', key, codec, clock);
    return stored.kind === 'ok' ? stored.value : null;
  }

  function writeMeta<T>(key: string, value: unknown, codec: Codec<T>): Promise<void> {
    return writeOne(db, 'meta', { key, value }, codec, clock);
  }

  return {
    between(firstKey, lastKey) {
      return db.activity
        .where('day')
        .between(firstKey, lastKey, true, true)
        .toArray()
        .then((rows) => decodeRows(db, 'activity', rows, decodeActivity, clock).items);
    },

    async putDays(rows) {
      const clean = rows.map((row) => {
        const read = decodeActivity(row);
        if (!read) throw new TypeError(`Refusing an activity row that cannot be read back`);
        return read;
      });
      return db.transaction('rw', dayTables, async () => {
        let written = 0;
        for (const row of clean) {
          const raw: unknown = await db.activity.get(row.day);
          const stored = raw === undefined ? null : decodeActivity(raw);
          if (raw === undefined && isEmptyDay(row)) continue;
          if (stored && valuesOf(stored) === valuesOf(row)) continue;
          await writeOne(db, 'activity', row, decodeActivity, clock);
          written++;
        }
        return written;
      });
    },

    async importWeighIns(readings) {
      return db.transaction('rw', weighInTables, async () => {
        const imported = new Set((await readMeta(HEALTH_META_KEYS.imported, decodeImported)) ?? []);
        const stored = new Map(
          (await readAll(db, 'weighIns', decodeWeighIn, clock)).items.map((w) => [w.id, w]),
        );
        let added = 0;
        let replaced = 0;
        let skipped = 0;
        for (const reading of readings) {
          const clean = decodeWeighIn(reading);
          if (!clean || !isImportedWeighIn(clean.id)) continue;
          const held = stored.get(clean.id);
          if (!held && imported.has(clean.id)) {
            skipped++;
            continue;
          }
          if (held && held.at === clean.at && Math.abs(held.kg - clean.kg) < 1e-9) continue;
          await writeOne(db, 'weighIns', clean, decodeWeighIn, clock);
          if (held) replaced++;
          else added++;
          stored.set(clean.id, clean);
          imported.add(clean.id);
        }
        if (added + replaced > 0) {
          await writeMeta(HEALTH_META_KEYS.imported, [...imported], decodeImported);
          await followNewestWeighIn(db, clock);
        }
        return { added, replaced, skipped };
      });
    },

    async sent() {
      return (await readMeta(HEALTH_META_KEYS.sent, decodeSent)) ?? {};
    },

    async updateSent({ set = {}, remove = [] }) {
      await db.transaction('rw', [...GUARD_TABLES], async () => {
        const ledger = { ...((await readMeta(HEALTH_META_KEYS.sent, decodeSent)) ?? {}) };
        for (const id of remove) delete ledger[id];
        Object.assign(ledger, set);
        await writeMeta(HEALTH_META_KEYS.sent, ledger, decodeSent);
      });
    },

    lastSyncAt() {
      return readMeta(HEALTH_META_KEYS.lastSync, decodeLastSync);
    },

    setLastSyncAt(ms) {
      return writeMeta(HEALTH_META_KEYS.lastSync, ms, decodeLastSync);
    },
  };
}
