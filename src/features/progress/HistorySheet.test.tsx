import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { common } from '../../i18n/en/common';
import { progress } from '../../i18n/en/progress';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { ProgressPage } from './ProgressPage';
import { openProgress, type ProgressSetup } from './testing/openProgress';

afterEach(closeHarnesses);

const words = progress.progress;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SHEET = '[data-ui="progress.history.sheet"]';
const ROW = '[data-ui="progress.history.row"]';

/** Three weigh-ins, added oldest last: today 10:30, yesterday, and three weeks back. */
const WEIGH_INS = [
  { at: FACTORY_NOW - 20 * DAY, kg: 66.2 },
  { at: FACTORY_NOW - 2 * HOUR, kg: 63.8 },
  { at: FACTORY_NOW - DAY, kg: 64.4 },
];

/** The rows of the open history as "value · date", top to bottom. */
function rows(): string[] {
  return [...document.querySelectorAll(ROW)].map((row) => {
    const value = row.querySelector('span > span')?.textContent ?? '';
    const date = row.querySelector('time')?.textContent ?? '';
    return `${value} · ${date}`;
  });
}

/** The figure of a metric-card badge, or '' when it is not there. */
const badge = (name: string): string =>
  document.querySelector(`[data-ui="progress.${name}"]`)?.firstElementChild?.textContent ?? '';

/** Progress with the chosen metric's history open. */
async function openHistory(setup: ProgressSetup, metric: 'weight' | 'bodyFat' = 'weight') {
  const user = userEvent.setup();
  const h = await openProgress(setup);
  h.mount(<ProgressPage />);
  if (metric === 'bodyFat') {
    await untilShown('[data-ui="progress.metric"]');
    await user.click(screen.getByRole('radio', { name: words.metric.bodyFat }));
  }
  await untilShown('[data-ui="progress.history"]');
  const title = words.history[metric].title;
  await user.click(screen.getByRole('button', { name: title }));
  const sheet = within(screen.getByRole('dialog', { name: title }));
  /** Presses a row's delete button; the button is named after the row's value and date. */
  const askToDelete = (name: string) =>
    user.click(sheet.getByRole('button', { name: `Delete ${name}` }));
  const question = () => within(screen.getByRole('alertdialog'));
  return { ...h, user, sheet, askToDelete, question };
}

describe('HistoryLink', () => {
  it('names the history of the metric on show, with its count, under the card', async () => {
    const user = userEvent.setup();
    const h = await openProgress({
      weighIns: WEIGH_INS,
      bodyFat: [{ at: FACTORY_NOW - DAY, fraction: 0.24 }],
    });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.history"]');

    const weight = screen.getByRole('button', { name: words.history.weight.title });
    expect(weight).toHaveAccessibleDescription('3 weigh-ins. See them all or remove one.');
    // Right after the metric's card.
    expect(
      document.querySelector('[data-ui="progress.weight"]')?.nextElementSibling,
    ).toContainElement(weight);

    await user.click(screen.getByRole('radio', { name: words.metric.bodyFat }));

    const bodyFat = screen.getByRole('button', { name: words.history.bodyFat.title });
    expect(bodyFat).toHaveAccessibleDescription('1 reading. See them all or remove one.');
    expect(screen.queryByRole('button', { name: words.history.weight.title })).toBeNull();
  });

  it('is not shown while the metric on show has no readings', async () => {
    const user = userEvent.setup();
    const h = await openProgress({ profile: makeProfile({ bodyFat: 0.22 }), weighIns: [] });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.metric"]');
    expect(document.querySelector('[data-ui="progress.history"]')).toBeNull();

    await user.click(screen.getByRole('radio', { name: words.metric.bodyFat }));

    // The profile value shows on the card; the history has nothing to list.
    expect(badge('bodyFat.current')).toBe('22.0%');
    expect(document.querySelector('[data-ui="progress.history"]')).toBeNull();
  });
});

