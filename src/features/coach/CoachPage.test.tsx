import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewCoachMessage } from '../../data/repos/coachRepo';
import { ai } from '../../i18n/en/ai';
import { coach } from '../../i18n/en/coach';
import { common } from '../../i18n/en/common';
import type { CoachSession, CoachSessionState, TurnOutcome } from '../../services/coach/session';
import { ServicesProvider } from '../../services/context';
import { FACTORY_NOW, makeProfile } from '../../test/factories';
import {
  closeHarnesses,
  openHarness,
  until,
  untilGone,
  untilShown,
  type Harness,
  type HarnessOptions,
} from '../../test/screenHarness';
import { advance } from '../../test/time';
import { CoachPage } from './CoachPage';
import { KEYBOARD_MIN_PX } from './keyboard';
import { TYPING_STEP_MS } from './TypingDots';

const words = coach.coach;

/** The chat the stored messages are in, unless a test says otherwise. */
const CHAT = 'chat-1';

// ---- A session the test drives -------------------------------------------------------------

/** The coach session's shape, with each action a spy and the waiting chats set by the test. */
function fakeSession() {
  let state: CoachSessionState = { waiting: [] };
  let made = 0;
  const listeners = new Set<() => void>();
  const session = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    newChatId: vi.fn(() => `chat-new-${++made}`),
    send: vi.fn<(chatId: string, text: string, image?: Blob) => Promise<TurnOutcome>>(
      async () => 'answered',
    ),
    retry: vi.fn<(chatId: string, id: string) => Promise<TurnOutcome>>(async () => 'answered'),
    deleteChat: vi.fn<(chatId: string) => Promise<void>>(async () => undefined),
    renameChat: vi.fn<CoachSession['renameChat']>(async () => null),
    addReminder: vi.fn<CoachSession['addReminder']>(async () => ({ ok: true, reminderId: 'r' })),
    dismissReminder: vi.fn<CoachSession['dismissReminder']>(async () => undefined),
  } satisfies CoachSession;
  /** Marks these chats as waiting for a reply (none: nothing waits). */
  const setWaiting = (...chats: string[]): void => {
    act(() => {
      state = { waiting: chats };
      for (const listener of [...listeners]) listener();
    });
  };
  /** The id the last New chat (or the first open of a tab with no chats) got. */
  const lastNewId = (): string => `chat-new-${made}`;
  return { session, setWaiting, lastNewId };
}

// ---- Object URLs (jsdom has none) ----------------------------------------------------------

const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));

beforeEach(() => {
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => `blob:coach-page-test/${++made}`,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
});

afterEach(async () => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  vi.unstubAllGlobals();
  await closeHarnesses();
});

// ---- Opening the page ----------------------------------------------------------------------

interface Open {
  readonly messages?: readonly NewCoachMessage[];
  readonly sources?: HarnessOptions['sources'];
}

/** The Coach page for a person losing weight, over the test database, with a fake session. */
async function openCoach({ messages = [], sources }: Open = {}) {
  const h: Harness = await openHarness({ hash: '#/coach', ...(sources ? { sources } : {}) });
  await h.repos.profileRepo.save(makeProfile({ goal: 'lose' }));
  for (const message of messages) await h.repos.coachRepo.append(message, { start: true });
  const fake = fakeSession();
  h.mount(
    <ServicesProvider services={{ ...h.services, coachSession: fake.session }}>
      <CoachPage />
    </ServicesProvider>,
  );
  return { ...h, ...fake };
}

let minute = 0;
function asked(text: string, changes: Partial<NewCoachMessage> = {}): NewCoachMessage {
  minute += 1;
  return { chatId: CHAT, role: 'user', text, at: FACTORY_NOW + minute * 60_000, ...changes };
}
function answered(text: string, chatId = CHAT): NewCoachMessage {
  minute += 1;
  return { chatId, role: 'assistant', text, at: FACTORY_NOW + minute * 60_000 };
}

