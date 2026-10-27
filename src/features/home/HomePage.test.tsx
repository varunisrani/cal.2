import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Dexie } from 'dexie';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '../../ai/testing/fakeFetch';
import { DataProvider } from '../../data/DataProvider';
import { createDraftsRepo } from '../../data/repos/draftsRepo';
import { createHealthRepo } from '../../data/repos/healthRepo';
import { createPhotoRepo } from '../../data/repos/photoRepo';
import { createSecretsRepo } from '../../data/repos/secretsRepo';
import { capture } from '../../i18n/en/capture';
import { common } from '../../i18n/en/common';
import { fasting as fastingWords } from '../../i18n/en/fasting';
import { home } from '../../i18n/en/home';
import { log } from '../../i18n/en/log';
import { menu } from '../../i18n/en/menu';
import { scan } from '../../i18n/en/scan';
import { err } from '../../lib/result';
import {
  createAnalysisService,
  type AnalysisService,
  type AnalysisState,
} from '../../services/analysis';
import type { Scanner } from '../../services/barcode/decoder';
import { createBarcodeService } from '../../services/barcode/lookup';
import { OFF_PRODUCT_URL } from '../../services/barcode/off';
import type { CaptureDraft, CaptureDraftService } from '../../services/captureDrafts';
import { ServicesProvider, type Services } from '../../services/context';
import { createCombineService } from '../../services/combine';
import { createCopyDayService } from '../../services/copyDay';
import { createDiaryService } from '../../services/diary';
import { createFastingService } from '../../services/fasting';
import { createHomePrefsService } from '../../services/homePrefs';
import type { DailyTotals, ExerciseSession } from '../../services/health/contract';
import { createHealthService } from '../../services/health/service';
import { fakeHealthPlugin } from '../../services/health/testing/fakeHealthPlugin';
import { health as healthWords } from '../../i18n/en/health';
import { formatDay } from '../../i18n/format';
import type { PhotoService } from '../../services/photos';
import { FACTORY_NOW, makeEntry, makeFast, makeProfile } from '../../test/factories';
import { reuse } from '../../i18n/en/reuse';
import { review } from '../../i18n/en/review';
import { trackers } from '../../i18n/en/trackers';
import { createWaterService } from '../../services/water';
import { editor as editorWords } from '../../i18n/en/editor';
import { settle as settleTasks } from '../water/testing/openWater';
import { LONG_PRESS_MS } from './EntryRow';
import { SELECT_SHEET } from './useSelection';
import { AnalysisReview } from '../log/review/ReviewSheet';
import {
  CAPTURE_SHEET,
  COPY_DAY_SHEET,
  DESCRIBE_SHEET,
  FAST_SHEET,
  EDITOR_SHEET,
  HomePage,
  MANUAL_SHEET,
  OFTEN_SHEET,
  RECENT_SHEET,
  SAVED_SHEET,
  SCAN_SHEET,
} from './HomePage';
import {
  closeHarnesses,
  openHarness,
  until,
  untilGone,
  untilShown,
  type Harness,
} from '../../test/screenHarness';

afterEach(closeHarnesses);

const words = home.home;
const menuWords = menu.menu;
const HOUR = 60 * 60 * 1000;

/** The text of the element `data-ui` names, or '' when there is none. */
function textOf(hook: string): string {
  return document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';
}

describe('HomePage', () => {
  it("draws no number until the profile, the settings and the day's entries are read (R05.12)", async () => {
    let releaseProfile = (): void => undefined;
    const profileRead = new Promise<void>((resolve) => {
      releaseProfile = resolve;
    });
    const h = await openHarness({
      sources: (real) => ({
        ...real,
        profileRepo: { get: () => profileRead.then(() => real.profileRepo.get()) },
      }),
    });
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    await h.repos.diaryRepo.add(makeEntry({ kcal: 640, loggedAt: FACTORY_NOW - HOUR }));
    h.mount(<HomePage />);

    // The settings and the entries are read meanwhile; only the profile is held back.
    await act(async () => {
      await h.repos.settingsRepo.loaded;
      await h.repos.diaryRepo.byDay('2026-10-26');
    });
    const page = screen.getByRole('heading', { level: 1, name: common.common.tabs.home })
      .parentElement as HTMLElement;
    expect(page).toHaveAttribute('aria-busy', 'true');
    expect(page.textContent).toBe(common.common.tabs.home);
    expect(page.textContent).not.toMatch(/\d/);
    expect(screen.queryByRole('button', { name: words.add.label })).toBeNull();

    releaseProfile();
    await untilShown('[data-ui="home.gauge"]');
    expect(textOf('home.gauge')).toContain('640');
    expect(textOf('home.gauge')).toContain('1,360 left');
    expect(page).not.toHaveAttribute('aria-busy');
  });

  it("shows the stored goal and today's entries in the gauge, the pillars and the diary", async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    await h.repos.diaryRepo.addMany([
      makeEntry({
        name: 'Porridge',
        kcal: 300,
        meal: 'breakfast',
        loggedAt: FACTORY_NOW - 4 * HOUR,
      }),
      makeEntry({ name: 'Lentil soup', kcal: 900, meal: 'lunch', loggedAt: FACTORY_NOW }),
      // Another day: not on today's page.
      makeEntry({ name: 'Pizza', kcal: 800, meal: 'dinner', loggedAt: FACTORY_NOW - 24 * HOUR }),
    ]);
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.gauge"]');

    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}1,200800 left`);
    expect(document.querySelectorAll('[data-ui^="home.pillar."]')).toHaveLength(4);
    const breakfast = document.querySelector<HTMLElement>('[data-ui="home.meal.breakfast"]');
    const lunch = document.querySelector<HTMLElement>('[data-ui="home.meal.lunch"]');
    expect(breakfast && within(breakfast).getByText('Porridge')).toBeTruthy();
    expect(lunch && within(lunch).getByText('Lentil soup')).toBeTruthy();
    expect(document.querySelector('[data-ui="home.meal.dinner"]')).toBeNull();
    expect(screen.queryByText('Pizza')).toBeNull();
  });

  it('shows the empty card on a day with nothing logged (ACC-F10-1)', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile());
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.diary.empty"]');

    expect(textOf('home.diary.empty')).toBe(words.diary.empty);
    expect(screen.getByRole('heading', { level: 2, name: words.diary.today })).toBeVisible();
    expect(textOf('home.gauge')).toContain('0');
  });

  it('offers Enter manually in the + menu, which opens the manual sheet over Home (ACC-D3-1)', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile());
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.add"]');

    const add = screen.getByRole('button', { name: words.add.label });
    expect(add).toHaveAttribute('data-ui', 'home.add');
    fireEvent.click(add);
    const groups = screen.getAllByRole('menuitem');
    expect(groups.map((item) => item.textContent)).toEqual([
      menuWords.group.snapScan,
      menuWords.group.describe,
      menuWords.group.reuse,
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: menuWords.group.describe }));
    const manualRow = screen.getByRole('menuitem', { name: menuWords.method.manual });
    expect(manualRow).toHaveAttribute('data-ui', 'home.add.manual');

    fireEvent.click(manualRow);
    await untilShown('[data-ui="manual.name"]');
    expect(screen.getByRole('dialog', { name: log.log.manual.title })).toBeVisible();
    expect(h.router.current().sheets).toEqual([MANUAL_SHEET]);
  });

  it('logs a manual entry that appears under its meal, with the gauge and the totals updated', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.add"]');
    fireEvent.click(screen.getByRole('button', { name: words.add.label }));
    fireEvent.click(screen.getByRole('menuitem', { name: menuWords.group.describe }));
    fireEvent.click(screen.getByRole('menuitem', { name: menuWords.method.manual }));
    await untilShown('[data-ui="manual.name"]');

    const sheet = within(screen.getByRole('dialog', { name: log.log.manual.title }));
    fireEvent.change(sheet.getByLabelText(log.log.manual.name), { target: { value: 'Toast' } });
    fireEvent.change(sheet.getByLabelText(log.log.manual.energy.kcal), {
      target: { value: '250' },
    });
    fireEvent.click(sheet.getByRole('button', { name: common.common.save }));
    await untilShown('[data-ui="home.meal.lunch"]');
    await untilGone('[data-ui="manual"]');

    const lunch = document.querySelector<HTMLElement>('[data-ui="home.meal.lunch"]');
    expect(lunch && within(lunch).getByRole('group', { name: 'Toast 250 kcal' })).toBeTruthy();
    expect(textOf('home.meal.lunch.totals')).toContain('250 kcal');
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}2501,750 left`);
    expect(h.router.current().sheets).toEqual([]);
    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([
      expect.objectContaining({ name: 'Toast', kcal: 250, meal: 'lunch', source: 'manual' }),
    ]);
  });

  it('deletes an entry once confirmed and shows the empty card again', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile());
    await h.repos.diaryRepo.add(makeEntry({ name: 'Toast', kcal: 250 }));
    h.mount(<HomePage />);
    await untilShown('[data-ui="entry.row.delete"]');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Toast' }));
    const dialog = screen.getByRole('alertdialog', { name: words.entry.deleteTitle });
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.delete }));
    await untilShown('[data-ui="home.diary.empty"]');

    expect(screen.queryByText('Toast')).toBeNull();
    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([]);
  });

  it('says so when the day cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = await openHarness({
      sources: (real) => ({
        ...real,
        diaryRepo: { ...real.diaryRepo, byDay: () => Promise.reject(new Error('disk')) },
      }),
    });
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.error"]');

    expect(textOf('home.error')).toBe(words.loadFailed);
    expect(document.querySelector('[data-ui="home.gauge"]')).toBeNull();
  });
});

