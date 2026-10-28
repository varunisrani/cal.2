// The notification panel's groups (P17-04, D-16.103): Today, Yesterday and Earlier. Pure.

import { addDays, dayKeyOf } from '../../domain/dates/dayKey';
import type { InboxItem } from '../../services/notifications/contract';

export type InboxGroup = 'today' | 'yesterday' | 'earlier';

/** The items by Today, Yesterday and Earlier (empty groups left out), each newest first. */
export function groupByDay(
  items: readonly InboxItem[],
  now: number,
): { group: InboxGroup; items: InboxItem[] }[] {
  const today = dayKeyOf(now);
  const yesterday = addDays(today, -1);
  const groups: Record<InboxGroup, InboxItem[]> = { today: [], yesterday: [], earlier: [] };
  for (const item of items) {
    const day = dayKeyOf(item.at);
    groups[day >= today ? 'today' : day === yesterday ? 'yesterday' : 'earlier'].push(item);
  }
  return (['today', 'yesterday', 'earlier'] as const)
    .filter((group) => groups[group].length > 0)
    .map((group) => ({ group, items: groups[group] }));
}
