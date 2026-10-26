import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { DEFAULT_THEME, type Appearance } from '../ui/theme';
import type { AccentId } from '../ui/tokens';

/**
 * What the shell reads, and nothing more: small read-only stores in the shape React's
 * `useSyncExternalStore` takes. `getSnapshot()` returns `undefined` until the value has been
 * read, and the same object until it changes. The data layer adapts its repositories to these
 * (P02-04/05, P04-08/09); tests pass stores they resolve by hand.
 */
export interface ReadStore<T> {
  getSnapshot(): T | undefined;
  subscribe(onChange: () => void): () => void;
}

/** The settings the shell itself needs. */
export interface ShellSettings {
  readonly appearance: Appearance;
  readonly accent: AccentId;
  /** Tabs the person hid, as stored; only Progress and Coach can take effect. */
  readonly hiddenTabs: readonly string[];
}

/** Where start-up stands once the database has been opened and the profile read. */
export type BootState =
  /** The database could not be opened (P02-01); nothing was deleted. */
  | { readonly status: 'openError' }
  /** No completed profile yet: onboarding first. */
  | { readonly status: 'needsOnboarding' }
  | { readonly status: 'ready' };

export interface ShellPorts {
  readonly settings: ReadStore<ShellSettings>;
  readonly boot: ReadStore<BootState>;
}

/** The shell settings of a new install: follow the device, Basil, every tab shown. */
export const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  appearance: DEFAULT_THEME.appearance,
  accent: DEFAULT_THEME.accent,
  hiddenTabs: [],
};

/** A store that always holds `value`. */
export function fixedStore<T>(value: T): ReadStore<T> {
  return { getSnapshot: () => value, subscribe: () => () => {} };
}

/**
 * The source `main.tsx` uses until the repositories are adapted to the ports: default settings,
 * and no completed profile, so the app opens on onboarding.
 */
export function temporaryPorts(): ShellPorts {
  return {
    settings: fixedStore(DEFAULT_SHELL_SETTINGS),
    boot: fixedStore<BootState>({ status: 'needsOnboarding' }),
  };
}

export const ShellPortsContext = createContext<ShellPorts | null>(null);

export function useShellPorts(): ShellPorts {
  const ports = useContext(ShellPortsContext);
  if (!ports) throw new Error('useShellPorts: no ShellPortsContext above this component');
  return ports;
}

/** The store's value, or `undefined` while it has not been read; re-renders on change. */
export function useReadStore<T>(store: ReadStore<T>): T | undefined {
  const subscribe = useCallback((onChange: () => void) => store.subscribe(onChange), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The shell settings, or `undefined` until they have been read. */
export function useShellSettings(): ShellSettings | undefined {
  return useReadStore(useShellPorts().settings);
}

/** The start-up state, or `undefined` while it is still being worked out. */
export function useBootState(): BootState | undefined {
  return useReadStore(useShellPorts().boot);
}
