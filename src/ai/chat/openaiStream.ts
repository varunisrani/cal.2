/**
 * A Coach round's streamed reply on the OpenAI-compatible format (D-16.106). Each `data:` line is a
 * chunk whose first choice carries a `delta`: answer text in `content`, reasoning in `reasoning`,
 * `reasoning_content` or `reasoning_details`, and tool calls in pieces under `tool_calls`, each
 * piece naming its call by `index` (the id and name come first, the arguments in many pieces). A
 * chunk with a `finish_reason` ends the choice, and `[DONE]` ends the stream. The reply is the one
 * `read` gives for a whole answer: a `length` stop is cut off, tool calls win over text, a reply
 * that only reasoned is cut off, and an error inside the stream is classified like an error reply,
 * with status 0. The assistant message for a tool round is rebuilt from its pieces, reasoning
 * included, so it goes back as the model wrote it.
 */
import { cutOff, isRecord, joinTexts, unusable, type JsonRecord } from '../adapters/request';
import { carriesError, hasReasoning } from '../adapters/openaiCompat';
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

/** The stream's last line. */
const DONE = '[DONE]';

/** One tool call as its pieces arrive. */
interface CallPieces {
  id?: string;
  name: string;
  args: string;
}

/** Reasoning detail fields that come in pieces and are joined; every other field is kept. */
const JOINED_DETAIL_FIELDS = ['text', 'summary', 'data'];

/** Adds one `reasoning_details` piece to the entry of its `index` (a new entry without one). */
function mergeDetail(details: Record<string, unknown>[], piece: JsonRecord): void {
  const at =
    typeof piece.index === 'number' ? details.findIndex((d) => d.index === piece.index) : -1;
  const entry = at === -1 ? undefined : details[at];
  if (entry === undefined) {
    details.push({ ...piece });
    return;
  }
  for (const [field, value] of Object.entries(piece)) {
    const before = entry[field];
    entry[field] =
      JOINED_DETAIL_FIELDS.includes(field) &&
      typeof before === 'string' &&
      typeof value === 'string'
        ? before + value
        : value;
  }
}

export function openAiStream(context: ReplyContext = {}): RoundStream {
  let text = '';
  let reasoning = '';
  let reasoningContent = '';
  const details: Record<string, unknown>[] = [];
  /** The calls by their `index`, in the order they first came. */
  const calls = new Map<number, CallPieces>();
  let lastIndex: number | undefined;
  let finishReason: string | undefined;
  let ended = false;
  let failure: SingleFailure | undefined;

  /** The call a piece belongs to: its `index`; a new id opens a call; otherwise the last one. */
  function callFor(piece: JsonRecord): CallPieces {
    const id = callId(piece.id);
    let index: number;
    if (typeof piece.index === 'number') index = piece.index;
    else if (lastIndex === undefined || (id !== undefined && calls.get(lastIndex)?.id !== id)) {
      index = calls.size === 0 ? 0 : Math.max(...calls.keys()) + 1;
    } else index = lastIndex;
    lastIndex = index;
    let call = calls.get(index);
    if (call === undefined) {
      call = { name: '', args: '' };
      calls.set(index, call);
    }
    return call;
  }

  function takeCallPiece(piece: unknown): void {
    if (!isRecord(piece)) return;
    const call = callFor(piece);
    const id = callId(piece.id);
    if (call.id === undefined && id !== undefined) call.id = id;
    const fn = isRecord(piece.function) ? piece.function : {};
    // Some servers repeat the name in every piece: the first one counts.
    if (call.name === '' && typeof fn.name === 'string') call.name = fn.name;
    if (typeof fn.arguments === 'string') call.args += fn.arguments;
    else if (isRecord(fn.arguments)) call.args += JSON.stringify(fn.arguments);
  }

  function takeDelta(delta: JsonRecord): void {
    const { content } = delta;
    if (typeof content === 'string') text += content;
    else if (Array.isArray(content)) text += joinTexts(content);
    if (typeof delta.reasoning === 'string') reasoning += delta.reasoning;
    if (typeof delta.reasoning_content === 'string') reasoningContent += delta.reasoning_content;
    if (Array.isArray(delta.reasoning_details)) {
      for (const piece of delta.reasoning_details) if (isRecord(piece)) mergeDetail(details, piece);
    }
    if (Array.isArray(delta.tool_calls)) delta.tool_calls.forEach(takeCallPiece);
  }

  function take(event: SseEvent): void {
    if (failure !== undefined || ended) return;
    const data = event.data.trim();
    if (data === DONE) {
      ended = true;
      return;
    }
    let chunk: unknown;
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (!isRecord(chunk)) return;
    const choice: unknown = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
    if (choice === undefined && carriesError(chunk)) {
      failure = fromReply(0, data, context);
      return;
    }
    if (!isRecord(choice)) return;
    if (isRecord(choice.delta)) takeDelta(choice.delta);
    else if (isRecord(choice.message)) takeDelta(choice.message);
    if (typeof choice.finish_reason === 'string') {
      finishReason = choice.finish_reason;
      if (finishReason === 'error') failure = fromReply(0, data, context);
    }
  }

  /** The assistant message as the model wrote it, for the next round's transcript. */
  function echo(ordered: readonly CallPieces[]): JsonRecord {
    return {
      role: 'assistant',
      content: text === '' ? null : text,
      ...(reasoning === '' ? {} : { reasoning }),
      ...(reasoningContent === '' ? {} : { reasoning_content: reasoningContent }),
      ...(details.length === 0 ? {} : { reasoning_details: details }),
      tool_calls: ordered.map((call) => ({
        ...(call.id === undefined ? {} : { id: call.id }),
        type: 'function',
        function: { name: call.name, arguments: call.args },
      })),
    };
  }

  function finish(): Result<RoundReply, SingleFailure> {
    if (failure !== undefined) return err(failure);
    if (!ended && finishReason === undefined) return err(CUT_STREAM);
    if (finishReason === 'length') return cutOff();

    const ordered = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
    if (ordered.length > 0) {
      const answerable: ToolCall[] = ordered.flatMap((call) =>
        call.id === undefined
          ? []
          : [{ id: call.id, name: toolName(call.name), args: argumentsOf(call.args) }],
      );
      // No call can be answered, so the next round could only be refused.
      if (answerable.length === 0) return unusable();
      return ok({ kind: 'tools', calls: answerable, echo: echo(ordered) });
    }

    const answer = text.trim();
    if (answer !== '') return ok({ kind: 'answer', text: answer });
    const thought = { reasoning, reasoning_content: reasoningContent, reasoning_details: details };
    return hasReasoning(thought) ? cutOff() : unusable();
  }

  return {
    take,
    text: () => text.trim(),
    done: () => ended || failure !== undefined,
    finish,
  };
}
