/**
 * The one door every model call goes through (03 §3.4, D-16.22–D-16.24). A request is served by
 * the role its photos pick (photos → the primary; none → the text provider when it is on, else
 * the primary). A role that is not set up fails before anything is sent, and so does a photo that
 * cannot be prepared: no standby could help. Otherwise the request goes out with the person's
 * notes for the AI in the system part, on the shared retry ladder, inside one time limit for the
 * whole action. An answer cut off at the token limit is asked for once more in compact form. The
 * caller's `validate` then reads the answer, and any failure, an unusable answer included, gives
 * the role's standby one try. Cancel is silent at every step. Failures are values, never throws,
 * and the only `fetch` used is the one in `deps`, handed on to the transport.
 */
import { anthropicAdapter } from './adapters/anthropic';
import { geminiAdapter } from './adapters/gemini';
import { openAiCompatAdapter } from './adapters/openaiCompat';
import type { Adapter, AdapterInput } from './adapters/request';
import { PROVIDERS, type WireFormat } from './catalog/providers';
import { attemptCapMs, startDeadline, type Deadline } from './deadline';
import { bothFailed, type AiFailure, type ReplyContext, type SingleFailure } from './errors';
import { FOOD_PHOTO, prepareImage, type ImageBackend } from './image';
import { compactRetryNote, lines, paragraphs } from './prompts/shared';
import { withRetries } from './retry';
import {
  keyFor,
  missingFor,
  roleFor,
  standbyFor,
  type AiSettings,
  type Missing,
  type ProviderKeys,
  type RoleTarget,
} from './settings';
import { send } from './transport';
import { err, ok, type Result } from '../lib/result';

/**
 * What a request is for. Every purpose runs the same pipeline (one ladder, one deadline, one
 * standby rule); the label is for callers and tests.
 */
export type AiPurpose =
  'mealPhotos' | 'mealText' | 'labelScan' | 'unitRepair' | 'plan' | 'nutrientGoals' | 'fitCheck';

/** Reads the answer text; a failure counts like a provider's and sends the standby in. */
export type Validate<T> = (text: string) => Result<T, SingleFailure>;

interface RequestBase {
  readonly purpose: AiPurpose;
  /** The photos as the person picked them; none means a text request. */
  readonly images?: readonly Blob[];
  /** From a prompt builder, without the person's notes: the client adds them (D-16.24). */
  readonly system: string;
  readonly prompt: string;
  /** Whether the answer is a JSON object; a prose request (the fit check) sets false. */
  readonly json: boolean;
}

/** A request whose answer is the text itself, trimmed. */
export interface TextRequest extends RequestBase {
  readonly validate?: undefined;
}

/** A request whose answer `validate` reads into a value. */
export interface CheckedRequest<T> extends RequestBase {
  readonly validate: Validate<T>;
}

export type AiRequest<T = string> = TextRequest | CheckedRequest<T>;

export interface AiDeps {
  readonly settings: AiSettings;
  readonly keys: ProviderKeys;
  /** Handed to `transport.send`; the client never reaches for the global one. */
  readonly fetch: typeof fetch;
  /**
   * The action's deadline. When left out, the client starts one from `settings.timeoutSec` and
   * `cancel`, and ends it when the call is over.
   */
  readonly deadline?: Deadline;
  /** The Cancel button's signal, for a deadline the client starts itself. */
  readonly cancel?: AbortSignal;
  /** Decodes and draws photos; the browser's when left out. */
  readonly imageBackend?: ImageBackend;
}

const ADAPTERS: Readonly<Record<WireFormat, Adapter>> = {
  gemini: geminiAdapter,
  openai: openAiCompatAdapter,
  anthropic: anthropicAdapter,
};

/** What a role that is not set up fails with, before any request. */
const NOT_SET_UP: Readonly<Record<Missing, SingleFailure['kind']>> = {
  key: 'noKey',
  model: 'model',
  server: 'invalidUrl',
};

const NOTES_LEAD_IN = 'Notes the person wrote for you. Follow them whenever they apply:';

/** The system text with the person's notes for the AI after it; unchanged when they are blank. */
export function withNotes(system: string, notes: string): string {
  const text = notes.trim();
  return text === '' ? system : paragraphs(system, lines(NOTES_LEAD_IN, text));
}

/**
 * Runs one user action under one deadline (D-16.23): the one in `deps` when there is one (it is
 * left running for its owner), else a new one from the timeout setting and the Cancel signal,
 * ended when `action` is done.
 */
export async function withDeadline<T>(
  deps: AiDeps,
  action: (deadline: Deadline) => Promise<T>,
): Promise<T> {
  if (deps.deadline !== undefined) return action(deps.deadline);
  const deadline = startDeadline({ timeoutSeconds: deps.settings.timeoutSec, cancel: deps.cancel });
  try {
    return await action(deadline);
  } finally {
    deadline.end();
  }
}

/** Sends one request through the pipeline and returns the validated answer or one failure. */
export function complete(request: TextRequest, deps: AiDeps): Promise<Result<string, AiFailure>>;
export function complete<T>(
  request: CheckedRequest<T>,
  deps: AiDeps,
): Promise<Result<T, AiFailure>>;
export function complete<T>(
  request: AiRequest<T>,
  deps: AiDeps,
): Promise<Result<T | string, AiFailure>> {
  const validate: Validate<T | string> = request.validate ?? ((text) => ok(text));
  return withDeadline(deps, (deadline) => run(request, validate, deps, deadline));
}

