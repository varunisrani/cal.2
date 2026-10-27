import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useRoute } from '../../../app/useRoute';
import type { DataSources } from '../../../data/DataProvider';
import type { Settings } from '../../../data/settingsSchema';
import {
  decodeLayout,
  DEFAULT_MENU_LAYOUT,
  type AddMenuLayout,
  type MenuGroup,
} from '../../../domain/food/addMenu';
import { appSettings } from '../../../i18n/en/appSettings';
import { home } from '../../../i18n/en/home';
import { menu } from '../../../i18n/en/menu';
import { settings } from '../../../i18n/en/settings';
import { t } from '../../../i18n/t';
import { makeProfile } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { HomePage } from '../../home/HomePage';
import { settle } from '../../water/testing/openWater';
import { categoryFor } from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { MenuEditorPage } from './MenuEditorPage';
import { layoutKey } from './menuEdits';
import { deferred, openAppSettings, type AppSettingsHarness } from './testing/openAppSettings';

afterEach(closeHarnesses);

beforeAll(async () => {
  // Fetched on first open in the app; loaded here first so no wait includes its transform.
  await import('./AppPage');
  await import('./MenuEditorPage');
});

const words = settings.settings.menuEditor;
const methods = menu.menu.method;
const groupNames = menu.menu.group;
const PAGE = '[data-ui="menuEditor"]';
const HASH = '#/settings/menu';

function layoutOf(
  groups: readonly (readonly [string, string, MenuGroup['methods']])[],
  loose: AddMenuLayout['loose'] = [],
): AddMenuLayout {
  return {
    version: 1,
    groups: groups.map(([id, name, methods]) => ({ id, name, methods })),
    loose,
  };
}

