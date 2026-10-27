import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaterDisplayUnit } from '../../domain/units/water';
import { common } from '../../i18n/en/common';
import { trackers } from '../../i18n/en/trackers';
import { PresetsEditor } from './PresetsEditor';

const words = trackers.trackers.water.quickAdd;

afterEach(() => {
  vi.restoreAllMocks();
});

function openEditor(saved: readonly number[], unit: WaterDisplayUnit) {
  const user = userEvent.setup();
  const onSave = vi.fn<(amounts: number[]) => unknown>();
  const onClose = vi.fn();
  render(<PresetsEditor open saved={saved} unit={unit} onSave={onSave} onClose={onClose} />);
  const sheet = within(screen.getByRole('dialog', { name: words.title }));
  const field = (index: number) =>
    sheet.getByRole('textbox', { name: `Amount ${String(index + 1)}` });
  const texts = () => [0, 1, 2].map((index) => (field(index) as HTMLInputElement).value);
  const save = () => sheet.getByRole('button', { name: common.common.save });
  const retype = async (index: number, text: string) => {
    await user.clear(field(index));
    if (text !== '') await user.type(field(index), text);
  };
  return { user, sheet, field, texts, save, retype, onSave, onClose };
}

describe('PresetsEditor', () => {
  it('keeps 250 ml exactly through a save in fl oz when no field is touched (R05.10, ACC-H2-1)', async () => {
    const e = openEditor([250, 500, 750], 'flOz');
    expect(e.texts()).toEqual(['8.5', '16.9', '25.4']);
    expect(e.field(0)).toHaveAccessibleDescription('fl oz');

    await e.user.click(e.save());

    expect(e.onSave).toHaveBeenCalledWith([250, 500, 750]);
  });

  it('converts an edited fl oz field to whole ml and keeps the others exact', async () => {
    const e = openEditor([250, 500, 750], 'flOz');

    await e.retype(0, '8');
    await e.user.click(e.save());

    expect(e.onSave).toHaveBeenCalledWith([237, 500, 750]);
  });

  it('keeps a field exact when it is typed back to the text it opened with', async () => {
    const e = openEditor([250, 500, 750], 'flOz');

    await e.retype(0, '8,5');
    expect(e.texts()[0]).toBe('8.5');
    await e.user.click(e.save());

    expect(e.onSave).toHaveBeenCalledWith([250, 500, 750]);
  });

  it('disables Save and names the largest amount while a field is empty, zero or too large', async () => {
    const e = openEditor([250, 500, 750], 'ml');
    const problem = 'Enter more than 0, up to 5,000 ml.';
    expect(e.save()).toBeEnabled();
    expect(e.sheet.queryByText(problem)).toBeNull();

    for (const text of ['', '0', '5001']) {
      await e.retype(1, text);
      expect(e.field(1)).toHaveAttribute('aria-invalid', 'true');
      expect(e.field(1)).toHaveAccessibleDescription(`ml ${problem}`);
      expect(e.save()).toBeDisabled();
    }
    await e.user.click(e.save());
    expect(e.onSave).not.toHaveBeenCalled();

    await e.retype(1, '5000');
    expect(e.field(1)).not.toHaveAttribute('aria-invalid');
    expect(e.save()).toBeEnabled();
    await e.user.click(e.save());
    expect(e.onSave).toHaveBeenCalledWith([250, 750, 5_000]);
  });

  it('refuses 170 fl oz, naming 169 fl oz', async () => {
    const e = openEditor([250, 500, 750], 'flOz');

    await e.retype(2, '170');

    expect(e.sheet.getByText('Enter more than 0, up to 169 fl oz.')).toBeVisible();
    expect(e.save()).toBeDisabled();
  });

  it('takes digits only in ml, five at most', async () => {
    const e = openEditor([250, 500, 750], 'ml');

    await e.retype(0, '2a5.0');
    expect(e.texts()[0]).toBe('250');
    await e.retype(0, '123456');
    expect(e.texts()[0]).toBe('12345');
  });

  it('stores the amounts smallest first', async () => {
    const e = openEditor([250, 500, 750], 'ml');

    await e.retype(0, '900');
    await e.user.click(e.save());

    expect(e.onSave).toHaveBeenCalledWith([500, 750, 900]);
  });

  it('resets to 250, 500 and 750 ml, which then save exactly in fl oz', async () => {
    const e = openEditor([100, 200, 300], 'flOz');
    await e.retype(0, '');

    await e.user.click(e.sheet.getByRole('button', { name: words.reset }));

    expect(e.texts()).toEqual(['8.5', '16.9', '25.4']);
    expect(e.save()).toBeEnabled();
    await e.user.click(e.save());
    expect(e.onSave).toHaveBeenCalledWith([250, 500, 750]);
  });

  it('stores nothing on Cancel', async () => {
    const e = openEditor([250, 500, 750], 'ml');

    await e.retype(0, '300');
    await e.user.click(e.sheet.getByRole('button', { name: common.common.cancel }));

    expect(e.onClose).toHaveBeenCalledTimes(1);
    expect(e.onSave).not.toHaveBeenCalled();
  });
});
