import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { common } from '../../i18n/en/common';
import { reminders } from '../../i18n/en/reminders';
import type { NotifyService } from '../../services/notifications/contract';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { NotificationPanel } from './NotificationPanel';
import { inboxItem, openNotify } from './testing/openNotify';

afterEach(closeHarnesses);

const words = reminders.reminders.inbox;
const local = (text: string) => new Date(text).getTime();
const ITEM = '[data-ui="notify.panel.item"]';

/** The panel open over the live inbox. */
function Open({ notify }: { readonly notify: NotifyService }) {
  const view = useSyncExternalStore(notify.subscribe, notify.getSnapshot);
  return (
    <NotificationPanel
      open
      onClose={() => undefined}
      notify={notify}
      view={view}
      now={() => FACTORY_NOW}
    />
  );
}

const lunch = inboxItem(local('2026-10-26T13:00:00'), {
  id: 146,
  kind: 'mealCheck',
  title: 'Lunch',
  body: 'Nothing logged for lunch yet.',
});
const water = inboxItem(local('2026-10-25T16:00:00'), {
  id: 161,
  kind: 'waterPace',
  title: 'Water',
  body: 'You are behind on water today.',
  open: 'water',
});
const backup = inboxItem(local('2026-10-20T09:15:00'), {
  id: 380,
  kind: 'backupFailed',
  title: 'Backups are failing',
  body: 'Two in a row failed. Tap to see why.',
  open: 'data',
  read: true,
});

async function openPanel() {
  const user = userEvent.setup();
  const h = await openNotify();
  await h.keep(lunch, water, backup);
  h.mount(<Open notify={h.notify} />);
  await untilShown(ITEM);
  await until(() => document.querySelectorAll(ITEM).length === 3);
  return { ...h, user };
}

describe('the notification panel (P17-04, D-16.103)', () => {
  it('lists the items by Today, Yesterday and Earlier, each with its icon, words, time and unread mark', async () => {
    await openPanel();

    const groups = Array.from(document.querySelectorAll('[data-ui="notify.panel"] section'));
    expect(groups.map((group) => group.querySelector('h3')?.textContent)).toEqual([
      words.today,
      words.yesterday,
      words.earlier,
    ]);
    const today = within(groups[0] as HTMLElement);
    expect(today.getByText('Lunch')).toBeVisible();
    expect(today.getByText('Nothing logged for lunch yet.')).toBeVisible();
    expect(today.getByText('1:00 PM')).toBeVisible();
    expect(today.getByText(words.unread)).toBeInTheDocument();
    expect(groups[0]!.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'plate');
    expect(groups[1]!.querySelector('[data-icon]')).toHaveAttribute('data-icon', 'drop');
    const earlier = within(groups[2] as HTMLElement);
    expect(earlier.getByText('Oct 20, 9:15 AM')).toBeVisible();
    // Read already: no unread mark.
    expect(earlier.queryByText(words.unread)).toBeNull();
  });

  it('opens what an item is about and marks it read', async () => {
    const p = await openPanel();

    await p.user.click(screen.getByRole('button', { name: /^Water/ }));

    expect(p.open).toHaveBeenCalledWith('water');
    await until(() => p.notify.getSnapshot().items.find((each) => each.id === 161)?.read === true);
    expect(p.notify.getSnapshot().unread).toBe(1);
  });

  it('marks all as read', async () => {
    const p = await openPanel();
    const readAll = screen.getByRole('button', { name: words.readAll });

    await p.user.click(readAll);

    await until(() => p.notify.getSnapshot().unread === 0);
    await until(() => readAll.hasAttribute('disabled'));
    expect(document.querySelector('[data-ui="notify.panel.unread"]')).toBeNull();
  });

  it('deletes one item with its own button', async () => {
    const p = await openPanel();

    await p.user.click(screen.getByRole('button', { name: 'Delete Water' }));

    await until(() => document.querySelectorAll(ITEM).length === 2);
    expect(screen.queryByText('You are behind on water today.')).toBeNull();
  });

  it('asks before clearing all, then shows that nothing is here', async () => {
    const p = await openPanel();

    await p.user.click(screen.getByRole('button', { name: words.clear }));
    const ask = await screen.findByRole('alertdialog', { name: words.clearAsk });
    await p.user.click(within(ask).getByRole('button', { name: common.common.cancel }));
    await untilGone('[data-ui="notify.panel.clearDialog"]');
    expect(document.querySelectorAll(ITEM)).toHaveLength(3);

    await p.user.click(screen.getByRole('button', { name: words.clear }));
    await untilShown('[data-ui="notify.panel.clearDialog"]');
    await p.user.click(screen.getByRole('button', { name: words.clearYes }));
    await untilShown('[data-ui="notify.panel.empty"]');
    expect(screen.getByText(words.empty)).toBeVisible();
    expect(screen.getByRole('button', { name: words.clear })).toBeDisabled();
  });

  it('links to the Smart notifications settings', async () => {
    const p = await openPanel();

    await p.user.click(screen.getByRole('button', { name: reminders.reminders.smart.heading }));

    await until(() => p.host.hash() === '#/settings/tracking');
  });
});
