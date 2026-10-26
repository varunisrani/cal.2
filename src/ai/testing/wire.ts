/**
 * Reply bodies of the three wire formats, for tests (P03-02). The field names follow each
 * vendor's API (third-party protocols); every text, id and number in them is made up here.
 * Build a body with these, then hand it to `jsonReply` from `fakeFetch.ts`.
 */

// ---------------------------------------------------------------------------------------------
// Gemini `generateContent`

export interface GeminiPart {
  readonly text?: string;
  readonly thought?: boolean;
  readonly functionCall?: { readonly name: string; readonly args: Record<string, unknown> };
}

export const geminiPart = {
  text: (text: string): GeminiPart => ({ text }),
  /** A thought summary: Gemini marks it `thought: true`, and it is not part of the answer. */
  thought: (text: string): GeminiPart => ({ text, thought: true }),
  call: (name: string, args: Record<string, unknown> = {}): GeminiPart => ({
    functionCall: { name, args },
  }),
};

export interface GeminiReplyOptions {
  /** `STOP` by default; `MAX_TOKENS` means the answer was cut off. */
  readonly finishReason?: string;
  readonly model?: string;
}

export interface GeminiReplyBody {
  readonly candidates: readonly {
    readonly content: { readonly role: 'model'; readonly parts?: readonly GeminiPart[] };
    readonly finishReason: string;
    readonly index: number;
  }[];
  readonly usageMetadata: Record<string, number>;
  readonly modelVersion: string;
  readonly responseId: string;
}

/**
 * One candidate made of `parts` (a string is one text part). With no parts the candidate's
 * content has no `parts` at all, as Gemini sends when thinking used up the whole budget.
 */
export function geminiReply(
  parts: string | readonly GeminiPart[],
  options: GeminiReplyOptions = {},
): GeminiReplyBody {
  const list = typeof parts === 'string' ? [geminiPart.text(parts)] : parts;
  return {
    candidates: [
      {
        content: list.length > 0 ? { role: 'model', parts: list } : { role: 'model' },
        finishReason: options.finishReason ?? 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 812, candidatesTokenCount: 96, totalTokenCount: 908 },
    modelVersion: options.model ?? 'gemini-wire-test',
    responseId: 'wire-gemini-0001',
  };
}

export interface GeminiErrorOptions {
  /** The HTTP status, repeated in the body. */
  readonly code: number;
  /** Google's status name, e.g. `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`. */
  readonly status: string;
  readonly message: string;
  /** Adds a `QuotaFailure` detail with this `quotaId` (the per-day limit hides here). */
  readonly quotaId?: string;
  /** Adds an `ErrorInfo` detail with this reason, e.g. `API_KEY_INVALID`. */
  readonly reason?: string;
}

export function geminiError(options: GeminiErrorOptions): { readonly error: object } {
  const details: object[] = [];
  if (options.reason !== undefined) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
      reason: options.reason,
      domain: 'googleapis.com',
    });
  }
  if (options.quotaId !== undefined) {
    details.push({
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [
        {
          quotaMetric: 'generativelanguage.googleapis.com/wire_test_requests',
          quotaId: options.quotaId,
        },
      ],
    });
  }
  const { code, message, status } = options;
  return {
    error: details.length > 0 ? { code, message, status, details } : { code, message, status },
  };
}

// ---------------------------------------------------------------------------------------------
// OpenAI-compatible `chat/completions`

export interface OpenAiPart {
  readonly type: string;
  readonly text?: string;
}

export const openAiPart = {
  text: (text: string): OpenAiPart => ({ type: 'text', text }),
};

/**
 * The message fields that hold reasoning text: `reasoning` (OpenRouter, Groq),
 * `reasoning_content` (DeepSeek, Qwen), `reasoning_details` (OpenRouter, a list).
 */
export type ReasoningField = 'reasoning' | 'reasoning_content' | 'reasoning_details';

export interface OpenAiToolCall {
  readonly id?: string;
  readonly name: string;
  readonly args: unknown;
}

export interface OpenAiReplyOptions {
  /** `stop` by default (`tool_calls` when there are tool calls); `length` means cut off. */
  readonly finishReason?: string;
  readonly reasoning?: { readonly field: ReasoningField; readonly text: string };
  readonly toolCalls?: readonly OpenAiToolCall[];
  /** An error reported on the choice itself, with `finish_reason: error` (OpenRouter). */
  readonly choiceError?: { readonly message: string; readonly code?: number | string };
  readonly model?: string;
}

