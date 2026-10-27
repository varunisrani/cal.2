import { describe, expect, it, vi } from 'vitest';
import {
  createRouter,
  HOME_ROUTE,
  ONBOARDING_ROUTE,
  parseHash,
  routeHash,
  tabRoute,
  type Route,
  type Router,
} from './router';
import { memoryHost, type MemoryHost } from './testing/memoryHost';

/** A started router over an in-memory history, with what the person sees after each step. */
function setup(initialHash = '#/home', options: { async?: boolean } = {}) {
  const host = memoryHost(initialHash, options);
  const router = createRouter(host);
  router.start();
  return { host, router, at: () => routeHash(router.current().route) };
}

/** What the shell does after each change is drawn. */
function drawn(router: Router): void {
  router.applyScroll();
}

describe('parseHash', () => {
  it.each<[string, Route]>([
    ['#/home', HOME_ROUTE],
    ['#/progress', tabRoute('progress')],
    ['#/coach', tabRoute('coach')],
    ['#/settings', tabRoute('settings')],
    ['#/settings/', tabRoute('settings')],
    ['#/settings/tab-bar', tabRoute('settings', 'tab-bar')],
    ['#/onboarding', ONBOARDING_ROUTE],
    ['', HOME_ROUTE],
    ['#', HOME_ROUTE],
    ['#/', HOME_ROUTE],
  ])('reads %j', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('parses the page and sub-page of a nested Settings address', () => {
    expect(parseHash('#/settings/units')).toEqual(tabRoute('settings', 'units'));
    expect(parseHash('#/settings/units/weight')).toEqual(tabRoute('settings', 'units', 'weight'));
  });

  it.each([
    '#/kitchen',
    '#home',
    '#/Home',
    '#/home/extra',
    '#/progress/week',
    '#/settings/units/weight/kg',
    '#/settings/Units',
    '#/settings//units',
    '#/settings/units%20x',
    '#/settings/-units',
    '#/onboarding/step',
  ])('names no route for %j', (hash) => {
    expect(parseHash(hash)).toBeNull();
  });

  it('writes every route back to the hash it was read from', () => {
    for (const hash of ['#/home', '#/coach', '#/settings/units/weight', '#/onboarding']) {
      const route = parseHash(hash);
      expect(route && routeHash(route)).toBe(hash);
    }
  });
});

describe('createRouter', () => {
  it('opens Home for an unknown address and keeps the address out of history', () => {
    const { host, at } = setup('#/kitchen');
    expect(at()).toBe('#/home');
    expect(host.entries()).toEqual({ hashes: ['#/home'], index: 0 });
  });

  it('opens Home for an empty address', () => {
    const { host, at } = setup('');
    expect(at()).toBe('#/home');
    expect(host.hash()).toBe('#/home');
  });

  it('goes Home when the address is edited to an unknown one', () => {
    const { host, router, at } = setup('#/home');
    router.selectTab('coach');
    host.type('#/nowhere');
    expect(at()).toBe('#/home');
    expect(host.hash()).toBe('#/home');
  });

  it('follows an address the person edits to a known route', () => {
    const { host, at } = setup('#/home');
    host.type('#/settings/units');
    expect(at()).toBe('#/settings/units');
  });

  it('closes only the top sheet when Back is pressed with two sheets open', () => {
    const { host, router } = setup('#/home');
    router.openSheet('add');
    router.openSheet('manual');
    expect(router.current().sheets).toEqual(['add', 'manual']);

    host.back();
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: ['add'] });
    host.back();
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: [] });
    expect(host.entries().index).toBe(0);
  });

  it('steps back over its own entry when a sheet closes from inside', () => {
    const { host, router } = setup('#/home');
    router.openSheet('manual');
    expect(host.entries()).toEqual({ hashes: ['#/home', '#/home'], index: 1 });

    router.closeSheet('manual');
    expect(router.current().sheets).toEqual([]);
    expect(host.entries().index).toBe(0);
  });

  it('closes the sheets above a lower sheet that closes', () => {
    const { host, router } = setup('#/home');
    router.openSheet('review');
    router.openSheet('servings');
    router.openSheet('confirm');
    router.closeSheet('review');
    expect(router.current().sheets).toEqual([]);
    expect(host.entries().index).toBe(0);
  });

  it('keeps one entry for a sheet that is opened twice and ignores closing an unknown one', () => {
    const { host, router } = setup('#/home');
    router.openSheet('manual');
    router.openSheet('manual');
    router.closeSheet('other');
    expect(router.current().sheets).toEqual(['manual']);
    expect(host.entries().hashes).toHaveLength(2);
  });

  it('never reopens a sheet on Forward', () => {
    const { host, router } = setup('#/home');
    router.openSheet('manual');
    host.back();
    host.forward();
    expect(router.current().sheets).toEqual([]);
  });

  it('drops open sheets on a reload', () => {
    const { host, router } = setup('#/home');
    router.selectTab('progress');
    router.openSheet('weight');
    const reloaded = createRouter(host);
    reloaded.start();
    expect(reloaded.current()).toEqual({ route: tabRoute('progress'), sheets: [] });
    // The history the session built still works after the reload: Back reaches Home.
    host.back();
    host.back();
    expect(routeHash(reloaded.current().route)).toBe('#/home');
  });

  it("restores Home's scroll after Home → Progress → Home", () => {
    const { host, router, at } = setup('#/home');
    host.setScroll(420);
    router.selectTab('progress');
    drawn(router);
    expect(at()).toBe('#/progress');
    expect(host.scrollY()).toBe(0);

    host.setScroll(90);
    router.selectTab('home');
    drawn(router);
    expect(at()).toBe('#/home');
    expect(host.scrollY()).toBe(420);

    router.selectTab('progress');
    drawn(router);
    expect(host.scrollY()).toBe(90);
  });

  it('restores the tab scroll when Back leaves a tab too', () => {
    const { host, router } = setup('#/home');
    host.setScroll(300);
    router.selectTab('coach');
    drawn(router);
    host.setScroll(40);
    host.back();
    drawn(router);
    expect(routeHash(router.current().route)).toBe('#/home');
    expect(host.scrollY()).toBe(300);
  });

  it('keeps Home at the bottom: Back from any tab goes Home, Back on Home leaves', () => {
    const { host, router, at } = setup('#/home');
    router.selectTab('progress');
    router.selectTab('coach');
    router.selectTab('settings');
    expect(host.entries()).toEqual({ hashes: ['#/home', '#/settings'], index: 1 });

    host.back();
    expect(at()).toBe('#/home');
    router.selectTab('coach');
    router.selectTab('home');
    expect(host.entries().index).toBe(0);
    expect(at()).toBe('#/home');
  });

  it('remembers the last nested Settings page of the tab', () => {
    const { host, router, at } = setup('#/home');
    router.selectTab('settings');
    router.navigate(tabRoute('settings', 'units'));
    router.selectTab('progress');
    router.selectTab('settings');
    expect(at()).toBe('#/settings/units');
    expect(router.lastRoute('settings')).toEqual(tabRoute('settings', 'units'));
    // The remembered page sits over the hub, so Back walks up to it.
    host.back();
    expect(at()).toBe('#/settings');
  });

  it('returns to the Settings hub when Settings is tapped on a nested page', () => {
    const { host, router, at } = setup('#/home');
    router.selectTab('settings');
    router.navigate(tabRoute('settings', 'units'));
    router.navigate(tabRoute('settings', 'units', 'weight'));
    router.selectTab('settings');
    expect(at()).toBe('#/settings');
    expect(host.entries()).toMatchObject({ index: 1 });
  });

  it('returns to the hub from a nested page the app was opened on', () => {
    const { host, router, at } = setup('#/settings/units');
    router.selectTab('settings');
    expect(at()).toBe('#/settings');
    expect(host.entries()).toEqual({ hashes: ['#/settings'], index: 0 });
  });

  it('steps back to the page a nested page was opened from instead of adding one', () => {
    const { host, router, at } = setup('#/settings');
    host.setScroll(300);
    router.navigate(tabRoute('settings', 'app'));
    drawn(router);
    router.navigate(tabRoute('settings', 'tab-bar'));
    drawn(router);

    router.navigate(tabRoute('settings', 'app'));
    drawn(router);
    expect(at()).toBe('#/settings/app');
    expect(host.entries()).toEqual({
      hashes: ['#/settings', '#/settings/app', '#/settings/tab-bar'],
      index: 1,
    });
    // Back from there still reaches the hub, where it was left.
    host.back();
    drawn(router);
    expect(at()).toBe('#/settings');
    expect(host.scrollY()).toBe(300);
  });

  it('adds an entry for a page other than the one a nested page was opened from', () => {
    const { host, router } = setup('#/settings/tab-bar');
    router.navigate(tabRoute('settings', 'app'));
    expect(host.entries()).toEqual({ hashes: ['#/settings/tab-bar', '#/settings/app'], index: 1 });
  });

  it('does nothing when the tab on screen is tapped again', () => {
    const { host, router } = setup('#/home');
    router.selectTab('coach');
    const listener = vi.fn();
    router.subscribe(listener);
    router.selectTab('coach');
    router.selectTab('coach');
    expect(listener).not.toHaveBeenCalled();
    expect(host.entries().hashes).toHaveLength(2);
  });

  it('starts a nested page at the top and restores the hub scroll on Back', () => {
    const { host, router } = setup('#/settings');
    host.setScroll(250);
    router.navigate(tabRoute('settings', 'units'));
    drawn(router);
    expect(host.scrollY()).toBe(0);
    host.back();
    drawn(router);
    expect(host.scrollY()).toBe(250);
  });

  it('switches tabs from a nested page with a sheet open, leaving nothing of them behind', () => {
    const { host, router, at } = setup('#/home');
    router.selectTab('settings');
    router.navigate(tabRoute('settings', 'units'));
    router.openSheet('picker');
    router.selectTab('home');
    expect(at()).toBe('#/home');
    expect(router.current().sheets).toEqual([]);
    expect(host.entries().index).toBe(0);
  });

  it('replaces a tab the app was opened on when Home is chosen', () => {
    const { host, router, at } = setup('#/coach');
    router.selectTab('home');
    expect(at()).toBe('#/home');
    expect(host.entries()).toEqual({ hashes: ['#/home'], index: 0 });
  });

  it('finishes a tab switch once a late step back lands, and only once', () => {
    const { host, router, at } = setup('#/home', { async: true });
    router.selectTab('settings');
    router.navigate(tabRoute('settings', 'units'));
    router.selectTab('progress');
    expect(at()).toBe('#/settings/units');

    host.flush();
    expect(at()).toBe('#/progress');
    // The nested page is left behind as a forward entry, as a browser leaves it.
    const { hashes, index } = host.entries();
    expect(hashes.slice(0, index + 1)).toEqual(['#/home', '#/progress']);
  });

  it('closes a sheet at once even when the step back lands later', () => {
    const { host, router } = setup('#/home', { async: true });
    router.openSheet('manual');
    router.closeSheet();
    expect(router.current().sheets).toEqual([]);
    host.flush();
    expect(router.current().sheets).toEqual([]);
    expect(host.entries().index).toBe(0);
  });

  it('redirects with replace and keeps onboarding out of the history', () => {
    const { host, router, at } = setup('#/home');
    router.navigate(ONBOARDING_ROUTE, { replace: true });
    expect(at()).toBe('#/onboarding');
    expect(host.entries()).toEqual({ hashes: ['#/onboarding'], index: 0 });

    router.navigate(HOME_ROUTE);
    expect(at()).toBe('#/home');
    expect(host.entries()).toEqual({ hashes: ['#/home'], index: 0 });
  });

  it('ignores tab taps on onboarding', () => {
    const { router, at } = setup('#/onboarding');
    router.selectTab('coach');
    expect(at()).toBe('#/onboarding');
  });

  it('tells subscribers once per change and stops after unsubscribing', () => {
    const { router } = setup('#/home');
    const listener = vi.fn();
    const stop = router.subscribe(listener);
    router.openSheet('manual');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    router.closeSheet();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops following the history when stopped', () => {
    const host: MemoryHost = memoryHost('#/home');
    const router = createRouter(host);
    const stop = router.start();
    router.selectTab('coach');
    stop();
    host.back();
    expect(routeHash(router.current().route)).toBe('#/coach');
  });
});
