// Adding a part to a meal under review (02 §3.15): one photo or a typed description is sent to the
// AI and comes back collapsed into one part (its own parts are not expanded), the photo kept as
// the part's photo. Each review sheet opens its own session; a session runs one request at a time,
// each under its own time limit from the AI settings, and `close` (the sheet went) stops the
// request in flight.
//
// The photo is stored only after the AI answered, so a failed or stopped request never writes
// one. A stored photo is named by nothing until the meal is logged, so the session remembers it
// and, when it closes, lets go of every one nothing names by then: the photo of a part that was
// removed again, or of a review that was cancelled. A logged entry that names one keeps it.

import type { AiDeps } from '../ai/client';
import { failureMessages, type AiFailure, type AiMessage } from '../ai/errors';
import type { ImageBackend } from '../ai/image';
import type { PhotoRepo } from '../data/repos/photoRepo';
import type { IngredientLine, NutritionDraft } from '../domain/model';
import { draftAsLine } from '../domain/servings/ingredients';
import type { Result } from '../lib/result';
import type { StoredAiAccess } from './aiAccess';
import { MAX_PICK_BYTES } from './captureDrafts';
import type { PhotoService } from './photos';

/** Why a picked file is refused before anything is sent. */
export type IntakeRefusal = 'tooLarge' | 'unreadable';

export type IntakeOutcome =
  /** The part to add, as the AI saw it. */
  | { readonly kind: 'line'; readonly line: IngredientLine }
  /** The AI request failed; the messages say why (never empty). */
  | {
      readonly kind: 'failed';
      readonly failure: AiFailure;
      readonly messages: readonly AiMessage[];
    }
  /** The file was refused before any request. */
  | { readonly kind: 'refused'; readonly reason: IntakeRefusal }
  /** Another request of this session is still running: nothing was done. */
  | { readonly kind: 'busy' }
  /** The session closed (or the request was cancelled): nothing to show. */
  | { readonly kind: 'stopped' };

/** One review sheet's part requests. */
export interface IntakeSession {
  /** A photo from the camera or the library: analysed as one part that keeps the photo. */
  photo(file: Blob): Promise<IntakeOutcome>;
  /** A typed description: analysed as one part. */
  describe(text: string): Promise<IntakeOutcome>;
  /**
   * The sheet went: stops the request in flight and lets go of the photos this session stored
   * that nothing names. Later requests are `stopped` at once.
   */
  close(): Promise<void>;
}

export interface IngredientIntakeService {
  /** A new session for a sheet that just opened. */
  open(): IntakeSession;
}

export interface IngredientIntakeDeps {
  readonly photos: Pick<PhotoService, 'store'>;
  readonly photoRepo: Pick<PhotoRepo, 'releaseIfUnused'>;
  /** Read for every request, so a key saved a moment ago is used. */
  readonly aiAccess: () => Promise<StoredAiAccess>;
  /** Handed to the AI client; services never use the global one. */
  readonly fetch: typeof fetch;
  /** Decodes photos for the AI; the browser's by default. */
  readonly imageBackend?: ImageBackend;
}

const BUSY: IntakeOutcome = { kind: 'busy' };
const STOPPED: IntakeOutcome = { kind: 'stopped' };

/** Why a file cannot be sent, judged by its size alone; null when its size is fine. */
function sizeProblem(file: Blob): IntakeRefusal | null {
  if (file.size === 0) return 'unreadable';
  return file.size > MAX_PICK_BYTES ? 'tooLarge' : null;
}

function failed(failure: AiFailure): IntakeOutcome {
  if (failure.kind === 'cancelled') return STOPPED;
  return { kind: 'failed', failure, messages: failureMessages(failure) };
}

export function createIngredientIntake(deps: IngredientIntakeDeps): IngredientIntakeService {
  /** Deletes photos nothing names. A failure is left to the photo repository's prune. */
  async function release(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await deps.photoRepo.releaseIfUnused(ids);
    } catch {
      // Unused photos older than a few minutes are pruned later.
    }
  }

  /** One food request under the timeout setting, stopped by `cancel`. */
  async function ask(
    task: (ai: AiDeps) => Promise<Result<NutritionDraft, AiFailure>>,
    cancel: AbortSignal,
  ): Promise<Result<NutritionDraft, AiFailure>> {
    const { settings, keys } = await deps.aiAccess();
    return task({
      settings,
      keys,
      fetch: deps.fetch,
      cancel,
      ...(deps.imageBackend ? { imageBackend: deps.imageBackend } : {}),
    });
  }

  return {
    open() {
      let closed = false;
      let running: AbortController | null = null;
      /** Photos this session stored, for `close` to let go of. */
      const stored: string[] = [];

      /** Runs `work` as the session's one request; anything thrown is a generic failure. */
      async function run(work: (cancel: AbortSignal) => Promise<IntakeOutcome>) {
        if (closed) return STOPPED;
        if (running) return BUSY;
        const controller = new AbortController();
        running = controller;
        try {
          return await work(controller.signal);
        } catch {
          return closed || controller.signal.aborted ? STOPPED : failed({ kind: 'generic' });
        } finally {
          if (running === controller) running = null;
        }
      }

      /** The photo kept for the part, or none when it cannot be stored (the part still counts). */
      async function keep(file: Blob): Promise<string[]> {
        try {
          const result = await deps.photos.store(file);
          if (result.kind !== 'stored') return [];
          stored.push(result.id);
          return [result.id];
        } catch {
          return [];
        }
      }

      return {
        photo(file) {
          return run(async (cancel) => {
            const problem = sizeProblem(file);
            if (problem) return { kind: 'refused', reason: problem };
            const request = { images: [file], note: '', progressive: false };
            // The AI layer loads on first use, never with the start-up download.
            const { analyzePhotos } = await import('../ai/tasks/food');
            const result = await ask((ai) => analyzePhotos(request, ai), cancel);
            if (closed) return STOPPED;
            if (!result.ok) return failed(result.error);
            const photoIds = await keep(file);
            if (closed) {
              await release(photoIds);
              return STOPPED;
            }
            return { kind: 'line', line: draftAsLine(result.value, photoIds) };
          });
        },

        describe(text) {
          return run(async (cancel) => {
            const { analyzeText } = await import('../ai/tasks/food');
            const result = await ask((ai) => analyzeText(text.trim(), ai), cancel);
            if (closed) return STOPPED;
            if (!result.ok) return failed(result.error);
            return { kind: 'line', line: draftAsLine(result.value, []) };
          });
        },

        async close() {
          closed = true;
          running?.abort();
          await release(stored.splice(0));
        },
      };
    },
  };
}
