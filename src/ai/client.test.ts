import { beforeEach, describe, expect, it } from 'vitest';
import { advanceAsync, useFakeTime } from '../test/time';
import { defaultModel, type ModelUse } from './catalog/presets';
import type { ProviderId } from './catalog/providers';
import { complete, withDeadline, withNotes, type AiDeps, type Validate } from './client';
import { startDeadline, type Deadline } from './deadline';
import { failureMessages } from './errors';
import type { ImageBackend } from './image';
import { parseModelJson, isRecord } from './parse/json';
import { compactRetryNote } from './prompts/shared';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ProviderKeys } from './settings';
import {
  fakeFetch,
  type FakeFetch,
  type FakeStep,
  type RecordedRequest,
} from './testing/fakeFetch';
import {
  anthropicAnswer,
  anthropicError,
  geminiAnswer,
  geminiError,
  openAiAnswer,
  openAiError,
} from './testing/wire';
import { err, ok } from '../lib/result';

const START = '2026-10-27T09:00:00Z';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages';
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

const KEYS: ProviderKeys = {
  gemini: 'gm-key-5150',
  anthropic: 'an-key-6260',
  openai: 'oa-key-7370',
  mistral: 'mi-key-8480',
  openrouter: 'or-key-9590',
};

const NOTES = 'I am vegetarian and cook with very little oil.';
const SYSTEM = 'You read meals for a food diary and answer with one JSON object.';
const PROMPT = 'Estimate the meal in the photos.';

const on = (provider: ProviderId, use: ModelUse) => ({
  on: true,
  provider,
  model: defaultModel(provider, use),
});

/** A photo standby on Anthropic. */
const PHOTO_STANDBY: Partial<AiSettings> = { imageStandby: on('anthropic', 'image') };
/** A text provider on OpenAI backed by Mistral. */
const TEXT_ROLES: Partial<AiSettings> = {
  textRole: on('openai', 'text'),
  textStandby: on('mistral', 'text'),
};

/** Decodes any photo; its JPEG carries the photo's byte size, so tests can tell photos apart. */
function sizedBackend(): { backend: ImageBackend; decoded: () => number } {
  let decoded = 0;
  const backend: ImageBackend = {
    decode: (blob) => {
      decoded += 1;
      return Promise.resolve({
        width: 800,
        height: 600,
        toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, blob.size)),
        close: () => undefined,
      });
    },
  };
  return { backend, decoded: () => decoded };
}

/** A backend that cannot read any photo (HEIC outside Safari). */
const unreadable: ImageBackend = {
  decode: () => Promise.reject(new DOMException('cannot decode', 'EncodingError')),
};

const photo = (size: number): Blob => new Blob([new Uint8Array(size)], { type: 'image/heic' });
/** The base64 the sized backend gives for a photo of `size` bytes. */
const jpegOf = (size: number): string => btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, size));

interface Setup {
  readonly settings?: Partial<AiSettings>;
  readonly keys?: ProviderKeys;
  readonly deadline?: Deadline;
  readonly cancel?: AbortSignal;
  readonly backend?: ImageBackend;
}

function depsFor(fake: FakeFetch, setup: Setup = {}): AiDeps {
  return {
    settings: { ...DEFAULT_AI_SETTINGS, instructions: NOTES, ...setup.settings },
    keys: setup.keys ?? KEYS,
    fetch: fake.fetch,
    deadline: setup.deadline,
    cancel: setup.cancel,
    imageBackend: setup.backend ?? sizedBackend().backend,
  };
}

/** Lets fake time run (retry waits, delays) and then gives the settled result. */
async function settle<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  await advanceAsync(ms);
  return promise;
}

/** A reader that wants an object with a `name`, like the food reader. */
const named: Validate<string> = (text) => {
  const parsed = parseModelJson(text);
  if (!parsed.ok) return parsed;
  const name = isRecord(parsed.value) ? parsed.value.name : undefined;
  return typeof name === 'string' ? ok(name) : err({ kind: 'invalidResponse' });
};