const cards = () => document.querySelectorAll('[data-ui^="coach.card."]');
const chipRow = () => document.querySelector('[data-ui="coach.chips"]');
const deleteButton = () => screen.getByRole('button', { name: words.page.deleteChat });
const newChatButton = () => screen.getByRole('button', { name: words.page.newChat });
const chatsButton = () => screen.getByRole('button', { name: words.page.chats });
const chatName = () => document.querySelector('[data-ui="coach.chatTitle"]')?.textContent;
const field = () =>
  screen.getByRole('textbox', { name: words.composer.label }) as HTMLTextAreaElement;
const page = () => document.querySelector('[data-ui="screen.coach"]') as HTMLElement;
const shownTexts = () =>
  Array.from(document.querySelectorAll('[data-ui="coach.message"]'), (row) => row.textContent);
const untilMessages = (count: number) =>
  until(() => document.querySelectorAll('[data-ui="coach.message"]').length === count);

/** Opens the Chats list (fetched on first open) and gives its rows. */
async function openChats(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement[]> {
  await user.click(chatsButton());
  await untilShown('[data-ui="coach.chats.item"]');
  return Array.from(document.querySelectorAll<HTMLElement>('[data-ui="coach.chats.item"]'));
}

/** The part of a Chats row that opens its chat. */
const opener = (row: HTMLElement): HTMLElement =>
  row.querySelector<HTMLElement>('[data-ui="coach.chats.item.open"]')!;

// ---- Tests ---------------------------------------------------------------------------------

describe('CoachPage: empty chat (P08-10)', () => {
  it('shows the title, what the Coach can see and four cards in place of a conversation (ACC-I1-1)', async () => {
    await openCoach();
    await until(() => cards().length === 4);

    expect(screen.getByRole('heading', { level: 1, name: common.common.tabs.coach })).toBeVisible();
    const empty = document.querySelector('[data-ui="coach.empty"]') as HTMLElement;
    expect(within(empty).getByRole('heading', { level: 2, name: words.empty.title })).toBeVisible();
    expect(empty).toHaveTextContent(words.empty.lead);
    expect(Array.from(cards(), (card) => card.textContent)).toEqual([
      words.chips.lose.projection,
      words.chips.lose.faster,
      words.chips.lose.intake,
      words.chips.lose.dinner,
    ]);
    expect(document.querySelector('[data-ui="coach.list"]')).toBeNull();
    expect(chipRow()).toBeNull();
    expect(document.querySelector('[data-ui="coach.composer"]')).not.toBeNull();
    // A new chat: nothing to start afresh or delete yet.
    expect(chatName()).toBe(words.page.newChat);
    expect(newChatButton()).toBeDisabled();
    expect(deleteButton()).toBeDisabled();
  });

  it('sends a card’s words at once when it is tapped (ACC-I1-1)', async () => {
    const { session, lastNewId } = await openCoach();
    await until(() => cards().length === 4);

    fireEvent.click(screen.getByRole('button', { name: words.chips.lose.dinner }));

    expect(session.send).toHaveBeenCalledTimes(1);
    expect(session.send).toHaveBeenCalledWith(lastNewId(), words.chips.lose.dinner, undefined);
  });

  it('sends a card with the photo waiting in the composer and drops it there (D-16.33)', async () => {
    const { session, lastNewId } = await openCoach();
    await until(() => cards().length === 4);
    const photo = new File([new Uint8Array(8)], 'plate.jpg', { type: 'image/jpeg' });
    const library = document.querySelector('[data-ui="coach.library"]') as HTMLInputElement;
    Object.defineProperty(library, 'files', { configurable: true, value: [photo] });
    fireEvent.change(library);
    await userEvent.type(field(), 'typed words');
    expect(document.querySelector('[data-ui="coach.preview"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: words.chips.lose.intake }));

    expect(session.send).toHaveBeenCalledWith(lastNewId(), words.chips.lose.intake, photo);
    expect(document.querySelector('[data-ui="coach.preview"]')).toBeNull();
    // The typed words stay (D-16.85).
    expect(field().value).toBe('typed words');
  });

  it('turns the cards off while a reply is pending', async () => {
    const { session, setWaiting, lastNewId } = await openCoach();
    await until(() => cards().length === 4);

    setWaiting(lastNewId());
    for (const card of cards()) expect(card).toBeDisabled();
    fireEvent.click(cards()[0]!);
    expect(session.send).not.toHaveBeenCalled();
  });
});

describe('CoachPage: conversation', () => {
  it('shows the messages, the chips row above the composer, and no cards', async () => {
    await openCoach({
      messages: [asked('How was my week?'), answered('Steady: **1 850 kcal** a day.')],
    });
    await untilMessages(2);
    await until(() => chipRow() !== null);

    expect(cards()).toHaveLength(0);
    expect(chipRow()!.querySelectorAll('button')).toHaveLength(4);
    const composer = document.querySelector('[data-ui="coach.composer"]')!;
    expect(chipRow()!.compareDocumentPosition(composer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText('1 850 kcal').tagName).toBe('STRONG');
    expect(chatName()).toBe('How was my week?');
  });

  it('shows the typing dots while a reply is pending, the lit one moving every 350 ms (ACC-I1-2)', async () => {
    const { setWaiting } = await openCoach({ messages: [asked('Dinner idea?')] });
    await untilMessages(1);
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });

    setWaiting(CHAT);
    const dots = document.querySelector('[data-ui="coach.typing"]') as HTMLElement;
    expect(dots).toHaveAttribute('data-lit', '0');
    act(() => advance(TYPING_STEP_MS));
    expect(dots).toHaveAttribute('data-lit', '1');
    act(() => advance(TYPING_STEP_MS));
    expect(dots).toHaveAttribute('data-lit', '2');

    setWaiting();
    expect(document.querySelector('[data-ui="coach.typing"]')).toBeNull();
  });

  it('sends the typed words, clears the field and keeps them out of the draft', async () => {
    const user = userEvent.setup();
    const { session, lastNewId } = await openCoach();
    await until(() => cards().length === 4);

    await user.type(field(), 'What did I eat yesterday?');
    await user.click(screen.getByRole('button', { name: words.composer.send }));

    expect(session.send).toHaveBeenCalledWith(lastNewId(), 'What did I eat yesterday?', undefined);
    expect(field().value).toBe('');
  });

  it('puts the draft back and says so when the photo could not be read', async () => {
    const user = userEvent.setup();
    const { session, lastNewId } = await openCoach();
    session.send.mockResolvedValueOnce('photoUnreadable');
    await until(() => cards().length === 4);
    const photo = new File([new Uint8Array(8)], 'broken.heic', { type: 'image/heic' });
    const camera = document.querySelector('[data-ui="coach.camera"]') as HTMLInputElement;
    Object.defineProperty(camera, 'files', { configurable: true, value: [photo] });
    fireEvent.change(camera);
    await user.type(field(), 'Is this ok?');

    await user.click(screen.getByRole('button', { name: words.composer.send }));
    await untilShown('[data-ui="coach.photoProblem"]');

    expect(session.send).toHaveBeenCalledWith(lastNewId(), 'Is this ok?', photo);
    expect(screen.getByRole('alert')).toHaveTextContent(words.composer.photoUnreadable);
    expect(field().value).toBe('Is this ok?');
    expect(document.querySelector('[data-ui="coach.preview"]')).not.toBeNull();

    // Removing the photo takes the message away.
    await user.click(screen.getByRole('button', { name: words.composer.remove }));
    expect(document.querySelector('[data-ui="coach.photoProblem"]')).toBeNull();
  });

  it('shows a short line when the conversation cannot be read', async () => {
    await openCoach({
      sources: (real) => ({
        ...real,
        coachRepo: { ...real.coachRepo, list: () => Dexie.Promise.reject(new Error('unreadable')) },
      }),
    });
    await untilShown('[data-ui="coach.unreadable"]');
    expect(screen.getByText(words.page.unreadable)).toBeVisible();
    expect(deleteButton()).toBeDisabled();
  });
});

describe('CoachPage: error banner (D-16.31, R04.4)', () => {
  it('shows our message for the newest failed question, its Details, and Retry asks again', async () => {
    const user = userEvent.setup();
    const { session, repos } = await openCoach({
      messages: [
        asked('Project my weight', {
          state: { status: 'failed', kind: 'keyRejected', details: 'Invalid API key: •••' },
        }),
      ],
    });
    await untilShown('[data-ui="coach.error"]');
    const [question] = await repos.coachRepo.list(CHAT);

    expect(screen.getByRole('alert')).toHaveTextContent(ai.ai.failure.keyRejected);
    expect(screen.queryByText('Invalid API key: •••')).toBeNull();
    await user.click(screen.getByRole('button', { name: words.error.details }));
    expect(screen.getByText('Invalid API key: •••')).toBeVisible();

    await user.click(screen.getByRole('button', { name: common.common.retry }));
    expect(session.retry).toHaveBeenCalledTimes(1);
    expect(session.retry).toHaveBeenCalledWith(CHAT, question!.id);
    expect(session.send).not.toHaveBeenCalled();
  });
});

describe('CoachPage: Delete chat (P16-03, was Reset)', () => {
  it('is off while the open chat is new: there is nothing to delete', async () => {
    const { session } = await openCoach();
    await until(() => cards().length === 4);

    expect(deleteButton()).toBeDisabled();
    expect(deleteButton()).toHaveAttribute('data-ui', 'coach.reset');
    fireEvent.click(deleteButton());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(session.deleteChat).not.toHaveBeenCalled();
  });

  it('asks first; Cancel keeps the chat', async () => {
    const user = userEvent.setup();
    const { session } = await openCoach({ messages: [asked('Hello'), answered('Hi there.')] });
    await untilMessages(2);
    await until(() => !deleteButton().hasAttribute('disabled'));

    await user.click(deleteButton());
    const dialog = screen.getByRole('alertdialog', { name: words.page.confirm.title });
    expect(dialog).toHaveTextContent(words.page.confirm.message);
    await user.click(within(dialog).getByRole('button', { name: common.common.cancel }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(session.deleteChat).not.toHaveBeenCalled();
    expect(shownTexts()).toHaveLength(2);
  });

  it('deletes with the destructive Delete, also while a reply is pending, and opens a new chat (D-16.34)', async () => {
    const user = userEvent.setup();
    const { session, setWaiting, lastNewId } = await openCoach({ messages: [asked('Hello')] });
    await untilMessages(1);
    await until(() => !deleteButton().hasAttribute('disabled'));
    setWaiting(CHAT);

    await user.click(deleteButton());
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: common.common.delete,
    });
    expect(confirm).toHaveAttribute('data-ui', 'coach.resetDialog.confirm');
    await user.click(confirm);

    expect(session.deleteChat).toHaveBeenCalledTimes(1);
    expect(session.deleteChat).toHaveBeenCalledWith(CHAT);
    await until(() => screen.queryByRole('alertdialog') === null);
    // The fake deleted nothing, yet the page has moved on to a new chat.
    await until(() => cards().length === 4);
    expect(chatName()).toBe(words.page.newChat);
    expect(lastNewId()).toBe('chat-new-1');
  });

  it('says so when the chat could not be deleted', async () => {
    const user = userEvent.setup();
    const { session } = await openCoach({ messages: [asked('Hello')] });
    session.deleteChat.mockRejectedValueOnce(new Error('storage refused'));
    await untilMessages(1);
    await until(() => !deleteButton().hasAttribute('disabled'));

    await user.click(deleteButton());
    await user.click(screen.getByRole('button', { name: common.common.delete }));

    await untilShown('[data-ui="toast.message"]');
    expect(document.querySelector('[data-ui="toast.message"]')).toHaveTextContent(
      words.page.deleteFailed,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(shownTexts()).toEqual(['Hello']);
  });
});

describe('CoachPage: several chats (P16-03, D-16.99)', () => {
  /** An older chat A and a newer chat B, renamed by the person. */
  async function twoChats() {
    const opened = await openCoach({
      messages: [
        asked('Older question', { chatId: 'chat-a' }),
        answered('Older answer.', 'chat-a'),
        asked('Newer question', { chatId: 'chat-b' }),
      ],
    });
    await opened.repos.coachRepo.rename('chat-b', 'Dinners');
    return opened;
  }

  it('opens the most recent chat, with its name under the heading', async () => {
    await twoChats();
    await until(() => chatName() === 'Dinners');
    await untilMessages(1);

    expect(shownTexts()).toEqual(['Newer question']);
    expect(newChatButton()).toBeEnabled();
    expect(deleteButton()).toBeEnabled();
  });

  it('New chat opens an empty chat with the goal’s questions; its first send goes to it', async () => {
    const user = userEvent.setup();
    const { session, lastNewId } = await twoChats();
    await until(() => chatName() === 'Dinners');
    await until(() => !newChatButton().hasAttribute('disabled'));

    await user.click(newChatButton());

    await until(() => cards().length === 4);
    expect(chatName()).toBe(words.page.newChat);
    expect(newChatButton()).toBeDisabled();
    expect(deleteButton()).toBeDisabled();
    fireEvent.click(cards()[0]!);
    expect(session.send).toHaveBeenCalledWith(lastNewId(), words.chips.lose.projection, undefined);
  });

  it('lists every chat in Chats, newest first, and a tap opens one', async () => {
    const user = userEvent.setup();
    await twoChats();
    await until(() => chatName() === 'Dinners');

    const rows = await openChats(user);
    expect(
      rows.map((row) => row.querySelector('[data-ui="coach.chats.item.title"]')?.textContent),
    ).toEqual(['Dinners', 'Older question']);
    expect(rows[0]).toHaveAttribute('data-current');
    await user.click(opener(rows[1]!));

    await untilGone('[data-ui="coach.chats"]');
    await until(() => chatName() === 'Older question');
    expect(shownTexts()).toEqual(['Older question', 'Older answer.']);
  });

  it('leaves Send free in this chat while another chat waits for its reply', async () => {
    const user = userEvent.setup();
    const { session, setWaiting } = await twoChats();
    await until(() => chatName() === 'Dinners');

    setWaiting('chat-a');
    expect(document.querySelector('[data-ui="coach.typing"]')).toBeNull();
    await user.type(field(), 'And breakfast?');
    await user.click(screen.getByRole('button', { name: words.composer.send }));
    expect(session.send).toHaveBeenCalledWith('chat-b', 'And breakfast?', undefined);

    // Back in A, its own reply is still on its way: the dots show there.
    const rows = await openChats(user);
    expect(rows[1]).toHaveAttribute('data-waiting');
    await user.click(opener(rows[1]!));
    await untilShown('[data-ui="coach.typing"]');
  });

  it('renames a chat from the list in its own sheet, then shows the list again', async () => {
    const user = userEvent.setup();
    const { session } = await twoChats();
    await until(() => chatName() === 'Dinners');

    const rows = await openChats(user);
    await user.click(within(rows[1]!).getByRole('button', { name: 'Rename Older question' }));
    await untilShown('[data-ui="coach.chats.renameSheet"]');
    const sheet = screen.getByRole('dialog', { name: words.chats.renameTitle });
    const name = within(sheet).getByRole('textbox', { name: words.chats.name });
    expect(name).toHaveValue('Older question');
    await user.clear(name);
    await user.type(name, 'Breakfasts');
    await user.click(within(sheet).getByRole('button', { name: common.common.save }));

    expect(session.renameChat).toHaveBeenCalledWith('chat-a', 'Breakfasts');
    await untilGone('[data-ui="coach.chats.renameSheet"]');
    await untilShown('[data-ui="coach.chats"]');
  });

  it('deletes a chat from the list after asking; the open chat stays', async () => {
    const user = userEvent.setup();
    const { session } = await twoChats();
    await until(() => chatName() === 'Dinners');

    const rows = await openChats(user);
    await user.click(within(rows[1]!).getByRole('button', { name: 'Delete Older question' }));
    const dialog = screen.getByRole('alertdialog', { name: words.page.confirm.title });
    await user.click(within(dialog).getByRole('button', { name: common.common.delete }));

    expect(session.deleteChat).toHaveBeenCalledWith('chat-a');
    expect(chatName()).toBe('Dinners');
    expect(shownTexts()).toEqual(['Newer question']);
  });

  it('opens a new chat when the open chat is deleted elsewhere', async () => {
    const { repos } = await twoChats();
    await until(() => chatName() === 'Dinners');

    await act(() => repos.coachRepo.remove('chat-b'));

    await until(() => cards().length === 4);
    expect(chatName()).toBe(words.page.newChat);
  });
});

describe('CoachPage: keyboard', () => {
  /** A visual viewport the test can move, over a window 800 px tall. */
  function stubViewport() {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('innerHeight', 800);
    const move = (height: number, offsetTop = 0): void => {
      act(() => {
        viewport.height = height;
        viewport.offsetTop = offsetTop;
        viewport.dispatchEvent(new Event('resize'));
      });
    };
    return move;
  }

  it('ends the page above the on-screen keyboard while it is open', async () => {
    const move = stubViewport();
    await openCoach({ messages: [asked('Hello')] });
    await untilMessages(1);
    expect(page()).not.toHaveAttribute('data-keyboard');

    move(460);
    expect(page()).toHaveAttribute('data-keyboard', 'open');
    expect(page().style.getPropertyValue('--coach-keyboard')).toBe('340px');

    // The page scrolled up under the keyboard: the covered part is what is left below.
    move(460, 40);
    expect(page().style.getPropertyValue('--coach-keyboard')).toBe('300px');

    move(800);
    expect(page()).not.toHaveAttribute('data-keyboard');
  });

  it('takes a small change (browser bars) for no keyboard', async () => {
    const move = stubViewport();
    await openCoach();
    await until(() => cards().length === 4);

    move(800 - KEYBOARD_MIN_PX + 1);
    expect(page()).not.toHaveAttribute('data-keyboard');
  });

  it('lets go of the field when the person drags the conversation, not when it scrolls itself', async () => {
    await openCoach({ messages: [asked('Hello'), answered('Hi.')] });
    await untilMessages(2);
    const list = document.querySelector('[data-ui="coach.list"]') as HTMLElement;
    field().focus();
    expect(field()).toHaveFocus();

    fireEvent.scroll(list);
    expect(field()).toHaveFocus();

    fireEvent.touchMove(list);
    expect(field()).not.toHaveFocus();
  });

  it('lets go of the field on a tap in the conversation or the empty chat', async () => {
    await openCoach();
    await until(() => cards().length === 4);
    field().focus();

    fireEvent.click(document.querySelector('[data-ui="coach.empty"]')!);
    expect(field()).not.toHaveFocus();

    field().focus();
    fireEvent.touchMove(document.querySelector('[data-ui="coach.empty"]')!);
    expect(field()).not.toHaveFocus();
  });

  it('keeps the field focused when the person taps Jump to latest (P13)', async () => {
    const saved = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.ui === 'coach.list' ? 1000 : 0;
      },
    });
    try {
      await openCoach({ messages: [asked('Hello'), answered('Hi.')] });
      await untilMessages(2);
      const list = document.querySelector('[data-ui="coach.list"]') as HTMLElement;
      list.scrollTop = 0;
      fireEvent.scroll(list);
      const jump = screen.getByRole('button', { name: words.jump.label });
      field().focus();

      fireEvent.click(jump);
      expect(field()).toHaveFocus();
      expect(list.scrollTop).toBe(1000);
      expect(screen.queryByRole('button', { name: words.jump.label })).toBeNull();
    } finally {
      if (saved) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', saved);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    }
  });

  it('keeps the field focused while the person uses the composer', async () => {
    const user = userEvent.setup();
    await openCoach({ messages: [asked('Hello')] });
    await untilMessages(1);

    await user.type(field(), 'More');
    expect(field()).toHaveFocus();
    fireEvent.touchMove(field());
    expect(field()).toHaveFocus();
  });
});
