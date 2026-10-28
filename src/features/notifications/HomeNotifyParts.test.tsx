import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { reminders } from '../../i18n/en/reminders';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { readDevice } from '../../services/notifications/device';
import { NotifyHeader } from './NotifyHeader';
import { inboxItem, openNotify } from './testing/openNotify';

afterEach(closeHarnesses);

// The parts are fetched on demand: load them once before the waits.
beforeAll(async () => {
  await import('./HomeNotifyParts');
});

const words = reminders.reminders;
const BELL = '[data-ui="notify.bell"]';
const CARD = '[data-ui="notify.card"]';
const PANEL = '[data-ui="notify.panel"]';

function title() {
  return <h1>Home</h1>;
}

describe('Home in the Android app: the bell (P17-04, D-16.103)', () => {
  it('shows the bell beside the title, named with the unread count', async () => {
    const h = await openNotify();
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    await waitFor(() => expect(document.querySelector(BELL)).not.toBeNull());
    expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible();
    expect(screen.getByRole('button', { name: words.settings.heading })).toBe(
      document.querySelector(BELL),
    );
    expect(document.querySelector('[data-ui="notify.bell.count"]')).toBeNull();

    await h.keep(inboxItem(FACTORY_NOW), inboxItem(FACTORY_NOW - 60_000), {
      ...inboxItem(FACTORY_NOW - 120_000),
      read: true,
    });
    await untilShown('[data-ui="notify.bell.count"]');
    expect(screen.getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible();
    expect(document.querySelector('[data-ui="notify.bell.count"]')).toHaveTextContent('2');
  });

  it('opens the panel, which marks nothing read by itself', async () => {
    const user = userEvent.setup();
    const h = await openNotify();
    await h.keep(inboxItem(FACTORY_NOW));
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    await waitFor(() =>
      expect(document.querySelector('[data-ui="notify.bell.count"]')).not.toBeNull(),
    );

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await untilShown(PANEL);
    expect(screen.getByRole('dialog', { name: words.settings.heading })).toBeVisible();
    expect(h.notify.getSnapshot().unread).toBe(1);
  });

  it('shows nothing new on the web: the title alone', async () => {
    const h = await openNotify({ web: true });
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible();
    expect(document.querySelector(BELL)).toBeNull();
    expect(document.querySelector(CARD)).toBeNull();
  });
});

describe('Home in the Android app: Let Platewise nudge you (P17-02)', () => {
  it('shows while Android has not allowed notifications, and Not now hides it for good', async () => {
    const user = userEvent.setup();
    const h = await openNotify({ permission: 'default' });
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    await waitFor(() => expect(document.querySelector(CARD)).not.toBeNull());
    expect(screen.getByRole('heading', { name: words.card.title })).toBeVisible();
    expect(screen.getByText(words.card.body)).toBeVisible();

    await user.click(screen.getByRole('button', { name: words.card.later }));
    await untilGone(CARD);
    expect(readDevice(await h.repos.settingsRepo.get('notify.device')).cardDone).toBe(true);
    expect(h.notifications.request).not.toHaveBeenCalled();
  });

  it('asks Android on Turn on, and goes once it allows', async () => {
    const user = userEvent.setup();
    const h = await openNotify({ permission: 'default' });
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    await waitFor(() => expect(document.querySelector(CARD)).not.toBeNull());

    await user.click(screen.getByRole('button', { name: words.card.turnOn }));

    expect(h.notifications.request).toHaveBeenCalledTimes(1);
    await untilGone(CARD);
    expect(readDevice(await h.repos.settingsRepo.get('notify.device')).cardDone).toBe(false);
  });

  it('goes for good when Android says no', async () => {
    const user = userEvent.setup();
    const h = await openNotify({ permission: 'default' });
    h.notifications.answerWith('denied');
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    await waitFor(() => expect(document.querySelector(CARD)).not.toBeNull());

    await user.click(screen.getByRole('button', { name: words.card.turnOn }));
    await until(() => document.querySelector(CARD) === null);
    expect(readDevice(await h.repos.settingsRepo.get('notify.device')).cardDone).toBe(true);
  });

  it('is not there once notifications are allowed', async () => {
    const h = await openNotify({ permission: 'granted' });
    h.mount(<NotifyHeader>{title()}</NotifyHeader>);
    await waitFor(() => expect(document.querySelector(BELL)).not.toBeNull());
    expect(document.querySelector(CARD)).toBeNull();
  });
});
