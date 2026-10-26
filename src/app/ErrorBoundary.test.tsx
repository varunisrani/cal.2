import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

function Exploding(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('shows its children while nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <p>all fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all fine')).toBeInTheDocument();
  });

  it('shows the crash card when a child throws', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <p>before</p>
        <Exploding />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
    expect(screen.queryByText('before')).toBeNull();
    expect(document.querySelector('[data-ui="shell.crash"]')).not.toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it('reloads from the crash card', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <Exploding />
      </ErrorBoundary>,
    );
    const button = screen.getByRole('button', { name: 'Reload' });
    expect(button).toHaveAttribute('data-ui', 'shell.crash.reload');
    await userEvent.click(button);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
