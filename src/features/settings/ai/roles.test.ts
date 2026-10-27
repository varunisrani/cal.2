import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../../ai/settings';
import type { AiChoice } from '../../../services/aiSetup';
import {
  avoidDuplicate,
  backedRole,
  hiddenModel,
  isDuplicate,
  roleChoice,
  serversFor,
  usesOpenRouter,
  wholeNumber,
} from './roles';

const OLLAMA_HOME = 'https://ollama.home.example/v1';
const OLLAMA_LAPTOP = 'http://localhost:11434/v1';

const settings: AiSettings = {
  ...DEFAULT_AI_SETTINGS,
  primary: { provider: 'ollama', model: 'gemma4' },
  textRole: { on: false, provider: 'groq', model: 'openai/gpt-oss-120b' },
  imageStandby: { on: true, provider: 'ollama', model: 'qwen3.5' },
  endpoints: { ollama: { main: OLLAMA_HOME, standby: OLLAMA_LAPTOP } },
};

const choice = (fields: Partial<AiChoice>): AiChoice => ({
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  serverUrl: '',
  key: '',
  ...fields,
});

describe('roleChoice and serversFor', () => {
  it('starts each card from its own address slot', () => {
    expect(roleChoice(settings, 'primary')).toEqual(
      choice({ provider: 'ollama', model: 'gemma4', serverUrl: OLLAMA_HOME }),
    );
    expect(roleChoice(settings, 'imageStandby')).toEqual(
      choice({ provider: 'ollama', model: 'qwen3.5', serverUrl: OLLAMA_LAPTOP }),
    );
    expect(serversFor(settings, 'textRole')).toEqual({ ollama: OLLAMA_HOME });
    expect(serversFor(settings, 'textStandby')).toEqual({ ollama: OLLAMA_LAPTOP });
  });
});

describe('backedRole', () => {
  it('has the photo standby back the primary, and the text standby the role serving text', () => {
    expect(backedRole(settings, 'imageStandby')).toEqual({
      provider: 'ollama',
      model: 'gemma4',
      baseUrl: OLLAMA_HOME,
    });
    expect(backedRole(settings, 'textStandby')).toEqual({
      provider: 'ollama',
      model: 'gemma4',
      baseUrl: OLLAMA_HOME,
    });
    const textOn = { ...settings, textRole: { ...settings.textRole, on: true } };
    expect(backedRole(textOn, 'textStandby')).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
    });
  });
});

describe('a standby that repeats the role it backs (R03.5)', () => {
  const backed = backedRole(DEFAULT_AI_SETTINGS, 'imageStandby');

  it('hides the backed model on the same provider and server only', () => {
    expect(hiddenModel(choice({}), backed)).toBe('gemini-3.5-flash-lite');
    expect(hiddenModel(choice({ provider: 'openai', model: 'gpt-6-luna' }), backed)).toBe(
      undefined,
    );
  });

  it('counts the same model at another address as a real backup', () => {
    const home = backedRole(settings, 'imageStandby');
    const sameModel = choice({ provider: 'ollama', model: 'gemma4' });
    expect(isDuplicate({ ...sameModel, serverUrl: `${OLLAMA_HOME}/` }, home)).toBe(true);
    expect(isDuplicate({ ...sameModel, serverUrl: OLLAMA_LAPTOP }, home)).toBe(false);
    expect(hiddenModel({ ...sameModel, serverUrl: OLLAMA_LAPTOP }, home)).toBeUndefined();
  });

  it('moves a duplicate to the provider’s next preset, and leaves one with no other preset', () => {
    expect(avoidDuplicate(choice({}), backed, 'image').model).toBe('gemini-3.8-flash');
    const other = choice({ model: 'gemini-4-argon' });
    expect(avoidDuplicate(other, backed, 'image')).toBe(other);

    // Groq lists one model for photos, so a photo standby there cannot move.
    const groqBacked = {
      provider: 'groq',
      model: 'qwen/qwen3.8-27b',
      baseUrl: 'https://api.groq.com/openai/v1',
    } as const;
    const onlyOne = choice({ provider: 'groq', model: 'qwen/qwen3.8-27b' });
    expect(avoidDuplicate(onlyOne, groqBacked, 'image')).toBe(onlyOne);
    expect(avoidDuplicate(onlyOne, groqBacked, 'text').model).toBe('openai/gpt-oss-120b');
  });
});

describe('usesOpenRouter', () => {
  const choices = {
    primary: choice({}),
    textRole: choice({}),
    imageStandby: choice({}),
    textStandby: choice({ provider: 'openrouter', model: 'openai/gpt-6-luna' }),
  };

  it('counts a role only while it is on (the primary always is)', () => {
    const off = { textRole: false, imageStandby: false, textStandby: false };
    expect(usesOpenRouter(choices, off)).toBe(false);
    expect(usesOpenRouter(choices, { ...off, textStandby: true })).toBe(true);
    expect(
      usesOpenRouter(
        { ...choices, primary: choice({ provider: 'openrouter', model: 'x/y' }) },
        off,
      ),
    ).toBe(true);
  });
});

describe('wholeNumber', () => {
  it('reads digits only', () => {
    expect(wholeNumber(' 240 ')).toBe(240);
    expect(wholeNumber('0')).toBe(0);
    expect(wholeNumber('')).toBeNull();
    expect(wholeNumber('2.5')).toBeNull();
    expect(wholeNumber('-30')).toBeNull();
    expect(wholeNumber('ten')).toBeNull();
  });
});
