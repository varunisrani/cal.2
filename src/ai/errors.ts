/**
 * How an AI request fails: one kind per cause, each with one fixed message from the catalogue
 * (src/i18n/en/ai.ts). A provider's own text is never part of a message: it can echo the key or
 * the prompt and it is in the vendor's words (R03.18). It is read only to classify the failure
 * and, with keys removed, kept as a detail a Details view may show (D-16.31).
 */
import type { MessageKey } from '../i18n/catalogue';
import type { ai } from '../i18n/en/ai';
import type { MessageParams } from '../i18n/message';

export const FAILURE_KINDS = [
  'noKey',
  'imageConversion',
  'invalidResponse',
  'invalidUrl',
  'offline',
  'connection',
  'timeout',
  'credits',
  'dailyQuota',
  'quota',
  'model',
  'rateLimit',
  'keyRejected',
  'overloaded',
  'generic',
  'truncated',
  'tooLarge',
  'roundLimit',
  'bothFailed',
  'cancelled',
] as const;

export type AiFailureKind = (typeof FAILURE_KINDS)[number];

/** The kinds `classify` can give a provider's error reply. */
export type ReplyFailureKind =
  | 'keyRejected'
  | 'credits'
  | 'dailyQuota'
  | 'quota'
  | 'model'
  | 'rateLimit'
  | 'overloaded'
  | 'tooLarge'
  | 'generic';

/** One provider's failure. `cancelled` (the person pressed Cancel) is never shown. */
export interface SingleFailure {
  readonly kind: Exclude<AiFailureKind, 'bothFailed'>;
  /** The HTTP status of the reply it was read from; 0 for an error inside a success reply. */
  readonly status?: number;
  /** The provider's own message, stored keys replaced, for a Details view only. */
  readonly detail?: string;
  /** Set on a connection failure from a provider that reports a refused key that way (R03.2). */
  readonly keyMayBeRefused?: boolean;
}

/** The primary and its standby both failed (D-16.22). */
export interface BothFailed {
  readonly kind: 'bothFailed';
  /** Provider names as shown to the person. */
  readonly primary: string;
  readonly standby: string;
  /** The standby's failure: its kind says what the person can do. */
  readonly standbyFailure: SingleFailure;
}

export type AiFailure = SingleFailure | BothFailed;

// Phrases searched in the lower-cased reply. Vendors word the same cause differently.
const REFUSED_KEY = [
  'api key not valid',
  'api_key_invalid',
  'api key expired',
  'api_key_expired',
  'invalid api key',
  'invalid_api_key',
  'incorrect api key',
];
const NO_CREDIT = [
  'insufficient credit',
  'not enough credit',
  'out of credit',
  'credit balance is too low',
  'insufficient balance',
  'billing_hard_limit_reached',
];
const ALLOWANCE = ['quota', 'limit', 'resource exhausted', 'resource_exhausted'];
// "perday" also covers `requestsPerDay` and Gemini quota ids such as `…PerDayPerProject…`.
const PER_DAY = ['daily', 'per day', 'per_day', 'per-day', 'perday'];
const TOO_BIG = [
  'payload',
  'too large',
  'too_large',
  'too many images',
  'image exceeds',
  'size exceeds',
  'request size',
];

/**
 * The kind of a provider's error reply, from its HTTP status and body. The first rule that
 * matches wins, and the order matters (R03.19): a refused key, then credit, the daily quota,
 * other quotas, then the status alone. Pass status 0 for an error found inside a success reply.
 */
export function classify(status: number, bodyText: string): ReplyFailureKind {
  const text = `${readProviderMessage(bodyText) ?? ''}\n${bodyText}`.toLowerCase();
  const mentions = (phrases: readonly string[]): boolean => phrases.some((p) => text.includes(p));

  if (status === 401 || status === 403) return 'keyRejected';
  if (status === 400 && mentions(REFUSED_KEY)) return 'keyRejected';
  if (status === 402 || mentions(NO_CREDIT)) return 'credits';
  if (mentions(ALLOWANCE) && mentions(PER_DAY)) return 'dailyQuota';
  if (text.includes('quota') && (text.includes('exceed') || text.includes('insufficient'))) {
    return 'quota';
  }
  if (status === 404) return 'model';
  if (status === 429) return 'rateLimit';
  if (status === 503 || status === 529) return 'overloaded';
  if (status === 413 || (status === 400 && mentions(TOO_BIG))) return 'tooLarge';
  return 'generic';
}

/**
 * The message a provider put in its error reply, in any of the shapes vendors use: an `error`
 * object with a `message`, `error` as a string, `detail`, a top-level `message`, or a plain-text
 * body. Markup (an HTML error page) and JSON without a message give undefined.
 */
