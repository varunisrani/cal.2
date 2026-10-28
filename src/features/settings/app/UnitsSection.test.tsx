import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../../domain/model';
import { appSettings } from '../../../i18n/en/appSettings';
import { home } from '../../../i18n/en/home';
import { price as priceWords } from '../../../i18n/en/price';
import { profile as profileWords } from '../../../i18n/en/profile';
import { makeEntry, makeProfile } from '../../../test/factories';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { HomePage } from '../../home/HomePage';
import { settle } from '../../water/testing/openWater';
import { ProfilePage } from '../profile/ProfilePage';
import { deferred, openAppSettings, type AppSettingsHarness } from './testing/openAppSettings';
import { UnitsSection } from './UnitsSection';

afterEach(closeHarnesses);

const words = appSettings.appSettings;
const units = profileWords.profile.units;
const CARD = '[data-ui="appSettings.units"]';

const group = (name: string) => screen.getByRole('radiogroup', { name });
const checkedIn = (name: string) =>
  within(group(name))
    .getAllByRole('radio')
    .filter((choice) => choice.getAttribute('aria-checked') === 'true')
    .map((choice) => choice.textContent);
const choose = (name: string, choice: string) =>
  fireEvent.click(within(group(name)).getByRole('radio', { name: choice }));
/** The text of the element `data-ui` names, or '' when there is none. */
const textOf = (hook: string) => document.querySelector(`[data-ui="${hook}"]`)?.textContent ?? '';

async function storedProfile(h: AppSettingsHarness): Promise<Profile> {
  const read = await h.repos.profileRepo.get();
  if (read.kind !== 'ok') throw new Error(`no stored profile: ${read.kind}`);
  return read.value;
}

