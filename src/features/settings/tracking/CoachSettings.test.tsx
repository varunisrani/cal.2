import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { reminders } from '../../../i18n/en/reminders';
import { closeHarnesses, until, untilGone, untilShown } from '../../../test/screenHarness';
import { CoachSettings } from './CoachSettings';
import { openTracking } from './testing/openTracking';
import { TrackingPage } from './TrackingPage';

afterEach(closeHarnesses);

const words = reminders.reminders;
const CARD = '[data-ui="coach.settings"]';
const local = (text: string) => new Date(text).getTime();

async function openCoachCard() {
  const user = userEvent.setup();
  const h = await openTracking({ system: 'android', permission: 'granted', notify: true });
  h.mount(<CoachSettings />);
  await untilShown(CARD);
  return { ...h, user };
}

describe('Settings › Tracking & reminders: the Coach’s (P17-03, D-16.102)', () => {
  it('has Let the Coach set reminders, on by default, and turns it off and on', async () => {
    const s = await openCoachCard();
    const sets = () => screen.getByRole('switch', { name: words.yours.coachSets });

    expect(sets()).toHaveAttribute('aria-checked', 'true');
    expect(sets()).toHaveAccessibleDescription(words.yours.coachSetsHint);
    expect(screen.getByRole('region', { name: 'Coach' })).toBeVisible();

    await s.user.click(sets());
    await until(() => sets().getAttribute('aria-checked') === 'false');
    expect(await s.repos.settingsRepo.get('coach.setsReminders')).toBe(false);
    await s.user.click(sets());
    await until(() => sets().getAttribute('aria-checked') === 'true');
  });

  it('lists the waiting check-ins, soonest first, each with Delete; and says they come in quiet hours', async () => {
    const s = await openCoachCard();
    expect(screen.queryByText(words.smart.coachCheckIn)).toBeNull();
    const later = { id: 'k2', chatId: 'c', at: local('2026-10-30T08:15:00'), text: 'Weigh in?' };
    await s.repos.settingsRepo.set('coach.checkIns', [
      later,
      { id: 'k1', chatId: 'c', at: local('2026-10-29T19:00:00'), text: 'How was lunch?' },
    ]);

    await untilShown('[data-ui="coach.settings.checkIn"]');
    const rows = () => Array.from(document.querySelectorAll('[data-ui="coach.settings.checkIn"]'));
    expect(screen.getByRole('heading', { name: words.smart.coachCheckIn })).toBeVisible();
    expect(screen.getByText(words.smart.coachCheckInHint)).toBeVisible();
    expect(rows().map((row) => row.textContent)).toEqual([
      'How was lunch?Thu, Oct 29, 7:00 PM',
      'Weigh in?Fri, Oct 30, 8:15 AM',
    ]);

    await s.user.click(
      within(rows()[0] as HTMLElement).getByRole('button', { name: 'Delete How was lunch?' }),
    );
    await until(() => rows().length === 1);
    expect(await s.repos.settingsRepo.get('coach.checkIns')).toEqual([later]);

    await s.user.click(screen.getByRole('button', { name: 'Delete Weigh in?' }));
    await untilGone('[data-ui="coach.settings.checkIn"]');
    expect(screen.queryByText(words.smart.coachCheckIn)).toBeNull();
  });

  it('sits after Your reminders in the Android app', async () => {
    const android = await openTracking({ system: 'android', notify: true });
    android.mount(<TrackingPage />);
    await untilShown(CARD);
    await untilShown('[data-ui="reminders.yours"]');
    const cards = Array.from(document.querySelectorAll('[data-ui="tracking"] > *')).map((card) =>
      card.getAttribute('data-ui'),
    );
    expect(cards.indexOf('coach.settings')).toBe(cards.indexOf('reminders.yours') + 1);
  });

  it('is not on the web, where the Coach proposes reminders', async () => {
    const web = await openTracking();
    web.mount(<TrackingPage />);
    await untilShown('[data-ui="reminders.yours"]');
    expect(document.querySelector(CARD)).toBeNull();
  });
});
