import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './Button';

afterEach(cleanup);

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('Button', () => {
  it('is found by role and name and carries its data-ui hook', () => {
    render(
      <Button variant="primary" data-ui="test.save">
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('data-ui', 'test.save');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('ignores presses while busy and says so', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button busy data-ui="test.save" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    await user.click(button);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
  });

  it('ignores a second click while its async handler runs, then works again', async () => {
    const user = userEvent.setup();
    const work = deferred();
    const onClick = vi.fn(() => work.promise);
    render(
      <Button data-ui="test.save" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    await user.dblClick(button);
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');

    await act(async () => work.resolve());
    expect(button).not.toHaveAttribute('aria-busy');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores two clicks dispatched in the same tick before any re-render', () => {
    const onClick = vi.fn(() => new Promise<void>(() => {}));
    render(
      <Button data-ui="test.save" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    act(() => {
      button.click();
      button.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('comes back after its async handler fails', async () => {
    const user = userEvent.setup();
    const work = deferred();
    const onClick = vi.fn(() => work.promise);
    render(
      <Button data-ui="test.save" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    await user.click(button);
    // The handler's caller would report this; the button only has to recover.
    await act(async () => {
      work.reject(new Error('offline'));
      await work.promise.catch(() => undefined);
    });
    expect(button).not.toHaveAttribute('aria-busy');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores presses while aria-disabled but keeps focus', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button aria-disabled data-ui="test.next" onClick={onClick}>
        Next
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Next' });
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('runs a plain handler on every press', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="danger" data-ui="test.delete" onClick={onClick}>
        Delete
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe('IconButton', () => {
  it('is named by its label and hides its drawing from screen readers', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        label="Close"
        icon={<svg data-testid="glyph" />}
        data-ui="test.close"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('data-ui', 'test.close');
    expect(screen.getByTestId('glyph').closest('[aria-hidden="true"]')).not.toBeNull();
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
