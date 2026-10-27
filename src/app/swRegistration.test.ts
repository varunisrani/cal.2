import { describe, expect, it, vi } from 'vitest';
import { advance, useFakeTime } from '../test/time';
import {
  createAppUpdates,
  registerServiceWorker,
  SKIP_WAITING_MESSAGE,
  type RegisterOptions,
} from './swRegistration';
import {
  activateWaiting,
  fakeContainer,
  fakePage,
  fakeRegistration,
  fakeWorker,
  type FakeContainer,
  type FakeRegistration,
} from './testing/fakeServiceWorker';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Registers against fakes; `controlled` says whether a worker already controls the page. */
async function start(
  registration: FakeRegistration,
  { controlled = true, ...options }: { controlled?: boolean } & RegisterOptions = {},
) {
  const container = fakeContainer(registration, controlled ? fakeWorker('activated') : null);
  const page = fakePage();
  const reload = vi.fn();
  const updates = createAppUpdates();
  const result = await registerServiceWorker(updates, {
    production: true,
    container,
    page,
    reload,
    ...options,
  });
  return { container, page, reload, updates, result };
}

describe('registerServiceWorker', () => {
  it('registers nothing outside a production build', async () => {
    const container = fakeContainer(fakeRegistration());
    const updates = createAppUpdates();

    expect(await registerServiceWorker(updates, { production: false, container })).toBeNull();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('registers nothing where the browser has no service workers', async () => {
    expect(
      await registerServiceWorker(createAppUpdates(), { production: true, container: null }),
    ).toBeNull();
  });

  it('registers sw.js under the base address, always checking the server for it', async () => {
    const registration = fakeRegistration();
    const { container, result } = await start(registration);

    expect(result).toBe(registration);
    expect(container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
  });

  it('raises the flag for a version already waiting at launch, and reloads nothing', async () => {
    const { updates, reload } = await start(fakeRegistration({ waiting: fakeWorker('installed') }));

    expect(updates.getSnapshot()).toBe('ready');
    expect(reload).not.toHaveBeenCalled();
  });

  it('sets the flag when a waiting worker appears, and reloads only after Reload (ACC-L3-1)', async () => {
    useFakeTime('2026-10-27T09:00:00-04:00');
    const registration = fakeRegistration();
    const { container, updates, reload } = await start(registration);
    const onChange = vi.fn();
    updates.subscribe(onChange);

    const next = fakeWorker('installing');
    registration.findUpdate(next);
    expect(updates.getSnapshot()).toBe('current');
    registration.finishInstall();
    expect(updates.getSnapshot()).toBe('ready');
    expect(onChange).toHaveBeenCalledTimes(1);

    // Waiting a long time changes nothing: the page never reloads by itself.
    advance(3 * DAY_MS);
    expect(next.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    updates.apply();
    expect(next.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    expect(reload).not.toHaveBeenCalled();
    activateWaiting(registration, container);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('notices a worker that was already installing at launch', async () => {
    const registration = fakeRegistration({ installing: fakeWorker('installing') });
    const { updates } = await start(registration);

    registration.finishInstall();
    expect(updates.getSnapshot()).toBe('ready');
  });

  it('raises no flag and reloads nothing on a first install', async () => {
    const registration = fakeRegistration({ installing: fakeWorker('installing') });
    const { container, updates, reload } = await start(registration, { controlled: false });

    registration.finishInstall();
    expect(updates.getSnapshot()).toBe('current');
    // The new worker claims the page: its first controller, not an update.
    activateWaiting(registration, container);
    expect(updates.getSnapshot()).toBe('current');
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps a reload on offer, without reloading, when another tab lets the update in', async () => {
    const registration = fakeRegistration({ waiting: fakeWorker('installed') });
    const { container, updates, reload } = await start(registration);

    activateWaiting(registration, container);
    expect(reload).not.toHaveBeenCalled();
    expect(updates.getSnapshot()).toBe('ready');

    updates.apply();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('looks for a new version at launch and whenever the app comes back into view', async () => {
    const registration = fakeRegistration();
    registration.update.mockRejectedValue(new TypeError('Failed to fetch'));
    const { page } = await start(registration);
    expect(registration.update).toHaveBeenCalledTimes(1);

    page.show('hidden');
    expect(registration.update).toHaveBeenCalledTimes(1);
    page.show('visible');
    expect(registration.update).toHaveBeenCalledTimes(2);
  });

  it('runs on without a flag when registering fails or the browser blocks workers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = fakeContainer(null);
    failing.register.mockRejectedValue(new DOMException('no', 'SecurityError'));
    const updates = createAppUpdates();

    expect(
      await registerServiceWorker(updates, { production: true, container: failing }),
    ).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);

    const blocked: FakeContainer = fakeContainer(null);
    blocked.register.mockResolvedValue(undefined);
    expect(
      await registerServiceWorker(updates, { production: true, container: blocked }),
    ).toBeNull();
    expect(updates.getSnapshot()).toBe('current');
  });
});

describe('createAppUpdates', () => {
  it('does nothing on apply before an update is offered, and tells listeners once', () => {
    const updates = createAppUpdates();
    const onChange = vi.fn();
    const stop = updates.subscribe(onChange);
    updates.apply();

    const takeOver = vi.fn();
    updates.offer(takeOver);
    updates.offer(takeOver);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    updates.apply();
    expect(takeOver).toHaveBeenCalledTimes(1);
  });
});
