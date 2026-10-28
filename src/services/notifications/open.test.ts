import { describe, expect, it, vi } from 'vitest';
import { HOME_ROUTE, tabRoute } from '../../app/router';
import type { OpenTarget } from './contract';
import { openTarget, targetOf, type OpenApp } from './open';

function app(): OpenApp & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    navigate: vi.fn((route) => calls.push(`go ${JSON.stringify(route)}`)),
    selectToday: () => calls.push('today'),
    openReview: () => calls.push('review'),
  };
}

const go = (route: unknown) => `go ${JSON.stringify(route)}`;

describe('where a notification opens the app (P17, D-16.101)', () => {
  it.each<[OpenTarget, string[]]>([
    ['home', ['today', go(HOME_ROUTE)]],
    ['fast', ['today', go(HOME_ROUTE)]],
    ['water', ['today', go(HOME_ROUTE)]],
    ['weight', [go(tabRoute('progress'))]],
    ['review', ['today', go(HOME_ROUTE), 'review']],
    ['data', [go(tabRoute('settings', 'data'))]],
    [{ coachChat: 'chat-1' }, [go(tabRoute('coach'))]],
  ])('opens %j', (target, expected) => {
    const a = app();
    openTarget(target, a);
    expect(a.calls).toEqual(expected);
  });

  it('reads a stored target, anything unknown as Home', () => {
    expect(targetOf('weight')).toBe('weight');
    expect(targetOf({ coachChat: 'c' })).toEqual({ coachChat: 'c' });
    expect(targetOf({ coachChat: '' })).toBe('home');
    expect(targetOf('moon')).toBe('home');
    expect(targetOf(undefined)).toBe('home');
  });
});
