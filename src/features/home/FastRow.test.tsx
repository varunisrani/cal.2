import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Fast } from '../../domain/model';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { systemClock } from '../../lib/clock';
import { err, ok } from '../../lib/result';
import { ServicesProvider, type Services } from '../../services/context';
import type { FastingService } from '../../services/fasting';
import { makeFast } from '../../test/factories';
import { advance, useFakeTime } from '../../test/time';
import { ToastProvider } from '../../ui/Toast';
import { FastRow } from './FastRow';

const words = home.home.fast;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 26 October 2026 at `hh:mm:ss` in the test zone (New York). */
const at = (time: string) => Date.parse(`2026-10-26T${time}-04:00`);

/** The fasting service's delete, the one write a row makes; the rest is never called here. */
function fastingWith(remove: FastingService['remove']): FastingService {
  const unused = () => Promise.reject(new Error('not used by the row'));
  return {
    start: unused,
    end: unused,
    cancel: unused,
    edit: unused,
    endNow: unused,
    remove,
    setTracking: unused,
    setDefaultGoal: unused,
    endFastAndLog: unused,
  };
}

/** The row over stand-in services whose clock is the (fake) device clock. */
function renderRow(fast: Fast, remove: FastingService['remove'] = vi.fn()) {
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    fasting: fastingWith(remove),
    clock: systemClock,
  };
  const onOpen = vi.fn<(fast: Fast) => void>();
  const Providers = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <ToastProvider>{children}</ToastProvider>
    </ServicesProvider>
  );
  render(<FastRow fast={fast} onOpen={onOpen} />, { wrapper: Providers });
  return { onOpen, remove };
}

const elapsed = () => document.querySelector('[data-ui="fast.row.elapsed"]')?.textContent;
const fill = () =>
  document.querySelector<HTMLElement>('[data-ui="fast.row.progress"] [data-part="fill"]')?.style
    .width;

/** Makes the page hidden or visible, as switching tabs does. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('FastRow', () => {
  it('shows a running fast as fasting now: its start, the time so far, its goal and a bar', () => {
    useFakeTime(at('12:30:00'));
    renderRow(makeFast({ start: at('12:00:00'), end: null, goalMin: 960 }));

    const row = screen.getByRole('button', { name: `${words.running} 30m` });
    expect(row).toHaveAccessibleDescription('Started 12:00 PM 16h goal');
    const bar = screen.getByRole('progressbar', { name: words.progress });
    // 30 minutes of 16 hours.
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuetext', '30m of 16h');
    // A running fast is ended or cancelled elsewhere: it has no delete.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('advances by one second with fake timers (ACC-F8-2)', () => {
    useFakeTime(at('12:30:59'));
    renderRow(makeFast({ start: at('12:00:00'), end: null, goalMin: 60 }));
    expect(elapsed()).toBe('30m');
    const before = fill();

    act(() => advance(1_000));

    expect(elapsed()).toBe('31m');
    expect(fill()).not.toBe(before);
    const after = fill();
    act(() => advance(1_000));
    expect(fill()).not.toBe(after);
  });

  it('keeps the bar full past the goal while the time goes on counting', () => {
    useFakeTime(at('12:30:00'));
    renderRow(
      makeFast({ start: at('12:30:00') - 17 * HOUR - 5 * MINUTE, end: null, goalMin: 960 }),
    );

    expect(elapsed()).toBe('17h 5m');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(fill()).toBe('100%');
    act(() => advance(55 * MINUTE));
    expect(elapsed()).toBe('18h');
  });

  it('stops while the page is hidden and catches up at once when it shows again', () => {
    useFakeTime(at('12:30:00'));
    renderRow(makeFast({ start: at('12:00:00'), end: null }));
    try {
      setVisibility('hidden');
      act(() => advance(5 * MINUTE));
      expect(elapsed()).toBe('30m');

      setVisibility('visible');
      expect(elapsed()).toBe('35m');
      act(() => advance(MINUTE));
      expect(elapsed()).toBe('36m');
    } finally {
      // Back to jsdom's own answer for the next test.
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('shows a finished fast by its length, its start and end times and its goal', () => {
    useFakeTime(at('13:00:00'));
    renderRow(makeFast({ start: at('12:30:00') - 16 * HOUR - 30 * MINUTE, end: at('12:30:00') }));

    const row = screen.getByRole('button', { name: '16h 30m fast' });
    expect(row).toHaveAccessibleDescription('8:00 PM – 12:30 PM 16h goal');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('opens the editor on a tap, running or finished', () => {
    useFakeTime(at('12:30:00'));
    const running = makeFast({ start: at('12:00:00'), end: null });
    const first = renderRow(running);
    fireEvent.click(screen.getByRole('button', { name: `${words.running} 30m` }));
    expect(first.onOpen).toHaveBeenCalledWith(running);

    const finished = makeFast({ start: at('00:00:00'), end: at('09:00:00'), goalMin: 540 });
    const second = renderRow(finished);
    fireEvent.click(screen.getByRole('button', { name: '9h fast' }));
    expect(second.onOpen).toHaveBeenCalledWith(finished);
  });

  it('asks before deleting a finished fast, keeps it on Cancel and deletes it on Delete', async () => {
    useFakeTime(at('13:00:00'));
    const fast = makeFast({ end: at('12:30:00') });
    const { remove, onOpen } = renderRow(
      fast,
      vi.fn(() => Promise.resolve(ok(fast))),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete the 16h fast' }));
    let dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
    expect(dialog).toHaveTextContent(words.deleteMessage.replace('{length}', '16h'));
    fireEvent.click(within(dialog).getByRole('button', { name: common.common.cancel }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete the 16h fast' }));
    dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: common.common.delete }));
    });
    expect(remove).toHaveBeenCalledWith(fast.id);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('says nothing when the fast was already gone, and says so when the delete fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useFakeTime(at('13:00:00'));
    const fast = makeFast({ end: at('12:30:00') });
    const remove = vi
      .fn<FastingService['remove']>()
      .mockResolvedValueOnce(err('missing'))
      .mockRejectedValueOnce(new Error('disk'));
    renderRow(fast, remove);
    const toast = () => document.querySelector('[data-ui="toast.message"]')?.textContent ?? '';

    for (let round = 0; round < 2; round++) {
      fireEvent.click(screen.getByRole('button', { name: 'Delete the 16h fast' }));
      const dialog = screen.getByRole('alertdialog', { name: words.deleteTitle });
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: common.common.delete }));
      });
      expect(toast()).toBe(round === 0 ? '' : words.deleteFailed);
    }
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
