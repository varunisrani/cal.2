import { describe, expect, it } from 'vitest';
import { groupByDay } from './groups';
import { inboxItem } from './testing/openNotify';

// Tests run in America/New_York.
const local = (text: string) => new Date(text).getTime();
const NOW = local('2026-10-26T12:30:00');

describe('the panel’s groups (P17-04)', () => {
  it('groups by Today, Yesterday and Earlier, leaving out an empty group', () => {
    const items = [
      inboxItem(NOW, { ref: 'a' }),
      inboxItem(local('2026-10-25T23:00:00'), { ref: 'b' }),
      inboxItem(local('2026-10-20T09:00:00'), { ref: 'c' }),
    ];
    expect(
      groupByDay(items, NOW).map(({ group, items: inGroup }) => [
        group,
        inGroup.map((each) => each.ref),
      ]),
    ).toEqual([
      ['today', ['a']],
      ['yesterday', ['b']],
      ['earlier', ['c']],
    ]);
    expect(groupByDay([items[2]!], NOW).map(({ group }) => group)).toEqual(['earlier']);
  });
});