const photoRequest = (images: readonly Blob[] = [photo(3)]) => ({
  purpose: 'mealPhotos' as const,
  images,
  system: SYSTEM,
  prompt: PROMPT,
  json: true,
  validate: named,
});

const textRequest = { purpose: 'fitCheck' as const, system: SYSTEM, prompt: PROMPT, json: false };

const geminiOk = (text: string): FakeStep => ({ json: geminiAnswer(text) });
const geminiCut: FakeStep = {
  json: geminiAnswer('{"name": "Lentil', { finishReason: 'MAX_TOKENS' }),
};
const geminiBusy: FakeStep = { status: 503, json: geminiError(503, 'UNAVAILABLE', 'Busy.') };
const anthropicOk = (text: string): FakeStep => ({ json: anthropicAnswer(text) });

// ---- What went over the wire -------------------------------------------------------------

interface GeminiBody {
  readonly systemInstruction?: { readonly parts: readonly { readonly text: string }[] };
  readonly contents: readonly {
    readonly parts: readonly {
      readonly text?: string;
      readonly inlineData?: { readonly data: string };
    }[];
  }[];
  readonly generationConfig: Readonly<Record<string, unknown>>;
}

interface AnthropicBody {
  readonly system?: string;
  readonly messages: readonly {
    readonly content: readonly {
      readonly type: string;
      readonly text?: string;
      readonly source?: { readonly data: string };
    }[];
  }[];
}

interface ChatBody {
  readonly messages: readonly { readonly role: string; readonly content: unknown }[];
  readonly reasoning?: Readonly<Record<string, unknown>>;
}

const geminiBody = (request: RecordedRequest | undefined) => request?.body as GeminiBody;
const anthropicBody = (request: RecordedRequest | undefined) => request?.body as AnthropicBody;
const chatBody = (request: RecordedRequest | undefined) => request?.body as ChatBody;

const geminiSystem = (request: RecordedRequest | undefined) =>
  geminiBody(request).systemInstruction?.parts[0]?.text;
const geminiPrompt = (request: RecordedRequest | undefined) =>
  geminiBody(request)
    .contents[0]?.parts.map((part) => part.text)
    .filter((text) => text !== undefined)
    .join('');
const geminiPhotos = (request: RecordedRequest | undefined) =>
  geminiBody(request).contents[0]?.parts.flatMap((part) => part.inlineData?.data ?? []);
const anthropicPhotos = (request: RecordedRequest | undefined) =>
  anthropicBody(request).messages[0]?.content.flatMap((block) => block.source?.data ?? []);

const urlsOf = (fake: FakeFetch): string[] =>
  fake.requests.map((request) => request.url.slice(0, request.url.indexOf('/', 8)));

beforeEach(() => {
  useFakeTime(START);
});

