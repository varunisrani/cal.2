import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHealthRepo } from '../../../data/repos/healthRepo';
import { dayKeyOf } from '../../../domain/dates/dayKey';
import { health as healthCatalogue } from '../../../i18n/en/health';
import { formatDay, formatTime } from '../../../i18n/format';
import { ServicesProvider } from '../../../services/context';
import { createHealthService, type HealthService } from '../../../services/health/service';
import type { WalkService } from '../../../services/walks/service';
import {
  fakeHealthPlugin,
  type FakeHealthPlugin,
} from '../../../services/health/testing/fakeHealthPlugin';
import { FACTORY_NOW } from '../../../test/factories';
import { closeHarnesses, openHarness } from '../../../test/screenHarness';
import { HealthPage } from './HealthPage';

afterEach(closeHarnesses);

const words = healthCatalogue.health;

interface PageSetup {
  readonly plugin?: FakeHealthPlugin;
  readonly connected?: boolean;
  /** No health service at all, as on the web. */
  readonly withoutService?: boolean;
  /** The app records walks (P15). */
  readonly walks?: boolean;
}

async function openPage({
  plugin = fakeHealthPlugin(),
  connected = false,
  withoutService = false,
  walks = false,
}: PageSetup = {}) {
  const h = await openHarness({ hash: '#/settings/health-connect' });
  await h.repos.settingsRepo.set('health.connected', connected);
  const service: HealthService = createHealthService({
    plugin,
    healthRepo: createHealthRepo(h.db),
    settingsRepo: h.repos.settingsRepo,
    diaryRepo: h.repos.diaryRepo,
    weightRepo: h.repos.weightRepo,
    clock: h.clock,
    visibility: { isVisible: () => true, subscribe: () => () => undefined },
    watch: () => () => undefined,
  });
  const base = withoutService ? h.services : { ...h.services, health: service };
  const services = walks ? { ...base, walks: {} as WalkService } : base;
  h.mount(
    <ServicesProvider services={services}>
      <HealthPage />
    </ServicesProvider>,
  );
  return { h, plugin, service };
}

// The page sets its own state after the service answers (a refusal note, a toast, a switch done
// saving), which React draws outside any act scope: wait with `waitFor`, which runs outside act.
const until = (check: () => boolean) =>
  waitFor(
    () => {
      if (!check()) throw new Error('not yet');
    },
    // Generous for a loaded machine; a passing check ends the wait at once.
    { timeout: 3_000 },
  );
const untilShown = (selector: string) => until(() => document.querySelector(selector) !== null);
const statusText = () => document.querySelector('[data-ui="health.status.text"]')?.textContent;
const untilStatus = (text: string) => until(() => statusText() === text);
const button = (name: string) => screen.getByRole('button', { name });
const toggle = (name: string) => screen.getByRole('switch', { name });
const stateOf = (hook: string) => document.querySelector(`[data-ui="${hook}"]`)?.textContent;

