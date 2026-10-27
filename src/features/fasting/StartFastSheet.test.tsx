import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { common } from '../../i18n/en/common';
import { fasting } from '../../i18n/en/fasting';
import { FACTORY_NOW, makeFast } from '../../test/factories';
import { closeHarnesses, untilShown } from '../../test/screenHarness';
import { settle } from '../water/testing/openWater';
import { StartFastSheet } from './StartFastSheet';
import { openFasting, type FastingSetup } from './testing/openFasting';

afterEach(closeHarnesses);

const words = fasting.fasting;
const HOUR = 3_600_000;
const GOAL = '[data-ui="fast.start.goal"]';

async function openSheet(setup: FastingSetup = {}) {
  const user = userEvent.setup();
  const h = await openFasting(setup);
  const onClose = vi.fn();
  const onStarted = vi.fn();
  h.mount(<StartFastSheet open onClose={onClose} onStarted={onStarted} />);
  await untilShown(GOAL);
  const sheet = within(screen.getByRole('dialog', { name: words.start.title }));
  const goal = () => sheet.getByRole('spinbutton', { name: words.start.goal });
  const startButton = () => sheet.getByRole('button', { name: words.start.start });
  return { ...h, user, onClose, onStarted, sheet, goal, startButton };
}

describe('StartFastSheet', () => {
  it('opens on the default 16 hours and starts a running fast now (ACC-H7-1)', async () => {
    const s = await openSheet();
    expect(s.goal()).toHaveAttribute('aria-valuetext', '16 hours');

    await s.user.click(s.startButton());

    await settle(() => s.onClose.mock.calls.length > 0);
    const started = { id: expect.any(String), start: FACTORY_NOW, end: null, goalMin: 960 };
    expect(s.onStarted).toHaveBeenCalledWith(started);
    expect(await s.repos.fastRepo.active()).toEqual(started);
  });

  it('opens on the stored default goal and starts with the hours picked', async () => {
    const s = await openSheet({ defaultGoalMin: 20 * 60 });
    expect(s.goal()).toHaveAttribute('aria-valuetext', '20 hours');

    await s.user.click(s.sheet.getByRole('button', { name: `Decrease ${words.start.goal}` }));
    await s.user.click(s.sheet.getByRole('button', { name: `Decrease ${words.start.goal}` }));
    expect(s.goal()).toHaveAttribute('aria-valuetext', '18 hours');
    await s.user.click(s.startButton());

    await settle(() => s.onClose.mock.calls.length > 0);
    expect((await s.repos.fastRepo.active())?.goalMin).toBe(18 * 60);
  });

  it('keeps the goal between 1 and 168 hours', async () => {
    const s = await openSheet({ defaultGoalMin: 2 * 60 });

    fireEvent.keyDown(s.goal(), { key: 'Home' });
    expect(s.goal()).toHaveAttribute('aria-valuenow', '1');
    expect(s.goal()).toHaveAttribute('aria-valuetext', '1 hour');
    expect(s.sheet.getByRole('button', { name: `Decrease ${words.start.goal}` })).toBeDisabled();

    fireEvent.keyDown(s.goal(), { key: 'End' });
    expect(s.goal()).toHaveAttribute('aria-valuenow', '168');
    expect(s.sheet.getByRole('button', { name: `Increase ${words.start.goal}` })).toBeDisabled();
  });

  it('says a fast is already running and starts nothing (R05.3)', async () => {
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 2 * HOUR, end: null });
    const s = await openSheet({ fasts: [running] });

    await s.user.click(s.startButton());

    await settle(() => document.querySelector('[data-ui="fast.start.refused"]') !== null);
    expect(screen.getByRole('alert')).toHaveTextContent(words.start.running);
    expect(s.onClose).not.toHaveBeenCalled();
    expect(await s.storedFasts()).toEqual([running]);
  });

  it('says a logged fast ending after now blocks the start', async () => {
    const later = makeFast({ start: FACTORY_NOW - 2 * HOUR, end: FACTORY_NOW + HOUR });
    const s = await openSheet({ fasts: [later] });

    await s.user.click(s.startButton());

    await settle(() => document.querySelector('[data-ui="fast.start.refused"]') !== null);
    expect(screen.getByRole('alert')).toHaveTextContent(words.start.overlap);
    expect(await s.storedFasts()).toEqual([later]);
  });

  it('starts nothing on Cancel', async () => {
    const s = await openSheet();

    await s.user.click(s.sheet.getByRole('button', { name: common.common.cancel }));

    expect(s.onClose).toHaveBeenCalledTimes(1);
    expect(await s.storedFasts()).toEqual([]);
  });
});
