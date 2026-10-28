/**
 * One Coach round on the wire (04 §3.11–3.12). The round's request goes out on the shared retry
 * ladder inside the turn's deadline (D-16.23), with the per-attempt cap of the provider's kind
 * (D-16.60). A reply cut at the token limit is asked again once in compact form, and a second cut
 * is `truncated` (R04.18). Failures are values, never throws. The engine (P08-08) calls this once
 * per round and keeps the transcript; the standby gets a fresh transcript from its own wire.
 *
 * Every round asks for its reply as a stream (D-16.106) and hands the answer's text so far to
 * `onText` as it grows. A provider marked below is never asked to; a server that answers whole
 * anyway is read whole; and one that refuses to stream (a 4xx whose message names streaming) is
 * asked once more without it, which is remembered for that provider, address and model while the
 * app runs. A failure inside a stream is not retried: the standby or Retry starts afresh.
 */
import { keyOf } from '../adapters/request';
import { PROVIDERS, type ProviderId, type WireFormat } from '../catalog/providers';
import { attemptCapMs, type Deadline } from '../deadline';
import type { ReplyContext, SingleFailure } from '../errors';
import { withRetries } from '../retry';
import { send, type Reply } from '../transport';
import type { Result } from '../../lib/result';
import { anthropicChat } from './anthropicChat';
import { geminiChat } from './geminiChat';
import { openAiChat } from './openaiChat';
import { looksLikeEvents, parseEvents } from './sse';
import { sendStreamed } from './stream';
import type { ChatSetup, ChatWire, RoundReply, RoundStream, Transcript } from './types';

const CHAT_WIRES: Readonly<Record<WireFormat, ChatWire>> = {
  gemini: geminiChat,
  openai: openAiChat,
  anthropic: anthropicChat,
};

/** The chat wire for a provider's format. */
export function chatWireFor(provider: ChatSetup['provider']): ChatWire {
  return CHAT_WIRES[PROVIDERS[provider].format];
}

/**
 * Providers never asked to stream. Cerebras: its error replies carry no CORS header (R03.2), so a
 * refused stream would look like a network failure and could not be asked again whole.
 */
const NOT_STREAMED: ReadonlySet<ProviderId> = new Set<ProviderId>(['cerebras']);

/** Provider, address and model of the servers that refused to stream, while the app runs. */
const refusedStreams = new Set<string>();

function serverOf(setup: ChatSetup): string {
  return [setup.provider, setup.baseUrl.trim().replace(/\/+$/, ''), setup.model.trim()].join(' ');
}

/** Whether a round of `setup` asks for a stream. */
export function asksForStream(setup: ChatSetup): boolean {
  return !NOT_STREAMED.has(setup.provider) && !refusedStreams.has(serverOf(setup));
}

/** Forgets the servers that refused to stream (tests). */
export function forgetRefusedStreams(): void {
  refusedStreams.clear();
}

/** Statuses that never mean "this server does not stream". */
const NOT_A_REFUSAL: ReadonlySet<number> = new Set([401, 403, 404, 408, 429]);

/** A 4xx failure whose message names streaming: the server will not stream this request. */
function refusedStream(failure: SingleFailure): boolean {
  const { status, detail } = failure;
  if (status === undefined || status < 400 || status > 499 || NOT_A_REFUSAL.has(status)) {
    return false;
  }
  return /stream/i.test(detail ?? '');
}

export interface RoundDeps {
  /** Handed to `transport.send`; never the global one. */
  readonly fetch: typeof fetch;
  /** The turn's deadline: every round, retry and re-ask of one turn shares it. */
  readonly deadline: Deadline;
  /** Keys a provider's error text could echo; cut out of a failure's detail. */
  readonly secrets?: readonly string[];
  /**
   * The answer's text so far, trimmed, each time a streamed reply adds to it (D-16.106). Each
   * request starts again from its own first piece: the next round, the re-ask after a cut.
   */
  readonly onText?: (text: string) => void;
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

/** One request of the round, streamed unless the server will not, and its reply. */
async function exchange(
  wire: ChatWire,
  setup: ChatSetup,
  transcript: Transcript,
  compact: boolean,
  deps: RoundDeps,
): Promise<Result<RoundReply, SingleFailure>> {
  if (!asksForStream(setup)) return ask(wire, setup, transcript, compact, false, deps);
  const streamed = await ask(wire, setup, transcript, compact, true, deps);
  if (streamed.ok || !refusedStream(streamed.error)) return streamed;
  refusedStreams.add(serverOf(setup));
  return ask(wire, setup, transcript, compact, false, deps);
}

async function ask(
  wire: ChatWire,
  setup: ChatSetup,
  transcript: Transcript,
  compact: boolean,
  stream: boolean,
  deps: RoundDeps,
): Promise<Result<RoundReply, SingleFailure>> {
  const { deadline, onText } = deps;
  const context: ReplyContext = { secrets: deps.secrets ?? [] };
  const { url, init } = wire.build(setup, transcript, compact, stream);
  const options = {
    fetch: deps.fetch,
    provider: setup.provider,
    keySent: keyOf(setup) !== undefined,
  };
  const cap = (): number => attemptCapMs(deadline, PROVIDERS[setup.provider].selfHosted);
  if (!stream) {
    const reply = await withRetries(
      () => send(url, init, deadline, cap(), options),
      deadline,
      context,
    );
    return reply.ok ? readWhole(wire, reply.value, context) : reply;
  }

  let reader: RoundStream = wire.stream(context);
  const reply = await withRetries(
    () => {
      // Each attempt reads its own stream; only a reply that never streamed is retried.
      const own = wire.stream(context);
      reader = own;
      let shown = '';
      return sendStreamed(
        url,
        init,
        deadline,
        cap(),
        (event) => {
          own.take(event);
          const text = own.text();
          if (text !== shown) {
            shown = text;
            onText?.(text);
          }
          return !own.done();
        },
        options,
      );
    },
    deadline,
    context,
  );
  if (!reply.ok) return reply;
  return reply.value.streamed === true ? reader.finish() : readWhole(wire, reply.value, context);
}

/**
 * A reply read whole: by the wire's `read`, unless a successful body is plainly server-sent events
 * under another content type, which is read as the stream it is.
 */
function readWhole(
  wire: ChatWire,
  reply: Reply,
  context: ReplyContext,
): Result<RoundReply, SingleFailure> {
  if (!reply.ok || !looksLikeEvents(reply.body)) {
    return wire.read(reply.status, reply.body, context);
  }
  const reader = wire.stream(context);
  for (const event of parseEvents(reply.body)) {
    reader.take(event);
    if (reader.done()) break;
  }
  return reader.finish();
}
