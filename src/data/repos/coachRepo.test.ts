import { describe, expect, it } from 'vitest';
import type { CoachMessage, CoachReminderCard } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { withIdSequence, type IdSource } from '../../lib/ids';
import { bytesOf, storableBlob } from '../../test/blobs';
import { countRuns, openTestDb } from '../../test/db';
import { FACTORY_NOW, makeCoachMessage } from '../../test/factories';
import { WriteBlockedError, hasUnreadableData, settleQuarantine } from '../guard';
import { live } from '../live';
import type { PlatewiseDb } from '../schema';
import { COACH_MESSAGE_LIMIT, createCoachRepo, type NewCoachMessage } from './coachRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

/** The chat most tests write in. */
const CHAT = 'chat-1';

async function setUp(newId: IdSource = withIdSequence('message')) {
  const opened = await openTestDb();
  return { ...opened, coach: createCoachRepo(opened.db, { clock, newId }) };
}

/** Ids that sort backwards (`m-9`, `m-8`, …), so id order can never pass for call order. */
function fallingIds(): IdSource {
  let next = 10;
  return () => `m-${--next}`;
}

function question(text: string, at = FACTORY_NOW, chatId = CHAT): NewCoachMessage {
  return { chatId, role: 'user', text, at };
}

function reply(text: string, at = FACTORY_NOW, chatId = CHAT): NewCoachMessage {
  return { chatId, role: 'assistant', text, at };
}

function texts(messages: readonly CoachMessage[]): string[] {
  return messages.map((message) => message.text);
}

/** A stored message whose role nobody knows: unreadable. */
function unreadable(at: number, chatId = CHAT) {
  return { id: 'broken', chatId, role: 'system', text: 'kept from an older version', at };
}

/** Makes every add to `quarantine` on this connection fail, like a full disk would. */
function breakQuarantine(db: PlatewiseDb): void {
  db.quarantine.hook('creating', () => {
    throw new DOMException('The quota has been exceeded', 'QuotaExceededError');
  });
}

describe('append and the 200-message cap', () => {
  it('keeps the newest 200 of 205 messages, removing the oldest with their thumbnails (ACC-I10-1, R04.8, D-16.29)', async () => {
    const { db, coach } = await setUp();
    const firstThumb = await storableBlob(32, 1);
    const lastThumb = await storableBlob(24, 7);
    for (let index = 1; index <= 205; index++) {
      const at = FACTORY_NOW + index * 1_000;
      const message = index % 2 === 1 ? question(`m${index}`, at) : reply(`m${index}`, at);
      if (index === 1) message.thumb = firstThumb;
      if (index === 205) message.thumb = lastThumb;
      await coach.append(message, { start: true });
    }

    const list = await coach.list(CHAT);
    expect(COACH_MESSAGE_LIMIT).toBe(200);
    expect(list).toHaveLength(200);
    expect(list[0]?.text).toBe('m6');
    expect(list.at(-1)?.text).toBe('m205');
    expect(await db.coachMessages.count()).toBe(200);
    expect(await db.coachMessages.get('message-1')).toBeUndefined();
    expect(await bytesOf(list.at(-1)?.thumb ?? new Blob())).toEqual(await bytesOf(lastThumb));
    db.close();
  });

  it('caps each chat on its own: a full chat drops its own oldest, another chat keeps all of its (P16-02)', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('other chat, first', FACTORY_NOW, 'chat-2'), { start: true });
    await coach.append(reply('other chat, second', FACTORY_NOW + 1, 'chat-2'));
    for (let index = 1; index <= COACH_MESSAGE_LIMIT + 3; index++) {
      await coach.append(question(`m${index}`, FACTORY_NOW + 10 + index), { start: true });
    }

    const full = await coach.list(CHAT);
    expect(full).toHaveLength(COACH_MESSAGE_LIMIT);
    expect(full[0]?.text).toBe('m4');
    expect(texts(await coach.list('chat-2'))).toEqual(['other chat, first', 'other chat, second']);
    expect(await db.coachMessages.count()).toBe(COACH_MESSAGE_LIMIT + 2);
    db.close();
  });

  it('lands appends made without waiting in call order, also after a reopen', async () => {
    const { db, factory, name, coach } = await setUp(fallingIds());
    const first = coach.append(question('first'), { start: true });
    const second = coach.append(reply('second'));
    const third = coach.append(question('third'));

    expect(await first).toEqual({ ...question('first'), id: 'm-9' });
    expect(await second).toEqual({ ...reply('second'), id: 'm-8' });
    await third;
    expect(texts(await coach.list(CHAT))).toEqual(['first', 'second', 'third']);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    expect(texts(await createCoachRepo(reopened.db, { clock }).list(CHAT))).toEqual([
      'first',
      'second',
      'third',
    ]);
    reopened.db.close();
  });

  it('lists messages oldest first by their time', async () => {
    const { db, coach } = await setUp();
    await coach.append(reply('later', FACTORY_NOW + 60_000), { start: true });
    await coach.append(question('earlier', FACTORY_NOW));

    expect(texts(await coach.list(CHAT))).toEqual(['earlier', 'later']);
    db.close();
  });

  it('refuses a message with an unknown role or no chat, and a failed write does not stop the queue', async () => {
    const { db, coach } = await setUp();
    db.coachMessages.hook('creating', (_key, row) => {
      if (row.text === 'refused by the disk') throw new Error('write failed');
    });

    const unknownRole = coach.append({ ...question('who?'), role: 'system' } as never, {
      start: true,
    });
    const noChat = coach.append({ ...question('where?'), chatId: '' }, { start: true });
    const failing = coach.append(question('refused by the disk'), { start: true });
    const after = coach.append(reply('still stored'), { start: true });

    await expect(unknownRole).rejects.toBeInstanceOf(TypeError);
    await expect(noChat).rejects.toBeInstanceOf(TypeError);
    await expect(failing).rejects.toThrow('write failed');
    expect(await after).toMatchObject({ text: 'still stored' });
    expect(texts(await coach.list(CHAT))).toEqual(['still stored']);
    db.close();
  });

  it('follows an append through a live query (R06.3)', async () => {
    const { db, coach } = await setUp();
    const counted = countRuns(() => coach.list(CHAT));
    const source = live(counted.query);
    const stop = source.subscribe(() => undefined);
    await counted.untilRuns(1);
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [] });

    const stored = await coach.append(question('how much fibre today?'), { start: true });
    await counted.untilRuns(2);

    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [stored] });
    stop();
    counted.close();
    db.close();
  });
});

