import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coach } from '../../i18n/en/coach';
import { ToastProvider } from '../../ui/Toast';
import { COPIED_TOAST_MS, CopyButton } from './CopyButton';

const words = coach.coach.copy;

const REPLY = '## Today\n- **Protein:** 92 g of 120 g\n- See [the guide](https://example.org)';

/** Puts a clipboard on the navigator for one test (jsdom has none). */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: spy },
  });
  return spy;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

function renderButton() {
  render(
    <ToastProvider>
      <CopyButton text={REPLY} />
    </ToastProvider>,
  );
  return screen.getByRole('button', { name: words.label });
}

function toastText(): string | null {
  return document.querySelector('[data-ui="toast.message"]')?.textContent ?? null;
}

describe('CopyButton', () => {
  it('puts the raw reply text on the clipboard and confirms it briefly (ACC-I4-2)', async () => {
    vi.useFakeTimers();
    const writeText = stubClipboard(() => Promise.resolve());
    const button = renderButton();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(REPLY);
    expect(toastText()).toBe(words.done);

    act(() => {
      vi.advanceTimersByTime(COPIED_TOAST_MS);
    });
    expect(toastText()).toBeNull();
  });

  it('says the copy failed when the clipboard refuses', async () => {
    stubClipboard(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')));
    const button = renderButton();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(toastText()).toBe(words.failed);
  });

  it('copies with the copy command and says Copied when there is no Clipboard API (P13)', async () => {
    const copied: string[] = [];
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: (command: string) => {
        copied.push(`${command}: ${(document.activeElement as HTMLTextAreaElement).value}`);
        return true;
      },
    });
    const button = renderButton();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(copied).toEqual([`copy: ${REPLY}`]);
    expect(toastText()).toBe('Copied');
  });

  it('says the copy failed when there is no clipboard at all', async () => {
    const button = renderButton();

    await act(async () => {
      fireEvent.click(button);
    });

    expect(toastText()).toBe(words.failed);
  });
});
