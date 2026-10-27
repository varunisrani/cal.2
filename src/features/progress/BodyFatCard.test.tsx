import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, startOfDay } from '../../domain/dates/dayKey';
import type { BodyFatReading } from '../../domain/model';
import { common } from '../../i18n/en/common';
import { progress } from '../../i18n/en/progress';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { BodyFatCard, type BodyFatCardProps } from './BodyFatCard';
import { ProgressPage } from './ProgressPage';
import { openProgress, type ProgressSetup } from './testing/openProgress';

afterEach(closeHarnesses);

const words = progress.progress;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SHEET = '[data-ui="progress.logBodyFat"]';

/** Morning readings (in percent), one a day from 20 October 2026. */
function mornings(...percents: number[]): BodyFatReading[] {
  return percents.map((percent, index) => ({
    id: `fat-${index + 1}`,
    at: startOfDay(addDays('2026-10-20', index)) + 8 * HOUR,
    fraction: percent / 100,
  }));
}

function renderCard(props: Partial<BodyFatCardProps> = {}) {
  const readings = props.readings ?? mornings(24, 23.5, 23.2);
  const onLog = vi.fn();
  render(
    <BodyFatCard
      readings={readings}
      latest={readings[readings.length - 1] ?? null}
      onLog={onLog}
      {...props}
    />,
  );
  return { onLog };
}

/** The figure of a body-fat badge (its first line), or null when there is none. */
function badge(name: string): string | null {
  const element = document.querySelector(`[data-ui="progress.bodyFat.${name}"]`);
  return element?.firstElementChild?.textContent ?? null;
}

/** Gives the chart a 360 px plot to draw in (jsdom lays nothing out). */
function layOutCharts(): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 404, 212));
}

