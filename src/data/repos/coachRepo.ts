// The Coach conversation, one record per message (D-16.29, R04.8): the text, its time, an optional
// small thumbnail of an attached photo, on a question whose turn failed, the failure for Retry
// (D-16.31), and on a reply the reminders it proposed with what became of them (P13). Storage is bounded: each append stores its message and, in the same transaction,
// deletes the oldest readable messages beyond the newest 200, thumbnails with them.
//
// Writes from this tab run one after another through a queue, in call order, so a reply, a retry
// mark and a Reset never interleave. Messages are listed oldest first by time; messages with the
// same time keep the order they were appended in, through a sequence number stored on the row
// (`seq`, not part of the message). Reset deletes every message and moves the conversation
// generation in `meta` on, so a reply that was still running when the person reset can be told
// apart and dropped (R04.6, D-16.34).
//
// A message that cannot be read (an unknown role, no time) is dropped from the list and kept aside
// by the guard. Appends, the cap and `patch` never overwrite or delete it; Reset keeps its raw value
// in quarantine before it deletes it (R04.7).

import { Dexie, type PromiseExtended } from 'dexie';
import type { CoachMessage, CoachMessageState, CoachReminderCard } from '../../domain/model';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeCoachMessage, type Codec } from '../codecs';
import { GUARD_TABLES, decodeRows, keepAside, readOne, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';

/** How many messages the conversation keeps (D-16.29). */
export const COACH_MESSAGE_LIMIT = 200;

/** The `meta` key of the conversation generation. */
export const GENERATION_KEY = 'coachGeneration';

/** A message to append; the repository gives it its id. */
export type NewCoachMessage = Omit<CoachMessage, 'id'>;

export interface CoachMessageChanges {
  text?: string;
  /** A failed turn's state, or null to clear it. */
  state?: CoachMessageState | null;
  /** A reply's reminder cards, all of them (P13). */
  reminders?: readonly CoachReminderCard[];
}

export interface CoachRepo {
  /** Stores a message after every earlier write of this tab; returns it with its new id. */
  append(message: NewCoachMessage): Promise<CoachMessage>;
  /**
   * The same, only while the conversation is still at `generation`; after a Reset nothing is
   * stored and the promise resolves to null.
   */
  append(message: NewCoachMessage, generation: number): Promise<CoachMessage | null>;
  /** The readable messages, oldest first. */
  list(): PromiseExtended<CoachMessage[]>;
  /** Changes a stored message; null when it is missing or unreadable (then nothing changes). */
  patch(id: string, changes: CoachMessageChanges): Promise<CoachMessage | null>;
  /** Deletes every message and moves the generation on; returns the new generation. */
  reset(): Promise<number>;
  /** The current conversation generation: 0 until the first Reset. */
  generation(): Promise<number>;
}

export interface CoachRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
  /** Ids for new messages; defaults to random UUIDs. */
  newId?: IdSource;
}

/** A message as stored: `seq` orders messages that share a time. */
type MessageRow = CoachMessage & { seq: number };

const MESSAGE_TABLES = ['coachMessages', ...GUARD_TABLES] as const;

/** The generation row of `meta`: a whole number of at least 0. */
const decodeGeneration: Codec<number> = (raw) => {
  const value = (raw as { value?: unknown } | null)?.value;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
};

