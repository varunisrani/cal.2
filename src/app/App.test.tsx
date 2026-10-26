import { act, render, screen } from '@testing-library/react';
import { Dexie } from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { DataProvider, type DataSources } from '../data/DataProvider';
import { common } from '../i18n/en/common';
import { onboarding } from '../i18n/en/onboarding';
import { shell } from '../i18n/en/shell';
import { t } from '../i18n/t';
import { fixedClock } from '../lib/clock';
import { ServicesProvider, type Services } from '../services/context';
import { App } from './App';
import { createAppState } from './appState';
import {
  DEFAULT_SHELL_SETTINGS,
  temporaryPorts,
  type BootState,
  type ReadStore,
  type ShellPorts,
  type ShellSettings,
} from './ports';
import { createRouter } from './router';
import { controlledStore } from './testing/controlledStore';
import { memoryHost } from './testing/memoryHost';

const services: Services = {
  diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
  onboarding: { startWithDefaults: vi.fn() },
  clock: fixedClock(Date.parse('2026-10-26T12:30:00-04:00'), 'America/New_York'),
};

/** Reads that never finish: the tab screens stay on their loading state. */
const pending = () => new Dexie.Promise<never>(() => {});
const data: DataSources = {
  profileRepo: { get: pending },
  settingsRepo: { snapshot: pending, loaded: pending() },
  diaryRepo: { byDay: pending, between: pending },
  waterRepo: { byDay: pending },
  fastRepo: { between: pending, active: pending },
  weightRepo: { between: pending },
  bodyFatRepo: { between: pending },
  savedMealsRepo: { list: pending },
  coachRepo: { list: pending },
  unreadableFlag: pending,
  clock: services.clock,
};

function renderApp(ports: ShellPorts, initialHash = '') {
  const host = memoryHost(initialHash);
  const router = createRouter(host);
  const reload = vi.fn();
  const view = render(
    <ServicesProvider services={services}>
      <DataProvider sources={data}>
        <App ports={ports} router={router} appState={createAppState()} onReload={reload} />
      </DataProvider>
    </ServicesProvider>,
  );
  return { host, router, reload, ...view };
}

describe('App', () => {
  it('boots to onboarding with the temporary source and shows the quick start', () => {
    const { host } = renderApp(temporaryPorts());
    expect(screen.getByRole('heading', { level: 1, name: 'Platewise' })).toBeInTheDocument();
    const { start } = onboarding.onboarding.quickStart;
    expect(screen.getByRole('button', { name: start })).toBeInTheDocument();
    expect(host.hash()).toBe('#/onboarding');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows only text from the catalogue', () => {
    const { container } = renderApp(temporaryPorts());
    const { lead, start } = onboarding.onboarding.quickStart;
    expect(container.textContent).toBe(`${t('common.appName')}${lead}${start}`);
  });

  it('shows the skeleton, then Home and the tab bar once the profile and settings are read', () => {
    const boot = controlledStore<BootState>();
    const settings = controlledStore<ShellSettings>();
    renderApp({ boot, settings }, '#/home');
    expect(screen.getByRole('status', { name: shell.shell.loading })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();

    act(() => {
      settings.set({ ...DEFAULT_SHELL_SETTINGS, accent: 'ember' });
      boot.set({ status: 'ready' });
    });
    expect(screen.getByRole('heading', { level: 1, name: common.common.tabs.home })).toBeVisible();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(document.documentElement.dataset.accent).toBe('ember');
  });

  it('puts every screen inside the toast provider', () => {
    renderApp(temporaryPorts());
    expect(document.querySelector('[data-ui="toast.region"]')).not.toBeNull();
  });

  it('shows the crash card with Reload when drawing the app fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: ReadStore<BootState> = {
      getSnapshot: () => {
        throw new Error('store broke');
      },
      subscribe: () => () => {},
    };
    renderApp({ ...temporaryPorts(), boot: failing });
    expect(screen.getByRole('alert', { name: shell.shell.crash.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: shell.shell.crash.reload })).toBeInTheDocument();
  });
});
