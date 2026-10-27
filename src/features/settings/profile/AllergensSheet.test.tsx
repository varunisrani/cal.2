import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { common } from '../../../i18n/en/common';
import { profile as profileWords } from '../../../i18n/en/profile';
import { makeProfile } from '../../../test/factories';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { ProfilePage } from './ProfilePage';
import { openProfile } from './testing/openProfile';

afterEach(closeHarnesses);

const words = profileWords.profile;

const rowValue = (): string =>
  document.querySelector('[data-ui="profile.allergens"]')?.textContent ?? '';

async function openSheet(allergens: readonly string[]) {
  const user = userEvent.setup();
  const h = await openProfile({ profile: makeProfile({ allergens }) });
  h.mount(<ProfilePage />);
  await untilShown('[data-ui="profile.allergens"]');
  await user.click(document.querySelector('[data-ui="profile.allergens"]') as HTMLElement);
  const sheet = within(screen.getByRole('dialog', { name: words.rows.allergens }));
  const field = () => sheet.getByLabelText(words.allergens.field);
  const add = () => sheet.getByRole('button', { name: common.common.add });
  const names = () =>
    Array.from(document.querySelectorAll('[data-ui="profile.allergens.sheet.name"]'), (item) =>
      item.textContent?.trim(),
    );
  return { ...h, user, sheet, field, add, names };
}

describe('AllergensSheet', () => {
  it('adds names as typed, trimmed, and stores each one at once', async () => {
    const s = await openSheet([]);
    expect(s.sheet.getByText(words.allergens.empty)).toBeVisible();
    expect(s.add()).toBeDisabled();

    await s.user.type(s.field(), '  Peanut ');
    await s.user.click(s.add());
    await until(() => s.names().length === 1);
    expect(s.field()).toHaveValue('');

    await s.user.type(s.field(), 'sesame   seeds{Enter}');
    await until(() => s.names().length === 2);

    expect(s.names()).toEqual(['Peanut', 'sesame seeds']);
    expect((await s.stored()).allergens).toEqual(['Peanut', 'sesame seeds']);
    await until(() => rowValue().includes('Peanut, sesame seeds'));
  });

  it('does not add a name already on the list, in any case, and says so', async () => {
    const s = await openSheet(['Milk']);

    await s.user.type(s.field(), ' milk {Enter}');

    expect(await s.sheet.findByRole('status')).toHaveTextContent('milk is already on the list.');
    expect(s.names()).toEqual(['Milk']);
    expect((await s.stored()).allergens).toEqual(['Milk']);

    // Typing again clears the message.
    await s.user.type(s.field(), 's');
    expect(s.sheet.queryByRole('status')).toBeNull();
  });

  it('removes a name with its own button and keeps the rest in order', async () => {
    const s = await openSheet(['Milk', 'Egg', 'Soy']);

    await s.user.click(s.sheet.getByRole('button', { name: 'Remove Egg' }));

    await until(() => s.names().length === 2);
    expect(s.names()).toEqual(['Milk', 'Soy']);
    expect((await s.stored()).allergens).toEqual(['Milk', 'Soy']);

    await s.user.click(s.sheet.getByRole('button', { name: 'Remove Milk' }));
    await s.user.click(s.sheet.getByRole('button', { name: 'Remove Soy' }));
    await until(() => s.names().length === 0);
    expect(s.sheet.getByText(words.allergens.empty)).toBeVisible();
    await until(() => rowValue().includes(words.value.none));
  });
});
