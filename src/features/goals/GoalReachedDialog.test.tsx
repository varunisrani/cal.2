import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createRouter } from '../../app/router';
import { memoryHost } from '../../app/testing/memoryHost';
import { RouterProvider } from '../../app/useRoute';
import { DataProvider, type DataSources } from '../../data/DataProvider';
import { hasUnreadableData, settleQuarantine } from '../../data/guard';
import { createBodyFatRepo } from '../../data/repos/bodyFatRepo';
import { createCoachRepo } from '../../data/repos/coachRepo';
import { createDiaryRepo } from '../../data/repos/diaryRepo';
import { createFastRepo } from '../../data/repos/fastRepo';
import { createProfileRepo } from '../../data/repos/profileRepo';
import { createSavedMealsRepo } from '../../data/repos/savedMealsRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import { createWaterRepo } from '../../data/repos/waterRepo';
import { createWeightRepo } from '../../data/repos/weightRepo';
import { goals } from '../../i18n/en/goals';
import { fixedClock } from '../../lib/clock';
import { openTestDb } from '../../test/db';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import { until, untilShown } from '../../test/screenHarness';
import { GoalReachedDialog } from './GoalReachedDialog';

const words = goals.goals.reached;
const DAY_MS = 24 * 60 * 60 * 1000;

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** The dialog in a frame with a router and real repositories over a fresh test database. */
async function setUp(hash = '#/progress') {
  const test = await openTestDb();
  const clock = fixedClock(FACTORY_NOW, 'America/New_York');
  const repos = {
    profileRepo: createProfileRepo(test.db),
    settingsRepo: createSettingsRepo(test.db, { locale: 'en-GB', bus: test.bus }),
    diaryRepo: createDiaryRepo(test.db),
    waterRepo: createWaterRepo(test.db),
    fastRepo: createFastRepo(test.db),
    weightRepo: createWeightRepo(test.db, { bus: test.bus }),
    bodyFatRepo: createBodyFatRepo(test.db),
    savedMealsRepo: createSavedMealsRepo(test.db),
    coachRepo: createCoachRepo(test.db),
  };
  const sources: DataSources = {
    ...repos,
    unreadableFlag: () => hasUnreadableData(test.db),
    clock,
    bus: test.bus,
  };
  const host = memoryHost(hash);
  const router = createRouter(host);
  closers.push(async () => {
    await settleQuarantine(test.db);
    test.db.close();
  });
  const mount = () =>
    render(
      <DataProvider sources={sources}>
        <RouterProvider router={router}>
          <GoalReachedDialog />
        </RouterProvider>
      </DataProvider>,
    );
  return { ...repos, bus: test.bus, host, mount };
}

const dialog = () => screen.queryByRole('alertdialog', { name: words.title });

describe('GoalReachedDialog', () => {
  it('shows the dialog once when 79.4 kg crosses a 79.5 kg lose target (ACC-C11-1, R01.11)', async () => {
    const user = userEvent.setup();
    const { profileRepo, weightRepo, mount } = await setUp();
    await profileRepo.save(makeProfile({ goal: 'lose', weightKg: 80, goalWeightKg: 79.5 }));
    await weightRepo.addWeighIn({ at: FACTORY_NOW - DAY_MS, kg: 80 });
    mount();
    expect(dialog()).toBeNull();

    await act(async () => {
      await weightRepo.addWeighIn({ at: FACTORY_NOW, kg: 79.4 });
    });
    await untilShown('[data-ui="goal.reached"]');
    await until(() => dialog()?.textContent?.includes('79.4 kg') ?? false);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: words.dismiss }));
    expect(dialog()).toBeNull();

    // Already past the goal: a lower weigh-in is no new crossing, so nothing shows again.
    await act(async () => {
      await weightRepo.addWeighIn({ at: FACTORY_NOW + 1_000, kg: 79.3 });
    });
    expect(dialog()).toBeNull();
  });

  it('opens on a goal-reached message and closes with Dismiss', async () => {
    const user = userEvent.setup();
    const { bus, mount } = await setUp();
    mount();

    act(() => bus.post({ type: 'goal-reached', kg: 64 }));
    expect(screen.getByRole('alertdialog', { name: words.title })).toBeVisible();
    // The message names the weight once the weight unit has been read.
    await until(() => dialog()?.textContent?.includes('64.0 kg') ?? false);
    expect(screen.getByRole('button', { name: words.setNewGoal })).toBeVisible();

    await user.click(screen.getByRole('button', { name: words.dismiss }));
    expect(dialog()).toBeNull();
  });

  it('closes and opens Settings › Personal info with Set a new goal (D-16.13)', async () => {
    const user = userEvent.setup();
    const { bus, host, mount } = await setUp('#/progress');
    mount();

    act(() => bus.post({ type: 'goal-reached', kg: 64 }));
    await user.click(screen.getByRole('button', { name: words.setNewGoal }));

    expect(dialog()).toBeNull();
    expect(host.hash()).toBe('#/settings/profile');
  });

  it('shows one dialog for two messages in a row', async () => {
    const user = userEvent.setup();
    const { bus, mount } = await setUp();
    mount();

    act(() => {
      bus.post({ type: 'goal-reached', kg: 64 });
      bus.post({ type: 'goal-reached', kg: 63.8 });
    });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: words.dismiss }));
    expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
  });

  it('names the weight in pounds for a pound reader', async () => {
    const { bus, settingsRepo, mount } = await setUp();
    await settingsRepo.set('units.weight', 'lb');
    mount();

    act(() => bus.post({ type: 'goal-reached', kg: 79.5 }));
    await until(() => dialog()?.textContent?.includes('175.3 lb') ?? false);
    expect(dialog()).toHaveTextContent(words.message.replace('{weight}', '175.3 lb'));
  });

  it('shows no weight while the weight unit is not known yet', async () => {
    const { bus, mount } = await setUp();
    mount();

    act(() => bus.post({ type: 'goal-reached', kg: 64 }));
    expect(dialog()).toHaveTextContent(words.messageNoWeight);
  });
});