describe('HistorySheet', () => {
  it('lists every weigh-in newest first, each value over its date', async () => {
    const s = await openHistory({ weighIns: WEIGH_INS });

    expect(rows()).toEqual([
      '63.8 kg · Oct 26, 2026',
      '64.4 kg · Oct 25, 2026',
      '66.2 kg · Oct 6, 2026',
    ]);
    // A visible delete on every row.
    expect(s.sheet.getAllByRole('button', { name: /^Delete / })).toHaveLength(3);
  });

  it('writes weigh-ins in kg for a person whose stored weight unit is lb (D-16.91)', async () => {
    await openHistory({ weight: 'lb', weighIns: WEIGH_INS });
    expect(rows()).toEqual([
      '63.8 kg · Oct 26, 2026',
      '64.4 kg · Oct 25, 2026',
      '66.2 kg · Oct 6, 2026',
    ]);
  });

  it('asks first, naming the date and the value, and keeps the row on Cancel (R05.22)', async () => {
    const s = await openHistory({ weighIns: WEIGH_INS });

    await s.askToDelete('64.4 kg from Oct 25, 2026');

    expect(
      screen.getByRole('alertdialog', { name: words.history.weight.deleteTitle }),
    ).toBeVisible();
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      '64.4 kg from Oct 25, 2026 will be removed for good.',
    );
    await s.user.click(s.question().getByRole('button', { name: common.common.cancel }));

    await untilGone('[data-ui="progress.history.confirm"]');
    expect(rows()).toHaveLength(3);
    expect(await s.repos.weightRepo.history()).toHaveLength(3);
  });

  it('takes the row out of the open list at once, before the store answers (ACC-G6-1, R05.22)', async () => {
    const s = await openHistory({ weighIns: WEIGH_INS });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deleteWeighIn = s.progress.deleteWeighIn;
    vi.spyOn(s.progress, 'deleteWeighIn').mockImplementation(async (id) => {
      await held;
      await deleteWeighIn(id);
    });

    await s.askToDelete('66.2 kg from Oct 6, 2026');
    await s.user.click(s.question().getByRole('button', { name: common.common.delete }));

    expect(rows()).toEqual(['63.8 kg · Oct 26, 2026', '64.4 kg · Oct 25, 2026']);
    expect(await s.repos.weightRepo.history()).toHaveLength(3);

    release();
    // The link behind the sheet counts what is left once the store has it.
    await until(() => (document.body.textContent ?? '').includes('2 weigh-ins.'));
    expect((await s.repos.weightRepo.history()).map((reading) => reading.kg)).toEqual([63.8, 64.4]);
    expect(rows()).toHaveLength(2);
  });

  it('moves the profile weight to the one before when the newest weigh-in is deleted (R05.8)', async () => {
    const s = await openHistory({ weighIns: WEIGH_INS });
    expect((await s.stored()).weightKg).toBe(63.8);

    await s.askToDelete('63.8 kg from Oct 26, 2026');
    await s.user.click(s.question().getByRole('button', { name: common.common.delete }));

    expect(rows()).toEqual(['64.4 kg · Oct 25, 2026', '66.2 kg · Oct 6, 2026']);
    await until(() => badge('weight.current') === '64.4 kg');
    expect((await s.stored()).weightKg).toBe(64.4);
  });

  it('lists body-fat readings in percent and deletes them; the profile follows the newest left (R05.8)', async () => {
    const s = await openHistory(
      {
        bodyFat: [
          { at: FACTORY_NOW - 9 * DAY, fraction: 0.245 },
          { at: FACTORY_NOW - HOUR, fraction: 0.238 },
        ],
      },
      'bodyFat',
    );
    expect(rows()).toEqual(['23.8% · Oct 26, 2026', '24.5% · Oct 17, 2026']);

    await s.askToDelete('23.8% from Oct 26, 2026');
    expect(
      screen.getByRole('alertdialog', { name: words.history.bodyFat.deleteTitle }),
    ).toBeVisible();
    await s.user.click(s.question().getByRole('button', { name: common.common.delete }));

    expect(rows()).toEqual(['24.5% · Oct 17, 2026']);
    await until(() => badge('bodyFat.current') === '24.5%');
    expect((await s.stored()).bodyFat).toBe(0.245);
  });

  it('keeps the profile value after the last body-fat reading is deleted, and says the list is empty', async () => {
    const s = await openHistory(
      {
        profile: makeProfile({ bodyFat: 0.3 }),
        bodyFat: [{ at: FACTORY_NOW - HOUR, fraction: 0.26 }],
      },
      'bodyFat',
    );

    await s.askToDelete('26.0% from Oct 26, 2026');
    await s.user.click(s.question().getByRole('button', { name: common.common.delete }));

    expect(s.sheet.getByText(words.history.empty)).toBeVisible();
    await untilGone('[data-ui="progress.history"]');
    expect(await s.repos.bodyFatRepo.history()).toEqual([]);
    expect((await s.stored()).bodyFat).toBe(0.26);

    await s.user.click(s.sheet.getByRole('button', { name: common.common.done }));
    await untilGone(SHEET);
    expect(badge('bodyFat.current')).toBe('26.0%');
  });

  it('puts the row back and says so when the delete fails', async () => {
    const s = await openHistory({ weighIns: WEIGH_INS });
    vi.spyOn(s.progress, 'deleteWeighIn').mockRejectedValue(new Error('locked'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await s.askToDelete('64.4 kg from Oct 25, 2026');
    await s.user.click(s.question().getByRole('button', { name: common.common.delete }));

    await untilShown('[data-ui="toast.message"]');
    expect(screen.getByText(words.history.deleteFailed)).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
    expect(await s.repos.weightRepo.history()).toHaveLength(3);
  });
});
