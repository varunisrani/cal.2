import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LB_PER_KG } from '../../../domain/units/body';
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
  const wheel = (unit: 'kg' | 'lb') =>
    sheet.getByRole('combobox', { name: unit === 'kg' ? wheelWords.wholeKg : wheelWords.wholeLb });
  const tenths = () => sheet.getByRole('combobox', { name: wheelWords.tenths });
  const save = () => user.click(sheet.getByRole('button', { name: common.common.save }));
  return { ...h, user, sheet, wheel, tenths, save, ui: `[data-ui="profile.${field}.sheet"]` };
}

describe('WeightSheet: the current weight', () => {
  it('adds one weigh-in for now and changes the profile weight (ACC-B12-1)', async () => {
    const s = await openSheet('weight', {
      profile: makeProfile({ weightKg: 64, goal: 'maintain' }),
    });
    expect(s.wheel('kg')).toHaveValue('64');
    expect(s.tenths()).toHaveValue('0');
    expect(s.sheet.getByText(words.weight.addsWeighIn)).toBeVisible();

    await s.user.selectOptions(s.wheel('kg'), '62');
    await s.user.selectOptions(s.tenths(), '4');
    await s.save();

    await untilGone(s.ui);
    await until(() => rowValue('weight').includes('62.4 kg'));
    expect(await s.repos.weightRepo.history()).toEqual([
      { id: expect.any(String), at: FACTORY_NOW, kg: 62.4 },
    ]);
    expect((await s.stored()).weightKg).toBe(62.4);
  });

  it('stores pounds with the toggle and keeps the value, so an unmoved Save keeps the exact kg', async () => {
    const s = await openSheet('weight', {
      profile: makeProfile({ weightKg: 70, goal: 'maintain' }),
    });

    await s.user.click(s.sheet.getByRole('radio', { name: words.units.lb }));

    expect(s.wheel('lb')).toHaveValue('154');
    expect(s.tenths()).toHaveValue('3');
    await until(() => rowValue('weight').includes('154.3 lb'));
    expect(await s.repos.settingsRepo.get('units.weight')).toBe('lb');

    await s.save();
    await untilGone(s.ui);
    const [weighIn] = await s.repos.weightRepo.history();
    expect(weighIn?.kg).toBe(70);
  });

  it('holds a weight the new wheel cannot show at that wheel’s end (D-16.80)', async () => {
    const s = await openSheet('weight', {
      profile: makeProfile({ weightKg: 21, goal: 'maintain' }),
    });

    // 21 kg is 46.3 lb, under the 50 lb end of the pound wheel.
    await s.user.click(s.sheet.getByRole('radio', { name: words.units.lb }));
    expect(s.wheel('lb')).toHaveValue('50');
    expect(s.tenths()).toHaveValue('0');

    await s.save();
    await untilGone(s.ui);
    expect((await s.stored()).weightKg).toBeCloseTo(50 / LB_PER_KG, 9);
  });

  it('keeps a weight the new wheel can show, and holds one it cannot', () => {
    expect(heldOnWheel(70, 'lb')).toBe(70);
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
    expect(s.wheel('kg')).toHaveValue('65');
    expect(s.sheet.getByText('You weigh 70.0 kg now.')).toBeVisible();

    await s.user.selectOptions(s.wheel('kg'), '72');
    await s.save();

    const alert = await s.sheet.findByRole('alert');
    expect(alert).toHaveTextContent(
      'To lose weight, the goal has to be below 70.0 kg. Nothing was saved.',
    );
    expect(document.querySelector(s.ui)).not.toBeNull();
    expect((await s.stored()).goalWeightKg).toBe(65);

    // Moving the wheel clears the reason; a goal below the weight is kept.
    await s.user.selectOptions(s.wheel('kg'), '68');
    expect(s.sheet.queryByRole('alert')).toBeNull();
    await s.save();
    await untilGone(s.ui);
    await until(() => rowValue('goalWeight').includes('68.0 kg'));
    expect((await s.stored()).goalWeightKg).toBe(68);
  });

  it('refuses a gain goal that reads the same as the current weight, in pounds', async () => {
    const s = await openSheet('goalWeight', {
      profile: makeProfile({ goal: 'gain', weightKg: 70, goalWeightKg: 75 }),
      weight: 'lb',
    });

    await s.user.selectOptions(s.wheel('lb'), '154');
    await s.user.selectOptions(s.tenths(), '3');
    await s.save();

    expect(await s.sheet.findByRole('alert')).toHaveTextContent(
      'To gain weight, the goal has to be above 154.3 lb. Nothing was saved.',
    );
    expect((await s.stored()).goalWeightKg).toBe(75);
  });

  it('opens on the current weight when no goal weight is set', async () => {
    const s = await openSheet('goalWeight', {
      profile: makeProfile({ goal: 'gain', weightKg: 58.6, goalWeightKg: undefined }),
    });
    expect(s.wheel('kg')).toHaveValue('58');
    expect(s.tenths()).toHaveValue('6');
    expect(rowValue('goalWeight')).toContain(words.value.notSet);
  });
});
