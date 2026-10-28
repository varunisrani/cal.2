import { describe, expect, it } from 'vitest';
import { coach } from '../../i18n/en/coach';
import { formatDay, formatTime } from '../../i18n/format';
import { FACTORY_NOW, makeCoachChat } from '../../test/factories';
import { chatName, lastUsed, nextOpen, preview, type OpenChat } from './chatsList';

const DAY = 86_400_000;
/** FACTORY_NOW's local day in the test zone. */
const TODAY = '2026-10-26';

function ids(prefix = 'new'): () => string {
  let made = 0;
  return () => `${prefix}-${++made}`;
}

describe('nextOpen (P16-03)', () => {
  const older = makeCoachChat({ id: 'older', updatedAt: FACTORY_NOW - DAY });
  const newer = makeCoachChat({ id: 'newer' });

  it('opens the most recent chat at first, or a new one when there is none', () => {
    expect(nextOpen(null, [newer, older], ids())).toEqual({ id: 'newer', stored: true });
    expect(nextOpen(null, [], ids())).toEqual({ id: 'new-1', stored: false });
  });

  it('keeps the open chat, and counts a new one as stored once it is listed', () => {
    const open: OpenChat = { id: 'older', stored: true };
    expect(nextOpen(open, [newer, older], ids())).toBe(open);
    const fresh: OpenChat = { id: 'new-1', stored: false };
    expect(nextOpen(fresh, [newer], ids())).toBe(fresh);
    expect(nextOpen(fresh, [makeCoachChat({ id: 'new-1' }), newer], ids())).toEqual({
      id: 'new-1',
      stored: true,
    });
  });

  it('gives way to a new chat when the open one is no longer listed', () => {
    expect(nextOpen({ id: 'older', stored: true }, [newer], ids('next'))).toEqual({
      id: 'next-1',
      stored: false,
    });
  });
});

describe('chatName, lastUsed and preview (P16-03)', () => {
  it('names a chat without a title "Earlier chat"', () => {
    expect(chatName(makeCoachChat({ title: 'Dinners' }))).toBe('Dinners');
    expect(chatName(makeCoachChat({ title: '' }))).toBe(coach.coach.chats.untitled);
  });

  it('says the time today, Yesterday, else the date, with the year when it is another', () => {
    expect(lastUsed(FACTORY_NOW, TODAY)).toBe(formatTime(FACTORY_NOW));
    expect(lastUsed(FACTORY_NOW - DAY, TODAY)).toBe(coach.coach.chats.yesterday);
    expect(lastUsed(FACTORY_NOW - 3 * DAY, TODAY)).toBe(formatDay('2026-10-23', 'short'));
    expect(lastUsed(Date.parse('2025-12-30T10:00:00-05:00'), TODAY)).toBe(
      formatDay('2025-12-30', 'medium'),
    );
  });

  it('puts the start of a message on one line as words, Markdown left out', () => {
    expect(
      preview('## Plan\n\n- **Oats** with `milk`\n> a quote\n1. [Walk](https://x.org) daily'),
    ).toBe('Plan Oats with milk a quote Walk daily');
    expect(Array.from(preview('word '.repeat(60)))).toHaveLength(140);
    expect(preview('  \n ')).toBe('');
  });
});