/** One request made concrete: everything both providers share. */
interface Call<T> {
  readonly request: RequestBase;
  readonly validate: Validate<T>;
  readonly deps: AiDeps;
  readonly deadline: Deadline;
  /** The prepared photos, base64 JPEG. */
  readonly images: readonly string[];
  readonly context: ReplyContext;
}

async function run<T>(
  request: RequestBase,
  validate: Validate<T>,
  deps: AiDeps,
  deadline: Deadline,
): Promise<Result<T, AiFailure>> {
  if (deadline.stoppedBy() !== undefined) return err(stopFailure(deadline));
  const photos = request.images ?? [];
  const role = roleFor({ images: photos }, deps.settings);
  const missing = missingFor(role, deps.keys)[0];
  if (missing !== undefined) return err({ kind: NOT_SET_UP[missing] });

  const prepared = await prepareAll(photos, deps.imageBackend);
  if (!prepared.ok) return prepared;
  const call: Call<T> = {
    request,
    validate,
    deps,
    deadline,
    images: prepared.value,
    context: { secrets: storedKeys(deps.keys) },
  };

  const first = await ask(call, role);
  if (first.ok || first.error.kind === 'cancelled') return first;
  // Cancel, or no time left: a standby would only be cut off.
  if (deadline.stoppedBy() !== undefined) return err(stopFailure(deadline));
  const standby = standbyFor(role, deps.settings, deps.keys);
  if (standby === null) return first;

  const second = await ask(call, standby);
  if (second.ok) return second;
  return err(bothFailed(nameOf(role), nameOf(standby), second.error));
}

/**
 * One provider's go: the request, one compact re-ask when the answer was cut off, then the
 * caller's reading of the text. Anything thrown on the way is a failure like any other.
 */
async function ask<T>(call: Call<T>, target: RoleTarget): Promise<Result<T, SingleFailure>> {
  try {
    let answer = await exchange(call, target, false);
    if (!answer.ok && answer.error.kind === 'truncated')
      answer = await exchange(call, target, true);
    return answer.ok ? call.validate(answer.value) : answer;
  } catch (error) {
    return err(thrownFailure(error, call.deadline));
  }
}

/**
 * Builds the request for `target`'s wire format, sends it on the retry ladder with a per-attempt
 * cap (75 s for a cloud vendor, the time left for a server the person runs; D-16.60) and reads
 * the reply. The re-ask adds the compact note to the prompt and asks OpenRouter for low effort;
 * the notes for the AI stay in the system part either way (R03.23).
 */
async function exchange<T>(
  call: Call<T>,
  target: RoleTarget,
  compact: boolean,
): Promise<Result<string, SingleFailure>> {
  const { request, deps, deadline, context } = call;
  const { settings } = deps;
  const provider = PROVIDERS[target.provider];
  const adapter = ADAPTERS[provider.format];
  const key = keyFor(target.provider, deps.keys);
  const input: AdapterInput = {
    provider: target.provider,
    baseUrl: target.baseUrl,
    model: target.model,
    key,
    system: withNotes(request.system, settings.instructions),
    prompt: compact
      ? paragraphs(
          request.prompt,
          compactRetryNote(settings.maxTokens, request.json ? 'json' : 'prose'),
        )
      : request.prompt,
    images: call.images,
    json: request.json,
    maxTokens: settings.maxTokens,
    openRouterEffort: compact ? 'low' : settings.openRouterEffort,
  };
  const { url, init } = adapter.build(input);
  const reply = await withRetries(
    () =>
      send(url, init, deadline, attemptCapMs(deadline, provider.selfHosted), {
        fetch: deps.fetch,
        provider: target.provider,
        keySent: key !== undefined,
      }),
    deadline,
    context,
  );
  if (!reply.ok) return reply;
  return adapter.read(reply.value.status, reply.value.body, context);
}

/** Every photo as a fresh JPEG (R03.12), in order; one that cannot be prepared fails them all. */
async function prepareAll(
  photos: readonly Blob[],
  backend: ImageBackend | undefined,
): Promise<Result<string[], SingleFailure>> {
  const prepared = await Promise.all(
    photos.map((photo) => prepareImage(photo, FOOD_PHOTO, backend)),
  );
  const images: string[] = [];
  for (const image of prepared) {
    if (!image.ok) return image;
    images.push(image.value.base64);
  }
  return ok(images);
}

/** The keys a provider's error text could echo, cut out of any detail kept for Details. */
function storedKeys(keys: ProviderKeys): string[] {
  return Object.values(keys).filter((key): key is string => typeof key === 'string');
}

function nameOf(target: RoleTarget): string {
  return PROVIDERS[target.provider].name;
}

/** The failure for an action the deadline stopped: a silent cancel, or the time limit. */
function stopFailure(deadline: Deadline): SingleFailure {
  return { kind: deadline.stoppedBy() === 'cancel' ? 'cancelled' : 'timeout' };
}

/**
 * Something threw outside `fetch` (a reader, a request builder). Read by its name, not its class:
 * DOMException differs between browsers and test environments.
 */
function thrownFailure(error: unknown, deadline: Deadline): SingleFailure {
  if (deadline.stoppedBy() !== undefined) return stopFailure(deadline);
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  if (name === 'AbortError') return { kind: 'cancelled' };
  if (name === 'TimeoutError') return { kind: 'timeout' };
  return { kind: 'generic' };
}
