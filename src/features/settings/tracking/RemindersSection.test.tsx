import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { reminders } from '../../../i18n/en/reminders';
import { closeHarnesses, openHarness, until, untilShown } from '../../../test/screenHarness';
import { settle } from '../../water/testing/openWater';
import { MealTimesCard } from './MealTimesSheet';
import { RemindersSection } from './RemindersSection';
import { openTracking, type TrackingSetup } from './testing/openTracking';
import { TrackingPage } from './TrackingPage';

afterEach(closeHarnesses);

const words = reminders.reminders.settings;
const CARD = '[data-ui="reminders.settings"]';

/** The hooks of the card's switches, in order. */
const switches = (): string[] =>
  Array.from(document.querySelectorAll(`${CARD} [role="switch"]`)).map(
    (row) => row.getAttribute('data-ui') ?? '',
  );

/** The page comes back into focus (another window, the browser's site settings). */
function focusPage(): void {
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

interface Setup extends TrackingSetup {
  /** The notifications switch as stored. */
  readonly stored?: boolean;
  readonly water?: boolean;
  readonly fasting?: boolean;
}

async function openCard({ stored, water, fasting, ...setup }: Setup = {}) {
  const user = userEvent.setup();
  const h = await openTracking(setup);
  const { settingsRepo } = h.repos;
  if (stored !== undefined) await settingsRepo.set('remind.master', stored);
  if (water !== undefined) await settingsRepo.set('water.on', water);
  if (fasting !== undefined) await settingsRepo.set('fasting.on', fasting);
  h.mount(<RemindersSection />);
  await untilShown(CARD);
  const master = () => screen.getByRole('switch', { name: words.master });
  return { ...h, user, master };
}

describe('RemindersSection', () => {
  it('follows the trackers on the Tracking page, before your own reminders (P13)', async () => {
    const h = await openTracking();
    h.mount(<TrackingPage />);
    await untilShown(CARD);
    await untilShown('[data-ui="fasting.settings"]');
    await untilShown('[data-ui="reminders.yours"]');

    const cards = Array.from(document.querySelectorAll('[data-ui="tracking"] > *')).map((card) =>
      card.getAttribute('data-ui'),
    );
    expect(cards.slice(-3)).toEqual(['fasting.settings', 'reminders.settings', 'reminders.yours']);
    expect(screen.getByRole('region', { name: words.heading })).toBeVisible();
  });

  it('starts off with only its switch, and says when reminders can show (D-16.5)', async () => {
    const s = await openCard();

    expect(s.master()).toHaveAttribute('aria-checked', 'false');
    expect(s.master()).toHaveAccessibleDescription(words.masterHint);
    expect(switches()).toEqual(['reminders.master']);
    expect(screen.getByText(words.openNote)).toBeVisible();
    expect(screen.queryByText(words.blocked)).toBeNull();
  });

  it("leaves the switch off when the browser says no, and points to the browser's site settings (ACC-J11-1, R06.13)", async () => {
    const s = await openCard();
    s.notifications.answerWith('denied');

    await s.user.click(s.master());

    await untilShown('[data-ui="reminders.blocked"]');
    expect(s.notifications.request).toHaveBeenCalledOnce();
    // Read out when it appears.
    expect(screen.getByText(words.blocked)).toHaveAttribute('role', 'status');
    expect(s.master()).toHaveAttribute('aria-checked', 'false');
    expect(await s.repos.settingsRepo.get('remind.master')).toBe(false);
    expect(switches()).toEqual(['reminders.master']);
  });

  it('shows the pointer while the browser already blocks notifications', async () => {
    await openCard({ permission: 'denied', stored: true });

    expect(screen.getByRole('switch', { name: words.master })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText(words.blocked)).toBeVisible();
  });

  it('turns on after a grant and lists the reminders, each off, with a line saying so (R06.13)', async () => {
    const s = await openCard();

    await s.user.click(s.master());

    await until(() => s.master().getAttribute('aria-checked') === 'true');
    expect(await s.repos.settingsRepo.get('remind.master')).toBe(true);
    expect(switches()).toEqual([
      'reminders.master',
      'reminders.breakfast',
      'reminders.lunch',
      'reminders.dinner',
      'reminders.summary',
      'reminders.goalReached',
    ]);
    expect(screen.getByText(words.noneOn)).toBeVisible();
    expect(screen.queryByText(words.blocked)).toBeNull();
  });

  it('shows the switch off when the permission was taken back while away, and on again once it is back (R06.13)', async () => {
    const s = await openCard({ permission: 'granted', stored: true });
    expect(s.master()).toHaveAttribute('aria-checked', 'true');
    expect(switches()).toHaveLength(6);

    s.notifications.setState('denied');
    focusPage();

    await until(() => s.master().getAttribute('aria-checked') === 'false');
    expect(switches()).toEqual(['reminders.master']);
    expect(screen.getByText(words.blocked)).toBeVisible();
    // The engine checks again at once, so nothing more is shown (R06.10).
    expect(s.reminders.refresh).toHaveBeenCalledOnce();
    // The stored choice is kept for when the browser allows notifications again.
    expect(await s.repos.settingsRepo.get('remind.master')).toBe(true);

    s.notifications.setState('granted');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await until(() => s.master().getAttribute('aria-checked') === 'true');
    expect(switches()).toHaveLength(6);
  });

  it('shows the water reminder only while water is tracked', async () => {
    const s = await openCard({ permission: 'granted', stored: true });
    expect(switches()).not.toContain('reminders.water');

    await s.repos.settingsRepo.set('water.on', true);

    await until(() => switches().includes('reminders.water'));
    expect(switches()).toEqual([
      'reminders.master',
      'reminders.breakfast',
      'reminders.lunch',
      'reminders.dinner',
      'reminders.summary',
      'reminders.water',
      'reminders.goalReached',
    ]);

    await s.repos.settingsRepo.set('water.on', false);
    await until(() => !switches().includes('reminders.water'));
  });

  it('shows the fasting goal only while fasting is tracked', async () => {
    const s = await openCard({ permission: 'granted', stored: true, fasting: true });
    expect(switches()).toContain('reminders.fastGoal');

    await s.user.click(screen.getByRole('switch', { name: words.fastGoal }));
    await until(
      () =>
        screen.getByRole('switch', { name: words.fastGoal }).getAttribute('aria-checked') ===
        'true',
    );
    expect(await s.repos.settingsRepo.get('remind.fastGoal')).toBe(true);

    await s.repos.settingsRepo.set('fasting.on', false);
    await until(() => !switches().includes('reminders.fastGoal'));
  });

  it('switches a reminder on, shows its time, and stores a new time', async () => {
    const writes: Promise<void>[] = [];
    const s = await openCard({
      permission: 'granted',
      stored: true,
      wrap: (real) => ({
        ...real,
        setReminder(id, change) {
          const write = real.setReminder(id, change);
          writes.push(write);
          return write;
        },
      }),
    });
    expect(screen.queryByLabelText('Breakfast time')).toBeNull();

    await s.user.click(screen.getByRole('switch', { name: words.breakfast }));

    await untilShown('[data-ui="reminders.breakfast.time"]');
    expect(await s.repos.settingsRepo.get('remind.breakfast')).toEqual({ on: true, at: '08:00' });
    const time = screen.getByLabelText('Breakfast time');
    expect(time).toHaveValue('08:00');
    expect(screen.queryByText(words.noneOn)).toBeNull();

    fireEvent.change(time, { target: { value: '07:30' } });

    expect(time).toHaveValue('07:30');
    await act(() => Promise.all(writes));
    expect(await s.repos.settingsRepo.get('remind.breakfast')).toEqual({ on: true, at: '07:30' });
    await until(() => (time as HTMLInputElement).value === '07:30');
  });

  it('switches the goal-weight alert, the same setting as on the Goals page', async () => {
    const s = await openCard({ permission: 'granted', stored: true });

    await s.user.click(screen.getByRole('switch', { name: words.goalReached }));

    await until(
      () =>
        screen.getByRole('switch', { name: words.goalReached }).getAttribute('aria-checked') ===
        'true',
    );
    expect(await s.repos.settingsRepo.get('alerts.goalReached')).toBe(true);
    expect(screen.getByRole('switch', { name: words.goalReached })).toHaveAccessibleDescription(
      words.goalReachedHint,
    );
  });

  it('stores the switch off and hides the reminders', async () => {
    const s = await openCard({ permission: 'granted', stored: true });

    await s.user.click(s.master());

    await until(() => switches().length === 1);
    expect(s.master()).toHaveAttribute('aria-checked', 'false');
    expect(await s.repos.settingsRepo.get('remind.master')).toBe(false);
  });

  it('cannot be switched on where the browser has no notifications, and says so', async () => {
    const s = await openCard({ permission: 'unsupported' });

    expect(s.master()).toBeDisabled();
    expect(screen.getByText(words.unsupported)).toBeVisible();
    expect(screen.getByText(words.openNote)).toBeVisible();
  });

  it("asks Android in the Android app, and points to Android's settings when it says no (P13, D-16.92)", async () => {
    const s = await openCard({ system: 'android' });
    expect(s.master()).toBeEnabled();
    expect(s.master()).toHaveAccessibleDescription(words.masterHintAndroid);
    expect(screen.getByText(words.openNoteAndroid)).toBeVisible();
    expect(screen.queryByText(words.openNote)).toBeNull();
    s.notifications.answerWith('denied');

    await s.user.click(s.master());

    await untilShown('[data-ui="reminders.blocked"]');
    expect(s.notifications.request).toHaveBeenCalledOnce();
    expect(screen.getByText(words.blockedAndroid)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(words.blocked)).toBeNull();
    expect(s.master()).toHaveAttribute('aria-checked', 'false');
    expect(await s.repos.settingsRepo.get('remind.master')).toBe(false);
  });

  it('turns on in the Android app after a grant, and reads the permission again on return (P13)', async () => {
    const s = await openCard({ system: 'android' });

    await s.user.click(s.master());

    await until(() => s.master().getAttribute('aria-checked') === 'true');
    expect(await s.repos.settingsRepo.get('remind.master')).toBe(true);
    expect(switches()).toContain('reminders.breakfast');

    // Taken away in Android's settings while the app was in the background.
    s.notifications.setState('denied');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await until(() => s.master().getAttribute('aria-checked') === 'false');
    expect(screen.getByText(words.blockedAndroid)).toBeVisible();
  });

  it('puts a switch back with a message when its change is not saved', async () => {
    const s = await openCard({
      permission: 'granted',
      stored: true,
      wrap: (real) => ({ ...real, setReminder: () => Promise.reject(new Error('disk full')) }),
    });

    await s.user.click(screen.getByRole('switch', { name: words.lunch }));

    await settle(() => screen.queryByText(words.saveFailed) !== null);
    expect(screen.getByRole('switch', { name: words.lunch })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: words.lunch })).toBeEnabled();
  });

  it('draws nothing without the tracking settings service', async () => {
    const h = await openHarness();
    h.mount(
      <>
        <MealTimesCard />
        <RemindersSection />
      </>,
    );
    // The settings are read by then: the meal times card is drawn without the service.
    await untilShown('[data-ui="mealTimes.settings"]');
    expect(document.querySelector(CARD)).toBeNull();
  });
});
