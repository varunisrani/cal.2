import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { data as words } from '../../../i18n/en/data';
import { seedStore } from '../../../services/backup/testing/seed';
import type { StorageReport, YourDataService } from '../../../services/yourData';
import { closeHarnesses } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { formatBytes, StorageCard } from './StorageCard';
import { openDataPage, type DataPageSetup } from './testing/openDataPage';

afterEach(closeHarnesses);

const card = words.data.storage;

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

const shown = (hook: string) =>
  settle(() => document.querySelector(`[data-ui="${hook}"]`) !== null);

const FACTS = ['storage.photos', 'storage.thumbs', 'storage.used', 'storage.persistence'];

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
}

/** The card over a seeded diary: two photos of 3 000 and 1 200 bytes, one 300-byte thumbnail. */
async function openCard(setup: DataPageSetup = {}) {
  const user = userEvent.setup();
  const h = await openDataPage(setup);
  await seedStore(h.db);
  h.mount(<StorageCard service={h.yourData} />);
  return { ...h, user };
}

const measured = () => settle(() => textOf('storage.persistence') !== card.measuring);

describe('StorageCard', () => {
  it('shows … until measured, then photo and thumbnail bytes, usage of the quota and that the data may be cleared (ACC-K7-1, R06.19)', async () => {
    const report = deferred<StorageReport>();
    const s = await openCard({
      wrapData: (real) => ({
        ...real,
        measure: () => report.promise.then(() => real.measure()),
      }),
    });

    for (const hook of FACTS) expect(textOf(hook)).toBe(card.measuring);
    expect(document.querySelector('[data-ui="storage.atRisk"]')).toBeNull();

    report.resolve({} as StorageReport);
    await measured();
    expect(textOf('storage.photos')).toBe('4.2 kB');
    expect(textOf('storage.thumbs')).toBe('300 bytes');
    expect(textOf('storage.used')).toBe('1.2 MB of 50 MB');
    expect(textOf('storage.persistence')).toBe(card.bestEffort);
    expect(textOf('storage.atRisk')).toBe(card.atRisk);
    expect(s.steps).toEqual([]);
  });

  it('says Yes and warns of nothing when the browser keeps the data, and Not available without an estimate (ACC-K7-1)', async () => {
    await openCard({
      storage: { estimate: async () => null, persistenceStatus: async () => 'persistent' },
    });

    await measured();
    expect(textOf('storage.persistence')).toBe(card.persistent);
    expect(textOf('storage.used')).toBe(card.unavailable);
    expect(document.querySelector('[data-ui="storage.atRisk"]')).toBeNull();
  });

  it('clears the cache: thumbnails go, every photo stays, and the card measures again', async () => {
    const s = await openCard();
    await measured();

    await s.user.click(screen.getByRole('button', { name: card.clearCache }));

    await settle(() => textOf('storage.thumbs') === '0 bytes');
    expect(textOf('storage.photos')).toBe('4.2 kB');
    expect(await s.db.photos.count()).toBe(2);
    expect(await s.photoUsage()).toEqual({ count: 2, photoBytes: 4_200, thumbBytes: 0 });
    await shown('toast.message');
    expect(textOf('toast.message')).toBe(card.cleared);
  });

  it('runs one Clear cache at a time', async () => {
    const held = deferred<void>();
    const clearCache = vi.fn<YourDataService['clearCache']>();
    const s = await openCard({
      wrapData: (real) => ({
        ...real,
        clearCache: (...args) => {
          clearCache(...args);
          return held.promise.then(() => real.clearCache());
        },
      }),
    });
    await measured();
    const button = screen.getByRole('button', { name: card.clearCache });

    await s.user.click(button);
    await s.user.click(button);

    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    held.resolve();
    await settle(() => !button.hasAttribute('aria-busy'));
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(textOf('storage.thumbs')).toBe('0 bytes');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, 'en-US', '0 bytes'],
    [1, 'en-US', '1 byte'],
    [512, 'en-US', '512 bytes'],
    [4_200, 'en-US', '4.2 kB'],
    [999_600, 'en-US', '1 MB'],
    [12_345_678, 'en-US', '12 MB'],
    [1_500_000_000, 'en-US', '1.5 GB'],
    [4_200, 'de-DE', '4,2 kB'],
  ])('writes %i bytes in %s as %s', (bytes, locale, text) => {
    expect(formatBytes(bytes, locale)).toBe(text);
  });
});
