import { describe, expect, it } from 'vitest';
import { CHAT_TITLE_MAX, FIRST_CHAT_ID, chatFor, chatTitle, typedTitle } from './chats';

const length = (text: string): number => Array.from(text).length;

describe('chatTitle (P16-02, D-16.99)', () => {
  it('keeps a short question as it is, on one line', () => {
    expect(chatTitle('How was my week?')).toBe('How was my week?');
    expect(chatTitle('  How was\n\nmy   week?\t')).toBe('How was my week?');
  });

  it('cuts a long question between words, within 60 characters with the ellipsis', () => {
    const title = chatTitle(
      'Could you look at my breakfasts this week and tell me which of them kept me full longest?',
    );
    expect(title).toBe('Could you look at my breakfasts this week and tell me which…');
    expect(length(title)).toBeLessThanOrEqual(CHAT_TITLE_MAX);
  });

  it('keeps a whole word that ends right at the cut, and drops a comma before the ellipsis', () => {
    // 59 characters, then a space: the cut falls between words.
    const exact = `${'a'.repeat(28)} ${'b'.repeat(30)} and more words`;
    expect(chatTitle(exact)).toBe(`${'a'.repeat(28)} ${'b'.repeat(30)}…`);
    const comma = `${'a'.repeat(50)}, ${'c'.repeat(20)}`;
    expect(chatTitle(comma)).toBe(`${'a'.repeat(50)}…`);
  });

  it('cuts one very long word where it must', () => {
    const title = chatTitle('x'.repeat(100));
    expect(title).toBe(`${'x'.repeat(59)}…`);
  });

  it('never splits an emoji', () => {
    const title = chatTitle('🥗'.repeat(70));
    expect(Array.from(title)).toHaveLength(60);
    expect(title.endsWith('🥗…')).toBe(true);
  });

  it('is empty without words', () => {
    expect(chatTitle(' \n ')).toBe('');
  });
});

describe('typedTitle', () => {
  it('puts the words on one line and keeps at most 60 characters, no ellipsis', () => {
    expect(typedTitle('  Weekend \n plan ')).toBe('Weekend plan');
    expect(typedTitle('y'.repeat(75))).toBe('y'.repeat(60));
    expect(typedTitle('   ')).toBe('');
  });
});

describe('chatFor', () => {
  it('titles the chat from the oldest question with words and takes its times from the messages', () => {
    expect(
      chatFor(FIRST_CHAT_ID, [
        { role: 'assistant', text: 'A reply left at the start.', at: 100 },
        { role: 'user', text: '   ', at: 200 },
        { role: 'user', text: 'Which dinner fits my day?', at: 300 },
        { role: 'assistant', text: 'Lentil soup.', at: 400 },
      ]),
    ).toEqual({
      id: 'chat-earlier',
      title: 'Which dinner fits my day?',
      titleByPerson: false,
      createdAt: 100,
      updatedAt: 400,
    });
  });

  it('has an empty title without a question, and times of 0 without messages', () => {
    expect(chatFor('c', [{ role: 'assistant', text: 'Only a reply.', at: 50 }])).toMatchObject({
      title: '',
      createdAt: 50,
      updatedAt: 50,
    });
    expect(chatFor('c', [])).toEqual({
      id: 'c',
      title: '',
      titleByPerson: false,
      createdAt: 0,
      updatedAt: 0,
    });
  });
});
