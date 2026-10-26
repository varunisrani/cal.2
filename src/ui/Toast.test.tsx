import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, useFakeTime } from '../test/time';
import { Sheet } from './Sheet';
import { TOAST_DURATION_MS, ToastProvider, useToast, type Toasts } from './Toast';

afterEach(cleanup);

/** Renders a provider and hands back its controls. */
function renderToasts(children?: ReactNode): Toasts {
  let controls: Toasts | undefined;
  function Grab() {
    controls = useToast();
    return null;
  }
  render(
    <ToastProvider>
      <Grab />
      {children}
    </ToastProvider>,
  );
  if (!controls) throw new Error('toast controls missing');
  return controls;
}

function region(): HTMLElement {
  return screen.getByRole('status');
}

describe('Toast', () => {
  it('shows a message in a polite live region and removes it after its timeout', () => {
    useFakeTime('2026-10-26T12:00:00');
    const toasts = renderToasts();
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toBeEmptyDOMElement();

    act(() => {
      toasts.show('Copied');
    });
    expect(region()).toHaveTextContent('Copied');

    act(() => advance(TOAST_DURATION_MS - 1));
    expect(region()).toHaveTextContent('Copied');
    act(() => advance(1));
    expect(region()).toBeEmptyDOMElement();
  });

  it('takes its own duration', () => {
    useFakeTime('2026-10-26T12:00:00');
    const toasts = renderToasts();
    act(() => {
      toasts.show('Saved', { duration: 1500 });
    });
    act(() => advance(1499));
    expect(region()).toHaveTextContent('Saved');
    act(() => advance(1));
    expect(region()).toBeEmptyDOMElement();
  });

  it('replaces the toast on screen and restarts the timer', () => {
    useFakeTime('2026-10-26T12:00:00');
    const toasts = renderToasts();
    act(() => {
      toasts.show('First');
    });
    act(() => advance(3000));
    act(() => {
      toasts.show('Second');
    });
    expect(region()).toHaveTextContent('Second');
    expect(region()).not.toHaveTextContent('First');

    act(() => advance(TOAST_DURATION_MS - 1));
    expect(region()).toHaveTextContent('Second');
    act(() => advance(1));
    expect(region()).toBeEmptyDOMElement();
  });

  it('goes at once when dismissed, and an old id does not remove a newer toast', () => {
    useFakeTime('2026-10-26T12:00:00');
    const toasts = renderToasts();
    let first = 0;
    act(() => {
      first = toasts.show('First');
    });
    act(() => {
      toasts.show('Second');
    });
    act(() => toasts.dismiss(first));
    expect(region()).toHaveTextContent('Second');

    let third = 0;
    act(() => {
      third = toasts.show('Third');
    });
    act(() => toasts.dismiss(third));
    expect(region()).toBeEmptyDOMElement();
  });

  it('stays announced while a sheet makes the rest of the page inert', () => {
    useFakeTime('2026-10-26T12:00:00');
    const toasts = renderToasts(
      <Sheet open title="Share" onClose={() => undefined} data-ui="test.share" />,
    );
    act(() => {
      toasts.show('Link copied');
    });
    expect(region()).toHaveTextContent('Link copied');
    expect(region().closest('[inert]')).toBeNull();
  });

  it('can be raised from a button inside the provider', () => {
    useFakeTime('2026-10-26T12:00:00');
    function Copy() {
      const toasts = useToast();
      return (
        <button type="button" onClick={() => toasts.show('Copied')}>
          Copy
        </button>
      );
    }
    render(
      <ToastProvider>
        <Copy />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('refuses to work outside a ToastProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useToast())).toThrow(/ToastProvider/);
  });
});
