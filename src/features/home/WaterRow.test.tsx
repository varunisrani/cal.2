import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaterLog } from '../../domain/model';
import type { WaterDisplayUnit } from '../../domain/units/water';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses } from '../../test/screenHarness';
import { openWater, settle, type WaterSetup } from '../water/testing/openWater';
import { WaterRow } from './WaterRow';

afterEach(closeHarnesses);

const words = home.home.water;
const TODAY = '2026-10-26';
const MINUTE = 60_000;

/** The toast on screen, or '' when there is none. */
const toast = (): string => document.querySelector('[data-ui="toast.message"]')?.textContent ?? '';

/** One stored water log drawn as its row, over the real water service. */
async function openRow(
  ml: number,
  unit: WaterDisplayUnit = 'ml',
  setup: Omit<WaterSetup, 'unit'> = {},
) {
  const h = await openWater(setup);
  const log: WaterLog = await h.repos.waterRepo.add({ at: FACTORY_NOW - 45 * MINUTE, ml });
  h.mount(<WaterRow log={log} unit={unit} />);
  return { ...h, log };
}

/** Swipes the row toward the leading edge by `dx` px (jsdom lays nothing out: the width is stubbed). */
function swipe(dx: number) {
  const slide = document.querySelector<HTMLElement>('[data-ui="water.row"] [data-part="slide"]');
  if (!slide) throw new Error('no water row');
  vi.spyOn(slide, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 72));
  fireEvent.pointerDown(slide, { pointerId: 1, clientX: 340, clientY: 30, button: 0 });
  for (let step = 1; step <= 4; step++) {
    fireEvent.pointerMove(slide, { pointerId: 1, clientX: 340 - (dx * step) / 4, clientY: 30 });
  }
  fireEvent.pointerUp(slide, { pointerId: 1, clientX: 340 - dx, clientY: 30, button: 0 });
}

describe('WaterRow', () => {
  it('shows a drop tile, Water, the time it was logged and the amount in ml', async () => {
    await openRow(1_250);

    const row = screen.getByRole('group', { name: `${words.title} 1,250 ml` });
    expect(within(row).getByText('11:45 AM')).toHaveAttribute(
      'datetime',
      new Date(FACTORY_NOW - 45 * MINUTE).toISOString(),
    );
    expect(row.querySelector('svg')).not.toBeNull();
  });

  it('writes the amount in fl oz when that is the water unit', async () => {
    await openRow(250, 'flOz');

    expect(screen.getByRole('group', { name: `${words.title} 8.5 fl oz` })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete 8.5 fl oz of water' })).toBeVisible();
  });

  it('asks before deleting on a swipe, and keeps the log on Cancel (ACC-F9-1)', async () => {
    const s = await openRow(500);

    // A short slide springs back without asking.
    swipe(120);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    swipe(240);
    const dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
    expect(dialog).toHaveTextContent('500 ml of water will be removed from your diary.');
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.cancel }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await s.loggedOn(TODAY)).toEqual([500]);
  });

  it('deletes the log once Delete is confirmed (ACC-F9-1)', async () => {
    const s = await openRow(500, 'ml', { on: false });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 500 ml of water' }));
    const dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.delete }));

    await settle(() => screen.queryByRole('alertdialog') === null);
    expect(await s.loggedOn(TODAY)).toEqual([]);
    expect(toast()).toBe('');
  });

  it('says so and keeps the log when the delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = await openRow(500, 'ml', {
      wrap: (real) => ({ ...real, deleteLog: () => Promise.reject(new Error('disk')) }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete 500 ml of water' }));
    const dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.delete }));

    await settle(() => toast() !== '');
    expect(toast()).toBe(words.deleteFailed);
    expect(await s.loggedOn(TODAY)).toEqual([500]);
  });
});
