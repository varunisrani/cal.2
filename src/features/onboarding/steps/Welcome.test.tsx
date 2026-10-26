import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { renderWizard } from '../testing/renderWizard';

const words = onboarding.onboarding.welcome;

describe('Welcome', () => {
  it('shows the mark, a two-line headline, a line about the app and a four-point tour', () => {
    const { container } = renderWizard();

    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    const headline = screen.getByRole('heading', { level: 1 });
    expect(headline).toHaveTextContent(`${words.headlineTop} ${words.headlineBottom}`);
    expect(screen.getByText(words.lead)).toBeVisible();
    const tour = screen.getByRole('list', { name: words.tourLabel });
    expect(
      within(tour)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([words.tour.photo, words.tour.coach, words.tour.key, words.tour.device]);
  });

  it('offers restoring from a backup file, calling the handler it is given', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const { latest } = renderWizard({ onRestore });

    const restore = screen.getByRole('button', { name: words.restore });
    expect(restore).toHaveAttribute('data-ui', 'wizard.restore');
    await user.click(restore);

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(latest().step).toBe('welcome');
  });

  it('keeps the restore link even before restoring is wired, and it does nothing', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard();

    await user.click(screen.getByRole('button', { name: words.restore }));

    expect(latest().step).toBe('welcome');
  });

  it('starts the wizard with Get started', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard();

    const start = screen.getByRole('button', { name: words.start });
    expect(start).toHaveAttribute('data-ui', 'wizard.start');
    await user.click(start);

    expect(latest().step).toBe('sex');
  });
});
