import { describe, expect, it, onTestFinished } from 'vitest';
import { openTestDb } from '../../test/db';
import { factories } from '../../test/factories';
import { createBus } from '../bus';
import { createFastRepo } from './fastRepo';
import { createSettingsRepo } from './settingsRepo';

const make = factories();

describe('repositories sharing a setting', () => {
  it('reads the fasting switch the settings repository wrote, both ways', async () => {
    const db = await openTestDb();
    const bus = createBus('cross-repo-test');
    onTestFinished(() => bus.close());
    const settings = createSettingsRepo(db, { bus, clock: make.clock });
    onTestFinished(() => settings.close());
    const fasts = createFastRepo(db, { clock: make.clock });

    expect(await fasts.trackingOn()).toBe(false);
    await settings.set('fasting.on', true);
    expect(await fasts.trackingOn()).toBe(true);

    await fasts.setTracking(false, make.clock.now());
    expect(await settings.get('fasting.on')).toBe(false);
  });
});
