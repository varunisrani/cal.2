import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import {
  ADD_METHODS,
  DEFAULT_MENU_LAYOUT,
  isOffered,
  type AddMenuLayout,
  type MenuGroup,
  type OfferedMethod,
} from '../../domain/food/addMenu';
import type { Fast } from '../../domain/model';
import { display } from '../../i18n/en/display';
import { enPartitions } from '../../i18n/en';
import { menu } from '../../i18n/en/menu';
import { trackers as trackerWords } from '../../i18n/en/trackers';
import { lintCatalogue } from '../../i18n/lint';
import { ServicesProvider } from '../../services/context';
import { createFastingService, type FastingService } from '../../services/fasting';
import { createWaterService } from '../../services/water';
import { FACTORY_NOW, makeFast } from '../../test/factories';
import { closeHarnesses, openHarness } from '../../test/screenHarness';
import { ToastProvider } from '../../ui/Toast';
import { settle } from '../water/testing/openWater';
import { AddMenu, METHODS_NOT_BUILT_YET, type AddMenuProps, type AddMenuTrackers } from './AddMenu';

afterEach(async () => {
  cleanup();
  await closeHarnesses();
});

const words = menu.menu;
const BACK = display.display.menu.back;
const LABEL = 'Add food';

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

/** Draws the menu; every step (a label scan cleared, a method chosen) lands in `steps`. */
function mount(layout: AddMenuLayout, extra: Partial<AddMenuProps> = {}) {
  const steps: string[] = [];
  const clearArmedLabelScan = vi.fn(() => void steps.push('clear'));
  const onChoose = vi.fn((method: OfferedMethod) => void steps.push(method));
  render(
    <AddMenu
      label={LABEL}
      layout={layout}
      clearArmedLabelScan={clearArmedLabelScan}
      onChoose={onChoose}
      data-ui="home.add"
      {...extra}
    />,
    { wrapper: ToastProvider },
  );
  return { steps, clearArmedLabelScan, onChoose };
}

const button = () => screen.getByRole('button', { name: LABEL });
const rowNames = () => screen.getAllByRole('menuitem').map((row) => row.textContent);
const open = () => fireEvent.click(button());
const row = (name: string) => screen.getByRole('menuitem', { name });

