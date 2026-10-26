import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

afterEach(cleanup);

function Harness({
  disabled,
  description,
  onValue,
}: {
  disabled?: boolean;
  description?: string;
  onValue?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <Switch
      label="Water tracking"
      description={description}
      checked={checked}
      onChange={(next) => {
        setChecked(next);
        onValue?.(next);
      }}
      disabled={disabled}
      data-ui="test.water"
    />
  );
}

describe('Switch', () => {
  it('is a switch named by its label and described by its description', () => {
    render(<Harness description="Adds water to the + menu" />);
    const toggle = screen.getByRole('switch', { name: 'Water tracking' });
    expect(toggle).toHaveAccessibleDescription('Adds water to the + menu');
    expect(toggle).toHaveAttribute('data-ui', 'test.water');
    expect(toggle).not.toBeChecked();
  });

  it('toggles on click and with Space', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const toggle = screen.getByRole('switch', { name: 'Water tracking' });
    await user.click(toggle);
    expect(toggle).toBeChecked();
    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
    expect(onValue.mock.calls).toEqual([[true], [false]]);
  });

  it('does not toggle while disabled', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness disabled onValue={onValue} />);
    const toggle = screen.getByRole('switch', { name: 'Water tracking' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(onValue).not.toHaveBeenCalled();
    expect(toggle).not.toBeChecked();
  });
});
