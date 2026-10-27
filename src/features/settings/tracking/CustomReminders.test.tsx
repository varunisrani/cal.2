import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_REMINDER_LIMIT,
  WEEKDAYS,
  type CustomReminder,
} from '../../../domain/reminders/custom';
import { reminders } from '../../../i18n/en/reminders';
import {
  closeHarnesses,
  openHarness,
  until,
  untilGone,
  untilShown,
} from '../../../test/screenHarness';
import { CustomRemindersCard } from './CustomReminders';
import { MealTimesCard } from './MealTimesSheet';
import { RemindersSection } from './RemindersSection';
import { openTracking, type TrackingSetup } from './testing/openTracking';

afterEach(closeHarnesses);

const words = reminders.reminders.yours;
const CARD = '[data-ui="reminders.yours"]';
const SHEET = '[data-ui="reminders.yours.sheet"]';

interface Setup extends TrackingSetup {
  /** The notifications switch as stored; on unless said otherwise. */
  readonly stored?: boolean;
  readonly list?: CustomReminder[];
}

/** The card (with the Notifications card above it, as on the page), notifications allowed. */
async function openCard({ stored = true, list, permission = 'granted', ...setup }: Setup = {}) {
  const user = userEvent.setup();
  const h = await openTracking({ permission, ...setup });
  const { settingsRepo } = h.repos;
  await settingsRepo.set('remind.master', stored);
  if (list) await settingsRepo.set('remind.custom', list);
  h.mount(
    <>
      <RemindersSection />
      <CustomRemindersCard />
    </>,
  );
  await untilShown(CARD);
  const card = () => document.querySelector<HTMLElement>(CARD)!;
  const sheet = () => document.querySelector<HTMLElement>(SHEET);
  const items = () =>
    Array.from(card().querySelectorAll('[data-ui="reminders.yours.item"]')).map(
      (item) => item.textContent ?? '',
    );
  const stored_ = () => settingsRepo.get('remind.custom');
  return { ...h, user, card, sheet, items, storedList: stored_ };
}

type Card = Awaited<ReturnType<typeof openCard>>;

/** Opens the Add sheet and types what the reminder says. */
async function startAdding(c: Card, text: string): Promise<HTMLElement> {
  await c.user.click(screen.getByRole('button', { name: words.add }));
  await untilShown(SHEET);
  const sheet = c.sheet()!;
  await c.user.type(within(sheet).getByLabelText(words.text), text);
  return sheet;
}

function setTime(sheet: HTMLElement, time: string): void {
  fireEvent.change(within(sheet).getByLabelText(words.time), { target: { value: time } });
}

const gym: CustomReminder = {
  id: 'gym',
  text: 'Gym bag',
  time: '07:00',
  days: ['mon', 'wed', 'fri'],
  on: true,
};

