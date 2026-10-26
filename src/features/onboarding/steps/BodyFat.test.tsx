import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { renderWizard, wizardAt } from '../testing/renderWizard';

const words = onboarding.onboarding.bodyFat;

describe('BodyFat', () => {
  it('starts on No with the note that the standard formula is used', () => {
    renderWizard({ state: wizardAt('bodyFat') });

    expect(screen.getByRole('radio', { name: words.no })).toBeChecked();
    expect(screen.getByText(words.formulaNote)).toBeVisible();
    expect(screen.queryByRole('combobox', { name: words.wheel })).toBeNull();
  });

  it('Yes opens a 3–60 % wheel in half steps at 20 %, with the common ranges', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('bodyFat') });

    await user.click(screen.getByRole('radio', { name: words.yes }));

    const wheel = screen.getByRole('combobox', { name: words.wheel });
    expect(wheel).toHaveValue('20');
    const values = Array.from(wheel.querySelectorAll('option'), (option) => option.value);
    expect(values.slice(0, 3)).toEqual(['3', '3.5', '4']);
    expect(values.at(-1)).toBe('60');
    expect(values).toHaveLength(115);
    expect(screen.getByText(words.ranges)).toBeVisible();
    expect(screen.queryByText(words.formulaNote)).toBeNull();
    expect(latest().bodyFat).toBe(0.2);

    await user.selectOptions(wheel, '22.5');
    expect(latest().bodyFat).toBe(0.225);
  });

  it('seeds the optional goal with the current value', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('bodyFat', { bodyFat: 0.27 }) });

    const goal = screen.getByRole('switch', { name: words.goalSwitch });
    expect(goal).not.toBeChecked();
    await user.click(goal);

    expect(goal).toBeChecked();
    expect(latest().goalBodyFat).toBe(0.27);
    const goalWheel = screen.getByRole('combobox', { name: words.goalWheel });
    expect(goalWheel).toHaveValue('27');
    await user.selectOptions(goalWheel, '18');
    expect(latest().goalBodyFat).toBe(0.18);
  });

  it('No clears a set value and its goal', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({
      state: wizardAt('bodyFat', { bodyFat: 0.25, goalBodyFat: 0.18 }),
    });
    expect(screen.getByRole('combobox', { name: words.goalWheel })).toHaveValue('18');

    await user.click(screen.getByRole('radio', { name: words.no }));

    expect(latest()).toMatchObject({ bodyFat: null, goalBodyFat: null });
    expect(screen.queryByRole('combobox', { name: words.wheel })).toBeNull();
    expect(screen.queryByRole('switch', { name: words.goalSwitch })).toBeNull();

    // Saying yes again starts from 20 % with no goal.
    await user.click(screen.getByRole('radio', { name: words.yes }));
    expect(latest()).toMatchObject({ bodyFat: 0.2, goalBodyFat: null });
  });
});