describe('chats (P16-02, D-16.99)', () => {
  it('stores a chat with its first message, titled from it, and nothing for a chat that was never started', async () => {
    const { db, coach } = await setUp();
    const long =
      'Could you look at my breakfasts this week and tell me which of them kept me full longest?';

    expect(await coach.append(reply('no chat to land in'))).toBeNull();
    expect(await db.coachMessages.count()).toBe(0);
    expect(await coach.chats()).toEqual([]);

    await coach.append(question(long, FACTORY_NOW + 5), { start: true });
    expect(await coach.chats()).toEqual([
      {
        id: CHAT,
        title: 'Could you look at my breakfasts this week and tell me which…',
        titleByPerson: false,
        createdAt: FACTORY_NOW + 5,
        updatedAt: FACTORY_NOW + 5,
      },
    ]);
    db.close();
  });

  it('moves a chat’s last use on with each message and lists the chats newest activity first', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('first chat', FACTORY_NOW), { start: true });
    await coach.append(question('second chat', FACTORY_NOW + 1_000, 'chat-2'), { start: true });
    expect((await coach.chats()).map((chat) => chat.id)).toEqual(['chat-2', CHAT]);

    await coach.append(reply('an answer in the first', FACTORY_NOW + 2_000));
    const chats = await coach.chats();
    expect(chats.map((chat) => chat.id)).toEqual([CHAT, 'chat-2']);
    expect(chats[0]).toMatchObject({ createdAt: FACTORY_NOW, updatedAt: FACTORY_NOW + 2_000 });
    // A message dated earlier (a slow clock) never moves the last use back.
    await coach.append(reply('late stamp', FACTORY_NOW - 5_000));
    expect((await coach.chats())[0]?.updatedAt).toBe(FACTORY_NOW + 2_000);
    db.close();
  });

  it('sums each chat up with its newest readable message', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('Which breakfast?', FACTORY_NOW), { start: true });
    await coach.append(reply('The **oats**.', FACTORY_NOW + 1));
    await coach.append(question('Dinner ideas?', FACTORY_NOW + 2, 'chat-2'), { start: true });
    await db.coachMessages.put(unreadable(FACTORY_NOW + 3, 'chat-2') as never);

    expect(await coach.summaries()).toEqual([
      {
        chat: expect.objectContaining({ id: 'chat-2', title: 'Dinner ideas?' }),
        last: { role: 'user', text: 'Dinner ideas?' },
      },
      {
        chat: expect.objectContaining({ id: CHAT, title: 'Which breakfast?' }),
        last: { role: 'assistant', text: 'The **oats**.' },
      },
    ]);
    db.close();
  });

  it('finds a message by its id in any chat, and nothing for a missing or unreadable one', async () => {
    const { db, coach } = await setUp();
    const asked = await coach.append(question('in the other chat', FACTORY_NOW, 'chat-2'), {
      start: true,
    });
    await db.coachMessages.put(unreadable(FACTORY_NOW) as never);

    expect(await coach.get(asked.id)).toEqual(asked);
    expect(await coach.get('broken')).toBeNull();
    expect(await coach.get('nowhere')).toBeNull();
    db.close();
  });

  it('renames a chat for good: later messages never bring the automatic title back', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('What did I eat yesterday?'), { start: true });

    const renamed = await coach.rename(CHAT, '  Weekend   plan \n');
    expect(renamed).toMatchObject({ id: CHAT, title: 'Weekend plan', titleByPerson: true });
    await coach.append(reply('An answer.', FACTORY_NOW + 1));
    await coach.append(question('And today?', FACTORY_NOW + 2), { start: true });

    expect((await coach.chats())[0]).toMatchObject({ title: 'Weekend plan', titleByPerson: true });
    expect((await coach.rename(CHAT, 'x'.repeat(80)))?.title).toBe('x'.repeat(60));
    db.close();
  });

  it('refuses a title of spaces, and renames nothing for a chat that is not stored', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('Keep this title'), { start: true });

    await expect(coach.rename(CHAT, ' \n ')).rejects.toBeInstanceOf(TypeError);
    expect(await coach.rename('chat-gone', 'A name')).toBeNull();
    expect(await coach.chats()).toEqual([expect.objectContaining({ title: 'Keep this title' })]);
    expect(await db.coachChats.count()).toBe(1);
    db.close();
  });

  it('deletes a chat with its messages only, and drops a reply that comes after (R04.6, D-16.34)', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('to be deleted'), { start: true });
    await coach.append(question('to stay', FACTORY_NOW, 'chat-2'), { start: true });

    expect(await coach.remove(CHAT)).toBe(true);
    expect(await coach.append(reply('late reply'))).toBeNull();

    expect(await coach.list(CHAT)).toEqual([]);
    expect((await coach.chats()).map((chat) => chat.id)).toEqual(['chat-2']);
    expect(texts(await coach.list('chat-2'))).toEqual(['to stay']);
    expect(await coach.remove(CHAT)).toBe(false);
    db.close();
  });

  it('applies a delete between appends in call order', async () => {
    const { db, coach } = await setUp();
    const before = coach.append(question('before'), { start: true });
    const removed = coach.remove(CHAT);
    const late = coach.append(reply('late reply'));
    const fresh = coach.append(question('a new chat', FACTORY_NOW, 'chat-2'), { start: true });

    await before;
    expect(await removed).toBe(true);
    expect(await late).toBeNull();
    await fresh;
    expect(await coach.list(CHAT)).toEqual([]);
    expect(texts(await coach.list('chat-2'))).toEqual(['a new chat']);
    db.close();
  });

  it('makes an unreadable chat record again from its messages, keeping the damaged one aside', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('first words', FACTORY_NOW), { start: true });
    const damaged = { id: CHAT, title: 7, createdAt: 'yesterday' };
    await db.coachChats.put(damaged as never);
    expect(await coach.chats()).toEqual([]);

    await coach.append(reply('an answer', FACTORY_NOW + 1));
    await settleQuarantine(db);

    expect(await coach.chats()).toEqual([
      {
        id: CHAT,
        title: 'first words',
        titleByPerson: false,
        createdAt: FACTORY_NOW,
        updatedAt: FACTORY_NOW + 1,
      },
    ]);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'coachChats', key: CHAT, raw: damaged }),
    ]);
    db.close();
  });
});

