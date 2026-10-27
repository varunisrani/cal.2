import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { common } from '../../../i18n/en/common';
import { onboarding } from '../../../i18n/en/onboarding';
import { profile as profileWords } from '../../../i18n/en/profile';
import { FACTORY_NOW, makeProfile } from '../../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../../test/screenHarness';
import { ProfilePage } from './ProfilePage';
import { openProfile, type ProfileSetup } from './testing/openProfile';
import { heldOnWheel } from './WeightSheet';

afterEach(closeHarnesses);

const words = profileWords.profile;
const wheelWords = onboarding.onboarding.wizard.weight;

const rowValue = (field: string): string =>
  document.querySelector(`[data-ui="profile.${field}"]`)?.textContent ?? '';

/** Personal info with the weight or goal-weight sheet open. */
async function openSheet(field: 'weight' | 'goalWeight', setup: ProfileSetup) {
  const user = userEvent.setup();
  const h = await openProfile(setup);
  h.mount(<ProfilePage />);
  await untilShown(`[data-ui="profile.${field}"]`);
  await user.click(document.querySelector(`[data-ui="profile.${field}"]`) as HTMLElement);
  const title = field === 'weight' ? words.rows.weight : words.rows.goalWeight;
  const sheet = within(screen.getByRole('dialog', { name: title }));
  const wheel = () => sheet.getByRole('combobox', { name: wheelWords.wholeKg });
  const tenths = () => sheet.getByRole('combobox', { name: wheelWords.tenths });
  const save = () => user.click(sheet.getByRole('button', { name: common.common.save }));
  return { ...h, user, sheet, wheel, tenths, save, ui: `[data-ui="profile.${field}.sheet"]` };
}

describe('WeightSheet: the current weight', () => {
  it('adds one weigh-in for now and changes the profile weight (ACC-B12-1)', async () => {
    const s = await openSheet('weight', {
      profile: makeProfile({ weightKg: 64, goal: 'maintain' }),
    });
    expect(s.wheel()).toHaveValue('64');
    expect(s.tenths()).toHaveValue('0');
    expect(s.sheet.getByText(words.weight.addsWeighIn)).toBeVisible();

    await s.user.selectOptions(s.wheel(), '62');
    await s.user.selectOptions(s.tenths(), '4');
    await s.save();

    await untilGone(s.ui);
    await until(() => rowValue('weight').includes('62.4 kg'));
    expect(await s.repos.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 62.4 },
    ]);
    expect((await s.stored()).weightKg).toBe(62.4);
  });

  it('shows kg with no unit toggle for a person whose stored unit is lb, and an unmoved Save keeps the exact kg (D-16.91)', async () => {
    const s = await openSheet('weight', {
      profile: makeProfile({ weightKg: 70.04, goal: 'maintain' }),
      weight: 'lb',
    });

    expect(s.sheet.queryByRole('radiogroup')).toBeNull();
    expect(s.sheet.queryByRole('radio')).toBeNull();
    expect(s.wheel()).toHaveValue('70');
    expect(s.tenths()).toHaveValue('0');
    expect(rowValue('weight')).toContain('70.0 kg');
    expect(document.body.textContent).not.toMatch(/\blb\b/);

    await s.save();
    await untilGone(s.ui);
    const [weighIn] = await s.repos.weightRepo.history();
    expect(weighIn?.kg).toBe(70.04);
  });

  it('opens a weight below the wheel at its 20 kg end and stores what it shows (D-16.80)', async () => {
    const s = await openSheet('weight', {
      profile: makeProfile({ weightKg: 19.9, goal: 'maintain' }),
    });

    expect(s.wheel()).toHaveValue('20');
    expect(s.tenths()).toHaveValue('0');

    await s.save();
    await untilGone(s.ui);
    expect((await s.stored()).weightKg).toBe(20);
  });

  it('keeps a weight the wheel can show, and holds one it cannot', () => {
    expect(heldOnWheel(70.04, 'kg')).toBe(70.04);
    expect(heldOnWheel(251, 'kg')).toBe(250);
    expect(heldOnWheel(19.96, 'kg')).toBe(19.96);
    expect(heldOnWheel(19.9, 'kg')).toBe(20);
  });
});

describe('WeightSheet: the goal weight (D-16.11)', () => {
  it('shows why a lose goal above the current weight is refused and saves nothing (ACC-B12-2)', async () => {
    const s = await openSheet('goalWeight', {
      profile: makeProfile({ goal: 'lose', weightKg: 70, goalWeightKg: 65 }),
    });
    expect(s.wheel()).toHaveValue('65');
    expect(s.sheet.getByText('You weigh 70.0 kg now.')).toBeVisible();

    await s.user.selectOptions(s.wheel(), '72');
    await s.save();

    const alert = await s.sheet.findByRole('alert');
    expect(alert).toHaveTextContent(
      'To lose weight, the goal has to be below 70.0 kg. Nothing was saved.',
    );
    expect(document.querySelector(s.ui)).not.toBeNull();
    expect((await s.stored()).goalWeightKg).toBe(65);

    // Moving the wheel clears the reason; a goal below the weight is kept.
    await s.user.selectOptions(s.wheel(), '68');
    expect(s.sheet.queryByRole('alert')).toBeNull();
    await s.save();
    await untilGone(s.ui);
    await until(() => rowValue('goalWeight').includes('68.0 kg'));
    expect((await s.stored()).goalWeightKg).toBe(68);
  });

  it('refuses a gain goal that reads the same as the current weight, in kg even with lb stored', async () => {
    const s = await openSheet('goalWeight', {
      profile: makeProfile({ goal: 'gain', weightKg: 70.02, goalWeightKg: 75 }),
      weight: 'lb',
    });
    expect(rowValue('weight')).toContain('70.0 kg');
    expect(rowValue('goalWeight')).toContain('75.0 kg');

    await s.user.selectOptions(s.wheel(), '70');
    await s.user.selectOptions(s.tenths(), '0');
    await s.save();

    expect(await s.sheet.findByRole('alert')).toHaveTextContent(
      'To gain weight, the goal has to be above 70.0 kg. Nothing was saved.',
    );
    expect((await s.stored()).goalWeightKg).toBe(75);
  });

  it('opens on the current weight when no goal weight is set', async () => {
    const s = await openSheet('goalWeight', {
      profile: makeProfile({ goal: 'gain', weightKg: 58.6, goalWeightKg: undefined }),
    });
    expect(s.wheel()).toHaveValue('58');
    expect(s.tenths()).toHaveValue('6');
    expect(rowValue('goalWeight')).toContain(words.value.notSet);
  });
});
