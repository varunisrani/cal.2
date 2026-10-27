import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TodayProvider } from '../../../app/TodayProvider';
import { RouterProvider } from '../../../app/useRoute';
import { DataProvider } from '../../../data/DataProvider';
import { defaultProfile, FIXTURE_TODAY } from '../../../domain/goals/__fixtures__/profiles';
import { tdee } from '../../../domain/goals/formulas';
import type { Profile } from '../../../domain/model';
import { planInputsKey } from '../../../domain/profile/signature';
import { ai } from '../../../i18n/en/ai';
import { common } from '../../../i18n/en/common';
import { goals } from '../../../i18n/en/goals';
import { ServicesProvider, type Services } from '../../../services/context';
import type { RebuildOutcome, RebuildService } from '../../../services/goals/rebuild';
import { createTargetEditsService } from '../../../services/goals/targetEdits';
import type { TuneUpOutcome } from '../../../services/goals/tuneUp';
import { FACTORY_NOW } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, openHarness, until, untilShown } from '../../../test/screenHarness';
import { ToastProvider } from '../../../ui/Toast';
import { SettingsScreen } from '../SettingsScreen';

afterEach(closeHarnesses);

// The registry fetches the page on first open (P10-08): load its module once, up front.
beforeAll(async () => {
  await import('./GoalsPage');
});

const words = goals.goals.page;

/** All four values saved, as after any Settings edit: the default body's formula plan. */
const PINNED = { kcal: 2_452, protein: 112, carbs: 406, fat: 42 } as const;

/** The formula's daily burn for the default body on the harness day (2 452 kcal). */
const MAINTENANCE = Math.trunc(tdee(defaultProfile, FIXTURE_TODAY));

interface ShowOptions {
  readonly profile?: Profile;
  readonly tuneUpOn?: boolean;
  readonly energy?: 'kcal' | 'kJ';
  readonly rebuilt?: RebuildOutcome;
  readonly forcedRun?: TuneUpOutcome;
  readonly restored?: boolean;
  /** A stored rebuild baseline; none by default (first open). */
  readonly baseline?: string;
}

/**
 * Settings › Goals and nutrition over real repositories, the real target edits service, a
 * tune-up runner that only flips the switch and reports `forcedRun`, and a rebuild that answers
 * `rebuilt`.
 */
async function showGoals(options: ShowOptions = {}) {
  const h = await openHarness({ hash: '#/settings/goals' });
  const { profileRepo, settingsRepo, weightRepo } = h.repos;
  await profileRepo.save(options.profile ?? defaultProfile);
  await settingsRepo.set('tuneUp.on', options.tuneUpOn ?? false);
  await settingsRepo.set('units.energy', options.energy ?? 'kcal');
  if (options.baseline !== undefined) {
    await settingsRepo.set('goals.rebuildBaseline', options.baseline);
  }

  const tuneUp = {
    turnOn: vi.fn(async (): Promise<TuneUpOutcome> => {
      await settingsRepo.set('tuneUp.on', true);
      return options.forcedRun ?? { kind: 'unchanged', why: 'notDue' };
    }),
    turnOff: vi.fn(async () => {
      await settingsRepo.set('tuneUp.on', false);
      return { restored: options.restored ?? false };
    }),
  };
  const real = createTargetEditsService({ profileRepo, settingsRepo, tuneUp, clock: h.clock });
  // The page seeds the baseline on first open; keep the promise so a test can wait for it.
  const seeds: Promise<void>[] = [];
  const targetEdits = {
    ...real,
    seedRebuildBaseline: () => {
      const seeding = real.seedRebuildBaseline();
      seeds.push(seeding);
      return seeding;
    },
  };
  const rebuild: RebuildService = {
    rebuild: vi.fn(
      async (): Promise<RebuildOutcome> =>
        options.rebuilt ?? { kind: 'rebuilt', kcal: 2_300, nutrientGoals: 'kept' },
    ),
  };
  const services: Services = { ...h.services, targetEdits, rebuild };

  render(
    <ServicesProvider services={services}>
      <DataProvider sources={h.sources}>
        <ToastProvider>
          <RouterProvider router={h.router}>
            <TodayProvider clock={h.clock}>
              <SettingsScreen nested={['goals']} />
            </TodayProvider>
          </RouterProvider>
        </ToastProvider>
      </DataProvider>
    </ServicesProvider>,
  );
  await untilLoaded();
  await untilShown('[data-ui="goals.target.kcal"]');

  const stored = async (): Promise<Profile | null> => {
    const read = await profileRepo.get();
    return read.kind === 'ok' ? read.value : null;
  };
  const seeded = () =>
    act(async () => {
      await Promise.all(seeds);
    });
  return {
    ...h,
    settingsRepo,
    weightRepo,
    tuneUp,
    rebuild,
    stored,
    seeded,
    user: userEvent.setup(),
  };
}

