import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { shell } from '../i18n/en/shell';
import { advance, useFakeTime } from '../test/time';
import { createAppUpdates, registerServiceWorker, SKIP_WAITING_MESSAGE } from './swRegistration';
import {
  activateWaiting,
  fakeContainer,
  fakePage,
  fakeRegistration,
  fakeWorker,
} from './testing/fakeServiceWorker';
import { UpdateBanner } from './UpdateBanner';

const words = shell.shell.update;

describe('UpdateBanner', () => {
  it('draws nothing while the app is current', () => {
    const { container } = render(<UpdateBanner updates={createAppUpdates()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Update ready and reloads only when Reload is pressed (ACC-L3-1)', async () => {
    useFakeTime('2026-10-27T09:00:00-04:00');
    const registration = fakeRegistration();
    const container = fakeContainer(registration, fakeWorker('activated'));
    const reload = vi.fn();
    const updates = createAppUpdates();
    await registerServiceWorker(updates, {
      production: true,
      container,
      page: fakePage(),
      reload,
    });
    render(<UpdateBanner updates={updates} />);
    expect(screen.queryByText(words.title)).not.toBeInTheDocument();

    const next = fakeWorker('installing');
    act(() => {
      registration.findUpdate(next);
      registration.finishInstall();
    });
    expect(screen.getByRole('status')).toHaveTextContent(words.title);
    expect(screen.getByText(words.body)).toBeInTheDocument();

    // Hours of editing later, still nothing has reloaded.
    act(() => advance(6 * 60 * 60 * 1000));
    expect(reload).not.toHaveBeenCalled();
    expect(next.postMessage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: words.reload }));
    expect(next.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
    act(() => activateWaiting(registration, container));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('calls the offered take-over once per press', () => {
    const updates = createAppUpdates();
    const takeOver = vi.fn();
    render(<UpdateBanner updates={updates} />);
    act(() => updates.offer(takeOver));

    fireEvent.click(screen.getByRole('button', { name: words.reload }));
    expect(takeOver).toHaveBeenCalledTimes(1);
  });
});
