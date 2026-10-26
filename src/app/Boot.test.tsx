import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppOpening, OpenProblem } from '../services/appData';
import { Boot, startVerdict } from './Boot';
import { fakeAppData, settingsWith, someProfile, type FakeAppData } from './testing/fakeAppData';
import { routerAt, shellWrapper } from './testing/shellHarness';
import type { Router } from './router';
import { useRoute } from './useRoute';

afterEach(cleanup);

/** Stands in for Home: it would show goal numbers the moment it is drawn. */
function AppScreen() {
  const { route } = useRoute();
  return <p data-testid="screen">{`${route.name}: 2 000 kcal goal`}</p>;
}

function opened(fake: FakeAppData): () => Promise<AppOpening> {
  const opening: AppOpening = { kind: 'open', data: fake.data, close: () => {} };
  return () => Promise.resolve(opening);
}

async function boot(open: () => Promise<AppOpening>, router: Router, reload = vi.fn()) {
  render(
    <Boot open={open} reload={reload}>
      <AppScreen />
    </Boot>,
    { wrapper: shellWrapper({ router }) },
  );
  // Let the opening promise settle.
  await act(async () => {});
  return reload;
}

function skeletonShown(): boolean {
  return screen.queryByRole('status', { name: 'Loading' }) !== null;
}

function appShown(): string | null {
  return screen.queryByTestId('screen')?.textContent ?? null;
}

describe('startVerdict', () => {
  const ok = { status: 'ready', value: { kind: 'ok', value: someProfile() } } as const;
  const done = { status: 'ready', value: settingsWith({ 'onboarding.done': true }) } as const;

  it('waits for both reads, and onboards without a finished setup', () => {
    expect(startVerdict({ status: 'loading' }, ok, false)).toEqual({ kind: 'wait' });
    expect(startVerdict(done, { status: 'loading' }, false)).toEqual({ kind: 'wait' });
    expect(startVerdict(done, ok, false)).toEqual({ kind: 'app' });
    const notDone = { status: 'ready', value: settingsWith() } as const;
    expect(startVerdict(notDone, ok, false)).toEqual({ kind: 'onboarding' });
    const missing = { status: 'ready', value: { kind: 'missing' } } as const;
    expect(startVerdict(done, missing, false)).toEqual({ kind: 'onboarding' });
  });

  it('never takes an unreadable profile for a missing one (R01.17)', () => {
    const corrupt = { status: 'ready', value: { kind: 'corrupt', raw: 7 } } as const;
    expect(startVerdict(done, corrupt, false)).toEqual({
      kind: 'problem',
      problem: 'profile-unreadable',
    });
    expect(startVerdict(done, corrupt, true)).toEqual({ kind: 'onboarding' });
  });
});

