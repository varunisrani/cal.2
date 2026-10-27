import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PillarKey } from '../../domain/nutrients/catalogue';
import { common } from '../../i18n/en/common';
import { home } from '../../i18n/en/home';
import { ToastProvider } from '../../ui/Toast';
import { PillarPicker } from './PillarPicker';

const words = home.home;

function renderPicker({
  chosen = ['protein', 'carbs', 'fat', 'fibre'],
  waterOn = false,
  onSave = vi.fn(async () => undefined),
  onClose = vi.fn(),
}: {
  chosen?: readonly PillarKey[];
  waterOn?: boolean;
  onSave?: (keys: readonly PillarKey[]) => Promise<unknown>;
  onClose?: () => void;
} = {}) {
  render(
    <ToastProvider>
      <PillarPicker open chosen={chosen} waterOn={waterOn} onSave={onSave} onClose={onClose} />
    </ToastProvider>,
  );
  return { onSave, onClose };
}

const picker = () => screen.getByRole('dialog', { name: words.picker.title });
/** The chosen order as shown: the hooks of its rows. */
const order = () =>
  within(picker())
    .getAllByRole('listitem')
    .filter((item) => item.closest('[data-ui="home.picker.order"]'))
    .map((item) => item.getAttribute('data-ui')?.replace('home.picker.order.', ''));
const option = (name: string) => within(picker()).getByRole('checkbox', { name });
const ticked = () =>
  within(picker())
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.getAttribute('data-ui')?.replace('home.picker.option.', ''));

async function pressDone(): Promise<void> {
  await act(async () => {
    fireEvent.click(within(picker()).getByRole('button', { name: common.common.done }));
  });
}

describe('PillarPicker', () => {
  it('offers all 32 nutrients and shows the chosen order with positions, without water when it is not tracked', () => {
    renderPicker({ chosen: ['sodium', 'protein'] });
    expect(within(picker()).getAllByRole('checkbox')).toHaveLength(32);
    expect(ticked()).toEqual(['protein', 'sodium']);
    expect(order()).toEqual(['sodium', 'protein']);
    const first = picker().querySelector('[data-ui="home.picker.order.sodium"]');
    expect(first).toHaveTextContent(`1${words.pillar.sodium}`);
    expect(option(words.pillar.sodium)).toHaveAccessibleDescription(words.unit.mg);
    expect(picker().querySelector('[data-ui="home.picker.order.water"]')).toBeNull();
  });

  it('shows water last and locked while it is tracked', () => {
    renderPicker({ chosen: ['sodium', 'protein'], waterOn: true });
    expect(order()).toEqual(['sodium', 'protein', 'water']);
    const water = picker().querySelector('[data-ui="home.picker.order.water"]') as HTMLElement;
    expect(water).toHaveTextContent(`3${words.pillar.water} ${words.picker.waterLast}`);
    expect(within(water).getByRole('img', { name: words.picker.waterLocked })).toBeVisible();
    // Water is never one of the choices.
    expect(within(picker()).queryByRole('checkbox', { name: words.pillar.water })).toBeNull();
  });

  it('replaces the latest pick when a fifth nutrient is picked (ACC-F5-1)', async () => {
    const { onSave } = renderPicker({ chosen: ['protein', 'carbs', 'fat', 'fibre'] });

    fireEvent.click(option(words.pillar.iron));
    expect(order()).toEqual(['protein', 'carbs', 'fat', 'iron']);
    expect(option(words.pillar.fibre)).not.toBeChecked();

    // The latest pick is now iron, so zinc takes its place.
    fireEvent.click(option(words.pillar.zinc));
    expect(order()).toEqual(['protein', 'carbs', 'fat', 'zinc']);

    await pressDone();
    expect(onSave).toHaveBeenCalledWith(['protein', 'carbs', 'fat', 'zinc']);
  });

  it('takes a ticked nutrient out and puts a new one at the end', () => {
    renderPicker({ chosen: ['protein', 'carbs', 'fat'] });
    fireEvent.click(option(words.pillar.carbs));
    fireEvent.click(option(words.pillar.caffeine));
    expect(order()).toEqual(['protein', 'fat', 'caffeine']);
  });

  it('keeps the last nutrient: unticking the only one changes nothing', async () => {
    const { onSave } = renderPicker({ chosen: ['zinc'] });
    fireEvent.click(option(words.pillar.zinc));
    expect(option(words.pillar.zinc)).toBeChecked();
    expect(order()).toEqual(['zinc']);

    await pressDone();
    expect(onSave).toHaveBeenCalledWith(['zinc']);
  });

  it('restores protein, carbs, fat and fibre on Reset to default, saved only by Done', async () => {
    const { onSave } = renderPicker({ chosen: ['sodium', 'iron'] });

    fireEvent.click(within(picker()).getByRole('button', { name: words.picker.reset }));
    expect(order()).toEqual(['protein', 'carbs', 'fat', 'fibre']);
    expect(onSave).not.toHaveBeenCalled();

    await pressDone();
    expect(onSave).toHaveBeenCalledWith(['protein', 'carbs', 'fat', 'fibre']);
  });

  it('saves the draft on Done and then closes', async () => {
    const { onSave, onClose } = renderPicker({ chosen: ['protein'] });
    fireEvent.click(option(words.pillar.potassium));
    await pressDone();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(['protein', 'potassium']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drops the draft on Cancel: nothing is saved', () => {
    const { onSave, onClose } = renderPicker();
    fireEvent.click(option(words.pillar.sugar));
    fireEvent.click(within(picker()).getByRole('button', { name: common.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stays open with the draft and says so when saving fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('disk full');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { onClose } = renderPicker({ chosen: ['protein'], onSave });
    fireEvent.click(option(words.pillar.iron));

    await pressDone();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(words.picker.saveFailed);
    expect(order()).toEqual(['protein', 'iron']);
    expect(error).toHaveBeenCalled();
  });
});