// ---- The selected day (P07-01, P07-02) ---------------------------------------------------------

const weekBar = () => screen.getByRole('radiogroup', { name: words.week.label });
const dayTile = (day: string) => within(weekBar()).getByRole('radio', { name: dayName(day) });
/** A tile's accessible name: the full date, as the week bar reads it. */
const dayName = (day: string) => formatDay(day, 'long');

/** Presses on the element `hook` names, moves `dx` px sideways in four steps, and lets go. */
function swipeOn(hook: string, dx: number) {
  const region = document.querySelector<HTMLElement>(`[data-ui="${hook}"]`);
  if (!region) throw new Error(`Nothing to swipe: ${hook}`);
  fireEvent.pointerDown(region, { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
  for (let step = 1; step <= 4; step++) {
    fireEvent.pointerMove(region, { pointerId: 1, clientX: 200 + (dx * step) / 4, clientY: 100 });
  }
  fireEvent.pointerUp(region, { pointerId: 1, clientX: 200 + dx, clientY: 100, button: 0 });
}

/** Home over the harness with one entry on each named day. */
async function openWithDays(days: Readonly<Record<string, string>>) {
  const h = await openHarness();
  await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
  await h.repos.diaryRepo.addMany(
    Object.entries(days).map(([day, name], index) =>
      makeEntry({ name, kcal: 100 * (index + 2), loggedAt: Date.parse(`${day}T13:00:00-04:00`) }),
    ),
  );
  return h;
}

describe('HomePage: the selected day (P07-01, P07-02)', () => {
  it("shows the week bar on today, and last Monday's diary and summary once it is selected (ACC-F1-1)", async () => {
    const h = await openWithDays({ '2026-10-26': 'Porridge', '2026-10-19': 'Pasta' });
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.week"]');
    await until(() => screen.queryByText('Porridge') !== null);
    expect(dayTile('2026-10-26')).toHaveAttribute('aria-checked', 'true');
    expect(dayTile('2026-10-27')).toBeDisabled();
    const bar = weekBar();

    fireEvent.click(dayTile('2026-10-19'));
    await until(() => screen.queryByText('Pasta') !== null);

    expect(screen.queryByText('Porridge')).toBeNull();
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}3001,700 left`);
    expect(screen.getByRole('heading', { level: 2, name: words.diary.day })).toBeVisible();
    expect(dayTile('2026-10-19')).toHaveAttribute('aria-checked', 'true');
    expect(dayTile('2026-10-26')).toHaveAttribute('aria-current', 'date');
    expect(h.appState.getSnapshot().selectedDay).toBe('2026-10-19');
    // The page stayed while the day was read: the bar was not drawn again.
    expect(weekBar()).toBe(bar);
  });

  it('shows yesterday after a swipe toward the right on the summary; toward the left on today does nothing (ACC-F2-1)', async () => {
    const h = await openWithDays({ '2026-10-26': 'Porridge', '2026-10-25': 'Pizza' });
    h.mount(<HomePage />);
    await until(() => screen.queryByText('Porridge') !== null);

    swipeOn('home.swipe', -120);
    // The diary is not part of the swipe.
    swipeOn('home.diary', 120);
    await act(async () => undefined);
    expect(h.appState.getSnapshot().selectedDay).toBeNull();
    expect(screen.getByText('Porridge')).toBeVisible();

    swipeOn('home.swipe', 120);
    await until(() => screen.queryByText('Pizza') !== null);
    expect(screen.queryByText('Porridge')).toBeNull();
    expect(dayTile('2026-10-25')).toHaveAttribute('aria-checked', 'true');

    swipeOn('home.swipe', -120);
    await until(() => screen.queryByText('Porridge') !== null);
    expect(h.appState.getSnapshot().selectedDay).toBeNull();
  });

  it('logs a manual entry on yesterday at the current clock time while yesterday is shown', async () => {
    const h = await openWithDays({ '2026-10-25': 'Pizza' });
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.week"]');
    fireEvent.click(dayTile('2026-10-25'));
    await until(() => screen.queryByText('Pizza') !== null);

    fireEvent.click(screen.getByRole('button', { name: words.add.label }));
    fireEvent.click(screen.getByRole('menuitem', { name: menuWords.group.describe }));
    fireEvent.click(screen.getByRole('menuitem', { name: menuWords.method.manual }));
    await untilShown('[data-ui="manual.name"]');
    const sheet = within(screen.getByRole('dialog', { name: log.log.manual.title }));
    fireEvent.change(sheet.getByLabelText(log.log.manual.name), { target: { value: 'Toast' } });
    fireEvent.change(sheet.getByLabelText(log.log.manual.energy.kcal), {
      target: { value: '250' },
    });
    fireEvent.click(sheet.getByRole('button', { name: common.common.save }));
    await until(() => screen.queryByText('Toast') !== null);

    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([]);
    // Newest first: Pizza was logged at 13:00 that day.
    expect(await h.repos.diaryRepo.byDay('2026-10-25')).toEqual([
      expect.objectContaining({ name: 'Pizza' }),
      expect.objectContaining({
        name: 'Toast',
        meal: 'lunch',
        loggedAt: Date.parse('2026-10-25T12:30:00-04:00'),
      }),
    ]);
  });

  it('logs a pick from Recent on the day shown, at the current clock time (P06-12)', async () => {
    const h = await openWithDays({ '2026-10-23': 'Lentil soup' });
    const analysis = createAnalysisService({
      draftsRepo: createDraftsRepo(h.db),
      photoRepo: createPhotoRepo(h.db),
      settingsRepo: h.repos.settingsRepo,
      secretsRepo: createSecretsRepo(h.db),
      overlay: h.appState,
      fetch: () => Promise.reject(new Error('No request is expected here')),
      clock: h.clock,
    });
    h.mount(
      <ServicesProvider services={{ ...h.services, analysis, photos }}>
        <HomePage />
        <AnalysisReview />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="home.week"]');
    fireEvent.click(dayTile('2026-10-25'));
    await until(() => dayTile('2026-10-25').getAttribute('aria-checked') === 'true');
    await untilShown('[data-ui="home.diary.empty"]');
    chooseFromMenu('reuse', menuWords.method.recent);
    await untilShown('[data-ui="reuse.row.pick"]');

    fireEvent.click(document.querySelector('[data-ui="reuse.row.pick"]') as HTMLElement);
    await untilShown('[data-ui="review.amount"]');
    expect(document.querySelector('[data-ui="review.when.date"]')).toHaveValue('2026-10-25');
    fireEvent.click(screen.getByRole('button', { name: review.review.log }));
    await untilGone('[data-ui="home.diary.empty"]');

    expect(await h.repos.diaryRepo.byDay('2026-10-25')).toEqual([
      expect.objectContaining({
        name: 'Lentil soup',
        meal: 'lunch',
        loggedAt: Date.parse('2026-10-25T12:30:00-04:00'),
      }),
    ]);
    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([]);
  });

  it('copies a day onto the day shown, starting from the day before it', async () => {
    const h = await openWithDays({ '2026-10-24': 'Lentil soup', '2026-10-25': 'Pizza' });
    const services: Services = {
      ...h.services,
      copyDay: createCopyDayService({ diaryRepo: h.repos.diaryRepo, clock: h.clock }),
    };
    h.mount(
      <ServicesProvider services={services}>
        <HomePage />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="home.week"]');
    fireEvent.click(dayTile('2026-10-25'));
    await until(() => screen.queryByText('Pizza') !== null);
    chooseFromMenu('reuse', menuWords.method.copyDay);
    await untilShown('[data-ui="copyDay.all"]');

    fireEvent.click(screen.getByRole('button', { name: 'Copy 1 food' }));
    await until(() => screen.queryByText('Lentil soup') !== null);

    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([]);
    expect(await h.repos.diaryRepo.byDay('2026-10-25')).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Lentil soup' })]),
    );
  });
});

// ---- Pillars and the day's nutrients (P07-03, P07-04) -------------------------------------------

/** Home over the harness with the pillars' store wired in, as `main.tsx` does. */
async function openWithPillars() {
  const h = await openHarness();
  await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
  const services: Services = {
    ...h.services,
    homePrefs: createHomePrefsService({ settingsRepo: h.repos.settingsRepo }),
  };
  const mount = () =>
    h.mount(
      <ServicesProvider services={services}>
        <HomePage />
      </ServicesProvider>,
    );
  return { h, mount };
}

const shownPillars = () =>
  Array.from(document.querySelectorAll('[data-ui^="home.pillar."]')).map((node) =>
    node.getAttribute('data-ui'),
  );
const nutrientsSheet = () => screen.getByRole('dialog', { name: words.nutrients.title });
const pillarPicker = () => screen.getByRole('dialog', { name: words.picker.title });

describe("HomePage: pillars and the day's nutrients (P07-03, P07-04)", () => {
  it("shows the stored pillars, then water with the shown day's logs while it is tracked (ACC-H4-1)", async () => {
    const { h, mount } = await openWithPillars();
    await h.repos.settingsRepo.set('home.pillars', ['sodium', 'protein']);
    await h.repos.diaryRepo.add(
      makeEntry({ kcal: 500, nutrients: { sodium: 2_500 }, loggedAt: FACTORY_NOW - HOUR }),
    );
    await h.repos.waterRepo.add({ at: FACTORY_NOW - 2 * HOUR, ml: 500 });
    await h.repos.waterRepo.add({ at: FACTORY_NOW - HOUR, ml: 250 });
    await h.repos.waterRepo.add({ at: FACTORY_NOW - 24 * HOUR, ml: 1_000 });
    mount();
    await untilShown('[data-ui="home.pillar.sodium"]');

    // Water tracking is off by default: no water pillar.
    expect(shownPillars()).toEqual(['home.pillar.sodium', 'home.pillar.protein']);
    expect(screen.getByRole('group', { name: words.pillar.sodium })).toHaveAccessibleDescription(
      '2,500 200 mg over',
    );

    await act(async () => {
      await h.repos.settingsRepo.set('water.on', true);
    });
    await untilShown('[data-ui="home.pillar.water"]');
    expect(shownPillars()).toEqual([
      'home.pillar.sodium',
      'home.pillar.protein',
      'home.pillar.water',
    ]);
    expect(screen.getByRole('group', { name: words.pillar.water })).toHaveAccessibleDescription(
      '750 1,250 ml left',
    );
    // Water never enters the food totals (R05.4).
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}5001,500 left`);

    fireEvent.click(dayTile('2026-10-25'));
    await until(() => textOf('home.pillar.water').startsWith('1,000'));
    expect(screen.getByRole('group', { name: words.pillar.water })).toHaveAccessibleDescription(
      '1,000 1,000 ml left',
    );
  });

  it("opens the shown day's nutrients from All nutrients: yesterday's while yesterday is shown (ACC-F6-1)", async () => {
    const { h, mount } = await openWithPillars();
    await h.repos.diaryRepo.addMany([
      makeEntry({ kcal: 300, nutrients: { sodium: 400 }, loggedAt: FACTORY_NOW - HOUR }),
      makeEntry({
        kcal: 700,
        protein: 40,
        nutrients: { sodium: 1_900, potassium: 650 },
        loggedAt: FACTORY_NOW - 24 * HOUR,
      }),
    ]);
    mount();
    await untilShown('[data-ui="home.week"]');
    fireEvent.click(dayTile('2026-10-25'));
    await until(() => textOf('home.gauge').startsWith(`${words.gauge.heading.kcal}700`));

    fireEvent.click(screen.getByRole('button', { name: words.nutrients.link }));
    await untilShown('[data-ui="home.nutrients"]');

    expect(h.router.current().sheets).toEqual(['nutrients']);
    expect(within(nutrientsSheet()).getByText(dayName('2026-10-25'))).toBeVisible();
    expect(textOf('home.nutrients.row.energy')).toBe('Calories 700 kcal / 2,000 kcal');
    expect(textOf('home.nutrients.row.sodium')).toBe('Sodium 1,900 mg / 2,300 mg');
    expect(textOf('home.nutrients.row.potassium')).toBe('Potassium 650 mg / 3,500 mg');
    expect(textOf('home.nutrients.row.protein')).toMatch(/^Protein 40 g \/ \d+ g$/);

    fireEvent.click(within(nutrientsSheet()).getByRole('button', { name: common.common.done }));
    await untilGone('[data-ui="home.nutrients"]');
    expect(h.router.current().sheets).toEqual([]);
  });

  it('chooses pillars over the sheet: Done stores them and Home shows them (ACC-F5-1)', async () => {
    const { h, mount } = await openWithPillars();
    mount();
    await untilShown('[data-ui="home.allNutrients"]');
    fireEvent.click(screen.getByRole('button', { name: words.nutrients.link }));
    await untilShown('[data-ui="home.nutrients"]');

    fireEvent.click(within(nutrientsSheet()).getByRole('button', { name: /Choose pillars/ }));
    await untilShown('[data-ui="home.picker"]');
    expect(h.router.current().sheets).toEqual(['nutrients', 'pillars']);
    // A fifth pick takes the place of the latest one.
    fireEvent.click(within(pillarPicker()).getByRole('checkbox', { name: words.pillar.sodium }));
    await act(async () => {
      fireEvent.click(within(pillarPicker()).getByRole('button', { name: common.common.done }));
    });
    await untilGone('[data-ui="home.picker"]');

    expect(await h.repos.settingsRepo.get('home.pillars')).toEqual([
      'protein',
      'carbs',
      'fat',
      'sodium',
    ]);
    expect(h.router.current().sheets).toEqual(['nutrients']);
    await until(() => shownPillars().includes('home.pillar.sodium'));
    expect(shownPillars()).toEqual([
      'home.pillar.protein',
      'home.pillar.carbs',
      'home.pillar.fat',
      'home.pillar.sodium',
    ]);
    expect(
      within(nutrientsSheet()).getByRole('button', { name: /Choose pillars/ }),
    ).toHaveTextContent('Protein, Carbs, Fat, Sodium');
  });

  it('leaves the stored pillars as they were on Cancel, and opens again from them', async () => {
    const { h, mount } = await openWithPillars();
    await h.repos.settingsRepo.set('home.pillars', ['iron', 'zinc']);
    mount();
    await untilShown('[data-ui="home.pillar.iron"]');
    fireEvent.click(screen.getByRole('button', { name: words.nutrients.link }));
    await untilShown('[data-ui="home.nutrients"]');
    fireEvent.click(within(nutrientsSheet()).getByRole('button', { name: /Choose pillars/ }));
    await untilShown('[data-ui="home.picker"]');

    fireEvent.click(within(pillarPicker()).getByRole('button', { name: words.picker.reset }));
    fireEvent.click(within(pillarPicker()).getByRole('button', { name: common.common.cancel }));
    await untilGone('[data-ui="home.picker"]');

    expect(await h.repos.settingsRepo.get('home.pillars')).toEqual(['iron', 'zinc']);
    expect(shownPillars()).toEqual(['home.pillar.iron', 'home.pillar.zinc']);
    expect(nutrientsSheet()).toBeVisible();

    fireEvent.click(within(nutrientsSheet()).getByRole('button', { name: /Choose pillars/ }));
    await untilShown('[data-ui="home.picker"]');
    const ticked = within(pillarPicker())
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => box.getAttribute('data-ui'));
    expect(ticked).toEqual(['home.picker.option.iron', 'home.picker.option.zinc']);
  });
});

