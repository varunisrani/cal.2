// Coach messages as raw stored rows (P16-02): their order in a chat, and the chat made for rows
// that have none. The repository lists and caps by this order; the schema 4 upgrade and a restore
// of an older backup make a chat for the conversation of 1.3 and earlier with it.

import { chatFor, type ChatSource } from '../domain/coach/chats';
import type { CoachChat } from '../domain/model';

/** A raw row's field, when the row is an object. */
export function fieldOf(raw: unknown, key: string): unknown {
  return typeof raw === 'object' && raw !== null
    ? (raw as Record<string, unknown>)[key]
    : undefined;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The append sequence of a raw row; 0 for rows stored without one (a restore, say). */
export function seqOf(raw: unknown): number {
  return numberOr(fieldOf(raw, 'seq'), 0);
}

/** Conversation order of raw rows: time, then append sequence, then id. */
export function byConversationOrder(a: unknown, b: unknown): number {
  const aId = String(fieldOf(a, 'id'));
  const bId = String(fieldOf(b, 'id'));
  return (
    numberOr(fieldOf(a, 'at'), 0) - numberOr(fieldOf(b, 'at'), 0) ||
    seqOf(a) - seqOf(b) ||
    (aId < bId ? -1 : aId > bId ? 1 : 0)
  );
}

/** The chat id a raw row names; null when it names none. */
export function chatIdOf(raw: unknown): string | null {
  const id = fieldOf(raw, 'chatId');
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * The chat `id` for raw message rows that have none (in any order): titled from the oldest of the
 * person's messages with words, its times from the rows that have one.
 */
export function chatForRows(id: string, rows: readonly unknown[]): CoachChat {
  const sources: ChatSource[] = [...rows]
    .filter((raw) => Number.isFinite(fieldOf(raw, 'at')))
    .sort(byConversationOrder)
    .map((raw) => {
      const text = fieldOf(raw, 'text');
      return {
        role: String(fieldOf(raw, 'role')),
        text: typeof text === 'string' ? text : '',
        at: fieldOf(raw, 'at') as number,
      };
    });
  return chatFor(id, sources);
}
