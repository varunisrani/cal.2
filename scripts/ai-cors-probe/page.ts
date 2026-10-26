/// <reference lib="dom" />
/**
 * The part of the CORS probe (P03-19) that runs inside the app's page. Vite bundles this file
 * into one classic script whose exports land on a global (`PROBE_GLOBAL` in `browser.ts`); the
 * Node side adds it to the page and calls `run` once per request. It builds the request with the
 * app's own adapter, sends it with the app's own transport and reads it with the adapter, so the
 * browser applies its CORS rules to exactly what the app would send. It returns facts only: never
 * the key, the body or the provider's text, which can echo part of the key.
 */
import { anthropicAdapter } from '../../src/ai/adapters/anthropic';
import { geminiAdapter } from '../../src/ai/adapters/gemini';
import { openAiCompatAdapter } from '../../src/ai/adapters/openaiCompat';
import type { Adapter } from '../../src/ai/adapters/request';
import { PROVIDERS, type ProviderId, type WireFormat } from '../../src/ai/catalog/providers';
import { attemptCapMs, startDeadline } from '../../src/ai/deadline';
import { readProviderMessage, type AiFailureKind } from '../../src/ai/errors';
import { send } from '../../src/ai/transport';

export interface PageRequest {
  readonly provider: ProviderId;
  readonly baseUrl: string;
  readonly model: string;
  /** Left out when no key is sent (Ollama, a Custom server without one). */
  readonly key?: string;
  /** Header names to drop from the adapter's request: the no-header control request. */
  readonly withoutHeaders?: readonly string[];
  readonly timeoutSeconds: number;
}

/** What one request gave, as the page saw it. */
export type PageOutcome =
  | {
      readonly kind: 'reply';
      /** The address called; the adapters never put a key in it. */
      readonly url: string;
      readonly status: number;
      readonly blankBody: boolean;
      /** Whether the body holds a message the app could read (JSON error fields or plain text). */
      readonly hasMessage: boolean;
      /** What the adapter made of the reply: `answer`, or the failure kind it classified. */
      readonly read: 'answer' | AiFailureKind;
    }
  | {
      readonly kind: 'noReply';
      readonly url: string;
      /** The transport's failure: `connection` for the browser's bare TypeError. */
      readonly failure: AiFailureKind;
    };

/** A request small enough to cost next to nothing; any answer will do. */
const PROMPT = 'Reply with one word: ready.';
const TOKEN_CAP = 32;

const ADAPTERS: Readonly<Record<WireFormat, Adapter>> = {
  gemini: geminiAdapter,
  openai: openAiCompatAdapter,
  anthropic: anthropicAdapter,
};

export async function run(request: PageRequest): Promise<PageOutcome> {
  const entry = PROVIDERS[request.provider];
  const adapter = ADAPTERS[entry.format];
  const wire = adapter.build({
    provider: request.provider,
    baseUrl: request.baseUrl,
    model: request.model,
    key: request.key,
    system: '',
    prompt: PROMPT,
    images: [],
    json: false,
    maxTokens: TOKEN_CAP,
  });
  const headers = new Headers(wire.init.headers);
  for (const name of request.withoutHeaders ?? []) headers.delete(name);

  const deadline = startDeadline({ timeoutSeconds: request.timeoutSeconds });
  try {
    const sent = await send(
      wire.url,
      { ...wire.init, headers },
      deadline,
      attemptCapMs(deadline, entry.selfHosted),
      { provider: request.provider, keySent: request.key !== undefined },
    );
    if (!sent.ok) return { kind: 'noReply', url: wire.url, failure: sent.error.kind };

    const { status, body } = sent.value;
    const read = adapter.read(status, body, {
      secrets: request.key === undefined ? [] : [request.key],
    });
    return {
      kind: 'reply',
      url: wire.url,
      status,
      blankBody: body.trim() === '',
      hasMessage: readProviderMessage(body) !== undefined,
      read: read.ok ? 'answer' : read.error.kind,
    };
  } finally {
    deadline.end();
  }
}
