import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import { clampWallClock, DateTimeField, type DateTimeFieldProps } from './DateTimeField';

afterEach(cleanup);

type HarnessProps = Omit<DateTimeFieldProps, 'value' | 'onChange' | 'label' | 'data-ui'> & {
  readonly start: string;
  readonly onChange?: (value: string) => void;
};

function Controlled({ start, onChange, ...rest }: HarnessProps) {
  const [value, setValue] = useState(start);
  return (
    <DateTimeField
      {...rest}
      label="Logged on"
      data-ui="test.when"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const pick = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

describe('DateTimeField', () => {
  describe('date mode', () => {
    it('is a labelled date input carrying max and its hook', () => {
      render(<Controlled start="2026-10-20" max="2026-10-26" hint="Up to today" />);
      const input = screen.getByLabelText('Logged on');
      expect(input).toHaveAttribute('type', 'date');
      expect(input).toHaveAttribute('max', '2026-10-26');
      expect(input).toHaveAttribute('data-ui', 'test.when.date');
      expect(input).toHaveValue('2026-10-20');
      expect(input).toHaveAccessibleDescription('Up to today');
    });

    it('reports a past date as picked', () => {
      const onChange = vi.fn();
      render(<Controlled start="2026-10-20" max="2026-10-26" onChange={onChange} />);
      pick(screen.getByLabelText('Logged on'), '2026-10-02');
      expect(onChange).toHaveBeenCalledWith('2026-10-02');
    });

    it('rejects a future date with max: it comes back as max', () => {
      const onChange = vi.fn();
      render(<Controlled start="2026-10-20" max="2026-10-26" onChange={onChange} />);
      const input = screen.getByLabelText('Logged on');
      pick(input, '2026-11-03');
      expect(onChange).toHaveBeenCalledWith('2026-10-26');
      expect(input).toHaveValue('2026-10-26');
    });

    it('keeps max when a future date is picked on max itself', () => {
      const onChange = vi.fn();
      render(<Controlled start="2026-10-26" max="2026-10-26" onChange={onChange} />);
      const input = screen.getByLabelText('Logged on');
      pick(input, '2027-01-01');
      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('2026-10-26');
    });

    it('brings a date before min up to min', () => {
      const onChange = vi.fn();
      render(<Controlled start="2026-10-20" min="2026-10-01" onChange={onChange} />);
      pick(screen.getByLabelText('Logged on'), '2026-09-12');
      expect(onChange).toHaveBeenCalledWith('2026-10-01');
    });

    it('reports nothing when the input is emptied', () => {
      const onChange = vi.fn();
      render(<Controlled start="2026-10-20" onChange={onChange} />);
      const input = screen.getByLabelText('Logged on');
      pick(input, '');
      expect(onChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('2026-10-20');
    });
  });

  it('is a labelled time input in time mode', () => {
    const onChange = vi.fn();
    render(<Controlled mode="time" start="14:00" onChange={onChange} />);
    const input = screen.getByLabelText('Logged on');
    expect(input).toHaveAttribute('type', 'time');
    expect(input).toHaveAttribute('data-ui', 'test.when.time');
    pick(input, '07:45');
    expect(onChange).toHaveBeenCalledWith('07:45');
  });

  describe('datetime mode', () => {
    const renderBoth = (props: Omit<HarnessProps, 'mode'>) => {
      render(<Controlled mode="datetime" {...props} />);
      const group = screen.getByRole('group', { name: 'Logged on' });
      return {
        group,
        date: within(group).getByLabelText(t('common.date')),
        time: within(group).getByLabelText(t('common.time')),
      };
    };

    it('shows a named group with a date and a time input', () => {
      const { group, date, time } = renderBoth({
        start: '2026-10-25T08:30',
        max: '2026-10-26T12:15',
      });
      expect(group).toHaveAttribute('data-ui', 'test.when');
      expect(date).toHaveValue('2026-10-25');
      expect(date).toHaveAttribute('max', '2026-10-26');
      expect(date).toHaveAttribute('data-ui', 'test.when.date');
      expect(time).toHaveValue('08:30');
      expect(time).toHaveAttribute('data-ui', 'test.when.time');
      // The clock is bounded only on max's own day.
      expect(time).not.toHaveAttribute('max');
    });

    it('rejects a future date: it comes back as max, time included', () => {
      const onChange = vi.fn();
      const { date, time } = renderBoth({
        start: '2026-10-25T18:30',
        max: '2026-10-26T12:15',
        onChange,
      });
      pick(date, '2026-10-29');
      expect(onChange).toHaveBeenCalledWith('2026-10-26T12:15');
      expect(date).toHaveValue('2026-10-26');
      expect(time).toHaveValue('12:15');
      expect(time).toHaveAttribute('max', '12:15');
    });

    it('clamps a later time on max’s day and keeps an earlier one', () => {
      const onChange = vi.fn();
      const { time } = renderBoth({ start: '2026-10-26T09:00', max: '2026-10-26T12:15', onChange });
      pick(time, '13:40');
      expect(onChange).toHaveBeenLastCalledWith('2026-10-26T12:15');
      pick(time, '11:05');
      expect(onChange).toHaveBeenLastCalledWith('2026-10-26T11:05');
    });

    it('cuts seconds off the bounds', () => {
      const onChange = vi.fn();
      const { date } = renderBoth({
        start: '2026-10-25T09:00',
        max: '2026-10-26T12:15:59',
        onChange,
      });
      pick(date, '2026-12-01');
      expect(onChange).toHaveBeenCalledWith('2026-10-26T12:15');
    });
  });
});

describe('clampWallClock', () => {
  it('compares values of one shape as text', () => {
    expect(clampWallClock('2026-10-27', undefined, '2026-10-26')).toBe('2026-10-26');
    expect(clampWallClock('2026-09-30', '2026-10-01')).toBe('2026-10-01');
    expect(clampWallClock('2026-10-26T23:59', undefined, '2026-10-27T00:00')).toBe(
      '2026-10-26T23:59',
    );
    expect(clampWallClock('09:30', '08:00', '17:00')).toBe('09:30');
  });
});