describe('complete: the standby (D-16.22, R03.4)', () => {
  it('answers with the standby after the primary stays busy through the whole ladder', async () => {
    const fake = fakeFetch()
      .on(GEMINI, geminiBusy, geminiBusy, geminiBusy, geminiBusy)
      .on(ANTHROPIC, anthropicOk('{"name": "Lentil soup"}'));
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY })),
    );

    expect(result).toEqual({ ok: true, value: 'Lentil soup' });
    expect(urlsOf(fake)).toEqual([
      'https://generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com',
      'https://api.anthropic.com',
    ]);
  });

  it('tries the standby when the primary answer fails validation, and returns its value (ACC-E5-1)', async () => {
    const fake = fakeFetch()
      .on(GEMINI, geminiOk('{"dish": "soup", "kcal": 310}'))
      .on(ANTHROPIC, anthropicOk('{"name": "Lentil soup", "kcal": 310}'));
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY })),
    );

    expect(result).toEqual({ ok: true, value: 'Lentil soup' });
    expect(fake.requests).toHaveLength(2);
    expect(fake.pending()).toBe(0);
  });

  it('gives an unusable primary answer as invalidResponse when there is no standby', async () => {
    const fake = fakeFetch().on(GEMINI, geminiOk('I think this is soup.'));
    const result = await settle(complete(photoRequest(), depsFor(fake)));
    expect(result).toEqual({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('names both providers with the standby kind when both fail', async () => {
    const fake = fakeFetch()
      .on(GEMINI, { status: 500, json: geminiError(500, 'INTERNAL', 'Something broke.') })
      .on(ANTHROPIC, { status: 402, json: anthropicError('billing_error', 'Out of credit.') });
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY })),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      kind: 'bothFailed',
      primary: 'Gemini',
      standby: 'Anthropic',
      standbyFailure: { kind: 'credits', status: 402 },
    });
    expect(failureMessages(result.error).map((message) => message.key)).toEqual([
      'ai.failure.bothFailed',
      'ai.failure.credits',
    ]);
  });

  it('returns the primary failure as it is when no standby is on', async () => {
    const fake = fakeFetch().on(GEMINI, {
      status: 404,
      json: geminiError(404, 'NOT_FOUND', 'No such model.'),
    });
    const result = await settle(complete(photoRequest(), depsFor(fake)));
    expect(result).toMatchObject({ ok: false, error: { kind: 'model', status: 404 } });
    expect(fake.requests).toHaveLength(1);
  });

  it('never sends a photo request to the text standby', async () => {
    const fake = fakeFetch().on(GEMINI, {
      status: 500,
      json: geminiError(500, 'INTERNAL', 'Something broke.'),
    });
    const result = await settle(complete(photoRequest(), depsFor(fake, { settings: TEXT_ROLES })));

    expect(result).toMatchObject({ ok: false, error: { kind: 'generic' } });
    expect(urlsOf(fake)).toEqual(['https://generativelanguage.googleapis.com']);
  });

  it('serves a text request with the text role and backs it with the text standby', async () => {
    const fake = fakeFetch()
      .on(OPENAI, { status: 401, json: openAiError('Incorrect API key provided.') })
      .on(MISTRAL, { json: openAiAnswer('It fits: you have 600 kcal left.') });
    const result = await settle(
      complete(textRequest, depsFor(fake, { settings: { ...TEXT_ROLES, ...PHOTO_STANDBY } })),
    );

    expect(result).toEqual({ ok: true, value: 'It fits: you have 600 kcal left.' });
    expect(urlsOf(fake)).toEqual(['https://api.openai.com', 'https://api.mistral.ai']);
  });

  it('treats a reader that throws as a generic failure, which the standby can rescue', async () => {
    const touchy: Validate<string> = (text) => {
      if (text.includes('odd')) throw new TypeError('the reader tripped');
      return ok(text);
    };
    const request = { ...photoRequest(), validate: touchy };

    const alone = fakeFetch().on(GEMINI, geminiOk('an odd answer'));
    expect(await settle(complete(request, depsFor(alone)))).toEqual({
      ok: false,
      error: { kind: 'generic' },
    });

    const backed = fakeFetch()
      .on(GEMINI, geminiOk('an odd answer'))
      .on(ANTHROPIC, anthropicOk('a plain answer'));
    expect(await settle(complete(request, depsFor(backed, { settings: PHOTO_STANDBY })))).toEqual({
      ok: true,
      value: 'a plain answer',
    });
  });
});