describe('HealthPage (P11-04)', () => {
  it.each([
    ['notInstalled', words.status.notInstalled],
    ['updateRequired', words.status.updateRequired],
    ['notSupported', words.status.notSupported],
  ] as const)(
    'says when Health Connect is %s, with nothing to connect',
    async (availability, text) => {
      await openPage({ plugin: fakeHealthPlugin({ availability }) });
      await untilStatus(text);
      expect(screen.queryByRole('button', { name: words.status.connect })).toBeNull();
      expect(screen.queryByRole('button', { name: words.status.open })).toBeNull();
    },
  );

  it('connects on Connect, then shows what is allowed, the switches and the last sync (ACC-M11-1)', async () => {
    const { h, plugin, service } = await openPage({
      plugin: fakeHealthPlugin({ granted: { read: [], write: [] } }),
    });
    await untilStatus(words.status.notConnected);

    fireEvent.click(button(words.status.connect));
    await untilStatus(words.status.connected);
    await act(() => service.idle());
    await untilShown('[data-ui="health.lastSync"]');

    expect(await h.repos.settingsRepo.get('health.connected')).toBe(true);
    expect(plugin.callsOf('readDailyTotals')).toHaveLength(1);
    expect(stateOf('health.read.steps')).toBe(words.data.allowed);
    expect(stateOf('health.write.nutrition')).toBe(words.data.notAllowed);
    expect(toggle(words.options.count)).toHaveAttribute('aria-checked', 'true');
    expect(toggle(words.options.importWeights)).toHaveAttribute('aria-checked', 'true');
    expect(toggle(words.options.writeBack)).toHaveAttribute('aria-checked', 'false');
    await until(
      () =>
        stateOf('health.lastSync') ===
        `Last synced ${formatDay(dayKeyOf(FACTORY_NOW), 'short')}, ${formatTime(FACTORY_NOW)}`,
    );
    expect(button(words.status.disconnect)).toBeVisible();
  });

  it('says no access was given when Connect allows nothing, and stays not connected', async () => {
    const { h } = await openPage({
      plugin: fakeHealthPlugin({ granted: { read: [], write: [] }, grantOnRequest: false }),
    });
    await untilStatus(words.status.notConnected);
    fireEvent.click(button(words.status.connect));
    await untilShown('[data-ui="health.status.refused"]');
    expect(stateOf('health.status.refused')).toBe(words.status.refused);
    expect(await h.repos.settingsRepo.get('health.connected')).toBe(false);
    expect(document.querySelector('[data-ui="health.options"]')).toBeNull();
  });

  it('shows access removed in Health Connect with Grant access, and reads again once it is back', async () => {
    const { plugin } = await openPage({
      connected: true,
      plugin: fakeHealthPlugin({ granted: { read: [], write: [] } }),
    });
    await untilStatus(words.status.revoked);
    expect(stateOf('health.read.steps')).toBe(words.data.notAllowed);
    expect(button(words.sync.now)).toBeDisabled();

    fireEvent.click(button(words.status.grant));
    await untilStatus(words.status.connected);
    await until(() => stateOf('health.read.steps') === words.data.allowed);
    await until(() => plugin.callsOf('readDailyTotals').length === 1);
  });

  it('marks each kind that is not allowed', async () => {
    await openPage({
      connected: true,
      plugin: fakeHealthPlugin({ granted: { read: ['steps', 'weight'], write: ['weight'] } }),
    });
    await until(() => stateOf('health.read.steps') === words.data.allowed);
    expect(stateOf('health.read.activeCalories')).toBe(words.data.notAllowed);
    expect(stateOf('health.read.exercise')).toBe(words.data.notAllowed);
    expect(stateOf('health.read.weight')).toBe(words.data.allowed);
    expect(stateOf('health.write.weight')).toBe(words.data.allowed);
    expect(stateOf('health.write.nutrition')).toBe(words.data.notAllowed);
    const data = within(screen.getByRole('region', { name: words.data.heading }));
    expect(data.getByText(words.data.read.activeCalories)).toBeVisible();
  });

  it('stores the counting and import switches', async () => {
    const { h } = await openPage({ connected: true });
    await untilShown('[data-ui="health.countActive"]');

    fireEvent.click(toggle(words.options.count));
    await until(() => toggle(words.options.count).getAttribute('aria-checked') === 'false');
    expect(await h.repos.settingsRepo.get('health.countActiveCalories')).toBe(false);

    fireEvent.click(toggle(words.options.importWeights));
    await until(() => toggle(words.options.importWeights).getAttribute('aria-checked') === 'false');
    expect(await h.repos.settingsRepo.get('health.importWeights')).toBe(false);
  });

  it('asks for write access when write-back is turned on, and says when it is refused', async () => {
    const { h, plugin } = await openPage({
      connected: true,
      plugin: fakeHealthPlugin({ granted: { read: ['steps'], write: [] }, grantOnRequest: false }),
    });
    await untilShown('[data-ui="health.writeBack"]');
    fireEvent.click(toggle(words.options.writeBack));
    await until(() => screen.queryByText(words.options.writeRefused) !== null);
    expect(plugin.callsOf('requestPermissions')).toEqual([
      { read: [], write: ['nutrition', 'weight', 'walk'] },
    ]);
    expect(toggle(words.options.writeBack)).toHaveAttribute('aria-checked', 'false');
    expect(await h.repos.settingsRepo.get('health.writeBack')).toBe(false);

    plugin.set({ grantOnRequest: true });
    fireEvent.click(toggle(words.options.writeBack));
    await until(() => toggle(words.options.writeBack).getAttribute('aria-checked') === 'true');
    expect(await h.repos.settingsRepo.get('health.writeBack')).toBe(true);
  });

  it('opens Health Connect', async () => {
    const { plugin } = await openPage({ connected: true });
    await untilShown('[data-ui="health.open"]');
    fireEvent.click(button(words.status.open));
    await until(() => plugin.callsOf('openHealthConnectSettings').length === 1);
  });

  it("syncs on Sync now, and says when the last sync didn't finish", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { plugin } = await openPage({ connected: true });
    await untilStatus(words.status.connected);
    expect(stateOf('health.lastSync')).toBe(words.sync.never);

    plugin.failNext('readDailyTotals', 'rateLimited');
    fireEvent.click(button(words.sync.now));
    await untilShown('[data-ui="health.sync.failed"]');
    expect(stateOf('health.sync.failed')).toBe(words.sync.failed);

    // The button stays busy until the first press's sync has settled and React has drawn that,
    // which can come after the note; a press on a busy button is ignored.
    await until(() => !button(words.sync.now).hasAttribute('aria-busy'));
    fireEvent.click(button(words.sync.now));
    await until(() => document.querySelector('[data-ui="health.sync.failed"]') === null);
    expect(stateOf('health.lastSync')).not.toBe(words.sync.never);
  });

  it('stops reading after Disconnect, and offers Connect again', async () => {
    const { h } = await openPage({ connected: true });
    await untilStatus(words.status.connected);
    fireEvent.click(button(words.status.disconnect));
    await untilStatus(words.status.notConnected);
    expect(await h.repos.settingsRepo.get('health.connected')).toBe(false);
    expect(button(words.status.connect)).toBeVisible();
    expect(document.querySelector('[data-ui="health.options"]')).toBeNull();
  });

  it('says Health Connect is not supported without a health service', async () => {
    await openPage({ withoutService: true });
    await untilShown('[data-ui="health.unavailable"]');
    expect(stateOf('health.unavailable')).toBe(words.status.notSupported);
  });
});

describe('HealthPage: walks (P15-03)', () => {
  it('offers Count active calories for the recorded walks before Health Connect is connected', async () => {
    const { h } = await openPage({ walks: true });
    await untilStatus(words.status.notConnected);
    await untilShown('[data-ui="health.countActive"]');
    expect(screen.getByText(words.options.countWalksHint)).toBeVisible();
    expect(screen.queryByRole('switch', { name: words.options.importWeights })).toBeNull();
    expect(screen.queryByRole('switch', { name: words.options.writeBack })).toBeNull();
    fireEvent.click(toggle(words.options.count));
    await until(() => toggle(words.options.count).getAttribute('aria-checked') === 'false');
    expect(await h.repos.settingsRepo.get('health.countActiveCalories')).toBe(false);
  });

  it('keeps the options away before connecting where nothing records walks', async () => {
    await openPage();
    await untilStatus(words.status.notConnected);
    expect(document.querySelector('[data-ui="health.options"]')).toBeNull();
  });
});
