import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachReminderCard } from '../../domain/model';
import {
  CUSTOM_REMINDER_LIMIT,
  WEEKDAYS,
  type CustomReminder,
} from '../../domain/reminders/custom';
import { coach } from '../../i18n/en/coach';
import { createReminderCards } from '../../services/coach/reminderCards';
import type { CoachSession } from '../../services/coach/session';
import { ServicesProvider } from '../../services/context';
import type { NotificationState } from '../../services/reminders/notifier';
import { FACTORY_NOW } from '../../test/factories';
import { closeHarnesses, until, untilGone, untilShown } from '../../test/screenHarness';
import { openTracking } from '../settings/tracking/testing/openTracking';
import { CoachPage } from './CoachPage';

const words = coach.coach.reminder;

const DAILY: CoachReminderCard = {
  text: 'Drink a glass of water',
  time: '10:00',
  days: [...WEEKDAYS],
  status: 'proposed',
};
const GYM: CoachReminderCard = {
  text: 'Pack the gym bag',
  time: '07:30',
  days: ['mon', 'wed', 'fri'],
  status: 'proposed',
};
const CALL: CoachReminderCard = {
  text: 'Call the dietitian',
  time: '17:30',
  date: '2026-10-28',
  status: 'proposed',
};

const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:x' });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
});

afterEach(async () => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  vi.restoreAllMocks();
  await closeHarnesses();
});

const IDLE = { waiting: [] } as const;

/** The one chat the conversation is in. */
const CHAT = 'chat-reminders';

interface Open {
  readonly cards: CoachReminderCard[];
  /** The notification permission; granted unless said otherwise. */
  readonly permission?: NotificationState;
  /** The Notifications switch as stored; on unless said otherwise. */
  readonly master?: boolean;
  /** Your reminders as stored first (P17: the ones the Coach set). */
  readonly kept?: CustomReminder[];
}

/**
 * The Coach tab over a conversation whose reply proposed `cards`, with the real custom reminders
 * and tracking services and the real card logic behind the session's Add and Dismiss.
 */
async function openChat({ cards, permission = 'granted', master = true, kept = [] }: Open) {
  const h = await openTracking({ permission, hash: '#/coach' });
  const { settingsRepo, coachRepo } = h.repos;
  await settingsRepo.set('remind.master', master);
  await settingsRepo.set('remind.custom', kept);
  await coachRepo.append(
    { chatId: CHAT, role: 'user', text: 'Remind me, please.', at: FACTORY_NOW },
    { start: true },
  );
  const reply = await coachRepo.append({
    chatId: CHAT,
    role: 'assistant',
    text: 'I have proposed it: tap Add to set it.',
    at: FACTORY_NOW + 1,
    reminders: cards,
  });
  const add = vi.spyOn(h.services.customReminders, 'addCustomReminder');

  /** A session as the app's: a fresh one after each "reload". */
  function session(): CoachSession {
    const reminderCards = createReminderCards({ coachRepo, reminders: h.services.customReminders });
    return {
      getState: () => IDLE,
      subscribe: () => () => undefined,
      newChatId: () => 'chat-new',
      send: vi.fn(async () => 'answered' as const),
      retry: vi.fn(async () => 'answered' as const),
      deleteChat: vi.fn(async () => undefined),
      renameChat: vi.fn(async () => null),
      addReminder: (id, index, on) => reminderCards.add(id, index, on),
      dismissReminder: (id, index) => reminderCards.dismiss(id, index),
      undoReminder: (id, index) => reminderCards.undo(id, index),
    };
  }

  const mount = () =>
    h.mount(
      <ServicesProvider services={{ ...h.services, coachSession: session() }}>
        <CoachPage />
      </ServicesProvider>,
    );
  let view = mount();
  await untilShown('[data-ui="coach.reminderCard"]');

  /** Leaves the page and opens it again on a new session, as a reload does. */
  const reload = async (): Promise<void> => {
    view.unmount();
    view = mount();
    await untilShown('[data-ui="coach.message"]');
  };

  return {
    ...h,
    reply,
    add,
    reload,
    user: userEvent.setup(),
    stored: () => settingsRepo.get('remind.custom'),
    storedCards: async () => (await coachRepo.list(CHAT)).at(-1)?.reminders,
  };
}

const cardEls = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-ui="coach.reminderCard"]'));
const card = (index = 0) => cardEls()[index]!;
const addButton = (index = 0) => within(card(index)).getByRole('button', { name: words.add });
const untilAdded = (index = 0) => until(() => card(index)?.getAttribute('data-status') === 'added');

