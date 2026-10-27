// Test helper: the App settings pages over a fresh test database, with the real app settings
// service, the shell's live settings (so the theme and the tab bar follow what is stored) and the
// screen harness's repositories, router, toasts and providers. The clock is the harness's: Monday
// 26 October 2026, 12:30 in New York.

import type { ReactNode } from 'react';
import { ShellPortsContext } from '../../../../app/ports';
import { ThemeProvider } from '../../../../app/ThemeProvider';
import {
  createAppSettingsService,
  type AppSettingsService,
} from '../../../../services/appSettings';
import { ServicesProvider } from '../../../../services/context';
import { createProfileEditsService } from '../../../../services/profileEdits';
import { createShellPorts } from '../../../../services/shell';
import { openHarness, type HarnessOptions } from '../../../../test/screenHarness';

export interface AppSettingsSetup {
  /** The address the harness opens on; App settings by default. */
  readonly hash?: string;
  /** Changes what the read hooks see (a held or frozen read). */
  readonly sources?: HarnessOptions['sources'];
  /** Wraps the real service (a failing or held write). */
  readonly wrap?: (real: AppSettingsService) => AppSettingsService;
}

export async function openAppSettings({
  hash = '#/settings/app',
  sources,
  wrap,
}: AppSettingsSetup = {}) {
  const h = await openHarness({ hash, sources });
  const real = createAppSettingsService({ settingsRepo: h.repos.settingsRepo });
  const appSettings = wrap ? wrap(real) : real;
  const profileEdits = createProfileEditsService({ ...h.repos, clock: h.clock });
  const services = { ...h.services, appSettings, profileEdits };
  // The shell reads the stored settings itself, as in the app; never through `sources`.
  const ports = createShellPorts(h.repos);
  /**
   * Takes the theme attributes in place of <html>, so tests never leave them behind. It is not in
   * the document, so wait for it with `settle`, not `until` (which watches the page).
   */
  const themeRoot = document.createElement('div');

  /** Renders `ui` in the harness's providers with the service, the shell's ports and the theme. */
  const mount = (ui: ReactNode) =>
    h.mount(
      <ServicesProvider services={services}>
        <ShellPortsContext value={ports}>
          <ThemeProvider root={themeRoot} media={null}>
            {ui}
          </ThemeProvider>
        </ShellPortsContext>
      </ServicesProvider>,
    );

  return { ...h, appSettings, services, themeRoot, mount };
}

export type AppSettingsHarness = Awaited<ReturnType<typeof openAppSettings>>;

/** A promise with its settle functions, for a write held open by a test. */
export function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
