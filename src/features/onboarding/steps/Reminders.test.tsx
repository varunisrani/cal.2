import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onboarding } from '../../../i18n/en/onboarding';
import { renderWizard, wizardAt } from '../testing/renderWizard';
import { remindersOn, type AskNotifications } from '../wizard';

const words = onboarding.onboarding.reminders;
const continueName = onboarding.onboarding.wizard.continue;

/** Inside the Android app: the shell's bridge says so. */
function inAndroidApp(): void {
  vi.stubGlobal('Capacitor', { getPlatform: () => 'android' });
}

/** A page with no Notification API (the Android app's WebView, some browsers). */
function withoutNotifications(): void {
  vi.stubGlobal('Notification', undefined);
}

/** A page with a Notification API that has not been asked yet. */
function withNotifications(): void {
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: async () => 'default',
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reminders', () => {
  it('explains meal reminders and leaves them off until the person asks', () => {
    const ask = vi.fn<AskNotifications>(async () => 'granted');
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask });

    expect(screen.getByText(words.body)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(words.skip);
    expect(ask).not.toHaveBeenCalled();
    expect(remindersOn(latest())).toBe(false);
  });

  it('leaves reminders off after a denial, says how to allow them later, and continues (ACC-B5-1)', async () => {
    const user = userEvent.setup();
    const ask = vi.fn<AskNotifications>(async () => 'denied');
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask });

    await user.click(screen.getByRole('button', { name: words.ask }));

    expect(ask).toHaveBeenCalledTimes(1);
    expect(latest().reminders).toBe('denied');
    expect(remindersOn(latest())).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(words.denied);
    // Asking again cannot help once the browser blocks it.
    expect(screen.queryByRole('button', { name: words.ask })).toBeNull();

    await user.click(screen.getByRole('button', { name: continueName }));
    expect(latest().step).toBe('aiAccess');
    expect(remindersOn(latest())).toBe(false);
  });

  it('turns the reminders master switch on after a grant', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({
      state: wizardAt('reminders'),
      ask: async () => 'granted',
    });

    const button = screen.getByRole('button', { name: words.ask });
    expect(button).toHaveAttribute('data-ui', 'wizard.reminders.ask');
    await user.click(button);

    expect(remindersOn(latest())).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(words.granted);
    expect(screen.queryByRole('button', { name: words.ask })).toBeNull();
  });

  it('keeps reminders off when the prompt is closed, and lets the person ask again', async () => {
    const user = userEvent.setup();
    const ask = vi
      .fn<AskNotifications>()
      .mockResolvedValueOnce('default')
      .mockResolvedValueOnce('granted');
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask });

    await user.click(screen.getByRole('button', { name: words.ask }));
    expect(latest().reminders).toBe('dismissed');
    expect(screen.getByRole('status')).toHaveTextContent(words.dismissed);

    await user.click(screen.getByRole('button', { name: words.ask }));
    expect(remindersOn(latest())).toBe(true);
  });

  it('keeps reminders off when the browser has no notifications', async () => {
    const user = userEvent.setup();
    const { latest } = renderWizard({
      state: wizardAt('reminders'),
      ask: async () => {
        throw new TypeError('Notification is not defined');
      },
    });

    await user.click(screen.getByRole('button', { name: words.ask }));

    expect(latest().reminders).toBe('unsupported');
    expect(screen.getByRole('status')).toHaveTextContent(words.unsupported);
  });

  it('says reminders are not available in the Android app, where the home screen cannot help (P11)', async () => {
    inAndroidApp();
    withoutNotifications();
    const user = userEvent.setup();
    const ask = vi.fn<AskNotifications>(async () => 'unsupported');
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask });

    // Nothing to turn on there: no button, the explanation and the app's own line (ACC-M11-9).
    expect(screen.queryByRole('button', { name: words.ask })).toBeNull();
    expect(document.querySelector('[data-ui="wizard.reminders.ask"]')).toBeNull();
    expect(screen.getByText(words.body)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(words.unsupportedAndroid);
    expect(screen.getByRole('status')).not.toHaveTextContent(/home screen/);

    await user.click(screen.getByRole('button', { name: continueName }));
    expect(latest()).toMatchObject({ step: 'aiAccess', reminders: null });
    expect(remindersOn(latest())).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('keeps the button in the Android app where the page has notifications, and says so if they fail', async () => {
    inAndroidApp();
    withNotifications();
    const user = userEvent.setup();
    const { latest } = renderWizard({
      state: wizardAt('reminders'),
      ask: async () => 'unsupported',
    });

    expect(screen.getByRole('status')).toHaveTextContent(words.skip);
    await user.click(screen.getByRole('button', { name: words.ask }));

    expect(latest().reminders).toBe('unsupported');
    expect(remindersOn(latest())).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(words.unsupportedAndroid);
  });

  it('keeps the button on the web, also where the browser has no notifications (ACC-M11-9)', async () => {
    withoutNotifications();
    const user = userEvent.setup();
    const { latest } = renderWizard({
      state: wizardAt('reminders'),
      ask: async () => 'unsupported',
    });

    expect(screen.getByRole('status')).toHaveTextContent(words.skip);
    await user.click(screen.getByRole('button', { name: words.ask }));

    expect(latest().reminders).toBe('unsupported');
    expect(screen.getByRole('status')).toHaveTextContent(words.unsupported);
  });

  it('skips with Continue without asking', async () => {
    const user = userEvent.setup();
    const ask = vi.fn<AskNotifications>(async () => 'granted');
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask });

    await user.click(screen.getByRole('button', { name: continueName }));

    expect(latest()).toMatchObject({ step: 'aiAccess', reminders: null });
    expect(ask).not.toHaveBeenCalled();
  });
});
