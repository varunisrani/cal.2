// Coach chats (P16-02, D-16.99): the title a chat takes from its first question, the title a
// person types, and the chat made for messages that came without one (the conversation of an
// older version, or of an older backup).

import type { CoachChat, CoachRole } from '../model';

/** The longest a chat's title gets, in characters (code points, so an emoji is never split). */
export const CHAT_TITLE_MAX = 60;

/** The id of the chat the conversation of 1.3 and earlier moves into (upgrade and restore). */
export const FIRST_CHAT_ID = 'chat-earlier';

const ELLIPSIS = '…';

/** Punctuation and spaces a cut title should not end on before its ellipsis. */
const LOOSE_END = /[\s,;:.!?\-–—]+$/u;

/** The words with every run of white space as one space, trimmed. */
function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * The title a chat takes from its first question: the words on one line; past 60 characters,
 * cut between words (a single word longer than that is cut where it must) and ended with "…",
 * the whole at most 60 characters. Empty when there are no words.
 */
export function chatTitle(text: string): string {
  const words = oneLine(text);
  const chars = Array.from(words);
  if (chars.length <= CHAT_TITLE_MAX) return words;
  const room = chars.slice(0, CHAT_TITLE_MAX - 1).join('');
  let cut = room;
  if (chars[CHAT_TITLE_MAX - 1] !== ' ') {
    const space = room.lastIndexOf(' ');
    if (space > 0) cut = room.slice(0, space);
  }
  const tidy = cut.replace(LOOSE_END, '');
  return `${tidy === '' ? room : tidy}${ELLIPSIS}`;
}

/** A title the person typed: on one line, at most 60 characters. Empty when there are no words. */
export function typedTitle(text: string): string {
  return Array.from(oneLine(text)).slice(0, CHAT_TITLE_MAX).join('').trim();
}

/** What a message gives the chat made for it. */
export interface ChatSource {
  readonly role: CoachRole | string;
  readonly text: string;
  readonly at: number;
}

/**
 * The chat for messages that have none, `messages` oldest first: titled from the oldest of the
 * person's messages with words ("" when none has any), started at the oldest message and last
 * used at the newest (0 for no message).
 */
export function chatFor(id: string, messages: readonly ChatSource[]): CoachChat {
  const asked = messages.find((message) => message.role === 'user' && oneLine(message.text) !== '');
  const times = messages.map((message) => message.at);
  return {
    id,
    title: asked === undefined ? '' : chatTitle(asked.text),
    titleByPerson: false,
    createdAt: times.length === 0 ? 0 : Math.min(...times),
    updatedAt: times.length === 0 ? 0 : Math.max(...times),
  };
}
