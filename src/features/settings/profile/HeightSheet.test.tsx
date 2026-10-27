import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CM_PER_INCH, type HeightDisplayUnit } from '../../../domain/units/body';
import { common } from '../../../i18n/en/common';
import { onboarding } from '../../../i18n/en/onboarding';
import { profile as profileWords } from '../../../i18n/en/profile';
import { makeProfile } from '../../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../../test/screenHarness';
import { heldHeight } from './HeightSheet';
import { ProfilePage } from './ProfilePage';
import { openProfile } from './testing/openProfile';

afterEach(closeHarnesses);

const words = profileWords.profile;
const body = onboarding.onboarding.body;
const UI = '[data-ui="profile.height.sheet"]';

const rowValue = (): string =>
  document.querySelector('[data-ui="profile.height"]')?.textContent ?? '';

async function openSheet(heightCm: number, height: HeightDisplayUnit = 'cm') {
  const user = userEvent.setup();
  const h = await openProfile({ profile: makeProfile({ heightCm }), height });
  h.mount(<ProfilePage />);
  await untilShown('[data-ui="profile.height"]');
  await user.click(document.querySelector('[data-ui="profile.height"]') as HTMLElement);
  const sheet = within(screen.getByRole('dialog', { name: words.rows.height }));
  const wheel = (name: string) => sheet.getByRole('combobox', { name });
  const save = () => user.click(sheet.getByRole('button', { name: common.common.save }));
  return { ...h, user, sheet, wheel, save };
}

describe('HeightSheet', () => {
  it('stores ft-in with the toggle and shows 170 cm as 5 ft 7 in; an unmoved Save keeps 170 cm', async () => {
    const s = await openSheet(170);
    expect(s.wheel(body.centimetres)).toHaveValue('170');

    await s.user.click(s.sheet.getByRole('radio', { name: words.units.ftIn }));

    expect(s.wheel(body.feet)).toHaveValue('5');
    expect(s.wheel(body.inches)).toHaveValue('7');
    expect(s.sheet.queryByRole('combobox', { name: body.centimetres })).toBeNull();
    await until(() => rowValue().includes('5 ft 7 in'));
    expect(await s.repos.settingsRepo.get('units.height')).toBe('ftIn');

    await s.save();
    await untilGone(UI);
    expect((await s.stored()).heightCm).toBe(170);
  });

  it('stores a feet and inches pick unrounded, and a cm pick in whole cm', async () => {
    const s = await openSheet(170, 'ftIn');

    await s.user.selectOptions(s.wheel(body.feet), '6');
    await s.user.selectOptions(s.wheel(body.inches), '0');
    await s.save();
    await untilGone(UI);
    expect((await s.stored()).heightCm).toBeCloseTo(72 * CM_PER_INCH, 9);
    await until(() => rowValue().includes('6 ft 0 in'));

    await s.user.click(document.querySelector('[data-ui="profile.height"]') as HTMLElement);
    const again = within(screen.getByRole('dialog', { name: words.rows.height }));
    await s.user.click(again.getByRole('radio', { name: words.units.cm }));
    expect(again.getByRole('combobox', { name: body.centimetres })).toHaveValue('183');
    await s.user.selectOptions(again.getByRole('combobox', { name: body.centimetres }), '181');
    await s.user.click(again.getByRole('button', { name: common.common.save }));
    await untilGone(UI);
    expect((await s.stored()).heightCm).toBe(181);
  });

  it('holds a height the new wheels cannot show at their end', () => {
    expect(heldHeight(170, 'ftIn')).toBe(170);
    // 8 ft 11 in is 271.78 cm: past the 250 cm end of the cm wheel.
    expect(heldHeight(107 * CM_PER_INCH, 'cm')).toBe(250);
    expect(heldHeight(99.4, 'cm')).toBe(100);
    expect(heldHeight(80, 'ftIn')).toBeCloseTo(36 * CM_PER_INCH, 9);
  });
});