// ---- The add menu's sheets (P06-01) ------------------------------------------------------------

const NO_DRAFT: CaptureDraft = { photoIds: [], note: '', progressive: false };

/** A capture draft service that holds `draft` and records the rest. */
function captureStandIn(draft: CaptureDraft = NO_DRAFT) {
  return {
    load: vi.fn(() => Promise.resolve(draft)),
    add: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  } satisfies CaptureDraftService;
}

/** An analysis service stuck in `state`, recording what it is asked. */
function analysisStandIn(state: AnalysisState = { phase: 'idle' }) {
  return {
    getSnapshot: () => state,
    subscribe: () => () => undefined,
    start: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
    retry: vi.fn(() => Promise.resolve()),
    closeReview: vi.fn(() => Promise.resolve()),
    restore: vi.fn(() => Promise.resolve()),
  } satisfies AnalysisService;
}

/** Photos that never show (their cards keep an empty frame). */
const photos: PhotoService = {
  store: vi.fn(),
  thumbnail: () => Promise.resolve(null),
  preview: () => Promise.resolve(null),
  viewer: () => Promise.resolve(null),
};

/** Home over the harness, with the logging services the add menu's sheets use. */
async function openHome(
  draft: CaptureDraft = NO_DRAFT,
  state?: AnalysisState,
): Promise<{
  h: Harness;
  captureDrafts: ReturnType<typeof captureStandIn>;
  analysis: ReturnType<typeof analysisStandIn>;
}> {
  const h = await openHarness();
  await h.repos.profileRepo.save(makeProfile());
  const captureDrafts = captureStandIn(draft);
  const analysis = analysisStandIn(state);
  const services: Services = { ...h.services, photos, captureDrafts, analysis };
  h.mount(
    <ServicesProvider services={services}>
      <HomePage />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="home.add"]');
  return { h, captureDrafts, analysis };
}

