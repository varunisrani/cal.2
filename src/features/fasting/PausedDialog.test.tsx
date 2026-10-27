import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { common } from '../../i18n/en/common';
import { fasting } from '../../i18n/en/fasting';
import { review } from '../../i18n/en/review';
import { FACTORY_NOW, makeAnalysisDraft, makeDraft, makeFast } from '../../test/factories';
import { closeHarnesses, untilShown } from '../../test/screenHarness';
import { ReviewSheet } from '../log/review/ReviewSheet';
import { settle } from '../water/testing/openWater';
import { PausedDialog } from './PausedDialog';
import { openFasting } from './testing/openFasting';

afterEach(closeHarnesses);

const words = fasting.fasting.paused;
const HOUR = 3_600_000;
const PAUSED = '[data-ui="fasting.paused"]';

const paused = () => screen.getByRole('alertdialog', { name: words.title });

describe('PausedDialog', () => {
  it('says logging is paused and offers End fast and log or Cancel, answering once', async () => {
    const h = await openFasting();
    const onEndAndLog = vi.fn();
    const onCancel = vi.fn();
    h.mount(<PausedDialog open onEndAndLog={onEndAndLog} onCancel={onCancel} />);

    expect(paused()).toHaveTextContent(words.message);
    const endAndLog = within(paused()).getByRole('button', { name: words.endAndLog });
    expect(endAndLog).toHaveFocus();
    fireEvent.click(endAndLog);
    fireEvent.click(within(paused()).getByRole('button', { name: common.common.cancel }));

    expect(onEndAndLog).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('draws nothing while closed', async () => {
    const h = await openFasting();
    h.mount(<PausedDialog open={false} onEndAndLog={() => undefined} onCancel={() => undefined} />);

    expect(document.querySelector(PAUSED)).toBeNull();
  });
});

describe('the review during a fast (D-16.35)', () => {
  async function openReview() {
    const user = userEvent.setup();
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 9 * HOUR, end: null });
    const h = await openFasting({ on: true, fasts: [running] });
    const onClose = vi.fn();
    const draft = makeDraft({ name: 'Porridge', basis: { kind: 'servings', count: 1 }, units: [] });
    h.mount(<ReviewSheet review={makeAnalysisDraft({ draft })} onClose={onClose} />);
    await untilShown('[data-ui="review.amount"]');
    const sheet = within(screen.getByRole('dialog', { name: review.review.title }));
    await user.click(sheet.getByRole('button', { name: review.review.log }));
    await settle(() => document.querySelector(PAUSED) !== null);
    return { ...h, user, running, onClose, sheet };
  }

  it('shows the paused dialog when Log meets a running fast, and writes nothing (R05.1)', async () => {
    const r = await openReview();

    expect(paused()).toHaveTextContent(words.message);
    expect(await r.db.entries.count()).toBe(0);
    expect(await r.repos.fastRepo.active()).toEqual(r.running);
    expect(r.onClose).not.toHaveBeenCalled();
  });

  it('ends the fast and logs the food in one step with End fast and log (ACC-D27-1)', async () => {
    const r = await openReview();

    await r.user.click(within(paused()).getByRole('button', { name: words.endAndLog }));

    await settle(() => r.onClose.mock.calls.length > 0);
    expect(await r.storedFasts()).toEqual([{ ...r.running, end: FACTORY_NOW }]);
    const logged = await r.repos.diaryRepo.byDay('2026-10-26');
    expect(logged.map((entry) => [entry.name, entry.loggedAt])).toEqual([
      ['Porridge', FACTORY_NOW],
    ]);
  });

  it('keeps fasting and the review on Cancel; Log then shows the dialog again', async () => {
    const r = await openReview();

    await r.user.click(within(paused()).getByRole('button', { name: common.common.cancel }));

    expect(document.querySelector(PAUSED)).toBeNull();
    expect(screen.getByRole('dialog', { name: review.review.title })).toBeVisible();
    expect(await r.repos.fastRepo.active()).toEqual(r.running);
    expect(await r.db.entries.count()).toBe(0);

    await r.user.click(r.sheet.getByRole('button', { name: review.review.log }));
    await settle(() => document.querySelector(PAUSED) !== null);
    expect(r.onClose).not.toHaveBeenCalled();
  });

  it('says so and keeps the fast and the review when the write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const running = makeFast({ id: 'running', start: FACTORY_NOW - 9 * HOUR, end: null });
    const h = await openFasting({
      on: true,
      fasts: [running],
      wrap: (real) => ({
        ...real,
        endFastAndLog: async () => {
          throw new Error('quota');
        },
      }),
    });
    const onClose = vi.fn();
    h.mount(<ReviewSheet review={makeAnalysisDraft()} onClose={onClose} />);
    await untilShown('[data-ui="review.amount"]');
    await user.click(screen.getByRole('button', { name: review.review.log }));
    await settle(() => document.querySelector(PAUSED) !== null);

    await user.click(within(paused()).getByRole('button', { name: words.endAndLog }));

    await settle(() => document.querySelector(PAUSED) === null);
    expect(screen.getByRole('status')).toHaveTextContent(words.failed);
    expect(onClose).not.toHaveBeenCalled();
    expect(await h.repos.fastRepo.active()).toEqual(running);
    expect(await h.db.entries.count()).toBe(0);
  });
});
