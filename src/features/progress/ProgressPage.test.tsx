import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dexie } from 'dexie';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataProvider } from '../../data/DataProvider';
import { createHealthRepo } from '../../data/repos/healthRepo';
import { health as healthWords } from '../../i18n/en/health';
import { ServicesProvider } from '../../services/context';
import { createHealthService } from '../../services/health/service';
import { fakeHealthPlugin } from '../../services/health/testing/fakeHealthPlugin';
import { common } from '../../i18n/en/common';
import { progress } from '../../i18n/en/progress';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { ProgressPage } from './ProgressPage';
import { openProgress } from './testing/openProgress';

afterEach(closeHarnesses);

const words = progress.progress;
const DAY = 24 * 60 * 60 * 1000;

const textOf = (hook: string): string =>
  document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

/** The figure of a weight-card badge, or '' when it is not there. */
const badge = (name: string): string =>
  document.querySelector(`[data-ui="progress.weight.${name}"]`)?.firstElementChild?.textContent ??
  '';

const metricRadios = () =>
  [...document.querySelectorAll('[data-ui="progress.metric"] [role="radio"]')].map(
    (radio) => radio.textContent,
  );

describe('ProgressPage', () => {
  it('draws the title and no number until every weigh-in is read', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const h = await openProgress({
      weighIns: [{ at: FACTORY_NOW - DAY, kg: 63.8 }],
      sources: (real) => ({
        ...real,
        weightRepo: {
          between: (first, last) =>
            Dexie.Promise.resolve(held).then(() => real.weightRepo.between(first, last)),
        },
      }),
    });
    h.mount(<ProgressPage />);
    await act(async () => {
      await h.repos.settingsRepo.loaded;
      await h.repos.profileRepo.get();
    });

    const page = screen.getByRole('heading', { level: 1, name: common.common.tabs.progress })
      .parentElement as HTMLElement;
    expect(page).toHaveAttribute('aria-busy', 'true');
    expect(page.textContent).toBe(common.common.tabs.progress);

    release();
    await untilShown('[data-ui="progress.weight.current"]');
    expect(badge('current')).toBe('63.8 kg');
    expect(page).not.toHaveAttribute('aria-busy');
  });

  it('shows a message instead of the cards when a read fails', async () => {
    const h = await openProgress({
      sources: (real) => ({
        ...real,
        bodyFatRepo: { between: () => Dexie.Promise.reject(new Error('unreadable')) },
      }),
    });
    h.mount(<ProgressPage />);

    await untilShown('[data-ui="progress.error"]');
    expect(textOf('progress.error')).toBe(words.loadFailed);
  });

  it('offers no Body fat without a reading, a profile value or a goal (ACC-G2-1)', async () => {
    const h = await openProgress({ profile: makeProfile({ bodyFat: undefined }) });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.weight"]');

    expect(document.querySelector('[data-ui="progress.metric"]')).toBeNull();
    expect(screen.queryByRole('radio', { name: words.metric.bodyFat })).toBeNull();
  });

  it('offers Body fat after Weight once only a body-fat goal exists (ACC-G2-1)', async () => {
    const h = await openProgress({ profile: makeProfile({ goalBodyFat: 0.18 }) });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.metric"]');

    expect(metricRadios()).toEqual([words.metric.weight, words.metric.bodyFat]);
    expect(screen.getByRole('radio', { name: words.metric.weight })).toBeChecked();
  });

  it('offers Body fat for a stored reading', async () => {
    const h = await openProgress({ bodyFat: [{ at: FACTORY_NOW - DAY, fraction: 0.24 }] });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.metric"]');
    expect(metricRadios()).toEqual([words.metric.weight, words.metric.bodyFat]);
  });

  it('falls back to Weight for good when the chosen body-fat metric goes away', async () => {
    const user = userEvent.setup();
    const profile = makeProfile({ bodyFat: 0.22 });
    const h = await openProgress({ profile });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.metric"]');

    await user.click(screen.getByRole('radio', { name: words.metric.bodyFat }));
    expect(document.querySelector('[data-ui="progress.weight"]')).toBeNull();

    await act(() => h.repos.profileRepo.save({ ...profile, bodyFat: undefined }));
    await untilShown('[data-ui="progress.weight"]');
    expect(document.querySelector('[data-ui="progress.metric"]')).toBeNull();

    // Body fat back on offer: the page stays on Weight.
    await act(() => h.repos.profileRepo.save({ ...profile, goalBodyFat: 0.18 }));
    await untilShown('[data-ui="progress.metric"]');
    expect(screen.getByRole('radio', { name: words.metric.weight })).toBeChecked();
    expect(document.querySelector('[data-ui="progress.weight"]')).not.toBeNull();
  });

  it('counts today by default, stores the switch, and names the window it leaves while off', async () => {
    const user = userEvent.setup();
    const h = await openProgress();
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.countToday"]');
    const countToday = () => screen.getByRole('switch', { name: words.countToday.label });
    expect(countToday()).toBeChecked();
    expect(countToday()).toHaveAccessibleDescription(words.countToday.on);

    await user.click(countToday());

    await until(() => countToday().getAttribute('aria-checked') === 'false');
    expect(await h.repos.settingsRepo.get('progress.countToday')).toBe(false);
    expect(countToday()).toHaveAccessibleDescription('Calories and averages cover Oct 19 – 25.');
    // A past period moves back by the same day; All has no dates to name.
    await user.click(screen.getByRole('button', { name: words.period.earlier }));
    expect(countToday()).toHaveAccessibleDescription('Calories and averages cover Oct 12 – 18.');
    await user.click(screen.getByRole('radio', { name: words.range.all }));
    expect(countToday()).toHaveAccessibleDescription(words.countToday.off);
  });

  it('shows the weigh-ins of the period on show, with Current from all of them', async () => {
    const user = userEvent.setup();
    const h = await openProgress({
      weighIns: [
        { at: FACTORY_NOW - 10 * DAY, kg: 66 },
        { at: FACTORY_NOW - 9 * DAY, kg: 65.6 },
        { at: FACTORY_NOW - DAY, kg: 64.2 },
      ],
    });
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.weight.current"]');
    expect(badge('average')).toBe('64.2 kg');

    await user.click(screen.getByRole('button', { name: words.period.earlier }));

    expect(textOf('progress.period.label')).toBe('Oct 13 – 19');
    expect(badge('current')).toBe('64.2 kg');
    expect(badge('change')).toBe('-0.4 kg');
    expect(badge('average')).toBe('65.8 kg');

    await user.click(screen.getByRole('button', { name: words.period.earlier }));
    expect(screen.getByText(words.weight.empty)).toBeVisible();
  });

  it('opens on 1W again at the next visit: the range is not stored', async () => {
    const user = userEvent.setup();
    const h = await openProgress();
    const first = h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.range"]');
    await user.click(screen.getByRole('radio', { name: words.range.month }));
    expect(screen.getByRole('radio', { name: words.range.month })).toBeChecked();

    first.unmount();
    await untilGone('[data-ui="progress.range"]');
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.range"]');

    expect(screen.getByRole('radio', { name: words.range.week })).toBeChecked();
  });
});

