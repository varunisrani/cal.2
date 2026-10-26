/**
 * The Gemini wire format, `generateContent` (03 §3.2 G). The key travels in the `x-goog-api-key`
 * header only, so no address that a proxy or a server log keeps ever holds it. One user turn
 * carries the photos, then the prompt; `systemInstruction` carries our system text with the
 * person's notes (D-16.24). The generation settings always hold the answer limit (R03.9), ask for
 * JSON when the request wants it, and pick a thinking level from the model id (R03.8). A reply
 * may come in several parts, some of them thought summaries: every other part is kept (R03.7).
 */
import {
  JPEG,
  bareModelId,
  cutOff,
  endpoint,
  hasText,
  isRecord,
  keyOf,
  openReply,
  postJson,
  tokenCap,
  unusable,
  type Adapter,
  type AdapterInput,
  type JsonRecord,
  type ReadResult,
  type WireRequest,
} from './request';
import type { ReplyContext } from '../errors';
import { ok } from '../../lib/result';

/** The Gemini 3 thinking levels we send; `minimal` is the fastest. */
export type ThinkingLevel = 'minimal' | 'low';

/**
 * Google's version-less aliases can point at any Gemini 3 model, so they get a level that every
 * model they may name accepts.
 */
const ALIAS_LEVELS: ReadonlyMap<string, ThinkingLevel> = new Map([
  ['gemini-flash-lite-latest', 'minimal'],
  ['gemini-flash-latest', 'low'],
]);

/** `gemini-<major>[.<minor>]-<variant>`, e.g. `gemini-3.5-flash-lite`. */
const VERSIONED = /^gemini-(?<major>\d+)(?:\.(?<minor>\d+))?-(?<variant>.+)$/;

/**
 * The thinking level for a model id, or undefined to send none. Without one, Gemini 3 thinks at
 * length by default (a Flash-Lite photo ran into the time limit); with the wrong one it refuses
 * the request: Flash from 3.7 and Pro answer `minimal` with a 400, and models before 3 take no
 * level at all.
 */
export function geminiThinkingLevel(model: string): ThinkingLevel | undefined {
  const id = bareModelId(model);
  const alias = ALIAS_LEVELS.get(id);
  if (alias !== undefined) return alias;

  const parsed = VERSIONED.exec(id)?.groups;
  if (parsed === undefined) return undefined;
  const major = Number(parsed.major);
  const minor = Number(parsed.minor ?? '0');
  const variant = parsed.variant ?? '';
  if (major < 3) return undefined;
  if (variant.startsWith('flash-lite')) return 'minimal';
  if (variant.startsWith('flash')) return major > 3 || minor >= 7 ? 'low' : 'minimal';
  return 'low';
}

export function buildGemini(input: AdapterInput): WireRequest {
  const key = keyOf(input);
  const parts: JsonRecord[] = [
    ...input.images.map((data) => ({ inlineData: { mimeType: JPEG, data } })),
    { text: input.prompt },
  ];
  const level = geminiThinkingLevel(input.model);
  const generationConfig: JsonRecord = {
    maxOutputTokens: tokenCap(input.maxTokens),
    ...(input.json ? { responseMimeType: 'application/json' } : {}),
    ...(level === undefined ? {} : { thinkingConfig: { thinkingLevel: level } }),
  };
  return postJson(
    endpoint(input.baseUrl, `/models/${input.model.trim()}:generateContent`),
    key === undefined ? {} : { 'x-goog-api-key': key },
    {
      ...(hasText(input.system) ? { systemInstruction: { parts: [{ text: input.system }] } } : {}),
      contents: [{ role: 'user', parts }],
      generationConfig,
    },
  );
}

/**
 * The answer in the first candidate: the text of every part not flagged as a thought, joined as
 * it came and trimmed. A `MAX_TOKENS` stop is cut off even when some text arrived; no text at all,
 * no candidate (a blocked prompt) or a body that is not JSON is unusable.
 */
export function readGemini(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): ReadResult {
  const opened = openReply(status, bodyText, context);
  if (!opened.ok) return opened;

  const candidates = opened.value.candidates;
  const first: unknown = Array.isArray(candidates) ? candidates[0] : undefined;
  if (!isRecord(first)) return unusable();
  if (first.finishReason === 'MAX_TOKENS') return cutOff();

  const parts = isRecord(first.content) ? first.content.parts : undefined;
  const answer = (Array.isArray(parts) ? parts : [])
    .filter((part): part is JsonRecord => isRecord(part) && part.thought !== true)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  return answer === '' ? unusable() : ok(answer);
}

export const geminiAdapter: Adapter = { build: buildGemini, read: readGemini };
