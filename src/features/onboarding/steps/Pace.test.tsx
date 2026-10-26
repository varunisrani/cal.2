import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { IMPERIAL, renderWizard, wizardAt } from '../testing/renderWizard';

const words = onboarding.onboarding.pace;

function days(): HTMLElement {
  return screen.getByRole('region', { name: words.daysTitle });
}

describe('Pace', () => {
  it('estimates 70 days from 70 to 65 kg at 0.5 kg a week (ACC-B2-2)', () => {
    renderWizard({ state: wizardAt('pace', { goal: 'lose', targetKg: 65 }) });

    expect(screen.getByRole('radio', { name: words.steady })).toBeChecked();
    expect(screen.getByText('0.5 kg')).toBeVisible();
    expect(screen.getByText(words.perWeek)).toBeVisible();
    expect(screen.getByText(words.steadyNote)).toBeVisible();
    expect(days()).toHaveTextContent('About 70 days');
  });

  it('reads the weekly amount in pounds for an imperial person: "1.1 lb"', () => {
    renderWizard({ state: wizardAt('pace', { goal: 'gain', units: IMPERIAL, targetKg: 75 }) });

    expect(screen.getByText('1.1 lb')).toBeVisible();
    expect(screen.getByText(words.gainSubtitle)).toBeVisible();
    expect(days()).toHaveTextContent('About 70 days');
  });

  it('changes the amount, note and days with the pace', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('pace', { goal: 'lose', targetKg: 65 }) });

    await user.click(screen.getByRole('radio', { name: words.fast }));
    expect(latest().pace).toBe('fast');
    expect(screen.getByText('1 kg')).toBeVisible();
    expect(screen.getByText(words.fastNote)).toBeVisible();
    expect(days()).toHaveTextContent('About 35 days');

    await user.click(screen.getByRole('radio', { name: words.slow }));
    expect(screen.getByText('0.25 kg')).toBeVisible();
    expect(days()).toHaveTextContent('About 140 days');
  });

  it('only confirms a steady plan when the goal is to keep the weight', () => {
    renderWizard({ state: wizardAt('pace', { goal: 'maintain' }) });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(words.maintainTitle);
    expect(screen.getByText(words.maintainDone)).toBeVisible();
    expect(screen.queryByRole('radiogroup', { name: words.label })).toBeNull();
    expect(screen.queryByRole('region', { name: words.daysTitle })).toBeNull();
    expect(
      screen.getByRole('button', { name: onboarding.onboarding.wizard.continue }),
    ).toBeEnabled();
  });
});
