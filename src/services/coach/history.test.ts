import { describe, expect, it } from 'vitest';
import type { CoachMessage, CoachRole } from '../../domain/model';
import { FACTORY_NOW, makeCoachMessage } from '../../test/factories';
import { coachHistory, earlierMessages, HISTORY_WINDOW, wireRole } from './history';

const MINUTE = 60_000;

/** A message `minutes` after FACTORY_NOW with a readable id. */
function message(
  id: string,
  role: CoachRole,
  text: string,
  minutes: number,
  extra: Partial<CoachMessage> = {},
): CoachMessage {
  return makeCoachMessage({ id, role, text, at: FACTORY_NOW + minutes * MINUTE, ...extra });
}

/** `count` messages taking turns, the first from `first`; ids and texts say their position. */
function exchange(count: number, first: CoachRole = 'user'): CoachMessage[] {
  return Array.from({ length: count }, (_, index) => {
    const role: CoachRole = (index % 2 === 0) === (first === 'user') ? 'user' : 'assistant';
    return message(`m${index}`, role, `${role} ${index}`, index);
  });
}

/** The question just stored after `earlier`. */
function asked(earlier: CoachMessage[], text = 'What should I eat tonight?') {
  const question = message('q', 'user', text, earlier.length);
  return { messages: [...earlier, question], question };
}

