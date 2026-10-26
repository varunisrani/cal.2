import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from './Segmented';

afterEach(cleanup);

type Span = '1W' | '1M' | '3M' | 'all';

const SPANS: ReadonlyArray<{ value: Span; label: string }> = [
  { value: '1W', label: 'Week' },
  { value: '1M', label: 'Month' },
  { value: '3M', label: 'Quarter' },
  { value: 'all', label: 'All' },
];

function Harness({ start = '1W', onValue }: { start?: Span; onValue?: (value: Span) => void }) {
  const [value, setValue] = useState<Span>(start);
  return (
    <Segmented
      label="Range"
      options={SPANS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      data-ui="test.range"
    />
  );
}

const radio = (name: string): HTMLElement => screen.getByRole('radio', { name });

describe('Segmented', () => {
  it('is a radiogroup named by its label with the current choice checked', () => {
    render(<Harness start="1M" />);
    const group = screen.getByRole('radiogroup', { name: 'Range' });
    expect(group).toHaveAttribute('data-ui', 'test.range');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(radio('Month')).toBeChecked();
    expect(radio('Week')).not.toBeChecked();
    expect(radio('Quarter')).toHaveAttribute('data-ui', 'test.range.3M');
  });

  it('selects a choice on click', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await user.click(radio('Quarter'));
    expect(radio('Quarter')).toBeChecked();
    expect(onValue).toHaveBeenCalledWith('3M');
    await user.click(radio('Quarter'));
    expect(onValue).toHaveBeenCalledTimes(1);
  });

  it('has one tab stop, on the checked choice', async () => {
    const user = userEvent.setup();
    render(<Harness start="3M" />);
    await user.tab();
    expect(radio('Quarter')).toHaveFocus();
    expect(radio('Week')).toHaveAttribute('tabindex', '-1');
  });

  it('moves and selects with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(radio('Month')).toBeChecked();
    expect(radio('Month')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(radio('All')).toBeChecked();
    await user.keyboard('{ArrowRight}');
    expect(radio('Week')).toBeChecked();
    expect(radio('Week')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(radio('All')).toBeChecked();
    await user.keyboard('{ArrowUp}');
    expect(radio('Quarter')).toBeChecked();
  });

  it('goes to the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<Harness start="1M" />);
    await user.tab();
    await user.keyboard('{End}');
    expect(radio('All')).toBeChecked();
    await user.keyboard('{Home}');
    expect(radio('Week')).toBeChecked();
  });

  it('swaps left and right in a right-to-left page', async () => {
    const user = userEvent.setup();
    render(
      <div dir="rtl">
        <Harness start="1M" />
      </div>,
    );
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(radio('Quarter')).toBeChecked();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(radio('Week')).toBeChecked();
  });
});
