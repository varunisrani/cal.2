/**
 * Streamed replies in the three wire formats the Coach reads (D-16.106), as the vendors write them
 * on the wire: Anthropic's named `messages` events, OpenAI-compatible `chat.completion.chunk` lines
 * ending in `[DONE]`, and Gemini's `streamGenerateContent?alt=sse` responses. Field names, event
 * names and the shape of each piece are the vendors' (protocol facts); every text, id and number
 * is ours. A builder gives the events in order, one string each, so a test can drop the end (a cut
 * stream) or put an error in; `streamOf` joins them and `piecesOf` cuts the text anywhere, for
 * `fakeFetch`'s `chunks`.
 */
import type { FakeChunk, FakeReply } from './fakeFetch';
import type { Json, JsonObject } from './wire';

const MODEL = 'test-model';

/** One event as written on the wire: an optional `event:` line, the data, a blank line. */
export function sseEvent(data: Json | string, event?: string): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return `${event === undefined ? '' : `event: ${event}\n`}data: ${text}\n\n`;
}

/** The whole stream's text. */
export function streamOf(events: readonly string[]): string {
  return events.join('');
}

/** `text` cut into pieces of `size` characters (the last may be shorter). */
export function piecesOf(text: string, size: number): string[] {
  const pieces: string[] = [];
  for (let at = 0; at < text.length; at += size) pieces.push(text.slice(at, at + size));
  return pieces;
}

export interface StreamReplyOptions {
  /** Characters per piece; the whole stream in one piece when left out. */
  readonly pieceSize?: number;
  /** The wait before each piece. */
  readonly delayMs?: number;
  /** The connection breaks after the last piece. */
  readonly breakAtEnd?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
}

/** A 200 reply sending `events` as a stream, for `fakeFetch().on(url, reply)`. */
export function streamReply(
  events: readonly string[],
  options: StreamReplyOptions = {},
): FakeReply {
  const text = streamOf(events);
  const pieces = options.pieceSize === undefined ? [text] : piecesOf(text, options.pieceSize);
  const chunks: FakeChunk[] = pieces.map((piece) => ({
    text: piece,
    ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
  }));
  if (options.breakAtEnd) chunks.push({ fail: 'network' });
  return { chunks, ...(options.headers === undefined ? {} : { headers: options.headers }) };
}

// --- OpenAI-compatible ---------------------------------------------------------------------

