import { describe, expect, it } from 'vitest';
import type { CoachMessage } from '../../domain/model';
import { freshDbOptions, openTestDb } from '../../test/db';
import { FACTORY_NOW, factories, testBlob } from '../../test/factories';
import { ready, watch } from '../../test/live';
import type { PlatewiseDb } from '../db';
import { WriteBlockedError, hasUnreadableData } from '../guard';
import { isBlobLike } from '../values';
import {
  COACH_GENERATION_KEY,
  COACH_HISTORY_LIMIT,
  coachRepo,
  type AppendResult,
} from './coachRepo';

const make = factories();
const MINUTE = 60_000;

function repoFor(db: PlatewiseDb) {
  return coachRepo(db, { clock: make.clock });
}

/** A message `n` minutes after the factory's now, with a recognisable id and text. */
function message(n: number, overrides: Partial<CoachMessage> = {}): CoachMessage {
  return make.coachMessage({
    id: `m-${String(n).padStart(3, '0')}`,
    text: `message ${n}`,
    at: FACTORY_NOW + n * MINUTE,
    role: n % 2 === 0 ? 'user' : 'assistant',
    ...overrides,
  });
}

/** A stored message that cannot be read: its text is a number. */
function damagedRow(id = 'm-broken', at = FACTORY_NOW - MINUTE) {
  return { id, role: 'user', text: 42, at };
}

async function putRaw(db: PlatewiseDb, raw: unknown): Promise<void> {
  await db.table('coachMessages').put(raw);
}

const texts = (messages: CoachMessage[]) => messages.map((item) => item.text);

function added(result: AppendResult): CoachMessage {
  if (result.kind !== 'added') throw new Error('expected the message to be stored');
  return result.message;
}

describe('append', () => {
  it('keeps the newest 200 of 205 messages: the oldest 5 are gone (ACC-I10-1, R04.8)', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    for (let n = 1; n <= 205; n++) await repo.append(message(n));

    const kept = await repo.list();
    expect(kept).toHaveLength(COACH_HISTORY_LIMIT);
    expect(kept[0]?.id).toBe('m-006');
    expect(kept.at(-1)?.id).toBe('m-205');
    expect(kept.map((item) => item.at)).toEqual(
      Array.from({ length: 200 }, (_, i) => FACTORY_NOW + (i + 6) * MINUTE),
    );
    expect(await db.coachMessages.count()).toBe(200);
    for (const gone of ['m-001', 'm-005']) expect(await db.coachMessages.get(gone)).toBeUndefined();
  });

  it('lands two appends started together in call order, whatever their times', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    // Same instant, and ids that sort the other way round.
    const question = message(0, { id: 'm-b', text: 'question' });
    const reply = message(0, { id: 'm-a', text: 'reply' });
    // A clock that went back a minute.
    const late = message(-1, { id: 'm-0', text: 'late' });

    const results = await Promise.all([
      repo.append(question),
      repo.append(reply),
      repo.append(late),
    ]);

    expect(texts(await repo.list())).toEqual(['question', 'reply', 'late']);
    const times = results.map((result) => added(result).at);
    expect(times).toEqual([FACTORY_NOW, FACTORY_NOW + 1, FACTORY_NOW + 2]);
    expect((await db.coachMessages.get('m-a'))?.at).toBe(FACTORY_NOW + 1);
  });

  it('keeps the time it was given when it comes after the newest message', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    await repo.append(message(1));
    const later = message(5);
    expect(added(await repo.append(later))).toEqual(later);
  });

  it('stores a small thumbnail and a failure marker', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const withPhoto = message(1, {
      thumb: testBlob('tiny jpeg'),
      state: { status: 'failed', kind: 'quota', details: 'HTTP 429' },
    });
    await repo.append(withPhoto);

    const [stored] = await repo.list();
    expect(isBlobLike(stored?.thumb)).toBe(true);
    expect(stored?.thumb?.size).toBe('tiny jpeg'.length);
    expect(stored?.state).toEqual({ status: 'failed', kind: 'quota', details: 'HTTP 429' });
  });

  it('rejects an id that is already stored and changes nothing', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    await repo.append(message(1));
    await putRaw(db, damagedRow('m-broken'));

    await expect(repo.append(message(2, { id: 'm-001', text: 'again' }))).rejects.toThrow();
    await expect(repo.append(message(3, { id: 'm-broken' }))).rejects.toThrow();

    expect(texts(await repo.list())).toEqual(['message 1']);
    expect(await db.table('coachMessages').get('m-broken')).toEqual(damagedRow('m-broken'));
    // A failed append does not stop the ones after it.
    await repo.append(message(4));
    expect(texts(await repo.list())).toEqual(['message 1', 'message 4']);
  });

  it('refuses a message that would not read back', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const bad = { ...message(1), at: Number.NaN };
    await expect(repo.append(bad)).rejects.toBeInstanceOf(TypeError);
    expect(await db.coachMessages.count()).toBe(0);
  });
});

