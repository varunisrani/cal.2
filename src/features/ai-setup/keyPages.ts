/**
 * Where each provider's API keys are made: the vendor's own page (a third-party address, as each
 * vendor publishes it) and the catalogue key naming that place. Ollama takes no key and a Custom
 * server has no common page, so neither has an entry.
 */
import type { ProviderId } from '../../ai/catalog/providers';
import type { TKey } from '../../i18n/t';

export interface KeyPage {
  readonly url: string;
  readonly place: TKey;
}

export const KEY_PAGES: Readonly<Partial<Record<ProviderId, KeyPage>>> = {
  gemini: { url: 'https://aistudio.google.com/apikey', place: 'aiSetup.key.places.gemini' },
  openai: { url: 'https://platform.openai.com/api-keys', place: 'aiSetup.key.places.openai' },
  anthropic: {
    url: 'https://console.anthropic.com/settings/keys',
    place: 'aiSetup.key.places.anthropic',
  },
  xai: { url: 'https://console.x.ai', place: 'aiSetup.key.places.xai' },
  openrouter: {
    url: 'https://openrouter.ai/settings/keys',
    place: 'aiSetup.key.places.openrouter',
  },
  together: {
    url: 'https://api.together.ai/settings/api-keys',
    place: 'aiSetup.key.places.together',
  },
  groq: { url: 'https://console.groq.com/keys', place: 'aiSetup.key.places.groq' },
  huggingface: {
    url: 'https://huggingface.co/settings/tokens',
    place: 'aiSetup.key.places.huggingface',
  },
  fireworks: {
    url: 'https://fireworks.ai/account/api-keys',
    place: 'aiSetup.key.places.fireworks',
  },
  deepinfra: { url: 'https://deepinfra.com/dash/api_keys', place: 'aiSetup.key.places.deepinfra' },
  mistral: { url: 'https://console.mistral.ai/api-keys', place: 'aiSetup.key.places.mistral' },
  deepseek: {
    url: 'https://platform.deepseek.com/api_keys',
    place: 'aiSetup.key.places.deepseek',
  },
  qwen: { url: 'https://modelstudio.console.alibabacloud.com', place: 'aiSetup.key.places.qwen' },
  cerebras: { url: 'https://cloud.cerebras.ai', place: 'aiSetup.key.places.cerebras' },
};
