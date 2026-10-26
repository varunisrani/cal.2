import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { log } from '../../i18n/en/log';
import { FACTORY_NOW, makeEntry, makeProfile } from '../../test/factories';
import { HomePage, MANUAL_SHEET } from './HomePage';
import { closeHarnesses, openHarness, untilGone, untilShown } from '../../test/screenHarness';

afterEach(closeHarnesses);

const words = home.home;
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
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([words.add.manual]);
    expect(items[0]).toHaveAttribute('data-ui', 'home.add.manual');

    fireEvent.click(items[0] as HTMLElement);
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
    fireEvent.click(screen.getByRole('menuitem', { name: words.add.manual }));
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
