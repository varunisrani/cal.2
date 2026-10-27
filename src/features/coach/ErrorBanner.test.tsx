import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ai } from '../../i18n/en/ai';
import { coach } from '../../i18n/en/coach';
import { common } from '../../i18n/en/common';
import { ErrorBanner, failureLines, type ErrorBannerProps } from './ErrorBanner';

const failure = ai.ai.failure;
const DETAIL = 'Incorrect API key provided: •••. You can find your key in your account.';

function renderBanner(props: Partial<ErrorBannerProps> = {}) {
  const onRetry = vi.fn();
  render(<ErrorBanner kind="keyRejected" pending={false} onRetry={onRetry} {...props} />);
  return { onRetry };
}

const detailsButton = () => screen.queryByRole('button', { name: coach.coach.error.details });
const retryButton = () => screen.getByRole('button', { name: common.common.retry });

describe('failureLines', () => {
  it.each([
    ['keyRejected', failure.keyRejected],
    ['offline', failure.offline],
    ['roundLimit', failure.roundLimit],
    ['truncated', failure.truncated],
  ])('gives our message for %s', (kind, message) => {
    expect(failureLines(kind)).toEqual([message]);
  });

  it.each(['somethingNew', 'cancelled', 'bothFailed', ''])(
    'reads %j as the generic failure',
    (kind) => {
      expect(failureLines(kind)).toEqual([failure.generic]);
    },
  );
});

describe('ErrorBanner (P08-10, D-16.31)', () => {
  it('shows a warning with our message for the kind, never the provider’s words', () => {
    renderBanner({ details: DETAIL });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(failure.keyRejected);
    expect(alert.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText(DETAIL)).toBeNull();
  });

  it('shows the stored provider text under Details, and hides it again', () => {
    renderBanner({ details: DETAIL });
    const button = detailsButton();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button!);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const text = screen.getByText(DETAIL);
    expect(button).toHaveAttribute('aria-controls', text.id);
    expect(document.querySelector('[data-ui="coach.details"]')).toBe(button);

    fireEvent.click(button!);
    expect(screen.queryByText(DETAIL)).toBeNull();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it.each([undefined, '   '])('offers no Details without provider text (%j)', (details) => {
    renderBanner({ kind: 'timeout', ...(details === undefined ? {} : { details }) });
    expect(screen.getByRole('alert')).toHaveTextContent(failure.timeout);
    expect(detailsButton()).toBeNull();
    expect(retryButton()).toBeEnabled();
  });

  it('calls back on Retry (R04.4)', () => {
    const { onRetry } = renderBanner();
    fireEvent.click(retryButton());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-ui="coach.retry"]')).toBe(retryButton());
  });

  it('turns Retry off while a reply is pending', () => {
    const { onRetry } = renderBanner({ pending: true });
    expect(retryButton()).toBeDisabled();
    fireEvent.click(retryButton());
    expect(onRetry).not.toHaveBeenCalled();
  });
});