describe('complete: an AbortError thrown outside fetch', () => {
  it('reads as a silent cancel by its name, and the standby is not tried', async () => {
    const aborting: Validate<string> = () => {
      throw new DOMException('The reader was stopped.', 'AbortError');
    };
    const fake = fakeFetch()
      .on(GEMINI, geminiOk('{"name": "Soup"}'))
      .on(ANTHROPIC, anthropicOk('{"name": "Soup"}'));
    const result = await settle(
      complete(
        { ...photoRequest(), validate: aborting },
        depsFor(fake, { settings: PHOTO_STANDBY }),
      ),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(fake.requests).toHaveLength(1);
  });
});

describe('complete: a cut-off answer is asked for once more (03 §3.8)', () => {
  it('asks once more with the compact note and returns that answer (ACC-E6-1)', async () => {
    const fake = fakeFetch().on(GEMINI, geminiCut, geminiOk('{"name": "Lentil soup"}'));
    const result = await settle(complete(photoRequest(), depsFor(fake)));

    expect(result).toEqual({ ok: true, value: 'Lentil soup' });
    const [first, again] = fake.requests;
    const note = compactRetryNote(1_024, 'json');
    expect(note).toContain('1024');
    expect(geminiPrompt(first)).not.toContain(note);
    expect(geminiPrompt(again)).toBe(`${PROMPT}\n\n${note}`);
    expect(geminiPhotos(again)).toEqual([jpegOf(3)]);
  });

  it('gives truncated when the answer is cut off twice, after two requests', async () => {
    const fake = fakeFetch().on(GEMINI, geminiCut, geminiCut);
    const result = await settle(complete(photoRequest(), depsFor(fake)));

    expect(result).toEqual({ ok: false, error: { kind: 'truncated' } });
    expect(fake.requests).toHaveLength(2);
  });

  it('tries the standby after two cut-off answers', async () => {
    const fake = fakeFetch()
      .on(GEMINI, geminiCut, geminiCut)
      .on(ANTHROPIC, anthropicOk('{"name": "Lentil soup"}'));
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY })),
    );
    expect(result).toEqual({ ok: true, value: 'Lentil soup' });
    expect(fake.requests).toHaveLength(3);
  });

  it('asks a prose request again for a short plain answer, without JSON mode', async () => {
    const fake = fakeFetch().on(
      GEMINI,
      { json: geminiAnswer('It fits today becau', { finishReason: 'MAX_TOKENS' }) },
      geminiOk('It fits today.'),
    );
    const result = await settle(
      complete(textRequest, depsFor(fake, { settings: { maxTokens: 300 } })),
    );

    expect(result).toEqual({ ok: true, value: 'It fits today.' });
    const [first, again] = fake.requests;
    expect(geminiBody(first).generationConfig).not.toHaveProperty('responseMimeType');
    expect(geminiBody(again).generationConfig).not.toHaveProperty('responseMimeType');
    expect(geminiPrompt(again)).toBe(`${PROMPT}\n\n${compactRetryNote(300, 'prose')}`);
  });

  it('asks OpenRouter for low effort on the re-ask only (R03.11)', async () => {
    const fake = fakeFetch().on(
      OPENROUTER,
      { json: openAiAnswer('{"name": "Len', { finishReason: 'length' }) },
      { json: openAiAnswer('{"name": "Lentil soup"}') },
    );
    const settings: Partial<AiSettings> = {
      textRole: on('openrouter', 'text'),
      openRouterEffort: 'high',
    };
    const result = await settle(
      complete({ ...textRequest, json: true, validate: named }, depsFor(fake, { settings })),
    );

    expect(result).toEqual({ ok: true, value: 'Lentil soup' });
    const [first, again] = fake.requests;
    expect(chatBody(first).reasoning).toEqual({ exclude: true, effort: 'high' });
    expect(chatBody(again).reasoning).toEqual({ exclude: true, effort: 'low' });
  });
});

