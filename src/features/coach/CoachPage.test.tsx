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
  untilShown,
  type Harness,
  type HarnessOptions,
} from '../../test/screenHarness';
import { advance } from '../../test/time';
import { CoachPage } from './CoachPage';
import { KEYBOARD_MIN_PX } from './keyboard';
import { TYPING_STEP_MS } from './TypingDots';

const words = coach.coach;

// ---- A session the test drives -------------------------------------------------------------

/** The coach session's shape, with each action a spy and `pending` set by the test. */
function fakeSession() {
  let state: CoachSessionState = { pending: false };
  const listeners = new Set<() => void>();
  const session = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send: vi.fn<(text: string, image?: Blob) => Promise<TurnOutcome>>(async () => 'answered'),
    retry: vi.fn<(id: string) => Promise<TurnOutcome>>(async () => 'answered'),
    reset: vi.fn<() => Promise<void>>(async () => undefined),
    addReminder: vi.fn<CoachSession['addReminder']>(async () => ({ ok: true, reminderId: 'r' })),
    dismissReminder: vi.fn<CoachSession['dismissReminder']>(async () => undefined),
  } satisfies CoachSession;
  const setPending = (pending: boolean): void => {
    act(() => {
      state = { pending };
      for (const listener of [...listeners]) listener();
    });
  };
  return { session, setPending };
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
  for (const message of messages) await h.repos.coachRepo.append(message);
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
  return { role: 'user', text, at: FACTORY_NOW + minute * 60_000, ...changes };
}
function answered(text: string): NewCoachMessage {
  minute += 1;
  return { role: 'assistant', text, at: FACTORY_NOW + minute * 60_000 };
}

const cards = () => document.querySelectorAll('[data-ui^="coach.card."]');
const chipRow = () => document.querySelector('[data-ui="coach.chips"]');
const resetButton = () => screen.getByRole('button', { name: words.page.reset });
const field = () =>
  screen.getByRole('textbox', { name: words.composer.label }) as HTMLTextAreaElement;
const page = () => document.querySelector('[data-ui="screen.coach"]') as HTMLElement;
const untilMessages = (count: number) =>
  until(() => document.querySelectorAll('[data-ui="coach.message"]').length === count);

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
  });

  it('sends a card’s words at once when it is tapped (ACC-I1-1)', async () => {
    const { session } = await openCoach();
    await until(() => cards().length === 4);

    fireEvent.click(screen.getByRole('button', { name: words.chips.lose.dinner }));

    expect(session.send).toHaveBeenCalledTimes(1);
    expect(session.send).toHaveBeenCalledWith(words.chips.lose.dinner, undefined);
  });

  it('sends a card with the photo waiting in the composer and drops it there (D-16.33)', async () => {
    const { session } = await openCoach();
    await until(() => cards().length === 4);
    const photo = new File([new Uint8Array(8)], 'plate.jpg', { type: 'image/jpeg' });
    const library = document.querySelector('[data-ui="coach.library"]') as HTMLInputElement;
    Object.defineProperty(library, 'files', { configurable: true, value: [photo] });
    fireEvent.change(library);
    await userEvent.type(field(), 'typed words');
    expect(document.querySelector('[data-ui="coach.preview"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: words.chips.lose.intake }));

    expect(session.send).toHaveBeenCalledWith(words.chips.lose.intake, photo);
    expect(document.querySelector('[data-ui="coach.preview"]')).toBeNull();
    // The typed words stay (D-16.85).
    expect(field().value).toBe('typed words');
  });

  it('turns the cards off while a reply is pending', async () => {
    const { session, setPending } = await openCoach();
    await until(() => cards().length === 4);

    setPending(true);
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
  });

  it('shows the typing dots while a reply is pending, the lit one moving every 350 ms (ACC-I1-2)', async () => {
    const { setPending } = await openCoach({ messages: [asked('Dinner idea?')] });
    await untilMessages(1);
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });

    setPending(true);
    const dots = document.querySelector('[data-ui="coach.typing"]') as HTMLElement;
    expect(dots).toHaveAttribute('data-lit', '0');
    act(() => advance(TYPING_STEP_MS));
    expect(dots).toHaveAttribute('data-lit', '1');
    act(() => advance(TYPING_STEP_MS));
    expect(dots).toHaveAttribute('data-lit', '2');

    setPending(false);
    expect(document.querySelector('[data-ui="coach.typing"]')).toBeNull();
  });

  it('sends the typed words, clears the field and keeps them out of the draft', async () => {
    const user = userEvent.setup();
    const { session } = await openCoach();
    await until(() => cards().length === 4);

    await user.type(field(), 'What did I eat yesterday?');
    await user.click(screen.getByRole('button', { name: words.composer.send }));

    expect(session.send).toHaveBeenCalledWith('What did I eat yesterday?', undefined);
    expect(field().value).toBe('');
  });

  it('puts the draft back and says so when the photo could not be read', async () => {
    const user = userEvent.setup();
    const { session } = await openCoach();
    session.send.mockResolvedValueOnce('photoUnreadable');
    await until(() => cards().length === 4);
    const photo = new File([new Uint8Array(8)], 'broken.heic', { type: 'image/heic' });
    const camera = document.querySelector('[data-ui="coach.camera"]') as HTMLInputElement;
    Object.defineProperty(camera, 'files', { configurable: true, value: [photo] });
    fireEvent.change(camera);
    await user.type(field(), 'Is this ok?');

    await user.click(screen.getByRole('button', { name: words.composer.send }));
    await untilShown('[data-ui="coach.photoProblem"]');

    expect(session.send).toHaveBeenCalledWith('Is this ok?', photo);
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
        coachRepo: { list: () => Dexie.Promise.reject(new Error('unreadable')) },
      }),
    });
    await untilShown('[data-ui="coach.unreadable"]');
    expect(screen.getByText(words.page.unreadable)).toBeVisible();
    expect(resetButton()).toBeDisabled();
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
    const [question] = await repos.coachRepo.list();

    expect(screen.getByRole('alert')).toHaveTextContent(ai.ai.failure.keyRejected);
    expect(screen.queryByText('Invalid API key: •••')).toBeNull();
    await user.click(screen.getByRole('button', { name: words.error.details }));
    expect(screen.getByText('Invalid API key: •••')).toBeVisible();

    await user.click(screen.getByRole('button', { name: common.common.retry }));
    expect(session.retry).toHaveBeenCalledTimes(1);
    expect(session.retry).toHaveBeenCalledWith(question!.id);
    expect(session.send).not.toHaveBeenCalled();
  });
});