/** Opens "+", then the group, then the method. */
function chooseFromMenu(group: keyof typeof menuWords.group, method: string) {
  fireEvent.click(screen.getByRole('button', { name: words.add.label }));
  fireEvent.click(screen.getByRole('menuitem', { name: menuWords.group[group] }));
  fireEvent.click(screen.getByRole('menuitem', { name: method }));
}

const captureSheet = () => screen.getByRole('dialog', { name: capture.capture.title });

describe('HomePage: the add menu opens its sheets (P06-01)', () => {
  it('opens the meal-photos sheet from Camera, its Add photo taking one photo with the camera', async () => {
    const { h } = await openHome();
    chooseFromMenu('snapScan', menuWords.method.camera);
    await untilShown('[data-ui="capture.add"]');

    expect(captureSheet()).toBeVisible();
    expect(h.router.current().sheets).toEqual([CAPTURE_SHEET]);
    expect(
      within(captureSheet()).getByRole('button', { name: capture.capture.addPhoto }),
    ).toBeVisible();
  });

  it('opens the meal-photos sheet from Photo library, its Add photos picking several', async () => {
    const { h } = await openHome();
    chooseFromMenu('snapScan', menuWords.method.library);
    await untilShown('[data-ui="capture.add"]');

    expect(h.router.current().sheets).toEqual([CAPTURE_SHEET]);
    expect(
      within(captureSheet()).getByRole('button', { name: capture.capture.addPhotos }),
    ).toBeVisible();
  });

  it('opens the describe sheet from Describe', async () => {
    const { h } = await openHome();
    chooseFromMenu('describe', menuWords.method.describe);
    await untilShown('[data-ui="describe.text"]');

    expect(screen.getByRole('dialog', { name: capture.capture.describe.title })).toBeVisible();
    expect(h.router.current().sheets).toEqual([DESCRIBE_SHEET]);
  });

  it('brings the meal-photos sheet back when Home opens with photos in the capture draft (D-16.46)', async () => {
    const draft = { photoIds: ['p1', 'p2', 'p3'], note: 'no butter', progressive: false };
    const { h } = await openHome(draft);
    await until(() => document.querySelectorAll('[data-ui="capture.card"]').length === 3);

    expect(textOf('capture.count')).toBe('3 of 10 photos');
    expect(h.router.current().sheets).toEqual([CAPTURE_SHEET]);
  });

  it('leaves the sheet closed when the capture draft holds no photo', async () => {
    const { h, captureDrafts } = await openHome({ ...NO_DRAFT, note: 'a note only' });
    await act(async () => {
      await captureDrafts.load.mock.results[0]?.value;
    });
    expect(captureDrafts.load).toHaveBeenCalledTimes(1);
    expect(h.router.current().sheets).toEqual([]);
  });

  it('leaves the sheet closed when an analysis has already taken over', async () => {
    const analysing: AnalysisState = { phase: 'analysing', kind: 'photo', photoIds: ['p1'] };
    const { h, captureDrafts } = await openHome({ ...NO_DRAFT, photoIds: ['p1'] }, analysing);
    await act(async () => {
      await captureDrafts.load.mock.results[0]?.value;
    });
    expect(captureDrafts.load).toHaveBeenCalledTimes(1);
    expect(h.router.current().sheets).toEqual([]);
  });

  it('starts a photo analysis with the photos, the note and the switch on Analyse, and closes the sheet', async () => {
    const draft = { photoIds: ['p1', 'p2'], note: 'no butter', progressive: true };
    const { h, analysis } = await openHome(draft);
    await until(() => document.querySelectorAll('[data-ui="capture.card"]').length === 2);
    const analyse = within(captureSheet()).getByRole('button', { name: capture.capture.analyse });
    await until(() => !(analyse as HTMLButtonElement).disabled);

    fireEvent.click(analyse);
    expect(analysis.start).toHaveBeenCalledTimes(1);
    expect(analysis.start).toHaveBeenCalledWith('photo', {
      photoIds: ['p1', 'p2'],
      note: 'no butter',
      progressive: true,
    });
    await untilGone('[data-ui="capture"]');
    expect(h.router.current().sheets).toEqual([]);
  });

  it.each([
    [menuWords.method.recent, reuse.reuse.title.recent, RECENT_SHEET, 'reuse.recent'],
    [menuWords.method.often, reuse.reuse.title.often, OFTEN_SHEET, 'reuse.often'],
    [menuWords.method.saved, reuse.reuse.title.saved, SAVED_SHEET, 'reuse.saved'],
    [menuWords.method.copyDay, reuse.reuse.copyDay.title, COPY_DAY_SHEET, 'copyDay'],
  ])('opens %s from the Reuse group (P06-12, P06-13)', async (method, title, sheet, hook) => {
    const { h } = await openHome();
    chooseFromMenu('reuse', method);
    await untilShown(`[data-ui="${hook}"]`);

    expect(screen.getByRole('dialog', { name: title })).toBeVisible();
    expect(h.router.current().sheets).toEqual([sheet]);
  });

  it('copies a day onto the day Home shows, and the copies appear in the diary (ACC-D18-1)', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile());
    const yesterdayLunch = Date.parse('2026-10-25T13:00:00-04:00');
    await h.repos.diaryRepo.add(
      makeEntry({ name: 'Lentil soup', meal: 'lunch', loggedAt: yesterdayLunch }),
    );
    const services: Services = {
      ...h.services,
      copyDay: createCopyDayService({ diaryRepo: h.repos.diaryRepo, clock: h.clock }),
    };
    h.mount(
      <ServicesProvider services={services}>
        <HomePage />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="home.add"]');
    chooseFromMenu('reuse', menuWords.method.copyDay);
    await untilShown('[data-ui="copyDay.all"]');

    fireEvent.click(screen.getByRole('button', { name: 'Copy 1 food' }));
    await untilShown('[data-ui="home.meal.lunch"]');

    const lunch = document.querySelector<HTMLElement>('[data-ui="home.meal.lunch"]');
    expect(lunch && within(lunch).getByText('Lentil soup')).toBeTruthy();
    expect(await h.repos.diaryRepo.byDay('2026-10-25')).toHaveLength(1);
    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([
      expect.objectContaining({ name: 'Lentil soup', meal: 'lunch' }),
    ]);
  });

  it('draws the stored layout', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile());
    await h.repos.settingsRepo.set('menu.layout', {
      version: 1,
      groups: [],
      loose: ['manual', 'camera'],
    });
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.add"]');

    fireEvent.click(screen.getByRole('button', { name: words.add.label }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      menuWords.method.manual,
      menuWords.method.camera,
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: menuWords.method.manual }));
    await untilShown('[data-ui="manual.name"]');
    expect(h.router.current().sheets).toEqual([MANUAL_SHEET]);
  });
});