describe('ReminderCard: what it shows (P13, D-16.93)', () => {
  it('shows each proposal under the reply: its words, when it comes, Add and Dismiss', async () => {
    await openChat({ cards: [DAILY, GYM, CALL] });

    const reply = document.querySelector('[data-role="assistant"]')!;
    expect(cardEls().every((each) => reply.contains(each))).toBe(true);
    expect(cardEls().map((each) => each.getAttribute('aria-label'))).toEqual([
      'Proposed reminder: Drink a glass of water',
      'Proposed reminder: Pack the gym bag',
      'Proposed reminder: Call the dietitian',
    ]);
    expect(
      cardEls().map((each) => [
        each.querySelector('[data-ui="coach.reminderCard.text"]')?.textContent,
        each.querySelector('[data-ui="coach.reminderCard.when"]')?.textContent,
      ]),
    ).toEqual([
      ['Drink a glass of water', 'Every day at 10:00 AM'],
      ['Pack the gym bag', 'Mon, Wed, Fri at 7:30 AM'],
      ['Call the dietitian', 'Once, Oct 28, 2026 at 5:30 PM'],
    ]);
    for (const each of cardEls()) {
      expect(within(each).getByRole('button', { name: words.add })).toHaveAttribute(
        'data-ui',
        'coach.reminderCard.add',
      );
      expect(within(each).getByRole('button', { name: words.dismiss })).toHaveAttribute(
        'data-ui',
        'coach.reminderCard.dismiss',
      );
    }
  });
});

describe('ReminderCard: Add (P13, D-16.93)', () => {
  it('adds the reminder with notifications already on, and says Added with a link to Settings', async () => {
    const c = await openChat({ cards: [DAILY] });

    await c.user.click(addButton());
    await untilAdded();

    expect(c.notifications.request).not.toHaveBeenCalled();
    expect(await c.stored()).toEqual([
      { id: 'reminder-1', text: 'Drink a glass of water', time: '10:00', days: WEEKDAYS, on: true },
    ]);
    expect(within(card()).getByText(words.added)).toHaveAttribute(
      'data-ui',
      'coach.reminderCard.added',
    );
    expect(within(card()).queryByRole('button', { name: words.add })).toBeNull();
    expect(card().querySelector('[data-ui="coach.reminderCard.off"]')).toBeNull();
    expect(await c.storedCards()).toEqual([
      { ...DAILY, status: 'added', reminderId: 'reminder-1' },
    ]);

    const link = within(card()).getByRole('link', { name: words.settings });
    expect(link).toHaveAttribute('href', '#/settings/tracking');
    await c.user.click(link);
    expect(c.host.hash()).toBe('#/settings/tracking');
  });

  it('asks for notifications first when they are not on yet, and adds it on after a grant', async () => {
    const c = await openChat({ cards: [GYM], permission: 'default', master: false });

    await c.user.click(addButton());
    await untilAdded();

    expect(c.notifications.request).toHaveBeenCalledTimes(1);
    expect(await c.repos.settingsRepo.get('remind.master')).toBe(true);
    expect((await c.stored())[0]).toMatchObject({ text: 'Pack the gym bag', on: true });
    await untilGone('[data-ui="coach.reminderCard.off"]');
  });

  it('adds it switched off when notifications are refused, and says it shows once they are on', async () => {
    const c = await openChat({ cards: [CALL], permission: 'default', master: false });
    c.notifications.answerWith('denied');

    await c.user.click(addButton());
    await untilAdded();

    expect(c.notifications.request).toHaveBeenCalledTimes(1);
    expect(await c.repos.settingsRepo.get('remind.master')).toBe(false);
    expect(await c.stored()).toEqual([
      {
        id: 'reminder-1',
        text: 'Call the dietitian',
        time: '17:30',
        date: '2026-10-28',
        on: false,
      },
    ]);
    expect(within(card()).getByText(words.notificationsOff)).toBeVisible();
  });

  it('says in words why it could not add: 20 reminders already, a time that has passed', async () => {
    const past: CoachReminderCard = { ...CALL, date: '2026-10-26', time: '09:00' };
    const c = await openChat({ cards: [DAILY, past] });
    const full = Array.from({ length: CUSTOM_REMINDER_LIMIT }, (_, index) => ({
      id: `kept-${index}`,
      text: `Kept ${index}`,
      time: '08:00',
      days: ['mon' as const],
      on: true,
    }));
    await c.repos.settingsRepo.set('remind.custom', full);

    await c.user.click(addButton(0));
    await untilShown('[data-ui="coach.reminderCard.problem"]');
    expect(within(card(0)).getByRole('alert')).toHaveTextContent(words.problems.full);
    expect(addButton(0)).toBeEnabled();

    await c.user.click(addButton(1));
    await until(() => card(1).querySelector('[role="alert"]') !== null);
    expect(within(card(1)).getByRole('alert')).toHaveTextContent(words.problems.past);
    expect(await c.storedCards()).toEqual([DAILY, past]);
  });

  it('adds once for two quick taps, and again never after a reload', async () => {
    const c = await openChat({ cards: [DAILY] });

    fireEvent.click(addButton());
    fireEvent.click(addButton());
    await untilAdded();
    await c.reload();

    expect(card()).toHaveAttribute('data-status', 'added');
    expect(within(card()).queryByRole('button', { name: words.add })).toBeNull();
    expect(c.add).toHaveBeenCalledTimes(1);
    expect(await c.stored()).toHaveLength(1);
  });
});

