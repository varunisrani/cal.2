import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachMessage } from '../../domain/model';
import { ai } from '../../i18n/en/ai';
import { coach } from '../../i18n/en/coach';
import { common } from '../../i18n/en/common';
import { ToastProvider } from '../../ui/Toast';
import { FOLLOW_SLACK_PX } from './followEnd';
import { MessageList, type MessageListProps } from './MessageList';

const AT = Date.parse('2026-10-26T12:30:00-04:00');
const words = coach.coach;

const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));
let urls = new Map<string, Blob>();

/** The list's content height and its visible height, as the browser would report them. */
let contentHeight = 0;
let viewHeight = 0;
const savedScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const savedClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeEach(() => {
  urls = new Map();
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:coach-test/${++made}`;
      urls.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => void urls.delete(url),
  });
  contentHeight = 0;
  viewHeight = 0;
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.ui === 'coach.list' ? contentHeight : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.ui === 'coach.list' ? viewHeight : 0;
    },
  });
});

afterEach(() => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  if (savedScrollHeight)
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', savedScrollHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  if (savedClientHeight)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', savedClientHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  vi.unstubAllGlobals();
});

let nextId = 0;
function message(changes: Partial<CoachMessage> & Pick<CoachMessage, 'role' | 'text'>) {
  nextId += 1;
  return { id: `m${nextId}`, chatId: 'chat-1', at: AT + nextId, ...changes } satisfies CoachMessage;
}

const photo = new Blob([new Uint8Array(32)], { type: 'image/jpeg' });

function renderList(props: Partial<MessageListProps> = {}) {
  const onRetry = vi.fn();
  const element = (next: Partial<MessageListProps>): ReactElement => (
    <ToastProvider>
      <MessageList
        messages={[]}
        pending={false}
        onRetry={onRetry}
        keyboardInset={0}
        {...props}
        {...next}
      />
    </ToastProvider>
  );
  const view = render(element({}));
  return {
    onRetry,
    rerender: (next: Partial<MessageListProps>) => view.rerender(element(next)),
  };
}

const list = () => document.querySelector('[data-ui="coach.list"]') as HTMLElement;
/** The last thing in the conversation. */
const lastItem = () => list().firstElementChild?.lastElementChild;
const bubbles = () => Array.from(document.querySelectorAll('[data-ui="coach.message"]'));
const banner = () => document.querySelector('[data-ui="coach.error"]');
const typing = () => document.querySelector('[data-ui="coach.typing"]');

describe('MessageList: bubbles', () => {
  it('shows the person’s words as typed on the right, under the photo they attached', () => {
    const asked = message({ role: 'user', text: 'Is **this** ok?\nAnd this?', thumb: photo });
    renderList({ messages: [asked] });

    const [bubble] = bubbles();
    expect(bubble).toHaveAttribute('data-role', 'user');
    const image = within(bubble as HTMLElement).getByRole('img', { name: words.photo });
    expect(urls.get(image.getAttribute('src') ?? '')).toBe(photo);
    const text = bubble!.querySelector('p');
    expect(text?.textContent).toBe('Is **this** ok?\nAnd this?');
    expect(bubble!.querySelector('strong')).toBeNull();
    // The photo comes first, the words under it.
    expect(image.compareDocumentPosition(text!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a question without a photo as words only', () => {
    renderList({ messages: [message({ role: 'user', text: 'Just words' })] });
    expect(within(bubbles()[0] as HTMLElement).queryByRole('img')).toBeNull();
  });

  it('shows the Coach’s reply on the left behind a badge, drawn from Markdown, with copy', () => {
    const reply = message({ role: 'assistant', text: 'You had **92 g** of protein.' });
    renderList({ messages: [reply] });

    const [bubble] = bubbles();
    expect(bubble).toHaveAttribute('data-role', 'assistant');
    const badge = bubble!.firstElementChild;
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(within(bubble as HTMLElement).getByText('92 g').tagName).toBe('STRONG');
    expect(bubble!.querySelector('[data-ui="coach.reply"]')).not.toBeNull();
    expect(
      within(bubble as HTMLElement).getByRole('button', { name: words.copy.label }),
    ).toHaveAttribute('data-ui', 'coach.copy');
  });

  it('keeps the stored order and names the conversation', () => {
    renderList({
      messages: [
        message({ role: 'user', text: 'First' }),
        message({ role: 'assistant', text: 'Second' }),
        message({ role: 'user', text: 'Third' }),
      ],
    });
    expect(bubbles().map((bubble) => bubble.getAttribute('data-role'))).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(screen.getByRole('log', { name: words.page.conversation })).toBe(list());
  });
});

describe('MessageList: typing dots', () => {
  it('shows the dots after the last message only while a reply is pending (ACC-I1-2)', () => {
    const asked = message({ role: 'user', text: 'How am I doing?' });
    const { rerender } = renderList({ messages: [asked], pending: true });

    expect(typing()).not.toBeNull();
    expect(lastItem()?.contains(typing())).toBe(true);

    rerender({ messages: [asked, message({ role: 'assistant', text: 'Well.' })], pending: false });
    expect(typing()).toBeNull();
  });
});

describe('MessageList: a reply streaming in (D-16.106)', () => {
  const live = () => document.querySelector<HTMLElement>('[data-ui="coach.live"]');
  const question = message({ role: 'user', text: 'What did I eat yesterday?' });

  it('grows the reply in the pending bubble, the dots where the copy button comes (ACC-I13-1)', () => {
    const { rerender } = renderList({ messages: [question], pending: true });
    expect(live()).toBeNull();
    expect(typing()).not.toBeNull();

    rerender({ pending: true, live: 'Yesterday: a **latte**' });
    expect(live()).not.toBeNull();
    expect(lastItem()).toBe(live());
    expect(within(live()!).getByText('latte').tagName).toBe('STRONG');
    // The dots stay, now in the copy button's place under the words.
    expect(live()!.contains(typing())).toBe(true);
    expect(typing()!.parentElement!.previousElementSibling).toHaveAttribute('inert');
    expect(within(live()!).queryByRole('button')).toBeNull();
    // Not a stored message: no bubble, no copy.
    expect(bubbles()).toHaveLength(1);

    rerender({ pending: true, live: 'Yesterday: a **latte** and lasagne.' });
    expect(live()).toHaveTextContent('Yesterday: a latte and lasagne.');
  });

  it('keeps the growing words out of what is read out, links included, until they are stored', () => {
    renderList({
      messages: [question],
      pending: true,
      live: 'See [the guide](https://example.test/guide) for',
    });
    const words = live()!.querySelector('[data-ui="coach.reply"]')!.parentElement!;
    expect(words).toHaveAttribute('inert');
    expect(words.querySelector('a')).not.toBeNull();
    // The dots say a reply is being written, once.
    expect(within(live()!).getByRole('status')).toHaveTextContent(coach.coach.typing);
  });

  it('keeps the words when the turn ends until the stored reply takes their place', () => {
    const text = 'Yesterday: a latte.';
    const { rerender } = renderList({ messages: [question], pending: true, live: text });

    rerender({ pending: false, live: undefined });
    expect(live()).toHaveTextContent(text);
    expect(typing()).toBeNull();

    rerender({
      messages: [question, message({ role: 'assistant', text })],
      pending: false,
      live: undefined,
    });
    expect(live()).toBeNull();
    expect(bubbles()).toHaveLength(2);
  });

  it('shows the stored reply alone when it comes back before the turn lets the words go', () => {
    const text = 'Yesterday: a latte.';
    const { rerender } = renderList({ messages: [question], pending: true, live: text });
    const stored = [question, message({ role: 'assistant', text })];
    rerender({ messages: stored, pending: true, live: text });
    expect(live()).toBeNull();
    rerender({ messages: stored, pending: false, live: undefined });
    expect(live()).toBeNull();
    expect(bubbles()).toHaveLength(2);
  });

  it('lets the words go for the banner when the turn fails', () => {
    const { rerender } = renderList({ messages: [question], pending: true, live: 'Yesterday: a' });
    rerender({ pending: false, live: undefined });
    expect(live()).not.toBeNull();

    rerender({
      messages: [{ ...question, state: { status: 'failed', kind: 'connection' } }],
      pending: false,
      live: undefined,
    });
    expect(live()).toBeNull();
    expect(banner()).not.toBeNull();
  });

  it('shows the dots alone again when the reply starts over (the standby)', () => {
    const { rerender } = renderList({ messages: [question], pending: true, live: 'Yesterday: a' });
    rerender({ pending: true, live: undefined });
    expect(live()).toBeNull();
    expect(typing()).not.toBeNull();
  });

  it('follows the growing reply at the end, and stays put when the person scrolled up', () => {
    contentHeight = 700;
    viewHeight = 300;
    const { rerender } = renderList({ messages: [question], pending: true });
    expect(list().scrollTop).toBe(700);

    contentHeight = 760;
    rerender({ pending: true, live: 'Yesterday' });
    expect(list().scrollTop).toBe(760);
    contentHeight = 820;
    rerender({ pending: true, live: 'Yesterday: a latte' });
    expect(list().scrollTop).toBe(820);

    list().scrollTop = 100;
    fireEvent.scroll(list());
    contentHeight = 900;
    rerender({ pending: true, live: 'Yesterday: a latte and lasagne' });
    expect(list().scrollTop).toBe(100);
  });
});

describe('MessageList: error banner', () => {
  const failed = (text: string, details?: string) =>
    message({
      role: 'user',
      text,
      state: { status: 'failed', kind: 'rateLimit', ...(details ? { details } : {}) },
    });

  it('shows the banner at the end for the newest failed question; Retry asks it again', () => {
    const question = failed('What about dinner?', 'Rate limit reached for requests');
    const { onRetry } = renderList({
      messages: [
        message({ role: 'user', text: 'Hi' }),
        message({ role: 'assistant', text: 'Hello' }),
        question,
      ],
    });

    expect(lastItem()).toBe(banner());
    expect(screen.getByRole('alert')).toHaveTextContent(ai.ai.failure.rateLimit);
    fireEvent.click(screen.getByRole('button', { name: words.error.details }));
    expect(screen.getByText('Rate limit reached for requests')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: common.common.retry }));
    expect(onRetry).toHaveBeenCalledWith(question.id);
  });

  it('hides the banner while a reply is pending', () => {
    renderList({ messages: [failed('What about dinner?')], pending: true });
    expect(banner()).toBeNull();
    expect(typing()).not.toBeNull();
  });

  it('shows no banner for a failed question that later messages followed', () => {
    renderList({
      messages: [
        failed('First try'),
        message({ role: 'user', text: 'Second question' }),
        message({ role: 'assistant', text: 'An answer' }),
      ],
    });
    expect(banner()).toBeNull();
  });

  it('shows no banner when the newest question simply has no answer yet', () => {
    renderList({ messages: [message({ role: 'user', text: 'Still open' })] });
    expect(banner()).toBeNull();
  });
});

describe('MessageList: following the end', () => {
  /** The person scrolls the list to `top`, as a finger or a wheel would. */
  const scrollTo = (top: number): void => {
    list().scrollTop = top;
    fireEvent.scroll(list());
  };
  const jumpButton = () => document.querySelector<HTMLElement>('[data-ui="coach.jumpLatest"]');

  it('opens at the newest message, at once', () => {
    contentHeight = 400;
    viewHeight = 300;
    renderList({ messages: [message({ role: 'user', text: 'One' })] });

    expect(list().scrollTop).toBe(400);
    // Later moves glide (the stylesheet's, unless motion is reduced).
    expect(list()).toHaveAttribute('data-settled');
    expect(jumpButton()).toBeNull();
  });

  it('follows a reply and the waiting dots while the person is at the end or within 80 px of it', () => {
    contentHeight = 700;
    viewHeight = 300;
    const first = message({ role: 'user', text: 'One' });
    const { rerender } = renderList({ messages: [first] });
    expect(list().scrollTop).toBe(700);

    // 80 px above the end still reads the newest message.
    scrollTo(700 - 300 - FOLLOW_SLACK_PX);
    contentHeight = 900;
    rerender({ messages: [first], pending: true });
    expect(list().scrollTop).toBe(900);

    contentHeight = 1100;
    const reply = message({ role: 'assistant', text: 'Two' });
    rerender({ messages: [first, reply], pending: false });
    expect(list().scrollTop).toBe(1100);
    expect(jumpButton()).toBeNull();
  });

  it('stays where the person scrolled up to and counts the new messages on Jump to latest', () => {
    contentHeight = 700;
    viewHeight = 300;
    const first = message({ role: 'user', text: 'One' });
    const { rerender } = renderList({ messages: [first] });

    scrollTo(700 - 300 - FOLLOW_SLACK_PX - 1);
    expect(screen.getByRole('button', { name: words.jump.label })).toBe(jumpButton());

    contentHeight = 900;
    rerender({ messages: [first], pending: true });
    const reply = message({ role: 'assistant', text: 'Two' });
    rerender({ messages: [first, reply], pending: false });
    expect(list().scrollTop).toBe(700 - 300 - FOLLOW_SLACK_PX - 1);
    expect(jumpButton()).toHaveAccessibleName('Jump to latest, 1 new message');
    expect(jumpButton()).toHaveTextContent('1 new');

    const more = message({ role: 'assistant', text: 'Three' });
    rerender({ messages: [first, reply, more] });
    expect(jumpButton()).toHaveAccessibleName('Jump to latest, 2 new messages');
    // It floats over the list, outside the log, so it is never announced as a message.
    expect(list().contains(jumpButton())).toBe(false);
  });

  it('glides to the newest on Jump to latest, at once with reduced motion', () => {
    contentHeight = 700;
    viewHeight = 300;
    renderList({ messages: [message({ role: 'assistant', text: 'One' })] });
    const glide = vi.fn();
    list().scrollTo = glide as unknown as HTMLElement['scrollTo'];

    scrollTo(100);
    fireEvent.click(jumpButton()!);
    expect(glide).toHaveBeenLastCalledWith({ top: 700, behavior: 'smooth' });
    expect(jumpButton()).toBeNull();

    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({ matches: query === '(prefers-reduced-motion: reduce)' }) as MediaQueryList,
    );
    scrollTo(700 - 300);
    scrollTo(50);
    fireEvent.click(jumpButton()!);
    expect(glide).toHaveBeenLastCalledWith({ top: 700, behavior: 'instant' });
  });

  it('brings the end back for the person’s own question, even when scrolled up', () => {
    contentHeight = 700;
    viewHeight = 300;
    const first = message({ role: 'assistant', text: 'One' });
    const { rerender } = renderList({ messages: [first] });
    scrollTo(100);
    expect(jumpButton()).not.toBeNull();

    contentHeight = 800;
    rerender({ messages: [first, message({ role: 'user', text: 'Two?' })] });
    expect(list().scrollTop).toBe(800);
    expect(jumpButton()).toBeNull();
  });

  it('takes Jump to latest away at the end, and counts afresh after the next scroll up', () => {
    contentHeight = 700;
    viewHeight = 300;
    const first = message({ role: 'user', text: 'One' });
    const { rerender } = renderList({ messages: [first] });
    scrollTo(0);
    const reply = message({ role: 'assistant', text: 'Two' });
    rerender({ messages: [first, reply] });
    expect(jumpButton()).toHaveAttribute('data-unseen', '1');

    scrollTo(400);
    expect(jumpButton()).toBeNull();

    scrollTo(0);
    expect(jumpButton()).toHaveAttribute('data-unseen', '0');
    expect(jumpButton()).toHaveAccessibleName(words.jump.label);
  });

  it('does not take a glide on its way down for leaving the end', () => {
    contentHeight = 2000;
    viewHeight = 300;
    const first = message({ role: 'user', text: 'One' });
    const { rerender } = renderList({ messages: [first] });
    // The browser glides by itself after the call: here the test moves the list.
    list().scrollTo = vi.fn() as unknown as HTMLElement['scrollTo'];
    scrollTo(0);
    fireEvent.click(jumpButton()!);

    // The glide passes far from the end on its way down.
    scrollTo(600);
    scrollTo(1200);
    expect(jumpButton()).toBeNull();
    contentHeight = 2200;
    rerender({ messages: [first, message({ role: 'assistant', text: 'Two' })] });
    expect(list().scrollTop).toBe(2200);
  });

  it('comes back to the end when the keyboard opens', () => {
    contentHeight = 500;
    const { rerender } = renderList({ messages: [message({ role: 'user', text: 'One' })] });
    list().scrollTop = 0;

    rerender({ keyboardInset: 300 });
    expect(list().scrollTop).toBe(500);
  });

  it('leaves the scroll alone when nothing it follows changed', () => {
    contentHeight = 500;
    const messages = [message({ role: 'user', text: 'One' })];
    const { rerender } = renderList({ messages });
    list().scrollTop = 40;

    // A live read hands in new objects for the same messages.
    rerender({ messages: messages.map((each) => ({ ...each })) });
    expect(list().scrollTop).toBe(40);
  });

  it('is a polite log of what is added, so a whole reply is announced once', () => {
    renderList({ messages: [message({ role: 'assistant', text: 'One' })] });
    expect(list()).toHaveAttribute('role', 'log');
    expect(list()).toHaveAttribute('aria-live', 'polite');
    expect(list()).toHaveAttribute('aria-relevant', 'additions');
  });
});

describe('MessageList: staying at the end', () => {
  /** Live observers of the list's sizes (jsdom has no ResizeObserver): fire them, see targets. */
  function fakeResizes() {
    const live = new Set<{ readonly fire: () => void; readonly targets: Element[] }>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly entry: { readonly fire: () => void; readonly targets: Element[] };
        constructor(callback: ResizeObserverCallback) {
          this.entry = { fire: () => callback([], this as unknown as ResizeObserver), targets: [] };
          live.add(this.entry);
        }
        observe(target: Element) {
          this.entry.targets.push(target);
        }
        unobserve() {}
        disconnect() {
          live.delete(this.entry);
        }
      },
    );
    return {
      resized: () => act(() => live.forEach((observer) => observer.fire())),
      watched: () => [...live].flatMap((observer) => observer.targets),
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the end in view when the sizes change while the person is at the end', () => {
    const { resized, watched } = fakeResizes();
    contentHeight = 500;
    renderList({ messages: [message({ role: 'user', text: 'One' })] });
    expect(list().scrollTop).toBe(500);
    expect(watched()).toEqual([list(), list().firstElementChild]);

    // A photo is attached below, or Details opens: the end moves, the list follows.
    contentHeight = 620;
    resized();
    expect(list().scrollTop).toBe(620);

    // Near enough to the end still counts.
    list().scrollTop = 620 - FOLLOW_SLACK_PX;
    fireEvent.scroll(list());
    contentHeight = 700;
    resized();
    expect(list().scrollTop).toBe(700);
  });

  it('leaves the place the person scrolled back to', () => {
    const { resized } = fakeResizes();
    contentHeight = 600;
    renderList({ messages: [message({ role: 'user', text: 'One' })] });

    list().scrollTop = 100;
    fireEvent.scroll(list());
    contentHeight = 720;
    resized();
    expect(list().scrollTop).toBe(100);

    list().scrollTop = 720;
    fireEvent.scroll(list());
    contentHeight = 800;
    resized();
    expect(list().scrollTop).toBe(800);
  });

  it('stops watching when it goes away', () => {
    const { watched } = fakeResizes();
    const view = render(
      <ToastProvider>
        <MessageList
          messages={[message({ role: 'user', text: 'One' })]}
          pending={false}
          onRetry={vi.fn()}
          keyboardInset={0}
        />
      </ToastProvider>,
    );
    expect(watched()).toHaveLength(2);
    view.unmount();
    expect(watched()).toHaveLength(0);
  });
});