describe('Boot', () => {
  it('shows a neutral skeleton, with no numbers, while the database opens', async () => {
    const router = routerAt('#/home');
    await boot(() => new Promise<AppOpening>(() => {}), router);
    expect(skeletonShown()).toBe(true);
    expect(appShown()).toBeNull();
    expect(screen.queryByText(/\d/)).toBeNull();
  });

  it('draws no Home numbers before the profile read resolves (R05.12, ACC-A10-1)', async () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith({ 'onboarding.done': true }));
    await boot(opened(fake), routerAt('#/home'));
    expect(skeletonShown()).toBe(true);
    expect(appShown()).toBeNull();
    expect(screen.queryByText(/\d/)).toBeNull();

    act(() => fake.profile.ready({ kind: 'ok', value: someProfile() }));
    expect(appShown()).toBe('home: 2 000 kcal goal');
    expect(skeletonShown()).toBe(false);
  });

  it('waits for the settings snapshot as well (R06.22)', async () => {
    const fake = fakeAppData();
    fake.profile.ready({ kind: 'ok', value: someProfile() });
    await boot(opened(fake), routerAt('#/home'));
    expect(skeletonShown()).toBe(true);
    act(() => fake.settings.ready(settingsWith({ 'onboarding.done': true })));
    expect(appShown()).toBe('home: 2 000 kcal goal');
  });

  it('goes to onboarding when there is no profile', async () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith());
    fake.profile.ready({ kind: 'missing' });
    const router = routerAt('#/home');
    await boot(opened(fake), router);
    expect(router.current().route).toEqual({ name: 'onboarding' });
    expect(window.location.hash).toBe('#/onboarding');
    expect(appShown()).toBe('onboarding: 2 000 kcal goal');
  });

  it('goes to onboarding when a profile exists but setup was never marked done', async () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith({ 'onboarding.done': false }));
    fake.profile.ready({ kind: 'ok', value: someProfile() });
    const router = routerAt('#/coach');
    await boot(opened(fake), router);
    expect(router.current().route).toEqual({ name: 'onboarding' });
  });

  it('stays on the tab in the address for a finished setup', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const router = routerAt('#/progress');
    await boot(opened(fake), router);
    expect(router.current().route).toEqual({ name: 'progress' });
    expect(appShown()).toBe('progress: 2 000 kcal goal');
  });

  it('opens Home when a finished setup starts on the onboarding address', async () => {
    const fake = fakeAppData();
    fake.finishedSetup();
    const router = routerAt('#/onboarding');
    await boot(opened(fake), router);
    expect(router.current().route).toEqual({ name: 'home' });
    expect(appShown()).toBe('home: 2 000 kcal goal');
  });

  it('moves from onboarding to Home once setup is finished', async () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith());
    fake.profile.ready({ kind: 'missing' });
    const router = routerAt('#/home');
    await boot(opened(fake), router);
    expect(router.current().route).toEqual({ name: 'onboarding' });
    act(() => fake.finishedSetup());
    expect(router.current().route).toEqual({ name: 'home' });
    expect(appShown()).toBe('home: 2 000 kcal goal');
  });

  it('shows a card for an unreadable profile instead of onboarding, and can set up again (R01.17)', async () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith({ 'onboarding.done': true }));
    fake.profile.ready({ kind: 'corrupt', raw: { sex: 42 } });
    const router = routerAt('#/home');
    await boot(opened(fake), router);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your profile could not be read' }),
    ).toBeVisible();
    expect(router.current().route).toEqual({ name: 'home' });
    expect(appShown()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Set up again' }));
    expect(router.current().route).toEqual({ name: 'onboarding' });
    expect(appShown()).toBe('onboarding: 2 000 kcal goal');
  });

  it.each<[OpenProblem, string]>([
    ['newer-schema', 'Update needed'],
    ['upgrade-failed', 'Your data could not be updated'],
    ['unavailable', 'Storage is turned off'],
    ['failed', 'Your data could not be opened'],
  ])(
    'shows a recovery card instead of the app when opening fails with %s',
    async (problem, title) => {
      const reload = await boot(
        () => Promise.resolve({ kind: 'failed', problem }),
        routerAt('#/home'),
      );
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeVisible();
      expect(document.querySelector(`[data-ui="shell.problem.${problem}"]`)).not.toBeNull();
      expect(appShown()).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(reload).toHaveBeenCalledTimes(1);
    },
  );

  it('treats an opening that rejects as a database that could not be opened', async () => {
    await boot(() => Promise.reject(new Error('odd')), routerAt('#/home'));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your data could not be opened' }),
    ).toBeVisible();
  });

  it('shows a card when a first read fails, never onboarding', async () => {
    const fake = fakeAppData();
    fake.settings.ready(settingsWith());
    fake.profile.set({ status: 'error', error: new Error('read failed') });
    const router = routerAt('#/home');
    await boot(opened(fake), router);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your data could not be read' }),
    ).toBeVisible();
    expect(router.current().route).toEqual({ name: 'home' });
  });
});
