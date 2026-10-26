import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

afterEach(cleanup);

function Controlled({
  onChange,
  disabled,
}: {
  readonly onChange?: (on: boolean) => void;
  readonly disabled?: boolean;
}) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      label="Track water"
      description="Shows the water card on Home"
      checked={on}
      disabled={disabled}
      data-ui="test.water"
      onChange={(next) => {
        setOn(next);
        onChange?.(next);
      }}
    />
  );
}

const theSwitch = () => screen.getByRole('switch', { name: 'Track water' });

describe('Switch', () => {
  it('is a named switch with its description and hook', () => {
    render(<Controlled />);
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(theSwitch()).toHaveAccessibleDescription('Shows the water card on Home');
    expect(theSwitch()).toHaveAttribute('data-ui', 'test.water');
  });

  it('flips on click and on Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await user.click(theSwitch());
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(theSwitch()).toBeChecked();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(theSwitch()).not.toBeChecked();
  });

  it('flips when its label is tapped', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByText('Track water'));
    expect(theSwitch()).toBeChecked();
  });

  it('does nothing while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} disabled />);
    await user.click(theSwitch());
    expect(onChange).not.toHaveBeenCalled();
    expect(theSwitch()).toBeDisabled();
  });
});