describe('CoachPage: Reset', () => {
  it('is off while there is nothing to clear', async () => {
    const { session } = await openCoach();
    await until(() => cards().length === 4);

    expect(resetButton()).toBeDisabled();
    expect(resetButton()).toHaveAttribute('data-ui', 'coach.reset');
    fireEvent.click(resetButton());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(session.reset).not.toHaveBeenCalled();
  });

  it('asks first; Cancel keeps the chat', async () => {
    const user = userEvent.setup();
    const { session } = await openCoach({ messages: [asked('Hello'), answered('Hi there.')] });
    await untilMessages(2);
    expect(resetButton()).toBeEnabled();

    await user.click(resetButton());
    const dialog = screen.getByRole('alertdialog', { name: words.page.confirm.title });
    expect(dialog).toHaveTextContent(words.page.confirm.message);
    await user.click(within(dialog).getByRole('button', { name: common.common.cancel }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(session.reset).not.toHaveBeenCalled();
  });

  it('clears with the destructive Clear, also while a reply is pending (D-16.34)', async () => {
    const user = userEvent.setup();
    const { session, setPending } = await openCoach({ messages: [asked('Hello')] });
    await untilMessages(1);
    setPending(true);

    await user.click(resetButton());
    const clear = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: words.page.confirm.clear,
    });
    expect(clear).toHaveAttribute('data-ui', 'coach.resetDialog.confirm');
    await user.click(clear);

    expect(session.reset).toHaveBeenCalledTimes(1);
    await until(() => screen.queryByRole('alertdialog') === null);
  });

  it('says so when the chat could not be cleared', async () => {
    const user = userEvent.setup();
    const { session } = await openCoach({ messages: [asked('Hello')] });
    session.reset.mockRejectedValueOnce(new Error('storage refused'));
    await untilMessages(1);

    await user.click(resetButton());
    await user.click(screen.getByRole('button', { name: words.page.confirm.clear }));

    await untilShown('[data-ui="toast.message"]');
    expect(document.querySelector('[data-ui="toast.message"]')).toHaveTextContent(
      words.page.resetFailed,
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
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
