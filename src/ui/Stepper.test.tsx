import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Stepper, stepFrom, type StepperProps } from './Stepper';

afterEach(cleanup);

function Harness({
  start,
  onValue,
  ...rest
}: Partial<StepperProps> & { start: number; onValue?: (value: number) => void }) {
  const [value, setValue] = useState(start);
  return (
    <Stepper
      label="Protein"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      data-ui="test.protein"
      {...rest}
    />
  );
}

const spin = (): HTMLElement => screen.getByRole('spinbutton', { name: 'Protein' });
const plus = (): HTMLElement => screen.getByRole('button', { name: 'Increase Protein' });
const minus = (): HTMLElement => screen.getByRole('button', { name: 'Decrease Protein' });

describe('stepFrom', () => {
  it('moves along the grid and holds to the range', () => {
    const range = { min: 0, max: 20, step: 5 };
    expect(stepFrom(10, 1, range)).toBe(15);
    expect(stepFrom(10, -1, range)).toBe(5);
    expect(stepFrom(20, 1, range)).toBe(20);
    expect(stepFrom(0, -1, range)).toBe(0);
    expect(stepFrom(5, 10, range)).toBe(20);
  });

  it('takes a value between grid points to the next point in the direction asked', () => {
    expect(stepFrom(12, 1, { min: 0, step: 5 })).toBe(15);
    expect(stepFrom(12, -1, { min: 0, step: 5 })).toBe(10);
    expect(stepFrom(12, 1, { step: 5 })).toBe(15);
  });

  it('counts the grid from min', () => {
    expect(stepFrom(800, 1, { min: 800, max: 6000, step: 50 })).toBe(850);
    expect(stepFrom(803, -1, { min: 800, max: 6000, step: 50 })).toBe(800);
  });

  it('adds tenths without float noise', () => {
    expect(stepFrom(0.2, 1, { step: 0.1 })).toBe(0.3);
    expect(stepFrom(0.3, -1, { step: 0.1 })).toBe(0.2);
    expect(stepFrom(70.7, 1, { min: 20, max: 250, step: 0.1 })).toBe(70.8);
  });
});

describe('Stepper', () => {
  it('steps by 5 with − and + and stops at min and max', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness start={10} min={0} max={20} step={5} onValue={onValue} />);
    expect(minus()).toHaveAttribute('data-ui', 'test.protein.decrease');
    expect(plus()).toHaveAttribute('data-ui', 'test.protein.increase');

    await user.click(plus());
    expect(spin()).toHaveAttribute('aria-valuenow', '15');
    await user.click(plus());
    expect(spin()).toHaveAttribute('aria-valuenow', '20');
    expect(plus()).toBeDisabled();
    await user.click(plus());
    expect(spin()).toHaveAttribute('aria-valuenow', '20');

    for (let i = 0; i < 4; i++) await user.click(minus());
    expect(spin()).toHaveAttribute('aria-valuenow', '0');
    expect(minus()).toBeDisabled();
    expect(onValue.mock.calls.map(([value]) => value)).toEqual([15, 20, 15, 10, 5, 0]);
  });

  it('moves a value between grid points onto the grid', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness start={12} min={0} max={500} step={5} />);
    await user.click(plus());
    expect(spin()).toHaveAttribute('aria-valuenow', '15');
    unmount();

    render(<Harness start={12} min={0} max={500} step={5} />);
    await user.click(minus());
    expect(spin()).toHaveAttribute('aria-valuenow', '10');
  });

  it('steps with the arrow keys, ten steps with Page keys, and goes to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness start={50} min={0} max={500} step={5} />);
    expect(spin()).toHaveAttribute('data-ui', 'test.protein');
    spin().focus();
    await user.keyboard('{ArrowUp}');
    expect(spin()).toHaveAttribute('aria-valuenow', '55');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(spin()).toHaveAttribute('aria-valuenow', '45');
    await user.keyboard('{PageUp}');
    expect(spin()).toHaveAttribute('aria-valuenow', '95');
    await user.keyboard('{PageDown}');
    expect(spin()).toHaveAttribute('aria-valuenow', '45');
    await user.keyboard('{End}');
    expect(spin()).toHaveAttribute('aria-valuenow', '500');
    await user.keyboard('{ArrowUp}');
    expect(spin()).toHaveAttribute('aria-valuenow', '500');
    await user.keyboard('{Home}');
    expect(spin()).toHaveAttribute('aria-valuenow', '0');
  });

  it('is the only tab stop: the buttons stay out of the tab order', async () => {
    const user = userEvent.setup();
    render(<Harness start={1} />);
    await user.tab();
    expect(spin()).toHaveFocus();
    expect(plus()).toHaveAttribute('tabindex', '-1');
    expect(minus()).toHaveAttribute('tabindex', '-1');
  });

  it('tells assistive tech its value, bounds and text', () => {
    render(<Harness start={2} min={1} max={20} step={1} format={(value) => `${value} servings`} />);
    expect(spin()).toHaveAttribute('aria-valuenow', '2');
    expect(spin()).toHaveAttribute('aria-valuemin', '1');
    expect(spin()).toHaveAttribute('aria-valuemax', '20');
    expect(spin()).toHaveAttribute('aria-valuetext', '2 servings');
    expect(spin()).toHaveTextContent('2 servings');
  });

  it('shows the step’s decimals by default', async () => {
    const user = userEvent.setup();
    render(<Harness start={0.2} step={0.1} />);
    await user.click(plus());
    expect(spin()).toHaveAttribute('aria-valuenow', '0.3');
    expect(spin()).toHaveTextContent('0.3');
  });

  it('does nothing while disabled', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness start={5} disabled onValue={onValue} />);
    expect(plus()).toBeDisabled();
    expect(minus()).toBeDisabled();
    spin().focus();
    await user.keyboard('{ArrowUp}');
    expect(onValue).not.toHaveBeenCalled();
  });
});