/** A raw row's field, when the row is an object. */
function fieldOf(raw: unknown, key: string): unknown {
  return typeof raw === 'object' && raw !== null
    ? (raw as Record<string, unknown>)[key]
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The append sequence of a raw row; 0 for rows stored without one (a restore, say). */
function seqOf(raw: unknown): number {
  return numberOr(fieldOf(raw, 'seq'), 0);
}

/** Conversation order of raw rows: time, then append sequence, then id. */
function byConversationOrder(a: unknown, b: unknown): number {
  const aId = String(fieldOf(a, 'id'));
  const bId = String(fieldOf(b, 'id'));
  return (
    numberOr(fieldOf(a, 'at'), 0) - numberOr(fieldOf(b, 'at'), 0) ||
    seqOf(a) - seqOf(b) ||
    (aId < bId ? -1 : aId > bId ? 1 : 0)
  );
}

/** The message without its stored sequence number. */
function asMessage(row: MessageRow): CoachMessage {
  const { seq: _seq, ...message } = row;
  return message;
}

export function createCoachRepo(db: PlatewiseDb, options: CoachRepoOptions = {}): CoachRepo {
  const clock = options.clock ?? systemClock;
  const newId = options.newId ?? randomId;

  let tail: Promise<unknown> = Promise.resolve();

  /**
   * Runs `work` after every write queued before it has settled (a failed one does not stop the
   * queue), outside any transaction the caller may be in.
   */
  function queued<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(() => Dexie.ignoreTransaction(work));
    tail = run.catch(() => undefined);
    return run;
  }

  /** One read-write transaction over the messages and the guard's tables (`meta` among them). */
  function change<T>(work: () => Promise<T>): Promise<T> {
    return db.transaction('rw', [...MESSAGE_TABLES], work);
  }

  /** Readable messages of raw rows, oldest first; unreadable ones are kept aside. */
  function decoded(rows: unknown[]): CoachMessage[] {
    return decodeRows(
      db,
      'coachMessages',
      rows.sort(byConversationOrder),
      decodeCoachMessage,
      clock,
    ).items;
  }

  async function currentGeneration(): Promise<number> {
    const stored = await readOne(db, 'meta', GENERATION_KEY, decodeGeneration, clock);
    return stored.kind === 'ok' ? stored.value : 0;
  }

  /** The row to store; throws a TypeError for a message the codec cannot read back. */
  function toRow(message: CoachMessage, seq: number): MessageRow {
    const clean = decodeCoachMessage(message);
    if (!clean) {
      throw new TypeError(
        `Refusing to store Coach message "${message.id}": it cannot be read back`,
      );
    }
    return { ...clean, seq };
  }

  function append(message: NewCoachMessage): Promise<CoachMessage>;
  function append(message: NewCoachMessage, generation: number): Promise<CoachMessage | null>;
  async function append(
    message: NewCoachMessage,
    generation?: number,
  ): Promise<CoachMessage | null> {
    const checked = toRow({ ...message, id: newId() }, 0);
    return queued(() =>
      change(async () => {
        if (generation !== undefined && (await currentGeneration()) !== generation) return null;
        const rows: unknown[] = await db.coachMessages.toArray();
        const seq = rows.reduce((highest: number, raw) => Math.max(highest, seqOf(raw)), 0) + 1;
        const row: MessageRow = { ...checked, seq };
        await writeOne(db, 'coachMessages', row, decodeCoachMessage, clock);
        const messages = decoded([...rows, row]);
        const overflow = messages.length - COACH_MESSAGE_LIMIT;
        if (overflow > 0) {
          const oldest = messages.slice(0, overflow).map((kept) => kept.id);
          await removeRows(db, 'coachMessages', oldest, decodeCoachMessage, clock);
        }
        return asMessage(row);
      }),
    );
  }

  return {
    append,

    list: () => db.coachMessages.toArray().then((rows: unknown[]) => decoded(rows)),

    patch: (id, changes) =>
      queued(() =>
        change(async () => {
          const raw: unknown = await db.coachMessages.get(id);
          if (raw === undefined) return null;
          const current = decodeCoachMessage(raw);
          if (!current) {
            await keepAside(db, 'coachMessages', id, raw, clock);
            return null;
          }
          const next: CoachMessage = { ...current };
          if (changes.text !== undefined) next.text = changes.text;
          if (changes.state === null) delete next.state;
          else if (changes.state !== undefined) next.state = changes.state;
          if (changes.reminders !== undefined) next.reminders = [...changes.reminders];
          const row = toRow(next, seqOf(raw));
          await writeOne(db, 'coachMessages', row, decodeCoachMessage, clock);
          return asMessage(row);
        }),
      ),

    reset: () =>
      queued(() =>
        change(async () => {
          const next = (await currentGeneration()) + 1;
          const keys = await db.coachMessages.toCollection().primaryKeys();
          // Unreadable messages are kept aside by the guard before they go.
          await removeRows(db, 'coachMessages', keys, decodeCoachMessage, clock);
          await writeOne(db, 'meta', { key: GENERATION_KEY, value: next }, decodeGeneration, clock);
          return next;
        }),
      ),

    generation: currentGeneration,
  };
}
