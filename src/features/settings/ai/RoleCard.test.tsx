import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { presetsFor } from '../../../ai/catalog/presets';
import type { RoleName } from '../../../ai/settings';
import { aiSetup } from '../../../i18n/en/aiSetup';
import { common } from '../../../i18n/en/common';
import type { AiChoice, SavedChoice } from '../../../services/aiSetup';
import { until } from '../../../test/screenHarness';
import { withProvider } from '../../ai-setup/choice';
import { RoleCard, type RoleCardProps } from './RoleCard';
import type { BackedRole } from './roles';

const words = aiSetup.aiSetup;
const pageWords = words.page;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_KEY = 'sk-proj-4fA9xQ2mZ7bW1cR8tY5u';

/** The main provider as onboarding leaves it: Gemini with its default model. */
const GEMINI_MAIN: BackedRole = {
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  baseUrl: GEMINI_URL,
};

type Save = RoleCardProps['save'];

interface HarnessProps {
  readonly role: RoleName;
  readonly start: AiChoice;
  readonly backed?: BackedRole;
  /** Saved keys by provider, masked. */
  readonly masks?: Readonly<Record<string, string>>;
  readonly on?: boolean;
  readonly save?: Save;
  readonly onForget?: RoleCardProps['onForget'];
}

const stored: SavedChoice = { keyMask: null, missing: [] };

function Harness({
  role,
  start,
  backed,
  masks = {},
  on: startOn,
  save = vi.fn<Save>().mockResolvedValue(stored),
  onForget = vi.fn(),
}: HarnessProps) {
  const [value, setValue] = useState(start);
  const [on, setOn] = useState(startOn);
  return (
    <RoleCard
      role={role}
      value={value}
      onChange={setValue}
      on={on}
      onSwitch={on === undefined ? undefined : setOn}
      savedKeyMask={masks[value.provider] ?? null}
      savedServers={{}}
      backed={backed}
      save={save}
      onForget={onForget}
    />
  );
}

const providerPicker = () => screen.getByRole('combobox', { name: words.provider.label });
const modelPicker = () => screen.getByRole('combobox', { name: words.model.label });
const modelOptions = () =>
  within(modelPicker())
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('RoleCard', () => {
  it('does not offer a photo standby the main provider’s own model on the same server', () => {
    render(
      <Harness
        role="imageStandby"
        on
        start={{ ...withProvider('gemini', 'image'), model: 'gemini-3.8-flash' }}
        backed={GEMINI_MAIN}
        masks={{ gemini: 'AIza…0dF4' }}
      />,
    );

    expect(modelOptions()).toEqual(['gemini-3.8-flash', 'gemini-4-argon']);
    expect(modelPicker()).toHaveValue('gemini-3.8-flash');
    expect(screen.queryByText(pageWords.same)).toBeNull();
  });

  it('offers the same provider’s other model: picking it moves the standby to the next preset', async () => {
    const user = userEvent.setup();
    const save = vi.fn<Save>().mockResolvedValue(stored);
    render(
      <Harness
        role="imageStandby"
        on
        start={withProvider('openai', 'image')}
        backed={GEMINI_MAIN}
        masks={{ gemini: 'AIza…0dF4' }}
        save={save}
      />,
    );

    await user.selectOptions(providerPicker(), 'gemini');

    expect(modelPicker()).toHaveValue('gemini-3.8-flash');
    expect(modelOptions()).not.toContain('gemini-3.5-flash-lite');
    // Complete at once (the key is saved), so it is stored as shown.
    expect(save).toHaveBeenLastCalledWith('imageStandby', {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      serverUrl: '',
      key: '',
    });
  });

  it('lists every model when the standby reaches the same provider at another server', () => {
    render(
      <Harness
        role="textStandby"
        on
        start={{ ...withProvider('ollama', 'text'), serverUrl: 'http://localhost:11434/v1' }}
        backed={{ provider: 'ollama', model: 'gemma4', baseUrl: 'https://ollama.home.example/v1' }}
      />,
    );

    expect(modelOptions()).toEqual([...presetsFor('ollama', 'text'), words.model.other]);
  });

  it('says when a standby repeats the role it backs, so it would never be tried', () => {
    // Groq lists one photo model, so the standby cannot move off the main provider's.
    render(
      <Harness
        role="imageStandby"
        on
        start={withProvider('groq', 'image')}
        backed={{
          provider: 'groq',
          model: 'qwen/qwen3.8-27b',
          baseUrl: 'https://api.groq.com/openai/v1',
        }}
        masks={{ groq: 'gsk_…9x2Q' }}
      />,
    );

    expect(modelPicker()).toHaveValue('qwen/qwen3.8-27b');
    expect(screen.getByText(pageWords.same)).toBeVisible();
  });

  it('saves a change only once it is complete, and waits for a needed key', async () => {
    const user = userEvent.setup();
    const save = vi.fn<Save>().mockResolvedValue(stored);
    render(<Harness role="primary" start={withProvider('gemini', 'image')} save={save} />);
    expect(screen.getByText(pageWords.roles.primary.about)).toBeVisible();
    expect(screen.queryByRole('switch')).toBeNull();

    await user.selectOptions(providerPicker(), 'openai');
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText(pageWords.pending)).toBeVisible();

    await user.click(screen.getByLabelText(words.key.label));
    await user.paste(OPENAI_KEY);
    expect(save).toHaveBeenLastCalledWith('primary', {
      provider: 'openai',
      model: 'gpt-6-luna',
      serverUrl: '',
      key: OPENAI_KEY,
    });
    expect(screen.queryByText(pageWords.pending)).toBeNull();
  });

  it('shows a switched-off role as its switch alone, and its form once switched on', async () => {
    const user = userEvent.setup();
    render(<Harness role="textRole" on={false} start={withProvider('groq', 'text')} />);
    const toggle = screen.getByRole('switch', { name: pageWords.roles.textRole.switch });

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('combobox')).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    // A text role lists every provider, those without photos too.
    expect(within(providerPicker()).getAllByRole('option')).toHaveLength(16);
  });

  it('offers to forget a saved key, and Retry when a save fails', async () => {
    const user = userEvent.setup();
    const onForget = vi.fn();
    const save = vi.fn<Save>().mockRejectedValueOnce(new Error('disk full'));
    save.mockResolvedValue(stored);
    render(
      <Harness
        role="primary"
        start={withProvider('gemini', 'image')}
        masks={{ gemini: 'AIza…0dF4' }}
        save={save}
        onForget={onForget}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Forget the Gemini key' }));
    expect(onForget).toHaveBeenCalledWith('gemini');

    await user.selectOptions(modelPicker(), 'gemini-4-argon');
    await until(() => screen.queryByRole('alert') !== null);
    expect(screen.getByRole('alert')).toHaveTextContent(pageWords.saveFailed);
    await user.click(screen.getByRole('button', { name: common.common.retry }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      'primary',
      expect.objectContaining({ model: 'gemini-4-argon' }),
    );
  });
});
