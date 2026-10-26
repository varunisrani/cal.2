import { describe, expect, it } from 'vitest';
import type { CoachMessage } from '../../domain/model';
import { fixedClock } from '../../lib/clock';
import { withIdSequence, type IdSource } from '../../lib/ids';
import { bytesOf, storableBlob } from '../../test/blobs';
import { countRuns, openTestDb } from '../../test/db';
import { FACTORY_NOW, makeCoachMessage } from '../../test/factories';
import { WriteBlockedError, hasUnreadableData, settleQuarantine } from '../guard';
import { live } from '../live';
import type { PlatewiseDb } from '../schema';
import {
  COACH_MESSAGE_LIMIT,
  GENERATION_KEY,
  createCoachRepo,
  type NewCoachMessage,
} from './coachRepo';

const clock = fixedClock(FACTORY_NOW, 'America/New_York');

async function setUp(newId: IdSource = withIdSequence('message')) {
  const opened = await openTestDb();
  return { ...opened, coach: createCoachRepo(opened.db, { clock, newId }) };
}

/** Ids that sort backwards (`m-9`, `m-8`, …), so id order can never pass for call order. */
function fallingIds(): IdSource {
  let next = 10;
  return () => `m-${--next}`;
}

function question(text: string, at = FACTORY_NOW): NewCoachMessage {
  return { role: 'user', text, at };
}

function reply(text: string, at = FACTORY_NOW): NewCoachMessage {
  return { role: 'assistant', text, at };
}

function texts(messages: readonly CoachMessage[]): string[] {
  return messages.map((message) => message.text);
}

/** A stored message whose role nobody knows: unreadable. */
function unreadable(at: number) {
  return { id: 'broken', role: 'system', text: 'kept from an older version', at };
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
      await coach.append(message);
    }

    const list = await coach.list();
    expect(COACH_MESSAGE_LIMIT).toBe(200);
    expect(list).toHaveLength(200);
    expect(list[0]?.text).toBe('m6');
    expect(list.at(-1)?.text).toBe('m205');
    expect(await db.coachMessages.count()).toBe(200);
    expect(await db.coachMessages.get('message-1')).toBeUndefined();
    expect(await bytesOf(list.at(-1)?.thumb ?? new Blob())).toEqual(await bytesOf(lastThumb));
    db.close();
  });

  it('lands appends made without waiting in call order, also after a reopen', async () => {
    const { db, factory, name, coach } = await setUp(fallingIds());
    const first = coach.append(question('first'));
    const second = coach.append(reply('second'));
    const third = coach.append(question('third'));

    expect(await first).toEqual({ ...question('first'), id: 'm-9' });
    expect(await second).toEqual({ ...reply('second'), id: 'm-8' });
    await third;
    expect(texts(await coach.list())).toEqual(['first', 'second', 'third']);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    expect(texts(await createCoachRepo(reopened.db, { clock }).list())).toEqual([
      'first',
      'second',
      'third',
    ]);
    reopened.db.close();
  });

  it('lists messages oldest first by their time', async () => {
    const { db, coach } = await setUp();
    await coach.append(reply('later', FACTORY_NOW + 60_000));
    await coach.append(question('earlier', FACTORY_NOW));

    expect(texts(await coach.list())).toEqual(['earlier', 'later']);
    db.close();
  });

  it('refuses a message with an unknown role, and a failed write does not stop the queue', async () => {
    const { db, coach } = await setUp();
    db.coachMessages.hook('creating', (_key, row) => {
      if (row.text === 'refused by the disk') throw new Error('write failed');
    });

    const unknownRole = coach.append({ ...question('who?'), role: 'system' } as never);
    const failing = coach.append(question('refused by the disk'));
    const after = coach.append(reply('still stored'));

    await expect(unknownRole).rejects.toBeInstanceOf(TypeError);
    await expect(failing).rejects.toThrow('write failed');
    expect(await after).toMatchObject({ text: 'still stored' });
    expect(texts(await coach.list())).toEqual(['still stored']);
    db.close();
  });

  it('follows an append through a live query (R06.3)', async () => {
    const { db, coach } = await setUp();
    const counted = countRuns(() => coach.list());
    const source = live(counted.query);
    const stop = source.subscribe(() => undefined);
    await counted.untilRuns(1);
    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [] });

    const stored = await coach.append(question('how much fibre today?'));
    await counted.untilRuns(2);

    expect(source.getSnapshot()).toEqual({ status: 'ready', value: [stored] });
    stop();
    counted.close();
    db.close();
  });
});

