import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from './Segmented';

afterEach(cleanup);

type Range = 'week' | 'month' | 'year';

const RANGES = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

function Controlled({ onChange }: { readonly onChange?: (value: Range) => void }) {
  const [value, setValue] = useState<Range>('month');
  return (
    <>
      <button>Before</button>
      <Segmented
        label="Range"
        data-ui="test.range"
        options={RANGES}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <button>After</button>
    </>
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('Segmented', () => {
  it('is a named radiogroup of radios with their hooks', () => {
    render(<Controlled />);
    const group = screen.getByRole('radiogroup', { name: 'Range' });
    expect(group).toHaveAttribute('data-ui', 'test.range');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(radio('Month')).toBeChecked();
    expect(radio('Week')).not.toBeChecked();
    expect(radio('Year')).toHaveAttribute('data-ui', 'test.range.year');
  });

  it('chooses an option on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await user.click(radio('Year'));
    expect(onChange).toHaveBeenCalledWith('year');
    expect(radio('Year')).toBeChecked();
    await user.click(radio('Year'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves and chooses with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    radio('Month').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Year')).toBeChecked();
    expect(radio('Year')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Week')).toBeChecked();
    expect(radio('Week')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(radio('Year')).toBeChecked();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(radio('Week')).toBeChecked();
    await user.keyboard('{ArrowDown}');
    expect(radio('Month')).toBeChecked();
    await user.keyboard('{End}');
    expect(radio('Year')).toBeChecked();
    await user.keyboard('{Home}');
    expect(radio('Week')).toBeChecked();
  });

  it('puts only the chosen option in the tab order', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    screen.getByRole('button', { name: 'Before' }).focus();
    await user.tab();
    expect(radio('Month')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });
});
