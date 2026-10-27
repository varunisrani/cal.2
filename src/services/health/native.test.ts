import { describe, expect, it, vi } from 'vitest';
import { fakeHealthPlugin } from './testing/fakeHealthPlugin';

const registered = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock('@capacitor/core', () => ({
  registerPlugin: (name: string) => {
    registered.names.push(name);
    return fakeHealthPlugin();
  },
}));

describe('nativeHealthPlugin', () => {
  it('asks Capacitor for the plugin the Android shell registers as HealthConnect', async () => {
    const { nativeHealthPlugin } = await import('./native');
    const plugin = nativeHealthPlugin();
    expect(registered.names).toEqual(['HealthConnect']);
    expect(await plugin.availability()).toEqual({ status: 'available' });
  });
});
