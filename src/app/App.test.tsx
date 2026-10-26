import { act, render, screen } from '@testing-library/react';
import { Dexie } from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../data/bus';
import { DataProvider, type DataSources } from '../data/DataProvider';
import { common } from '../i18n/en/common';
import { goals } from '../i18n/en/goals';
import { onboarding } from '../i18n/en/onboarding';
import { shell } from '../i18n/en/shell';
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
  onboarding: { complete: vi.fn() },
  aiSetup: {
    saveChoice: vi.fn(),
    savedKeyMask: vi.fn(),
    setTermsAccepted: vi.fn(),
    setUpLater: vi.fn(),
  },
  planBuilder: { build: vi.fn() },
  clock: fixedClock(Date.parse('2026-10-26T12:30:00-04:00'), 'America/New_York'),
};

/** Reads that never finish: the tab screens stay on their loading state. */
const pending = () => new Dexie.Promise<never>(() => {});
const bus = createBus({ channel: null });
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
  bus,
};

function renderApp(ports: ShellPorts, initialHash = '', withServices: Services = services) {
  const host = memoryHost(initialHash);
  const router = createRouter(host);
  const reload = vi.fn();
  const view = render(
    <ServicesProvider services={withServices}>
      <DataProvider sources={data}>
        <App ports={ports} router={router} appState={createAppState()} onReload={reload} />
      </DataProvider>
    </ServicesProvider>,
  );
  return { host, router, reload, ...view };
}

describe('App', () => {
  it("boots to onboarding with the temporary source and opens the wizard's Welcome", () => {
    const { host } = renderApp(temporaryPorts());
    const { headlineTop, headlineBottom, start } = onboarding.onboarding.welcome;
    expect(
      screen.getByRole('heading', { level: 1, name: `${headlineTop} ${headlineBottom}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: start })).toHaveAttribute('data-ui', 'wizard.start');
    expect(document.querySelector('[data-ui="screen.onboarding"]')).toHaveAttribute(
      'data-step',
      'welcome',
    );
    expect(host.hash()).toBe('#/onboarding');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows only text from the catalogue', () => {
    const { container } = renderApp(temporaryPorts());
    const welcome = onboarding.onboarding.welcome;
    const tour = Object.values(welcome.tour).join('');
    expect(container.textContent).toBe(
      `${welcome.headlineTop} ${welcome.headlineBottom}${welcome.lead}${tour}` +
        `${welcome.start}${welcome.restore}`,
    );
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

  it('shows the goal-reached dialog over a tab screen when a weigh-in reaches the goal', () => {
    const boot = controlledStore<BootState>({ status: 'ready' });
    const settings = controlledStore<ShellSettings>(DEFAULT_SHELL_SETTINGS);
    renderApp({ boot, settings }, '#/progress');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => {
      bus.post({ type: 'goal-reached', kg: 79.4 });
      bus.post({ type: 'goal-reached', kg: 79.4 });
    });
    const dialog = screen.getByRole('alertdialog', { name: goals.goals.reached.title });
    expect(dialog).toBeVisible();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    // The tab screen stays underneath.
    expect(
      screen.getByRole('heading', { level: 1, name: common.common.tabs.progress }),
    ).toBeInTheDocument();
  });

  it('starts the weekly tune-up once the tab frame shows, and never on onboarding (P05-09)', () => {
    const check = vi.fn().mockResolvedValue({ kind: 'unchanged', why: 'notDue' });
    const tuneUp = { check, turnOn: vi.fn(), turnOff: vi.fn() };
    const onboardingBoot = controlledStore<BootState>({ status: 'needsOnboarding' });
    const settings = controlledStore<ShellSettings>(DEFAULT_SHELL_SETTINGS);
    const first = renderApp({ boot: onboardingBoot, settings }, '', { ...services, tuneUp });
    expect(check).not.toHaveBeenCalled();
    first.unmount();

    const readyBoot = controlledStore<BootState>({ status: 'ready' });
    renderApp({ boot: readyBoot, settings }, '#/home', { ...services, tuneUp });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('open');
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