describe('reset and generation', () => {
  it('empties the conversation and bumps the generation, which survives a reopen', async () => {
    const { db, factory, name, coach } = await setUp();
    expect(await coach.generation()).toBe(0);
    await coach.append(question('first'));
    await coach.append(reply('answer'));

    expect(await coach.reset()).toBe(1);
    expect(await coach.list()).toEqual([]);
    expect(await db.coachMessages.count()).toBe(0);
    expect(await coach.generation()).toBe(1);
    expect(await coach.reset()).toBe(2);
    db.close();

    const reopened = await openTestDb({ indexedDB: factory, name });
    expect(await createCoachRepo(reopened.db, { clock }).generation()).toBe(2);
    reopened.db.close();
  });

  it('stores nothing for an append that carries a generation from before a reset (R04.6, D-16.34)', async () => {
    const { db, coach } = await setUp();
    const generation = await coach.generation();
    expect(await coach.append(question('before'), generation)).toMatchObject({ text: 'before' });

    await coach.reset();
    expect(await coach.append(reply('late reply'), generation)).toBeNull();
    expect(await coach.list()).toEqual([]);

    expect(await coach.append(question('new chat'), generation + 1)).toMatchObject({
      text: 'new chat',
    });
    expect(texts(await coach.list())).toEqual(['new chat']);
    db.close();
  });

  it('applies a reset between appends in call order', async () => {
    const { db, coach } = await setUp();
    const generation = await coach.generation();
    const before = coach.append(question('before'));
    const reset = coach.reset();
    const late = coach.append(reply('late reply'), generation);
    const after = coach.append(question('after'));

    await before;
    expect(await reset).toBe(1);
    expect(await late).toBeNull();
    await after;
    expect(texts(await coach.list())).toEqual(['after']);
    db.close();
  });

  it('reads a damaged generation as 0 and keeps it aside when a reset replaces it', async () => {
    const { db, coach } = await setUp();
    const damaged = { key: GENERATION_KEY, value: 'two' };
    await db.meta.put(damaged);

    expect(await coach.generation()).toBe(0);
    expect(await coach.reset()).toBe(1);
    await settleQuarantine(db);
    expect(await db.quarantine.toArray()).toEqual([
      expect.objectContaining({ table: 'meta', key: GENERATION_KEY, raw: damaged }),
    ]);
    db.close();
  });
});

describe('unreadable messages (R04.7)', () => {
  it('keeps a corrupt message aside and still lists the rest', async () => {
    const { db, coach } = await setUp();
    await coach.append(question('first', FACTORY_NOW));
    await db.coachMessages.put(unreadable(FACTORY_NOW + 1_000) as never);
    await coach.append(reply('second', FACTORY_NOW + 2_000));

    expect(texts(await coach.list())).toEqual(['first', 'second']);
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
    // The oldest row is the unreadable one; 200 readable messages follow it.
    await db.coachMessages.put(unreadable(FACTORY_NOW - 1_000) as never);
    await db.coachMessages.bulkPut(
      Array.from({ length: COACH_MESSAGE_LIMIT }, (_, index) =>
        makeCoachMessage({ id: `old-${index}`, text: `old ${index}`, at: FACTORY_NOW + index }),
      ),
    );

    await coach.append(reply('newest', FACTORY_NOW + 10_000));
    const list = await coach.list();
    expect(list).toHaveLength(COACH_MESSAGE_LIMIT);
    expect(list[0]?.text).toBe('old 1');
    expect(list.at(-1)?.text).toBe('newest');

    expect(await coach.patch('broken', { text: 'repaired?' })).toBeNull();
    await settleQuarantine(db);
    expect(await db.coachMessages.get('broken')).toEqual(unreadable(FACTORY_NOW - 1_000));
    expect(await db.quarantine.count()).toBe(1);
    db.close();
  });

  it('keeps a corrupt message aside before a reset deletes it', async () => {
    const { db, coach } = await setUp();
    await db.coachMessages.put(unreadable(FACTORY_NOW) as never);
    await coach.append(question('question'));

    expect(await coach.reset()).toBe(1);
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

  it('refuses a reset that cannot keep a corrupt message aside, and changes nothing', async () => {
    const { db, coach } = await setUp();
    await db.coachMessages.put(unreadable(FACTORY_NOW) as never);
    await coach.append(question('question'));
    breakQuarantine(db);

    await expect(coach.reset()).rejects.toBeInstanceOf(WriteBlockedError);
    expect(await db.coachMessages.get('broken')).toEqual(unreadable(FACTORY_NOW));
    expect(texts(await coach.list())).toEqual(['question']);
    expect(await coach.generation()).toBe(0);
    db.close();
  });
});

describe('patch', () => {
  it('sets and clears the failed state of a question without moving it (D-16.31)', async () => {
    const { db, coach } = await setUp(fallingIds());
    const asked = await coach.append(question('first'));
    await coach.append(reply('second'));
    const failed = { status: 'failed', kind: 'offline', details: 'no connection' } as const;

    expect(await coach.patch(asked.id, { state: failed })).toEqual({ ...asked, state: failed });
    expect(await coach.list()).toEqual([
      { ...asked, state: failed },
      expect.objectContaining({ text: 'second' }),
    ]);

    expect(await coach.patch(asked.id, { state: null, text: 'first, again' })).toEqual({
      ...asked,
      text: 'first, again',
    });
    expect(texts(await coach.list())).toEqual(['first, again', 'second']);
    db.close();
  });

  it('returns null for a message that is not stored and stores nothing', async () => {
    const { db, coach } = await setUp();
    expect(await coach.patch('not-stored', { text: 'hello' })).toBeNull();
    expect(await db.coachMessages.count()).toBe(0);
    db.close();
  });
});
