import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_DARK_QUERY } from '../ui/theme';
import { AppDataContext } from './appDataContext';
import { fakeAppData, settingsWith, type FakeAppData } from './testing/fakeAppData';
import { ThemeProvider } from './ThemeProvider';

/** The operating system's colour-scheme query, which a test can flip. */
function stubSystemScheme(dark: boolean) {
  const listeners = new Set<EventListener>();
  const query = {
    media: SYSTEM_DARK_QUERY,
    matches: dark,
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'change') listeners.delete(listener);
    },
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    listenerCount: () => listeners.size,
    turn(scheme: 'dark' | 'light') {
      query.matches = scheme === 'dark';
      for (const listener of [...listeners]) listener(new Event('change'));
    },
  };
}

const root = document.documentElement;

let mounts = 0;

/** Counts how often it is mounted, so a test can tell a re-render from a remount. */
function MountCounter() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p>child</p>;
}

function renderThemed(fake: FakeAppData) {
  return render(
    <AppDataContext.Provider value={fake.data}>
      <ThemeProvider>
        <MountCounter />
      </ThemeProvider>
    </AppDataContext.Provider>,
  );
}

beforeEach(() => {
  mounts = 0;
  root.removeAttribute('data-theme');
  root.removeAttribute('data-accent');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThemeProvider', () => {
  it('leaves the page alone until the settings are loaded', () => {
    stubSystemScheme(true);
    const fake = fakeAppData();
    renderThemed(fake);
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(root).not.toHaveAttribute('data-theme');
    expect(root).not.toHaveAttribute('data-accent');
  });

  it('updates data-accent when the accent setting changes, without remounting children', () => {
    stubSystemScheme(false);
    const fake = fakeAppData();
    fake.settings.ready(settingsWith({ 'display.accent': 'basil' }));
    renderThemed(fake);
    expect(root).toHaveAttribute('data-accent', 'basil');
    act(() => fake.settings.ready(settingsWith({ 'display.accent': 'ember' })));
    expect(root).toHaveAttribute('data-accent', 'ember');
    expect(mounts).toBe(1);
  });

  it('shows dark in System mode on a dark device and follows the device live', () => {
    const system = stubSystemScheme(true);
    const fake = fakeAppData();
    fake.settings.ready(settingsWith({ 'display.appearance': 'system' }));
    renderThemed(fake);
    expect(root).toHaveAttribute('data-theme', 'dark');
    act(() => system.turn('light'));
    expect(root).toHaveAttribute('data-theme', 'light');
  });

  it('keeps the light theme on a dark device once Light is chosen (ACC-A8-1)', () => {
    const system = stubSystemScheme(true);
    const fake = fakeAppData();
    fake.settings.ready(settingsWith({ 'display.appearance': 'system' }));
    renderThemed(fake);
    expect(root).toHaveAttribute('data-theme', 'dark');
    act(() => fake.settings.ready(settingsWith({ 'display.appearance': 'light' })));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(system.listenerCount()).toBe(0);
    act(() => system.turn('dark'));
    expect(root).toHaveAttribute('data-theme', 'light');
    expect(mounts).toBe(1);
  });

  it('stops following the device when it unmounts', () => {
    const system = stubSystemScheme(true);
    const fake = fakeAppData();
    fake.settings.ready(settingsWith());
    const view = renderThemed(fake);
    expect(system.listenerCount()).toBe(1);
    view.unmount();
    expect(system.listenerCount()).toBe(0);
  });
});
