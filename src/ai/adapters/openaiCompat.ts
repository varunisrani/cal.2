/**
 * The OpenAI-compatible wire format, `chat/completions` (03 §3.2 O), spoken by fourteen of the
 * sixteen providers. The key goes in `Authorization: Bearer` only when there is one. A `system`
 * message carries our system text with the person's notes (D-16.24); one user message carries
 * the photos as data URLs, then the prompt. The family disagrees on details: the name of the
 * answer limit (R03.10), Qwen's thinking switch and OpenRouter's reasoning object (R03.11).
 */
import {
  JPEG,
  bareModelId,
  cutOff,
  endpoint,
  hasText,
  isRecord,
  joinTexts,
  keyOf,
  openReply,
  postJson,
  tokenCap,
  unusable,
  type Adapter,
  type AdapterInput,
  type JsonRecord,
  type OpenRouterEffort,
  type ProviderId,
  type ReadResult,
  type WireRequest,
} from './request';
import { fromReply, type ReplyContext } from '../errors';
import { err, ok } from '../../lib/result';

/** How Platewise names itself to OpenRouter (its attribution headers, 17 §1.1). */
export const ATTRIBUTION_NAME = 'Platewise';
/** Platewise's own address for OpenRouter attribution: the project's home until it has a site. */
export const ATTRIBUTION_URL = 'https://github.com/varunisrani/cal.2';

export type TokenLimitField = 'max_completion_tokens' | 'max_tokens';

/** Custom model ids that need OpenAI's newer limit name, matched on the bare id's start. */
const NEWER_LIMIT_MODELS: readonly string[] = ['gpt-5', 'gpt-6', 'o1', 'o3', 'o4'];

/**
 * The name of the answer limit; the wrong one is refused with a 400 (R03.10). OpenAI itself
 * wants `max_completion_tokens` for every model. A Custom server gets it only for OpenAI's
 * reasoning-era model ids (gpt-5, gpt-6, o1, o3, o4, after any `vendor/` prefix); every other
 * provider and model takes `max_tokens`.
 */
export function tokenLimitField(provider: ProviderId, model: string): TokenLimitField {
  if (provider === 'openai') return 'max_completion_tokens';
  if (provider !== 'custom') return 'max_tokens';
  const id = bareModelId(model);
  return NEWER_LIMIT_MODELS.some((start) => id.startsWith(start))
    ? 'max_completion_tokens'
    : 'max_tokens';
}

/**
 * OpenRouter's `reasoning` object: the reasoning text is always left out of the reply, so it
 * cannot crowd out the answer, and the effort is named unless it is `auto` (R03.11).
 */
export function openRouterReasoning(effort: OpenRouterEffort): JsonRecord {
  return effort === 'auto' ? { exclude: true } : { exclude: true, effort };
}

/** Body fields one provider needs on top of the shared ones. */
function providerExtras(input: AdapterInput): JsonRecord {
  switch (input.provider) {
    // Qwen's hybrid models think unless told not to, which is slow and refused without streaming.
    case 'qwen':
      return { enable_thinking: false };
    case 'openrouter':
      return { reasoning: openRouterReasoning(input.openRouterEffort ?? 'auto') };
    default:
      return {};
  }
}

/** The key as a Bearer token when there is one, and OpenRouter's attribution headers. */
export function headersFor(input: Pick<AdapterInput, 'provider' | 'key'>): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = keyOf(input);
  if (key !== undefined) headers.Authorization = `Bearer ${key}`;
  if (input.provider === 'openrouter') {
    headers['HTTP-Referer'] = ATTRIBUTION_URL;
    headers['X-Title'] = ATTRIBUTION_NAME;
  }
  return headers;
}

/** The user turn: the prompt alone as a string, or image parts followed by one text part. */
function userContent(input: AdapterInput): string | readonly JsonRecord[] {
  if (input.images.length === 0) return input.prompt;
  return [
    ...input.images.map((data) => ({
      type: 'image_url',
      image_url: { url: `data:${JPEG};base64,${data}` },
    })),
    { type: 'text', text: input.prompt },
  ];
}

export function buildOpenAiCompat(input: AdapterInput): WireRequest {
  const messages: JsonRecord[] = [
    ...(hasText(input.system) ? [{ role: 'system', content: input.system }] : []),
    { role: 'user', content: userContent(input) },
  ];
  return postJson(endpoint(input.baseUrl, '/chat/completions'), headersFor(input), {
    model: input.model.trim(),
    messages,
    [tokenLimitField(input.provider, input.model)]: tokenCap(input.maxTokens),
    ...providerExtras(input),
  });
}

/** Whether a reply carries an error envelope: `error` as an object or as a non-blank string. */
export function carriesError(reply: JsonRecord): boolean {
  const { error } = reply;
  return isRecord(error) || (typeof error === 'string' && error.trim() !== '');
}

/** Whether the model wrote reasoning, in any of the fields the family uses for it. */
export function hasReasoning(message: JsonRecord): boolean {
  const filled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';
  const { reasoning_details: details } = message;
  return (
    filled(message.reasoning) ||
    filled(message.reasoning_content) ||
    (Array.isArray(details) && details.length > 0)
  );
}

/**
 * The answer in the first choice. A failure reported inside a success reply (an error envelope
 * without choices, or `finish_reason: "error"`) is classified like an error reply, with status 0.
 * A `length` stop is cut off; so is a reply with reasoning but no text, the model having spent
 * its budget thinking. `content` is a string, or a list of parts whose texts are joined.
 */
export function readOpenAiCompat(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): ReadResult {
  const opened = openReply(status, bodyText, context);
  if (!opened.ok) return opened;

  const reply = opened.value;
  const choice: unknown = Array.isArray(reply.choices) ? reply.choices[0] : undefined;
  if (choice === undefined && carriesError(reply)) return err(fromReply(0, bodyText, context));
  if (!isRecord(choice)) return unusable();
  if (choice.finish_reason === 'error') return err(fromReply(0, bodyText, context));
  if (choice.finish_reason === 'length') return cutOff();

  const { message } = choice;
  if (!isRecord(message)) return unusable();
  const { content } = message;
  const answer =
    typeof content === 'string' ? content.trim() : Array.isArray(content) ? joinTexts(content) : '';
  if (answer !== '') return ok(answer);
  return hasReasoning(message) ? cutOff() : unusable();
}

export const openAiCompatAdapter: Adapter = { build: buildOpenAiCompat, read: readOpenAiCompat };