describe('CustomRemindersCard (P13, D-16.93)', () => {
  it('starts empty with a line saying what it is for, and an Add button', async () => {
    const c = await openCard();

    expect(within(c.card()).getByRole('heading', { name: words.heading })).toBeVisible();
    expect(within(c.card()).getByText(words.empty)).toBeVisible();
    expect(screen.getByRole('button', { name: words.add })).toBeEnabled();
  });

  it('adds a reminder on chosen weekdays, on, and lists it with when it comes', async () => {
    const c = await openCard();

    const sheet = await startAdding(c, 'Pack the gym bag');
    expect(within(sheet).getByRole('heading', { name: words.newTitle })).toBeVisible();
    setTime(sheet, '07:30');
    // Every day to start; Tuesday, Thursday, Saturday and Sunday off.
    for (const day of ['Tuesday', 'Thursday', 'Saturday', 'Sunday']) {
      await c.user.click(within(sheet).getByRole('button', { name: day }));
    }
    expect(within(sheet).getByRole('button', { name: 'Monday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(sheet).getByRole('button', { name: 'Sunday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));

    await untilGone(SHEET);
    expect(await c.storedList()).toEqual([
      {
        id: 'reminder-1',
        text: 'Pack the gym bag',
        time: '07:30',
        days: ['mon', 'wed', 'fri'],
        on: true,
      },
    ]);
    await until(() => c.items().length === 1);
    const row = within(c.card()).getByRole('switch', { name: 'Pack the gym bag' });
    expect(row).toHaveAttribute('aria-checked', 'true');
    expect(row).toHaveAccessibleDescription('Mon, Wed, Fri at 7:30 AM');
    // Allowed already: nothing was asked.
    expect(c.notifications.request).not.toHaveBeenCalled();
  });

  it('adds a reminder once, on a date', async () => {
    const c = await openCard();

    const sheet = await startAdding(c, 'Call the dentist');
    setTime(sheet, '10:15');
    await c.user.click(within(sheet).getByRole('radio', { name: words.onceOnly }));
    fireEvent.change(within(sheet).getByLabelText(words.date), {
      target: { value: '2026-10-28' },
    });
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));

    await untilGone(SHEET);
    expect(await c.storedList()).toMatchObject([
      { text: 'Call the dentist', time: '10:15', date: '2026-10-28', on: true },
    ]);
    await until(() => c.items().length === 1);
    expect(
      within(c.card()).getByRole('switch', { name: 'Call the dentist' }),
    ).toHaveAccessibleDescription('Once, Oct 28, 2026 at 10:15 AM');
  });

  it('says what is wrong under the field it is about, and stores nothing', async () => {
    const c = await openCard();
    await c.user.click(screen.getByRole('button', { name: words.add }));
    await untilShown(SHEET);
    const sheet = c.sheet()!;

    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByLabelText(words.text)).toHaveAccessibleDescription(
      expect.stringContaining(words.problems.noText),
    );
    expect(within(sheet).getByLabelText(words.text)).toHaveFocus();

    await c.user.type(within(sheet).getByLabelText(words.text), 'x'.repeat(81));
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByText(words.problems.textTooLong)).toBeVisible();

    await c.user.clear(within(sheet).getByLabelText(words.text));
    await c.user.type(within(sheet).getByLabelText(words.text), 'Stretch');
    for (const day of WEEKDAYS) {
      const name = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(Date.UTC(2024, 0, 1 + WEEKDAYS.indexOf(day))),
      );
      await c.user.click(within(sheet).getByRole('button', { name }));
    }
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(words.problems.noDays);

    // Once, today, at a time already past (it is 12:30).
    await c.user.click(within(sheet).getByRole('radio', { name: words.onceOnly }));
    setTime(sheet, '09:00');
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(within(sheet).getByRole('alert')).toHaveTextContent(words.problems.past);

    expect(await c.storedList()).toEqual([]);
  });

  it('edits a reminder in place, keeping its switch', async () => {
    const c = await openCard({ list: [{ ...gym, on: false }] });
    await until(() => c.items().length === 1);

    await c.user.click(screen.getByRole('button', { name: 'Edit Gym bag' }));
    await untilShown(SHEET);
    const sheet = c.sheet()!;
    expect(within(sheet).getByRole('heading', { name: words.editTitle })).toBeVisible();
    expect(within(sheet).getByLabelText(words.text)).toHaveValue('Gym bag');
    expect(within(sheet).getByLabelText(words.time)).toHaveValue('07:00');
    await c.user.clear(within(sheet).getByLabelText(words.text));
    await c.user.type(within(sheet).getByLabelText(words.text), 'Gym bag and towel');
    setTime(sheet, '06:45');
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));

    await untilGone(SHEET);
    expect(await c.storedList()).toEqual([
      { ...gym, text: 'Gym bag and towel', time: '06:45', on: false },
    ]);
  });

  it('deletes a reminder from its sheet, and says so', async () => {
    const c = await openCard({ list: [gym, { ...gym, id: 'walk', text: 'Walk' }] });
    await until(() => c.items().length === 2);

    await c.user.click(screen.getByRole('button', { name: 'Edit Gym bag' }));
    await untilShown(SHEET);
    await c.user.click(within(c.sheet()!).getByRole('button', { name: words.delete }));

    await untilGone(SHEET);
    await until(() => c.items().length === 1);
    expect((await c.storedList()).map((each) => each.id)).toEqual(['walk']);
    expect(await screen.findByText(words.deleted)).toBeVisible();
  });

  it('switches a reminder off and on', async () => {
    const c = await openCard({ list: [gym] });
    await until(() => c.items().length === 1);
    const toggle = () => within(c.card()).getByRole('switch', { name: 'Gym bag' });

    await c.user.click(toggle());
    await until(() => toggle().getAttribute('aria-checked') === 'false');
    expect(await c.storedList()).toMatchObject([{ on: false }]);

    await c.user.click(toggle());
    await until(() => toggle().getAttribute('aria-checked') === 'true');
    expect(c.notifications.request).not.toHaveBeenCalled();
  });

  it('asks for the permission when one is switched on while notifications are off, and turns them on with a grant', async () => {
    const c = await openCard({
      stored: false,
      permission: 'default',
      list: [{ ...gym, on: false }],
    });
    await until(() => c.items().length === 1);
    expect(within(c.card()).getByText(words.needsNotifications)).toBeVisible();

    await c.user.click(within(c.card()).getByRole('switch', { name: 'Gym bag' }));

    await until(
      () =>
        within(c.card()).getByRole('switch', { name: 'Gym bag' }).getAttribute('aria-checked') ===
        'true',
    );
    expect(c.notifications.request).toHaveBeenCalledOnce();
    expect(await c.repos.settingsRepo.get('remind.master')).toBe(true);
    await until(() => within(c.card()).queryByText(words.needsNotifications) === null);
  });

  it('leaves the switch off when the permission is refused, and the Notifications card points to the settings', async () => {
    const c = await openCard({
      stored: false,
      permission: 'default',
      list: [{ ...gym, on: false }],
    });
    await until(() => c.items().length === 1);
    c.notifications.answerWith('denied');

    await c.user.click(within(c.card()).getByRole('switch', { name: 'Gym bag' }));

    await untilShown('[data-ui="reminders.blocked"]');
    expect(within(c.card()).getByRole('switch', { name: 'Gym bag' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(await c.storedList()).toMatchObject([{ on: false }]);
    expect(screen.getByText(reminders.reminders.settings.blocked)).toBeVisible();
  });

  it('adds a new reminder off when the permission is refused in the same press', async () => {
    const c = await openCard({ stored: false, permission: 'default' });
    c.notifications.answerWith('denied');

    const sheet = await startAdding(c, 'Stretch');
    await c.user.click(within(sheet).getByRole('button', { name: 'Save' }));

    await untilGone(SHEET);
    expect(c.notifications.request).toHaveBeenCalledOnce();
    expect(await c.storedList()).toMatchObject([{ text: 'Stretch', on: false }]);
  });

  it("points to Android's settings in the Android app when Android refuses (D-16.92)", async () => {
    const c = await openCard({
      stored: false,
      permission: 'default',
      system: 'android',
      list: [{ ...gym, on: false }],
    });
    await until(() => c.items().length === 1);
    c.notifications.answerWith('denied');

    await c.user.click(within(c.card()).getByRole('switch', { name: 'Gym bag' }));

    await untilShown('[data-ui="reminders.blocked"]');
    expect(screen.getByText(reminders.reminders.settings.blockedAndroid)).toBeVisible();
    expect(await c.storedList()).toMatchObject([{ on: false }]);
  });

  it('keeps at most 20: Add goes off with a line saying why', async () => {
    const list = Array.from({ length: CUSTOM_REMINDER_LIMIT }, (_, index) => ({
      ...gym,
      id: `r${index}`,
      text: `Reminder ${index}`,
    }));
    const c = await openCard({ list });
    await until(() => c.items().length === CUSTOM_REMINDER_LIMIT);

    expect(screen.getByRole('button', { name: words.add })).toBeDisabled();
    expect(within(c.card()).getByText(words.full)).toBeVisible();
  });

  it('shows a once reminder that has passed as passed', async () => {
    const c = await openCard({
      list: [{ id: 'old', text: 'Old', time: '09:00', date: '2026-10-20', on: true }],
    });
    await until(() => c.items().length === 1);

    expect(within(c.card()).getByRole('switch', { name: 'Old' })).toHaveAccessibleDescription(
      'Passed: Oct 20, 2026 at 9:00 AM',
    );
  });

  it('draws nothing without its services', async () => {
    const h = await openHarness();
    h.mount(
      <>
        <MealTimesCard />
        <CustomRemindersCard />
      </>,
    );
    // The settings are read by then: the meal times card is drawn without the service.
    await untilShown('[data-ui="mealTimes.settings"]');
    expect(document.querySelector(CARD)).toBeNull();
  });
});
