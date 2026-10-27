import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PROFILE_KEY } from '../../../data/schema';
import { needsRebuild, planInputsKey } from '../../../domain/profile/signature';
import { common } from '../../../i18n/en/common';
import { onboarding } from '../../../i18n/en/onboarding';
import { profile as profileWords } from '../../../i18n/en/profile';
import { makeProfile } from '../../../test/factories';
import { untilLoaded } from '../../../test/lazy';
import { closeHarnesses, until, untilGone, untilShown } from '../../../test/screenHarness';
import { categoryFor } from '../registry';
import { SettingsScreen } from '../SettingsScreen';
import { ProfilePage } from './ProfilePage';
import { openProfile, type ProfileSetup } from './testing/openProfile';

afterEach(closeHarnesses);

const words = profileWords.profile;
const wizard = onboarding.onboarding;

const row = (field: string): HTMLElement | null =>
  document.querySelector(`[data-ui="profile.${field}"]`);
const rowValue = (field: string): string => row(field)?.textContent ?? '';

/** A profile with a plan of its own: pinned targets and locks no edit may touch (R01.12). */
const PLANNED = makeProfile({
  sex: 'female',
  birthDate: '1994-03-14',
  heightCm: 168,
  weightKg: 64,
  activity: 'light',
  goal: 'lose',
  weeklyKg: 0.5,
  goalWeightKg: 60,
  saved: { kcal: 1_700, protein: 120, carbs: 180, fat: 55 },
  caloriesLocked: true,
  lockedMacros: ['protein'],
});

async function openPage(setup: ProfileSetup) {
  const user = userEvent.setup();
  const h = await openProfile(setup);
  h.mount(<ProfilePage />);
  if (setup.profile) await untilShown('[data-ui="profile.sex"]');
  const open = (field: string) => user.click(row(field) as HTMLElement);
  return { ...h, user, open };
}

