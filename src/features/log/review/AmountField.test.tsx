import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { review } from '../../../i18n/en/review';
import { AmountField } from './AmountField';

const keys = review.review.serving.keys;

/** The field over a parent that takes every amount it reports, as the serving card does. */
function renderField(initial = 100) {
  const onChange = vi.fn<(value: number) => void>();
  function Parent() {
    const [value, setValue] = useState(initial);
    return (
      <>
        <AmountField
          label="Amount"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          data-ui="amount"
        />
        <output data-ui="value">{value}</output>
        <button type="button">Somewhere else</button>
      </>
    );
  }
  render(<Parent />);
  const input = screen.getByRole('textbox', { name: 'Amount' });
  return {
    input,
    onChange,
    user: userEvent.setup(),
    value: () => document.querySelector('[data-ui="value"]')?.textContent,
    /** Puts `text` in the field in one go, as a paste would. */
    replace: (text: string) => fireEvent.change(input, { target: { value: text } }),
    key: (name: string) => screen.getByRole('button', { name }),
  };
}

describe('AmountField', () => {
  it('sets the amount to 70 while 50+20 is typed (ACC-D8-1)', async () => {
    const field = renderField(100);
    await field.user.clear(field.input);
    await field.user.type(field.input, '50+20');

    expect(field.input).toHaveValue('50+20');
    expect(field.onChange).toHaveBeenLastCalledWith(70);
    expect(field.value()).toBe('70');
  });

  it('puts an unfinished 50+ back to the amount on leaving the field (ACC-D8-2, R02.22)', async () => {
    const field = renderField(100);
    await field.user.click(field.input);
    field.replace('50+');
    expect(field.input).toHaveValue('50+');

    await field.user.click(screen.getByRole('button', { name: 'Somewhere else' }));
    expect(field.input).toHaveValue('100');
    expect(field.onChange).not.toHaveBeenCalled();
  });

  it('puts empty text, letters and a division by 0 back the same way', async () => {
    const field = renderField(150);
    for (const text of ['', '12g', '5÷0', '0', '3−5']) {
      await field.user.click(field.input);
      field.replace(text);
      await field.user.click(screen.getByRole('button', { name: 'Somewhere else' }));
      expect(field.input).toHaveValue('150');
    }
    expect(field.onChange).not.toHaveBeenCalled();
  });

  it('tidies a valid amount on leaving the field', async () => {
    const field = renderField(100);
    await field.user.click(field.input);
    field.replace('070.50');
    expect(field.onChange).toHaveBeenLastCalledWith(70.5);

    await field.user.click(screen.getByRole('button', { name: 'Somewhere else' }));
    expect(field.input).toHaveValue('70.5');
  });

  it('shows the keys only while the field has focus, and they keep the focus in it', async () => {
    const field = renderField();
    expect(screen.queryByRole('group', { name: review.review.serving.calculator })).toBeNull();

    await field.user.click(field.input);
    const row = screen.getByRole('group', { name: review.review.serving.calculator });
    expect(row).toHaveAttribute('data-ui', 'amount.keys');
    await field.user.click(field.key(keys.plus));
    expect(field.input).toHaveFocus();
    expect(field.input).toHaveValue('100+');

    await field.user.click(screen.getByRole('button', { name: 'Somewhere else' }));
    expect(screen.queryByRole('group', { name: review.review.serving.calculator })).toBeNull();
  });

  it('replaces an operator at the end: × after + gives 50×', async () => {
    const field = renderField();
    await field.user.click(field.input);
    field.replace('50+');
    await field.user.click(field.key(keys.times));
    expect(field.input).toHaveValue('50×');

    await field.user.click(field.key(keys.divide));
    await field.user.click(field.key(keys.minus));
    expect(field.input).toHaveValue('50−');
  });

  it('shows = 70 on the equals key once there is an operation, and writes 70', async () => {
    const field = renderField();
    await field.user.click(field.input);
    field.replace('70');
    expect(field.key(keys.equals)).toHaveTextContent('=');

    field.replace('50+20');
    const equals = field.key('= 70');
    expect(equals).toHaveAttribute('data-ui', 'amount.keys.equals');
    await field.user.click(equals);
    expect(field.input).toHaveValue('70');
    expect(field.input).toHaveFocus();
    expect(field.value()).toBe('70');
  });

  it('empties the field with C and with the clear button, leaving the amount as it was', async () => {
    const field = renderField(250);
    await field.user.click(field.input);
    await field.user.click(field.key(keys.clear));
    expect(field.input).toHaveValue('');
    expect(field.input).toHaveFocus();
    // An operator key on an empty field adds nothing.
    await field.user.click(field.key(keys.plus));
    expect(field.input).toHaveValue('');

    field.replace('80');
    await field.user.click(field.key(review.review.serving.clear));
    expect(field.input).toHaveValue('');
    expect(screen.queryByRole('button', { name: review.review.serving.clear })).toBeNull();
    expect(field.value()).toBe('80');
    expect(field.onChange).toHaveBeenCalledTimes(1);
  });

  it('reads × and ÷ before + and −', async () => {
    const field = renderField();
    await field.user.click(field.input);
    act(() => {
      field.replace('50+20×2');
    });
    expect(field.onChange).toHaveBeenLastCalledWith(90);
    field.replace('300/3');
    expect(field.onChange).toHaveBeenLastCalledWith(100);
  });
});
