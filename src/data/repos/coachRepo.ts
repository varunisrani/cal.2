// The Coach's chats and their messages (D-16.29, R04.8, P16-02, D-16.99). A chat is one record
// (its title, whether the person named it, when it started and when its newest message came); a
// message is one record carrying its chat's id: the text, its time, an optional small thumbnail of
// an attached photo, on a question whose turn failed the failure for Retry (D-16.31), and on a
// reply the reminders it proposed with what became of them (P13). A chat is stored together with
// its first message, titled from it, so a chat nobody wrote in never becomes a record. Storage is
// bounded per chat: each append stores its message and, in the same transaction, deletes that
// chat's oldest readable messages beyond its newest 200, thumbnails with them.
//
// Writes from this tab run one after another through a queue, in call order, so a reply, a retry
// mark, a rename and a delete never interleave. A chat's messages are listed oldest first by time;
// messages with the same time keep the order they were appended in, through a sequence number
// stored on the row (`seq`, not part of the message). Deleting a chat deletes its messages with
// it; a reply that was still running for it finds no chat and is not stored (R04.6, D-16.34): only
// an append that starts a chat may store one.
//
// A record that cannot be read (a message with an unknown role or no chat, a chat with no time) is
// dropped from the lists and kept aside by the guard. Appends, the cap and `patch` never overwrite
// or delete an unreadable message; deleting a chat keeps their raw values in quarantine first
// (R04.7). A chat record that cannot be read is made again from its messages on the next write.

import { Dexie, type PromiseExtended } from 'dexie';
import { chatTitle, typedTitle } from '../../domain/coach/chats';
import type {
  CoachChat,
  CoachMessage,
  CoachMessageState,
  CoachReminderCard,
  CoachRole,
} from '../../domain/model';
import { systemClock, type Clock } from '../../lib/clock';
import { newId as randomId, type IdSource } from '../../lib/ids';
import { decodeCoachChat, decodeCoachMessage } from '../codecs';
import { byConversationOrder, chatForRows, chatIdOf, seqOf } from '../coachRows';
import { GUARD_TABLES, decodeRows, keepAside, readOne, removeRows, writeOne } from '../guard';
import type { PlatewiseDb } from '../schema';

/** How many messages each chat keeps (D-16.29, per chat since P16-02). */
export const COACH_MESSAGE_LIMIT = 200;

/** A message to append, its chat named in it; the repository gives it its id. */
export type NewCoachMessage = Omit<CoachMessage, 'id'>;

export interface AppendOptions {
  /**
   * The message may start its chat: when the chat is not stored it is, titled from this message's
   * words. Without it, a message for a chat that is not stored (deleted meanwhile) is dropped.
   */
  readonly start?: boolean;
}

export interface CoachMessageChanges {
  text?: string;
  /** A failed turn's state, or null to clear it. */
  state?: CoachMessageState | null;
  /** A reply's reminder cards, all of them (P13). */
  reminders?: readonly CoachReminderCard[];
}

/** A chat as the Chats list shows it. */
export interface CoachChatSummary {
  readonly chat: CoachChat;
  /** Its newest readable message, whose it is and the words; null when none can be read. */
  readonly last: { readonly role: CoachRole; readonly text: string } | null;
}

export interface CoachRepo {
  /** The readable chats, newest activity first. */
  chats(): PromiseExtended<CoachChat[]>;
  /** The readable chats, newest activity first, each with its newest message. */
  summaries(): PromiseExtended<CoachChatSummary[]>;
  /** The readable messages of one chat, oldest first (none for a chat that is not stored). */
  list(chatId: string): PromiseExtended<CoachMessage[]>;
  /** One readable message, from any chat; null when it is missing or unreadable. */
  get(id: string): Promise<CoachMessage | null>;
  /**
   * Stores a message in its chat after every earlier write of this tab and returns it with its new
   * id; null when its chat is not stored and the message may not start it.
   */
  append(message: NewCoachMessage, options: { readonly start: true }): Promise<CoachMessage>;
  append(message: NewCoachMessage, options?: AppendOptions): Promise<CoachMessage | null>;
  /** Changes a stored message; null when it is missing or unreadable (then nothing changes). */
  patch(id: string, changes: CoachMessageChanges): Promise<CoachMessage | null>;
  /**
   * Gives a chat the person's own title (on one line, at most 60 characters), never replaced by
   * an automatic one; null when the chat is not stored. Rejects with a TypeError for no words.
   */
  rename(chatId: string, title: string): Promise<CoachChat | null>;
  /** Deletes a chat and every message in it; true when there was a chat. */
  remove(chatId: string): Promise<boolean>;
}

export interface CoachRepoOptions {
  /** Time for quarantine copies; defaults to the device clock. */
  clock?: Clock;
  /** Ids for new messages; defaults to random UUIDs. */
  newId?: IdSource;
}

