import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { IMPERIAL, renderWizard, wizardAt } from '../testing/renderWizard';

const words = onboarding.onboarding;

function continueButton(): HTMLElement {
  return screen.getByRole('button', { name: words.wizard.continue });
}

describe('Target', () => {
  it('names the goal, shows the current weight and opens on the seeded target', () => {
    renderWizard({ state: wizardAt('target', { goal: 'lose', targetKg: 65 }) });

    expect(screen.getByText(words.goal.lose)).toBeVisible();
    expect(screen.getByText('You weigh 70.0 kg now.')).toBeVisible();
    expect(screen.getByRole('combobox', { name: words.wizard.weight.wholeKg })).toHaveValue('65');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(continueButton()).toBeEnabled();
  });

  it('shows why a lose target above the current weight is refused and holds Continue (ACC-B4-1)', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('target', { goal: 'lose', targetKg: 65 }) });

    await user.selectOptions(
      screen.getByRole('combobox', { name: words.wizard.weight.wholeKg }),
      '72',
    );

    expect(latest()).toMatchObject({ targetKg: 72, targetMoved: true });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'To lose weight, pick a target below 70.0 kg.',
    );
    expect(continueButton()).toBeDisabled();
    await user.click(continueButton());
    expect(latest().step).toBe('target');

    await user.selectOptions(
      screen.getByRole('combobox', { name: words.wizard.weight.wholeKg }),
      '69',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(continueButton());
    expect(latest().step).toBe('pace');
  });

  it('refuses a gain target at the current weight, in the person’s unit', () => {
    renderWizard({
      state: wizardAt('target', { goal: 'gain', units: IMPERIAL, targetKg: 70, targetMoved: true }),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'To gain weight, pick a target above 154.3 lb.',
    );
    expect(screen.getByRole('combobox', { name: words.wizard.weight.wholeLb })).toHaveValue('154');
    expect(continueButton()).toBeDisabled();
  });

  it('checks nothing when the goal is to keep the weight', () => {
    renderWizard({
      state: wizardAt('target', { goal: 'maintain', targetKg: 80, targetMoved: true }),
    });

    expect(screen.getByText(words.goal.maintain)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(continueButton()).toBeEnabled();
  });
});
