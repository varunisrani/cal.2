// The one food analysis of the app (02 §3.4, §3.10, R02.10, D-16.46): photos of a meal, a label
// photo after a barcode miss, or a typed description, sent to the AI under one time limit from
// the AI settings, with the overlay up and the tab bar hidden meanwhile. A finished analysis is
// stored as the analysis draft (photo ids, source) before the review opens, so a reload opens the
// review again; the capture sheet's record is dropped then, its photos now named by the draft.
//
// Results race with Cancel, a newer analysis and a review that was closed (R02.10). Every start
// moves the drafts table's generation on (dropping the draft waiting for review and letting its
// photos go), a result is stored only under the generation its attempt began, and an attempt
// that was cancelled or overtaken never opens: it clears what it may have stored under its own
// generation and lets its photos go. Photos are only ever released through `releaseIfUnused`, so
// a photo that the capture record, a newer draft or a logged entry still names is kept.
//
// A food picked from a reuse list (P06-12) reaches the review the same way, without the AI:
// `openForReview` takes over like a start, stores the draft under a new generation and shows it.

import type { ProviderId } from '../ai/catalog/providers';
import type { AiDeps } from '../ai/client';
import { startDeadline } from '../ai/deadline';
import { failureMessages, type AiFailure, type AiMessage } from '../ai/errors';
import type { ImageBackend } from '../ai/image';
import { DEFAULT_AI_SETTINGS, type AiSettings, type ProviderKeys } from '../ai/settings';
import type { AppStateStore } from '../app/appState';
import type { DraftsRepo } from '../data/repos/draftsRepo';
import type { PhotoRepo } from '../data/repos/photoRepo';
import type { SecretsRepo } from '../data/repos/secretsRepo';
import type { SettingsRepo } from '../data/repos/settingsRepo';
import type { AnalysisDraft, EntrySource, NutritionDraft } from '../domain/model';
import { systemClock, type Clock } from '../lib/clock';
import { ok, type Result } from '../lib/result';

/** What is analysed; it is also the source the draft is stored with. */
export type AnalysisKind = 'photo' | 'label' | 'text';

/** Photos of one meal from the capture sheet. */
export interface PhotoInputs {
  /** Stored photos, in the order taken. */
  readonly photoIds: readonly string[];
  readonly note: string;
  /** The photos show one plate built up in steps. */
  readonly progressive: boolean;
  /**
   * The barcode of an armed label scan (P06-17 arms it): these photos are that product's label,
   * so the analysis runs as a `label` one.
   */
  readonly armedLabel?: string | null;
}

/** A photo of a product's nutrition label, taken after its barcode found nothing. */
export interface LabelInputs {
  readonly photoIds: readonly string[];
  readonly note: string;
  /** Kept on the draft's product details, so the label is found again by its barcode. */
  readonly barcode?: string;
}

/** A meal described in words. */
export interface TextInputs {
  readonly text: string;
}

export interface AnalysisInputs {
  readonly photo: PhotoInputs;
  readonly label: LabelInputs;
  readonly text: TextInputs;
}

/** One analysis as it was asked for, so Retry can ask again. */
export type AnalysisRequest = {
  readonly [K in AnalysisKind]: { readonly kind: K; readonly inputs: AnalysisInputs[K] };
}[AnalysisKind];

export type AnalysisState =
  | { readonly phase: 'idle' }
  /** The overlay: the first photo (none for text) and Cancel. */
  | {
      readonly phase: 'analysing';
      readonly kind: AnalysisKind;
      readonly photoIds: readonly string[];
    }
  /** The failure's messages, with Retry (the same request) and Cancel. */
  | {
      readonly phase: 'failed';
      readonly kind: AnalysisKind;
      readonly photoIds: readonly string[];
      readonly failure: AiFailure;
      readonly messages: readonly AiMessage[];
    }
  /** A stored draft waiting for review (P06-06 opens it). */
  | { readonly phase: 'reviewReady'; readonly draft: AnalysisDraft; readonly generation: number };

/** Where a food handed straight to the review came from (a reuse list, P06-12). */
export interface ReviewOrigin {
  /** Photos the food already names: reused, never copied. */
  readonly photoIds: readonly string[];
  /** Kept on the entry the review logs. */
  readonly source: EntrySource;
}

