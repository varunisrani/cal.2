import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListPicker, type ListPickerOption } from './ListPicker';

afterEach(cleanup);

type Unit = 'kg' | 'lb' | 'st';

const UNITS: ReadonlyArray<ListPickerOption<Unit>> = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds', description: 'Used in the US' },
  { value: 'st', label: 'Stones' },
];

function Harness({ start, onPick }: { start?: Unit; onPick?: (value: Unit) => void }) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<Unit | undefined>(start);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Choose unit
      </button>
      <ListPicker
        open={open}
        title="Weight unit"
        options={UNITS}
        value={unit}
        onSelect={(value) => {
          setUnit(value);
          onPick?.(value);
        }}
        onClose={() => setOpen(false)}
        data-ui="test.unit"
      >
        <p>Changes every weight shown</p>
      </ListPicker>
    </>
  );
}

async function openPicker(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Choose unit' }));
  return screen.getByRole('listbox', { name: 'Weight unit' });
}

describe('ListPicker', () => {
  it('opens as a sheet with a listbox, the current option selected and focused', async () => {
    const user = userEvent.setup();
    render(<Harness start="lb" />);
    await openPicker(user);
    expect(screen.getByRole('dialog', { name: 'Weight unit' })).toHaveAttribute(
      'data-ui',
      'test.unit',
    );
    const pounds = screen.getByRole('option', { name: 'Pounds', selected: true });
    expect(pounds).toHaveFocus();
    expect(pounds).toHaveAccessibleDescription('Used in the US');
    expect(pounds).toHaveAttribute('data-ui', 'test.unit.lb');
    expect(screen.getByRole('option', { name: 'Kilograms', selected: false })).toBeInTheDocument();
    expect(screen.getByText('Changes every weight shown')).toBeInTheDocument();
  });

  it('reports the chosen value and closes', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness start="kg" onPick={onPick} />);
    await openPicker(user);
    await user.click(screen.getByRole('option', { name: 'Stones' }));
    expect(onPick).toHaveBeenCalledWith('st');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose unit' })).toHaveFocus();

    await openPicker(user);
    expect(screen.getByRole('option', { name: 'Stones', selected: true })).toHaveFocus();
  });

  it('moves with the arrow keys, Home and End, and chooses with Enter', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness start="kg" onPick={onPick} />);
    await openPicker(user);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Pounds' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('option', { name: 'Stones' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: 'Stones' })).toHaveFocus();
    await user.keyboard('{Home}{ArrowUp}');
    expect(screen.getByRole('option', { name: 'Kilograms' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onPick).toHaveBeenCalledWith('lb');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('chooses with Space', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness start="kg" onPick={onPick} />);
    await openPicker(user);
    await user.keyboard('{ArrowDown}{ArrowDown} ');
    expect(onPick).toHaveBeenCalledWith('st');
  });

  it('closes on Done without choosing', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await openPicker(user);
    expect(screen.queryByRole('option', { selected: true })).toBeNull();
    expect(screen.getByRole('option', { name: 'Kilograms' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
