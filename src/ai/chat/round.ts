/**
 * One Coach round on the wire (04 §3.11–3.12). The round's request goes out on the shared retry
 * ladder inside the turn's deadline (D-16.23), with the per-attempt cap of the provider's kind
 * (D-16.60). A reply cut at the token limit is asked again once in compact form, and a second cut
 * is `truncated` (R04.18). Failures are values, never throws. The engine (P08-08) calls this once
 * per round and keeps the transcript; the standby gets a fresh transcript from its own wire.
 */
import { keyOf } from '../adapters/request';
import { PROVIDERS, type WireFormat } from '../catalog/providers';
import { attemptCapMs, type Deadline } from '../deadline';
import type { SingleFailure } from '../errors';
import { withRetries } from '../retry';
import { send } from '../transport';
import type { Result } from '../../lib/result';
import { anthropicChat } from './anthropicChat';
import { geminiChat } from './geminiChat';
import { openAiChat } from './openaiChat';
import type { ChatSetup, ChatWire, RoundReply, Transcript } from './types';

const CHAT_WIRES: Readonly<Record<WireFormat, ChatWire>> = {
  gemini: geminiChat,
  openai: openAiChat,
  anthropic: anthropicChat,
};

/** The chat wire for a provider's format. */
export function chatWireFor(provider: ChatSetup['provider']): ChatWire {
  return CHAT_WIRES[PROVIDERS[provider].format];
}

export interface RoundDeps {
  /** Handed to `transport.send`; never the global one. */
  readonly fetch: typeof fetch;
  /** The turn's deadline: every round, retry and re-ask of one turn shares it. */
  readonly deadline: Deadline;
  /** Keys a provider's error text could echo; cut out of a failure's detail. */
  readonly secrets?: readonly string[];
}

/** Sends one round of `transcript` and reads the reply, re-asking once after a cut. */
export async function askRound(
  wire: ChatWire,
  setup: ChatSetup,
  transcript: Transcript,
  deps: RoundDeps,
): Promise<Result<RoundReply, SingleFailure>> {
  const first = await exchange(wire, setup, transcript, false, deps);
  if (first.ok || first.error.kind !== 'truncated') return first;
  return exchange(wire, setup, transcript, true, deps);
}

async function exchange(
  wire: ChatWire,
  setup: ChatSetup,
  transcript: Transcript,
  compact: boolean,
  deps: RoundDeps,
): Promise<Result<RoundReply, SingleFailure>> {
  const { deadline } = deps;
  const context = { secrets: deps.secrets ?? [] };
  const { url, init } = wire.build(setup, transcript, compact);
  const reply = await withRetries(
    () =>
      send(url, init, deadline, attemptCapMs(deadline, PROVIDERS[setup.provider].selfHosted), {
        fetch: deps.fetch,
        provider: setup.provider,
        keySent: keyOf(setup) !== undefined,
      }),
    deadline,
    context,
  );
  if (!reply.ok) return reply;
  return wire.read(reply.value.status, reply.value.body, context);
}