describe('BodyFatCard', () => {
  it('shows Current from the profile and no chart when there are no readings', () => {
    renderCard({ readings: [], latest: null, profileValue: 0.22 });

    expect(badge('current')).toBe('22.0%');
    expect(badge('change')).toBeNull();
    expect(badge('average')).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();
    expect(screen.queryByText(words.bodyFat.empty)).toBeNull();
  });

  it('prompts for a first reading only when no body fat is known at all', async () => {
    const user = userEvent.setup();
    const { onLog } = renderCard({ readings: [], latest: null, goal: 0.18 });

    expect(screen.getByText(words.bodyFat.empty)).toBeVisible();
    expect(badge('current')).toBeNull();
    expect(badge('goal')).toBeNull();

    await user.click(screen.getByRole('button', { name: words.bodyFat.log }));
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('takes Current from the newest reading of all, before the profile value', () => {
    const newest: BodyFatReading = { id: 'later', at: startOfDay('2026-11-03'), fraction: 0.211 };
    renderCard({ readings: [], latest: newest, profileValue: 0.25, goal: 0.18 });

    expect(badge('current')).toBe('21.1%');
    expect(badge('goal')).toBe('18.0%');
    // No readings on the window's days: no change, no average, no chart.
    expect(badge('change')).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('labels the four badges in order when the window has readings', () => {
    renderCard({ goal: 0.2 });
    const labels = ['current', 'goal', 'change', 'average'].map(
      (name) =>
        document.querySelector(`[data-ui="progress.bodyFat.${name}"]`)?.lastElementChild
          ?.textContent,
    );
    expect(labels).toEqual([
      words.bodyFat.current,
      words.bodyFat.goal,
      words.bodyFat.change,
      words.bodyFat.average,
    ]);
    expect(badge('current')).toBe('23.2%');
    expect(badge('change')).toBe('-0.8%');
    expect(badge('average')).toBe('23.6%');
  });

  it('signs a rise with +, to one decimal', () => {
    renderCard({ readings: mornings(18, 19.5) });
    expect(badge('change')).toBe('+1.5%');
  });

  it('reads a change of −0.04 points as 0.0% with no sign', () => {
    renderCard({ readings: mornings(22.04, 22) });
    expect(badge('change')).toBe('0.0%');
  });

  it('draws the window with the goal line and whole-percent ticks, and lists the readings', () => {
    layOutCharts();
    renderCard({ readings: mornings(18.5, 19, 20), goal: 0.18 });

    const chart = screen.getByRole('figure', { name: words.bodyFat.chart });
    expect(chart.querySelector('[data-part="goal"]')).not.toBeNull();
    const ticks = [...chart.querySelectorAll('[data-part="tick"]')].map((tick) => tick.textContent);
    expect(ticks).toEqual(['17%', '18%', '19%', '20%', '21%']);
    const rows = within(chart).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.lastElementChild?.textContent)).toEqual([
      '18.5%',
      '19.0%',
      '20.0%',
    ]);
    expect(within(chart).getByText('Goal: 18.0%')).toBeInTheDocument();
  });

  it('starts the axis at 0 % for readings near zero, with a decimal only on halves', () => {
    layOutCharts();
    renderCard({ readings: mornings(0.8, 1.5) });

    const chart = screen.getByRole('figure', { name: words.bodyFat.chart });
    const ticks = [...chart.querySelectorAll('[data-part="tick"]')];
    expect(ticks.map((tick) => tick.textContent)).toEqual([
      '0%',
      '0.5%',
      '1%',
      '1.5%',
      '2%',
      '2.5%',
    ]);
    // The 0 % line is the plot's floor.
    expect(Number(ticks[0]?.getAttribute('y'))).toBe(190);
  });
});

/** Progress on Body fat, with the Log body fat sheet open. */
async function openSheet(setup: ProgressSetup) {
  const user = userEvent.setup();
  const h = await openProgress(setup);
  h.mount(<ProgressPage />);
  await untilShown('[data-ui="progress.metric"]');
  await user.click(screen.getByRole('radio', { name: words.metric.bodyFat }));
  await user.click(screen.getByRole('button', { name: words.bodyFat.log }));
  const sheet = within(screen.getByRole('dialog', { name: words.logBodyFat.title }));
  const wheel = () => sheet.getByRole('combobox', { name: words.logBodyFat.wheel });
  const save = () => user.click(sheet.getByRole('button', { name: common.common.save }));
  return { ...h, user, sheet, wheel, save };
}

describe('LogBodyFatSheet', () => {
  it('saves 18.5 % stamped now and moves the profile body fat and the card to it (ACC-G5-1)', async () => {
    const s = await openSheet({
      profile: makeProfile({ bodyFat: 0.22 }),
      bodyFat: [{ at: FACTORY_NOW - 3 * DAY, fraction: 0.2 }],
    });
    expect(badge('current')).toBe('20.0%');

    await s.user.selectOptions(s.wheel(), '18.5');
    await s.save();

    await untilGone(SHEET);
    expect(await s.repos.bodyFatRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, fraction: 0.185 },
      { id: expect.any(String), at: FACTORY_NOW - 3 * DAY, fraction: 0.2 },
    ]);
    expect((await s.stored()).bodyFat).toBe(0.185);
    await until(() => badge('current') === '18.5%');
    expect(badge('change')).toBe('-1.5%');
    expect(badge('average')).toBe('19.3%');
  });

  it('opens on the newest reading by date, not the last one added', async () => {
    const s = await openSheet({
      profile: makeProfile({ bodyFat: 0.3 }),
      bodyFat: [
        { at: FACTORY_NOW - 2 * HOUR, fraction: 0.245 },
        { at: FACTORY_NOW - 5 * DAY, fraction: 0.26 },
      ],
    });
    expect(s.wheel()).toHaveValue('24.5');
  });

  it('opens on the profile value without readings', async () => {
    const s = await openSheet({ profile: makeProfile({ bodyFat: 0.275 }) });
    expect(s.wheel()).toHaveValue('27.5');
  });

  it('opens on 20 % with neither a reading nor a profile value, and saves it', async () => {
    const s = await openSheet({ profile: makeProfile({ goalBodyFat: 0.18 }) });
    expect(s.wheel()).toHaveValue('20');

    await s.save();

    await untilGone(SHEET);
    expect((await s.stored()).bodyFat).toBe(0.2);
  });

  it('holds a profile value under 3 % at the wheel’s end, and saves what it shows', async () => {
    const s = await openSheet({ profile: makeProfile({ bodyFat: 0.021 }) });
    expect(s.wheel()).toHaveValue('3');

    await s.save();

    await untilGone(SHEET);
    const [saved] = await s.repos.bodyFatRepo.history();
    expect(saved?.fraction).toBe(0.03);
  });

  it('saves an unmoved wheel at the exact value it opened on', async () => {
    const s = await openSheet({ profile: makeProfile({ bodyFat: 0.213 }) });
    expect(s.wheel()).toHaveValue('21.5');

    await s.save();

    await untilGone(SHEET);
    const [saved] = await s.repos.bodyFatRepo.history();
    expect(saved?.fraction).toBe(0.213);
  });

  it('closes on Cancel without storing anything', async () => {
    const s = await openSheet({ profile: makeProfile({ bodyFat: 0.22 }) });
    await s.user.selectOptions(s.wheel(), '30');

    await s.user.click(s.sheet.getByRole('button', { name: common.common.cancel }));

    await untilGone(SHEET);
    expect(await s.repos.bodyFatRepo.history()).toEqual([]);
    expect((await s.stored()).bodyFat).toBe(0.22);
    expect(s.router.current().sheets).toEqual([]);
  });

  it('keeps the sheet open with the value and says so when the save fails', async () => {
    const s = await openSheet({ profile: makeProfile({ bodyFat: 0.22 }) });
    vi.spyOn(s.progress, 'logBodyFat').mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await s.user.selectOptions(s.wheel(), '25');

    await s.save();

    await untilShown('[data-ui="toast.message"]');
    expect(screen.getByText(words.logBodyFat.saveFailed)).toBeInTheDocument();
    expect(s.wheel()).toHaveValue('25');
    expect(await s.repos.bodyFatRepo.history()).toEqual([]);
  });
});