describe('ProgressPage: Health Connect on the Android app (P11-04)', () => {
  beforeAll(async () => {
    // The card is fetched on demand: load it once before any wait includes its transform.
    await import('./ActivityHistoryCard');
  });

  /** Progress with a health service over a fake Health Connect holding today's steps. */
  async function openWithHealth(connected: boolean) {
    const h = await openProgress();
    await h.repos.settingsRepo.set('health.connected', connected);
    const healthRepo = createHealthRepo(h.db);
    const health = createHealthService({
      plugin: fakeHealthPlugin({
        days: [
          { day: '2026-10-26', steps: 7_500, activeKcal: 260, totalKcal: null, distanceM: null },
        ],
      }),
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
      <ServicesProvider services={{ ...h.services, progress: h.progress, health }}>
        <DataProvider sources={{ ...h.sources, activityRepo: healthRepo }}>
          <ProgressPage />
        </DataProvider>
      </ServicesProvider>,
    );
    await untilShown('[data-ui="progress.weight"]');
  }

  it('shows the activity card under the nutrition cards while Health Connect is connected', async () => {
    await openWithHealth(true);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 2, name: healthWords.health.progress.title }),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-ui="progress.activity.steps"]')).not.toBeNull(),
    );
  });

  it('shows no activity card while not connected', async () => {
    await openWithHealth(false);
    expect(document.querySelector('[data-ui="progress.activity"]')).toBeNull();
  });

  it('shows no activity card without a health service, as on the web (D-16.89)', async () => {
    const h = await openProgress();
    await h.repos.settingsRepo.set('health.connected', true);
    h.mount(<ProgressPage />);
    await untilShown('[data-ui="progress.weight"]');
    expect(document.querySelector('[data-ui="progress.activity"]')).toBeNull();
  });
});