/** Waits until a button with exactly this accessible name is on the page. */
function untilButton(name: string): Promise<void> {
  return until(() => screen.queryByRole('button', { name }) !== null);
}

const wheel = () => screen.getByRole('combobox');
const save = () => screen.getByRole('button', { name: common.common.save });
const notice = () => screen.getByRole('alertdialog');

describe('GoalsPage: targets and locks', () => {
  it('shows the four targets with lock glyphs, under the page title', async () => {
    await showGoals({ profile: { ...defaultProfile, saved: PINNED, lockedMacros: ['protein'] } });

    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Calories 2,452 kcal Auto' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Protein 112 g Locked' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Carbs 406 g Auto' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Fat 42 g Auto' })).toBeVisible();
    expect(screen.getByText(words.targets.howLocks)).toBeVisible();
  });

  it('shows and edits the energy target in kJ, keeping the exact kcal when untouched (R06.20)', async () => {
    const { user, stored } = await showGoals({ energy: 'kJ' });

    await user.click(screen.getByRole('button', { name: 'Kilojoules 10,259 kJ Auto' }));
    expect(screen.getByRole('dialog', { name: words.edit.title.kJ })).toBeVisible();
    const options = Array.from(wheel().querySelectorAll('option'), (option) => option.value);
    expect([options[0], options.at(-1), (wheel() as HTMLSelectElement).value]).toEqual([
      '3400',
      '25100',
      '10200',
    ]);
    // Saved where it opened, the wheel keeps 2 452 kcal (not 10 200 kJ = 2 438 kcal) and locks it.
    await user.click(save());
    await untilButton('Kilojoules 10,259 kJ Locked');
    expect((await stored())?.saved.kcal).toBe(2_452);

    await user.click(screen.getByRole('button', { name: 'Kilojoules 10,259 kJ Locked' }));
    await user.selectOptions(wheel(), '8400');
    await user.click(save());

    // 8 400 kJ is 2 008 kcal, stored in kcal and shown back in kJ.
    await untilButton('Kilojoules 8,401 kJ Locked');
    expect((await stored())?.saved.kcal).toBe(2_008);
  });

  it('keeps calories and lowers carbs and fat when protein rises with calories locked (ACC-C6-1)', async () => {
    const { user, stored } = await showGoals();

    // Saved where it opened (2 450 on the wheel), the exact 2 452 kcal is kept and locked.
    await user.click(screen.getByRole('button', { name: 'Calories 2,452 kcal Auto' }));
    expect(screen.getByRole('dialog', { name: words.edit.title.kcal })).toBeVisible();
    expect((wheel() as HTMLSelectElement).value).toBe('2450');
    await user.click(save());
    await untilButton('Calories 2,452 kcal Locked');

    await user.click(screen.getByRole('button', { name: 'Protein 112 g Auto' }));
    await user.selectOptions(wheel(), '150');
    await user.click(save());
    await untilButton('Protein 150 g Locked');

    expect(screen.getByRole('button', { name: 'Calories 2,452 kcal Locked' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Carbs 376 g Auto' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Fat 39 g Auto' })).toBeVisible();
    expect(await stored()).toMatchObject({
      saved: { kcal: 2_452, protein: 150, carbs: 376, fat: 39 },
      caloriesLocked: true,
      lockedMacros: ['protein'],
    });
  });

  it('refuses an edit nothing can absorb, says why and changes nothing (R01.13)', async () => {
    const locked: Profile = {
      ...defaultProfile,
      saved: PINNED,
      caloriesLocked: true,
      lockedMacros: ['carbs', 'fat'],
    };
    const { user, stored } = await showGoals({ profile: locked });

    await user.click(screen.getByRole('button', { name: 'Protein 112 g Auto' }));
    await user.selectOptions(wheel(), '150');
    await user.click(save());
    await until(() => screen.queryByRole('alertdialog') !== null);

    expect(notice()).toHaveAccessibleName(words.edit.refusedTitle);
    expect(notice()).toHaveTextContent(words.edit.refused);
    expect(screen.queryByRole('dialog', { name: words.edit.title.protein })).toBeNull();
    expect(await stored()).toEqual(locked);
    await user.click(within(notice()).getByRole('button', { name: words.ok }));
    expect(screen.getByRole('button', { name: 'Protein 112 g Auto' })).toBeVisible();
  });

  it('applies an edit to the third macro without locking it (R01.13, ACC-C6-2)', async () => {
    const { user } = await showGoals({
      profile: { ...defaultProfile, saved: PINNED, lockedMacros: ['protein', 'carbs'] },
    });

    await user.click(screen.getByRole('button', { name: 'Fat 42 g Auto' }));
    await user.selectOptions(wheel(), '50');
    await user.click(save());

    // Calories are free, so they float to 4 × 112 + 4 × 406 + 9 × 50.
    await untilButton('Fat 50 g Auto');
    expect(screen.getByRole('button', { name: 'Calories 2,522 kcal Auto' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Protein 112 g Locked' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Carbs 406 g Locked' })).toBeVisible();
  });

  it('offers Reset to auto only on a locked row, and it frees the value', async () => {
    const { user, stored } = await showGoals({
      profile: {
        ...defaultProfile,
        saved: { ...PINNED, protein: 150 },
        caloriesLocked: true,
        lockedMacros: ['protein'],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Carbs 406 g Auto' }));
    expect(screen.queryByRole('button', { name: words.edit.reset })).toBeNull();
    await user.click(screen.getByRole('button', { name: common.common.cancel }));

    await user.click(screen.getByRole('button', { name: 'Protein 150 g Locked' }));
    await user.click(screen.getByRole('button', { name: words.edit.reset }));

    // (2 452 − 4 × 406 − 9 × 42) div 4 = 112, and protein is no longer locked.
    await untilButton('Protein 112 g Auto');
    expect(await stored()).toMatchObject({ caloriesLocked: true, lockedMacros: [] });
  });

  it('keeps the rows read-only while the tune-up is on: a tap explains and changes nothing (ACC-C8-3)', async () => {
    const profile: Profile = { ...defaultProfile, saved: PINNED };
    const { user, stored } = await showGoals({ profile, tuneUpOn: true });

    const row = screen.getByRole('button', { name: 'Protein 112 g Auto' });
    expect(row).toHaveAccessibleDescription(words.targets.tuneUpOwns);
    expect(within(row).getByRole('img', { name: words.targets.auto })).toHaveAttribute(
      'data-dimmed',
    );

    await user.click(row);

    expect(notice()).toHaveAccessibleName(words.edit.tuneUpTitle);
    expect(notice()).toHaveTextContent(words.edit.tuneUp);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(await stored()).toEqual(profile);
  });
});

describe('GoalsPage: rebuild plan', () => {
  it('shows no nudge on first open and shows it after a new weigh-in (ACC-C5-1, R01.12)', async () => {
    const { seeded, settingsRepo, weightRepo } = await showGoals();

    await seeded();
    expect(await settingsRepo.get('goals.rebuildBaseline')).toBe(planInputsKey(defaultProfile));
    expect(document.querySelector('[data-ui="goals.rebuild.nudge"]')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(words.plan.rebuild) })).toHaveTextContent(
      words.plan.rebuildHint,
    );

    await act(async () => {
      await weightRepo.addWeighIn({ at: FACTORY_NOW + 60_000, kg: 71 });
    });
    await untilShown('[data-ui="goals.rebuild.nudge"]');

    expect(screen.getByRole('button', { name: new RegExp(words.plan.rebuild) })).toHaveTextContent(
      words.plan.nudge,
    );
  });

  it('words a rebuilt plan: the new target in the display unit and the AI reason (ACC-C4-1)', async () => {
    const { user, rebuild } = await showGoals({
      energy: 'kJ',
      baseline: planInputsKey({ ...defaultProfile, weightKg: 75 }),
      rebuilt: {
        kind: 'rebuilt',
        kcal: 2_300,
        reason: 'Weight held steady for a month.',
        nutrientGoals: 'refreshed',
      },
    });
    // The rebuild row is tappable with or without the nudge.
    expect(document.querySelector('[data-ui="goals.rebuild.nudge"]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: new RegExp(words.plan.rebuild) }));
    await until(() => screen.queryByRole('alertdialog') !== null);

    expect(rebuild.rebuild).toHaveBeenCalledTimes(1);
    expect(notice()).toHaveAccessibleName(words.plan.rebuiltTitle);
    expect(notice()).toHaveTextContent(words.plan.rebuilt.replace('{amount}', '9,623 kJ'));
    expect(notice()).toHaveTextContent('Weight held steady for a month.');
  });

  it('says a failed rebuild left the goals as they were and points to AI settings', async () => {
    const { user } = await showGoals({
      rebuilt: { kind: 'failed', failure: { kind: 'keyRejected' } },
    });

    await user.click(screen.getByRole('button', { name: new RegExp(words.plan.rebuild) }));
    await until(() => screen.queryByRole('alertdialog') !== null);

    expect(notice()).toHaveAccessibleName(words.plan.failedTitle);
    expect(notice()).toHaveTextContent(words.plan.failed);
    expect(notice()).toHaveTextContent(ai.ai.failure.keyRejected);
  });
});

describe('GoalsPage: maintenance estimate', () => {
  const row = () => screen.getByRole('button', { name: new RegExp(words.maintenance.label) });

  it('reads a target 40 kcal under the estimate as close to it (ACC-C7-1)', async () => {
    await showGoals({
      profile: { ...defaultProfile, saved: { kcal: MAINTENANCE - 40 }, caloriesLocked: true },
    });

    expect(row()).toHaveTextContent(words.maintenance.close);
    expect(row()).toHaveTextContent(`${MAINTENANCE.toLocaleString('en-US')} kcal`);
  });

  it('reads a deficit and a surplus with the daily amount', async () => {
    const { repos } = await showGoals({
      profile: { ...defaultProfile, saved: { kcal: MAINTENANCE - 500 }, caloriesLocked: true },
    });
    expect(row()).toHaveTextContent(words.maintenance.under.replace('{amount}', '500 kcal'));

    await act(async () => {
      await repos.profileRepo.update((profile) => ({
        ...profile,
        saved: { kcal: MAINTENANCE + 300 },
      }));
    });
    await until(() => row().textContent?.includes('300 kcal a day above') === true);
    expect(row()).toHaveTextContent(words.maintenance.over.replace('{amount}', '300 kcal'));
  });

  it('explains on a tap that it is a formula estimate', async () => {
    const { user } = await showGoals();

    await user.click(row());

    expect(notice()).toHaveAccessibleName(words.maintenance.infoTitle);
    expect(notice()).toHaveTextContent(words.maintenance.info.replace('{band}', '50 kcal'));
  });
});

describe('GoalsPage: switches and links', () => {
  const tuneUpSwitch = () => screen.getByRole('switch', { name: words.plan.tuneUp });

  it('turns the tune-up on and shows the outcome of the forced run', async () => {
    const { user, tuneUp } = await showGoals({
      forcedRun: { kind: 'changed', kcal: 2_300, reason: 'Logs show a steady intake.' },
    });
    expect(tuneUpSwitch()).not.toBeChecked();

    await user.click(tuneUpSwitch());
    await until(() => screen.queryByRole('alertdialog') !== null);

    expect(tuneUp.turnOn).toHaveBeenCalledTimes(1);
    expect(notice()).toHaveAccessibleName(words.plan.tunedTitle);
    expect(notice()).toHaveTextContent(words.plan.tuned.replace('{amount}', '2,300 kcal'));
    expect(notice()).toHaveTextContent('Logs show a steady intake.');
    await user.click(within(notice()).getByRole('button', { name: words.ok }));
    await until(() => tuneUpSwitch().getAttribute('aria-checked') === 'true');
    expect(screen.getByText(words.targets.tuneUpOwns)).toBeVisible();
  });

  it('explains a forced run that changed nothing', async () => {
    const { user } = await showGoals();
    await user.click(tuneUpSwitch());
    await until(() => screen.queryByRole('alertdialog') !== null);
    expect(notice()).toHaveAccessibleName(words.plan.unchangedTitle);
    expect(notice()).toHaveTextContent(words.plan.unchanged);
  });

  it('says the tune-up could not reach the AI when its forced run failed', async () => {
    const { user } = await showGoals({
      forcedRun: { kind: 'failed', failure: { kind: 'timeout' } },
    });

    await user.click(tuneUpSwitch());
    await until(() => screen.queryByRole('alertdialog') !== null);

    expect(notice()).toHaveAccessibleName(words.plan.tuneFailedTitle);
    expect(notice()).toHaveTextContent(words.plan.tuneFailed);
    expect(notice()).toHaveTextContent(ai.ai.failure.timeout);
  });

  it('turns the tune-up off and says the earlier plan is back', async () => {
    const { user, tuneUp } = await showGoals({ tuneUpOn: true, restored: true });
    expect(tuneUpSwitch()).toBeChecked();

    await user.click(tuneUpSwitch());
    await until(() => screen.queryByText(words.plan.restored) !== null);
    await until(() => tuneUpSwitch().getAttribute('aria-checked') === 'false');

    expect(tuneUp.turnOff).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Protein 112 g Auto' }),
    ).not.toHaveAccessibleDescription();
  });

  it('explains the tune-up from its info button', async () => {
    const { user } = await showGoals();

    await user.click(screen.getByRole('button', { name: words.plan.tuneUpInfoLabel }));

    expect(notice()).toHaveTextContent(words.plan.tuneUpInfo);
  });

  it('stores the goal-reached alert switch', async () => {
    const { user, settingsRepo } = await showGoals();
    const alert = screen.getByRole('switch', { name: words.alerts.goalReached });
    expect(alert).not.toBeChecked();

    await user.click(alert);
    await until(() => alert.getAttribute('aria-checked') === 'true');

    expect(await settingsRepo.get('alerts.goalReached')).toBe(true);
  });

  it('links to the methods page and opens the nutrient goals', async () => {
    const { user, host } = await showGoals();

    await user.click(screen.getByRole('button', { name: new RegExp(words.plan.nutrients) }));
    expect(screen.getByRole('dialog', { name: goals.goals.nutrients.title })).toBeVisible();
    await user.click(screen.getByRole('button', { name: common.common.done }));

    await user.click(screen.getByRole('button', { name: /How your plan is calculated/ }));
    expect(host.hash()).toBe('#/settings/methods');
  });
});