describe('unreadable messages', () => {
  it('quarantines a corrupt row and still lists the rest (R04.7)', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    await repo.append(message(1));
    await putRaw(db, damagedRow());
    await repo.append(message(2));

    expect(texts(await repo.list())).toEqual(['message 1', 'message 2']);
    expect(await hasUnreadableData(db)).toBe(true);
    const copies = await db.quarantine.toArray();
    expect(copies.map(({ table, key, raw }) => ({ table, key, raw }))).toEqual([
      { table: 'coachMessages', key: 'm-broken', raw: damagedRow() },
    ]);
    // Never overwritten: the next append left the stored bytes as they were.
    expect(await db.table('coachMessages').get('m-broken')).toEqual(damagedRow());
  });

  it('never counts or deletes an unreadable row when trimming to the limit', async () => {
    const db = await openTestDb();
    await putRaw(db, damagedRow('m-broken', FACTORY_NOW - 999 * MINUTE));
    await db.coachMessages.bulkAdd(Array.from({ length: 200 }, (_, i) => message(i + 1)));
    const repo = repoFor(db);

    await repo.append(message(201));

    const kept = await repo.list();
    expect(kept).toHaveLength(200);
    expect(kept[0]?.id).toBe('m-002');
    expect(await db.table('coachMessages').get('m-broken')).toBeDefined();
  });

  it('refuses to patch an unreadable row and leaves it as it was', async () => {
    const db = await openTestDb();
    await putRaw(db, damagedRow());
    const repo = repoFor(db);
    expect(await repo.patch('m-broken', { state: null })).toBe('unreadable');
    expect(await db.table('coachMessages').get('m-broken')).toEqual(damagedRow());
    expect(await db.quarantine.count()).toBe(1);
  });
});

describe('patch', () => {
  it('sets and clears the failure marker for Retry', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const question = message(1, { role: 'user' });
    await repo.append(question);

    const failed = { status: 'failed', kind: 'timeout' } as const;
    expect(await repo.patch(question.id, { state: failed })).toBe('patched');
    expect((await repo.list())[0]?.state).toEqual(failed);

    expect(await repo.patch(question.id, {})).toBe('patched');
    expect((await repo.list())[0]?.state).toEqual(failed);

    expect(await repo.patch(question.id, { state: null })).toBe('patched');
    expect(await repo.list()).toEqual([question]);
    expect(await repo.patch('m-unknown', { state: failed })).toBe('missing');
  });

  it('runs after an append asked for before it', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const question = message(1);
    const appending = repo.append(question);
    const patching = repo.patch(question.id, { state: { status: 'failed', kind: 'network' } });
    await appending;
    expect(await patching).toBe('patched');
  });
});

describe('reset and generation', () => {
  it('empties the conversation and bumps the generation', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    await repo.append(message(1));
    await repo.append(message(2));
    expect(await repo.generation()).toBe(0);

    expect(await repo.reset()).toBe(1);
    expect(await repo.list()).toEqual([]);
    expect(await db.coachMessages.count()).toBe(0);
    expect(await repo.generation()).toBe(1);
    expect(await db.meta.get(COACH_GENERATION_KEY)).toEqual({
      key: COACH_GENERATION_KEY,
      value: 1,
    });

    expect(await repo.reset()).toBe(2);
  });

  it('drops a reply that belongs to the conversation before a reset (D-16.34)', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const turn = await repo.generation();
    await repo.append(message(1), { generation: turn });

    // Reset and the late reply are asked for together; the reset was first.
    const resetting = repo.reset();
    const replying = repo.append(message(2), { generation: turn });

    expect(await resetting).toBe(1);
    expect(await replying).toEqual({ kind: 'stale' });
    expect(await repo.list()).toEqual([]);

    const fresh = message(3);
    expect(await repo.append(fresh, { generation: 1 })).toEqual({ kind: 'added', message: fresh });
  });

  it('keeps an unreadable row aside before clearing it', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    await putRaw(db, damagedRow());
    await repo.append(message(1));

    await repo.reset();

    expect(await db.coachMessages.count()).toBe(0);
    expect((await db.quarantine.toArray()).map((copy) => copy.raw)).toEqual([damagedRow()]);
  });

  it('refuses the whole reset when an unreadable row cannot be kept aside', async () => {
    const db = await openTestDb();
    await putRaw(db, damagedRow());
    await db.coachMessages.add(message(1));
    const repo = repoFor(db);
    const diskFull = () => {
      throw new Error('quota exceeded');
    };
    db.quarantine.hook('creating', diskFull);

    await expect(repo.reset()).rejects.toBeInstanceOf(WriteBlockedError);

    db.quarantine.hook('creating').unsubscribe(diskFull);
    expect(await db.coachMessages.count()).toBe(2);
    expect(await repo.generation()).toBe(0);
  });

  it('reads an unreadable generation as 0, keeps it aside and replaces it on reset', async () => {
    const db = await openTestDb();
    await db.meta.put({ key: COACH_GENERATION_KEY, value: 'seven' });
    const repo = repoFor(db);

    expect(await repo.generation()).toBe(0);
    expect(await repo.reset()).toBe(1);
    expect(await repo.generation()).toBe(1);
    const copies = await db.quarantine.where('table').equals('meta').toArray();
    expect(copies.map((copy) => copy.raw)).toEqual([{ key: COACH_GENERATION_KEY, value: 'seven' }]);
  });

  it('keeps the conversation and the generation across a reload', async () => {
    const options = freshDbOptions();
    const db = await openTestDb(options);
    const repo = repoFor(db);
    await repo.append(message(1));
    await repo.reset();
    await repo.append(message(2));

    db.close();
    const reloaded = repoFor(await openTestDb(options));
    expect(texts(await reloaded.list())).toEqual(['message 2']);
    expect(await reloaded.generation()).toBe(1);
  });
});

describe('feed', () => {
  it('pushes the conversation again after an append and a reset', async () => {
    const db = await openTestDb();
    const repo = repoFor(db);
    const seen = watch(repo.feed());
    await seen.until(ready((messages) => messages.length === 0));

    await repo.append(message(1));
    await seen.until(ready((messages) => texts(messages).join() === 'message 1'));
    await repo.reset();
    await seen.until(ready((messages) => messages.length === 0));
  });
});