// ---- Barcodes (P06-14, P06-17) -----------------------------------------------------------------

const scanWords = scan.scan;
const CODE = '0712345000108';
const OFF_MISS = { status: 404, json: { status: 0 } };
const OFF_FOUND = {
  json: {
    status: 1,
    product: {
      product_name: 'Rye Crackers',
      serving_quantity: 25,
      nutriments: {
        'energy-kcal_100g': 410,
        proteins_100g: 11,
        carbohydrates_100g: 68,
        fat_100g: 9,
      },
    },
  },
};

/** A camera that is never there: these tests type the digits. */
const noCamera: Scanner = {
  openCamera: () => Promise.resolve(err('unavailable')),
  watch: () => () => undefined,
};

/**
 * Home with the real barcode service over the harness's database and a scripted Open Food Facts.
 * The capture draft is empty when Home opens and holds `labelPhotos` once the sheet opens.
 */
async function openHomeWithBarcodes(labelPhotos: readonly string[] = []) {
  const h = await openHarness();
  await h.repos.profileRepo.save(makeProfile());
  const fake = fakeFetch();
  const captureDrafts = captureStandIn();
  captureDrafts.load
    .mockResolvedValueOnce(NO_DRAFT)
    .mockResolvedValue({ ...NO_DRAFT, photoIds: labelPhotos });
  const analysis = analysisStandIn();
  const draftsRepo = createDraftsRepo(h.db);
  const barcode = createBarcodeService({
    fetch: fake.fetch,
    secretsRepo: createSecretsRepo(h.db),
    diaryRepo: h.repos.diaryRepo,
    draftsRepo,
    photoRepo: createPhotoRepo(h.db),
    photos,
    openReview: analysis.restore,
    unnamed: (code) => `Barcode ${code}`,
    scanner: noCamera,
  });
  const services: Services = { ...h.services, photos, captureDrafts, analysis, barcode };
  h.mount(
    <ServicesProvider services={services}>
      <HomePage />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="home.add"]');
  return { h, fake, analysis, barcode, draftsRepo };
}

/**
 * Lets promise callbacks run and draws what they changed. A plain state update made from a promise
 * waits for the end of an act scope, so `until` alone would wait for it forever.
 */
const settle = () => act(async () => undefined);

/** Opens the scanner from the menu and types `digits` into it. */
async function typeBarcode(digits: string) {
  chooseFromMenu('snapScan', menuWords.method.barcode);
  await settle();
  const field = screen.getByRole('textbox', { name: scanWords.digits.label });
  fireEvent.change(field, { target: { value: digits } });
  fireEvent.click(screen.getByRole('button', { name: scanWords.digits.submit }));
}

/** A miss, then "Scan label" on its failure: the meal-photos sheet opens for the label. */
async function scanLabelAfterMiss() {
  await typeBarcode(CODE);
  await untilShown('[data-ui="scan.failed"]');
  fireEvent.click(screen.getByRole('button', { name: scanWords.scanLabel }));
  await untilShown('[data-ui="capture.add"]');
  await settle();
}

