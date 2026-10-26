import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import type { SchemeQuery } from '../ui/theme';
import {
  DEFAULT_SHELL_SETTINGS,
  fixedStore,
  ShellPortsContext,
  type BootState,
  type ShellSettings,
} from './ports';
import { controlledStore, type ControlledStore } from './testing/controlledStore';
import { ThemeProvider } from './ThemeProvider';

/** The device's dark-mode query, which the test flips like a phone at sunset. */
class DeviceScheme implements SchemeQuery {
  private readonly listeners = new Set<(event: { matches: boolean }) => void>();
  constructor(public matches: boolean) {}
  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void): void {
    this.listeners.delete(listener);
  }
  get listening(): number {
    return this.listeners.size;
  }
  flip(matches: boolean): void {
    this.matches = matches;
    for (const listener of [...this.listeners]) listener({ matches });
  }
}

let mounts = 0;

/** A child that counts its mounts, standing in for an already drawn gauge or chart. */
function Gauge() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p data-testid="gauge" />;
}

function renderTheme(
  initial: ShellSettings | undefined,
  device: SchemeQuery,
): { root: HTMLElement; settings: ControlledStore<ShellSettings>; unmount: () => void } {
  mounts = 0;
  const root = document.createElement('div');
  const settings = controlledStore(initial);
  const ports = { settings, boot: fixedStore<BootState>({ status: 'ready' }) };
  const { unmount } = render(
    <ShellPortsContext value={ports}>
      <ThemeProvider root={root} media={device}>
        <Gauge />
      </ThemeProvider>
    </ShellPortsContext>,
  );
  return { root, settings, unmount };
}

const choose = (patch: Partial<ShellSettings>): ShellSettings => ({
  ...DEFAULT_SHELL_SETTINGS,
  ...patch,
});

describe('ThemeProvider', () => {
  it('updates data-accent when the accent setting changes, without remounting its children', () => {
    const { root, settings } = renderTheme(choose({ accent: 'basil' }), new DeviceScheme(true));
    const gauge = screen.getByTestId('gauge');
    expect(root.dataset.accent).toBe('basil');

    act(() => settings.set(choose({ accent: 'ember' })));
    expect(root.dataset.accent).toBe('ember');
    expect(screen.getByTestId('gauge')).toBe(gauge);
    expect(mounts).toBe(1);
  });

  it('shows dark in System mode on a dark device and follows the device live', () => {
    const device = new DeviceScheme(true);
    const { root } = renderTheme(choose({ appearance: 'system' }), device);
    expect(root.dataset.theme).toBe('dark');
    act(() => device.flip(false));
    expect(root.dataset.theme).toBe('light');
  });

  it('keeps the light theme when Light is chosen, even when the device is or turns dark', () => {
    const device = new DeviceScheme(true);
    const { root, settings } = renderTheme(choose({ appearance: 'system' }), device);
    expect(root.dataset.theme).toBe('dark');

    act(() => settings.set(choose({ appearance: 'light' })));
    expect(root.dataset.theme).toBe('light');
    act(() => device.flip(true));
    expect(root.dataset.theme).toBe('light');
    expect(device.listening).toBe(0);
  });

  it('shows the default choice, following the device, until the settings are read', () => {
    const device = new DeviceScheme(false);
    const { root, settings } = renderTheme(undefined, device);
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.accent).toBe('basil');

    act(() => settings.set(choose({ appearance: 'dark', accent: 'lagoon' })));
    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.accent).toBe('lagoon');
  });

  it('stops listening to the device when unmounted', () => {
    const device = new DeviceScheme(true);
    const { unmount } = renderTheme(choose({ appearance: 'system' }), device);
    expect(device.listening).toBe(1);
    unmount();
    expect(device.listening).toBe(0);
  });
});
