/**
 * Reply bodies in the three wire formats the AI layer reads (Gemini `generateContent`,
 * OpenAI-compatible `chat/completions`, Anthropic `messages`) and the vendors' error bodies, for
 * tests. Field names are the vendors' own (spec 03 §2); every text, id and number is ours. The
 * builders return bodies only: the test picks the status (`{ status, json: body }` in fakeFetch).
 */

export type Json = string | number | boolean | null | readonly Json[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: Json;
}

const MODEL = 'test-model';

const asList = (text: string | readonly string[]): readonly string[] =>
  typeof text === 'string' ? [text] : text;

// --- Gemini --------------------------------------------------------------------------------

export interface GeminiAnswerOptions {
  /** Thought summaries, sent before the answer as parts flagged `thought: true`. */
  readonly thoughts?: readonly string[];
  /** `STOP` by default; `MAX_TOKENS` marks a cut-off answer. */
  readonly finishReason?: string;
}

/** A `generateContent` reply whose first candidate holds the thoughts, then one part per text. */
export function geminiAnswer(
  text: string | readonly string[],
  options: GeminiAnswerOptions = {},
): JsonObject {
  const parts: JsonObject[] = [
    ...(options.thoughts ?? []).map((thought) => ({ text: thought, thought: true })),
    ...asList(text).map((part) => ({ text: part })),
  ];
  return {
    candidates: [
      {
        content: parts.length > 0 ? { parts, role: 'model' } : { role: 'model' },
        finishReason: options.finishReason ?? 'STOP',
        index: 0,
      },
    ],
    usageMetadata: { promptTokenCount: 812, candidatesTokenCount: 96, totalTokenCount: 908 },
    modelVersion: MODEL,
    responseId: 'gemini-reply-1',
  };
}

/** A `generateContent` reply with no candidates: the prompt was blocked. */
export function geminiBlocked(blockReason = 'SAFETY'): JsonObject {
  return {
    promptFeedback: { blockReason },
    usageMetadata: { promptTokenCount: 812, totalTokenCount: 812 },
    modelVersion: MODEL,
  };
}

export interface GeminiErrorOptions {
  /** Adds a quota failure detail with this `quotaId` (Gemini's only sign of a daily quota). */
  readonly quotaId?: string;
}

/** Gemini's error body, e.g. `geminiError(429, 'RESOURCE_EXHAUSTED', '…', { quotaId })`. */
export function geminiError(
  code: number,
  status: string,
  message: string,
  options: GeminiErrorOptions = {},
): JsonObject {
  const error: JsonObject = { code, message, status };
  if (options.quotaId === undefined) return { error };
  return {
    error: {
      ...error,
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric: 'generativelanguage.googleapis.com/generate_content_requests',
              quotaId: options.quotaId,
            },
          ],
        },
      ],
    },
  };
}

// --- OpenAI-compatible ---------------------------------------------------------------------

export interface OpenAiAnswerOptions {
  /** `stop` by default; `length` marks a cut-off answer, `error` a failed one. */
  readonly finishReason?: string;
  /** `message.reasoning` (OpenRouter and others). */
  readonly reasoning?: string;
  /** `message.reasoning_content` (DeepSeek, Qwen and others). */
  readonly reasoningContent?: string;
  /** `message.reasoning_details`, one `reasoning.text` entry per text (OpenRouter). */
  readonly reasoningDetails?: readonly string[];
}

/**
 * A `chat/completions` reply. `content` is a string, `null`, or a list of texts sent as text
 * parts (some providers answer with parts instead of a string).
 */
export function openAiAnswer(
  content: string | null | readonly string[],
  options: OpenAiAnswerOptions = {},
): JsonObject {
  const message: Record<string, Json> = {
    role: 'assistant',
    content:
      content === null || typeof content === 'string'
        ? content
        : content.map((text) => ({ type: 'text', text })),
  };
  if (options.reasoning !== undefined) message.reasoning = options.reasoning;
  if (options.reasoningContent !== undefined) message.reasoning_content = options.reasoningContent;
  if (options.reasoningDetails !== undefined) {
    message.reasoning_details = options.reasoningDetails.map((text) => ({
      type: 'reasoning.text',
      text,
    }));
  }
  return {
    id: 'chat-reply-1',
    object: 'chat.completion',
    created: 1793000000,
    model: MODEL,
    choices: [{ index: 0, message, finish_reason: options.finishReason ?? 'stop' }],
    usage: { prompt_tokens: 640, completion_tokens: 88, total_tokens: 728 },
  };
}

export interface OpenAiErrorOptions {
  readonly type?: string;
  readonly code?: string | number | null;
}

/**
 * The OpenAI-style error body (`error.message`), used by most of the family; some providers
 * also send it with status 200 and no `choices`.
 */
export function openAiError(message: string, options: OpenAiErrorOptions = {}): JsonObject {
  return {
    error: {
      message,
      type: options.type ?? 'invalid_request_error',
      param: null,
      code: options.code ?? null,
    },
  };
}

/** An error body whose `error` is a bare string (xAI, Hugging Face). */
export function stringError(message: string): JsonObject {
  return { error: message };
}

/** An error body with only `detail` (Mistral). */
export function detailError(message: string): JsonObject {
  return { detail: message };
}

// --- Anthropic -----------------------------------------------------------------------------

export interface AnthropicAnswerOptions {
  /** A thinking block sent before the text blocks. */
  readonly thinking?: string;
  /** `end_turn` by default; `max_tokens` marks a cut-off answer. */
  readonly stopReason?: string;
  /** Blocks of other types appended after the text (e.g. a `tool_use` block). */
  readonly extraBlocks?: readonly JsonObject[];
}

/** A `messages` reply with one text block per text. */
export function anthropicAnswer(
  text: string | readonly string[],
  options: AnthropicAnswerOptions = {},
): JsonObject {
  const content: JsonObject[] = [
    ...(options.thinking === undefined
      ? []
      : [{ type: 'thinking', thinking: options.thinking, signature: 'test-signature' }]),
    ...asList(text).map((part) => ({ type: 'text', text: part })),
    ...(options.extraBlocks ?? []),
  ];
  return {
    id: 'msg_test_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: options.stopReason ?? 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 702, output_tokens: 91 },
  };
}

/** Anthropic's error body, e.g. `anthropicError('authentication_error', '…')`. */
export function anthropicError(type: string, message: string): JsonObject {
  return { type: 'error', error: { type, message } };
}
