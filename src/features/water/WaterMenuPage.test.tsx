import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../../domain/dates/dayKey';
import { common } from '../../i18n/en/common';
import { trackers } from '../../i18n/en/trackers';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, untilGone, untilShown } from '../../test/screenHarness';
import { openWater, settle, type WaterSetup } from './testing/openWater';
import { WaterMenuPage } from './WaterMenuPage';

afterEach(closeHarnesses);

const words = trackers.trackers.water;
const HOUR = 60 * 60 * 1000;
const PAGE = '[data-ui="water.menu"]';
const SHEET = '[data-ui="water.custom"]';
const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';

/** The toast on screen, or '' when there is none. */
const toast = (): string => document.querySelector('[data-ui="toast.message"]')?.textContent ?? '';

/** The page for `day`, with spies for its two ways out. */
async function openPage(
  setup: WaterSetup & { readonly day?: DayKey; readonly onCustom?: () => void } = {},
) {
  const user = userEvent.setup();
  const h = await openWater({ on: true, ...setup });
  const onDone = vi.fn();
  const onBack = vi.fn();
  h.mount(
    <WaterMenuPage
      day={setup.day ?? TODAY}
      onDone={onDone}
      onBack={onBack}
      onCustom={setup.onCustom}
    />,
  );
  await untilShown(PAGE);
  const page = within(screen.getByRole('group', { name: words.heading }));
  const rows = () => page.getAllByRole('button').map((row) => row.textContent);
  return { ...h, user, page, rows, onDone, onBack };
}

describe('WaterMenuPage', () => {
  it('lists the three amounts smallest first, then Custom amount and Back', async () => {
    const s = await openPage();

    expect(s.rows()).toEqual(['250 ml', '500 ml', '750 ml', words.menu.custom, common.common.back]);
  });

  it('writes the amounts in fl oz when that is the unit', async () => {
    const s = await openPage({ unit: 'flOz', quickAddMl: [750, 237, 500] });

    expect(s.rows().slice(0, 3)).toEqual(['8 fl oz', '16.9 fl oz', '25.4 fl oz']);
  });

  it('logs 500 ml on the selected day at once, confirms it and is done (ACC-F11-1)', async () => {
    const s = await openPage({ day: YESTERDAY });

    await s.user.click(s.page.getByRole('button', { name: '500 ml' }));

    // The confirmation comes first, then the page is done.
    await settle(() => toast() !== '');
    expect(toast()).toBe('500 ml of water logged');
    expect(s.onDone).toHaveBeenCalledTimes(1);
    const [log] = await s.repos.waterRepo.byDay(YESTERDAY);
    expect(log).toMatchObject({ ml: 500, at: FACTORY_NOW - 24 * HOUR });
    expect(await s.loggedOn(TODAY)).toEqual([]);
    expect(s.onBack).not.toHaveBeenCalled();
  });

  it('logs a stored amount exactly, not as rounded for show', async () => {
    const s = await openPage({ unit: 'flOz', quickAddMl: [237, 250, 500] });

    await s.user.click(s.page.getByRole('button', { name: '8.5 fl oz' }));

    await settle(() => toast() !== '');
    expect(toast()).toBe('8.5 fl oz of water logged');
    expect(await s.loggedOn(TODAY)).toEqual([250]);
  });

  it('goes back without logging anything', async () => {
    const s = await openPage();

    await s.user.click(s.page.getByRole('button', { name: common.common.back }));

    expect(s.onBack).toHaveBeenCalledTimes(1);
    expect(s.onDone).not.toHaveBeenCalled();
    expect(await s.loggedOn(TODAY)).toEqual([]);
  });

  it('opens the custom amount on the sheet stack and is done once it logs on the selected day', async () => {
    const s = await openPage({ day: YESTERDAY });

    await s.user.click(s.page.getByRole('button', { name: words.menu.custom }));
    await untilShown(SHEET);
    expect(s.router.current().sheets).toEqual(['water-custom']);
    expect(s.onDone).not.toHaveBeenCalled();

    const sheet = within(screen.getByRole('dialog', { name: words.custom.title }));
    await s.user.type(sheet.getByRole('textbox', { name: words.custom.field }), '1200');
    await s.user.click(sheet.getByRole('button', { name: common.common.add }));

    await untilGone(SHEET);
    expect(await s.loggedOn(YESTERDAY)).toEqual([1_200]);
    expect(s.onDone).toHaveBeenCalledTimes(1);
    expect(s.router.current().sheets).toEqual([]);
  });

  it('is not done when the custom amount is cancelled', async () => {
    const s = await openPage();

    await s.user.click(s.page.getByRole('button', { name: words.menu.custom }));
    await untilShown(SHEET);
    await s.user.click(screen.getByRole('button', { name: common.common.cancel }));

    await untilGone(SHEET);
    expect(s.onDone).not.toHaveBeenCalled();
    expect(await s.loggedOn(TODAY)).toEqual([]);
  });

  it('hands Custom amount to a host that shows the sheet itself', async () => {
    const onCustom = vi.fn();
    const s = await openPage({ onCustom });

    await s.user.click(s.page.getByRole('button', { name: words.menu.custom }));

    expect(onCustom).toHaveBeenCalledTimes(1);
    expect(s.router.current().sheets).toEqual([]);
    expect(document.querySelector(SHEET)).toBeNull();
    expect(s.onDone).not.toHaveBeenCalled();
  });

  it('says so when a log fails and stays on the page', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = await openPage({
      wrap: (real) => ({ ...real, logWater: () => Promise.reject(new Error('disk full')) }),
    });

    await s.user.click(s.page.getByRole('button', { name: '250 ml' }));

    await settle(() => toast() !== '');
    expect(toast()).toBe(words.menu.logFailed);
    expect(s.onDone).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('offers only Back while the water settings cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = await openPage({
      sources: (real) => ({
        ...real,
        settingsRepo: {
          loaded: real.settingsRepo.loaded,
          snapshot: () => Promise.reject(new Error('unreadable')),
        },
      }),
    });

    expect(s.page.getByText(words.menu.unavailable)).toBeVisible();
    expect(s.rows()).toEqual([common.common.back]);
  });
});
