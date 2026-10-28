/**
 * A Coach round's streamed reply on Anthropic's `messages` format (D-16.106). The reply comes as
 * named events: `message_start`, then for each content block a `content_block_start`, its
 * `content_block_delta`s (`text_delta` for text, `input_json_delta` for a tool's arguments in
 * pieces, `thinking_delta` and `signature_delta` for thinking) and a `content_block_stop`; then
 * `message_delta` with the stop reason and `message_stop`. `ping` keeps the line open and `error`
 * reports a failure mid-stream. The reply is the one `read` gives for a whole answer: a
 * `max_tokens` stop is cut off, `tool_use` blocks win over text. Thinking is never shown, but its
 * blocks go back with a tool round's echo, as a thinking model needs them.
 */
import { cutOff, isRecord, unusable, type JsonRecord } from '../adapters/request';
import { fromReply, type ReplyContext, type SingleFailure } from '../errors';
import { err, ok, type Result } from '../../lib/result';
import type { SseEvent } from './sse';
import {
  CUT_STREAM,
  argumentsOf,
  callId,
  toolName,
  type RoundReply,
  type RoundStream,
  type ToolCall,
} from './types';

/**
 * The HTTP status Anthropic gives each error type, so an error inside a stream is classified as
 * the same error before it would be (an overload mid-reply reads as overloaded).
 */
const ERROR_STATUS: Readonly<Record<string, number>> = {
  invalid_request_error: 400,
  authentication_error: 401,
  billing_error: 402,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  overloaded_error: 529,
};

/** One content block as its events arrive: the start's fields, the pieces joined. */
interface Block {
  readonly start: JsonRecord;
  text: string;
  thinking: string;
  signature: string;
  json: string;
}

/** The failure an `error` event reports: classified by its type, with status 0. */
function streamFailure(body: JsonRecord, data: string, context: ReplyContext): SingleFailure {
  const type = isRecord(body.error) ? body.error.type : undefined;
  const status = typeof type === 'string' ? (ERROR_STATUS[type] ?? 0) : 0;
  return { ...fromReply(status, data, context), status: 0 };
}

export function anthropicStream(context: ReplyContext = {}): RoundStream {
  const blocks = new Map<number, Block>();
  let stopReason: string | undefined;
  let stopped = false;
  let failure: SingleFailure | undefined;

  function blockAt(index: unknown, kind: string): Block | undefined {
    if (typeof index !== 'number') return undefined;
    let block = blocks.get(index);
    // A delta whose start was missed opens its block.
    if (block === undefined) {
      block = { start: { type: kind }, text: '', thinking: '', signature: '', json: '' };
      blocks.set(index, block);
    }
    return block;
  }

  function takeDelta(index: unknown, delta: JsonRecord): void {
    const piece = (field: string): string => {
      const value = delta[field];
      return typeof value === 'string' ? value : '';
    };
    switch (delta.type) {
      case 'text_delta': {
        const block = blockAt(index, 'text');
        if (block) block.text += piece('text');
        break;
      }
      case 'input_json_delta': {
        const block = blockAt(index, 'tool_use');
        if (block) block.json += piece('partial_json');
        break;
      }
      case 'thinking_delta': {
        const block = blockAt(index, 'thinking');
        if (block) block.thinking += piece('thinking');
        break;
      }
      case 'signature_delta': {
        const block = blockAt(index, 'thinking');
        if (block) block.signature += piece('signature');
        break;
      }
      default:
        break;
    }
  }

  function take(event: SseEvent): void {
    if (failure !== undefined || stopped) return;
    let body: unknown;
    try {
      body = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isRecord(body)) return;
    const type = typeof body.type === 'string' ? body.type : event.event;
    switch (type) {
      case 'content_block_start':
        if (typeof body.index === 'number' && isRecord(body.content_block)) {
          const start = body.content_block;
          blocks.set(body.index, {
            start,
            text: typeof start.text === 'string' ? start.text : '',
            thinking: typeof start.thinking === 'string' ? start.thinking : '',
            signature: typeof start.signature === 'string' ? start.signature : '',
            json: '',
          });
        }
        break;
      case 'content_block_delta':
        if (isRecord(body.delta)) takeDelta(body.index, body.delta);
        break;
      case 'message_delta':
        if (isRecord(body.delta) && typeof body.delta.stop_reason === 'string') {
          stopReason = body.delta.stop_reason;
        }
        break;
      case 'message_stop':
        stopped = true;
        break;
      case 'error':
        failure = streamFailure(body, event.data, context);
        break;
      default:
        break;
    }
  }

  /** The blocks in their order. */
  function ordered(): Block[] {
    return [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
  }

  function text(): string {
    return ordered()
      .filter((block) => block.start.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  }

  /** A tool's input: its pieces read as one JSON object, else what the start gave, else `{}`. */
  function inputOf(block: Block): JsonRecord {
    if (block.json.trim() !== '') return argumentsOf(block.json);
    return isRecord(block.start.input) ? block.start.input : {};
  }

  /** A block as the whole reply would have held it. */
  function contentOf(block: Block): JsonRecord {
    switch (block.start.type) {
      case 'text':
        return { ...block.start, text: block.text };
      case 'thinking':
        return { ...block.start, thinking: block.thinking, signature: block.signature };
      case 'tool_use':
        return { ...block.start, input: inputOf(block) };
      default:
        return block.start;
    }
  }

  function finish(): Result<RoundReply, SingleFailure> {
    if (failure !== undefined) return err(failure);
    if (!stopped && stopReason === undefined) return err(CUT_STREAM);
    if (stopReason === 'max_tokens') return cutOff();

    const all = ordered();
    const uses = all.filter((block) => block.start.type === 'tool_use');
    if (uses.length > 0) {
      const calls: ToolCall[] = uses.flatMap((block) => {
        const id = callId(block.start.id);
        return id === undefined
          ? []
          : [{ id, name: toolName(block.start.name), args: inputOf(block) }];
      });
      // No call can be answered, so the next round could only be refused.
      if (calls.length === 0) return unusable();
      return ok({ kind: 'tools', calls, echo: { role: 'assistant', content: all.map(contentOf) } });
    }

    const answer = text();
    return answer === '' ? unusable() : ok({ kind: 'answer', text: answer });
  }

  return {
    take,
    text,
    done: () => stopped || failure !== undefined,
    finish,
  };
}
