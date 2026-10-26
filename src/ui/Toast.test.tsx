import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, useFakeTime } from '../test/time';
import { Toast, TOAST_DEFAULT_MS, ToastProvider, useToast } from './Toast';

afterEach(cleanup);

/** A screen that shows a toast per button. */
function Screen() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.show('Saved')}>Save</button>
      <button onClick={() => toast.show('Copied', { durationMs: 1500 })}>Copy</button>
      <button onClick={() => toast.dismiss()}>Hide</button>
    </>
  );
}

function renderScreen() {
  render(
    <ToastProvider>
      <Screen />
    </ToastProvider>,
  );
  const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  const wait = (ms: number) => act(() => advance(ms));
  return { press, wait, region: screen.getByRole('status') };
}

describe('Toast', () => {
  beforeEach(() => {
    useFakeTime('2026-10-26T09:00:00');
  });

  it('keeps an empty polite live region on the page before any toast', () => {
    const { region } = renderScreen();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('shows a message in the live region and takes it away after its timeout', () => {
    const { press, wait, region } = renderScreen();
    press('Save');
    expect(region).toHaveTextContent('Saved');
    wait(TOAST_DEFAULT_MS - 1);
    expect(region).toHaveTextContent('Saved');
    wait(1);
    expect(region).toBeEmptyDOMElement();
  });

  it('uses the duration it is given', () => {
    const { press, wait, region } = renderScreen();
    press('Copy');
    wait(1499);
    expect(region).toHaveTextContent('Copied');
    wait(1);
    expect(region).toBeEmptyDOMElement();
  });

  it('replaces the toast on show with a newer one and restarts the timer', () => {
    const { press, wait, region } = renderScreen();
    press('Save');
    wait(TOAST_DEFAULT_MS - 500);
    press('Save');
    wait(TOAST_DEFAULT_MS - 1);
    expect(region).toHaveTextContent('Saved');
    press('Copy');
    expect(region).toHaveTextContent('Copied');
    expect(region).not.toHaveTextContent('Saved');
    wait(1500);
    expect(region).toBeEmptyDOMElement();
  });

  it('can be taken away at once', () => {
    const { press, region } = renderScreen();
    press('Save');
    press('Hide');
    expect(region).toBeEmptyDOMElement();
  });

  it('calls onDismiss once the time is up when used on its own', () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ message: 'Logged', durationMs: 2000 }} onDismiss={onDismiss} />);
    expect(screen.getByRole('status')).toHaveTextContent('Logged');
    act(() => advance(1999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => advance(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('needs a provider for useToast', () => {
    // React logs the thrown error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Screen />)).toThrow(/ToastProvider/);
  });
});
