/**
 * What the three wire adapters share (03 §3.2). An adapter is two pure functions: `build` turns
 * one model request into the address and fetch options for `transport.send`, and `read` turns
 * the reply's status and body into the answer text or one failure. Retries, the deadline, the
 * compact re-ask and the standby belong to the client (P03-17), which maps the catalogue and the
 * settings onto `AdapterInput`. Keys travel only in headers, never in an address.
 */
import { fromReply, type ReplyContext, type SingleFailure } from '../errors';
import { isSuccess, type SendInit } from '../transport';
import { err, ok, type Result } from '../../lib/result';
import type { ProviderId } from '../catalog/providers';

/** The sixteen providers (glossary 17 §1.1), as the catalogue lists them. */
export type { ProviderId };

/** How hard an OpenRouter model may think before it answers; `auto` leaves it to the model. */
export type OpenRouterEffort =
  'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** One model request, ready for the wire. */
export interface AdapterInput {
  readonly provider: ProviderId;
  /** The provider's base address, e.g. `https://api.openai.com/v1`. Trailing slashes are ignored. */
  readonly baseUrl: string;
  readonly model: string;
  /** The API key. Undefined or blank sends none (Ollama, a Custom server without a key). */
  readonly key?: string;
  /**
   * Our system text, with the person's notes for the AI already in it (D-16.24). It goes in the
   * format's system channel; a blank one sends no system channel at all.
   */
  readonly system: string;
  readonly prompt: string;
  /** Photos as base64 JPEG data without a `data:` prefix, in the order they were taken. */
  readonly images: readonly string[];
  /** Whether the answer should be JSON (only Gemini has a switch for it). */
  readonly json: boolean;
  /** The answer token limit: a whole number of at least 1 (the settings clamp it). */
  readonly maxTokens: number;
  /** OpenRouter only; `auto` when left out. The client passes `low` on the compact re-ask. */
  readonly openRouterEffort?: OpenRouterEffort;
}

/** The arguments for `transport.send(url, init, …)`. */
export interface WireRequest {
  readonly url: string;
  readonly init: SendInit;
}

/** The answer text, or `truncated`, `invalidResponse` or a classified failure. */
export type ReadResult = Result<string, SingleFailure>;

export interface Adapter {
  build(input: AdapterInput): WireRequest;
  /** Reads a reply; `context.secrets` are cut out of a classified failure's detail. */
  read(status: number, bodyText: string, context?: ReplyContext): ReadResult;
}

/** All three formats declare every photo as JPEG: the client always re-encodes (R03.12). */
export const JPEG = 'image/jpeg';

/** The answer limit when the given one is unusable (D-16.65). */
const FALLBACK_TOKEN_CAP = 1_024;

export type JsonRecord = Readonly<Record<string, unknown>>;

/** A POST with a JSON body. */
export function postJson(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: JsonRecord,
): WireRequest {
  return {
    url,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  };
}

/** `base` + `path`, without the double slash a trailing `/` on the base would give (R03.22). */
export function endpoint(baseUrl: string, path: string): string {
  return baseUrl.trim().replace(/\/+$/, '') + path;
}

/** The trimmed key, or undefined when there is none worth sending (R03.20). */
export function keyOf(input: Pick<AdapterInput, 'key'>): string | undefined {
  const key = input.key?.trim();
  return key === undefined || key === '' ? undefined : key;
}

/** The token limit as the wire wants it: a whole number of at least 1, never `null`. */
export function tokenCap(maxTokens: number): number {
  return Number.isFinite(maxTokens) && maxTokens >= 1 ? Math.floor(maxTokens) : FALLBACK_TOKEN_CAP;
}

/** Whether a system text is worth a system channel. */
export function hasText(text: string): boolean {
  return text.trim() !== '';
}

/** A model id lower-cased, trimmed and cut to its last `/` segment (`Vendor/Model` → `model`). */
export function bareModelId(model: string): string {
  const id = model.trim().toLowerCase();
  return id.slice(id.lastIndexOf('/') + 1);
}

/**
 * The first step of every reader: an error status is classified from its status and body; a
 * success must hold a JSON object, or the reply is unusable.
 */
export function openReply(
  status: number,
  bodyText: string,
  context: ReplyContext,
): Result<JsonRecord, SingleFailure> {
  if (!isSuccess(status)) return err(fromReply(status, bodyText, context));
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return unusable();
  }
  return isRecord(parsed) ? ok(parsed) : unusable();
}

/**
 * The texts of `items` that have one, each trimmed, blanks dropped, joined by newlines (the
 * OpenAI-compatible parts list and Anthropic's content blocks).
 */
export function joinTexts(items: readonly unknown[]): string {
  return items
    .map((item) => (isRecord(item) && typeof item.text === 'string' ? item.text.trim() : ''))
    .filter((text) => text !== '')
    .join('\n');
}

/** The reply could not be read as an answer. */
export function unusable(): Result<never, SingleFailure> {
  return err({ kind: 'invalidResponse' });
}

/** The model stopped at the token limit; the client re-asks once (03 §3.8). */
export function cutOff(): Result<never, SingleFailure> {
  return err({ kind: 'truncated' });
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