/** The element a data-ui hook names. */
const hook = (ui: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-ui="${ui}"]`);
  if (!element) throw new Error(`Nothing drawn for ${ui}`);
  return element;
};
const click = (ui: string) => fireEvent.click(hook(ui));
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const type = (ui: string, text: string) => fireEvent.change(hook(ui), { target: { value: text } });

const rowsIn = (card: Element): string[] =>
  Array.from(
    card.querySelectorAll('li[data-ui^="menuEditor.method."]'),
    (row) => row.textContent ?? '',
  );

/** The page as drawn: each group's heading and methods, then the loose and hidden methods. */
function drawn() {
  const loose = document.querySelector('[data-ui="menuEditor.loose"]');
  const hidden = document.querySelector('[data-ui="menuEditor.hidden"]');
  return {
    groups: Array.from(
      document.querySelectorAll('section[data-ui^="menuEditor.group."]'),
      (card) => [card.querySelector('h2')?.textContent ?? '', rowsIn(card)],
    ),
    loose: loose ? rowsIn(loose) : null,
    hidden: hidden
      ? Array.from(hidden.querySelectorAll('li'), (row) => row.textContent ?? '')
      : null,
  };
}

const DEFAULT_DRAWN = [
  [groupNames.snapScan, [methods.camera, methods.library, methods.barcode]],
  [groupNames.describe, [methods.describe, methods.manual]],
  [groupNames.reuse, [methods.recent, methods.often, methods.saved, methods.copyDay]],
];

const groupCount = () => screen.getByRole('spinbutton', { name: words.groups });
const moreGroups = () => press(t('common.increase', { name: words.groups }));
const fewerGroups = () => press(t('common.decrease', { name: words.groups }));

async function storedMenu(h: AppSettingsHarness): Promise<AddMenuLayout> {
  return decodeLayout(await h.repos.settingsRepo.get('menu.layout'));
}

/** Waits, one read at a time, until the stored menu reads as `expected`. */
async function untilStored(h: AppSettingsHarness, expected: AddMenuLayout): Promise<void> {
  for (let round = 0; round < 100; round++) {
    let now: AddMenuLayout = DEFAULT_MENU_LAYOUT;
    await act(async () => {
      now = await storedMenu(h);
    });
    if (layoutKey(now) === layoutKey(expected)) return;
  }
  expect(await storedMenu(h)).toEqual(expected);
}

/**
 * Opens the page over the stored `layout` (nothing stored: the default). `saved(expected)` waits
 * until `expected` is stored and the page has read it back, so what the page shows next is what
 * it keeps after its own write came back.
 */
async function openEditor(layout?: AddMenuLayout) {
  let lastRead: unknown;
  const h = await openAppSettings({
    hash: HASH,
    sources: (real) => ({
      ...real,
      settingsRepo: {
        loaded: real.settingsRepo.loaded,
        snapshot: () =>
          real.settingsRepo.snapshot().then((values) => {
            lastRead = values['menu.layout'];
            return values;
          }),
      },
    }),
  });
  if (layout) await h.repos.settingsRepo.set('menu.layout', { ...layout });
  h.mount(<MenuEditorPage />);
  await untilShown(PAGE);
  const saved = async (expected: AddMenuLayout): Promise<void> => {
    await untilStored(h, expected);
    await settle(() => layoutKey(decodeLayout(lastRead)) === layoutKey(expected));
  };
  return { ...h, saved };
}

/**
 * Settings reads that can be held: each read takes the stored values at once, but while holding
 * it hands them over only when let go, as a slow read would.
 */
function heldReads() {
  let holding = false;
  const waiting: Array<() => void> = [];
  return {
    hold: () => {
      holding = true;
    },
    /** Hands over the reads held so far; with `stop`, later reads are no longer held. */
    letGo: (stop = false) => {
      if (stop) holding = false;
      for (const handOver of waiting.splice(0)) handOver();
    },
    held: () => waiting.length,
    wrap: (real: DataSources): DataSources => ({
      ...real,
      settingsRepo: {
        loaded: real.settingsRepo.loaded,
        snapshot: () => {
          const read = real.settingsRepo.snapshot();
          if (!holding) return read;
          return read.then(
            (values) => new Promise<Settings>((resolve) => waiting.push(() => resolve(values))),
          );
        },
      },
    }),
  };
}

/** The Settings tab as the app draws it: the screen for whatever the address says. */
function SettingsTab() {
  const route = useRoute();
  return route.kind === 'tab' && route.tab === 'settings' ? (
    <SettingsScreen nested={route.nested} />
  ) : null;
}

describe('MenuEditorPage', () => {
  it('is reached from App settings at #/settings/menu, under its title', async () => {
    expect(categoryFor(['menu'])).toMatchObject({
      id: 'menu',
      titleKey: 'settings.menuEditor.title',
    });
    const h = await openAppSettings({ hash: '#/settings/app' });
    h.mount(<SettingsTab />);
    await untilLoaded();
    await untilShown('[data-ui="appSettings.pages"]');

    press(words.title);

    expect(h.host.hash()).toBe(HASH);
    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    await untilLoaded();
    await untilShown(PAGE);
  });

  it('shows the default menu as three groups, with nothing hidden, Reset and the note', async () => {
    const h = await openEditor();

    expect(groupCount()).toHaveAttribute('aria-valuenow', '3');
    expect(drawn()).toEqual({ groups: DEFAULT_DRAWN, loose: null, hidden: null });
    // A preset name is ours: the field is empty and shows it as a hint.
    const snapScan = screen.getByRole('region', { name: groupNames.snapScan });
    const name = within(snapScan).getByRole('textbox', { name: words.name });
    expect(name).toHaveValue('');
    expect(name).toHaveAttribute('placeholder', groupNames.snapScan);
    // Moves stop at the ends; with nothing hidden there is nothing to add.
    expect(hook('menuEditor.group.snapScan.up')).toBeDisabled();
    expect(hook('menuEditor.group.reuse.down')).toBeDisabled();
    expect(hook('menuEditor.method.camera.up')).toBeDisabled();
    expect(hook('menuEditor.method.barcode.down')).toBeDisabled();
    expect(
      within(snapScan).getByRole('button', {
        name: t('settings.menuEditor.remove', { name: methods.barcode }),
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: words.addMethod })).toBeNull();
    expect(screen.getByRole('button', { name: words.reset })).toBeVisible();
    expect(screen.getByText(words.footer)).toBeVisible();
    // Opening the page writes nothing.
    expect(await h.repos.settingsRepo.get('menu.layout')).toBeNull();
  });

  it('draws nothing until the stored menu is read, then shows it with a change made meanwhile (R06.21, R06.22)', async () => {
    const read = deferred<void>();
    const h = await openAppSettings({
      hash: HASH,
      sources: (real) => ({
        ...real,
        settingsRepo: {
          loaded: read.promise.then(() => real.settingsRepo.loaded),
          snapshot: () => real.settingsRepo.snapshot(),
        },
      }),
    });
    await h.repos.settingsRepo.set('menu.layout', { ...layoutOf([], ['manual']) });
    h.mount(<MenuEditorPage />);

    await act(async () => undefined);
    // Nothing to press, so no edit can be made over a menu not read yet.
    expect(document.querySelector(PAGE)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();

    // Another tab changes the menu while this page still waits for its first read.
    const changed = layoutOf([], ['manual', 'copyDay']);
    await act(() => h.appSettings.setMenuLayout(changed));
    read.resolve();
    await untilShown(PAGE);

    expect(drawn().loose).toEqual([methods.manual, methods.copyDay]);
    expect(await storedMenu(h)).toEqual(changed);
  });

  it('keeps a newer edit when the read of an earlier one lands after it (R06.21)', async () => {
    const reads = heldReads();
    let landed = 0;
    const h = await openAppSettings({
      hash: HASH,
      sources: reads.wrap,
      wrap: (real) => ({
        ...real,
        setMenuLayout: async (layout) => {
          const stored = await real.setMenuLayout(layout);
          landed += 1;
          return stored;
        },
      }),
    });
    h.mount(<MenuEditorPage />);
    await untilShown(PAGE);
    reads.hold();

    click('menuEditor.method.barcode.remove');
    // The first edit is stored; the read that brings it back is slow.
    await settle(() => landed === 1 && reads.held() === 1);
    click('menuEditor.method.camera.remove');
    await settle(() => landed === 2);

    // The slow read lands, with Camera still in it; the next read is held in turn.
    reads.letGo();
    await settle(() => reads.held() === 1);
    expect(drawn().groups[0]).toEqual([groupNames.snapScan, [methods.library]]);
    expect(drawn().hidden).toEqual([methods.camera, methods.barcode]);

    reads.letGo(true);
    const edited = layoutOf([
      ['snapScan', 'snapScan', ['library']],
      ['describe', 'describe', ['describe', 'manual']],
      ['reuse', 'reuse', ['recent', 'often', 'saved', 'copyDay']],
    ]);
    await untilStored(h, edited);
    await settle(() => reads.held() === 0);
    expect(drawn().groups[0]).toEqual([groupNames.snapScan, [methods.library]]);
  });

  it('keeps an edit whose write is still on its way when a change from elsewhere is read (R06.21)', async () => {
    const write = deferred<void>();
    let reads = 0;
    const h = await openAppSettings({
      hash: HASH,
      sources: (real) => ({
        ...real,
        settingsRepo: {
          loaded: real.settingsRepo.loaded,
          snapshot: () =>
            real.settingsRepo.snapshot().then((values) => {
              reads += 1;
              return values;
            }),
        },
      }),
      wrap: (real) => ({
        ...real,
        setMenuLayout: async (layout) => {
          await write.promise;
          return real.setMenuLayout(layout);
        },
      }),
    });
    h.mount(<MenuEditorPage />);
    await untilShown(PAGE);
    const before = reads;

    click('menuEditor.method.copyDay.remove');
    // Another tab stores its menu first; it is read while this page's write still waits.
    await act(() => h.repos.settingsRepo.set('menu.layout', { ...layoutOf([], ['camera']) }));
    await settle(() => reads > before);
    expect(groupCount()).toHaveAttribute('aria-valuenow', '3');
    expect(drawn().hidden).toEqual([methods.copyDay]);

    // The page's write lands after it, so the page's menu is the stored one.
    write.resolve();
    await untilStored(h, withoutCopyDay());
    expect(groupCount()).toHaveAttribute('aria-valuenow', '3');
    expect(drawn().hidden).toEqual([methods.copyDay]);
  });

  it('takes a change made elsewhere, such as in another tab or by a restore', async () => {
    const h = await openEditor();

    await act(() => h.repos.settingsRepo.set('menu.layout', { ...layoutOf([], ['camera']) }));
    await until(() => drawn().groups.length === 0);

    expect(groupCount()).toHaveAttribute('aria-valuenow', '0');
    expect(drawn().loose).toEqual([methods.camera]);
  });

  it('rebuilds the default groups going from 0 to 1 when nothing is on the menu', async () => {
    const h = await openEditor(layoutOf([]));
    expect(groupCount()).toHaveAttribute('aria-valuenow', '0');
    expect(drawn().groups).toEqual([]);
    expect(drawn().loose).toEqual([]);
    expect(drawn().hidden).toHaveLength(9);

    moreGroups();

    expect(groupCount()).toHaveAttribute('aria-valuenow', '1');
    expect(drawn()).toEqual({
      groups: [[groupNames.snapScan, [methods.camera, methods.library, methods.barcode]]],
      loose: [],
      hidden: [
        methods.describe,
        methods.manual,
        methods.recent,
        methods.often,
        methods.saved,
        methods.copyDay,
      ],
    });
    await h.saved(layoutOf([['snapScan', 'snapScan', ['camera', 'library', 'barcode']]]));
  });

  it('wraps the loose methods in one group going from 0 to 1, and adds empty groups after it', async () => {
    const h = await openEditor(layoutOf([], ['manual', 'camera']));

    moreGroups();
    expect(drawn().groups).toEqual([[groupNames.unnamed, [methods.manual, methods.camera]]]);
    await h.saved(layoutOf([['g1', '', ['manual', 'camera']]]));

    moreGroups();
    expect(drawn().groups).toEqual([
      [groupNames.unnamed, [methods.manual, methods.camera]],
      [groupNames.unnamed, []],
    ]);
    expect(within(hook('menuEditor.group.g2')).getByText(words.emptyGroup)).toBeVisible();
    // The empty group is not stored, and stays on the page.
    await h.saved(layoutOf([['g1', '', ['manual', 'camera']]]));
    expect(drawn().groups).toHaveLength(2);
  });

  it('puts every method straight on the menu at 0, and going down drops the last group', async () => {
    const h = await openEditor();

    fewerGroups();
    expect(drawn().groups.map(([name]) => name)).toEqual([
      groupNames.snapScan,
      groupNames.describe,
    ]);
    expect(drawn().hidden).toEqual([methods.recent, methods.often, methods.saved, methods.copyDay]);
    await h.saved(withoutReuse());

    fireEvent.keyDown(groupCount(), { key: 'Home' });
    expect(groupCount()).toHaveAttribute('aria-valuenow', '0');
    expect(drawn().groups).toEqual([]);
    expect(drawn().loose).toEqual([
      methods.camera,
      methods.library,
      methods.barcode,
      methods.describe,
      methods.manual,
    ]);
    await h.saved(layoutOf([], ['camera', 'library', 'barcode', 'describe', 'manual']));
  });

  it('stores a name renamed to blank as the generic label, and the typed text trimmed', async () => {
    const h = await openEditor();
    const field = 'menuEditor.group.describe.name';

    type(field, '  Words  ');
    expect(hook(field)).toHaveValue('  Words  ');
    expect(drawn().groups[1]?.[0]).toBe('Words');
    await h.saved(renamedDescribe('Words'));
    // The field keeps the text as typed after the tidied name comes back from the store.
    expect(hook(field)).toHaveValue('  Words  ');

    type(field, '   ');
    expect(hook(field)).toHaveValue('   ');
    expect(drawn().groups[1]?.[0]).toBe(groupNames.unnamed);
    await h.saved(renamedDescribe(''));
    expect(hook(field)).toHaveValue('   ');
    expect(drawn().groups[1]?.[0]).toBe(groupNames.unnamed);
  });

  it('keeps an empty group and its typed name while editing, and stores them once it has a method', async () => {
    const h = await openEditor(layoutOf([['a', 'Snap', ['camera']]], ['manual']));

    moreGroups();
    type('menuEditor.group.g1.name', ' Lunch ');
    expect(drawn().groups).toEqual([
      ['Snap', [methods.camera]],
      ['Lunch', []],
    ]);
    expect(hook('menuEditor.group.g1.name')).toHaveValue(' Lunch ');
    // An empty group is never stored.
    await h.saved(layoutOf([['a', 'Snap', ['camera']]], ['manual']));

    click('menuEditor.group.g1.add');
    fireEvent.click(screen.getByRole('option', { name: methods.recent }));

    expect(screen.queryByRole('listbox', { name: words.addMethod })).toBeNull();
    expect(drawn().groups[1]).toEqual(['Lunch', [methods.recent]]);
    await h.saved(
      layoutOf(
        [
          ['a', 'Snap', ['camera']],
          ['g1', 'Lunch', ['recent']],
        ],
        ['manual'],
      ),
    );
    expect(hook('menuEditor.group.g1.name')).toHaveValue(' Lunch ');
  });

  it('moves a method from one group to another, keeping it once', async () => {
    const h = await openEditor();

    click('menuEditor.method.barcode.remove');
    expect(drawn().hidden).toEqual([methods.barcode]);
    click('menuEditor.group.reuse.add');
    expect(
      within(screen.getByRole('listbox', { name: words.addMethod }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([methods.barcode]);
    fireEvent.click(screen.getByRole('option', { name: methods.barcode }));

    expect(drawn()).toEqual({
      groups: [
        [groupNames.snapScan, [methods.camera, methods.library]],
        [groupNames.describe, [methods.describe, methods.manual]],
        [
          groupNames.reuse,
          [methods.recent, methods.often, methods.saved, methods.copyDay, methods.barcode],
        ],
      ],
      loose: null,
      hidden: null,
    });
    await h.saved(
      layoutOf([
        ['snapScan', 'snapScan', ['camera', 'library']],
        ['describe', 'describe', ['describe', 'manual']],
        ['reuse', 'reuse', ['recent', 'often', 'saved', 'copyDay', 'barcode']],
      ]),
    );
  });

  it('moves methods and groups up and down', async () => {
    const h = await openEditor();

    click('menuEditor.method.copyDay.up');
    click('menuEditor.group.reuse.up');
    click('menuEditor.method.camera.down');

    expect(drawn().groups).toEqual([
      [groupNames.snapScan, [methods.library, methods.camera, methods.barcode]],
      [groupNames.reuse, [methods.recent, methods.often, methods.copyDay, methods.saved]],
      [groupNames.describe, [methods.describe, methods.manual]],
    ]);
    await h.saved(
      layoutOf([
        ['snapScan', 'snapScan', ['library', 'camera', 'barcode']],
        ['reuse', 'reuse', ['recent', 'often', 'copyDay', 'saved']],
        ['describe', 'describe', ['describe', 'manual']],
      ]),
    );
  });

  it('puts a hidden method back straight on the menu when there are no groups, or by Add method', async () => {
    const h = await openEditor(layoutOf([], ['manual']));

    press(t('settings.menuEditor.restore', { name: methods.copyDay }));
    expect(drawn().loose).toEqual([methods.manual, methods.copyDay]);
    click('menuEditor.loose.add');
    fireEvent.click(screen.getByRole('option', { name: methods.camera }));
    expect(drawn().loose).toEqual([methods.manual, methods.copyDay, methods.camera]);
    await h.saved(layoutOf([], ['manual', 'copyDay', 'camera']));
  });

  it('takes Copy a day off the + menu when hidden and brings it back when put back (ACC-J5-1)', async () => {
    const h = await openAppSettings({ hash: HASH });
    await h.repos.profileRepo.save(makeProfile());
    h.mount(
      <>
        <HomePage />
        <MenuEditorPage />
      </>,
    );
    await untilShown('[data-ui="home.add"]');
    await untilShown(PAGE);
    const reuseRows = () => screen.getAllByRole('menuitem').map((row) => row.textContent);
    const openReuse = () => {
      fireEvent.click(screen.getByRole('button', { name: home.home.add.label }));
      fireEvent.click(screen.getByRole('menuitem', { name: groupNames.reuse }));
    };
    const closeMenu = () => {
      for (let step = 0; step < 3 && screen.queryByRole('menu'); step++) {
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      }
      expect(screen.queryByRole('menu')).toBeNull();
    };
    openReuse();
    expect(reuseRows()).toContain(methods.copyDay);
    closeMenu();

    click('menuEditor.method.copyDay.remove');
    await untilStored(h, withoutCopyDay());
    openReuse();
    // Home reads the stored menu; an open menu follows it.
    await until(() => !reuseRows().includes(methods.copyDay));
    expect(reuseRows()).toEqual([methods.recent, methods.often, methods.saved, menuBack()]);
    closeMenu();

    press(t('settings.menuEditor.restore', { name: methods.copyDay }));
    await untilStored(h, DEFAULT_MENU_LAYOUT);
    openReuse();
    await until(() => reuseRows().includes(methods.copyDay));
    expect(reuseRows()).toEqual([
      methods.recent,
      methods.often,
      methods.saved,
      methods.copyDay,
      menuBack(),
    ]);
  });

  it('brings back the three default groups on Reset', async () => {
    const h = await openEditor(layoutOf([['a', 'Mine', ['manual']]], ['camera']));
    expect(groupCount()).toHaveAttribute('aria-valuenow', '1');

    press(words.reset);

    expect(groupCount()).toHaveAttribute('aria-valuenow', '3');
    expect(drawn()).toEqual({ groups: DEFAULT_DRAWN, loose: null, hidden: null });
    await h.saved(DEFAULT_MENU_LAYOUT);
    expect(await h.repos.settingsRepo.get('menu.layout')).toBeNull();
  });

  it('says so when a change is not stored, and goes back to the stored menu', async () => {
    const save = deferred<never>();
    const h = await openAppSettings({
      hash: HASH,
      wrap: (real) => ({ ...real, setMenuLayout: () => save.promise }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.mount(<MenuEditorPage />);
    await untilShown(PAGE);

    click('menuEditor.method.copyDay.remove');
    expect(drawn().hidden).toEqual([methods.copyDay]);

    save.reject(new Error('disk full'));
    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByText(appSettings.appSettings.saveFailed)).toBeVisible();
    expect(logged).toHaveBeenCalledOnce();
    expect(drawn()).toEqual({ groups: DEFAULT_DRAWN, loose: null, hidden: null });
    expect(await h.repos.settingsRepo.get('menu.layout')).toBeNull();
  });
});

function withoutReuse(): AddMenuLayout {
  return { ...DEFAULT_MENU_LAYOUT, groups: DEFAULT_MENU_LAYOUT.groups.slice(0, 2) };
}

function withoutCopyDay(): AddMenuLayout {
  return layoutOf([
    ['snapScan', 'snapScan', ['camera', 'library', 'barcode']],
    ['describe', 'describe', ['describe', 'manual']],
    ['reuse', 'reuse', ['recent', 'often', 'saved']],
  ]);
}

function renamedDescribe(name: string): AddMenuLayout {
  return layoutOf([
    ['snapScan', 'snapScan', ['camera', 'library', 'barcode']],
    ['describe', name, ['describe', 'manual']],
    ['reuse', 'reuse', ['recent', 'often', 'saved', 'copyDay']],
  ]);
}

/** The Back row of a menu page. */
function menuBack(): string {
  return t('display.menu.back');
}