export interface AnalysisService {
  getSnapshot(): AnalysisState;
  subscribe(onChange: () => void): () => void;
  /**
   * Starts an analysis, taking over from any other: one still running is stopped, a draft
   * waiting for review is dropped. Resolves once this attempt is over (review ready, failed,
   * cancelled or overtaken); never rejects.
   */
  start<K extends AnalysisKind>(kind: K, inputs: AnalysisInputs[K]): Promise<void>;
  /** Cancel on the overlay or the failure: stops silently and lets the attempt's photos go. */
  cancel(): Promise<void>;
  /** Retry on the failure: the same request again. */
  retry(): Promise<void>;
  /**
   * The review was logged or cancelled: drops the stored draft and lets its photos go (a logged
   * entry that names them keeps them).
   */
  closeReview(): Promise<void>;
  /** At app start: a stored draft opens the review, unless an analysis started meanwhile. */
  restore(): Promise<void>;
  /**
   * Opens the review for a food that needs no analysis (a reuse pick, P06-12): takes over like
   * `start` (a running analysis stops, a draft waiting for review is dropped), stores the draft
   * so a reload opens it again (D-16.46) and shows it as `reviewReady`; it is never logged here.
   * Resolves true once the review is ready, false when a newer start or pick took over; rejects
   * when the draft cannot be stored. Optional only until every stand-in carries it;
   * `createAnalysisService` always provides it.
   */
  openForReview?(draft: NutritionDraft, origin: ReviewOrigin): Promise<boolean>;
}

export interface AnalysisDeps {
  readonly draftsRepo: Pick<
    DraftsRepo,
    'begin' | 'saveResult' | 'load' | 'clear' | 'loadCapture' | 'clearCapture'
  >;
  readonly photoRepo: Pick<PhotoRepo, 'get' | 'releaseIfUnused'>;
  readonly settingsRepo: Pick<SettingsRepo, 'get'>;
  readonly secretsRepo: Pick<SecretsRepo, 'get'>;
  /** The tab bar hides while the overlay shows. */
  readonly overlay: Pick<AppStateStore, 'setAnalysisOverlay'>;
  readonly fetch: typeof fetch;
  /** When a draft was made; the device clock by default. */
  readonly clock?: Clock;
  /** Decodes photos for the AI; the browser's by default. */
  readonly imageBackend?: ImageBackend;
}

/** One go at a request, from its start until it is shown, cancelled or overtaken. */
interface Attempt {
  readonly request: AnalysisRequest;
  /** Every photo the request names: released when the attempt ends without a review. */
  readonly photoIds: readonly string[];
  readonly controller: AbortController;
  /** Cancelled or overtaken: it never opens, and cleans up after itself. */
  ended: boolean;
  /** Ended by the person's Cancel (the capture record goes too), not by a newer start. */
  cancelled: boolean;
  /** Its run has returned: whoever ends it from now on cleans up. */
  finished: boolean;
  /** The generation `begin` gave it. */
  generation?: number;
  /** Its draft reached the database. */
  saved: boolean;
  /** The run, and the clean-up after a predecessor. */
  done: Promise<void>;
}

/** What the AI made of a request, and the photos that were sent with it. */
interface Analysed {
  readonly food: NutritionDraft;
  readonly photoIds: readonly string[];
}

const IDLE: AnalysisState = { phase: 'idle' };

/** A request in its working form: an armed label scan becomes a label one; text is trimmed. */
function requestFor(request: AnalysisRequest): AnalysisRequest {
  if (request.kind === 'text') {
    return { kind: 'text', inputs: { text: request.inputs.text.trim() } };
  }
  if (request.kind === 'photo') {
    const { photoIds, note, armedLabel } = request.inputs;
    const barcode = armedLabel?.trim() ?? '';
    if (barcode !== '') return { kind: 'label', inputs: { photoIds, note, barcode } };
  }
  return request;
}

function photoIdsOf(request: AnalysisRequest): readonly string[] {
  return request.kind === 'text' ? [] : request.inputs.photoIds;
}

/** The draft with the label's barcode on its product details. */
function withBarcode(draft: NutritionDraft, barcode: string | undefined): NutritionDraft {
  const code = barcode?.trim() ?? '';
  if (code === '') return draft;
  const product = draft.product
    ? { ...draft.product, barcode: code }
    : { barcode: code, allergens: [], traces: [], labels: [], categories: [] };
  return { ...draft, product };
}