describe('HomePage: barcodes (P06-14, P06-17)', () => {
  it('opens the scanner from Barcode in the menu (P06-14)', async () => {
    const { h } = await openHomeWithBarcodes();
    chooseFromMenu('snapScan', menuWords.method.barcode);
    await settle();

    expect(screen.getByRole('dialog', { name: scanWords.title })).toBeVisible();
    expect(textOf('scan.unavailable')).toBe(scanWords.unavailable);
    expect(h.router.current().sheets).toEqual([SCAN_SHEET]);
  });

  it('closes the scanner on typed digits, and a product found opens its review (ACC-D20-1)', async () => {
    const { h, fake, analysis, draftsRepo } = await openHomeWithBarcodes();
    fake.on(OFF_PRODUCT_URL, OFF_FOUND);

    await typeBarcode('0 71234 50001 08');
    await untilGone('[data-ui="scan"]');
    await untilGone('[data-ui="scan.looking"]');

    expect(h.router.current().sheets).toEqual([]);
    expect(new URL(fake.requests[0]?.url ?? '').pathname).toBe(`/api/v2/product/${CODE}.json`);
    expect(analysis.restore).toHaveBeenCalledOnce();
    expect((await draftsRepo.load())?.draft.draft.name).toBe('Rye Crackers');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('offers Scan label after a miss, and the label photo runs as that product’s label (ACC-D20-2, R02.20)', async () => {
    const { h, fake, analysis } = await openHomeWithBarcodes(['label-photo']);
    fake.on(OFF_PRODUCT_URL, OFF_MISS);

    await scanLabelAfterMiss();

    expect(h.router.current().sheets).toEqual([CAPTURE_SHEET]);
    // The label's photo comes from the camera.
    expect(
      within(captureSheet()).getByRole('button', { name: capture.capture.addPhoto }),
    ).toBeVisible();
    expect(document.querySelectorAll('[data-ui="capture.card"]')).toHaveLength(1);
    const analyse = within(captureSheet()).getByRole('button', { name: capture.capture.analyse });
    expect(analyse).toBeEnabled();
    fireEvent.click(analyse);

    expect(analysis.start).toHaveBeenCalledWith('photo', {
      photoIds: ['label-photo'],
      note: '',
      progressive: false,
      armedLabel: CODE,
    });
  });

  it('shows the miss’s own message on its failure', async () => {
    const { fake } = await openHomeWithBarcodes();
    fake.on(OFF_PRODUCT_URL, OFF_MISS);

    await typeBarcode(CODE);
    await untilShown('[data-ui="scan.failed"]');

    expect(screen.getByRole('alertdialog', { name: scanWords.failedTitle })).toHaveTextContent(
      scanWords.failure.notFound,
    );
  });

  it('drops the held code when the photos sheet closes without Analyse, by Cancel or Back (R02.20)', async () => {
    const { h, fake, barcode } = await openHomeWithBarcodes(['label-photo']);
    fake.on(OFF_PRODUCT_URL, OFF_MISS, OFF_MISS);

    await scanLabelAfterMiss();
    fireEvent.click(within(captureSheet()).getByRole('button', { name: common.common.cancel }));
    await untilGone('[data-ui="capture"]');
    expect(barcode.takeArmedLabel()).toBeNull();

    await scanLabelAfterMiss();
    act(() => h.host.back());
    await untilGone('[data-ui="capture"]');
    expect(barcode.takeArmedLabel()).toBeNull();
  });

  it('drops a held code when another method is chosen from the menu (R02.20)', async () => {
    const { fake, barcode } = await openHomeWithBarcodes();
    fake.on(OFF_PRODUCT_URL, OFF_MISS);
    await act(() => barcode.lookup(CODE));
    act(() => {
      barcode.armLabelScan();
    });
    await untilGone('[data-ui="scan.failed"]');

    chooseFromMenu('describe', menuWords.method.describe);
    await untilShown('[data-ui="describe.text"]');

    expect(barcode.takeArmedLabel()).toBeNull();
  });
});

// ---- Water and fasts in the diary and the + menu (P07-05, P07-08) -------------------------------

/** Home over the harness with the sort, water and fasting services wired in, as `main.tsx` does. */
async function openWithTrackers(setup: { water?: boolean; fasting?: boolean } = {}) {
  const h = await openHarness();
  const { settingsRepo, waterRepo, fastRepo, diaryRepo } = h.repos;
  await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
  if (setup.water !== undefined) await settingsRepo.set('water.on', setup.water);
  if (setup.fasting !== undefined) await settingsRepo.set('fasting.on', setup.fasting);
  const services: Services = {
    ...h.services,
    homePrefs: createHomePrefsService({ settingsRepo }),
    water: createWaterService({ waterRepo, settingsRepo, clock: h.clock }),
    fasting: createFastingService({ fastRepo, diaryRepo, settingsRepo, clock: h.clock }),
  };
  const mount = async () => {
    h.mount(
      <ServicesProvider services={services}>
        <HomePage />
      </ServicesProvider>,
    );
    await untilShown('[data-ui="home.diary"]');
  };
  return { h, mount };
}

/** 26 October 2026 (or `day`) at `hh:mm` in the test zone. */
const atTime = (time: string, day = '2026-10-26') => Date.parse(`${day}T${time}:00-04:00`);

/** Each meal section's name and its rows' names (food, Water, a fast's title), top to bottom. */
function diaryLayout(): string[][] {
  return Array.from(document.querySelectorAll<HTMLElement>('section[data-ui^="home.meal."]')).map(
    (section) => [
      section.querySelector('h3')?.textContent ?? '',
      ...Array.from(section.querySelectorAll('li')).map(
        (item) => item.querySelector('[id$="-name"], [id$="-title"]')?.textContent ?? '',
      ),
    ],
  );
}

/**
 * Waits for a sheet fetched on first open, with Testing Library's `waitFor`: a wait held inside
 * act would hold back the lazy sheet's first draw (see src/test/lazy.ts).
 */
async function untilDrawn(selector: string): Promise<void> {
  await waitFor(() => {
    if (document.querySelector(selector) === null) throw new Error(`${selector} not drawn yet`);
  });
}

const addButton = () => screen.getByRole('button', { name: words.add.label });
const menuRows = () => screen.getAllByRole('menuitem').map((item) => item.textContent);
const meals = log.log.meal;
const tracker = menuWords.tracker;

describe('HomePage: water and fasts (P07-05, P07-08)', () => {
  // The water page and the trackers' sheets are fetched on first open: load them before any wait.
  beforeAll(async () => {
    await Promise.all([
      import('../water/WaterMenuPage'),
      import('../water/CustomWaterSheet'),
      import('../fasting/StartFastSheet'),
      import('../fasting/FastEditor'),
    ]);
  });

  it("shows the day's water and fasts with both trackers off, a fast over midnight on its end day only, and no tracker in the menu (R05.9, R05.21, ACC-F8-1)", async () => {
    const { h, mount } = await openWithTrackers();
    await h.repos.waterRepo.add({ at: atTime('10:00'), ml: 500 });
    await h.repos.waterRepo.add({ at: atTime('13:00', '2026-10-25'), ml: 1_000 });
    await h.db.fasts.bulkPut([
      // Over midnight: on the day it ended only (R05.21).
      makeFast({ start: atTime('18:00', '2026-10-25'), end: atTime('10:30'), goalMin: 960 }),
      makeFast({ start: atTime('20:00', '2026-10-24'), end: atTime('12:00', '2026-10-25') }),
    ]);
    await mount();

    expect(diaryLayout()).toEqual([[meals.breakfast, '16h 30m fast', words.water.title]]);
    expect(document.querySelector('[data-ui="home.meal.breakfast.totals"]')).toBeNull();
    fireEvent.click(addButton());
    expect(menuRows()).toEqual([
      menuWords.group.snapScan,
      menuWords.group.describe,
      menuWords.group.reuse,
    ]);
    fireEvent.click(addButton());

    fireEvent.click(dayTile('2026-10-25'));
    await until(() => diaryLayout()[0]?.[0] === meals.lunch);
    expect(diaryLayout()).toEqual([[meals.lunch, words.water.title, '16h fast']]);
  });

  it('stores the sort order from the first header; newest first shows a meal again (ACC-F7-2)', async () => {
    const { h, mount } = await openWithTrackers();
    await h.repos.diaryRepo.addMany([
      makeEntry({ name: 'Toast', meal: 'breakfast', loggedAt: atTime('08:00') }),
      makeEntry({ name: 'Soup', meal: 'lunch', loggedAt: atTime('12:00') }),
      makeEntry({ name: 'Apple', meal: 'breakfast', loggedAt: atTime('12:20') }),
    ]);
    await mount();
    expect(diaryLayout()).toEqual([
      [meals.breakfast, 'Apple', 'Toast'],
      [meals.lunch, 'Soup'],
    ]);

    const sort = screen.getAllByRole('button', { name: words.sort.label });
    expect(sort).toHaveLength(1);
    fireEvent.click(sort[0] as HTMLElement);
    fireEvent.click(screen.getByRole('menuitemradio', { name: words.sort.newestFirst }));

    await until(() => diaryLayout().length === 3);
    expect(diaryLayout()).toEqual([
      [meals.breakfast, 'Apple'],
      [meals.lunch, 'Soup'],
      [meals.breakfast, 'Toast'],
    ]);
    expect(await h.repos.settingsRepo.get('home.sort')).toBe('newestFirst');
  });

  it("opens the fast editor over Home from a fast's row", async () => {
    const { h, mount } = await openWithTrackers();
    await h.db.fasts.put(makeFast({ start: atTime('00:00'), end: atTime('09:00'), goalMin: 540 }));
    await mount();

    fireEvent.click(screen.getByRole('button', { name: '9h fast' }));
    await untilDrawn('[data-ui="fast.editor"]');

    expect(
      screen.getByRole('dialog', { name: fastingWords.fasting.editor.titleDone }),
    ).toBeVisible();
    expect(h.router.current().sheets).toEqual([FAST_SHEET]);
    fireEvent.click(screen.getByRole('button', { name: common.common.cancel }));
    await untilGone('[data-ui="fast.editor"]');
    expect(h.router.current().sheets).toEqual([]);
  });

  it('asks before deleting a water row and removes it once confirmed (ACC-F9-1)', async () => {
    const { h, mount } = await openWithTrackers({ water: true });
    await h.repos.waterRepo.add({ at: atTime('09:00'), ml: 500 });
    await mount();

    fireEvent.click(screen.getByRole('button', { name: 'Delete 500 ml of water' }));
    const dialog = screen.getByRole('alertdialog', { name: words.water.deleteTitle });
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.delete }));

    await untilShown('[data-ui="home.diary.empty"]');
    expect(await h.repos.waterRepo.byDay('2026-10-26')).toEqual([]);
  });

  it('starts a fast from the + menu; while it runs the menu holds only Fasting, which ends it (ACC-H6-1, ACC-F11-2)', async () => {
    const { h, mount } = await openWithTrackers({ fasting: true });
    await mount();

    fireEvent.click(addButton());
    expect(menuRows()).toEqual([
      menuWords.group.snapScan,
      menuWords.group.describe,
      menuWords.group.reuse,
      tracker.startFast,
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: tracker.startFast }));
    // The sheet draws its goal once the default goal is read; Start waits for it.
    await untilDrawn('[data-ui="fast.start.goal"]');
    fireEvent.click(screen.getByRole('button', { name: fastingWords.fasting.start.start }));

    await untilShown('[data-ui="fast.row"][data-running]');
    expect(diaryLayout()).toEqual([[meals.lunch, words.fast.running]]);
    fireEvent.click(addButton());
    expect(menuRows()).toEqual([tracker.fasting]);
    fireEvent.click(screen.getByRole('menuitem', { name: tracker.fasting }));
    fireEvent.click(screen.getByRole('menuitem', { name: tracker.endFast }));

    await untilGone('[data-ui="fast.row"][data-running]');
    expect(diaryLayout()).toEqual([[meals.lunch, '0m fast']]);
    expect(await h.repos.fastRepo.list()).toEqual([
      expect.objectContaining({ start: FACTORY_NOW, end: FACTORY_NOW, goalMin: 960 }),
    ]);
  });

  it("logs a custom amount from the + menu's water page on the sheet over Home (ACC-H1-1)", async () => {
    const { h, mount } = await openWithTrackers({ water: true });
    await mount();

    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole('menuitem', { name: tracker.water }));
    await untilDrawn('[data-ui="water.menu"]');
    fireEvent.click(screen.getByRole('button', { name: trackers.trackers.water.menu.custom }));
    expect(screen.queryByRole('menu')).toBeNull();
    await untilDrawn('[data-ui="water.custom"]');

    const sheet = within(
      screen.getByRole('dialog', { name: trackers.trackers.water.custom.title }),
    );
    fireEvent.change(sheet.getByLabelText(trackers.trackers.water.custom.field), {
      target: { value: '300' },
    });
    fireEvent.click(sheet.getByRole('button', { name: common.common.add }));
    await untilShown('[data-ui="water.row"]');
    expect(diaryLayout()).toEqual([[meals.lunch, words.water.title]]);
    expect(screen.getByRole('group', { name: `${words.water.title} 300 ml` })).toBeVisible();
    expect(await h.repos.waterRepo.byDay('2026-10-26')).toEqual([
      expect.objectContaining({ ml: 300, at: FACTORY_NOW }),
    ]);
  });
});