/** A message as stored: `seq` orders messages that share a time. */
type MessageRow = CoachMessage & { seq: number };

const CHAT_TABLES = ['coachMessages', 'coachChats', ...GUARD_TABLES] as const;

/** The message without its stored sequence number. */
function asMessage(row: MessageRow): CoachMessage {
  const { seq: _seq, ...message } = row;
  return message;
}

/** Newest activity first; then the newer start; then by id, so the order never wavers. */
function byNewestActivity(a: CoachChat, b: CoachChat): number {
  return (
    b.updatedAt - a.updatedAt ||
    b.createdAt - a.createdAt ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
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

  /** One read-write transaction over the chats, the messages and the guard's tables. */
  function change<T>(work: () => Promise<T>): Promise<T> {
    return db.transaction('rw', [...CHAT_TABLES], work);
  }

  /** The raw message rows of one chat, in no order. */
  function rowsOf(chatId: string): PromiseExtended<unknown[]> {
    return db.coachMessages.where('chatId').equals(chatId).toArray();
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

  /** Readable chats of raw rows, newest activity first; unreadable ones are kept aside. */
  function decodedChats(rows: unknown[]): CoachChat[] {
    return decodeRows(db, 'coachChats', rows, decodeCoachChat, clock).items.sort(byNewestActivity);
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

  function append(
    message: NewCoachMessage,
    options: { readonly start: true },
  ): Promise<CoachMessage>;
  function append(message: NewCoachMessage, options?: AppendOptions): Promise<CoachMessage | null>;
  async function append(
    message: NewCoachMessage,
    options: AppendOptions = {},
  ): Promise<CoachMessage | null> {
    const checked = toRow({ ...message, id: newId() }, 0);
    const { chatId } = checked;
    return queued(() =>
      change(async () => {
        const stored = await readOne(db, 'coachChats', chatId, decodeCoachChat, clock);
        if (stored.kind === 'missing' && !options.start) return null;
        const rows: unknown[] = await rowsOf(chatId);
        const seq = rows.reduce((highest: number, raw) => Math.max(highest, seqOf(raw)), 0) + 1;
        const row: MessageRow = { ...checked, seq };
        const chat: CoachChat =
          stored.kind === 'ok'
            ? stored.value
            : stored.kind === 'corrupt'
              ? // Made again from its messages; the guard keeps the unreadable record aside.
                chatForRows(chatId, [...rows, row])
              : {
                  id: chatId,
                  title: chatTitle(row.text),
                  titleByPerson: false,
                  createdAt: row.at,
                  updatedAt: row.at,
                };
        await writeOne(db, 'coachMessages', row, decodeCoachMessage, clock);
        const updatedAt = Math.max(chat.updatedAt, row.at);
        await writeOne(db, 'coachChats', { ...chat, updatedAt }, decodeCoachChat, clock);
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
    chats: () => db.coachChats.toArray().then((rows: unknown[]) => decodedChats(rows)),

    summaries: () =>
      db.coachChats.toArray().then((chatRows: unknown[]) =>
        db.coachMessages.toArray().then((messageRows: unknown[]) => {
          const newestFirst = messageRows.sort(byConversationOrder).reverse();
          return decodedChats(chatRows).map((chat): CoachChatSummary => {
            for (const raw of newestFirst) {
              if (chatIdOf(raw) !== chat.id) continue;
              const message = decodeCoachMessage(raw);
              if (message) return { chat, last: { role: message.role, text: message.text } };
            }
            return { chat, last: null };
          });
        }),
      ),

    list: (chatId) => rowsOf(chatId).then((rows) => decoded(rows)),

    get: async (id) => {
      const stored = await readOne(db, 'coachMessages', id, decodeCoachMessage, clock);
      return stored.kind === 'ok' ? stored.value : null;
    },

    append,

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

    async rename(chatId, title) {
      const words = typedTitle(title);
      if (words === '') throw new TypeError('A chat title needs words');
      return queued(() =>
        change(async () => {
          const stored = await readOne(db, 'coachChats', chatId, decodeCoachChat, clock);
          if (stored.kind === 'missing') return null;
          const chat =
            stored.kind === 'ok' ? stored.value : chatForRows(chatId, await rowsOf(chatId));
          const renamed: CoachChat = { ...chat, title: words, titleByPerson: true };
          await writeOne(db, 'coachChats', renamed, decodeCoachChat, clock);
          return renamed;
        }),
      );
    },

    remove: (chatId) =>
      queued(() =>
        change(async () => {
          const existed = (await db.coachChats.get(chatId)) !== undefined;
          const keys = await db.coachMessages.where('chatId').equals(chatId).primaryKeys();
          // Unreadable messages are kept aside by the guard before they go.
          await removeRows(db, 'coachMessages', keys.map(String), decodeCoachMessage, clock);
          await removeRows(db, 'coachChats', [chatId], decodeCoachChat, clock);
          return existed;
        }),
      ),
  };
}
