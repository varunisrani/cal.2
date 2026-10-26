import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advance, useFakeTime } from '../test/time';
import { rowAtScroll, Wheel, WHEEL_SETTLE_MS, wheelIndexOf, type WheelValue } from './Wheel';

afterEach(cleanup);

/** 65.0 … 75.0 kg in tenths. */
const WEIGHTS = Array.from({ length: 101 }, (_, i) => Math.round(650 + i) / 10);
const oneDecimal = (n: number) => n.toFixed(1);
const ROW_PX = 40;

function Controlled<T extends WheelValue>({
  values,
  start,
  format,
  onChange,
  label = 'Weight',
}: {
  readonly values: readonly T[];
  readonly start: T;
  readonly format?: (value: T) => string;
  readonly onChange?: (value: T) => void;
  readonly label?: string;
}) {
  const [value, setValue] = useState(start);
  return (
    <Wheel
      label={label}
      data-ui="test.weight"
      values={values}
      value={value}
      format={format}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const select = (name = 'Weight') => screen.getByRole('combobox', { name });
const chosenRow = () => document.querySelector<HTMLElement>('[data-chosen]');
const column = () => document.querySelector<HTMLElement>('[data-row]')!.parentElement!;

/** Gives every row a height, which jsdom does not lay out. */
function rowsAre(px: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(px);
}

describe('Wheel', () => {
  it('opens at 70.0, with the native select and the chosen row showing it', () => {
    rowsAre(ROW_PX);
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} />);
    expect(select()).toHaveDisplayValue('70.0');
    expect(select()).toHaveAttribute('data-ui', 'test.weight.select');
    expect(chosenRow()).toHaveTextContent('70.0');
    expect(column().scrollTop).toBe(WEIGHTS.indexOf(70) * ROW_PX);
    // The drawn column is for the eye only; the select is the accessible control.
    expect(column().closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('moves to the next value on ArrowDown and the native select mirrors it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} onChange={onChange} />);
    select().focus();
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenCalledWith(70.1);
    expect(select()).toHaveDisplayValue('70.1');
    expect(chosenRow()).toHaveTextContent('70.1');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(select()).toHaveDisplayValue('69.9');
  });

  it('moves a page with Page Down and Page Up, and to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} />);
    select().focus();
    await user.keyboard('{PageDown}');
    expect(select()).toHaveDisplayValue('70.5');
    await user.keyboard('{PageUp}{PageUp}');
    expect(select()).toHaveDisplayValue('69.5');
    await user.keyboard('{End}');
    expect(select()).toHaveDisplayValue('75.0');
    await user.keyboard('{Home}');
    expect(select()).toHaveDisplayValue('65.0');
  });

  it('stays put at the ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={65} format={oneDecimal} onChange={onChange} />);
    select().focus();
    await user.keyboard('{ArrowUp}{PageUp}{Home}');
    expect(onChange).not.toHaveBeenCalled();
    expect(select()).toHaveDisplayValue('65.0');
  });

  it('reports a value picked in the native select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} onChange={onChange} />);
    await user.selectOptions(select(), '72.4');
    expect(onChange).toHaveBeenCalledWith(72.4);
    expect(chosenRow()).toHaveTextContent('72.4');
  });

  it('reports the row a scroll settles on, once the scrolling stops', () => {
    useFakeTime('2026-10-26T09:00:00');
    rowsAre(ROW_PX);
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} onChange={onChange} />);
    const list = column();
    list.scrollTop = (WEIGHTS.indexOf(70) + 3) * ROW_PX;
    fireEvent.scroll(list);
    act(() => advance(WHEEL_SETTLE_MS - 1));
    expect(onChange).not.toHaveBeenCalled();
    act(() => advance(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(70.3);
    expect(select()).toHaveDisplayValue('70.3');
    // The wheel stays where the person left it.
    expect(list.scrollTop).toBe((WEIGHTS.indexOf(70) + 3) * ROW_PX);
  });

  it('settles at once where the browser sends scrollend', () => {
    useFakeTime('2026-10-26T09:00:00');
    rowsAre(ROW_PX);
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} onChange={onChange} />);
    const list = column();
    list.scrollTop = (WEIGHTS.indexOf(70) - 2) * ROW_PX + 15;
    fireEvent.scroll(list);
    act(() => {
      list.dispatchEvent(new Event('scrollend'));
    });
    expect(onChange).toHaveBeenCalledWith(69.8);
    act(() => advance(WHEEL_SETTLE_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('scrolls to a value chosen by key without reporting that scroll as a change', () => {
    useFakeTime('2026-10-26T09:00:00');
    rowsAre(ROW_PX);
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} onChange={onChange} />);
    fireEvent.keyDown(select(), { key: 'ArrowDown' });
    const list = column();
    expect(list.scrollTop).toBe(WEIGHTS.indexOf(70.1) * ROW_PX);
    fireEvent.scroll(list);
    act(() => advance(WHEEL_SETTLE_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(70.1);
  });

  it('chooses a row that is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled values={WEIGHTS} start={70} format={oneDecimal} onChange={onChange} />);
    await user.click(screen.getByText('70.2', { selector: '[data-row]' }));
    expect(onChange).toHaveBeenCalledWith(70.2);
  });

  it('builds a weight from a whole wheel and a tenths wheel', async () => {
    const user = userEvent.setup();
    const wholes = Array.from({ length: 231 }, (_, i) => 20 + i);
    const tenths = Array.from({ length: 10 }, (_, i) => i);
    function Weight() {
      const [kg, setKg] = useState(70.4);
      const whole = Math.floor(kg + 1e-9);
      const tenth = Math.round((kg - whole) * 10);
      return (
        <>
          <Wheel
            label="Kilograms"
            data-ui="test.kg"
            values={wholes}
            value={whole}
            onChange={(next) => setKg(next + tenth / 10)}
          />
          <Wheel
            label="Tenths"
            data-ui="test.tenths"
            values={tenths}
            value={tenth}
            format={(n) => `.${n}`}
            onChange={(next) => setKg(whole + next / 10)}
          />
          <output>{kg.toFixed(1)}</output>
        </>
      );
    }
    render(<Weight />);
    expect(select('Kilograms')).toHaveDisplayValue('70');
    expect(select('Tenths')).toHaveDisplayValue('.4');
    select('Tenths').focus();
    await user.keyboard('{ArrowDown}');
    select('Kilograms').focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('status')).toHaveTextContent('71.5');
  });

  it('opens at the nearest number when the value is not in the list', () => {
    render(<Controlled values={WEIGHTS} start={70.04} format={oneDecimal} />);
    expect(select()).toHaveDisplayValue('70.0');
  });

  it('draws nothing for an empty list', () => {
    render(<Controlled values={[] as number[]} start={1} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('wheelIndexOf', () => {
  it('finds a value, the nearest number, or the first entry', () => {
    expect(wheelIndexOf([1, 2, 3], 2)).toBe(1);
    expect(wheelIndexOf([10, 20, 30], 26)).toBe(2);
    expect(wheelIndexOf(['a', 'b'], 'c')).toBe(0);
  });
});

describe('rowAtScroll', () => {
  it('rounds to the nearest row and stays inside the list', () => {
    expect(rowAtScroll(0, 40, 10)).toBe(0);
    expect(rowAtScroll(59, 40, 10)).toBe(1);
    expect(rowAtScroll(61, 40, 10)).toBe(2);
    expect(rowAtScroll(10_000, 40, 10)).toBe(9);
    expect(rowAtScroll(-30, 40, 10)).toBe(0);
  });
});