// ---- Picking rows, combining them, the editor and the heart (P06-19) ---------------------------

/** 26 October 2026 at `hh:mm` in the test zone. */
const today = (time: string) => Date.parse(`2026-10-26T${time}:00-04:00`);
const FAKED = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] as const;

/**
 * Home over this morning's toast, eggs and tea, with the diary that saves meals, the combine and
 * the fasting services wired as `main.tsx` does; optionally a fast left running since 07:00.
 */
async function openWithMorning(options: { fasting?: boolean } = {}) {
  const h = await openHarness();
  const { diaryRepo, fastRepo, settingsRepo, savedMealsRepo, profileRepo } = h.repos;
  await profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
  await diaryRepo.addMany([
    makeEntry({
      id: 'toast',
      name: 'Toast',
      kcal: 250,
      meal: 'breakfast',
      loggedAt: today('08:00'),
    }),
    makeEntry({ id: 'eggs', name: 'Eggs', kcal: 155, meal: 'breakfast', loggedAt: today('08:10') }),
    makeEntry({ id: 'tea', name: 'Tea', kcal: 30, meal: 'snack', loggedAt: today('09:30') }),
  ]);
  const running = makeFast({ id: 'running', start: today('07:00') - 60_000, end: null });
  if (options.fasting) await h.db.fasts.put(running);
  const photoRepo = createPhotoRepo(h.db);
  const services: Services = {
    ...h.services,
    diary: createDiaryService({ diaryRepo, photoRepo, savedMealsRepo }),
    combine: createCombineService({
      diaryRepo,
      photoRepo,
      words: { fallbackName: 'Plate', more: (count) => `${count} others` },
    }),
    fasting: createFastingService({ fastRepo, diaryRepo, settingsRepo, clock: h.clock }),
  };
  h.mount(
    <ServicesProvider services={services}>
      <HomePage />
    </ServicesProvider>,
  );
  await untilShown('[data-ui="home.add"]');
  return { ...h, running };
}

const selectionBar = () => screen.queryByRole('region', { name: words.selection.label });
const rowButton = (name: string) => screen.getByRole('button', { name });

/** Holds the row's tap target still for the long-press time, then lets go. */
function longPress(name: string) {
  vi.useFakeTimers({ toFake: [...FAKED] });
  try {
    const target = rowButton(`Edit ${name}`);
    fireEvent.pointerDown(target, { pointerId: 3, button: 0, clientX: 80, clientY: 20 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS);
    });
    fireEvent.pointerUp(target, { pointerId: 3, button: 0, clientX: 80, clientY: 20 });
    fireEvent.click(target);
  } finally {
    vi.useRealTimers();
  }
}

describe('HomePage: picking and combining rows (P06-19)', () => {
  it('starts picking on a long-press: the bar with the count, Cancel and Combine takes the place of "+" (ACC-F12-1)', async () => {
    const h = await openWithMorning();

    longPress('Toast');

    const bar = selectionBar();
    expect(bar).not.toBeNull();
    expect(within(bar as HTMLElement).getByText('1 selected')).toBeVisible();
    expect(
      within(bar as HTMLElement).getByRole('button', { name: words.selection.combine }),
    ).toBeDisabled();
    expect(
      within(bar as HTMLElement).getByRole('button', { name: common.common.cancel }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: words.add.label })).toBeNull();
    expect(rowButton('Select Toast')).toHaveAttribute('aria-pressed', 'true');
    expect(rowButton('Select Eggs')).toHaveAttribute('aria-pressed', 'false');
    // No editor opened with it, and nothing can be swiped away while picking.
    expect(h.router.current().sheets).toEqual([SELECT_SHEET]);
    expect(screen.queryByRole('button', { name: 'Delete Toast' })).toBeNull();
  });

  it('combines three picked rows into one entry named "Toast + Eggs + Tea" at the latest time, and the "+" comes back (ACC-D15-1, D-16.20)', async () => {
    const h = await openWithMorning();
    fireEvent.click(rowButton('Select Toast'));
    fireEvent.click(rowButton('Select Eggs'));
    fireEvent.click(rowButton('Select Tea'));
    expect(within(selectionBar() as HTMLElement).getByText('3 selected')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: words.selection.combine }));
    await settleTasks(() => screen.queryByRole('button', { name: words.add.label }) !== null);
    await until(() => screen.queryByText('Toast + Eggs + Tea') !== null);

    expect(selectionBar()).toBeNull();
    expect(h.router.current().sheets).toEqual([]);
    expect(screen.queryByRole('group', { name: 'Toast 250 kcal' })).toBeNull();
    const snack = document.querySelector<HTMLElement>('[data-ui="home.meal.snack"]');
    expect(
      snack && within(snack).getByRole('group', { name: 'Toast + Eggs + Tea 435 kcal' }),
    ).toBeTruthy();
    expect(await h.repos.diaryRepo.byDay('2026-10-26')).toEqual([
      expect.objectContaining({ name: 'Toast + Eggs + Tea', kcal: 435, loggedAt: today('09:30') }),
    ]);
  });

  it('ends picking when the last picked row is let go, on Cancel and on Back', async () => {
    const h = await openWithMorning();

    fireEvent.click(rowButton('Select Toast'));
    fireEvent.click(rowButton('Select Toast'));
    await until(() => selectionBar() === null);
    expect(h.router.current().sheets).toEqual([]);

    fireEvent.click(rowButton('Select Eggs'));
    fireEvent.click(screen.getByRole('button', { name: common.common.cancel }));
    await until(() => selectionBar() === null);
    expect(h.router.current().sheets).toEqual([]);

    fireEvent.click(rowButton('Select Tea'));
    expect(selectionBar()).not.toBeNull();
    act(() => h.host.back());
    await until(() => selectionBar() === null);
    expect(screen.getByRole('button', { name: words.add.label })).toBeVisible();
    expect(await h.repos.diaryRepo.count()).toBe(3);
  });

  it('changes nothing while a fast runs and shows the paused dialog; picking stays (R02.12)', async () => {
    const h = await openWithMorning({ fasting: true });
    fireEvent.click(rowButton('Select Toast'));
    fireEvent.click(rowButton('Select Eggs'));

    fireEvent.click(screen.getByRole('button', { name: words.selection.combine }));
    await settleTasks(
      () => screen.queryByRole('alertdialog', { name: fastingWords.fasting.paused.title }) !== null,
    );

    expect(await h.repos.diaryRepo.count()).toBe(3);
    expect(await h.repos.fastRepo.list()).toEqual([h.running]);
    expect(within(selectionBar() as HTMLElement).getByText('2 selected')).toBeVisible();
  });
});

