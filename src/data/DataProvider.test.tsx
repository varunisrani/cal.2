import { renderHook } from '@testing-library/react';
import { Dexie } from 'dexie';
import { describe, expect, it, vi } from 'vitest';
import { fixedClock } from '../lib/clock';
import { FACTORY_NOW } from '../test/factories';
import { DataProvider, useDataSources, type DataSources } from './DataProvider';

const none = () => Dexie.Promise.resolve([]);

const sources: DataSources = {
  profileRepo: { get: () => Promise.resolve({ kind: 'missing' }) },
  settingsRepo: { snapshot: vi.fn(), loaded: new Promise(() => {}) },
  diaryRepo: { byDay: none, between: none },
  waterRepo: { byDay: none },
  fastRepo: { between: none, active: () => Dexie.Promise.resolve(null) },
  weightRepo: { between: none },
  bodyFatRepo: { between: none },
  savedMealsRepo: { list: none },
  coachRepo: { list: none, chats: none, summaries: none },
  unreadableFlag: () => Promise.resolve(false),
  clock: fixedClock(FACTORY_NOW, 'America/New_York'),
};

describe('useDataSources', () => {
  it('returns the sources the provider holds', () => {
    const { result } = renderHook(() => useDataSources(), {
      wrapper: ({ children }) => <DataProvider sources={sources}>{children}</DataProvider>,
    });
    expect(result.current).toBe(sources);
  });

  it('throws without a provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useDataSources())).toThrow(/no DataProvider/);
    quiet.mockRestore();
  });
});
