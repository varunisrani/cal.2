// What the Coach screen needs to show its chats (P16-03, D-16.99): which chat is open, a chat's
// name, when it was last used and the start of its last message on one line.

import { addDays, dayKeyOf, type DayKey } from '../../domain/dates/dayKey';
import type { CoachChat } from '../../domain/model';
import { formatDay, formatTime } from '../../i18n/format';
import { t } from '../../i18n/t';

/** The chat on screen: a stored one, or a new one that is stored with its first question. */
export interface OpenChat {
  readonly id: string;
  /** Seen among the stored chats. */
  readonly stored: boolean;
}

/**
 * The open chat after the stored chats changed. At first the newest chat, or a new one when there
 * is none; a new chat counts as stored once it is listed; a stored chat that is no longer listed
 * (deleted, here or in another tab) gives way to a new chat. Otherwise `now` itself.
 */
export function nextOpen(
  now: OpenChat | null,
  chats: readonly CoachChat[],
  newChatId: () => string,
): OpenChat {
  if (now === null) {
    const newest = chats[0];
    return newest ? { id: newest.id, stored: true } : { id: newChatId(), stored: false };
  }
  const listed = chats.some((chat) => chat.id === now.id);
  if (listed === now.stored) return now;
  return listed ? { id: now.id, stored: true } : { id: newChatId(), stored: false };
}

/** A chat's name: its title, or "Earlier chat" when it has none. */
export function chatName(chat: CoachChat): string {
  return chat.title === '' ? t('coach.chats.untitled') : chat.title;
}

/**
 * When a chat was last used: the time today, "Yesterday", else the date (with the year when it is
 * not this year's).
 */
export function lastUsed(ms: number, today: DayKey): string {
  const day = dayKeyOf(ms);
  if (day === today) return formatTime(ms);
  if (day === addDays(today, -1)) return t('coach.chats.yesterday');
  return formatDay(day, day.slice(0, 4) === today.slice(0, 4) ? 'short' : 'medium');
}

/** How much of a message the list keeps; the line itself ends in an ellipsis where it must. */
const PREVIEW_CHARS = 140;

/**
 * The start of a message on one line, as words: a link as its words, Markdown marks and line
 * starts (headings, quotes, list marks) left out, white space as single spaces.
 */
export function preview(text: string): string {
  const words = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gm, '')
    .replace(/\*\*|__|[*`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(words).slice(0, PREVIEW_CHARS).join('');
}