describe('complete: notes for the AI in the system channel (D-16.24, R03.23)', () => {
  it('sends the notes to the primary, the re-ask and the standby (ACC-E11-1)', async () => {
    const fake = fakeFetch()
      .on(GEMINI, geminiCut, geminiCut)
      .on(ANTHROPIC, anthropicOk('{"name": "Lentil soup"}'));
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY })),
    );
    expect(result.ok).toBe(true);

    const [primary, reAsk, standby] = fake.requests;
    for (const system of [
      geminiSystem(primary),
      geminiSystem(reAsk),
      anthropicBody(standby).system,
    ]) {
      expect(system?.startsWith(SYSTEM)).toBe(true);
      expect(system).toContain(NOTES);
    }
    expect(geminiPrompt(primary)).not.toContain(NOTES);
    expect(geminiPrompt(reAsk)).not.toContain(NOTES);
    const standbyText = anthropicBody(standby).messages[0]?.content.find((b) => b.type === 'text');
    expect(standbyText?.text).toBe(PROMPT);
  });

  it('sends the notes in the system message of the OpenAI-compatible format', async () => {
    const fake = fakeFetch().on(OPENAI, { json: openAiAnswer('It fits.') });
    await settle(complete(textRequest, depsFor(fake, { settings: TEXT_ROLES })));

    const [system, user] = chatBody(fake.requests[0]).messages;
    expect(system?.role).toBe('system');
    expect(system?.content).toEqual(withNotes(SYSTEM, NOTES));
    expect(user).toEqual({ role: 'user', content: PROMPT });
  });

  it('sends the system text alone when the notes are blank', async () => {
    const fake = fakeFetch().on(GEMINI, geminiOk('{"name": "Soup"}'));
    await settle(complete(photoRequest(), depsFor(fake, { settings: { instructions: ' \n ' } })));
    expect(geminiSystem(fake.requests[0])).toBe(SYSTEM);
    expect(withNotes(SYSTEM, '')).toBe(SYSTEM);
  });
});

describe('complete: Cancel is silent (R03.6)', () => {
  it('stops at once when Cancel comes during a retry wait, and never calls the standby', async () => {
    const cancel = new AbortController();
    const fake = fakeFetch()
      .on(GEMINI, geminiBusy, geminiOk('{"name": "Soup"}'))
      .on(ANTHROPIC, anthropicOk('{"name": "Soup"}'));
    const running = complete(
      photoRequest(),
      depsFor(fake, { settings: PHOTO_STANDBY, cancel: cancel.signal }),
    );
    await advanceAsync(500);
    cancel.abort();
    const result = await settle(running);

    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(fake.requests).toHaveLength(1);
    if (!result.ok) expect(failureMessages(result.error)).toEqual([]);
  });

  it('reports Cancel during the standby request as cancelled, not as both failed', async () => {
    const cancel = new AbortController();
    const fake = fakeFetch()
      .on(GEMINI, { status: 500, json: geminiError(500, 'INTERNAL', 'Something broke.') })
      .on(ANTHROPIC, { ...anthropicOk('{"name": "Soup"}'), delayMs: 5_000 });
    const running = complete(
      photoRequest(),
      depsFor(fake, { settings: PHOTO_STANDBY, cancel: cancel.signal }),
    );
    await advanceAsync(1_000);
    expect(fake.requests).toHaveLength(2);
    cancel.abort();
    expect(await settle(running)).toEqual({ ok: false, error: { kind: 'cancelled' } });
  });

  it('sends nothing when the action was cancelled before the call', async () => {
    const cancel = new AbortController();
    cancel.abort();
    const deadline = startDeadline({ timeoutSeconds: 180, cancel: cancel.signal });
    const fake = fakeFetch();
    const result = await settle(complete(photoRequest(), depsFor(fake, { deadline })));
    expect(result).toEqual({ ok: false, error: { kind: 'cancelled' } });
    expect(fake.requests).toHaveLength(0);
  });
});