describe('UnitsSection', () => {
  it('shows energy and height as two settings with the stored units, and the note that weight is kg', async () => {
    const h = await openAppSettings();
    await h.repos.settingsRepo.set('units.energy', 'kJ');
    await h.repos.settingsRepo.set('units.height', 'ftIn');
    h.mount(<UnitsSection />);
    await untilShown(CARD);

    expect(screen.getByRole('heading', { level: 2, name: words.units.heading })).toBeVisible();
    expect(
      screen.getAllByRole('radiogroup').map((choices) => choices.getAttribute('aria-label')),
    ).toEqual([words.units.energy, words.units.height]);
    expect(checkedIn(words.units.energy)).toEqual([home.home.unit.kJ]);
    expect(checkedIn(words.units.height)).toEqual([units.ftIn]);
    expect(screen.getByText(words.units.note)).toBeVisible();
    expect(words.units.note).toContain('Weight is always in kg.');
  });

  it('shows Kilojoules and 8,368 kJ for a 2,000 kcal goal once kJ is chosen, and keeps every stored kcal (ACC-C12-1)', async () => {
    const h = await openAppSettings({ hash: '#/home' });
    const profile = makeProfile({ saved: { kcal: 2_000 } });
    await h.repos.profileRepo.save(profile);
    const yesterday = await h.repos.diaryRepo.add(
      makeEntry({ kcal: 640, loggedAt: Date.parse('2026-10-25T13:00:00-04:00') }),
    );
    h.mount(
      <>
        <HomePage />
        <UnitsSection />
      </>,
    );
    await untilShown(CARD);
    await until(() => textOf('home.gauge').startsWith(home.home.gauge.heading.kcal));
    expect(textOf('home.gauge')).toContain('2,000 left');

    choose(words.units.energy, home.home.unit.kJ);

    expect(checkedIn(words.units.energy)).toEqual([home.home.unit.kJ]);
    await until(() => textOf('home.gauge').startsWith(home.home.gauge.heading.kJ));
    expect(textOf('home.gauge')).toContain('8,368 left');
    expect(await h.repos.settingsRepo.get('units.energy')).toBe('kJ');
    expect(await storedProfile(h)).toEqual(profile);
    expect(await h.repos.diaryRepo.byDay('2026-10-25')).toEqual([yesterday]);
  });

  it('keeps 175 cm when the height unit changes, and Personal info shows it in feet and inches', async () => {
    const h = await openAppSettings({ hash: '#/settings/profile' });
    const profile = makeProfile({ heightCm: 175 });
    await h.repos.profileRepo.save(profile);
    await h.repos.settingsRepo.set('units.height', 'cm');
    h.mount(
      <>
        <ProfilePage />
        <UnitsSection />
      </>,
    );
    await untilShown(CARD);
    await until(() => textOf('profile.height').includes('175 cm'));

    choose(words.units.height, units.ftIn);

    await until(() => textOf('profile.height').includes('5 ft 9 in'));
    expect(await h.repos.settingsRepo.get('units.height')).toBe('ftIn');
    expect((await storedProfile(h)).heightCm).toBe(175);
  });

  it('offers no weight unit: weight reads kg next to height in feet and inches, even with lb stored (ACC-J3-1, D-16.91)', async () => {
    const h = await openAppSettings({ hash: '#/settings/profile' });
    await h.repos.profileRepo.save(makeProfile({ heightCm: 168, weightKg: 64 }));
    await h.repos.settingsRepo.set('units.height', 'cm');
    // As an earlier build stored it.
    await h.db.settings.put({ key: 'units.weight', value: 'lb' });
    h.mount(
      <>
        <ProfilePage />
        <UnitsSection />
      </>,
    );
    await untilShown(CARD);
    await until(() => textOf('profile.weight').includes('64.0 kg'));
    expect(screen.queryByRole('radiogroup', { name: /weight/i })).toBeNull();
    expect(screen.queryByRole('radio', { name: /^(kg|lb)$/ })).toBeNull();

    choose(words.units.height, units.ftIn);

    await until(() => textOf('profile.height').includes('5 ft 6 in'));
    expect(textOf('profile.weight')).toContain('64.0 kg');
    expect(await h.repos.settingsRepo.get('units.height')).toBe('ftIn');
    expect(await h.repos.settingsRepo.get('units.weight')).toBe('kg');
    expect(await storedProfile(h)).toMatchObject({ heightCm: 168, weightKg: 64 });
  });

  it('goes back to the stored unit and says so when the change cannot be saved', async () => {
    const save = deferred<void>();
    const h = await openAppSettings({ wrap: (real) => ({ ...real, set: () => save.promise }) });
    await h.repos.settingsRepo.set('units.height', 'cm');
    h.mount(<UnitsSection />);
    await untilShown(CARD);

    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    choose(words.units.height, units.ftIn);
    expect(checkedIn(words.units.height)).toEqual([units.ftIn]);

    save.reject(new Error('disk full'));
    await settle(() => document.querySelector('[data-ui="toast.message"]') !== null);
    expect(screen.getByText(words.saveFailed)).toBeVisible();
    expect(logged).toHaveBeenCalledOnce();
    expect(checkedIn(words.units.height)).toEqual([units.cm]);
    expect(await h.repos.settingsRepo.get('units.height')).toBe('cm');
  });
});

describe('UnitsSection: the currency (D-16.107)', () => {
  const PRICE = priceWords.price;

  it('shows the stored currency by code and name, and stores the one picked from the list', async () => {
    const h = await openAppSettings();
    await h.repos.settingsRepo.set('money.currency', 'INR');
    h.mount(<UnitsSection />);
    await untilShown(CARD);

    const row = screen.getByRole('button', { name: `${PRICE.currency} INR · Indian Rupee` });
    expect(row).toHaveAttribute('data-ui', 'price.currency');
    expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(row);
    const picker = await screen.findByRole('dialog', { name: PRICE.currency });
    const options = within(picker).getAllByRole('option');
    expect(options.map((option) => option.getAttribute('data-ui'))).toContain(
      'price.currency.picker.EUR',
    );
    expect(within(picker).getByRole('option', { selected: true })).toHaveTextContent('INR');

    fireEvent.click(within(picker).getByRole('option', { name: /^EUR/ }));
    await until(() => textOf('price.currency').includes('EUR · Euro'));
    expect(await h.repos.settingsRepo.get('money.currency')).toBe('EUR');
  });

  it('keeps a stored currency the list does not offer among the choices', async () => {
    const h = await openAppSettings();
    await h.repos.settingsRepo.set('money.currency', 'ISK');
    h.mount(<UnitsSection />);
    await untilShown(CARD);
    fireEvent.click(screen.getByRole('button', { name: /^Currency ISK/ }));
    const picker = await screen.findByRole('dialog', { name: PRICE.currency });
    expect(within(picker).getByRole('option', { selected: true })).toHaveTextContent('ISK');
  });
});
