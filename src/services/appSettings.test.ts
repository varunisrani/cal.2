import { afterEach, describe, expect, it } from 'vitest';
import { createProfileRepo } from '../data/repos/profileRepo';
import { createSettingsRepo, InvalidSettingError } from '../data/repos/settingsRepo';
import type { AccentSetting } from '../data/settingsSchema';
import { DEFAULT_MENU_LAYOUT } from '../domain/food/addMenu';
import { openTestDb } from '../test/db';
import { makeProfile } from '../test/factories';
import { createAppSettingsService } from './appSettings';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function setUp() {
  const { db, bus } = await openTestDb();
  closers.push(() => db.close());
  const settingsRepo = createSettingsRepo(db, { locale: 'en-US', bus });
  return {
    db,
    settingsRepo,
    profileRepo: createProfileRepo(db),
    service: createAppSettingsService({ settingsRepo }),
  };
}

describe('set', () => {
  it('stores each plain setting as chosen', async () => {
    const h = await setUp();

    await h.service.set('display.appearance', 'light');
    await h.service.set('display.accent', 'ember');
    await h.service.set('log.gramsFirst', true);
    await h.service.set('display.weekStart', 'sun');
    await h.service.set('units.energy', 'kJ');
    await h.service.set('units.height', 'ftIn');
    await h.service.set('product.show', false);

    const all = await h.settingsRepo.snapshot();
    expect(all).toMatchObject({
      'display.appearance': 'light',
      'display.accent': 'ember',
      'log.gramsFirst': true,
      'display.weekStart': 'sun',
      'units.energy': 'kJ',
      'units.height': 'ftIn',
      'units.weight': 'kg',
      'product.show': false,
    });
  });

  it('changes only the unit: the stored height, weight and targets stay as they were', async () => {
    const h = await setUp();
    const profile = makeProfile({ heightCm: 175, weightKg: 72.4, saved: { kcal: 2_000 } });
    await h.profileRepo.save(profile);

    await h.service.set('units.height', 'ftIn');
    await h.service.set('units.energy', 'kJ');

    const read = await h.profileRepo.get();
    expect(read).toEqual({ kind: 'ok', value: profile });
  });

  it('refuses a value the setting does not know and keeps the stored one', async () => {
    const h = await setUp();
    await h.service.set('display.accent', 'lagoon');

    await expect(h.service.set('display.accent', 'pink' as AccentSetting)).rejects.toBeInstanceOf(
      InvalidSettingError,
    );
    expect(await h.settingsRepo.get('display.accent')).toBe('lagoon');
  });
});

describe('setTabHidden', () => {
  it('hides Coach and keeps Progress hidden by an earlier change (R05.13)', async () => {
    const h = await setUp();
    await h.service.setTabHidden('progress', true);

    expect(await h.service.setTabHidden('coach', true)).toEqual(['progress', 'coach']);
    expect(await h.service.setTabHidden('progress', false)).toEqual(['coach']);
    expect(await h.settingsRepo.get('tabs.hidden')).toEqual(['coach']);
  });
});

describe('setProductFieldHidden', () => {
  it('hides one detail at a time and stores the list in the block order', async () => {
    const h = await setUp();

    await h.service.setProductFieldHidden('ingredients', true);
    await h.service.setProductFieldHidden('nova', true);
    expect(await h.service.setProductFieldHidden('barcode', true)).toEqual([
      'barcode',
      'nova',
      'ingredients',
    ]);
    expect(await h.service.setProductFieldHidden('nova', false)).toEqual([
      'barcode',
      'ingredients',
    ]);
  });

  it('drops a stored name this build does not know when it writes', async () => {
    const h = await setUp();
    await h.db.settings.put({ key: 'product.hiddenFields', value: ['labels', 'retired', 'nutri'] });

    expect(await h.settingsRepo.get('product.hiddenFields')).toEqual(['nutri', 'labels']);
    expect(await h.service.setProductFieldHidden('eco', true)).toEqual(['nutri', 'eco', 'labels']);
    expect(await h.db.settings.get('product.hiddenFields')).toEqual({
      key: 'product.hiddenFields',
      value: ['nutri', 'eco', 'labels'],
    });
  });
});

describe('setMenuLayout (P09-05)', () => {
  it('stores the menu tidied: empty groups gone, names trimmed, each method once (R06.21)', async () => {
    const h = await setUp();

    const stored = await h.service.setMenuLayout({
      groups: [
        { id: 'snapScan', name: 'snapScan', methods: ['camera', 'barcode'] },
        { id: 'g1', name: '   ', methods: [] },
        { id: 'g2', name: '  Later  ', methods: ['barcode', 'recent'] },
        { id: 'g3', name: 'Fourth', methods: ['manual'] },
      ],
      loose: ['recent', 'copyDay'],
    });

    const tidy = {
      version: 1,
      groups: [
        { id: 'snapScan', name: 'snapScan', methods: ['camera', 'barcode'] },
        { id: 'g2', name: 'Later', methods: ['recent'] },
      ],
      loose: ['copyDay'],
    };
    expect(stored).toEqual(tidy);
    expect(await h.settingsRepo.get('menu.layout')).toEqual(tidy);
  });

  it('keeps a blank name blank, for the generic label', async () => {
    const h = await setUp();
    await h.service.setMenuLayout({
      groups: [{ id: 'g1', name: '  ', methods: ['manual'] }],
      loose: [],
    });
    expect(await h.settingsRepo.get('menu.layout')).toEqual({
      version: 1,
      groups: [{ id: 'g1', name: '', methods: ['manual'] }],
      loose: [],
    });
  });

  it('stores a menu emptied on purpose as empty', async () => {
    const h = await setUp();
    expect(
      await h.service.setMenuLayout({ groups: [{ id: 'g1', name: 'x', methods: [] }], loose: [] }),
    ).toEqual({ version: 1, groups: [], loose: [] });
  });
});

describe('resetMenuLayout (P09-05)', () => {
  it('clears the stored menu, which reads as the default three groups', async () => {
    const h = await setUp();
    await h.service.setMenuLayout({ groups: [], loose: ['manual'] });

    expect(await h.service.resetMenuLayout()).toEqual(DEFAULT_MENU_LAYOUT);
    expect(await h.settingsRepo.get('menu.layout')).toBeNull();
  });
});
