// The Coach's one session for the whole app (P08-09, 04 §3.6). It lives as long as the app, so a
// reply still on its way survives switching tabs; it holds only whether a turn is pending, and
// the page reads the messages from the coach repository's live hook.
//
// A send marks the session pending before it waits for anything, so two quick taps start one
// turn (R04.5). A photo gets its small stored copy first; a photo without words is stored with a
// fixed short request to look at it. The question is stored before anything is asked, under the
// conversation's generation; then the data is copied into the turn's snapshot (its tools read
// nothing else, R04.22) and the engine runs, loaded on first use so the AI code stays out of the
// start-up download. The answer is stored under the same generation, so one that comes back after
// a Reset, in this tab or another, is dropped (R04.6, D-16.34). A failure marks the question with
// its kind and the provider's message, every stored key already cut out, for Details; Retry asks
// again without storing the question twice (R04.4, D-16.31). Nothing is logged: provider messages
// can carry keys and addresses.

import type { AiFailure } from '../../ai/errors';
import type { ImageBackend } from '../../ai/image';
import type { CoachRepo } from '../../data/repos/coachRepo';
import type { CoachMessage, CoachMessageState } from '../../domain/model';
import { browserImageCodec, type ImageCodec } from '../../lib/imageCodec';
import type { StoredAiAccess } from '../aiAccess';
import { takeSnapshot, type SnapshotSources } from './snapshot';

/**
 * The stored copy of an attached photo: P03-10's Coach thumbnail size (`COACH_THUMBNAIL` in
 * src/ai/image.ts, kept equal by a test), written here so that file is not part of the start-up
 * download. The model gets its own copy from the engine.
 */
export const COACH_THUMB = { maxEdge: 700, quality: 0.68 } as const;

export interface CoachSessionState {
  /** A turn is running: Send, the chips and Retry wait. */
  readonly pending: boolean;
}

/** How a send or a retry ended. */
export type TurnOutcome =
  /** Nothing to do: a turn was pending, there was nothing to send, or nothing to retry. */
  | 'ignored'
  /** The photo could not be read: nothing was stored or sent. */
  | 'photoUnreadable'
  /** The answer is stored. */
  | 'answered'
  /** The turn failed: the question, when it was stored, is marked for Details and Retry. */
  | 'failed'
  /** A Reset came first: nothing more was stored. */
  | 'dropped';

export interface CoachSession {
  /** The same object until something changes (for `useSyncExternalStore`). */
  getState(): CoachSessionState;
  /** Calls `listener` after every change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Asks a question, with an optional photo; resolves once the turn is over. Never rejects. */
  send(text: string, image?: Blob): Promise<TurnOutcome>;
  /** Asks a failed question again, without storing it twice. Never rejects. */
  retry(id: string): Promise<TurnOutcome>;
  /**
   * Stops the running turn at once and clears the conversation, moving its generation on.
   * Rejects only when the stored conversation could not be cleared.
   */
  reset(): Promise<void>;
}

export interface CoachSessionDeps {
  readonly coachRepo: Pick<CoachRepo, 'append' | 'list' | 'patch' | 'reset' | 'generation'>;
  /** Where each turn's snapshot is read from; its clock also stamps the messages. */
  readonly data: SnapshotSources;
  /** Read for every turn, so a key saved a moment ago is used. */
  readonly aiAccess: () => Promise<StoredAiAccess>;
  /** Handed to the AI layer; services never use the global one. */
  readonly fetch: typeof fetch;
  /** The question stored and sent for a photo without words (from the catalogue). */
  readonly photoOnlyText: () => string;
  /** Makes the stored thumbnail; the browser's by default. */
  readonly codec?: ImageCodec;
  /** Prepares the model's copy of a photo; the browser's by default. */
  readonly imageBackend?: ImageBackend;
}

/** One running send or retry. */
interface Run {
  readonly controller: AbortController;
  /** A Reset came: this run stores nothing more. */
  dropped: boolean;
}

const IDLE: CoachSessionState = Object.freeze({ pending: false });
const PENDING: CoachSessionState = Object.freeze({ pending: true });

/** The stored copy of a photo; null when the browser cannot read or draw it. */
async function thumbnailOf(photo: Blob, codec: ImageCodec): Promise<Blob | null> {
  try {
    const picture = await codec.decode(photo);
    if (picture === null) return null;
    try {
      return await picture.toJpeg(COACH_THUMB.maxEdge, COACH_THUMB.quality);
    } finally {
      picture.close();
    }
  } catch {
    return null;
  }
}

/** The mark of a failed question: one kind (the standby's when both failed) and its detail. */
function failedState(failure: AiFailure): CoachMessageState {
  const shown = failure.kind === 'bothFailed' ? failure.standbyFailure : failure;
  return shown.detail === undefined
    ? { status: 'failed', kind: shown.kind }
    : { status: 'failed', kind: shown.kind, details: shown.detail };
}

function isFailedQuestion(message: CoachMessage, id: string): boolean {
  return message.id === id && message.role === 'user' && message.state?.status === 'failed';
}