describe('HomePage: a row opens its editor and keeps a saved copy (P06-19)', () => {
  beforeAll(async () => {
    // The editor is fetched on demand: load it once before any wait includes its transform.
    await import('../log/EntryEditor');
  });

  it('opens the entry editor on a tap, and Cancel closes it', async () => {
    const h = await openWithMorning();

    fireEvent.click(rowButton('Edit Eggs'));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: editorWords.editor.title })).toBeVisible(),
    );
    await untilShown('[data-ui="editor.name"]');

    const sheet = within(screen.getByRole('dialog', { name: editorWords.editor.title }));
    expect(sheet.getByDisplayValue('Eggs')).toBeVisible();
    expect(h.router.current().sheets).toEqual([EDITOR_SHEET]);
    fireEvent.click(sheet.getByRole('button', { name: common.common.cancel }));
    await untilGone('[data-ui="editor"]');
    expect(h.router.current().sheets).toEqual([]);
  });

  it("keeps a copy in the saved meals from the row's heart, and takes it out again", async () => {
    const h = await openWithMorning();
    await until(() => screen.queryByRole('button', { name: 'Save Tea' }) !== null);
    const heart = () => rowButton('Save Tea');
    expect(heart()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(heart());
    await until(() => heart().getAttribute('aria-pressed') === 'true');
    expect(await h.repos.savedMealsRepo.list()).toEqual([
      expect.objectContaining({ name: 'Tea', originEntryId: 'tea' }),
    ]);

    fireEvent.click(heart());
    await until(() => heart().getAttribute('aria-pressed') === 'false');
    expect(await h.repos.savedMealsRepo.list()).toEqual([]);
  });
});

describe('HomePage: Health Connect on the Android app (P11-04)', () => {
  beforeAll(async () => {
    // The card is fetched on demand: load it once before any wait includes its transform.
    await import('./ActivityCard');
  });

  const TODAY_TOTALS: DailyTotals = {
    day: '2026-10-26',
    steps: 8_040,
    activeKcal: 349.7,
    totalKcal: 2_310,
    distanceM: 6_100,
  };
  const WALK: ExerciseSession = {
    id: 'walk-1',
    day: '2026-10-26',
    start: '2026-10-26T12:00:00Z',
    end: '2026-10-26T12:30:00Z',
    type: 'walking',
    title: null,
    activeKcal: 120,
    source: 'org.example.watch',
  };

  /**
   * Home with a health service over a fake Health Connect holding today's activity, synced once
   * while connected; 1 200 kcal eaten today against a 2 000 kcal goal.
   */
  async function openWithHealth({ connected = true, counting = true } = {}) {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    await h.repos.diaryRepo.add(makeEntry({ kcal: 1_200, loggedAt: FACTORY_NOW - HOUR }));
    await h.repos.settingsRepo.set('health.connected', connected);
    await h.repos.settingsRepo.set('health.countActiveCalories', counting);
    const healthRepo = createHealthRepo(h.db);
    const health = createHealthService({
      plugin: fakeHealthPlugin({ days: [TODAY_TOTALS], sessions: [WALK] }),
      healthRepo,
      settingsRepo: h.repos.settingsRepo,
      diaryRepo: h.repos.diaryRepo,
      weightRepo: h.repos.weightRepo,
      clock: h.clock,
      visibility: { isVisible: () => true, subscribe: () => () => undefined },
      watch: () => () => undefined,
    });
    if (connected) await health.sync();
    h.mount(
      <ServicesProvider services={{ ...h.services, health }}>
        <DataProvider sources={{ ...h.sources, activityRepo: healthRepo }}>
          <HomePage />
        </DataProvider>
      </ServicesProvider>,
    );
    await untilShown('[data-ui="home.gauge"]');
    return h;
  }

  it("counts the day's active calories in the gauge, says goal + burned, and shows the activity card (ACC-M11-2)", async () => {
    await openWithHealth();
    await waitFor(() =>
      expect(screen.getByRole('region', { name: healthWords.health.home.title })).toBeVisible(),
    );

    // 2 000 + 350 = 2 350 kcal target; 1 200 eaten.
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}1,2001,150 left`);
    expect(textOf('home.burn')).toBe('2,000 goal + 350 burned');
    const card = within(screen.getByRole('region', { name: healthWords.health.home.title }));
    expect(card.getByText('8,040 steps')).toBeVisible();
    expect(card.getByText('350 kcal active')).toBeVisible();
    expect(card.getByRole('list', { name: healthWords.health.home.workouts })).toHaveTextContent(
      'Walking, 30m, 120 kcal',
    );
  });

  it('keeps the goal and shows no line while counting is off; the card stays', async () => {
    await openWithHealth({ counting: false });
    await waitFor(() =>
      expect(screen.getByRole('region', { name: healthWords.health.home.title })).toBeVisible(),
    );
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}1,200800 left`);
    expect(document.querySelector('[data-ui="home.burn"]')).toBeNull();
  });

  it('says a day without Health Connect data has none, and keeps its goal', async () => {
    await openWithHealth();
    fireEvent.click(dayTile('2026-10-25'));
    await waitFor(() => expect(screen.getByText(healthWords.health.home.empty)).toBeVisible());
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}02,000 left`);
    expect(document.querySelector('[data-ui="home.burn"]')).toBeNull();
  });

  it("draws the day and its goal when Health Connect's copy cannot be read", async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    await h.repos.settingsRepo.set('health.connected', true);
    const health = createHealthService({
      plugin: fakeHealthPlugin(),
      healthRepo: createHealthRepo(h.db),
      settingsRepo: h.repos.settingsRepo,
      diaryRepo: h.repos.diaryRepo,
      weightRepo: h.repos.weightRepo,
      clock: h.clock,
      visibility: { isVisible: () => true, subscribe: () => () => undefined },
      watch: () => () => undefined,
    });
    const activityRepo = { between: () => Dexie.Promise.reject(new Error('unreadable')) };
    h.mount(
      <ServicesProvider services={{ ...h.services, health }}>
        <DataProvider sources={{ ...h.sources, activityRepo }}>
          <HomePage />
        </DataProvider>
      </ServicesProvider>,
    );
    await untilShown('[data-ui="home.gauge"]');
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}02,000 left`);
    expect(document.querySelector('[data-ui="home.error"]')).toBeNull();
    await waitFor(() => expect(screen.getByText(healthWords.health.home.empty)).toBeVisible());
  });

  it('shows no card and counts nothing while Health Connect is not connected', async () => {
    await openWithHealth({ connected: false });
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}1,200800 left`);
    expect(document.querySelector('[data-ui="home.activity"]')).toBeNull();
    expect(document.querySelector('[data-ui="home.burn"]')).toBeNull();
  });

  it('shows no health feature without a health service, as on the web (D-16.89)', async () => {
    const h = await openHarness();
    await h.repos.profileRepo.save(makeProfile({ saved: { kcal: 2_000 } }));
    await h.repos.settingsRepo.set('health.connected', true);
    h.mount(<HomePage />);
    await untilShown('[data-ui="home.gauge"]');
    expect(textOf('home.gauge')).toBe(`${words.gauge.heading.kcal}02,000 left`);
    expect(document.querySelector('[data-ui="home.activity"]')).toBeNull();
    expect(document.querySelector('[data-ui="home.burn"]')).toBeNull();
  });
});
