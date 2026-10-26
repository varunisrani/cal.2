// The repositories adapted to the shell's ports (src/app/ports.ts). Both stores are live queries
// (src/data/live.ts): a committed write in this tab or another one reaches the shell, and a store
// hands out the same snapshot object until its value changes, as `useSyncExternalStore` needs.

import {
  DEFAULT_SHELL_SETTINGS,
  fixedStore,
  type BootState,
  type ReadStore,
  type ShellPorts,
  type ShellSettings,
} from '../app/ports';
import { live } from '../data/live';
import type { ProfileRepo } from '../data/repos/profileRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';

export interface ShellSources {
  readonly profileRepo: Pick<ProfileRepo, 'get'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get' | 'snapshot'>;
}

const OPEN_ERROR: BootState = { status: 'openError' };
const NEEDS_ONBOARDING: BootState = { status: 'needsOnboarding' };
const READY: BootState = { status: 'ready' };

/**
 * A read store over a live query: `undefined` while loading, the query's value once read, and
 * `onError` when the read fails.
 */
function liveStore<T>(query: () => Promise<T>, onError: T): ReadStore<T> {
  const source = live(query);
  return {
    subscribe: (onChange) => source.subscribe(onChange),
    getSnapshot() {
      const state = source.getSnapshot();
      if (state.status === 'loading') return undefined;
      return state.status === 'ready' ? state.value : onError;
    },
  };
}

/**
 * The live shell ports. Boot: onboarding until a profile is stored and `onboarding.done` is set,
 * then ready. A stored profile that cannot be read still counts, so damaged data never sends the
 * person back through onboarding; a read that fails shows the recovery card. Settings: the
 * appearance, the accent and the hidden tabs.
 */
export function createShellPorts({ profileRepo, settingsRepo }: ShellSources): ShellPorts {
  const boot = liveStore<BootState>(async () => {
    const profile = await profileRepo.get();
    if (profile.kind === 'missing') return NEEDS_ONBOARDING;
    return (await settingsRepo.get('onboarding.done')) ? READY : NEEDS_ONBOARDING;
  }, OPEN_ERROR);

  const settings = liveStore<ShellSettings>(async () => {
    const all = await settingsRepo.snapshot();
    return {
      appearance: all['display.appearance'],
      accent: all['display.accent'],
      hiddenTabs: all['tabs.hidden'],
    };
  }, DEFAULT_SHELL_SETTINGS);

  return { boot, settings };
}

/** The ports when the database could not be opened: the recovery card, in the default theme. */
export function openErrorPorts(): ShellPorts {
  return { boot: fixedStore(OPEN_ERROR), settings: fixedStore(DEFAULT_SHELL_SETTINGS) };
}

const NOT_READ: ReadStore<never> = { getSnapshot: () => undefined, subscribe: () => () => {} };

/** The ports while the database is still opening: nothing is read yet, so the skeleton shows. */
export function openingPorts(): ShellPorts {
  return { boot: NOT_READ, settings: NOT_READ };
}
