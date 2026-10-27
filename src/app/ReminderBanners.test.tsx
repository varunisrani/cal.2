import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { formatTime } from '../i18n/format';
import { reminders } from '../i18n/en/reminders';
import { ServicesProvider } from '../services/context';
import type { ReminderNotice } from '../services/reminders/engine';
import { createNotifier } from '../services/reminders/notifier';
import { fakeNotifications } from '../test/notifications';
import { closeHarnesses, openHarness } from '../test/screenHarness';
import { ReminderBanners } from './ReminderBanners';

afterEach(closeHarnesses);

const words = reminders.reminders;

/** The banners on show (the harness's toast region is a status too). */
const banners = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="status"][data-ui^="shell.reminder."]'));
const LUNCH_AT = new Date('2026-10-26T12:00:00').getTime();

const lunch: ReminderNotice = {
  id: 'lunch',
  title: 'reminders.lunch.title',
  body: 'reminders.lunch.body',
  dueAt: LUNCH_AT,
  missed: true,
};

/** The banners over a notifier whose browser has not been asked about notifications. */
async function openBanners() {
  const h = await openHarness();
  const notifications = fakeNotifications('default');
  const notifier = createNotifier({
    access: notifications,
    alertSettings: async () => ({ 'remind.master': true, 'alerts.goalReached': true }),
  });
  const view = h.mount(
    <ServicesProvider services={{ ...h.services, notifier }}>
      <ReminderBanners />
    </ServicesProvider>,
  );
  return { ...h, notifier, notifications, view };
}

describe('ReminderBanners', () => {
  it('draws nothing while there is no banner, and nothing without a notifier', async () => {
    const s = await openBanners();
    expect(s.view.container).toBeEmptyDOMElement();

    const h = await openHarness();
    const bare = h.mount(<ReminderBanners />);
    expect(bare.container).toBeEmptyDOMElement();
  });

  it('shows a missed lunch with when it was due, and takes it away on Dismiss (ACC-L5-1)', async () => {
    const user = userEvent.setup();
    const s = await openBanners();

    await act(() => s.notifier.show(lunch));

    const [banner] = banners();
    expect(banner).toHaveTextContent(words.lunch.title);
    expect(banner).toHaveTextContent(words.lunch.body);
    expect(banner).toHaveTextContent(`Due at ${formatTime(LUNCH_AT)}, while Platewise was closed.`);
    expect(s.notifications.shown).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: words.banner.dismiss }));

    expect(banners()).toEqual([]);
    expect(s.notifier.banners()).toEqual([]);
  });

  it('shows one banner per reminder, without a due time for one that was not missed', async () => {
    const s = await openBanners();

    await act(() => s.notifier.show({ ...lunch, missed: false }));
    await act(() =>
      s.notifier.show({
        ...lunch,
        id: 'water',
        title: 'reminders.water.title',
        body: 'reminders.water.body',
      }),
    );

    const shown = banners();
    expect(shown.map((banner) => banner.getAttribute('data-ui'))).toEqual([
      'shell.reminder.lunch',
      'shell.reminder.water',
    ]);
    expect(shown[0]).not.toHaveTextContent('Due at');
    expect(shown[1]).toHaveTextContent('Due at');
  });
});
