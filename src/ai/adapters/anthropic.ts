/**
 * The Anthropic wire format, `messages` (03 §3.2 M). The key goes in `x-api-key` with the API
 * version, and every request opts in to direct browser access: without that header Anthropic's
 * replies, errors included, carry no CORS header, so the page would see only a network failure
 * (R03.1, 03 §3.15). `system` carries our system text with the person's notes (D-16.24); one user
 * turn carries the photos as image blocks, then the prompt as a text block.
 */
import {
  JPEG,
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
  type ReadResult,
  type WireRequest,
} from './request';
import type { ReplyContext } from '../errors';
import { ok } from '../../lib/result';

/** The Messages API version we speak. */
export const ANTHROPIC_VERSION = '2023-06-01';

export function buildAnthropic(input: AdapterInput): WireRequest {
  const key = keyOf(input);
  const content: JsonRecord[] = [
    ...input.images.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: JPEG, data },
    })),
    { type: 'text', text: input.prompt },
  ];
  return postJson(
    endpoint(input.baseUrl, '/messages'),
    {
      ...(key === undefined ? {} : { 'x-api-key': key }),
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    {
      model: input.model.trim(),
      max_tokens: tokenCap(input.maxTokens),
      ...(hasText(input.system) ? { system: input.system } : {}),
      messages: [{ role: 'user', content }],
    },
  );
}

/**
 * The answer: the `text` blocks of `content`, each trimmed, blanks dropped, joined by newlines;
 * thinking and other blocks are skipped. A `max_tokens` stop is cut off; no text is unusable.
 */
export function readAnthropic(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): ReadResult {
  const opened = openReply(status, bodyText, context);
  if (!opened.ok) return opened;

  const { content, stop_reason: stopReason } = opened.value;
  if (stopReason === 'max_tokens') return cutOff();
  const blocks = Array.isArray(content) ? content : [];
  const answer = joinTexts(blocks.filter((block) => isRecord(block) && block.type === 'text'));
  return answer === '' ? unusable() : ok(answer);
}

export const anthropicAdapter: Adapter = { build: buildAnthropic, read: readAnthropic };
