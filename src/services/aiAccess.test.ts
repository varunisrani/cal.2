import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '../ai/settings';
import { createSecretsRepo, FDC_SLOT } from '../data/repos/secretsRepo';
import { createSettingsRepo } from '../data/repos/settingsRepo';
import { openTestDb } from '../test/db';
import { createAiAccess } from './aiAccess';
import { createAiSetupService } from './aiSetup';

const MISTRAL_KEY = 'mst-7Hq2Lx9Pw4Rz1Vb8Nc3Kd6Fg0Js5Ty2';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const secretsRepo = createSecretsRepo(db);
  return {
    secretsRepo,
    setup: createAiSetupService({ settingsRepo, secretsRepo }),
    read: createAiAccess({ settingsRepo, secretsRepo }),
  };
}

describe('createAiAccess', () => {
  it('reads the defaults and no keys before anything is set up', async () => {
    const { read } = await setUp();

    expect(await read()).toEqual({ settings: DEFAULT_AI_SETTINGS, keys: {}, configured: false });
  });

  it('reads the saved primary and its key, and leaves the FoodData Central slot out', async () => {
    const { read, setup, secretsRepo } = await setUp();
    await setup.saveChoice({
      provider: 'mistral',
      model: 'mistral-medium-4',
      serverUrl: '',
      key: MISTRAL_KEY,
    });
    await secretsRepo.set(FDC_SLOT, 'fdc-not-an-ai-key');

    const access = await read();

    expect(access.configured).toBe(true);
    expect(access.settings.primary.provider).toBe('mistral');
    expect(access.keys).toEqual({ mistral: MISTRAL_KEY });
  });

  it('reads again on every call, so a key saved a moment ago is used', async () => {
    const { read, setup } = await setUp();
    expect((await read()).keys).toEqual({});

    await setup.saveChoice({
      provider: 'mistral',
      model: 'mistral-medium-4',
      serverUrl: '',
      key: MISTRAL_KEY,
    });

    expect((await read()).keys).toEqual({ mistral: MISTRAL_KEY });
  });

  it('reads as not set up after "Set up later"', async () => {
    const { read, setup } = await setUp();
    await setup.saveChoice({
      provider: 'mistral',
      model: 'mistral-medium-4',
      serverUrl: '',
      key: MISTRAL_KEY,
    });

    await setup.setUpLater();

    expect(await read()).toEqual({ settings: DEFAULT_AI_SETTINGS, keys: {}, configured: false });
  });
});