describe('complete: what fails before any request', () => {
  it('refuses with noKey and sends nothing, even with a standby on (03 §3.4)', async () => {
    const fake = fakeFetch();
    const result = await settle(
      complete(
        photoRequest(),
        depsFor(fake, { settings: PHOTO_STANDBY, keys: { anthropic: KEYS.anthropic } }),
      ),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'noKey' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('refuses a Custom server without a model or an address before sending', async () => {
    const fake = fakeFetch();
    const noModel = await settle(
      complete(
        textRequest,
        depsFor(fake, {
          settings: {
            textRole: { on: true, provider: 'custom', model: ' ' },
            endpoints: { custom: { main: 'https://relay.example.org/v1', standby: '' } },
          },
        }),
      ),
    );
    const noAddress = await settle(
      complete(
        textRequest,
        depsFor(fake, { settings: { textRole: { on: true, provider: 'custom', model: 'm-1' } } }),
      ),
    );
    expect(noModel).toEqual({ ok: false, error: { kind: 'model' } });
    expect(noAddress).toEqual({ ok: false, error: { kind: 'invalidUrl' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('fails a photo it cannot prepare as imageConversion, with no request and no standby', async () => {
    const fake = fakeFetch();
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY, backend: unreadable })),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'imageConversion' } });
    expect(fake.requests).toHaveLength(0);
  });

  it('prepares the photos once and sends the same JPEGs, in order, to the primary and the standby', async () => {
    const sized = sizedBackend();
    const fake = fakeFetch()
      .on(GEMINI, { status: 500, json: geminiError(500, 'INTERNAL', 'Something broke.') })
      .on(ANTHROPIC, anthropicOk('{"name": "Soup"}'));
    await settle(
      complete(
        photoRequest([photo(5), photo(3)]),
        depsFor(fake, { settings: PHOTO_STANDBY, backend: sized.backend }),
      ),
    );

    expect(sized.decoded()).toBe(2);
    expect(geminiPhotos(fake.requests[0])).toEqual([jpegOf(5), jpegOf(3)]);
    expect(anthropicPhotos(fake.requests[1])).toEqual([jpegOf(5), jpegOf(3)]);
  });
});

describe('complete: one time limit for the action (D-16.23, D-16.60)', () => {
  it('stops at the timeout setting and does not start the standby with no time left', async () => {
    const fake = fakeFetch()
      .on(GEMINI, { ...geminiOk('{"name": "Soup"}'), delayMs: 40_000 })
      .on(ANTHROPIC, anthropicOk('{"name": "Soup"}'));
    const running = complete(
      photoRequest(),
      depsFor(fake, { settings: { ...PHOTO_STANDBY, timeoutSec: 30 } }),
    );
    await advanceAsync(29_999);
    expect(fake.requests).toHaveLength(1);
    const result = await settle(running, 1);

    expect(result).toEqual({ ok: false, error: { kind: 'timeout' } });
    expect(fake.requests).toHaveLength(1);
  });

  it('gives the standby its try when one attempt hits the 75 s cap', async () => {
    const fake = fakeFetch()
      .on(GEMINI, { ...geminiOk('{"name": "Soup"}'), delayMs: 80_000 })
      .on(ANTHROPIC, anthropicOk('{"name": "Lentil soup"}'));
    const result = await settle(
      complete(photoRequest(), depsFor(fake, { settings: PHOTO_STANDBY })),
      75_000,
    );
    expect(result).toEqual({ ok: true, value: 'Lentil soup' });
  });

  it('uses a deadline handed in and leaves it running for its owner', async () => {
    const deadline = startDeadline({ timeoutSeconds: 60 });
    const fake = fakeFetch().on(GEMINI, geminiOk('{"name": "Soup"}'));
    const result = await settle(complete(photoRequest(), depsFor(fake, { deadline })), 1_000);

    expect(result).toEqual({ ok: true, value: 'Soup' });
    expect(deadline.remainingMs()).toBe(59_000);
    await advanceAsync(59_000);
    expect(deadline.stoppedBy()).toBe('deadline');
  });

  it('withDeadline ends the deadline it started and only that one', async () => {
    const fake = fakeFetch();
    let started: Deadline | undefined;
    await withDeadline(depsFor(fake), (deadline) => {
      started = deadline;
      return Promise.resolve();
    });
    expect(started?.remainingMs()).toBe(180_000);
    await advanceAsync(180_000);
    // Ended: its timer is gone, so it never fires.
    expect(started?.stoppedBy()).toBeUndefined();
  });
});
