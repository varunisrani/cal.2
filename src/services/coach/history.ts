// The conversation a Coach turn sends with its question (P08-04, 04 §3.7). Only the words of
// earlier messages travel, never their photos (D-16.48, R04.2). The window is the newest 20
// stored messages with the question itself set aside, so at most 19 earlier ones.
//
// Providers expect a conversation that opens with the person and then takes turns, but a cut
// window can open on a reply and a failed question leaves two of the person's messages in a row
// (R04.3). So replies before the first question are dropped, neighbouring messages of one side
// are joined with a blank line, and questions still unanswered when the new one is asked are put
// in front of it: what a provider receives always alternates (D-16.34).

import type { WireFormat } from '../../ai/catalog/providers';
import type { CoachMessage, CoachRole } from '../../domain/model';

/** How many stored messages a turn looks at, its own question included. */
export const HISTORY_WINDOW = 20;

/** The side a turn belongs to, in the words of the wire format. */
export type WireRole = 'user' | 'assistant' | 'model';

export interface HistoryTurn {
  readonly role: WireRole;
  readonly text: string;
}

export interface TurnHistory {
  /**
   * Earlier turns, oldest first: they open with the person, take turns, and end on the
   * assistant's side, so the new question follows naturally. Empty when there is nothing to send.
   */
  readonly turns: readonly HistoryTurn[];
  /** The new question, after any of the person's questions that were left unanswered. */
  readonly text: string;
}

/** The question the turn answers: its stored id and its words. */
export interface TurnQuestion {
  readonly id: string;
  readonly text: string;
}

/** Text joined from neighbouring messages of one side. */
const JOIN = '\n\n';

/** How Gemini names the assistant's side; the other two formats say `assistant`. */
export function wireRole(role: CoachRole, format: WireFormat): WireRole {
  if (role === 'user') return 'user';
  return format === 'gemini' ? 'model' : 'assistant';
}

/**
 * The stored messages that come before the question inside the window, oldest first: at most
 * `HISTORY_WINDOW - 1`. When the question is not among `messages`, all of them come before it.
 * A retried question that is not the newest message never takes later messages as its past.
 */
export function earlierMessages(
  messages: readonly CoachMessage[],
  questionId: string,
): CoachMessage[] {
  const at = messages.findIndex((message) => message.id === questionId);
  const before = at === -1 ? messages : messages.slice(0, at);
  return before.slice(Math.max(0, before.length - (HISTORY_WINDOW - 1)));
}

interface Turn {
  role: CoachRole;
  text: string;
}

/** Earlier messages as alternating turns: text only, blanks skipped, same sides merged. */
function alternate(messages: readonly CoachMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const text = message.text.trim();
    if (text === '') continue;
    const last = turns.at(-1);
    if (last?.role === message.role) last.text = `${last.text}${JOIN}${text}`;
    else if (last || message.role === 'user') turns.push({ role: message.role, text });
    // A reply before the first question is left out: the history opens with the person.
  }
  return turns;
}

/**
 * The history and question text for one turn on `format`. `messages` is the stored conversation,
 * oldest first, usually with the question already stored as its newest message.
 */
export function coachHistory(
  messages: readonly CoachMessage[],
  question: TurnQuestion,
  format: WireFormat,
): TurnHistory {
  const turns = alternate(earlierMessages(messages, question.id));
  const unanswered = turns.at(-1)?.role === 'user' ? turns.pop() : undefined;
  const asked = question.text.trim();
  const text = unanswered
    ? asked === ''
      ? unanswered.text
      : `${unanswered.text}${JOIN}${asked}`
    : asked;
  return {
    turns: turns.map((turn) => ({ role: wireRole(turn.role, format), text: turn.text })),
    text,
  };
}
