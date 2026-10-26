import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../lib/clock';
import { FACTORY_NOW } from '../test/factories';
import { ServicesProvider, useServices, type Services } from './context';

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
  clock: fixedClock(FACTORY_NOW, 'America/New_York'),
};

describe('useServices', () => {
  it('returns the services the provider holds', () => {
    const { result } = renderHook(() => useServices(), {
      wrapper: ({ children }) => (
        <ServicesProvider services={services}>{children}</ServicesProvider>
      ),
    });
    expect(result.current).toBe(services);
  });

  it('throws without a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useServices())).toThrow(/no ServicesProvider/);
  });
});