export function createCoachSession(deps: CoachSessionDeps): CoachSession {
  const { coachRepo } = deps;
  const { clock } = deps.data;
  const codec = deps.codec ?? browserImageCodec;
  const listeners = new Set<() => void>();
  let state = IDLE;
  let current: Run | null = null;
  /** Settles once the latest Reset has reached storage: a new turn reads the generation after. */
  let cleared: Promise<unknown> = Promise.resolve();
  /** Photos of failed questions as they were picked, for Retry while the app stays open. */
  const photos = new Map<string, Blob>();

  function show(next: CoachSessionState): void {
    if (state === next) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function begin(): Run {
    const run: Run = { controller: new AbortController(), dropped: false };
    current = run;
    show(PENDING);
    return run;
  }

  function end(run: Run): void {
    if (current !== run) return;
    current = null;
    show(IDLE);
  }

  async function markFailed(
    run: Run,
    question: CoachMessage,
    failure: AiFailure,
    image: Blob | undefined,
  ): Promise<TurnOutcome> {
    if (run.dropped) return 'dropped';
    const marked = await coachRepo.patch(question.id, { state: failedState(failure) });
    // Gone: the conversation was reset in another tab.
    if (marked === null) return 'dropped';
    if (image !== undefined) photos.set(question.id, image);
    return 'failed';
  }

  /** After a throw: marks a stored question `generic` when storage still lets us. */
  async function markBroken(
    run: Run,
    question: CoachMessage | null,
    image: Blob | undefined,
  ): Promise<TurnOutcome> {
    if (question === null) return run.dropped ? 'dropped' : 'failed';
    try {
      return await markFailed(run, question, { kind: 'generic' }, image);
    } catch {
      return 'failed';
    }
  }

  /** Runs the turn for a stored question and stores its answer or its failure. */
  async function answer(
    run: Run,
    question: CoachMessage,
    image: Blob | undefined,
    generation: number,
  ): Promise<TurnOutcome> {
    const [snapshot, messages, access, engine] = await Promise.all([
      takeSnapshot(deps.data),
      coachRepo.list(),
      deps.aiAccess(),
      import('./engine'),
    ]);
    if (snapshot === null) return markFailed(run, question, { kind: 'generic' }, image);
    if (run.dropped) return 'dropped';
    const result = await engine.runTurn(
      {
        messages,
        question: { id: question.id, text: question.text },
        ...(image === undefined ? {} : { image }),
        snapshot,
      },
      {
        settings: access.settings,
        keys: access.keys,
        fetch: deps.fetch,
        cancel: run.controller.signal,
        ...(deps.imageBackend === undefined ? {} : { imageBackend: deps.imageBackend }),
      },
    );
    if (run.dropped) return 'dropped';
    if (!result.ok) {
      // Only a Reset cancels a turn, and it has already let this one go.
      if (result.error.kind === 'cancelled') return 'dropped';
      return markFailed(run, question, result.error, image);
    }
    const reply = await coachRepo.append(
      { role: 'assistant', text: result.value, at: clock.now() },
      generation,
    );
    if (reply === null) return 'dropped';
    photos.delete(question.id);
    return 'answered';
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async send(text, image) {
      const words = text.trim();
      if (state.pending || (words === '' && image === undefined)) return 'ignored';
      const run = begin();
      let question: CoachMessage | null = null;
      try {
        let thumb: Blob | undefined;
        if (image !== undefined) {
          const made = await thumbnailOf(image, codec);
          if (made === null) return 'photoUnreadable';
          thumb = made;
        }
        await cleared;
        if (run.dropped) return 'dropped';
        const generation = await coachRepo.generation();
        question = await coachRepo.append(
          {
            role: 'user',
            text: words === '' ? deps.photoOnlyText() : words,
            at: clock.now(),
            ...(thumb === undefined ? {} : { thumb }),
          },
          generation,
        );
        if (question === null || run.dropped) return 'dropped';
        return await answer(run, question, image, generation);
      } catch {
        return await markBroken(run, question, image);
      } finally {
        end(run);
      }
    },

    async retry(id) {
      if (state.pending) return 'ignored';
      const run = begin();
      let question: CoachMessage | null = null;
      try {
        await cleared;
        if (run.dropped) return 'dropped';
        const generation = await coachRepo.generation();
        const stored = await coachRepo.list();
        if (!stored.some((message) => isFailedQuestion(message, id))) return 'ignored';
        if (run.dropped) return 'dropped';
        // The mark goes while the question is asked again, and comes back if it fails again.
        question = await coachRepo.patch(id, { state: null });
        if (question === null || run.dropped) return 'dropped';
        return await answer(run, question, photos.get(id) ?? question.thumb, generation);
      } catch {
        return await markBroken(run, question, photos.get(id));
      } finally {
        end(run);
      }
    },

    async reset() {
      const run = current;
      if (run !== null) {
        run.dropped = true;
        run.controller.abort();
        end(run);
      }
      photos.clear();
      const done = coachRepo.reset();
      cleared = done.catch(() => undefined);
      await done;
    },
  };
}
