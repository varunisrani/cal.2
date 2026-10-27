import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capture } from '../../i18n/en/capture';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { log } from '../../i18n/en/log';
import { menu } from '../../i18n/en/menu';
import type { AnalysisService, AnalysisState } from '../../services/analysis';
import type { CaptureDraft, CaptureDraftService } from '../../services/captureDrafts';
import { ServicesProvider, type Services } from '../../services/context';
import { createCopyDayService } from '../../services/copyDay';
import type { PhotoService } from '../../services/photos';
import { FACTORY_NOW, makeEntry, makeProfile } from '../../test/factories';
import { reuse } from '../../i18n/en/reuse';
import {
  CAPTURE_SHEET,
  COPY_DAY_SHEET,
  DESCRIBE_SHEET,
  HomePage,
  MANUAL_SHEET,
  OFTEN_SHEET,
  RECENT_SHEET,
  SAVED_SHEET,
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