describe('unreadable messages (R04.7)', () => {
  it('keeps a corrupt message aside and still lists the rest', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('first', FACTORY_NOW), { start: true });
    await db.coachMessages.put(unreadable(FACTORY_NOW + 1_000) as never);
    await coach.append(reply('second', FACTORY_NOW + 2_000));

    expect(texts(await coach.list(CHAT))).toEqual(['first', 'second']);
    await settleQuarantine(db);

    expect(await db.coachMessages.get('broken')).toEqual(unreadable(FACTORY_NOW + 1_000));
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({
        table: 'coachMessages',
        key: 'broken',
        raw: unreadable(FACTORY_NOW + 1_000),
      }),
    ]);
    expect(await hasUnreadableData(db)).toBe(true);
    db.close();
  });

  it('never overwrites or deletes a corrupt message on append, the cap or patch', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('old start', FACTORY_NOW - 2_000), { start: true });
    // After the first question, the oldest row is the unreadable one; 199 readable ones follow.
    await db.coachMessages.put(unreadable(FACTORY_NOW - 1_000) as never);
    await db.coachMessages.bulkPut(
      Array.from({ length: COACH_MESSAGE_LIMIT - 1 }, (_, index) =>
        makeCoachMessage({ id: `old-${index}`, text: `old ${index}`, at: FACTORY_NOW + index }),
      ),
    );

    await coach.append(reply('newest', FACTORY_NOW + 10_000));
    const list = await coach.list(CHAT);
    expect(list).toHaveLength(COACH_MESSAGE_LIMIT);
    expect(list[0]?.text).toBe('old 0');
    expect(list.at(-1)?.text).toBe('newest');

    expect(await coach.patch('broken', { text: 'repaired?' })).toBeNull();
    await settleQuarantine(db);
    expect(await db.coachMessages.get('broken')).toEqual(unreadable(FACTORY_NOW - 1_000));
    expect(await db.quarantine.count()).toBe(1);
    db.close();
  });

  it('keeps a corrupt message aside before deleting its chat deletes it', async () => {
    const { db, coach } = await setUp();
    await db.coachMessages.put(unreadable(FACTORY_NOW) as never);
    await coach.append(question('question'), { start: true });

    expect(await coach.remove(CHAT)).toBe(true);
    expect(await db.coachMessages.count()).toBe(0);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({
        table: 'coachMessages',
        key: 'broken',
        raw: unreadable(FACTORY_NOW),
      }),
    ]);
    db.close();
  });

  it('refuses a delete that cannot keep a corrupt message aside, and changes nothing', async () => {
    const { db, coach } = await setUp();
    await db.coachMessages.put(unreadable(FACTORY_NOW) as never);
    await coach.append(question('question'), { start: true });
    breakQuarantine(db);

    await expect(coach.remove(CHAT)).rejects.toBeInstanceOf(WriteBlockedError);
    expect(await db.coachMessages.get('broken')).toEqual(unreadable(FACTORY_NOW));
    expect(texts(await coach.list(CHAT))).toEqual(['question']);
    expect(await db.coachChats.count()).toBe(1);
    db.close();
  });
});