describe('AddMenu', () => {
  it("draws the default menu's three groups as pages with their methods and Back (ACC-D3-2)", () => {
    mount(DEFAULT_MENU_LAYOUT, { withheld: [] });
    open();
    expect(rowNames()).toEqual([words.group.snapScan, words.group.describe, words.group.reuse]);
    expect(row(words.group.snapScan)).toHaveAttribute('data-ui', 'home.add.group.snapScan');
    expect(row(words.group.snapScan)).toHaveAttribute('aria-haspopup', 'menu');

    fireEvent.click(row(words.group.snapScan));
    expect(rowNames()).toEqual([
      words.method.camera,
      words.method.library,
      words.method.barcode,
      BACK,
    ]);
    fireEvent.click(row(BACK));
    fireEvent.click(row(words.group.describe));
    expect(rowNames()).toEqual([words.method.describe, words.method.manual, BACK]);
    fireEvent.click(row(BACK));
    fireEvent.click(row(words.group.reuse));
    expect(rowNames()).toEqual([
      words.method.recent,
      words.method.often,
      words.method.saved,
      words.method.copyDay,
      BACK,
    ]);
    expect(row(words.method.saved)).toHaveAttribute('data-ui', 'home.add.saved');
  });

  it('holds nothing back by default, and leaves off a withheld method and a group it leaves empty', () => {
    expect(METHODS_NOT_BUILT_YET).toEqual([]);
    mount(DEFAULT_MENU_LAYOUT, { withheld: ['barcode'] });
    open();
    expect(rowNames()).toEqual([words.group.snapScan, words.group.describe, words.group.reuse]);
    fireEvent.click(row(words.group.snapScan));
    expect(rowNames()).toEqual([words.method.camera, words.method.library, BACK]);
    cleanup();
    mount(layoutOf([['g1', 'Scan', ['barcode']]], ['manual']), { withheld: ['barcode'] });
    open();
    expect(rowNames()).toEqual([words.method.manual]);
  });
  it('clears an armed label scan before every method it hands on (R02.20)', () => {
    const offered = ADD_METHODS.filter(isOffered);
    const { steps, onChoose } = mount(layoutOf([], offered), { withheld: [] });
    for (const method of offered) {
      open();
      fireEvent.click(row(words.method[method]));
    }
    expect(onChoose).toHaveBeenCalledTimes(9);
    expect(steps).toEqual(offered.flatMap((method) => ['clear', method]));
  });

  it('opens a method from inside its group page and closes the menu', () => {
    const { steps } = mount(DEFAULT_MENU_LAYOUT);
    open();
    fireEvent.click(row(words.group.describe));
    fireEvent.click(row(words.method.manual));
    expect(steps).toEqual(['clear', 'manual']);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('draws loose methods under the groups, after a hairline', () => {
    mount(layoutOf([['g1', 'Snacks', ['camera']]], ['manual', 'describe']));
    open();
    expect(rowNames()).toEqual(['Snacks', words.method.manual, words.method.describe]);
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    expect(row(words.method.manual)).toHaveAttribute('data-ui', 'home.add.manual');
  });

  it('draws a flat menu when there are no groups', () => {
    const { steps } = mount(layoutOf([], ['describe', 'camera']));
    open();
    expect(rowNames()).toEqual([words.method.describe, words.method.camera]);
    expect(screen.queryByRole('separator')).toBeNull();
    fireEvent.click(row(words.method.camera));
    expect(steps).toEqual(['clear', 'camera']);
  });

  it("names groups by the person's text, a preset's label, or the generic label when blank", () => {
    mount(
      layoutOf([
        ['a', 'Breakfast things', ['camera']],
        ['b', 'describe', ['describe']],
        ['c', '', ['manual']],
      ]),
    );
    open();
    expect(rowNames()).toEqual(['Breakfast things', words.group.describe, words.group.unnamed]);
  });

  it('never shows the reserved voice, and draws no button when nothing is left to offer', () => {
    mount(layoutOf([['g1', 'Talk', ['voice']]], ['voice', 'recent']), { withheld: ['recent'] });
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    mount({ version: 1, groups: [], loose: [] });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws its words from a catalogue partition that passes the lint', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    mount(DEFAULT_MENU_LAYOUT, { withheld: [] });
    expect(button()).toHaveAttribute('data-ui', 'home.add');
    open();
    for (const group of ['snapScan', 'describe', 'reuse'] as const) {
      fireEvent.click(row(words.group[group]));
      for (const name of rowNames()) expect(name).not.toBe('');
      fireEvent.click(row(BACK));
    }
  });
});

// ---- Water and fasting (P07-08) -----------------------------------------------------------------

const tracker = words.tracker;
const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';
const HOUR = 60 * 60 * 1000;
const WATER_PAGE = '[data-ui="water.menu"]';

/** The trackers as Home hands them over: both off and no fast unless `over` says otherwise. */
function trackersWith(over: Partial<AddMenuTrackers> = {}): AddMenuTrackers {
  return {
    day: TODAY,
    waterOn: false,
    fastingOn: false,
    activeFast: null,
    onCustomWater: vi.fn(),
    onStartFast: vi.fn(),
    ...over,
  };
}

const separators = () => screen.queryAllByRole('separator');
const toast = (): string => document.querySelector('[data-ui="toast.message"]')?.textContent ?? '';

/**
 * Waits for a piece fetched on first open (the water page), with Testing Library's `waitFor`: a
 * wait held inside act would hold back the lazy piece's first draw (see src/test/lazy.ts).
 */
async function untilDrawn(selector: string): Promise<void> {
  await waitFor(() => {
    if (document.querySelector(selector) === null) throw new Error(`${selector} not drawn yet`);
  });
}

/**
 * The menu over a fresh test database with the real water and fasting services; `fasts` are
 * stored as they are before it is drawn.
 */
async function openTrackers(
  over: Partial<AddMenuTrackers> = {},
  options: { fasts?: readonly Fast[]; wrap?: (real: FastingService) => FastingService } = {},
) {
  const h = await openHarness();
  const { settingsRepo, waterRepo, fastRepo, diaryRepo } = h.repos;
  if (options.fasts) await h.db.fasts.bulkPut([...options.fasts]);
  const real = createFastingService({ fastRepo, diaryRepo, settingsRepo, clock: h.clock });
  const fasting = options.wrap ? options.wrap(real) : real;
  const water = createWaterService({ waterRepo, settingsRepo, clock: h.clock });
  const given = trackersWith(over);
  h.mount(
    <ServicesProvider services={{ ...h.services, water, fasting }}>
      <AddMenu
        label={LABEL}
        layout={DEFAULT_MENU_LAYOUT}
        clearArmedLabelScan={vi.fn()}
        onChoose={vi.fn()}
        trackers={given}
        data-ui="home.add"
      />
    </ServicesProvider>,
  );
  return { ...h, fasting, trackers: given };
}

/** The ml of the water logs of `day`. */
async function waterOn(h: Awaited<ReturnType<typeof openTrackers>>, day: DayKey) {
  return (await h.repos.waterRepo.byDay(day)).map((log) => log.ml);
}

describe('AddMenu: water and fasting (P07-08)', () => {
  // The water page is fetched on first open: load it before any wait.
  beforeAll(async () => {
    await import('../water/WaterMenuPage');
  });

  it('adds no hairline and no tracker row while water and fasting are off', () => {
    mount(DEFAULT_MENU_LAYOUT, { trackers: trackersWith() });
    open();

    expect(rowNames()).toEqual([words.group.snapScan, words.group.describe, words.group.reuse]);
    expect(separators()).toEqual([]);
  });

  it('offers Water, then Start fast, under a hairline while each is tracked (ACC-H1-1, ACC-H6-1)', () => {
    const given = trackersWith({ waterOn: true, fastingOn: true });
    mount(DEFAULT_MENU_LAYOUT, { trackers: given });
    open();

    expect(rowNames()).toEqual([
      words.group.snapScan,
      words.group.describe,
      words.group.reuse,
      tracker.water,
      tracker.startFast,
    ]);
    expect(separators()).toHaveLength(1);
    expect(row(tracker.water)).toHaveAttribute('aria-haspopup', 'menu');
    expect(row(tracker.water)).toHaveAttribute('data-ui', 'home.add.water');
    expect(row(tracker.startFast)).not.toHaveAttribute('aria-haspopup');

    fireEvent.click(row(tracker.startFast));
    expect(given.onStartFast).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the tracker rows alone, without a hairline, when the layout offers no food', () => {
    mount({ version: 1, groups: [], loose: [] }, { trackers: trackersWith({ fastingOn: true }) });
    open();

    expect(rowNames()).toEqual([tracker.startFast]);
    expect(separators()).toEqual([]);
  });

  it('shows only Water and Fasting while a fast runs: no food group or method (ACC-F11-2)', () => {
    const running = makeFast({ end: null });
    mount(DEFAULT_MENU_LAYOUT, {
      withheld: [],
      trackers: trackersWith({ waterOn: true, fastingOn: true, activeFast: running }),
    });
    open();

    expect(rowNames()).toEqual([tracker.water, tracker.fasting]);
    expect(separators()).toEqual([]);
    fireEvent.click(row(tracker.fasting));
    expect(rowNames()).toEqual([tracker.endFast, tracker.cancelFast, BACK]);
    fireEvent.click(row(BACK));
    expect(rowNames()).toEqual([tracker.water, tracker.fasting]);

    cleanup();
    mount(DEFAULT_MENU_LAYOUT, {
      trackers: trackersWith({ fastingOn: true, activeFast: running }),
    });
    open();
    expect(rowNames()).toEqual([tracker.fasting]);
  });

  it('keeps Fasting while a fast runs with fasting switched off, and never offers Start fast then (R05.2)', () => {
    mount(DEFAULT_MENU_LAYOUT, {
      trackers: trackersWith({ fastingOn: false, activeFast: makeFast({ end: null }) }),
    });
    open();

    expect(rowNames()).toEqual([tracker.fasting]);
    expect(screen.queryByRole('menuitem', { name: tracker.startFast })).toBeNull();
  });

  it('opens the water page inside the menu, where a preset logs on the day shown at once (ACC-F11-1, ACC-H1-1)', async () => {
    const h = await openTrackers({ waterOn: true, day: YESTERDAY });
    open();
    fireEvent.click(row(tracker.water));
    await untilDrawn(WATER_PAGE);

    const page = within(screen.getByRole('menu', { name: tracker.water }));
    fireEvent.click(page.getByRole('button', { name: '500 ml' }));

    await settle(() => screen.queryByRole('menu') === null);
    expect(toast()).toBe('500 ml of water logged');
    expect(await waterOn(h, YESTERDAY)).toEqual([500]);
    expect(await waterOn(h, TODAY)).toEqual([]);
  });

  it('closes on Custom amount and hands it to Home; Back on the page returns to the top', async () => {
    const h = await openTrackers({ waterOn: true });
    open();
    fireEvent.click(row(tracker.water));
    await untilDrawn(WATER_PAGE);

    fireEvent.click(screen.getByRole('button', { name: display.display.menu.back }));
    expect(rowNames()).toEqual([
      words.group.snapScan,
      words.group.describe,
      words.group.reuse,
      tracker.water,
    ]);

    fireEvent.click(row(tracker.water));
    await untilDrawn(WATER_PAGE);
    fireEvent.click(screen.getByRole('button', { name: trackerWords.trackers.water.menu.custom }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(h.trackers.onCustomWater).toHaveBeenCalledTimes(1);
    expect(await waterOn(h, TODAY)).toEqual([]);
  });

  it('ends the running fast at once from Fasting, End fast', async () => {
    const running = makeFast({ start: FACTORY_NOW - 3 * HOUR, end: null });
    const h = await openTrackers({ fastingOn: true, activeFast: running }, { fasts: [running] });
    const end = vi.spyOn(h.fasting, 'end');
    open();
    fireEvent.click(row(tracker.fasting));
    fireEvent.click(row(tracker.endFast));

    // No confirmation: the menu closes and the fast ends.
    expect(screen.queryByRole('menu')).toBeNull();
    expect(end).toHaveBeenCalledWith(running.id);
    await act(async () => {
      await end.mock.results[0]?.value;
    });
    expect(await h.repos.fastRepo.list()).toEqual([{ ...running, end: FACTORY_NOW }]);
    expect(toast()).toBe('');
  });

  it('cancels the running fast at once from Fasting, Cancel fast: it leaves no history', async () => {
    const running = makeFast({ start: FACTORY_NOW - 3 * HOUR, end: null });
    const h = await openTrackers({ fastingOn: true, activeFast: running }, { fasts: [running] });
    const cancel = vi.spyOn(h.fasting, 'cancel');
    open();
    fireEvent.click(row(tracker.fasting));
    fireEvent.click(row(tracker.cancelFast));

    expect(screen.queryByRole('menu')).toBeNull();
    await act(async () => {
      await cancel.mock.results[0]?.value;
    });
    expect(await h.repos.fastRepo.list()).toEqual([]);
  });

  it('says so and changes nothing when the fast had already ended elsewhere', async () => {
    const stored = makeFast({ start: FACTORY_NOW - 3 * HOUR, end: FACTORY_NOW - HOUR });
    // Home still shows it running: the end came from another tab.
    await openTrackers(
      { fastingOn: true, activeFast: { ...stored, end: null } },
      { fasts: [stored] },
    );
    open();
    fireEvent.click(row(tracker.fasting));
    fireEvent.click(row(tracker.endFast));

    await settle(() => toast() !== '');
    expect(toast()).toBe(tracker.gone);
  });

  it('says so when the fast cannot be changed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const running = makeFast({ end: null });
    await openTrackers(
      { fastingOn: true, activeFast: running },
      {
        fasts: [running],
        wrap: (real) => ({ ...real, cancel: () => Promise.reject(new Error('disk')) }),
      },
    );
    open();
    fireEvent.click(row(tracker.fasting));
    fireEvent.click(row(tracker.cancelFast));

    await settle(() => toast() !== '');
    expect(toast()).toBe(tracker.failed);
  });
});
