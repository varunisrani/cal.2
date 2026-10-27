// Security review (P10-09): an API key never travels in an address, never goes to another provider,
// and never comes back in a failure's detail or message. Every provider gets a planted key; the
// requests of every provider (food and Coach wires) are built and searched; then a photo request
// on each wire format fails on its primary and on its standby with error bodies that echo every
// key, and the failure, the messages we would show and the console are searched.
import { describe, expect, it } from 'vitest';
import { anthropicAdapter } from './adapters/anthropic';
import { geminiAdapter } from './adapters/gemini';
import { openAiCompatAdapter } from './adapters/openaiCompat';
import type { Adapter } from './adapters/request';
import { PROVIDER_IDS, PROVIDERS, type ProviderId, type WireFormat } from './catalog/providers';
import { defaultModel } from './catalog/presets';
import { chatWireFor } from './chat/round';
import { failureMessages } from './errors';
import type { ImageBackend } from './image';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './settings';
import { analyzePhotos } from './tasks/food';
import { fakeFetch } from './testing/fakeFetch';
import { anthropicError, geminiError, openAiError } from './testing/wire';
import { t } from '../i18n/t';
import {
  PLANTED_KEYS,
  describeValue,
  plantedIn,
  plantedProviderKeys,
  recordConsole,
} from '../test/plantedKeys';

const ADAPTERS: Readonly<Record<WireFormat, Adapter>> = {
  gemini: geminiAdapter,
  openai: openAiCompatAdapter,
  anthropic: anthropicAdapter,
};

/** Where each provider is reached in these tests: its own address, or a server of the person's. */
function baseUrlOf(id: ProviderId): string {
  if (id === 'ollama') return 'http://localhost:11434/v1';
  if (id === 'custom') return 'https://models.example.org/v1';
  return PROVIDERS[id].baseUrl;
}

/** The slots a request may carry: its own provider's, when that provider takes a key. */
function ownSlot(id: ProviderId): string[] {
  return PROVIDERS[id].key === 'none' ? [] : [id];
}

describe('requests: a key goes only in its own provider’s header (P10-09, D-16.7)', () => {
  it.each(PROVIDER_IDS)('builds %s food and Coach requests with no key in the address', (id) => {
    const key = PROVIDERS[id].key === 'none' ? undefined : PLANTED_KEYS[id];
    const food = ADAPTERS[PROVIDERS[id].format].build({
      provider: id,
      baseUrl: baseUrlOf(id),
      model: defaultModel(id, 'image') || 'some-model',
      key,
      system: 'Read the photo.',
      prompt: 'What is on the plate?',
      images: ['/9j/AAAA'],
      json: true,
      maxTokens: 1024,
    });
    const wire = chatWireFor(id);
    const chat = wire.build(
      {
        provider: id,
        baseUrl: baseUrlOf(id),
        model: defaultModel(id, 'text') || 'some-model',
        key,
        system: 'You are a coach.',
        tools: [],
        maxTokens: 1024,
      },
      wire.open({ history: [], text: 'How did I do today?' }),
      false,
    );

    for (const request of [food, chat]) {
      expect(plantedIn(request.url)).toEqual([]);
      expect(plantedIn(describeValue(request.init.body))).toEqual([]);
      expect(plantedIn(describeValue(request.init.headers))).toEqual(ownSlot(id));
    }
  });
});

/** Every photo decodes as 1 200 × 900 and encodes to a few JPEG bytes. */
const backend: ImageBackend = {
  decode: () =>
    Promise.resolve({
      width: 1200,
      height: 900,
      toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1)),
      close: () => undefined,
    }),
};

const PHOTO = new Blob([Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 2, 3)], { type: 'image/jpeg' });

/** The worst a provider could send back: every AI key in its error text. */
const ECHO = `Key refused. Keys seen: ${Object.values(plantedProviderKeys()).join(' / ')}.`;

const GEMINI = /generativelanguage\.googleapis\.com/;
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

function photoSettings(primary: ProviderId, standby: ProviderId): AiSettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    primary: { provider: primary, model: defaultModel(primary, 'image') },
    imageStandby: { on: true, provider: standby, model: defaultModel(standby, 'image') },
  };
}

function refusingFetch() {
  return fakeFetch()
    .on(GEMINI, {
      status: 400,
      json: geminiError(400, 'INVALID_ARGUMENT', `API key not valid. ${ECHO}`),
    })
    .on(MISTRAL, { status: 401, json: openAiError(ECHO) })
    .on(OPENAI, { status: 200, json: { error: { message: ECHO } } })
    .on(ANTHROPIC, { status: 401, json: anthropicError('authentication_error', ECHO) });
}

describe('failures: no key in a detail or a message (P10-09, R03.18, D-16.31)', () => {
  it.each([
    ['gemini', 'openai'],
    ['anthropic', 'gemini'],
    ['mistral', 'anthropic'],
    ['openai', 'mistral'],
  ] as const)(
    'a photo request on %s, then its standby %s, both echoing every key',
    async (primary, standby) => {
      const logged = recordConsole();
      const fake = refusingFetch();

      const result = await analyzePhotos(
        { images: [PHOTO] },
        {
          settings: photoSettings(primary, standby),
          keys: plantedProviderKeys(),
          fetch: fake.fetch,
          imageBackend: backend,
        },
      );

      if (result.ok) throw new Error('the request should have failed');
      expect(fake.requests).toHaveLength(2);
      expect(fake.requests.map((request) => plantedIn(describeValue(request.headers)))).toEqual([
        [primary],
        [standby],
      ]);
      const failure = result.error;
      expect(failure.kind).toBe('bothFailed');
      // The provider's words are kept for a Details view, with the keys cut out.
      expect(describeValue(failure)).toContain('Key refused.');
      expect(plantedIn(describeValue(failure))).toEqual([]);
      const shown = failureMessages(failure).map((message) => t(message.key, message.params));
      expect(shown.length).toBeGreaterThan(0);
      expect(shown.join('\n')).not.toContain('Key refused');
      expect(plantedIn(shown.join('\n'))).toEqual([]);
      expect(plantedIn(logged.calls().join('\n'))).toEqual([]);
    },
  );
});