export function createAnalysisService(deps: AnalysisDeps): AnalysisService {
  const { draftsRepo, photoRepo, overlay } = deps;
  const clock = deps.clock ?? systemClock;
  let state: AnalysisState = IDLE;
  const listeners = new Set<() => void>();
  /** The attempt behind the overlay or the failure. */
  let current: Attempt | null = null;
  /** Counts starts, so a restore can tell that one came while it read. */
  let starts = 0;

  function show(next: AnalysisState): void {
    state = next;
    overlay.setAnalysisOverlay(next.phase === 'analysing');
    for (const listener of [...listeners]) listener();
  }

  /**
   * Deletes photos nothing names any more, except those the attempt on screen is sending (a
   * Retry of photos no record names). A failure is left to the photo repository's prune.
   */
  async function release(ids: readonly string[]): Promise<void> {
    const sending = current?.photoIds ?? [];
    const unused = ids.filter((id) => !sending.includes(id));
    if (unused.length === 0) return;
    try {
      await photoRepo.releaseIfUnused(unused);
    } catch {
      // Unused photos older than a few minutes are pruned later.
    }
  }

  /**
   * Drops the capture record when it holds this attempt's photos, letting go of the others. A
   * failure leaves the record: the capture sheet shows those photos again next time.
   */
  async function dropCapture(attempt: Attempt): Promise<void> {
    if (attempt.photoIds.length === 0) return;
    try {
      const capture = await draftsRepo.loadCapture();
      if (!capture?.photoIds.some((id) => attempt.photoIds.includes(id))) return;
      await release(await draftsRepo.clearCapture());
    } catch {
      // Housekeeping only: the analysis itself went through.
    }
  }

  /** What an attempt that never opened leaves behind: its stored draft and its photos. */
  async function cleanUp(attempt: Attempt): Promise<void> {
    try {
      if (attempt.saved && attempt.generation !== undefined) {
        // A newer attempt that already began owns the record: then this changes nothing.
        await release((await draftsRepo.clear(attempt.generation)).photoIds);
      }
    } catch {
      // The record stays until the next start or close moves the generation on.
    }
    if (attempt.cancelled) await dropCapture(attempt);
    await release(attempt.photoIds);
  }

  /** Takes an attempt off the screen for good and stops its request. */
  function retire(attempt: Attempt, byCancel: boolean): void {
    attempt.ended = true;
    attempt.cancelled = byCancel;
    attempt.controller.abort();
    if (current === attempt) current = null;
  }

  /** The stored AI setup: the settings (the defaults when not set up) and the roles' keys. */
  async function aiAccess(): Promise<{ settings: AiSettings; keys: ProviderKeys }> {
    const settings = (await deps.settingsRepo.get('ai.settings')) ?? DEFAULT_AI_SETTINGS;
    const providers = new Set<ProviderId>([
      settings.primary.provider,
      settings.textRole.provider,
      settings.imageStandby.provider,
      settings.textStandby.provider,
    ]);
    const keys: Partial<Record<ProviderId, string>> = {};
    for (const provider of providers) {
      const key = await deps.secretsRepo.get(provider);
      if (key !== null) keys[provider] = key;
    }
    return { settings, keys };
  }

  /** The stored photos that can still be read, with their ids, in order. */
  async function photosOf(ids: readonly string[]) {
    const rows = await Promise.all(ids.map((id) => photoRepo.get(id)));
    const found = rows.flatMap((row) => (row ? [row] : []));
    return { ids: found.map((row) => row.id), images: found.map((row) => row.blob) };
  }

  /** The AI task for the request, under one deadline that Cancel also stops. */
  async function analyse(attempt: Attempt): Promise<Result<Analysed, AiFailure>> {
    // The AI layer is fetched on first use, before the deadline starts (P10-08's budget).
    const { analyzeLabelScan, analyzePhotos, analyzeText } = await import('../ai/tasks/food');
    const { settings, keys } = await aiAccess();
    // A price the person's words state without a currency is in theirs (D-16.107).
    const currency = await deps.settingsRepo.get('money.currency');
    const deadline = startDeadline({
      timeoutSeconds: settings.timeoutSec,
      cancel: attempt.controller.signal,
    });
    const ai: AiDeps = {
      settings,
      keys,
      fetch: deps.fetch,
      deadline,
      ...(deps.imageBackend ? { imageBackend: deps.imageBackend } : {}),
    };
    try {
      const { request } = attempt;
      if (request.kind === 'text') {
        const result = await analyzeText(request.inputs.text, ai, currency);
        return result.ok ? ok({ food: result.value, photoIds: [] }) : result;
      }
      const { ids, images } = await photosOf(request.inputs.photoIds);
      const { note } = request.inputs;
      if (request.kind === 'label') {
        const result = await analyzeLabelScan({ images, note, currency }, ai);
        if (!result.ok) return result;
        return ok({ food: withBarcode(result.value, request.inputs.barcode), photoIds: ids });
      }
      const { progressive } = request.inputs;
      const result = await analyzePhotos({ images, note, progressive, currency }, ai);
      return result.ok ? ok({ food: result.value, photoIds: ids }) : result;
    } finally {
      deadline.end();
    }
  }

  async function run(attempt: Attempt): Promise<void> {
    try {
      const begun = await draftsRepo.begin();
      attempt.generation = begun.generation;
      await release(begun.previousPhotoIds);
      if (attempt.ended) return;

      const result = await analyse(attempt);
      if (attempt.ended) return;
      if (!result.ok) {
        if (result.error.kind === 'cancelled') {
          // Only our own abort cancels; treat a stray one as the person's Cancel.
          retire(attempt, true);
          show(IDLE);
          return;
        }
        show({
          phase: 'failed',
          kind: attempt.request.kind,
          photoIds: attempt.photoIds,
          failure: result.error,
          messages: failureMessages(result.error),
        });
        return;
      }

      const draft: AnalysisDraft = {
        draft: result.value.food,
        photoIds: result.value.photoIds,
        source: attempt.request.kind,
        createdAt: clock.now(),
        fromSavedLabel: false,
      };
      attempt.saved = (await draftsRepo.saveResult(begun.generation, draft)) === 'saved';
      if (attempt.ended) return;
      if (!attempt.saved) {
        // Another tab began an analysis meanwhile: this one is over.
        retire(attempt, false);
        show(IDLE);
        return;
      }
      await dropCapture(attempt);
      if (attempt.ended) return;
      current = null;
      show({ phase: 'reviewReady', draft, generation: begun.generation });
    } catch {
      if (!attempt.ended) {
        show({
          phase: 'failed',
          kind: attempt.request.kind,
          photoIds: attempt.photoIds,
          failure: { kind: 'generic' },
          messages: failureMessages({ kind: 'generic' }),
        });
      }
    } finally {
      attempt.finished = true;
      if (attempt.ended) await cleanUp(attempt);
    }
  }

  /**
   * Takes the attempt on screen (running, or its failure) off for good, as a newer start does;
   * resolves once a finished one has cleaned up after itself.
   */
  function overtake(previous: Attempt | null): Promise<void> {
    if (!previous) return Promise.resolve();
    retire(previous, false);
    // A finished one (a failure on screen) has no run left to clean up after it.
    return previous.finished ? cleanUp(previous) : Promise.resolve();
  }

  async function openDraft(food: NutritionDraft, origin: ReviewOrigin): Promise<boolean> {
    starts += 1;
    const mine = starts;
    const before = overtake(current);
    // Nothing to wait for on screen: the draft is written at once.
    if (state.phase !== 'idle') show(IDLE);
    try {
      const begun = await draftsRepo.begin();
      await release(begun.previousPhotoIds);
      if (starts !== mine) return false;
      const draft: AnalysisDraft = {
        draft: food,
        photoIds: [...origin.photoIds],
        source: origin.source,
        createdAt: clock.now(),
        fromSavedLabel: false,
      };
      // Stale when a newer start or pick (here or in another tab) began meanwhile: it owns the
      // record, and its begin drops this draft when it lands after this write.
      const saved = await draftsRepo.saveResult(begun.generation, draft);
      if (saved !== 'saved' || starts !== mine) return false;
      show({ phase: 'reviewReady', draft, generation: begun.generation });
      return true;
    } finally {
      await before;
    }
  }

  function startRequest(asked: AnalysisRequest): Promise<void> {
    const request = requestFor(asked);
    starts += 1;
    const previous = current;
    const attempt: Attempt = {
      request,
      photoIds: photoIdsOf(request),
      controller: new AbortController(),
      ended: false,
      cancelled: false,
      finished: false,
      saved: false,
      done: Promise.resolve(),
    };
    current = attempt;
    const before = overtake(previous);
    show({ phase: 'analysing', kind: request.kind, photoIds: attempt.photoIds });
    attempt.done = Promise.all([run(attempt), before]).then(() => undefined);
    return attempt.done;
  }

  return {
    getSnapshot: () => state,

    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    start: (kind, inputs) => startRequest({ kind, inputs } as AnalysisRequest),

    cancel() {
      const attempt = current;
      if (!attempt) return Promise.resolve();
      retire(attempt, true);
      show(IDLE);
      return attempt.finished ? cleanUp(attempt) : attempt.done;
    },

    retry() {
      if (state.phase !== 'failed' || !current) return Promise.resolve();
      return startRequest(current.request);
    },

    async closeReview() {
      if (state.phase !== 'reviewReady') return;
      const { generation } = state;
      show(IDLE);
      await release((await draftsRepo.clear(generation)).photoIds);
    },

    async restore() {
      const startsBefore = starts;
      const stored = await draftsRepo.load();
      if (!stored || starts !== startsBefore || state.phase !== 'idle') return;
      show({ phase: 'reviewReady', draft: stored.draft, generation: stored.generation });
    },

    openForReview: openDraft,
  };
}
