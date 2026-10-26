import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createAppState } from '../../app/appState';
import type { ReadStore, ShellPorts } from '../../app/ports';
import { createRouter } from '../../app/router';
import { memoryHost } from '../../app/testing/memoryHost';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createPhotoRepo } from '../../data/repos/photoRepo';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import { profileDefaults } from '../../domain/profile/profile';
import { mergePartitions } from '../../i18n/catalogue';
import { enPartitions } from '../../i18n/en';
import { common } from '../../i18n/en/common';
import { onboarding } from '../../i18n/en/onboarding';
import { lintCatalogue } from '../../i18n/lint';
import { fixedClock } from '../../lib/clock';
import { ServicesProvider, type Services } from '../../services/context';
import { createDiaryService } from '../../services/diary';
import { createOnboardingService } from '../../services/onboarding';
import { createShellPorts } from '../../services/shell';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW } from '../../test/factories';
import { ToastProvider } from '../../ui/Toast';
import { QuickStart } from './QuickStart';

const words = onboarding.onboarding.quickStart;
const clock = fixedClock(FACTORY_NOW, 'America/New_York');

function fakeServices(startWithDefaults: Services['onboarding']['startWithDefaults']): Services {
  return {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { startWithDefaults: vi.fn(startWithDefaults) },
    clock,
  };
}

function renderQuickStart(services: Services) {
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <QuickStart />
      </ToastProvider>
    </ServicesProvider>,
  );
}

/** Resolves once the store holds a value that passes `matches` (now or after a change). */
function until<T>(store: ReadStore<T>, matches: (value: T | undefined) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const check = (): boolean => {
      if (!matches(store.getSnapshot())) return false;
      stop();
      resolve();
      return true;
    };
    const stop = store.subscribe(() => void check());
    check();
  });
}

/** Waits, inside act, until both shell stores are read and start-up says `status`. */
async function bootReaches(ports: ShellPorts, status: string): Promise<void> {
  await act(async () => {
    await until(ports.settings, (value) => value !== undefined);
    await until(ports.boot, (value) => value?.status === status);
  });
}

describe('QuickStart', () => {
  it('shows the app name as its heading, one line and the start button, all catalogue text', () => {
    const { container } = renderQuickStart(fakeServices(async () => {}));
    expect(screen.getByRole('heading', { level: 1, name: common.common.appName })).toBeVisible();
    expect(screen.getByText(words.lead)).toBeVisible();
    const button = screen.getByRole('button', { name: words.start });
    expect(button).toHaveAttribute('data-ui', 'onboarding.start');
    expect(container.textContent).toBe(`${common.common.appName}${words.lead}${words.start}`);
  });

  it("starts with the defaults at the clock's now and the browser's locale", async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    const services = fakeServices(async () => {});
    renderQuickStart(services);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: words.start }));
    });

    expect(services.onboarding.startWithDefaults).toHaveBeenCalledExactlyOnceWith(
      FACTORY_NOW,
      'en-GB',
    );
  });

  it('ignores a second press while the first run is still saving', async () => {
    let finish = (): void => undefined;
    const services = fakeServices(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderQuickStart(services);
    const button = screen.getByRole('button', { name: words.start });

    act(() => {
      button.click();
      button.click();
    });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish());

    expect(services.onboarding.startWithDefaults).toHaveBeenCalledTimes(1);
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('says so when the save fails, and lets the person try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const services = fakeServices(async () => {
      throw new Error('The disk is full');
    });
    renderQuickStart(services);
    const button = screen.getByRole('button', { name: words.start });

    await act(async () => {
      fireEvent.click(button);
    });
    expect(screen.getByRole('status')).toHaveTextContent(words.failed);

    await act(async () => {
      fireEvent.click(button);
    });
    expect(services.onboarding.startWithDefaults).toHaveBeenCalledTimes(2);
  });

  it('passes the catalogue lint merged with the other partitions', () => {
    expect(lintCatalogue({ ...enPartitions, onboarding })).toEqual([]);
    expect(Object.keys(mergePartitions({ ...enPartitions, onboarding }))).toContain('onboarding');
  });
});

describe('quick start on a fresh database (P04-09)', () => {
  async function openApp(initialHash: string, db?: Awaited<ReturnType<typeof openTestDb>>) {
    const test = db ?? (await openTestDb());
    const profileRepo = createProfileRepo(test.db);
    const settingsRepo = createSettingsRepo(test.db, { locale: 'en-GB', bus: test.bus });
    const weightRepo = createWeightRepo(test.db, { bus: test.bus });
    const services: Services = {
      diary: createDiaryService({
        diaryRepo: createDiaryRepo(test.db),
        photoRepo: createPhotoRepo(test.db),
      }),
      onboarding: createOnboardingService({ profileRepo, settingsRepo, weightRepo }),
      clock,
    };
    const ports = createShellPorts({ profileRepo, settingsRepo });
    const host = memoryHost(initialHash);
    const view = render(
      <ServicesProvider services={services}>
        <App ports={ports} router={createRouter(host)} appState={createAppState()} />
      </ServicesProvider>,
    );
    return { test, ports, host, view, profileRepo, settingsRepo, weightRepo };
  }

  it('stores the default profile, one weigh-in and onboarding done, then shows Home', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    const app = await openApp('');
    await bootReaches(app.ports, 'needsOnboarding');
    expect(app.host.hash()).toBe('#/onboarding');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: words.start }));
      await until(app.ports.boot, (value) => value?.status === 'ready');
    });

    expect(await app.profileRepo.get()).toEqual({
      kind: 'ok',
      value: profileDefaults('2026-10-26'),
    });
    expect(await app.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 70 },
    ]);
    expect(await app.settingsRepo.get('onboarding.done')).toBe(true);
    expect(await app.settingsRepo.get('units.weight')).toBe('kg');
    expect(screen.getByRole('heading', { level: 1, name: common.common.tabs.home })).toBeVisible();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: words.start })).toBeNull();
    // The address was replaced, so Back never returns to the quick start.
    expect(app.host.entries().hashes).toEqual(['#/home']);
  });

  it('opens on Home again after a reload', async () => {
    const first = await openApp('');
    await bootReaches(first.ports, 'needsOnboarding');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: words.start }));
      await until(first.ports.boot, (value) => value?.status === 'ready');
    });
    first.view.unmount();

    const second = await openApp('#/home', first.test);
    await bootReaches(second.ports, 'ready');

    expect(screen.getByRole('heading', { level: 1, name: common.common.tabs.home })).toBeVisible();
    expect(screen.queryByRole('button', { name: words.start })).toBeNull();
    expect(second.host.hash()).toBe('#/home');
    expect(await second.weightRepo.history()).toHaveLength(1);
  });
});
