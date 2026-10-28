// Where a tap on a notification, or on its item in the panel, opens the app (P17, D-16.101/103).

import { HOME_ROUTE, tabRoute, type Route } from '../../app/router';
import type { OpenTarget } from './contract';

const TARGETS = ['home', 'fast', 'water', 'weight', 'review', 'data'] as const;

/** A stored or reported target as one of ours; anything unknown opens Home. */
export function targetOf(open: unknown): OpenTarget {
  if (TARGETS.some((target) => target === open)) return open as OpenTarget;
  if (typeof open === 'object' && open !== null) {
    const chat = (open as { coachChat?: unknown }).coachChat;
    if (typeof chat === 'string' && chat !== '') return { coachChat: chat };
  }
  return 'home';
}

/** What opening needs from the app. */
export interface OpenApp {
  navigate(route: Route): void;
  /** Home shows today (the meals, water and the running fast are there). */
  selectToday(): void;
  /** A finished analysis's review opens (again, after a restart: D-16.46). */
  openReview(): void;
}

/**
 * Opens `target`: Home on today for a meal, water, the fast or an empty day; Progress for a
 * weigh-in; the review on Home; Settings › Your data for a backup; the Coach for a chat (P17 S2
 * opens the chat itself).
 */
export function openTarget(target: OpenTarget, app: OpenApp): void {
  if (typeof target === 'object') {
    app.navigate(tabRoute('coach'));
    return;
  }
  switch (target) {
    case 'weight':
      app.navigate(tabRoute('progress'));
      return;
    case 'data':
      app.navigate(tabRoute('settings', 'data'));
      return;
    case 'review':
      app.selectToday();
      app.navigate(HOME_ROUTE);
      app.openReview();
      return;
    default:
      app.selectToday();
      app.navigate(HOME_ROUTE);
  }
}
