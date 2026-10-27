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

  it('offers the button in the Android app, where Android asks, and turns reminders on after a grant (P13)', async () => {
    inAndroidApp();
    // The app's WebView has no Notification API: Android's own permission is asked instead.
    withoutNotifications();
    const user = userEvent.setup();
    const ask = vi.fn<AskNotifications>(async () => 'granted');
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask });

    expect(screen.getByText(words.body)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(words.skip);
    await user.click(screen.getByRole('button', { name: words.ask }));

    expect(ask).toHaveBeenCalledOnce();
    expect(remindersOn(latest())).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(words.granted);
  });

  it("points to Android's settings when Android refuses, and continues with reminders off (P13)", async () => {
    inAndroidApp();
    withoutNotifications();
    const user = userEvent.setup();
    const { latest } = renderWizard({ state: wizardAt('reminders'), ask: async () => 'denied' });

    await user.click(screen.getByRole('button', { name: words.ask }));

    expect(latest().reminders).toBe('denied');
    expect(screen.getByRole('status')).toHaveTextContent(words.deniedAndroid);
    expect(screen.getByRole('status')).not.toHaveTextContent(/browser/);
    expect(screen.queryByRole('button', { name: words.ask })).toBeNull();

    await user.click(screen.getByRole('button', { name: continueName }));
    expect(latest()).toMatchObject({ step: 'aiAccess', reminders: 'denied' });
    expect(remindersOn(latest())).toBe(false);
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
