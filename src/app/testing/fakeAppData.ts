// Small fakes of the app's data for shell tests: feeds the test moves by hand, so a test can
// hold the profile read or the settings snapshot back and release it when it wants.

import { vi } from 'vitest';
import type { LiveFeed, LiveState } from '../../data/live';
import { defaultSettings, type HideableTab, type Settings } from '../../data/settingsSchema';
import type { Profile } from '../../domain/model';
import type { AppData, ProfileRead } from '../../services/appData';

export interface FakeFeed<T> extends LiveFeed<T> {
  /** Publishes a new state to every listener. */
  set(state: LiveState<T>): void;
  /** Publishes `{status: 'ready', value}`. */
  ready(value: T): void;
}

export function fakeFeed<T>(start: LiveState<T> = { status: 'loading' }): FakeFeed<T> {
  let state = start;
  const listeners = new Set<() => void>();
  const set = (next: LiveState<T>) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set,
    ready: (value) => set({ status: 'ready', value }),
  };
}

/** A complete settings record: the defaults with `changes` on top. */
export function settingsWith(changes: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...changes };
}

/** A profile the codecs accept. */
export function someProfile(): Profile {
  return {
    sex: 'male',
    birthDate: '1988-02-03',
    heightCm: 181,
    weightKg: 79,
    activity: 'light',
    goal: 'lose',
    weeklyKg: 0.5,
    goalWeightKg: 74,
    saved: {},
    allergens: [],
    caloriesLocked: false,
    lockedMacros: [],
  };
}

export interface FakeAppData {
  readonly data: AppData;
  readonly settings: FakeFeed<Settings>;
  readonly profile: FakeFeed<ProfileRead>;
  /** Settings loaded with `changes` and a finished setup: what a returning person has. */
  finishedSetup(changes?: Partial<Settings>): void;
}

/** App data whose feeds start loading; `toggleHiddenTab` writes through to the settings feed. */
export function fakeAppData(): FakeAppData {
  const settings = fakeFeed<Settings>();
  const profile = fakeFeed<ProfileRead>();
  const snapshot = (): Settings | null => {
    const state = settings.current();
    return state.status === 'ready' ? state.value : null;
  };
  const toggleHiddenTab = vi.fn(async (tab: HideableTab, hidden: boolean) => {
    const current = snapshot() ?? settingsWith();
    const others = current['tabs.hidden'].filter((each) => each !== tab);
    const next = hidden ? [...others, tab] : others;
    settings.ready({ ...current, 'tabs.hidden': next });
    return next;
  });
  return {
    data: {
      settings: { feed: settings, snapshot, toggleHiddenTab },
      profile: {
        feed: profile,
        get: async () => {
          const state = profile.current();
          return state.status === 'ready' ? state.value : { kind: 'missing' };
        },
      },
      onboarding: { startWithDefaults: vi.fn(async () => undefined) },
    },
    settings,
    profile,
    finishedSetup(changes = {}) {
      settings.ready(settingsWith({ 'onboarding.done': true, ...changes }));
      profile.ready({ kind: 'ok', value: someProfile() });
    },
  };
}
