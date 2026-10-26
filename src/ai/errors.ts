/**
 * How an AI request fails (spec 03 §3.10). Every failure ends as one `AiFailure` whose `kind`
 * picks one fixed sentence from the `ai` catalogue partition. A provider's own error text is read
 * only to choose the kind; it is never shown, except in Coach's Details view (D-16.31), which gets
 * it through `detail` and masks stored keys with `redactKeys` first.
 */
import { t, type TKey } from '../i18n/t';

/** Every failure kind. `cancelled` is never shown; `roundLimit` comes from Coach (P08). */
export const AI_FAILURE_KINDS = [
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

export type AiFailureKind = (typeof AI_FAILURE_KINDS)[number];

/** The kinds one provider can fail with; `bothFailed` wraps one of these. */
export type SingleFailureKind = Exclude<AiFailureKind, 'bothFailed'>;

export interface SingleFailure {
  readonly kind: SingleFailureKind;
  /** The HTTP status of the reply it was read from; 0 for an error inside a successful reply. */
  readonly status?: number;
  /** The provider's own message, for Coach's Details view only. Never shown anywhere else. */
  readonly detail?: string;
  /** `connection` only: this provider's error replies look like a lost connection (R03.2). */
  readonly keyMayBeRefused?: boolean;
}

/** The role's provider and its standby both failed; the standby's failure decides the advice. */
export interface BothFailed {
  readonly kind: 'bothFailed';
  /** Display names of the two providers, as the person picked them in Settings. */
  readonly primary: string;
  readonly standby: string;
  readonly standbyFailure: SingleFailure;
}

export type AiFailure = SingleFailure | BothFailed;

/** A failure on its way up through code that throws. Its message never holds provider text. */
export class AiFailureError extends Error {
  override readonly name = 'AiFailureError';
  readonly failure: AiFailure;

  constructor(failure: AiFailure) {
    super(`AI request failed (${failure.kind})`);
    this.failure = failure;
  }
}

export function isAiFailureError(value: unknown): value is AiFailureError {
  return value instanceof AiFailureError;
}

// ---------------------------------------------------------------------------------------------
// Classifying a failed reply

/**
 * Words that give a reply's meaning away, matched against the lower-cased provider message and
 * the whole body. They are matching data, grouped by what they tell us.
 */
const SIGNS = {
  /** The key itself was turned down (only trusted on a 400; 401 and 403 need no words). */
  refusedKey: [
    'api_key_expired',
    'api key expired',
    'api_key_invalid',
    'api key not valid',
    'invalid_api_key',
    'invalid api key',
    'incorrect api key',
  ],
  /** The account has no money left. */
  noCredit: [
    'billing_hard_limit_reached',
    'out of credits',
    'credit balance is too low',
    'insufficient credit',
  ],
  /** Some allowance ran out. Together with a per-day word this is the daily allowance. */
  allowance: ['resource_exhausted', 'quota', 'limit'],
  perDay: ['requestsperday', 'perday', 'per_day', 'per day', 'daily'],
  /** The account's allowance is spent, for no stated period. */
  allowanceSpent: [
    'insufficient_quota',
    'exceeded your current quota',
    'quota_exceeded',
    'quota exceeded',
  ],
  /** The request was too big: payload size, image size or image count (R03.29). */
  tooBig: [
    'payload size',
    'size exceeds',
    'image exceeds',
    'request_too_large',
    'request too large',
    'too many images',
  ],
} as const;

type Has = (signs: readonly string[]) => boolean;
type Rule = readonly [kind: SingleFailureKind, applies: (status: number, has: Has) => boolean];

/** Tried in this order; the first rule that applies names the kind (R03.19). */
const RULES: readonly Rule[] = [
  ['keyRejected', (s, has) => s === 401 || s === 403 || (s === 400 && has(SIGNS.refusedKey))],
  ['credits', (s, has) => s === 402 || has(SIGNS.noCredit)],
  ['dailyQuota', (_s, has) => has(SIGNS.allowance) && has(SIGNS.perDay)],
  ['quota', (_s, has) => has(SIGNS.allowanceSpent)],
  ['model', (s) => s === 404],
  ['rateLimit', (s) => s === 429],
  ['overloaded', (s) => s === 503 || s === 529],
  ['tooLarge', (s, has) => s === 413 || (s === 400 && has(SIGNS.tooBig))],
];

/**
 * The kind of a failed reply, from its HTTP status and its body as text. Status 0 classifies an
 * error found inside a successful reply. The provider's message is kept as `detail`.
 */
export function classify(status: number, bodyText: string): SingleFailure {
  const message = providerMessage(bodyText);
  const haystack = `${message ?? ''}\n${bodyText}`.toLowerCase();
  const has: Has = (signs) => signs.some((sign) => haystack.includes(sign));
  const kind = RULES.find(([, applies]) => applies(status, has))?.[0] ?? 'generic';
  const detail = message === undefined ? undefined : capDetail(message);
  return detail === undefined ? { kind, status } : { kind, status, detail };
}

/** Longest provider message kept for Details. */
const DETAIL_LIMIT = 600;

/**
 * The provider's own message in an error body: `error.message`, a string `error` (xAI, Hugging
 * Face), `detail` (Mistral) or a top-level `message`; otherwise the body itself (DeepSeek sends
 * plain text). Trimmed and capped. For Details only.
 */
export function providerDetail(bodyText: string): string | undefined {
  const message = providerMessage(bodyText);
  return message === undefined ? undefined : capDetail(message);
}

function providerMessage(bodyText: string): string | undefined {
  const text = bodyText.trim();
  if (text === '') return undefined;
  return messageInJson(text) ?? text;
}

function messageInJson(text: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const { error } = parsed;
  const candidates = [isRecord(error) ? error.message : error, parsed.detail, parsed.message];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return undefined;
}

function capDetail(text: string): string {
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}…` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------------------------
// Failures without a reply

export interface NetworkContext {
  /** Which of our own signals stopped the request, when one did (the deadline reports it). */
  readonly stoppedBy?: 'cancel' | 'deadline';
  /** Whether the device is online; read from `navigator.onLine` when left out. */
  readonly online?: boolean;
  /** The provider called (catalogue id), for the refused-key hint. */
  readonly provider?: string;
  /** Whether the request carried a key. */
  readonly keySent?: boolean;
}

/**
 * Providers whose error replies carry no CORS header, so in a browser a refused key fails like a
 * lost connection (spec 03 §3.15): Cerebras always, Hugging Face when no key was sent.
 */
const HIDES_REFUSED_KEY: Readonly<Record<string, 'always' | 'withoutKey'>> = {
  cerebras: 'always',
  huggingface: 'withoutKey',
};

/**
 * The kind of a request that got no reply. A browser reports CORS, DNS, TLS and offline as the
 * same opaque `TypeError` (R03.2), so this goes by what we know: our cancel, our deadline, the
 * device's offline flag, then a connection failure (with the key hint where it applies).
 */
export function fromNetwork(error: unknown, context: NetworkContext = {}): AiFailure {
  if (isAiFailureError(error)) return error.failure;
  if (context.stoppedBy === 'cancel') return { kind: 'cancelled' };
  if (context.stoppedBy === 'deadline') return { kind: 'timeout' };
  // Names, not instanceof: the DOMException of an abort may come from another realm.
  const name = errorName(error);
  if (name === 'TimeoutError') return { kind: 'timeout' };
  if (name === 'AbortError') return { kind: 'cancelled' };
  if (!(context.online ?? deviceOnline())) return { kind: 'offline' };
  return keyRefusalLooksLikeNetwork(context)
    ? { kind: 'connection', keyMayBeRefused: true }
    : { kind: 'connection' };
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('name' in error)) return undefined;
  return typeof error.name === 'string' ? error.name : undefined;
}

function deviceOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function keyRefusalLooksLikeNetwork({ provider, keySent }: NetworkContext): boolean {
  const when = provider === undefined ? undefined : HIDES_REFUSED_KEY[provider];
  return when === 'always' || (when === 'withoutKey' && keySent === false);
}

// ---------------------------------------------------------------------------------------------
// Combining and showing

/**
 * The failure after the standby failed too. A cancel stays a cancel (it is never shown), and a
 * nested combination keeps only its standby's failure.
 */
export function bothFailed(primary: string, standby: string, standbyFailure: AiFailure): AiFailure {
  if (standbyFailure.kind === 'cancelled') return standbyFailure;
  const last =
    standbyFailure.kind === 'bothFailed' ? standbyFailure.standbyFailure : standbyFailure;
  return { kind: 'bothFailed', primary, standby, standbyFailure: last };
}

type PlainShownKind = Exclude<SingleFailureKind, 'cancelled'>;

/** The catalogue message of each kind shown on its own. */
export const FAILURE_MESSAGE_KEYS = {
  noKey: 'ai.failure.noKey',
  imageConversion: 'ai.failure.imageConversion',
  invalidResponse: 'ai.failure.invalidResponse',
  invalidUrl: 'ai.failure.invalidUrl',
  offline: 'ai.failure.offline',
  connection: 'ai.failure.connection',
  timeout: 'ai.failure.timeout',
  credits: 'ai.failure.credits',
  dailyQuota: 'ai.failure.dailyQuota',
  quota: 'ai.failure.quota',
  model: 'ai.failure.model',
  rateLimit: 'ai.failure.rateLimit',
  keyRejected: 'ai.failure.keyRejected',
  overloaded: 'ai.failure.overloaded',
  generic: 'ai.failure.generic',
  truncated: 'ai.failure.truncated',
  tooLarge: 'ai.failure.tooLarge',
  roundLimit: 'ai.failure.roundLimit',
} as const satisfies Record<PlainShownKind, TKey>;

/**
 * What the person reads for a failure, always our own text; `null` for `cancelled`, which shows
 * nothing. `bothFailed` names both providers, then gives the standby failure's advice.
 */
export function failureMessage(failure: AiFailure): string | null {
  switch (failure.kind) {
    case 'cancelled':
      return null;
    case 'bothFailed':
      return t('ai.failure.bothFailed', {
        primary: failure.primary,
        standby: failure.standby,
        reason: failureMessage(failure.standbyFailure) ?? t('ai.failure.generic'),
      });
    case 'connection':
      return t(failure.keyMayBeRefused ? 'ai.failure.connectionOrKey' : 'ai.failure.connection');
    default:
      return t(FAILURE_MESSAGE_KEYS[failure.kind]);
  }
}

/** Shortest value treated as a key when masking; anything shorter could blank ordinary words. */
const SHORTEST_KEY = 8;
const KEY_MASK = '••••';

/** `text` with every stored key in it masked, for Coach's Details view (D-16.31). */
export function redactKeys(text: string, keys: readonly string[]): string {
  const secrets = keys
    .map((key) => key.trim())
    .filter((key) => key.length >= SHORTEST_KEY)
    .sort((a, b) => b.length - a.length);
  return secrets.reduce((out, secret) => out.split(secret).join(KEY_MASK), text);
}