describe('patch', () => {
  it('sets and clears the failed state of a question without moving it (D-16.31)', async () => {
    const { db, coach } = await setUp(fallingIds());
    const asked = await coach.append(question('first'), { start: true });
    await coach.append(reply('second'));
    const failed = { status: 'failed', kind: 'offline', details: 'no connection' } as const;

    expect(await coach.patch(asked.id, { state: failed })).toEqual({ ...asked, state: failed });
    expect(await coach.list(CHAT)).toEqual([
      { ...asked, state: failed },
      expect.objectContaining({ text: 'second' }),
    ]);

    expect(await coach.patch(asked.id, { state: null, text: 'first, again' })).toEqual({
      ...asked,
      text: 'first, again',
    });
    expect(texts(await coach.list(CHAT))).toEqual(['first, again', 'second']);
    db.close();
  });

  it('replaces the reminder cards of a reply and keeps the rest of it (P13)', async () => {
    const { db, coach } = await setUp(fallingIds());
    const answered = await coach.append(reply('Here is a reminder for you.'), { start: true });
    const card: CoachReminderCard = {
      text: 'Drink water',
      time: '10:00',
      days: ['mon'],
      status: 'proposed',
    };

    expect(await coach.patch(answered.id, { reminders: [card] })).toEqual({
      ...answered,
      reminders: [card],
    });
    const added: CoachReminderCard = { ...card, status: 'added', reminderId: 'r1' };
    await coach.patch(answered.id, { reminders: [added] });
    expect(await coach.list(CHAT)).toEqual([{ ...answered, reminders: [added] }]);
    db.close();
  });

  it('returns null for a message that is not stored and stores nothing', async () => {
    const { db, coach } = await setUp();
    expect(await coach.patch('not-stored', { text: 'hello' })).toBeNull();
    expect(await db.coachMessages.count()).toBe(0);
    db.close();
  });
});