describe('earlierMessages: the window (04 §3.7)', () => {
  it('takes the 19 messages before the question when 30 are stored', () => {
    const { messages, question } = asked(exchange(29));
    expect(messages).toHaveLength(30);

    const earlier = earlierMessages(messages, question.id);

    expect(earlier).toHaveLength(HISTORY_WINDOW - 1);
    expect(earlier.map((kept) => kept.id)).toEqual(
      Array.from({ length: 19 }, (_, index) => `m${index + 10}`),
    );
  });

  it('takes every earlier message when fewer are stored', () => {
    const { messages, question } = asked(exchange(4));
    expect(earlierMessages(messages, question.id).map((kept) => kept.id)).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('counts the whole list as earlier when the question is not stored', () => {
    expect(earlierMessages(exchange(25), 'not-stored')).toHaveLength(19);
  });

  it('gives a retried older question only the messages before it, never later ones', () => {
    const stored = exchange(6);
    const earlier = earlierMessages(stored, 'm4');
    expect(earlier.map((kept) => kept.id)).toEqual(['m0', 'm1', 'm2', 'm3']);
  });
});

describe('coachHistory: shape (R04.3, D-16.34)', () => {
  it('drops a reply that opens the window, so the history starts with the person', () => {
    // 21 earlier messages that start on a reply: the window's first message (m2) is a reply too.
    const { messages, question } = asked(exchange(21, 'assistant'));

    const { turns } = coachHistory(messages, question, 'openai');

    expect(turns[0]).toEqual({ role: 'user', text: 'user 3' });
    expect(turns).toHaveLength(18);
    expect(turns.at(-1)).toEqual({ role: 'assistant', text: 'assistant 20' });
  });

  it('merges two failed questions in a row into one turn, a blank line between them', () => {
    const failed = { state: { status: 'failed' as const, kind: 'offline' } };
    const earlier = [
      message('a', 'user', 'How much protein today?', 0, failed),
      message('b', 'user', '  And yesterday?  ', 1, failed),
      message('c', 'user', 'Protein over the last two days?', 2),
      message('d', 'assistant', 'About 180 g in total.', 3),
    ];
    const { messages, question } = asked(earlier, 'Thanks. And fibre?');

    const history = coachHistory(messages, question, 'anthropic');

    expect(history.turns).toEqual([
      {
        role: 'user',
        text: 'How much protein today?\n\nAnd yesterday?\n\nProtein over the last two days?',
      },
      { role: 'assistant', text: 'About 180 g in total.' },
    ]);
    expect(history.text).toBe('Thanks. And fibre?');
  });

  it('puts questions left unanswered just before the new one in front of it', () => {
    const earlier = [
      message('a', 'user', 'Hi', 0),
      message('b', 'assistant', 'Hello! Ask me about your log.', 1),
      message('c', 'user', 'Was Tuesday over my target?', 2, {
        state: { status: 'failed', kind: 'timeout' },
      }),
    ];
    const { messages, question } = asked(earlier, 'And Wednesday?');

    const history = coachHistory(messages, question, 'openai');

    expect(history.turns).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello! Ask me about your log.' },
    ]);
    expect(history.text).toBe('Was Tuesday over my target?\n\nAnd Wednesday?');
  });

  it('sends no turns when every earlier message is an unanswered question', () => {
    const earlier = [message('a', 'user', 'First try', 0), message('b', 'user', 'Second try', 1)];
    const { messages, question } = asked(earlier, 'Third try');

    expect(coachHistory(messages, question, 'gemini')).toEqual({
      turns: [],
      text: 'First try\n\nSecond try\n\nThird try',
    });
  });

  it('sends only the question when nothing came before it', () => {
    const { messages, question } = asked([]);
    expect(coachHistory(messages, question, 'openai')).toEqual({
      turns: [],
      text: 'What should I eat tonight?',
    });
  });

  it('skips messages without words', () => {
    const earlier = [
      message('a', 'user', 'Breakfast idea?', 0),
      message('b', 'assistant', '   ', 1),
      message('c', 'user', 'Something with eggs', 2),
      message('d', 'assistant', 'Try an omelette.', 3),
    ];
    const { messages, question } = asked(earlier);

    expect(coachHistory(messages, question, 'openai').turns).toEqual([
      { role: 'user', text: 'Breakfast idea?\n\nSomething with eggs' },
      { role: 'assistant', text: 'Try an omelette.' },
    ]);
  });

  it('turns are always alternating, opening with the person and closing on a reply', () => {
    const roles: CoachRole[] = ['assistant', 'assistant', 'user', 'user', 'assistant', 'user'];
    const earlier = [
      ...roles.map((role, index) => message(`x${index}`, role, `${role} ${index}`, index)),
      message('y', 'assistant', 'reply', roles.length),
    ];
    const { messages, question } = asked(earlier);

    const { turns } = coachHistory(messages, question, 'anthropic');

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});

describe('coachHistory: text only (R04.2, D-16.48)', () => {
  it('never sends a thumbnail: every turn holds only its side and its words', () => {
    const thumb = new Blob([new Uint8Array(32)], { type: 'image/jpeg' });
    const earlier = [
      message('a', 'user', 'What is on this plate?', 0, { thumb }),
      message('b', 'assistant', 'Rice, beans and a fried egg.', 1),
    ];
    const { messages, question } = asked(earlier, 'How much protein was in it?');

    const { turns } = coachHistory(messages, question, 'gemini');

    expect(turns).toEqual([
      { role: 'user', text: 'What is on this plate?' },
      { role: 'model', text: 'Rice, beans and a fried egg.' },
    ]);
    for (const turn of turns) expect(Object.keys(turn).sort()).toEqual(['role', 'text']);
    expect(JSON.stringify(turns)).not.toContain('thumb');
  });
});

describe('coachHistory: roles per format', () => {
  const { messages, question } = asked(exchange(2));

  it('names the sides user and model for Gemini', () => {
    expect(coachHistory(messages, question, 'gemini').turns.map((turn) => turn.role)).toEqual([
      'user',
      'model',
    ]);
  });

  it.each(['openai', 'anthropic'] as const)(
    'names the sides user and assistant for %s',
    (format) => {
      expect(coachHistory(messages, question, format).turns.map((turn) => turn.role)).toEqual([
        'user',
        'assistant',
      ]);
    },
  );

  it('maps a single role', () => {
    expect(wireRole('user', 'gemini')).toBe('user');
    expect(wireRole('assistant', 'gemini')).toBe('model');
    expect(wireRole('assistant', 'anthropic')).toBe('assistant');
  });
});