export interface OpenAiReplyBody {
  readonly id: string;
  readonly object: 'chat.completion';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly {
    readonly index: number;
    readonly message: Record<string, unknown>;
    readonly finish_reason: string;
    readonly error?: { readonly message: string; readonly code?: number | string };
  }[];
  readonly usage: Record<string, number>;
}

/** One choice whose message `content` is a string, a list of parts, or null. */
export function openAiReply(
  content: string | null | readonly OpenAiPart[],
  options: OpenAiReplyOptions = {},
): OpenAiReplyBody {
  const message: Record<string, unknown> = { role: 'assistant', content };
  const { reasoning, toolCalls, choiceError } = options;
  if (reasoning !== undefined) {
    message[reasoning.field] =
      reasoning.field === 'reasoning_details'
        ? [{ type: 'reasoning.text', text: reasoning.text }]
        : reasoning.text;
  }
  if (toolCalls !== undefined) {
    message.tool_calls = toolCalls.map((call, index) => ({
      id: call.id ?? `call_wire_${index + 1}`,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    }));
  }
  const finishReason =
    options.finishReason ??
    (choiceError !== undefined ? 'error' : toolCalls !== undefined ? 'tool_calls' : 'stop');
  const choice = { index: 0, message, finish_reason: finishReason };
  return {
    id: 'wire-chat-0001',
    object: 'chat.completion',
    created: 1_790_000_000,
    model: options.model ?? 'wire-test-model',
    choices: [choiceError === undefined ? choice : { ...choice, error: choiceError }],
    usage: { prompt_tokens: 812, completion_tokens: 96, total_tokens: 908 },
  };
}

export interface OpenAiErrorOptions {
  readonly type?: string;
  readonly code?: string | number | null;
}

/** The OpenAI error envelope, used by most of the family (no `choices`). */
export function openAiError(
  message: string,
  options: OpenAiErrorOptions = {},
): { readonly error: object } {
  return {
    error: {
      message,
      type: options.type ?? 'invalid_request_error',
      param: null,
      code: options.code ?? null,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Anthropic `messages`

export type AnthropicBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'thinking'; readonly thinking: string; readonly signature: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    };

export const anthropicBlock = {
  text: (text: string): AnthropicBlock => ({ type: 'text', text }),
  thinking: (thinking: string): AnthropicBlock => ({
    type: 'thinking',
    thinking,
    signature: 'wire-signature',
  }),
  toolUse: (name: string, input: unknown, id = 'toolu_wire_1'): AnthropicBlock => ({
    type: 'tool_use',
    id,
    name,
    input,
  }),
};

export interface AnthropicReplyOptions {
  /** `end_turn` by default (`tool_use` when a tool block is present); `max_tokens` = cut off. */
  readonly stopReason?: string;
  readonly model?: string;
}

export interface AnthropicReplyBody {
  readonly id: string;
  readonly type: 'message';
  readonly role: 'assistant';
  readonly model: string;
  readonly content: readonly AnthropicBlock[];
  readonly stop_reason: string;
  readonly stop_sequence: null;
  readonly usage: Record<string, number>;
}

/** One assistant message made of content `blocks` (a string is one text block). */
export function anthropicReply(
  blocks: string | readonly AnthropicBlock[],
  options: AnthropicReplyOptions = {},
): AnthropicReplyBody {
  const content = typeof blocks === 'string' ? [anthropicBlock.text(blocks)] : blocks;
  const usesTool = content.some((block) => block.type === 'tool_use');
  return {
    id: 'msg_wire_0001',
    type: 'message',
    role: 'assistant',
    model: options.model ?? 'wire-test-model',
    content,
    stop_reason: options.stopReason ?? (usesTool ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: { input_tokens: 812, output_tokens: 96 },
  };
}

/** Anthropic's error envelope; `type` is e.g. `authentication_error`, `overloaded_error`. */
export function anthropicError(type: string, message: string): object {
  return { type: 'error', error: { type, message }, request_id: 'req_wire_0001' };
}

// ---------------------------------------------------------------------------------------------
// Other error shapes of the OpenAI-compatible family

/** `error` as a plain string (xAI, Hugging Face); xAI also sends a `code` beside it. */
export function stringError(message: string, code?: string): object {
  return code === undefined ? { error: message } : { code, error: message };
}

/** A `detail` field and nothing else (Mistral). */
export function detailError(detail: string): object {
  return { detail };
}