/** One `chat.completion.chunk` with this delta and finish reason. */
export function openAiChunk(delta: JsonObject, finishReason: string | null = null): string {
  return sseEvent({
    id: 'chatcmpl-stream-1',
    object: 'chat.completion.chunk',
    created: 1793000000,
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

/** The stream's last line. */
export const OPENAI_DONE = sseEvent('[DONE]');

export interface OpenAiStreamOptions {
  /** `stop` by default; `length` marks a cut-off answer. */
  readonly finishReason?: string;
  /** Reasoning pieces sent before the text, as `delta.reasoning`. */
  readonly reasoning?: readonly string[];
}

/** A streamed answer: the role, one chunk per text piece, the finish, `[DONE]`. */
export function openAiTextStream(
  pieces: readonly string[],
  options: OpenAiStreamOptions = {},
): string[] {
  return [
    openAiChunk({ role: 'assistant', content: '' }),
    ...(options.reasoning ?? []).map((reasoning) => openAiChunk({ reasoning })),
    ...pieces.map((content) => openAiChunk({ content })),
    openAiChunk({}, options.finishReason ?? 'stop'),
    OPENAI_DONE,
  ];
}

/** One tool call as a stream sends it: its arguments in pieces. */
export interface StreamedCall {
  readonly id?: string;
  readonly name: string;
  readonly argPieces: readonly string[];
}

/**
 * A streamed tool round: any text first, then each call's first piece (index, id, name) and its
 * argument pieces, then the finish (`tool_calls` by default) and `[DONE]`.
 */
export function openAiToolStream(
  calls: readonly StreamedCall[],
  options: { readonly text?: readonly string[]; readonly finishReason?: string } = {},
): string[] {
  return [
    openAiChunk({ role: 'assistant', content: null }),
    ...(options.text ?? []).map((content) => openAiChunk({ content })),
    ...calls.flatMap((call, index) => [
      openAiChunk({
        tool_calls: [
          {
            index,
            ...(call.id === undefined ? {} : { id: call.id }),
            type: 'function',
            function: { name: call.name, arguments: '' },
          },
        ],
      }),
      ...call.argPieces.map((piece) =>
        openAiChunk({ tool_calls: [{ index, function: { arguments: piece } }] }),
      ),
    ]),
    openAiChunk({}, options.finishReason ?? 'tool_calls'),
    OPENAI_DONE,
  ];
}

// --- Anthropic -----------------------------------------------------------------------------

const anthropic = (type: string, body: JsonObject): string => sseEvent({ type, ...body }, type);

/** `message_start`, as the stream opens. */
export function anthropicStart(): string {
  return anthropic('message_start', {
    message: {
      id: 'msg_stream_1',
      type: 'message',
      role: 'assistant',
      model: MODEL,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1204, output_tokens: 2 },
    },
  });
}

export const ANTHROPIC_PING = anthropic('ping', {});

/** `message_delta` with the stop reason, then `message_stop`. */
export function anthropicEnd(stopReason: string): string[] {
  return [
    anthropic('message_delta', {
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 61 },
    }),
    anthropic('message_stop', {}),
  ];
}

/** A text block at `index`: its start, one delta per piece, its stop. */
export function anthropicTextBlock(index: number, pieces: readonly string[]): string[] {
  return [
    anthropic('content_block_start', { index, content_block: { type: 'text', text: '' } }),
    ...pieces.map((text) =>
      anthropic('content_block_delta', { index, delta: { type: 'text_delta', text } }),
    ),
    anthropic('content_block_stop', { index }),
  ];
}

/** A thinking block at `index`, with its signature last. */
export function anthropicThinkingBlock(index: number, pieces: readonly string[]): string[] {
  return [
    anthropic('content_block_start', {
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    }),
    ...pieces.map((thinking) =>
      anthropic('content_block_delta', { index, delta: { type: 'thinking_delta', thinking } }),
    ),
    anthropic('content_block_delta', {
      index,
      delta: { type: 'signature_delta', signature: 'c2lnLXN0cmVhbQ==' },
    }),
    anthropic('content_block_stop', { index }),
  ];
}

/** A `tool_use` block at `index`, its input in `input_json_delta` pieces. */
export function anthropicToolBlock(index: number, call: StreamedCall): string[] {
  return [
    anthropic('content_block_start', {
      index,
      content_block: {
        type: 'tool_use',
        ...(call.id === undefined ? {} : { id: call.id }),
        name: call.name,
        input: {},
      },
    }),
    ...call.argPieces.map((partial_json) =>
      anthropic('content_block_delta', {
        index,
        delta: { type: 'input_json_delta', partial_json },
      }),
    ),
    anthropic('content_block_stop', { index }),
  ];
}

/** A streamed answer: start, ping, an optional thinking block, the text, the stop. */
export function anthropicTextStream(
  pieces: readonly string[],
  options: { readonly stopReason?: string; readonly thinking?: readonly string[] } = {},
): string[] {
  const thinking = options.thinking;
  return [
    anthropicStart(),
    ANTHROPIC_PING,
    ...(thinking === undefined ? [] : anthropicThinkingBlock(0, thinking)),
    ...anthropicTextBlock(thinking === undefined ? 0 : 1, pieces),
    ...anthropicEnd(options.stopReason ?? 'end_turn'),
  ];
}

/** An `error` event, e.g. `anthropicErrorEvent('overloaded_error', '…')`. */
export function anthropicErrorEvent(type: string, message: string): string {
  return sseEvent({ type: 'error', error: { type, message } }, 'error');
}

// --- Gemini --------------------------------------------------------------------------------

/** One `GenerateContentResponse` of the stream, with these parts and an optional finish. */
export function geminiChunk(parts: readonly JsonObject[], finishReason?: string): string {
  return sseEvent({
    candidates: [
      {
        content: { parts: [...parts], role: 'model' },
        ...(finishReason === undefined ? {} : { finishReason }),
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 1130, candidatesTokenCount: 12, totalTokenCount: 1142 },
    modelVersion: MODEL,
    responseId: 'gemini-stream-1',
  });
}

/** A streamed answer: thought parts first, one response per piece, the last with the finish. */
export function geminiTextStream(
  pieces: readonly string[],
  options: { readonly finishReason?: string; readonly thoughts?: readonly string[] } = {},
): string[] {
  const thoughts = (options.thoughts ?? []).map((text) => geminiChunk([{ text, thought: true }]));
  const last = pieces.length - 1;
  return [
    ...thoughts,
    ...pieces.map((text, index) =>
      geminiChunk([{ text }], index === last ? (options.finishReason ?? 'STOP') : undefined),
    ),
  ];
}
