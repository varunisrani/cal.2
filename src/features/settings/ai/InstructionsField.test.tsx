import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aiSetup } from '../../../i18n/en/aiSetup';
import { until } from '../../../test/screenHarness';
import { InstructionsField } from './InstructionsField';

const words = aiSetup.aiSetup.page.notes;
const saveFailed = aiSetup.aiSetup.page.saveFailed;

/** Stores like the service: trimmed. */
const trimmingSave = () => vi.fn((text: string) => Promise.resolve(text.trim()));

const notesBox = () => screen.getByRole('textbox', { name: words.label });
const saveButton = () => screen.getByRole('button', { name: words.save });

describe('InstructionsField', () => {
  it('saves the notes trimmed with the button, then shows them as stored (D-16.24)', async () => {
    const user = userEvent.setup();
    const onSave = trimmingSave();
    render(<InstructionsField saved="" onSave={onSave} />);
    expect(screen.getByText(words.off)).toBeVisible();

    await user.type(notesBox(), '\n  Vegetarian, no mushrooms.  ');
    expect(onSave).not.toHaveBeenCalled();
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith('\n  Vegetarian, no mushrooms.  ');
    await until(() => screen.queryByText(words.saved) !== null);
    expect(notesBox()).toHaveValue('Vegetarian, no mushrooms.');
    expect(saveButton()).toBeDisabled();
  });

  it('offers Save only when the trimmed text differs from what is stored', async () => {
    const user = userEvent.setup();
    render(<InstructionsField saved="Halal only." onSave={trimmingSave()} />);
    expect(notesBox()).toHaveValue('Halal only.');
    expect(saveButton()).toBeDisabled();

    await user.type(notesBox(), '   ');
    expect(saveButton()).toBeDisabled();
    await user.type(notesBox(), ' Big portions.');
    expect(saveButton()).toBeEnabled();
  });

  it('turns the notes off when saved blank', async () => {
    const user = userEvent.setup();
    const onSave = trimmingSave();
    render(<InstructionsField saved="Halal only." onSave={onSave} />);

    await user.clear(notesBox());
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledWith('');
    await until(() => screen.queryByText(words.off) !== null);
    expect(notesBox()).toHaveValue('');
  });

  it('says when the notes did not save, and keeps what was typed', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(() => Promise.reject(new Error('disk full')));
    render(<InstructionsField saved="" onSave={onSave} />);

    await user.type(notesBox(), 'Low sodium.');
    await user.click(saveButton());

    await until(() => screen.queryByRole('alert') !== null);
    expect(screen.getByRole('alert')).toHaveTextContent(saveFailed);
    expect(notesBox()).toHaveValue('Low sodium.');
    expect(saveButton()).toBeEnabled();
  });
});
