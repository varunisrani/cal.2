import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { presetsFor } from '../../ai/catalog/presets';
import type { ProviderId } from '../../ai/catalog/providers';
import { aiSetup } from '../../i18n/en/aiSetup';
import { ModelPicker } from './ModelPicker';

const words = aiSetup.aiSetup.model;

function Harness({
  provider,
  start,
  onModel,
}: {
  provider: ProviderId;
  start: string;
  onModel?: (model: string) => void;
}) {
  const [model, setModel] = useState(start);
  return (
    <ModelPicker
      provider={provider}
      use="image"
      value={model}
      onChange={(next) => {
        setModel(next);
        onModel?.(next);
      }}
      missing={model.trim() === ''}
      data-ui="test.model"
    />
  );
}

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('ModelPicker', () => {
  it("lists a fixed-list provider's presets, default first, and nothing to type", async () => {
    const user = userEvent.setup();
    const onModel = vi.fn();
    render(<Harness provider="gemini" start="gemini-3.5-flash-lite" onModel={onModel} />);

    const select = screen.getByRole('combobox', { name: words.label });
    expect(optionTexts(select)).toEqual([...presetsFor('gemini', 'image')]);
    expect(select).toHaveValue('gemini-3.5-flash-lite');
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.selectOptions(select, 'gemini-3.8-flash');
    expect(onModel).toHaveBeenLastCalledWith('gemini-3.8-flash');
  });

  it('lets a free-form provider type any model id, such as an Ollama tag (R03.21)', async () => {
    const user = userEvent.setup();
    const onModel = vi.fn();
    render(<Harness provider="ollama" start="gemma4" onModel={onModel} />);

    const select = screen.getByRole('combobox', { name: words.label });
    expect(optionTexts(select)).toEqual([...presetsFor('ollama', 'image'), words.other]);
    await user.selectOptions(select, words.other);

    // The field starts from the current id, so a tag can be added to a preset.
    const field = screen.getByRole('textbox', { name: words.idLabel });
    expect(field).toHaveValue('gemma4');
    await user.type(field, ':27b');
    expect(onModel).toHaveBeenLastCalledWith('gemma4:27b');

    // Typing an id that is also a preset keeps the field open.
    await user.clear(field);
    await user.type(field, 'qwen3.5');
    expect(screen.getByRole('textbox', { name: words.idLabel })).toHaveValue('qwen3.5');
  });

  it('opens on the field when the saved id is not a preset', () => {
    render(<Harness provider="openrouter" start="mistralai/mistral-small-3.2" />);
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: words.label });
    expect(select.selectedOptions[0]).toHaveTextContent(words.other);
    expect(screen.getByRole('textbox', { name: words.idLabel })).toHaveValue(
      'mistralai/mistral-small-3.2',
    );
  });

  it('gives Custom only the field, and asks for a model while it is blank (R03.20)', async () => {
    const user = userEvent.setup();
    render(<Harness provider="custom" start="" />);

    expect(screen.queryByRole('combobox')).toBeNull();
    const field = screen.getByRole('textbox', { name: words.label });
    expect(screen.getByText(words.missing)).toBeVisible();

    await user.type(field, 'llama-3.3-70b');
    expect(screen.queryByText(words.missing)).toBeNull();
  });
});
