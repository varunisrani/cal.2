import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IngredientLine } from '../../../domain/model';
import type { EnergyDisplayUnit } from '../../../domain/units/energy';
import { common } from '../../../i18n/en/common';
import { ingredients } from '../../../i18n/en/ingredients';
import { makeLine } from '../../../test/factories';
import { LineEditor } from './LineEditor';

const words = ingredients.ingredients.editor;

interface Setup {
  readonly line?: IngredientLine | null;
  readonly energyUnit?: EnergyDisplayUnit;
  readonly removable?: boolean;
}

function openEditor({ line = makeLine(), energyUnit = 'kcal', removable = true }: Setup = {}) {
  const onSave = vi.fn<(line: IngredientLine) => void>();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  render(
    <LineEditor
      open
      line={line}
      energyUnit={energyUnit}
      onSave={onSave}
      onRemove={removable ? onRemove : undefined}
      onClose={onClose}
    />,
  );
  const sheet = within(screen.getByRole('dialog', { name: line ? words.edit : words.add }));
  const field = (label: string) => sheet.getByRole('textbox', { name: label });
  const type = (label: string, value: string) =>
    fireEvent.change(field(label), { target: { value } });
  const save = () => sheet.getByRole('button', { name: common.common.save });
  return { sheet, field, type, save, onSave, onRemove, onClose };
}

/** The part handed to onSave by the one Save press. */
function savedPart(onSave: ReturnType<typeof openEditor>['onSave']): IngredientLine {
  expect(onSave).toHaveBeenCalledTimes(1);
  return onSave.mock.calls[0]?.[0] as IngredientLine;
}

describe('LineEditor', () => {
  it('starts a new part at 100 g with nothing in it, and keeps Save off until it has a name', () => {
    const { field, type, save } = openEditor({ line: null });
    expect(field(words.name)).toHaveValue('');
    expect(field(words.weight)).toHaveValue('100');
    expect(field(words.energy.kcal)).toHaveValue('0');
    expect(save()).toBeDisabled();

    type(words.name, '   ');
    expect(save()).toBeDisabled();
    type(words.name, 'Salt');
    expect(save()).toBeEnabled();
  });

  it('keeps Save off for a weight of 0 and for a negative or unreadable value (P01-10 check)', () => {
    const { type, save } = openEditor();
    type(words.weight, '0');
    expect(save()).toBeDisabled();
    type(words.weight, '120');
    expect(save()).toBeEnabled();

    type(words.protein, '-1');
    expect(save()).toBeDisabled();
    type(words.protein, 'a lot');
    expect(save()).toBeDisabled();
    type(words.protein, '4');
    expect(save()).toBeEnabled();
    type(words.energy.kcal, '');
    expect(save()).toBeDisabled();
  });

  it('rescales energy and macros from the unrounded baseline as the weight is typed: 1, 15, 150 g never drift', () => {
    const line = makeLine({ grams: 100, kcal: 150, protein: 3.33, carbs: 20, fat: 7 });
    const { field, type, save, onSave } = openEditor({ line });

    for (const grams of ['1', '15', '150']) type(words.weight, grams);
    expect(field(words.energy.kcal)).toHaveValue('225');
    expect(field(words.protein)).toHaveValue('5.0');
    expect(field(words.carbs)).toHaveValue('30');
    expect(field(words.fat)).toHaveValue('10.5');

    fireEvent.click(save());
    const part = savedPart(onSave);
    expect(part).toMatchObject({ grams: 150, kcal: 225, carbs: 30, fat: 10.5 });
    // The macro saved is the exact one behind "5.0", not the rounded text.
    expect(part.protein).toBeCloseTo(4.995, 9);
  });

  it('makes a typed value the new baseline for the next weight change', () => {
    const line = makeLine({ grams: 100, kcal: 100, protein: 10, carbs: 10, fat: 10 });
    const { field, type } = openEditor({ line });
    type(words.energy.kcal, '200');
    type(words.weight, '50');
    expect(field(words.energy.kcal)).toHaveValue('100');
    expect(field(words.protein)).toHaveValue('5');
  });

  it('saves a part opened and left alone exactly as it was, photos and emoji included', () => {
    const line = makeLine({
      name: 'Roast squash',
      grams: 37.333,
      kcal: 31,
      protein: 0.712,
      carbs: 7.345,
      fat: 0.04,
      photoIds: ['photo-9'],
      emoji: '🎃',
    });
    const { save, onSave, onClose } = openEditor({ line });
    fireEvent.click(save());
    expect(savedPart(onSave)).toEqual(line);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows energy in kJ and keeps the kcal of an untouched kJ field', () => {
    const line = makeLine({ kcal: 119 });
    const first = openEditor({ line, energyUnit: 'kJ' });
    expect(first.field(words.energy.kJ)).toHaveValue('498');
    fireEvent.click(first.save());
    expect(savedPart(first.onSave).kcal).toBe(119);
  });

  it('turns typed kJ into whole kcal', () => {
    const { type, save, onSave } = openEditor({ line: makeLine({ kcal: 119 }), energyUnit: 'kJ' });
    type(words.energy.kJ, '1000');
    fireEvent.click(save());
    expect(savedPart(onSave).kcal).toBe(239);
  });

  it('takes a weight typed onto a part of unknown weight, keeping its values as the baseline', () => {
    const line = makeLine({ grams: 0, kcal: 90, protein: 3, carbs: 12, fat: 3 });
    const { field, type, save } = openEditor({ line });
    expect(field(words.weight)).toHaveValue('');
    expect(save()).toBeDisabled();

    type(words.weight, '30');
    expect(field(words.energy.kcal)).toHaveValue('90');
    expect(save()).toBeEnabled();
    type(words.weight, '60');
    expect(field(words.energy.kcal)).toHaveValue('180');
    expect(field(words.carbs)).toHaveValue('24');
  });

  it('offers Remove for an existing part, which removes it and closes', () => {
    const existing = openEditor();
    fireEvent.click(existing.sheet.getByRole('button', { name: words.remove }));
    expect(existing.onRemove).toHaveBeenCalledTimes(1);
    expect(existing.onClose).toHaveBeenCalledTimes(1);
    expect(existing.onSave).not.toHaveBeenCalled();
  });

  it('has no Remove for a new part, and Cancel only closes', () => {
    const { sheet, onSave, onClose } = openEditor({ line: null });
    expect(sheet.queryByRole('button', { name: words.remove })).toBeNull();
    fireEvent.click(sheet.getByRole('button', { name: common.common.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    render(
      <LineEditor open={false} line={null} energyUnit="kcal" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
