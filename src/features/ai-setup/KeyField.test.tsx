import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '../../ai/catalog/providers';
import { aiSetup } from '../../i18n/en/aiSetup';
import { KeyField, type KeyFieldProps } from './KeyField';

const words = aiSetup.aiSetup.key;

function renderKey(props: Partial<KeyFieldProps> & { provider?: ProviderId } = {}) {
  const onChange = vi.fn();
  render(
    <KeyField
      provider="gemini"
      value=""
      onChange={onChange}
      savedMask={null}
      missing={false}
      data-ui="test.key"
      {...props}
    />,
  );
  return { onChange };
}

describe('KeyField', () => {
  it('takes the key as hidden text and hands on what is pasted', async () => {
    const user = userEvent.setup();
    const { onChange } = renderKey();

    const input = screen.getByLabelText(words.label);
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
    await user.click(input);
    await user.paste('AIza-pasted');
    expect(onChange).toHaveBeenLastCalledWith('AIza-pasted');
  });

  it('shows a saved key masked, never whole, and offers to replace it (ACC-E14-1)', () => {
    renderKey({ savedMask: 'AIza…0dF4' });

    expect(screen.getByText('Saved key: AIza…0dF4')).toBeVisible();
    expect(screen.getByLabelText(words.label)).toHaveValue('');
    expect(screen.getByLabelText(words.label)).toHaveAccessibleDescription(words.replace);
  });

  it('asks for the key when a needed one is missing', () => {
    renderKey({ missing: true });
    expect(screen.getByText(words.missing)).toBeVisible();
  });

  it("names where the provider's keys are made, with a link that opens apart", () => {
    renderKey({ provider: 'groq' });

    const link = screen.getByRole('link', { name: 'Get a key from the GroqCloud console' });
    expect(link).toHaveAttribute('href', 'https://console.groq.com/keys');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('says in one line that the key stays on this device and goes only to the provider (D-16.7)', () => {
    renderKey({ provider: 'anthropic' });
    expect(
      screen.getByText(
        'Your key stays in this browser on this device and is sent only to Anthropic.',
      ),
    ).toBeVisible();
  });

  it('marks the key optional for a Custom server, with no key page', () => {
    renderKey({ provider: 'custom' });

    expect(screen.getByLabelText(words.labelOptional)).toHaveAccessibleDescription(words.optional);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
