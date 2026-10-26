import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { shell } from '../i18n/en/shell';
import { ErrorBoundary } from './ErrorBoundary';

const WORDS = shell.shell.crash;

function Broken(): never {
  throw new Error('drawing failed');
}

describe('ErrorBoundary', () => {
  it('draws its children while nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>Diary</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Diary')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the crash card when a child throws while drawing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary onReload={() => {}}>
        <p>Diary</p>
        <Broken />
      </ErrorBoundary>,
    );
    const card = screen.getByRole('alert', { name: WORDS.title });
    expect(card).toHaveTextContent(WORDS.body);
    expect(screen.queryByText('Diary')).toBeNull();
  });

  it('reloads when Reload is pressed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    render(
      <ErrorBoundary onReload={reload}>
        <Broken />
      </ErrorBoundary>,
    );
    const button = screen.getByRole('button', { name: WORDS.reload });
    expect(button).toHaveAttribute('data-ui', 'shell.crash.reload');
    fireEvent.click(button);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
