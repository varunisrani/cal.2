import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { coach } from '../../i18n/en/coach';
import { Composer, EMPTY_DRAFT, canSend, type CoachDraft } from './Composer';

const words = coach.coach.composer;

const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));
let urls = new Map<string, Blob>();

beforeEach(() => {
  urls = new Map();
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:composer-test/${++made}`;
      urls.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => void urls.delete(url),
  });
});

afterEach(() => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  vi.unstubAllGlobals();
});

/** A device with a mouse or trackpad (`fine`) or a touch screen only (`coarse`). */
function pointer(kind: 'fine' | 'coarse'): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({ matches: kind === 'fine' && query === '(any-pointer: fine)' }) as MediaQueryList,
  );
}

const photoA = new File([new Uint8Array(16)], 'a.jpg', { type: 'image/jpeg' });
const photoB = new File([new Uint8Array(32)], 'b.jpg', { type: 'image/jpeg' });

interface Setup {
  readonly draft?: CoachDraft;
  readonly pending?: boolean;
  readonly photoProblem?: boolean;
}

/** The composer with its draft held the way the page holds it. */
function renderComposer({
  draft = EMPTY_DRAFT,
  pending = false,
  photoProblem = false,
}: Setup = {}) {
  const onSend = vi.fn();
  let latest = draft;
  function Holder({ pending: busy }: { readonly pending: boolean }) {
    const [held, setHeld] = useState(draft);
    latest = held;
    return (
      <Composer
        draft={held}
        onDraftChange={setHeld}
        pending={busy}
        onSend={onSend}
        photoProblem={photoProblem}
      />
    );
  }
  const view = render(<Holder pending={pending} />);
  return {
    onSend,
    draft: () => latest,
    setPending: (busy: boolean) => view.rerender(<Holder pending={busy} />),
  };
}

const field = () => screen.getByRole('textbox', { name: words.label }) as HTMLTextAreaElement;
const sendButton = () => screen.getByRole('button', { name: words.send });
const attachButton = () => screen.getByRole('button', { name: words.attach });
const cameraInput = () => document.querySelector('[data-ui="coach.camera"]') as HTMLInputElement;
const libraryInput = () => document.querySelector('[data-ui="coach.library"]') as HTMLInputElement;
const previews = () => document.querySelectorAll('[data-ui="coach.preview"]');

/** Picks `file` in one of the hidden photo inputs, as the device picker would. */
function pick(input: HTMLInputElement, file: File | null): void {
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  fireEvent.change(input);
}

function previewBlob(): Blob | undefined {
  const image = within(previews()[0] as HTMLElement).getByRole('img', { name: words.preview });
  return urls.get(image.getAttribute('src') ?? '');
}

describe('canSend', () => {
  it('needs words or a photo, and no reply pending', () => {
    expect(canSend(EMPTY_DRAFT, false)).toBe(false);
    expect(canSend({ text: ' \n\t ', photo: null }, false)).toBe(false);
    expect(canSend({ text: 'Hi', photo: null }, false)).toBe(true);
    expect(canSend({ text: '', photo: photoA }, false)).toBe(true);
    expect(canSend({ text: 'Hi', photo: photoA }, true)).toBe(false);
  });
});

describe('Composer: Send (P08-11)', () => {
  it('keeps Send off for an empty field and for spaces and line breaks only', async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();
    expect(sendButton()).toBeDisabled();
    expect(field()).toHaveAttribute('placeholder', words.placeholder);

    await user.type(field(), '   ');
    expect(sendButton()).toBeDisabled();
    fireEvent.click(sendButton());
    expect(onSend).not.toHaveBeenCalled();

    await user.type(field(), 'Protein?');
    expect(sendButton()).toBeEnabled();
    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledWith('   Protein?');
  });

  it('turns Send on for a photo alone and sends it with no words (ACC-I2-1)', async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    pick(libraryInput(), photoA);
    expect(previews()).toHaveLength(1);
    expect(sendButton()).toBeEnabled();

    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('', photoA);
  });

  it('sends the words and the photo together', async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer({ draft: { text: 'What is this?', photo: photoB } });
    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledWith('What is this?', photoB);
  });

  it('keeps the focus in the field after Send, so the keyboard stays up (P13)', async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer();
    await user.click(field());
    await user.type(field(), 'Lunch idea?');

    await user.click(sendButton());
    expect(onSend).toHaveBeenCalledWith('Lunch idea?');
    expect(field()).toHaveFocus();
  });

  it('gives the focus back to the field after Send from the keyboard (P13)', async () => {
    const user = userEvent.setup();
    const { onSend } = renderComposer({ draft: { text: 'Snack?', photo: null } });

    sendButton().focus();
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('Snack?');
    expect(field()).toHaveFocus();
  });
});

describe('Composer: keys', () => {
  it('sends on Enter with a physical keyboard, adding no line', async () => {
    pointer('fine');
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    await user.type(field(), 'Dinner idea{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Dinner idea');
    expect(field().value).toBe('Dinner idea');
  });

  it('adds a line on Shift+Enter instead of sending (ACC-I2-2)', async () => {
    pointer('fine');
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    await user.type(field(), 'Line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe('Line one\nline two');
  });

  it('keeps Enter as a new line on a touch-only device', async () => {
    pointer('coarse');
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    await user.type(field(), 'One{Enter}two');
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe('One\ntwo');
  });

  it('does nothing on Enter when there is nothing to send', async () => {
    pointer('fine');
    const user = userEvent.setup();
    const { onSend } = renderComposer();

    await user.type(field(), '  {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(field().value).toBe('  ');
  });

  it('leaves Enter to an input method that is still composing', () => {
    pointer('fine');
    const { onSend } = renderComposer({ draft: { text: 'にほん', photo: null } });
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('Composer: the photo', () => {
  it('offers Camera and Photo library; the camera opens the rear camera', async () => {
    const user = userEvent.setup();
    renderComposer();
    const cameraClick = vi.spyOn(cameraInput(), 'click').mockImplementation(() => {});
    const libraryClick = vi.spyOn(libraryInput(), 'click').mockImplementation(() => {});

    await user.click(attachButton());
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((row) => row.textContent),
    ).toEqual([words.camera, words.library]);
    await user.click(within(menu).getByRole('menuitem', { name: words.camera }));
    expect(cameraClick).toHaveBeenCalledTimes(1);

    await user.click(attachButton());
    await user.click(screen.getByRole('menuitem', { name: words.library }));
    expect(libraryClick).toHaveBeenCalledTimes(1);

    expect(cameraInput()).toHaveAttribute('capture', 'environment');
    expect(cameraInput()).toHaveAttribute('accept', 'image/*');
    expect(libraryInput()).not.toHaveAttribute('capture');
    expect(libraryInput()).toHaveAttribute('accept', 'image/*');
  });

  it('shows the picked photo as a thumbnail; a second pick replaces the first', () => {
    const { draft } = renderComposer();

    pick(cameraInput(), photoA);
    expect(previewBlob()).toBe(photoA);

    pick(libraryInput(), photoB);
    expect(previews()).toHaveLength(1);
    expect(previewBlob()).toBe(photoB);
    expect(draft().photo).toBe(photoB);
    // The first thumbnail's address was let go.
    expect([...urls.values()]).toEqual([photoB]);
  });

  it('removes the photo with its button', async () => {
    const user = userEvent.setup();
    const { draft } = renderComposer();
    pick(libraryInput(), photoA);

    await user.click(screen.getByRole('button', { name: words.remove }));
    expect(previews()).toHaveLength(0);
    expect(draft().photo).toBeNull();
    expect(sendButton()).toBeDisabled();
  });

  it('keeps the photo when the picker is closed without one', () => {
    const { draft } = renderComposer();
    pick(libraryInput(), photoA);
    pick(libraryInput(), null);
    expect(draft().photo).toBe(photoA);
  });

  it('says when a photo could not be read', () => {
    renderComposer({ photoProblem: true });
    expect(screen.getByRole('alert')).toHaveTextContent(words.photoUnreadable);
  });
});

describe('Composer: while a reply is pending', () => {
  it('turns the photo button and Send off, and typing goes on', async () => {
    const user = userEvent.setup();
    const { onSend, setPending } = renderComposer({ draft: { text: 'Next', photo: photoA } });
    expect(attachButton()).toBeEnabled();

    setPending(true);
    expect(attachButton()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    await user.click(attachButton());
    expect(screen.queryByRole('menu')).toBeNull();

    await user.type(field(), ' question');
    expect(field().value).toBe('Next question');
    fireEvent.click(sendButton());
    expect(onSend).not.toHaveBeenCalled();

    setPending(false);
    expect(attachButton()).toBeEnabled();
    expect(sendButton()).toBeEnabled();
  });

  it('closes an open photo menu when a reply starts', async () => {
    const user = userEvent.setup();
    const { setPending } = renderComposer();
    await user.click(attachButton());
    expect(screen.getByRole('menu')).toBeInTheDocument();

    act(() => setPending(true));
    expect(screen.queryByRole('menu')).toBeNull();

    act(() => setPending(false));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Composer: growing with the text', () => {
  it('sizes the field to its text (the stylesheet stops it at six lines)', async () => {
    const user = userEvent.setup();
    renderComposer();
    Object.defineProperty(field(), 'scrollHeight', { configurable: true, value: 92 });

    await user.type(field(), 'a{Shift>}{Enter}{/Shift}b');
    expect(field().style.height).toBe('92px');
    expect(field()).toHaveAttribute('rows', '1');
  });

  // Tests run in Node, but the app's tsconfig has no Node types: this is all we use of node:fs.
  let stylesheet = '';
  beforeAll(async () => {
    const NODE_FS = 'node:fs';
    const fs = (await import(/* @vite-ignore */ NODE_FS)) as {
      readFileSync(path: string, encoding: 'utf8'): string;
    };
    const here = decodeURIComponent(new URL(import.meta.url).pathname);
    stylesheet = fs.readFileSync(here.replace(/[^/]+$/, 'coach.module.css'), 'utf8');
  });

  it('grows with the text to six lines, then scrolls (P13)', () => {
    const rule = /\.field \{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
    expect(rule).toContain('max-block-size: calc(6lh + var(--space-3) * 2);');
    expect(rule).toContain('overflow-y: auto;');
    expect(rule).toContain('resize: none;');
  });
});
