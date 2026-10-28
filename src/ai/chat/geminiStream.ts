/**
 * A Coach round's streamed reply on Gemini's format (D-16.106): `streamGenerateContent` with
 * `alt=sse` sends each piece as a whole `GenerateContentResponse` whose first candidate holds the
 * new parts; the last one carries the `finishReason`, and the stream simply ends. Text parts not
 * flagged as thoughts are the answer; a `functionCall` part comes whole. The reply is the one `read`
 * gives for a whole answer: a `MAX_TOKENS` stop is cut off, calls win over text, and the parts go
 * back exactly as they came (thought signatures included, R04.13). An `error` object in the
 * stream is classified by its code, with status 0.
 */
import { cutOff, isRecord, unusable, type JsonRecord } from '../adapters/request';
import { fromReply, type ReplyContext, type SingleFailure } from '../errors';
import { err, ok, type Result } from '../../lib/result';
import type { SseEvent } from './sse';
import {
  CUT_STREAM,
  callId,
  toolName,
  type RoundReply,
  type RoundStream,
  type ToolCall,
} from './types';

/** A `finishReason` that says nothing yet. */
const UNSPECIFIED = 'FINISH_REASON_UNSPECIFIED';

/** The calls that can be answered: every one with a name (a response must name its tool). */
export function functionCalls(parts: readonly JsonRecord[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const part of parts) {
    const call = part.functionCall;
    if (!isRecord(call)) continue;
    const name = toolName(call.name);
    if (name === '') continue;
    const id = callId(call.id);
    const args = isRecord(call.args) ? call.args : {};
    calls.push(id === undefined ? { name, args } : { id, name, args });
  }
  return calls;
}

export function geminiStream(context: ReplyContext = {}): RoundStream {
  const parts: JsonRecord[] = [];
  let finishReason: string | undefined;
  /** A piece without candidates that names a block reason: the prompt was refused. */
  let blocked = false;
  let failure: SingleFailure | undefined;

  function take(event: SseEvent): void {
    if (failure !== undefined) return;
    let body: unknown;
    try {
      body = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isRecord(body)) return;
    const { error } = body;
    if (isRecord(error)) {
      const status = typeof error.code === 'number' ? error.code : 0;
      failure = { ...fromReply(status, event.data, context), status: 0 };
      return;
    }
    const first: unknown = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
    if (!isRecord(first)) {
      if (isRecord(body.promptFeedback) && body.promptFeedback.blockReason !== undefined) {
        blocked = true;
      }
      return;
    }
    const pieces = isRecord(first.content) ? first.content.parts : undefined;
    if (Array.isArray(pieces)) parts.push(...pieces.filter(isRecord));
    if (typeof first.finishReason === 'string' && first.finishReason !== UNSPECIFIED) {
      finishReason = first.finishReason;
    }
  }

  function text(): string {
    return parts
      .filter((part) => part.thought !== true)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }

  function finish(): Result<RoundReply, SingleFailure> {
    if (failure !== undefined) return err(failure);
    if (finishReason === undefined) return blocked ? unusable() : err(CUT_STREAM);
    if (finishReason === 'MAX_TOKENS') return cutOff();

    if (parts.some((part) => part.functionCall !== undefined)) {
      const calls = functionCalls(parts);
      // No call can be answered, so the next round could only be refused.
      if (calls.length === 0) return unusable();
      return ok({ kind: 'tools', calls, echo: { role: 'model', parts: [...parts] } });
    }

    const answer = text();
    return answer === '' ? unusable() : ok({ kind: 'answer', text: answer });
  }

  return { take, text, done: () => failure !== undefined, finish };
}