describe('ProfilePage', () => {
  it('shows each stored value in the person’s units, metric', async () => {
    await openPage({ profile: PLANNED });

    expect(screen.getByText(words.planNote)).toBeVisible();
    expect(rowValue('sex')).toBe(`${words.rows.sex}${wizard.sex.female}`);
    expect(rowValue('birthday')).toContain('Mar 14, 1994 (32 years old)');
    expect(rowValue('height')).toContain('168 cm');
    expect(rowValue('weight')).toContain('64.0 kg');
    expect(rowValue('bodyFat')).toContain(words.value.notSet);
    expect(row('goalBodyFat')).toBeNull();
    expect(rowValue('activity')).toContain(wizard.activity.levels.light.name);
    expect(rowValue('goal')).toContain(words.goal.lose);
    expect(rowValue('pace')).toContain('0.5 kg a week');
    expect(rowValue('goalWeight')).toContain('60.0 kg');
    expect(rowValue('allergens')).toContain(words.value.none);
    expect(screen.getByRole('button', { name: 'Weight: 64.0 kg' })).toBe(row('weight'));
  });

  it('shows feet and inches, pounds, body fat and its goal, and the allergen list', async () => {
    await openPage({
      profile: makeProfile({
        ...PLANNED,
        heightCm: 170,
        weightKg: 70,
        goalWeightKg: 65,
        bodyFat: 0.183,
        goalBodyFat: 0.15,
        allergens: ['Peanut', 'Sesame'],
      }),
      weight: 'lb',
      height: 'ftIn',
    });

    expect(rowValue('height')).toContain('5 ft 7 in');
    expect(rowValue('weight')).toContain('154.3 lb');
    expect(rowValue('pace')).toContain('1.1 lb a week');
    expect(rowValue('goalWeight')).toContain('143.3 lb');
    expect(rowValue('bodyFat')).toContain('18.3 %');
    expect(rowValue('goalBodyFat')).toContain('15 %');
    expect(rowValue('allergens')).toContain('Peanut, Sesame');
  });

  it('hides pace and goal weight once the goal is switched to maintain', async () => {
    const page = await openPage({ profile: PLANNED });

    await page.open('goal');
    const picker = within(screen.getByRole('dialog', { name: words.rows.goal }));
    await page.user.click(picker.getByRole('option', { name: words.goal.maintain }));

    await until(() => row('pace') === null);
    expect(row('goalWeight')).toBeNull();
    expect(rowValue('goal')).toContain(words.goal.maintain);
    const after = await page.stored();
    expect(after).not.toHaveProperty('weeklyKg');
    expect(after).not.toHaveProperty('goalWeightKg');
  });

  it('leaves the targets unchanged and raises the rebuild nudge when activity is edited (R01.12)', async () => {
    const page = await openPage({ profile: PLANNED, baseline: planInputsKey(PLANNED) });

    await page.open('activity');
    const picker = within(screen.getByRole('dialog', { name: words.rows.activity }));
    await page.user.click(
      picker.getByRole('option', { name: new RegExp(wizard.activity.levels.athlete.name) }),
    );

    await until(() => rowValue('activity').includes(wizard.activity.levels.athlete.name));
    const after = await page.stored();
    expect(after.activity).toBe('athlete');
    expect(after.saved).toEqual(PLANNED.saved);
    expect(after.caloriesLocked).toBe(true);
    expect(after.lockedMacros).toEqual(['protein']);
    const baseline = await page.repos.settingsRepo.get('goals.rebuildBaseline');
    expect(baseline).toBe(planInputsKey(PLANNED));
    expect(needsRebuild(after, baseline)).toBe(true);
  });

  it('offers Slow, Steady and Fast with the amount a week, and stores the pick', async () => {
    const page = await openPage({ profile: PLANNED });

    await page.open('pace');
    const picker = within(screen.getByRole('dialog', { name: words.rows.pace }));
    expect(picker.getAllByRole('option').map((option) => option.textContent)).toEqual([
      `${wizard.pace.slow}0.25 kg a week`,
      `${wizard.pace.steady}0.5 kg a week`,
      `${wizard.pace.fast}1 kg a week`,
    ]);
    expect(picker.getByRole('option', { name: /Steady/ })).toHaveAttribute('aria-selected', 'true');
    await page.user.click(picker.getByRole('option', { name: /Fast/ }));

    await until(() => rowValue('pace').includes('1 kg a week'));
    expect((await page.stored()).weeklyKg).toBe(1);
  });

  it('sets body fat, which brings the goal row; Remove takes both away', async () => {
    const page = await openPage({ profile: PLANNED });
    const save = (name: string) =>
      page.user.click(
        within(screen.getByRole('dialog', { name })).getByRole('button', {
          name: common.common.save,
        }),
      );

    await page.open('bodyFat');
    const sheet = within(screen.getByRole('dialog', { name: words.rows.bodyFat }));
    const wheel = sheet.getByRole('combobox', { name: words.bodyFat.wheel });
    expect(wheel).toHaveValue('20');
    expect(sheet.queryByRole('button', { name: words.bodyFat.remove })).toBeNull();
    await page.user.selectOptions(wheel, '18.5');
    await save(words.rows.bodyFat);
    await untilGone('[data-ui="profile.bodyFat.sheet"]');
    await until(() => rowValue('bodyFat').includes('18.5 %'));
    expect(rowValue('goalBodyFat')).toContain(words.value.notSet);

    // The goal opens on the body fat and says what it is now.
    await page.open('goalBodyFat');
    const goal = within(screen.getByRole('dialog', { name: words.rows.goalBodyFat }));
    expect(goal.getByText('Your body fat is 18.5 % now.')).toBeVisible();
    await page.user.selectOptions(
      goal.getByRole('combobox', { name: words.bodyFat.goalWheel }),
      '15',
    );
    await save(words.rows.goalBodyFat);
    await until(() => rowValue('goalBodyFat').includes('15 %'));

    await page.open('bodyFat');
    const again = within(screen.getByRole('dialog', { name: words.rows.bodyFat }));
    expect(again.getByText(words.bodyFat.removeNote)).toBeVisible();
    await page.user.click(again.getByRole('button', { name: words.bodyFat.remove }));

    await until(() => row('goalBodyFat') === null);
    expect(rowValue('bodyFat')).toContain(words.value.notSet);
    const after = await page.stored();
    expect(after).not.toHaveProperty('bodyFat');
    expect(after).not.toHaveProperty('goalBodyFat');
  });

  it('keeps an exact body fat that is off the wheel when Save is pressed unmoved', async () => {
    const page = await openPage({ profile: makeProfile({ ...PLANNED, bodyFat: 0.183 }) });

    await page.open('bodyFat');
    const sheet = within(screen.getByRole('dialog', { name: words.rows.bodyFat }));
    expect(sheet.getByRole('combobox', { name: words.bodyFat.wheel })).toHaveValue('18.5');
    await page.user.click(sheet.getByRole('button', { name: common.common.save }));

    await untilGone('[data-ui="profile.bodyFat.sheet"]');
    expect((await page.stored()).bodyFat).toBe(0.183);
  });

  it('changes sex from its list and the birthday from the date input, showing the age', async () => {
    const page = await openPage({ profile: PLANNED });

    await page.open('sex');
    const sexes = within(screen.getByRole('dialog', { name: words.rows.sex }));
    await page.user.click(sexes.getByRole('option', { name: wizard.sex.other }));
    await until(() => rowValue('sex').includes(wizard.sex.other));

    await page.open('birthday');
    const sheet = within(screen.getByRole('dialog', { name: words.rows.birthday }));
    fireEvent.change(sheet.getByLabelText(words.birthday.label), {
      target: { value: '2000-10-27' },
    });
    expect(sheet.getByText('That makes you 25 years old.')).toBeVisible();
    await page.user.click(sheet.getByRole('button', { name: common.common.save }));

    await until(() => rowValue('birthday').includes('Oct 27, 2000 (25 years old)'));
    expect(await page.stored()).toMatchObject({ sex: 'other', birthDate: '2000-10-27' });
  });

  it('says why nothing can be edited without a readable profile', async () => {
    await openPage({ profile: null });
    await untilShown('[data-ui="profile.unavailable"]');
    expect(screen.getByText(words.missing)).toBeVisible();
    expect(row('sex')).toBeNull();
  });

  it('says the details cannot be read when the stored profile is damaged', async () => {
    const h = await openProfile({ profile: null });
    await h.db.table('profile').put({ id: PROFILE_KEY, sex: 'male' });
    h.mount(<ProfilePage />);
    await untilShown('[data-ui="profile.unavailable"]');
    expect(screen.getByText(words.unreadable)).toBeVisible();
  });

  it('is the Personal info category at #/settings/profile, under the back link and its title', async () => {
    expect(categoryFor(['profile'])).toMatchObject({
      id: 'profile',
      titleKey: 'profile.title',
      group: 'prefs',
    });

    // The page is fetched on first open (P10-08), so it is known by what it draws: ProfilePage's
    // rows under the category's title.
    const h = await openProfile({ profile: PLANNED });
    h.mount(<SettingsScreen nested={['profile']} />);
    expect(screen.getByRole('heading', { level: 1, name: words.title })).toBeVisible();
    await untilLoaded();
    await untilShown('[data-ui="profile.sex"]');
  });
});
