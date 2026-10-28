import { describe, expect, it } from 'vitest';
import type { InboxItem } from './contract';
import {
  EMPTY_INBOX,
  INBOX_MAX_ITEMS,
  addItems,
  clearItems,
  markAllRead,
  markRead,
  markTapped,
  readInbox,
  reconcile,
  removeItem,
  unreadCount,
  withPlan,
  type InboxState,
} from './inbox';
import { request, once, daily, weekly } from '../reminders/requests';

// Tests run in America/New_York. Monday 26 October 2026.
const local = (text: string) => new Date(text).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = local('2026-10-26T12:30:00');

function item(at: number, changes: Partial<InboxItem> = {}): InboxItem {
  return {
    ref: `300@${at}`,
    id: 300,
    kind: 'sugarOver',
    title: 'Sugar limit passed',
    body: '60 g of 50 g today.',
    at,
    open: 'home',
    read: false,
    ...changes,
  };
}

const words = { title: 'Lunch', body: 'Nothing logged for lunch yet.' };
const lunchCheck = (at: number) => request(146, words, once(at), 'home', 'mealCheck');

/** The plan handed over at `at`, after the first look. */
function planned(at: number, ...requests: ReturnType<typeof request>[]): InboxState {
  return withPlan(reconcile(EMPTY_INBOX, at), requests, at);
}

describe('the inbox: keeping notices (P17-04, D-16.103)', () => {
  it('keeps the newest first, at most 100 and 30 days', () => {
    const many = Array.from({ length: 120 }, (_, index) => item(NOW - index * HOUR));
    const kept = addItems(EMPTY_INBOX, many, NOW).items;
    expect(kept).toHaveLength(INBOX_MAX_ITEMS);
    expect(kept[0]!.at).toBe(NOW);

    const old = addItems(EMPTY_INBOX, [item(NOW - 31 * DAY), item(NOW - 29 * DAY)], NOW).items;
    expect(old.map((each) => each.at)).toEqual([NOW - 29 * DAY]);
  });

  it('keeps one notification once', () => {
    const once = addItems(EMPTY_INBOX, [item(NOW)], NOW);
    expect(addItems(once, [item(NOW)], NOW)).toBe(once);
  });

  it('counts the unread, marks one or all read, deletes one and clears', () => {
    const state = addItems(EMPTY_INBOX, [item(NOW), item(NOW - HOUR), item(NOW - 2 * HOUR)], NOW);
    expect(unreadCount(state.items)).toBe(3);

    const one = markRead(state, `300@${NOW - HOUR}`);
    expect(unreadCount(one.items)).toBe(2);
    expect(markRead(one, `300@${NOW - HOUR}`)).toBe(one);

    expect(unreadCount(markAllRead(state).items)).toBe(0);
    expect(removeItem(state, `300@${NOW}`).items.map((each) => each.at)).toEqual([
      NOW - HOUR,
      NOW - 2 * HOUR,
    ]);
    expect(clearItems(state).items).toEqual([]);
    expect(clearItems(clearItems(state))).toEqual(clearItems(state));
  });

  it('marks the newest item of a tapped notification read', () => {
    const state = addItems(
      EMPTY_INBOX,
      [
        item(NOW - DAY, { ref: 'a', id: 146 }),
        item(NOW, { ref: 'b', id: 146 }),
        item(NOW, { id: 9 }),
      ],
      NOW,
    );
    const tapped = markTapped(state, 146, NOW);
    expect(tapped.items.filter((each) => each.read).map((each) => each.ref)).toEqual(['b']);
    expect(markTapped(state, 12, NOW)).toBe(state);
  });
});