describe('ReminderCard: Dismiss (P13, D-16.93)', () => {
  it('hides the card for good, also after a reload, and adds nothing', async () => {
    const c = await openChat({ cards: [DAILY, GYM] });

    await c.user.click(within(card(0)).getByRole('button', { name: words.dismiss }));
    await until(() => cardEls().length === 1);
    expect(card(0)).toHaveAccessibleName('Proposed reminder: Pack the gym bag');

    await c.reload();
    await untilShown('[data-ui="coach.reminderCard"]');
    expect(cardEls()).toHaveLength(1);
    expect((await c.storedCards())?.map((each) => each.status)).toEqual(['dismissed', 'proposed']);
    expect(c.add).not.toHaveBeenCalled();
    expect(screen.getByText('I have proposed it: tap Add to set it.')).toBeVisible();
  });
});

describe('ReminderCard: a reminder the Coach set (P17-03, D-16.102)', () => {
  const WATER: CustomReminder = {
    id: 'set-1',
    text: 'Drink a glass of water',
    time: '10:00',
    days: [...WEEKDAYS],
    on: true,
  };
  const SET: CoachReminderCard = { ...DAILY, status: 'set', reminderId: 'set-1' };
  const untilStatus = (status: string) =>
    until(() => card()?.getAttribute('data-status') === status);

  it('shows it as set, as Your reminders keeps it, with Undo and Edit', async () => {
    await openChat({ cards: [SET], kept: [{ ...WATER, time: '10:30' }] });
    // Edit comes once Your reminders are read.
    await untilShown('[data-ui="coach.reminderCard.edit"]');

    expect(card()).toHaveAttribute('data-status', 'set');
    expect(card()).toHaveAccessibleName(`${words.set} Drink a glass of water`);
    expect(within(card()).getByText(words.set)).toHaveAttribute(
      'data-ui',
      'coach.reminderCard.set',
    );
    expect(card().querySelector('[data-ui="coach.reminderCard.when"]')).toHaveTextContent(
      'Every day at 10:30 AM',
    );
    expect(within(card()).getByRole('button', { name: words.undo })).toBeVisible();
    expect(within(card()).getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(within(card()).queryByRole('button', { name: words.add })).toBeNull();
    expect(card().querySelector('[data-ui="coach.reminderCard.off"]')).toBeNull();
  });

  it('takes the reminder away on Undo; the card then waits for Add, which adds it again', async () => {
    const c = await openChat({ cards: [SET], kept: [WATER] });

    await c.user.click(within(card()).getByRole('button', { name: words.undo }));
    await untilStatus('proposed');

    expect(await c.stored()).toEqual([]);
    expect(await c.storedCards()).toEqual([DAILY]);
    await c.user.click(addButton());
    await untilAdded();
    expect(await c.stored()).toEqual([{ ...WATER, id: 'reminder-1' }]);
  });

  it('opens the reminder’s own editor on Edit; a change shows on the card', async () => {
    const c = await openChat({ cards: [SET], kept: [WATER] });
    await untilShown('[data-ui="coach.reminderCard.edit"]');

    await c.user.click(within(card()).getByRole('button', { name: 'Edit' }));
    await untilShown('[data-ui="reminders.yours.sheet"]');
    const field = screen.getByRole('textbox', { name: /What it says/ });
    expect(field).toHaveValue('Drink a glass of water');
    await c.user.clear(field);
    await c.user.type(field, 'Two glasses of water');
    await c.user.click(screen.getByRole('button', { name: 'Save' }));
    await untilGone('[data-ui="reminders.yours.sheet"]');

    expect(await c.stored()).toEqual([{ ...WATER, text: 'Two glasses of water' }]);
    await until(
      () =>
        card().querySelector('[data-ui="coach.reminderCard.text"]')?.textContent ===
        'Two glasses of water',
    );
    expect(c.add).not.toHaveBeenCalled();
  });

  it('says it shows once notifications are on, and offers no Edit once it was deleted', async () => {
    await openChat({ cards: [SET], master: false });
    await untilShown('[data-ui="coach.reminderCard.off"]');

    expect(within(card()).getByText(words.notificationsOff)).toBeVisible();
    expect(within(card()).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(card()).getByRole('button', { name: words.undo })).toBeVisible();
  });
});
