import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  HOME_ROUTE,
  createRouter,
  parseRoute,
  routeHash,
  tabOf,
  trailOf,
  type Route,
  type Router,
} from './router';

const units: Route = { name: 'settings', page: 'units' };
const hub: Route = { name: 'settings' };

/** Puts the page on `hash` with no state of ours, as a fresh load would be. */
function openPageAt(hash: string, state: unknown = null): void {
  window.history.replaceState(state, '', hash);
}

function startRouter(): Router {
  const router = createRouter(window);
  onTestFinished(() => router.stop());
  return router;
}

/** Resolves after the next history move has been handled (the router listens first). */
function moved(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

async function back(): Promise<void> {
  const done = moved();
  window.history.back();
  await done;
}

function sheetsInHistory(): unknown {
  return (window.history.state as { platewise?: { sheets?: number } } | null)?.platewise?.sheets;
}

describe('parseRoute', () => {
  it('reads the five screens', () => {
    expect(parseRoute('#/home')).toEqual({ name: 'home' });
    expect(parseRoute('#/progress')).toEqual({ name: 'progress' });
    expect(parseRoute('#/coach')).toEqual({ name: 'coach' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/onboarding')).toEqual({ name: 'onboarding' });
  });

  it('reads a Settings page and its sub-page', () => {
    expect(parseRoute('#/settings/units')).toEqual({ name: 'settings', page: 'units' });
    expect(parseRoute('#/settings/units')).not.toHaveProperty('sub');
    expect(parseRoute('#/settings/ai-providers/keys')).toEqual({
      name: 'settings',
      page: 'ai-providers',
      sub: 'keys',
    });
  });

  it('reads an address with a trailing slash as the address without it', () => {
    expect(parseRoute('#/progress/')).toEqual({ name: 'progress' });
    expect(parseRoute('#/settings/units/')).toEqual({ name: 'settings', page: 'units' });
  });

  it.each([
    '',
    '#',
    '#/',
    '#home',
    '#/kitchen',
    '#/Home',
    '#/home/extra',
    '#/settings/Units',
    '#/settings/a b',
    '#/settings//units',
    '#/settings/a/b/c',
    '#/settings/-units',
    '#/home?tab=1',
  ])('gives nothing for the unknown address %j', (hash) => {
    expect(parseRoute(hash)).toBeNull();
  });
});

describe('routeHash', () => {
  it('writes every route back to the address it was read from', () => {
    for (const hash of [
      '#/home',
      '#/progress',
      '#/coach',
      '#/settings',
      '#/settings/units',
      '#/settings/ai-providers/keys',
      '#/onboarding',
    ]) {
      expect(routeHash(parseRoute(hash) as Route)).toBe(hash);
    }
  });
});

describe('trailOf and tabOf', () => {
  it('puts Home under the other tabs and the hub under its pages', () => {
    expect(trailOf(HOME_ROUTE).map(routeHash)).toEqual(['#/home']);
    expect(trailOf({ name: 'coach' }).map(routeHash)).toEqual(['#/home', '#/coach']);
    expect(trailOf({ name: 'settings', page: 'ai', sub: 'keys' }).map(routeHash)).toEqual([
      '#/home',
      '#/settings',
      '#/settings/ai',
      '#/settings/ai/keys',
    ]);
  });

  it('keeps onboarding apart from the tabs', () => {
    expect(trailOf({ name: 'onboarding' }).map(routeHash)).toEqual(['#/onboarding']);
    expect(tabOf({ name: 'onboarding' })).toBeNull();
    expect(tabOf(units)).toBe('settings');
  });
});

describe('router', () => {
  it('replaces an unknown address with #/home without adding a history entry (ACC-A2-2)', () => {
    openPageAt('#/kitchen');
    const length = window.history.length;
    const router = startRouter();
    expect(router.current().route).toEqual(HOME_ROUTE);
    expect(window.location.hash).toBe('#/home');
    expect(window.history.length).toBe(length);
  });

  it('opens on an empty address at Home', () => {
    openPageAt(window.location.pathname);
    const router = startRouter();
    expect(router.current().route).toEqual(HOME_ROUTE);
    expect(window.location.hash).toBe('#/home');
  });

  it('builds the history under a nested address, so Back walks up to the hub and then Home', async () => {
    openPageAt('#/settings/units');
    const router = startRouter();
    expect(router.current().route).toEqual(units);
    expect(window.location.hash).toBe('#/settings/units');
    await back();
    expect(router.current().route).toEqual(hub);
    await back();
    expect(router.current().route).toEqual(HOME_ROUTE);
  });

  it('closes only the top sheet when Back is pressed with two sheets open (ACC-A2-1)', async () => {
    openPageAt('#/home');
    const router = startRouter();
    router.openSheet('add');
    router.openSheet('manual');
    expect(router.current().sheets).toEqual(['add', 'manual']);
    await back();
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: ['add'] });
    expect(window.location.hash).toBe('#/home');
    await back();
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: [] });
  });

  it('takes a sheet closed in code out of the history too', async () => {
    openPageAt('#/home');
    const router = startRouter();
    router.openSheet('add');
    router.openSheet('manual');
    const done = moved();
    router.closeSheet();
    expect(router.current().sheets).toEqual(['add']);
    await done;
    expect(sheetsInHistory()).toBe(1);
    await back();
    expect(router.current().sheets).toEqual([]);
    expect(sheetsInHistory()).toBe(0);
  });

  it('closes the sheets above a sheet that is closed by id', async () => {
    openPageAt('#/home');
    const router = startRouter();
    for (const id of ['a', 'b', 'c']) router.openSheet(id);
    const done = moved();
    router.closeSheet('b');
    expect(router.current().sheets).toEqual(['a']);
    await done;
    expect(sheetsInHistory()).toBe(1);
  });

  it('opens a sheet that is already open only once, and ignores closing one that is not', async () => {
    openPageAt('#/home');
    const router = startRouter();
    router.openSheet('add');
    router.openSheet('add');
    router.closeSheet('manual');
    expect(router.current().sheets).toEqual(['add']);
    expect(sheetsInHistory()).toBe(1);
    await back();
    expect(router.current().sheets).toEqual([]);
    expect(sheetsInHistory()).toBe(0);
  });

  it("restores Home's scroll after Home → Progress → Home", async () => {
    openPageAt('#/home');
    const router = startRouter();
    let top = 420;
    router.setScrollReader(() => top);
    router.showTab('progress');
    expect(router.current().route).toEqual({ name: 'progress' });
    expect(router.scrollOf({ name: 'progress' })).toBe(0);
    top = 80;
    const done = moved();
    router.showTab('home');
    await done;
    expect(router.current().route).toEqual(HOME_ROUTE);
    expect(router.scrollOf(HOME_ROUTE)).toBe(420);
    expect(router.scrollOf({ name: 'progress' })).toBe(80);
  });

  it('starts a page navigated to afresh at the top', async () => {
    openPageAt('#/settings');
    const router = startRouter();
    let top = 0;
    router.setScrollReader(() => top);
    router.navigate(units);
    top = 300;
    const done = moved();
    router.navigate(hub);
    expect(router.scrollOf(units)).toBe(300);
    await done;
    router.navigate(units);
    expect(router.scrollOf(units)).toBe(0);
  });

  it('shows a tab again at the address it last showed', async () => {
    openPageAt('#/home');
    const router = startRouter();
    router.navigate(units);
    const done = moved();
    router.showTab('home');
    await done;
    router.showTab('settings');
    expect(router.current().route).toEqual(units);
    expect(window.location.hash).toBe('#/settings/units');
    await back();
    expect(router.current().route).toEqual(hub);
  });

  it('switches tabs without piling up history: Back from any tab lands on Home', async () => {
    openPageAt('#/home');
    const router = startRouter();
    router.showTab('progress');
    const done = moved();
    router.showTab('coach');
    await done;
    expect(window.location.hash).toBe('#/coach');
    await back();
    expect(router.current().route).toEqual(HOME_ROUTE);
  });

  it('leaves no way back to onboarding once Home is shown', () => {
    openPageAt('#/onboarding');
    const router = startRouter();
    const length = window.history.length;
    router.navigate(HOME_ROUTE);
    expect(router.current().route).toEqual(HOME_ROUTE);
    expect(window.location.hash).toBe('#/home');
    expect(window.history.length).toBe(length);
  });

  it('closes open sheets before moving to another screen', async () => {
    openPageAt('#/home');
    const router = startRouter();
    router.openSheet('add');
    const done = moved();
    router.navigate({ name: 'coach' });
    expect(router.current()).toEqual({ route: { name: 'coach' }, sheets: [] });
    await done;
    expect(window.location.hash).toBe('#/coach');
    expect(sheetsInHistory()).toBe(0);
    await back();
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: [] });
  });

  it('runs a command given during a history move once the move has landed', async () => {
    openPageAt('#/settings/units');
    const router = startRouter();
    const done = moved();
    router.navigate(HOME_ROUTE);
    router.openSheet('add');
    await done;
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: ['add'] });
    expect(window.location.hash).toBe('#/home');
    expect(sheetsInHistory()).toBe(1);
  });

  it('takes over an address typed into the page', async () => {
    openPageAt('#/home');
    const router = startRouter();
    const done = moved();
    window.location.hash = '#/coach';
    await done;
    expect(router.current().route).toEqual({ name: 'coach' });
    await back();
    expect(router.current().route).toEqual(HOME_ROUTE);
  });

  it('sends a typed unknown address to Home', async () => {
    openPageAt('#/coach');
    const router = startRouter();
    const done = moved();
    window.location.hash = '#/nowhere';
    await done;
    expect(router.current().route).toEqual(HOME_ROUTE);
    expect(window.location.hash).toBe('#/home');
  });

  it('steps back over the entry of a sheet that did not survive a reload', async () => {
    openPageAt('#/home', { platewise: { sheets: 0 } });
    window.history.pushState({ platewise: { sheets: 1 } }, '', '#/home');
    const done = moved();
    const router = startRouter();
    expect(router.current()).toEqual({ route: HOME_ROUTE, sheets: [] });
    await done;
    expect(sheetsInHistory()).toBe(0);
  });

  it('reads the scroll position once, when a screen is left', async () => {
    openPageAt('#/home');
    const router = startRouter();
    const read = vi.fn(() => 640);
    router.setScrollReader(read);
    router.openSheet('add');
    expect(read).not.toHaveBeenCalled();
    const done = moved();
    router.showTab('coach');
    expect(read).toHaveBeenCalledTimes(1);
    await done;
    expect(router.scrollOf(HOME_ROUTE)).toBe(640);
    router.setScrollReader(null);
    router.showTab('progress');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('tells its listeners about every change and stops when asked', () => {
    openPageAt('#/home');
    const router = startRouter();
    let calls = 0;
    const unsubscribe = router.subscribe(() => {
      calls += 1;
    });
    router.openSheet('add');
    unsubscribe();
    router.openSheet('more');
    expect(calls).toBe(1);
  });
});
