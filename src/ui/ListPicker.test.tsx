import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n/t';
import { ListPicker } from './ListPicker';

afterEach(cleanup);

type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEALS = [
  { value: 'breakfast', label: 'Breakfast', detail: 'Until 10:30' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
] as const;

function Harness({
  onChange,
  start = 'lunch',
}: {
  readonly onChange?: (value: Meal) => void;
  readonly start?: Meal | null;
}) {
  const [open, setOpen] = useState(false);
  const [meal, setMeal] = useState<Meal | null>(start);
  return (
    <>
      <button onClick={() => setOpen(true)}>Meal</button>
      <ListPicker
        open={open}
        title="Choose a meal"
        data-ui="test.meal"
        options={MEALS}
        value={meal}
        onChange={(next) => {
          setMeal(next);
          onChange?.(next);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

async function openPicker(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const opener = screen.getByRole('button', { name: 'Meal' });
  await user.click(opener);
  return { user, opener };
}

const option = (name: string | RegExp) => screen.getByRole('option', { name });

describe('ListPicker', () => {
  it('lists the options in a titled sheet with the chosen one selected', async () => {
    await openPicker();
    expect(screen.getByRole('dialog', { name: 'Choose a meal' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Choose a meal' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(option('Lunch')).toHaveAttribute('aria-selected', 'true');
    expect(option(/Breakfast/)).toHaveAttribute('aria-selected', 'false');
    expect(option(/Breakfast/)).toHaveTextContent('Until 10:30');
    expect(option('Dinner')).toHaveAttribute('data-ui', 'test.meal.dinner');
    expect(screen.getByRole('button', { name: t('common.done') })).toBeInTheDocument();
  });

  it('starts with focus on the chosen option', async () => {
    await openPicker();
    expect(option('Lunch')).toHaveFocus();
  });

  it('reports a tapped option and closes, giving focus back', async () => {
    const onChange = vi.fn();
    const { user, opener } = await openPicker({ onChange });
    await user.click(option('Dinner'));
    expect(onChange).toHaveBeenCalledWith('dinner');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();

    await user.click(opener);
    expect(option('Dinner')).toHaveAttribute('aria-selected', 'true');
  });

  it('moves focus with the arrow keys and chooses with Enter', async () => {
    const onChange = vi.fn();
    const { user } = await openPicker({ onChange });
    await user.keyboard('{ArrowDown}');
    expect(option('Dinner')).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(option('Snack')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(option(/Breakfast/)).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('breakfast');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('chooses with Space too', async () => {
    const onChange = vi.fn();
    const { user } = await openPicker({ onChange });
    await user.keyboard('{End} ');
    expect(onChange).toHaveBeenCalledWith('snack');
  });

  it('closes without a report when the chosen option is picked again', async () => {
    const onChange = vi.fn();
    const { user } = await openPicker({ onChange });
    await user.click(option('Lunch'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows extra content under the list, e.g. a field for a custom value', () => {
    render(
      <ListPicker
        open
        title="Model"
        data-ui="test.model"
        options={[{ value: 'small', label: 'Small' }]}
        value="small"
        onChange={() => {}}
        onClose={() => {}}
      >
        <input aria-label="Another model" />
      </ListPicker>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Model' });
    expect(within(sheet).getByRole('textbox', { name: 'Another model' })).toBeInTheDocument();
  });

  it('starts on the first option when nothing is chosen yet', async () => {
    await openPicker({ start: null });
    expect(option(/Breakfast/)).toHaveFocus();
    expect(screen.queryByRole('option', { selected: true })).toBeNull();
  });
});
