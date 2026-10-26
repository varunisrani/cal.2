import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import { Stepper, stepBy, type StepperProps } from './Stepper';

afterEach(cleanup);

const LESS = t('common.decrease', { name: 'Protein' });
const MORE = t('common.increase', { name: 'Protein' });

/** A stepper that keeps its own value and records every change. */
function Controlled(
  props: Omit<StepperProps, 'value' | 'onChange' | 'label' | 'data-ui'> & {
    readonly start: number;
    readonly onChange?: (value: number) => void;
  },
) {
  const { start, onChange, ...rest } = props;
  const [value, setValue] = useState(start);
  return (
    <Stepper
      {...rest}
      label="Protein"
      data-ui="test.protein"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const valueOf = () => screen.getByRole('spinbutton', { name: 'Protein' });

describe('Stepper', () => {
  it('names the value and both buttons, and carries the hooks', () => {
    render(<Controlled start={10} min={0} max={50} step={5} />);
    expect(screen.getByRole('group', { name: 'Protein' })).toHaveAttribute(
      'data-ui',
      'test.protein',
    );
    expect(valueOf()).toHaveAttribute('aria-valuenow', '10');
    expect(valueOf()).toHaveAttribute('aria-valuetext', '10');
    expect(screen.getByRole('button', { name: LESS })).toHaveAttribute(
      'data-ui',
      'test.protein.decrease',
    );
    expect(screen.getByRole('button', { name: MORE })).toHaveAttribute(
      'data-ui',
      'test.protein.increase',
    );
  });

  it('steps by 5 with the buttons', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled start={10} min={0} max={50} step={5} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: MORE }));
    expect(onChange).toHaveBeenLastCalledWith(15);
    await user.click(screen.getByRole('button', { name: LESS }));
    await user.click(screen.getByRole('button', { name: LESS }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    expect(valueOf()).toHaveAttribute('aria-valuenow', '5');
  });

  it('clamps at max and min, and the button at a bound does nothing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled start={40} min={0} max={48} step={5} onChange={onChange} />);
    const more = screen.getByRole('button', { name: MORE });
    await user.click(more);
    expect(onChange).toHaveBeenLastCalledWith(45);
    await user.click(more);
    expect(onChange).toHaveBeenLastCalledWith(48);
    expect(more).toHaveAttribute('aria-disabled', 'true');
    await user.click(more);
    expect(onChange).toHaveBeenCalledTimes(2);

    const less = screen.getByRole('button', { name: LESS });
    for (let press = 0; press < 12; press += 1) await user.click(less);
    expect(valueOf()).toHaveAttribute('aria-valuenow', '0');
    expect(less).toHaveAttribute('aria-disabled', 'true');
    expect(less).toHaveFocus();
  });

  it('steps with the arrow keys and jumps with Home and End', async () => {
    const user = userEvent.setup();
    render(<Controlled start={20} min={0} max={50} step={5} />);
    valueOf().focus();
    await user.keyboard('{ArrowUp}');
    expect(valueOf()).toHaveAttribute('aria-valuenow', '25');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(valueOf()).toHaveAttribute('aria-valuenow', '15');
    await user.keyboard('{End}');
    expect(valueOf()).toHaveAttribute('aria-valuenow', '50');
    await user.keyboard('{ArrowUp}');
    expect(valueOf()).toHaveAttribute('aria-valuenow', '50');
    await user.keyboard('{Home}');
    expect(valueOf()).toHaveAttribute('aria-valuenow', '0');
    await user.keyboard('{ArrowDown}');
    expect(valueOf()).toHaveAttribute('aria-valuenow', '0');
  });

  it('shows the value through the caller’s format', () => {
    render(<Controlled start={2000} min={800} max={6000} step={50} format={(n) => `${n} kcal`} />);
    expect(valueOf()).toHaveTextContent('2000 kcal');
    expect(valueOf()).toHaveAttribute('aria-valuetext', '2000 kcal');
  });

  it('ignores presses and keys while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled start={10} min={0} max={50} step={5} disabled onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: MORE }));
    valueOf().focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('stepBy', () => {
  it('keeps fractional steps free of float drift', () => {
    expect(stepBy(0.1, 1, 0.1, 0, 1)).toBe(0.2);
    expect(stepBy(0.2, 1, 0.1, 0, 1)).toBe(0.3);
    expect(stepBy(20, 1, 0.5, 3, 60)).toBe(20.5);
  });

  it('moves an off-grid value by one step and clamps', () => {
    expect(stepBy(12, 1, 5, 0, 50)).toBe(17);
    expect(stepBy(48, 1, 5, 0, 50)).toBe(50);
    expect(stepBy(2, -1, 5, 0, 50)).toBe(0);
  });
});
