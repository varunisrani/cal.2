/**
 * Tool-call reply bodies in the three wire formats the Coach reads (OpenAI-compatible `tool_calls`,
 * Anthropic `tool_use` blocks, Gemini `functionCall` parts), for tests. Field names are the
 * vendors' own (spec 04 §2); every text, id and number is ours. Like `wire.ts`, the builders return
 * bodies only: the test picks the status (`{ json: body }` in fakeFetch).
 */
import type { Json, JsonObject } from './wire';

const MODEL = 'test-model';

/** One call as a test writes it. Leave a field out to send a call without it. */
export interface FakeToolCall {
  readonly id?: string;
  readonly name?: string;
  /** The arguments: an object, or raw text (to send malformed JSON on the OpenAI format). */
  readonly args?: JsonObject | string;
}

// --- OpenAI-compatible ---------------------------------------------------------------------

export interface OpenAiToolCallsOptions {
  /** `message.content` next to the calls; `null` by default. */
  readonly content?: string | null;
  /** `tool_calls` by default; `length` marks a cut-off reply. */
  readonly finishReason?: string;
  /** `message.reasoning_details`, one `reasoning.text` entry per text (OpenRouter). */
  readonly reasoningDetails?: readonly string[];
}

/** A `chat/completions` reply whose message asks for `calls`, in order. */
export function openAiToolCalls(
  calls: readonly FakeToolCall[],
  options: OpenAiToolCallsOptions = {},
): JsonObject {
  const message: Record<string, Json> = {
    role: 'assistant',
    content: options.content ?? null,
    tool_calls: calls.map((call) => {
      const fn: Record<string, Json> = {};
      if (call.name !== undefined) fn.name = call.name;
      if (call.args !== undefined) {
        fn.arguments = typeof call.args === 'string' ? call.args : JSON.stringify(call.args);
      }
      return { ...(call.id === undefined ? {} : { id: call.id }), type: 'function', function: fn };
    }),
  };
  if (options.reasoningDetails !== undefined) {
    message.reasoning_details = options.reasoningDetails.map((text) => ({
      type: 'reasoning.text',
      text,
    }));
  }
  return {
    id: 'chat-tools-1',
    object: 'chat.completion',
    created: 1793000000,
    model: MODEL,
    choices: [{ index: 0, message, finish_reason: options.finishReason ?? 'tool_calls' }],
    usage: { prompt_tokens: 910, completion_tokens: 42, total_tokens: 952 },
  };
}

// --- Anthropic -----------------------------------------------------------------------------

export interface AnthropicToolUseOptions {
  /** A text block before the tool blocks. */
  readonly text?: string;
  /** A thinking block first, with a signature. */
  readonly thinking?: string;
  /** `tool_use` by default; `max_tokens` marks a cut-off reply. */
  readonly stopReason?: string;
}

/** A `messages` reply with one `tool_use` block per call, after any thinking and text. */
export function anthropicToolUse(
  calls: readonly FakeToolCall[],
  options: AnthropicToolUseOptions = {},
): JsonObject {
  const content: JsonObject[] = [
    ...(options.thinking === undefined
      ? []
      : [{ type: 'thinking', thinking: options.thinking, signature: 'sig-thinking-01' }]),
    ...(options.text === undefined ? [] : [{ type: 'text', text: options.text }]),
    ...calls.map((call) => ({
      type: 'tool_use',
      ...(call.id === undefined ? {} : { id: call.id }),
      ...(call.name === undefined ? {} : { name: call.name }),
      input: typeof call.args === 'object' ? call.args : {},
    })),
  ];
  return {
    id: 'msg_tools_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: options.stopReason ?? 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1204, output_tokens: 58 },
  };
}

// --- Gemini --------------------------------------------------------------------------------

export interface GeminiFunctionCallsOptions {
  /** A thought summary part first. */
  readonly thought?: string;
  /** A text part before the calls. */
  readonly text?: string;
  /** A `thoughtSignature` on the first call part (Gemini 3 sends one). */
  readonly signature?: string;
  /** `STOP` by default; `MAX_TOKENS` marks a cut-off reply. */
  readonly finishReason?: string;
}

/** A `generateContent` reply whose first candidate holds one `functionCall` part per call. */
export function geminiFunctionCalls(
  calls: readonly FakeToolCall[],
  options: GeminiFunctionCallsOptions = {},
): JsonObject {
  const parts: JsonObject[] = [
    ...(options.thought === undefined ? [] : [{ text: options.thought, thought: true }]),
    ...(options.text === undefined ? [] : [{ text: options.text }]),
    ...calls.map((call, index) => ({
      functionCall: {
        ...(call.name === undefined ? {} : { name: call.name }),
        args: typeof call.args === 'object' ? call.args : {},
        ...(call.id === undefined ? {} : { id: call.id }),
      },
      ...(index === 0 && options.signature !== undefined
        ? { thoughtSignature: options.signature }
        : {}),
    })),
  ];
  return {
    candidates: [
      {
        content: { parts, role: 'model' },
        finishReason: options.finishReason ?? 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 1130, candidatesTokenCount: 37, totalTokenCount: 1167 },
    modelVersion: MODEL,
    responseId: 'gemini-tools-1',
  };
}
