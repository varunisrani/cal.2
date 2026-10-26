import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEIGHT_WHEEL, weightFromWheel, weightWheel, type WeightWheel } from '../domain/units/body';
import { advance, useFakeTime } from '../test/time';
import { Wheel, type WheelOption } from './Wheel';

afterEach(cleanup);

function counting(from: number, to: number): WheelOption<number>[] {
  const options: WheelOption<number>[] = [];
  for (let n = from; n <= to; n++) options.push({ value: n, label: String(n) });
  return options;
}

const WHOLE_KG = counting(WEIGHT_WHEEL.kg.min, WEIGHT_WHEEL.kg.max);
const TENTHS = counting(0, 9);

/** A weight picker built the way screens will: whole and tenths wheels from the domain helpers. */
function WeightPicker({ kg, onKg }: { kg: number; onKg?: (kg: number) => void }) {
  const [wheel, setWheel] = useState<WeightWheel>(() => weightWheel(kg, 'kg'));
  const update = (next: WeightWheel): void => {
    setWheel(next);
    onKg?.(weightFromWheel(next, 'kg'));
  };
  return (
    <div>
      <Wheel
        label="Kilograms"
        options={WHOLE_KG}
        value={wheel.whole}
        onChange={(whole) => update({ ...wheel, whole })}
        data-ui="test.weight.whole"
      />
      <Wheel
        label="Tenths"
        options={TENTHS}
        value={wheel.tenth}
        onChange={(tenth) => update({ ...wheel, tenth })}
        data-ui="test.weight.tenth"
      />
    </div>
  );
}

const wholeSelect = (): HTMLElement => screen.getByRole('combobox', { name: 'Kilograms' });
const tenthSelect = (): HTMLElement => screen.getByRole('combobox', { name: 'Tenths' });

/** The drawn strip of the wheel whose select is `select` (hidden from assistive tech). */
function stripOf(select: HTMLElement): HTMLElement {
  const strip = select.parentElement?.querySelector<HTMLElement>('[aria-hidden="true"]');
  if (!strip) throw new Error('wheel strip missing');
  return strip;
}

function currentRow(select: HTMLElement): string | null {
  return stripOf(select).querySelector('[data-current]')?.textContent ?? null;
}

describe('Wheel', () => {
  it('opens at 70.0 on a whole and a tenths wheel', () => {
    render(<WeightPicker kg={70} />);
    expect(wholeSelect()).toHaveDisplayValue('70');
    expect(tenthSelect()).toHaveDisplayValue('0');
    expect(currentRow(wholeSelect())).toBe('70');
    expect(currentRow(tenthSelect())).toBe('0');
    expect(wholeSelect()).toHaveAttribute('data-ui', 'test.weight.whole');
  });

  it('moves to the next value on ArrowDown, and the native select mirrors it', async () => {
    const user = userEvent.setup();
    const onKg = vi.fn();
    render(<WeightPicker kg={70} onKg={onKg} />);
    await user.tab();
    expect(wholeSelect()).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(wholeSelect()).toHaveDisplayValue('71');
    expect(currentRow(wholeSelect())).toBe('71');
    expect(onKg).toHaveBeenLastCalledWith(71);

    await user.tab();
    expect(tenthSelect()).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(tenthSelect()).toHaveDisplayValue('3');
    expect(onKg).toHaveBeenLastCalledWith(71.3);
    await user.keyboard('{ArrowUp}');
    expect(tenthSelect()).toHaveDisplayValue('2');
  });

  it('moves a screenful with Page keys, and stops at the ends with Home and End', async () => {
    const user = userEvent.setup();
    render(<WeightPicker kg={70} />);
    wholeSelect().focus();
    await user.keyboard('{PageDown}');
    expect(wholeSelect()).toHaveDisplayValue('75');
    await user.keyboard('{PageUp}{PageUp}');
    expect(wholeSelect()).toHaveDisplayValue('65');
    await user.keyboard('{End}');
    expect(wholeSelect()).toHaveDisplayValue('250');
    await user.keyboard('{ArrowDown}{PageDown}');
    expect(wholeSelect()).toHaveDisplayValue('250');
    await user.keyboard('{Home}');
    expect(wholeSelect()).toHaveDisplayValue('20');
    await user.keyboard('{ArrowUp}');
    expect(wholeSelect()).toHaveDisplayValue('20');
  });

  it('follows a choice made in the native select', async () => {
    const user = userEvent.setup();
    const onKg = vi.fn();
    render(<WeightPicker kg={70} onKg={onKg} />);
    await user.selectOptions(wholeSelect(), '82');
    expect(currentRow(wholeSelect())).toBe('82');
    expect(onKg).toHaveBeenLastCalledWith(82);
  });

  it('picks a row that is tapped and keeps the keys on the wheel', async () => {
    const user = userEvent.setup();
    render(<WeightPicker kg={70} />);
    const row = Array.from(stripOf(wholeSelect()).children).find((r) => r.textContent === '73');
    if (!row) throw new Error('row 73 missing');
    await user.click(row);
    expect(wholeSelect()).toHaveDisplayValue('73');
    expect(wholeSelect()).toHaveFocus();
  });

  it('picks the row a scroll comes to rest on', () => {
    useFakeTime('2026-10-26T08:00:00');
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(44);
    const onKg = vi.fn();
    render(<WeightPicker kg={70} onKg={onKg} />);
    const strip = stripOf(wholeSelect());
    expect(strip.scrollTop).toBe((70 - 20) * 44);

    strip.scrollTop = (73 - 20) * 44 + 10;
    fireEvent.scroll(strip);
    act(() => advance(100));
    strip.scrollTop = (74 - 20) * 44 - 3;
    fireEvent.scroll(strip);
    act(() => advance(119));
    expect(onKg).not.toHaveBeenCalled();
    act(() => advance(1));
    expect(onKg).toHaveBeenCalledTimes(1);
    expect(onKg).toHaveBeenLastCalledWith(74);
    expect(wholeSelect()).toHaveDisplayValue('74');
  });

  it('opens on the first row when its value is not in the list', () => {
    render(
      <Wheel
        label="Hours"
        options={counting(1, 24)}
        value={99}
        onChange={() => undefined}
        data-ui="test.hours"
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Hours' })).toHaveDisplayValue('1');
  });

  it('draws nothing when it has no values', () => {
    const { container } = render(
      <Wheel
        label="Hours"
        options={[]}
        value={1}
        onChange={() => undefined}
        data-ui="test.hours"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers assistive tech one control per wheel and hides the drawn strip', () => {
    render(<WeightPicker kg={70} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(stripOf(wholeSelect())).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('option')).toHaveLength(WHOLE_KG.length + TENTHS.length);
  });
});
