import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTimeField, notAfter, notBefore, type DateTimeValue } from './DateTimeField';

afterEach(cleanup);

function DayHarness({
  start,
  min,
  max,
  onValue,
}: {
  start: string;
  min?: string;
  max?: string;
  onValue?: (value: string) => void;
}) {
  const [day, setDay] = useState(start);
  return (
    <DateTimeField
      kind="date"
      label="Weigh-in day"
      value={day}
      min={min}
      max={max}
      onChange={(next) => {
        setDay(next);
        onValue?.(next);
      }}
      data-ui="test.day"
    />
  );
}

function MomentHarness({
  start,
  min,
  max,
  onValue,
}: {
  start: DateTimeValue;
  min?: DateTimeValue;
  max?: DateTimeValue;
  onValue?: (value: DateTimeValue) => void;
}) {
  const [moment, setMoment] = useState(start);
  return (
    <DateTimeField
      kind="datetime"
      label="Eaten at"
      value={moment}
      min={min}
      max={max}
      onChange={(next) => {
        setMoment(next);
        onValue?.(next);
      }}
      data-ui="test.eaten"
    />
  );
}

const NOW: DateTimeValue = { date: '2026-10-26', time: '14:05' };

describe('notAfter and notBefore', () => {
  it('hold the day first, then the time on the limiting day', () => {
    expect(notAfter({ date: '2026-10-27', time: '09:00' }, NOW)).toEqual({
      date: '2026-10-26',
      time: '09:00',
    });
    expect(notAfter({ date: '2026-10-27', time: '20:00' }, NOW)).toEqual(NOW);
    expect(notAfter({ date: '2026-10-25', time: '20:00' }, NOW)).toEqual({
      date: '2026-10-25',
      time: '20:00',
    });
    const min = { date: '2016-10-26', time: '06:00' };
    expect(notBefore({ date: '2016-10-26', time: '05:00' }, min)).toEqual(min);
    expect(notBefore({ date: '2009-01-01', time: '12:00' }, min)).toEqual({
      date: '2016-10-26',
      time: '12:00',
    });
  });
});

describe('DateTimeField', () => {
  it('is a native date input found by its label, carrying its max', () => {
    render(<DayHarness start="2026-10-20" max="2026-10-26" />);
    const input = screen.getByLabelText('Weigh-in day');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('max', '2026-10-26');
    expect(input).toHaveAttribute('data-ui', 'test.day');
    expect(input).toHaveValue('2026-10-20');
  });

  it('rejects a future date: a day after max is held to max', () => {
    const onValue = vi.fn();
    render(<DayHarness start="2026-10-20" max="2026-10-26" onValue={onValue} />);
    const input = screen.getByLabelText('Weigh-in day');
    fireEvent.change(input, { target: { value: '2026-11-02' } });
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith('2026-10-26');
    expect(input).toHaveValue('2026-10-26');
  });

  it('accepts any day up to max', () => {
    const onValue = vi.fn();
    render(<DayHarness start="2026-10-20" max="2026-10-26" onValue={onValue} />);
    const input = screen.getByLabelText('Weigh-in day');
    fireEvent.change(input, { target: { value: '2026-10-26' } });
    fireEvent.change(input, { target: { value: '2025-02-01' } });
    expect(onValue.mock.calls).toEqual([['2026-10-26'], ['2025-02-01']]);
  });

  it('holds a day before min to min when the input is left, not while typing', () => {
    const onValue = vi.fn();
    render(<DayHarness start="2026-10-20" min="2016-10-26" onValue={onValue} />);
    const input = screen.getByLabelText('Weigh-in day');
    expect(input).toHaveAttribute('min', '2016-10-26');
    // A year typed digit by digit passes through early years on the way.
    fireEvent.change(input, { target: { value: '0002-10-20' } });
    expect(onValue).toHaveBeenLastCalledWith('0002-10-20');
    fireEvent.blur(input);
    expect(onValue).toHaveBeenLastCalledWith('2016-10-26');
    expect(input).toHaveValue('2016-10-26');
  });

  it('ignores an emptied input and keeps the last day', () => {
    const onValue = vi.fn();
    render(<DayHarness start="2026-10-20" onValue={onValue} />);
    const input = screen.getByLabelText('Weigh-in day');
    fireEvent.change(input, { target: { value: '' } });
    expect(onValue).not.toHaveBeenCalled();
    expect(input).toHaveValue('2026-10-20');
  });

  it('can be a time input alone, held to its max', () => {
    const onValue = vi.fn();
    function TimeHarness() {
      const [time, setTime] = useState('08:00');
      return (
        <DateTimeField
          kind="time"
          label="Reminder"
          value={time}
          max="21:00"
          onChange={(next) => {
            setTime(next);
            onValue(next);
          }}
          data-ui="test.reminder"
        />
      );
    }
    render(<TimeHarness />);
    const input = screen.getByLabelText('Reminder');
    expect(input).toHaveAttribute('type', 'time');
    fireEvent.change(input, { target: { value: '22:30' } });
    expect(onValue).toHaveBeenLastCalledWith('21:00');
  });

  describe('with a date and a time', () => {
    it('is a group of a date and a time input with their own hooks', () => {
      render(<MomentHarness start={{ date: '2026-10-26', time: '12:30' }} max={NOW} />);
      const group = screen.getByRole('group', { name: 'Eaten at' });
      expect(group).toHaveAttribute('data-ui', 'test.eaten');
      const date = screen.getByLabelText('Date');
      const time = screen.getByLabelText('Time');
      expect(date).toHaveAttribute('data-ui', 'test.eaten.date');
      expect(time).toHaveAttribute('data-ui', 'test.eaten.time');
      expect(date).toHaveAttribute('max', '2026-10-26');
      expect(time).toHaveAttribute('max', '14:05');
    });

    it('rejects a future date, keeping the time of day when it is not later than now', () => {
      const onValue = vi.fn();
      render(
        <MomentHarness start={{ date: '2026-10-24', time: '09:15' }} max={NOW} onValue={onValue} />,
      );
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-30' } });
      expect(onValue).toHaveBeenLastCalledWith({ date: '2026-10-26', time: '09:15' });
    });

    it('holds a later time on the max day to the max time, and pulls a later time back when the day moves onto it', () => {
      const onValue = vi.fn();
      render(
        <MomentHarness start={{ date: '2026-10-24', time: '20:00' }} max={NOW} onValue={onValue} />,
      );
      const time = screen.getByLabelText('Time');
      expect(time).not.toHaveAttribute('max');
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-26' } });
      expect(onValue).toHaveBeenLastCalledWith(NOW);
      expect(time).toHaveAttribute('max', '14:05');

      fireEvent.change(time, { target: { value: '18:45' } });
      expect(time).toHaveValue('14:05');
      fireEvent.change(time, { target: { value: '11:10' } });
      expect(onValue).toHaveBeenLastCalledWith({ date: '2026-10-26', time: '11:10' });
    });

    it('holds an early moment to min when the input is left', () => {
      const onValue = vi.fn();
      const min = { date: '2016-10-26', time: '00:00' };
      render(
        <MomentHarness start={{ date: '2026-10-24', time: '20:00' }} min={min} onValue={onValue} />,
      );
      const date = screen.getByLabelText('Date');
      fireEvent.change(date, { target: { value: '2001-03-04' } });
      fireEvent.blur(date);
      expect(onValue).toHaveBeenLastCalledWith({ date: '2016-10-26', time: '20:00' });
    });
  });
});
