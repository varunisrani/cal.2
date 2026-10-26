import { act, cleanup, render, screen, within } from '@testing-library/react';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it, onTestFinished } from 'vitest';
import { createBus } from '../data/bus';
import { connectAppData, type AppData, type AppOpening } from '../services/appData';
import { freshDbOptions, openTestDb, type TestDbOptions } from '../test/db';
import { factories } from '../test/factories';
import { App } from './App';
import { routerAt } from './testing/shellHarness';

afterEach(cleanup);

let buses = 0;

/** Opens the app's data on a database of the test's own (fake IndexedDB, real timers). */
async function openData(options: TestDbOptions = freshDbOptions()): Promise<AppOpening> {
  buses += 1;
  const bus = createBus(`app-test-${buses}`);
  const opening = await connectAppData({ ...options, bus });
  onTestFinished(() => {
    if (opening.kind === 'open') opening.close();
    bus.close();
  });
  return opening;
}

/** A database where setup was finished: a profile and `onboarding.done`. */
async function finishedSetup(): Promise<TestDbOptions> {
  const options = freshDbOptions();
  const db = await openTestDb(options);
  await db.profile.put({ ...factories().profile(), id: 'me' });
  await db.settings.put({ key: 'onboarding.done', value: true });
  return options;
}

function dataOf(opening: AppOpening): AppData {
  if (opening.kind !== 'open') throw new Error(`expected an open database: ${opening.problem}`);
  return opening.data;
}

describe('App', () => {
  it('opens a fresh install on the onboarding screen headed Platewise, with no tab bar', async () => {
    const opening = await openData();
    const router = routerAt('#/');
    render(<App open={() => Promise.resolve(opening)} router={router} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Platewise' })).toBeVisible();
    expect(router.current().route).toEqual({ name: 'onboarding' });
    expect(screen.queryByRole('navigation', { name: 'Tabs' })).toBeNull();
  });

  it('opens a finished setup on Home with the tab bar', async () => {
    const opening = await openData(await finishedSetup());
    render(<App open={() => Promise.resolve(opening)} router={routerAt('#/')} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    const bar = screen.getByRole('navigation', { name: 'Tabs' });
    expect(within(bar).getByRole('button', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('leaves Coach for Home when Coach is hidden from Settings while on screen (ACC-A3-1)', async () => {
    const opening = await openData(await finishedSetup());
    const router = routerAt('#/coach');
    render(<App open={() => Promise.resolve(opening)} router={router} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Coach' })).toBeVisible();

    await act(() => dataOf(opening).settings.toggleHiddenTab('coach', true));
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    expect(router.current().route).toEqual({ name: 'home' });
    expect(screen.queryByRole('button', { name: 'Coach' })).toBeNull();
  });

  it('shows a recovery card when a newer version wrote the database', async () => {
    const options = freshDbOptions();
    const newer = new Dexie(options.name, {
      indexedDB: options.indexedDB,
      IDBKeyRange: options.IDBKeyRange,
    });
    newer.version(9).stores({ settings: 'key' });
    await newer.open();
    newer.close();
    const opening = await openData(options);
    render(<App open={() => Promise.resolve(opening)} router={routerAt('#/home')} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Update needed' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  });
});
