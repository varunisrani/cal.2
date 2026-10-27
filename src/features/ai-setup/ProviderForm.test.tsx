import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { presetsFor } from '../../ai/catalog/presets';
import { aiSetup } from '../../i18n/en/aiSetup';
import type { AiChoice } from '../../services/aiSetup';
import { withProvider, type SavedServers } from './choice';
import { ProviderForm, type ProviderFormProps } from './ProviderForm';

const words = aiSetup.aiSetup;

interface HarnessProps {
  start?: AiChoice;
  savedKeyMask?: string | null;
  /** The saved key is still being read. */
  reading?: boolean;
  savedServers?: SavedServers;
  use?: ProviderFormProps['use'];
  onChoice?: (choice: AiChoice) => void;
}

function Harness({
  start = withProvider('gemini', 'image'),
  savedKeyMask = null,
  reading = false,
  savedServers,
  use,
  onChoice,
}: HarnessProps) {
  const [choice, setChoice] = useState(start);
  return (
    <ProviderForm
      value={choice}
      onChange={(next) => {
        setChoice(next);
        onChoice?.(next);
      }}
      savedKeyMask={reading ? undefined : savedKeyMask}
      savedServers={savedServers}
      use={use}
      data-ui="test.ai"
    />
  );
}

const providerPicker = () => screen.getByRole('combobox', { name: words.provider.label });
const modelPicker = () => screen.getByRole('combobox', { name: words.model.label });
const serverField = () => screen.queryByRole('textbox', { name: words.server.label });
const keyField = () => screen.queryByLabelText(words.key.label);

describe('ProviderForm', () => {
  it('groups the providers that read photos: cloud services, then your own server', () => {
    render(<Harness />);

    const groups = within(providerPicker()).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
      words.provider.cloud,
      words.provider.ownServer,
    ]);
    expect(within(groups[0]!).getAllByRole('option')).toHaveLength(12);
    expect(within(groups[0]!).queryByRole('option', { name: 'DeepSeek' })).toBeNull();
    expect(
      within(groups[1]!)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Ollama', 'Custom server']);
  });

  it('lists all sixteen for a text role', () => {
    render(<Harness use="text" />);
    expect(within(providerPicker()).getAllByRole('option')).toHaveLength(16);
  });

  it('shows Gemini with a key field and its presets, and asks for the key', () => {
    render(<Harness />);

    expect(providerPicker()).toHaveValue('gemini');
    expect(
      within(modelPicker())
        .getAllByRole<HTMLOptionElement>('option')
        .map((option) => option.value),
    ).toEqual([...presetsFor('gemini', 'image')]);
    expect(keyField()).toBeInTheDocument();
    expect(screen.getByText(words.key.missing)).toBeVisible();
    expect(serverField()).toBeNull();
  });

  it('shows Ollama with a server address and no key', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(providerPicker(), 'ollama');

    expect(serverField()).toHaveValue('http://localhost:11434/v1');
    expect(serverField()).toHaveAccessibleDescription(words.server.ollamaHelp);
    expect(keyField()).toBeNull();
    expect(screen.queryByText(words.key.missing)).toBeNull();
    expect(modelPicker()).toHaveValue('gemma4');
  });

  it('refuses http://10.0.0.2:11434/v1 and says why (ACC-E13-1, D-16.26, R03.3)', async () => {
    const user = userEvent.setup();
    render(<Harness start={withProvider('ollama', 'image')} />);

    const field = serverField()!;
    await user.clear(field);
    await user.type(field, 'http://10.0.0.2:11434/v1');

    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining(words.server.problem.plainHttp),
    );
    expect(screen.getByText(words.server.problem.plainHttp)).toBeVisible();

    await user.clear(field);
    await user.type(field, 'https://10.0.0.2:11434/v1');
    expect(field).not.toBeInvalid();
  });

  it('refuses http://[::1]:11434/v1 and suggests localhost or 127.0.0.1 (S-3, D-16.26)', async () => {
    const user = userEvent.setup();
    render(<Harness start={withProvider('ollama', 'image')} />);

    const field = serverField()!;
    await user.clear(field);
    await user.paste('http://[::1]:11434/v1');

    expect(field).toBeInvalid();
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining(words.server.problem.ipv6Loopback),
    );
    expect(screen.getByText(words.server.problem.ipv6Loopback)).toBeVisible();
  });

  it('accepts an Ollama address without /v1 with a hint to add it (R03.22)', async () => {
    const user = userEvent.setup();
    render(<Harness start={withProvider('ollama', 'image')} />);

    const field = serverField()!;
    await user.clear(field);
    await user.type(field, 'http://localhost:11434');

    expect(field).not.toBeInvalid();
    expect(field).toHaveAccessibleDescription(words.server.addV1);
  });

  it('asks Custom for its address and model, and makes its key optional (R03.20)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(providerPicker(), 'custom');

    expect(serverField()).toHaveValue('');
    expect(serverField()).not.toBeInvalid();
    expect(screen.getByText(words.server.missing)).toBeVisible();
    expect(screen.getByText(words.model.missing)).toBeVisible();
    expect(screen.getByLabelText(words.key.labelOptional)).toBeInTheDocument();
    expect(screen.queryByText(words.key.missing)).toBeNull();
  });

  it("resets the model to the new provider's default and drops a typed key", async () => {
    const user = userEvent.setup();
    const onChoice = vi.fn();
    render(<Harness onChoice={onChoice} />);

    await user.selectOptions(modelPicker(), 'gemini-3.8-flash');
    await user.type(keyField()!, 'AIza-typed');
    await user.selectOptions(providerPicker(), 'openai');

    expect(onChoice).toHaveBeenLastCalledWith({
      provider: 'openai',
      model: presetsFor('openai', 'image')[0],
      serverUrl: '',
      key: '',
    });
    expect(keyField()).toHaveValue('');
  });

  it('starts a server from the address saved for it', async () => {
    const user = userEvent.setup();
    render(<Harness savedServers={{ ollama: 'https://ollama.home.example/v1' }} />);

    await user.selectOptions(providerPicker(), 'ollama');
    expect(serverField()).toHaveValue('https://ollama.home.example/v1');
  });

  it('shows a saved key masked and asks for none (ACC-E14-1)', () => {
    render(<Harness savedKeyMask="AIza…0dF4" />);

    expect(screen.getByText('Saved key: AIza…0dF4')).toBeVisible();
    expect(screen.queryByText(words.key.missing)).toBeNull();
  });

  it('does not ask for a key while the saved one is still being read', () => {
    render(<Harness reading />);
    expect(screen.queryByText(words.key.missing)).toBeNull();
  });
});
