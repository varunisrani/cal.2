import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SMART_KINDS } from '../../../domain/reminders/notices';
import { reminders } from '../../../i18n/en/reminders';
import { closeHarnesses, until, untilShown } from '../../../test/screenHarness';
import { RemindersSection } from './RemindersSection';
import { SmartNotifications } from './SmartNotifications';
import { openTracking, type TrackingSetup } from './testing/openTracking';
import { TrackingPage } from './TrackingPage';

afterEach(closeHarnesses);

const words = reminders.reminders.smart;
const CARD = '[data-ui="notify.smart"]';

async function openSmart(setup: TrackingSetup = {}) {
  const user = userEvent.setup();
  const h = await openTracking({
    system: 'android',
    permission: 'granted',
    notify: true,
    ...setup,
  });
  h.mount(<SmartNotifications />);
  await untilShown(CARD);
  return { ...h, user };
}

describe('Smart notifications (P17-02, D-16.100/101)', () => {
  it('shows a switch per kind, all on, each with a line on what it does, and Quiet hours on', async () => {
    await openSmart();

    const rows = Array.from(document.querySelectorAll(`${CARD} [role="switch"]`));
    expect(rows.map((row) => row.getAttribute('data-ui'))).toEqual([
      ...SMART_KINDS.map((kind) => `notify.smart.${kind}`),
      'notify.smart.quiet',
    ]);
    for (const row of rows) expect(row).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: words.mealCheck })).toHaveAccessibleDescription(
      words.mealCheckHint,
    );
    expect(screen.getByRole('switch', { name: words.quiet })).toHaveAccessibleDescription(
      words.quietHint,
    );
    expect(screen.getByRole('region', { name: words.heading })).toBeVisible();
  });

  it('turns a kind and Quiet hours off and on again', async () => {
    const s = await openSmart();
    const weighIn = () => screen.getByRole('switch', { name: words.weighIn });

    await s.user.click(weighIn());
    await until(() => weighIn().getAttribute('aria-checked') === 'false');
    expect(await s.repos.settingsRepo.get('notify.off')).toEqual(['weighIn']);

    const quiet = screen.getByRole('switch', { name: words.quiet });
    await s.user.click(quiet);
    await until(() => quiet.getAttribute('aria-checked') === 'false');
    expect(await s.repos.settingsRepo.get('notify.quiet')).toBe(false);

    await s.user.click(weighIn());
    await until(() => weighIn().getAttribute('aria-checked') === 'true');
    expect(s.notifications.request).not.toHaveBeenCalled();
  });

  it("asks Android when a switch goes on while notifications are not allowed, and points to Android's settings after a no", async () => {
    const s = await openSmart({ permission: 'default' });
    await s.repos.settingsRepo.set('notify.off', ['sugarOver']);
    const sugar = () => screen.getByRole('switch', { name: words.sugarOver });
    await until(() => sugar().getAttribute('aria-checked') === 'false');
    s.notifications.answerWith('denied');

    await s.user.click(sugar());

    expect(s.notifications.request).toHaveBeenCalledTimes(1);
    await until(() => sugar().getAttribute('aria-checked') === 'true');
    await untilShown('[data-ui="notify.smart.blocked"]');
    expect(document.querySelector('[data-ui="notify.smart.blocked"]')).toHaveTextContent(
      reminders.reminders.settings.blockedAndroid,
    );
  });

  it('comes last on the Tracking page in the Android app', async () => {
    const android = await openTracking({ system: 'android', notify: true });
    android.mount(<TrackingPage />);
    await untilShown(CARD);
    await untilShown('[data-ui="reminders.yours"]');
    const cards = Array.from(document.querySelectorAll('[data-ui="tracking"] > *')).map((card) =>
      card.getAttribute('data-ui'),
    );
    // The Coach's card (P17-03) sits between Your reminders and Smart notifications.
    expect(cards.slice(-3)).toEqual(['reminders.yours', 'coach.settings', 'notify.smart']);
  });

  it('is not on the Tracking page on the web', async () => {
    const web = await openTracking();
    web.mount(<TrackingPage />);
    await untilShown('[data-ui="reminders.yours"]');
    expect(document.querySelector(CARD)).toBeNull();
  });
});

describe("Only if I haven't logged it (P17-01)", () => {
  it('shows after the meal reminders in the Android app while one is on, and stores the switch', async () => {
    const user = userEvent.setup();
    const h = await openTracking({ system: 'android', permission: 'granted', notify: true });
    await h.repos.settingsRepo.set('remind.master', true);
    h.mount(<RemindersSection />);
    await untilShown('[data-ui="reminders.settings"]');
    expect(document.querySelector('[data-ui="reminders.onlyIfNotLogged"]')).toBeNull();

    await h.repos.settingsRepo.set('remind.lunch', { on: true, at: '12:00' });
    await untilShown('[data-ui="reminders.onlyIfNotLogged"]');
    const order = Array.from(
      document.querySelectorAll('[data-ui="reminders.settings"] [role="switch"]'),
    ).map((row) => row.getAttribute('data-ui'));
    expect(order.indexOf('reminders.onlyIfNotLogged')).toBe(order.indexOf('reminders.dinner') + 1);
    const only = screen.getByRole('switch', { name: words.onlyIfNotLogged });
    expect(only).toHaveAttribute('aria-checked', 'true');
    expect(only).toHaveAccessibleDescription(words.onlyIfNotLoggedHint);

    await user.click(only);
    await until(() => only.getAttribute('aria-checked') === 'false');
    expect(await h.repos.settingsRepo.get('notify.onlyIfNotLogged')).toBe(false);
  });

  it('is not there on the web', async () => {
    const h = await openTracking();
    await h.repos.settingsRepo.set('remind.master', true);
    await h.repos.settingsRepo.set('remind.lunch', { on: true, at: '12:00' });
    h.notifications.setState('granted');
    h.mount(<RemindersSection />);
    await untilShown('[data-ui="reminders.lunch"]');
    expect(document.querySelector('[data-ui="reminders.onlyIfNotLogged"]')).toBeNull();
  });
});
