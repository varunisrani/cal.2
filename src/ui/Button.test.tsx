import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, IconButton, type ButtonVariant } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('draws every look as a button found by its name, with its data-ui hook', () => {
    const looks: ButtonVariant[] = ['primary', 'secondary', 'quiet', 'danger'];
    render(
      <>
        {looks.map((look) => (
          <Button key={look} variant={look} data-ui={`test.${look}`}>
            {`Look ${look}`}
          </Button>
        ))}
      </>,
    );
    for (const look of looks) {
      const button = screen.getByRole('button', { name: `Look ${look}` });
      expect(button).toHaveAttribute('data-ui', `test.${look}`);
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('ignores clicks while busy and tells assistive tech, keeping its name', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button busy data-ui="test.save" onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores a second click while the first one is in flight, then takes the next', async () => {
    let finish = (): void => undefined;
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <Button variant="primary" data-ui="test.log" onClick={onClick}>
        Log
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Log' });

    // Both presses land before React re-renders: the second must still be dropped.
    act(() => {
      button.click();
      button.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(button).not.toHaveAttribute('aria-busy');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps a busy submit button from submitting its form again', () => {
    const onSubmit = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" busy data-ui="test.submit">
          Save
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not fire while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled data-ui="test.off" onClick={onClick}>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('cannot be written without a data-ui hook', () => {
    // @ts-expect-error data-ui is required on every interactive primitive
    const element = <Button>Save</Button>;
    expect(element.props).not.toHaveProperty('data-ui');
  });
});

describe('IconButton', () => {
  it('is named by its label and hides its icon from assistive tech', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton
        label="Close"
        icon={<svg data-testid="icon" />}
        data-ui="test.close"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('data-ui', 'test.close');
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('cannot be written without a label', () => {
    // @ts-expect-error an icon-only button needs a label for its name
    const element = <IconButton icon={<svg />} data-ui="test.close" />;
    expect(element.props).not.toHaveProperty('label');
  });
});