describe('the inbox: what came from the plan while the app was closed (P17-04)', () => {
  it('adds a planned notification whose time has passed, once', () => {
    const at = local('2026-10-26T13:00:00');
    const state = planned(NOW, lunchCheck(at));

    expect(reconcile(state, at - 1)).toBe(state);
    const later = reconcile(state, local('2026-10-26T15:00:00'));
    expect(later.items).toEqual([
      {
        ref: `146@${at}`,
        id: 146,
        kind: 'mealCheck',
        title: 'Lunch',
        body: 'Nothing logged for lunch yet.',
        at,
        open: 'home',
        read: false,
      },
    ]);
    expect(reconcile(later, local('2026-10-26T16:00:00'))).toBe(later);
  });

  it('adds nothing that was taken back before its time', () => {
    const at = local('2026-10-26T13:00:00');
    const state = planned(NOW, lunchCheck(at));
    // Lunch logged at 12:45: the next plan no longer holds the check.
    const replanned = withPlan(reconcile(state, NOW + 15 * 60_000), [], NOW + 15 * 60_000);
    expect(reconcile(replanned, local('2026-10-26T18:00:00')).items).toEqual([]);
  });

  it('adds every day of a repeating reminder that came, from when it was planned, at most 30 days', () => {
    const water = request(15, { title: 'Water', body: 'A glass.' }, daily('14:00'), 'home');
    const state = planned(NOW, water);

    const twoDaysOn = reconcile(state, local('2026-10-28T15:00:00'));
    expect(twoDaysOn.items.map((each) => each.at)).toEqual([
      local('2026-10-28T14:00:00'),
      local('2026-10-27T14:00:00'),
      local('2026-10-26T14:00:00'),
    ]);
    expect(twoDaysOn.items[0]!.kind).toBe('reminder');

    const monthsOn = reconcile(state, local('2027-01-10T15:00:00'));
    expect(monthsOn.items).toHaveLength(30);
  });

  it('adds a weekly reminder on its weekday only', () => {
    // Capacitor's Wednesday is 4.
    const gym = request(1_004, { title: 'Reminder', body: 'Gym' }, weekly('07:05', 4), 'home');
    const state = planned(NOW, gym);
    expect(reconcile(state, local('2026-11-02T12:00:00')).items.map((each) => each.at)).toEqual([
      local('2026-10-28T07:05:00'),
    ]);
  });

  it('counts a reminder only from when it was planned as it is', () => {
    // Water at 10:00 turned on at 12:30: today's 10:00 never came.
    const water = request(15, { title: 'Water', body: 'A glass.' }, daily('10:00'), 'home');
    const state = planned(NOW, water);
    expect(reconcile(state, local('2026-10-26T20:00:00'))).toBe(state);

    // Handed over again unchanged at 13:00: it keeps counting from 12:30.
    const again = withPlan(state, [water], NOW + HOUR);
    expect(again).toBe(state);
  });

  it('never brings back an item that was deleted', () => {
    const at = local('2026-10-26T13:00:00');
    const came = reconcile(planned(NOW, lunchCheck(at)), local('2026-10-26T14:00:00'));
    const deleted = removeItem(came, `146@${at}`);
    expect(reconcile(deleted, local('2026-10-26T18:00:00')).items).toEqual([]);
  });

  it('starts looking at the first plan, never before it', () => {
    const first = reconcile(EMPTY_INBOX, NOW);
    expect(first).toEqual({ items: [], plan: [], seenAt: NOW });
  });
});

describe('the inbox as stored (P17-04)', () => {
  it('reads a stored record item by item, dropping what cannot be used', () => {
    const good = item(NOW);
    const read = readInbox({
      items: [
        good,
        { ...good, kind: 'gremlins' },
        'nonsense',
        { ...good },
        { ...good, ref: 'b', open: 'moon' },
      ],
      plan: [
        {
          id: 15,
          kind: 'reminder',
          title: 'Water',
          body: 'x',
          key: 'k',
          since: 1,
          on: { hour: 25, minute: 0 },
        },
      ],
      seenAt: 'yesterday',
    });
    expect(read.items.map((each) => each.ref)).toEqual([good.ref, 'b']);
    expect(read.items[1]!.open).toBe('home');
    expect(read.plan).toEqual([]);
    expect(read.seenAt).toBeNull();
    expect(readInbox(null)).toBe(EMPTY_INBOX);
  });

  it('round-trips through JSON', () => {
    const state = reconcile(
      planned(
        NOW,
        lunchCheck(local('2026-10-26T13:00:00')),
        request(15, words, daily('14:00'), 'water'),
      ),
      local('2026-10-26T15:00:00'),
    );
    expect(readInbox(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