export function readProviderMessage(bodyText: string): string | undefined {
  const body = bodyText.trim();
  if (body === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body.startsWith('<') ? undefined : body;
  }
  if (!isRecord(parsed)) return textOf(parsed);
  const { error } = parsed;
  return (
    (isRecord(error) ? textOf(error.message) : textOf(error)) ??
    textOf(parsed.detail) ??
    textOf(parsed.message)
  );
}

export interface ReplyContext {
  /** Keys that may have been sent; they are cut out of the detail. */
  readonly secrets?: readonly string[];
}

const DETAIL_LIMIT = 300;
const HIDDEN = '•••';

/** The failure for a provider's error reply: its kind, status and a redacted detail. */
export function fromReply(
  status: number,
  bodyText: string,
  context: ReplyContext = {},
): SingleFailure {
  const kind = classify(status, bodyText);
  const message = readProviderMessage(bodyText);
  if (message === undefined) return { kind, status };
  return { kind, status, detail: shorten(redact(message, context.secrets ?? [])) };
}

export interface NetworkContext {
  /** Which of our own signals stopped the request: the person's Cancel or our deadline. */
  readonly stoppedBy?: 'cancel' | 'deadline';
  /** Whether the device reports a connection; read from the browser when left out. */
  readonly online?: boolean;
  /** The provider id the request went to, and whether a key went with it. */
  readonly provider?: string;
  readonly keySent?: boolean;
}

/**
 * Providers whose error replies carry no CORS header (03 §3.15), so a refused key reaches the
 * page as a bare network error: Cerebras always, Hugging Face when no key was sent.
 */
const KEY_HIDDEN_BY_CORS = new Map<string, 'always' | 'withoutKey'>([
  ['cerebras', 'always'],
  ['huggingface', 'withoutKey'],
]);

/**
 * The failure for a request that got no reply: the browser only says "TypeError", so this uses
 * what we know instead (R03.2). Cancel, then our deadline, then the device's offline flag;
 * anything else is a connection failure. The error's own text is never kept.
 */
export function fromNetwork(error: unknown, context: NetworkContext = {}): SingleFailure {
  if (context.stoppedBy === 'cancel') return { kind: 'cancelled' };
  if (context.stoppedBy === 'deadline') return { kind: 'timeout' };
  const name = errorName(error);
  // An abort we were not told about: a deadline signal rejects with a TimeoutError, Cancel with
  // an AbortError.
  if (name === 'TimeoutError') return { kind: 'timeout' };
  if (name === 'AbortError') return { kind: 'cancelled' };
  if (!(context.online ?? deviceOnline())) return { kind: 'offline' };
  const hidden = KEY_HIDDEN_BY_CORS.get(context.provider ?? '');
  if (hidden === 'always' || (hidden === 'withoutKey' && context.keySent !== true)) {
    return { kind: 'connection', keyMayBeRefused: true };
  }
  return { kind: 'connection' };
}

/** The browser's online flag; true when there is no navigator to ask. */
export function deviceOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * The failure after the standby also failed: names both providers and keeps the standby's
 * failure. A cancelled standby stays a silent cancel.
 */
export function bothFailed(
  primary: string,
  standby: string,
  standbyFailure: SingleFailure,
): AiFailure {
  if (standbyFailure.kind === 'cancelled') return standbyFailure;
  return { kind: 'bothFailed', primary, standby, standbyFailure };
}

/** A key of the `ai` catalogue partition. */
export type AiMessageKey = MessageKey<typeof ai>;

export interface AiMessage {
  readonly key: AiMessageKey;
  readonly params?: MessageParams;
}

/** The catalogue key of a kind's message; null for `cancelled`, which is never shown. */
export function messageKey(kind: AiFailureKind): AiMessageKey | null {
  return kind === 'cancelled' ? null : `ai.failure.${kind}`;
}

/**
 * What to show for a failure, as catalogue messages in reading order: nothing for a cancel; for
 * both providers failing, that line and then the standby's messages.
 */
export function failureMessages(failure: AiFailure): readonly AiMessage[] {
  if (failure.kind === 'bothFailed') {
    const { primary, standby } = failure;
    return [
      { key: 'ai.failure.bothFailed', params: { primary, standby } },
      ...failureMessages(failure.standbyFailure),
    ];
  }
  const key = messageKey(failure.kind);
  if (key === null) return [];
  return failure.kind === 'connection' && failure.keyMayBeRefused === true
    ? [{ key }, { key: 'ai.hint.keyMayBeRefused' }]
    : [{ key }];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('name' in error)) return undefined;
  return typeof error.name === 'string' ? error.name : undefined;
}

function redact(text: string, secrets: readonly string[]): string {
  const longestFirst = secrets
    .map((secret) => secret.trim())
    .filter((secret) => secret !== '')
    .sort((a, b) => b.length - a.length);
  return longestFirst.reduce((out, secret) => out.split(secret).join(HIDDEN), text);
}

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= DETAIL_LIMIT ? flat : `${flat.slice(0, DETAIL_LIMIT - 1)}…`;
}
