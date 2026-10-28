import { afterEach, describe, expect, it } from 'vitest';
import type { PlatewiseDb } from '../../data/schema';
import { withIdSequence } from '../../lib/ids';
import { SNAPSHOT_NOW } from './__fixtures__/snapshot';
import { closeAll, openCoachStores } from './__fixtures__/stores';
import {
  CHECK_IN_LIMIT,
  checkCheckIn,
  createCheckIns,
  readCheckIns,
  type CheckInInput,
} from './checkIns';

// The stores' clock: Monday 26 October 2026, 12:30 in New York.
const local = (text: string) => new Date(text).getTime();

const opened: PlatewiseDb[] = [];
afterEach(() => closeAll(opened));

async function setUp() {
  const stores = await openCoachStores();
  opened.push(stores.db);
  const checkIns = createCheckIns({
    settingsRepo: stores.settingsRepo,
    clock: stores.clock,
    newId: withIdSequence('check'),
  });
  const stored = async () => readCheckIns(await stores.settingsRepo.get('coach.checkIns'));
  return { ...stores, checkIns, stored };
}

const THURSDAY: CheckInInput = {
  chatId: 'chat-1',
  date: '2026-10-29',
  time: '19:00',
  text: '  How did   the new breakfast go? ',
};

describe('checkCheckIn: a check-in the Coach may keep (P17-03, D-16.102)', () => {
  it('keeps a time ahead within 14 days, its words tidied', () => {
    expect(checkCheckIn(THURSDAY, SNAPSHOT_NOW)).toEqual({
      ok: true,
      value: { at: local('2026-10-29T19:00:00'), text: 'How did the new breakfast go?' },
    });
    expect(checkCheckIn({ ...THURSDAY, date: '2026-11-09', time: '12:30' }, SNAPSHOT_NOW).ok).toBe(
      true,
    );
  });

  it.each([
    ['no words', { text: '   ' }, 'noText'],
    ['words over 120 characters', { text: 'a'.repeat(121) }, 'textTooLong'],
    ['no time of day', { time: '7pm' }, 'badTime'],
    ['no calendar day', { date: '2026-02-30' }, 'badDate'],
    ['a moment that passed', { date: '2026-10-26', time: '12:30' }, 'past'],
    ['more than 14 days ahead', { date: '2026-11-09', time: '12:31' }, 'tooFar'],
  ] as const)('refuses %s', (_name, change, problem) => {
    expect(checkCheckIn({ ...THURSDAY, ...change }, SNAPSHOT_NOW)).toEqual({
      ok: false,
      error: problem,
    });
  });

  it('counts an emoji as one character', () => {
    expect(checkCheckIn({ ...THURSDAY, text: '🥗'.repeat(120) }, SNAPSHOT_NOW).ok).toBe(true);
  });
});

describe('readCheckIns', () => {
  it('reads each stored check-in on its own, soonest first, leaving out what it cannot read', () => {
    expect(
      readCheckIns([
        { id: 'b', chatId: 'c', at: 20, text: 'Later', messageId: 'm' },
        { id: 'a', chatId: 'c', at: 10, text: 'Sooner', messageId: '' },
        { id: '', chatId: 'c', at: 5, text: 'No id' },
        { id: 'x', chatId: 'c', at: -1, text: 'No time' },
        { id: 'y', at: 5, text: 'No chat' },
      ]),
    ).toEqual([
      { id: 'a', chatId: 'c', at: 10, text: 'Sooner' },
      { id: 'b', chatId: 'c', at: 20, text: 'Later', messageId: 'm' },
    ]);
  });
});

describe('createCheckIns: the waiting list (P17-03, D-16.102)', () => {
  it('adds a check-in to the stored list, which travels as a plain setting', async () => {
    const s = await setUp();

    expect(await s.checkIns.add(THURSDAY)).toEqual({
      ok: true,
      value: {
        id: 'check-1',
        chatId: 'chat-1',
        at: local('2026-10-29T19:00:00'),
        text: 'How did the new breakfast go?',
      },
    });
    expect(await s.settingsRepo.get('coach.checkIns')).toEqual([
      {
        id: 'check-1',
        chatId: 'chat-1',
        at: local('2026-10-29T19:00:00'),
        text: 'How did the new breakfast go?',
      },
    ]);
  });

  it('keeps at most 3 waiting, even when four are added at once', async () => {
    const s = await setUp();
    const results = await Promise.all(
      ['19:00', '19:05', '19:10', '19:15'].map((time) => s.checkIns.add({ ...THURSDAY, time })),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(CHECK_IN_LIMIT);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: 'full' }]);
    expect(await s.stored()).toHaveLength(3);
  });

  it('answers the problem of a check-in it cannot keep, and stores nothing', async () => {
    const s = await setUp();
    expect(await s.checkIns.add({ ...THURSDAY, date: '2026-10-25' })).toEqual({
      ok: false,
      error: 'past',
    });
    expect(await s.stored()).toEqual([]);
  });

  it('removes one, ties some to their reply, and drops a deleted chat’s', async () => {
    const s = await setUp();
    await s.checkIns.add(THURSDAY);
    await s.checkIns.add({ ...THURSDAY, time: '20:00' });
    await s.checkIns.add({ ...THURSDAY, chatId: 'chat-2' });

    expect(await s.checkIns.remove('check-2')).toBe(true);
    expect(await s.checkIns.remove('check-2')).toBe(false);
    await s.checkIns.attach(['check-1', 'check-3'], 'reply-9');
    expect((await s.stored()).map(({ id, messageId }) => [id, messageId])).toEqual([
      ['check-1', 'reply-9'],
      ['check-3', 'reply-9'],
    ]);

    await s.checkIns.dropChat('chat-2');
    expect((await s.stored()).map(({ id }) => id)).toEqual(['check-1']);
  });

  it('takes the check-ins whose time has come off the list, once, and writes nothing otherwise', async () => {
    const s = await setUp();
    await s.checkIns.add(THURSDAY);
    await s.checkIns.add({ ...THURSDAY, date: '2026-10-27', time: '08:00' });
    await s.checkIns.add({ ...THURSDAY, date: '2026-10-30' });
    let writes = 0;
    const update = s.settingsRepo.update.bind(s.settingsRepo);
    s.settingsRepo.update = (key, change) => {
      writes += 1;
      return update(key, change);
    };

    expect(await s.checkIns.takeDue(local('2026-10-27T07:00:00'))).toEqual([]);
    expect(writes).toBe(0);

    const later = local('2026-10-29T19:00:00');
    const [first, second] = await Promise.all([
      s.checkIns.takeDue(later),
      s.checkIns.takeDue(later),
    ]);
    expect([...first, ...second].map(({ id }) => id)).toEqual(['check-2', 'check-1']);
    expect((await s.stored()).map(({ id }) => id)).toEqual(['check-3']);
  });
});
