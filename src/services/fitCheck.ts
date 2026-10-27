// The fit check's suggestion (02 §3.6, 03 §3.11): before a meal is logged, a few plain sentences
// from the AI on whether it fits the day. A prose request served by the text provider (the
// primary when that is off), under the timeout setting, stopped by the caller's signal. Without
// an AI set up, or without a key for the provider in use, nothing is sent and the screen says
// where to add one. Nothing is ever logged or changed here.

import { failureMessages, type AiMessage } from '../ai/errors';
import type { FitCheckInput } from '../ai/prompts/fitCheck';
import type { StoredAiAccess } from './aiAccess';

// Screens build the request; the types they need come from here.
export type { FitCheckInput, MealFigures } from '../ai/prompts/fitCheck';

export type FitCheckOutcome =
  /** The answer, trimmed and not empty. */
  | { readonly kind: 'text'; readonly text: string }
  /** The AI answered with nothing. */
  | { readonly kind: 'empty' }
  /** No AI is set up, or the provider in use has no key: nothing was sent. */
  | { readonly kind: 'noKey' }
  /** The request failed; the messages say why. */
  | { readonly kind: 'failed'; readonly messages: readonly AiMessage[] }
  /** Stopped by the caller: nothing to show. */
  | { readonly kind: 'cancelled' };

export interface FitCheckService {
  /** One suggestion for the meal in `input`; never rejects. */
  suggest(input: FitCheckInput, cancel: AbortSignal): Promise<FitCheckOutcome>;
}

export interface FitCheckDeps {
  /** Read for every request, so a key saved a moment ago is used. */
  readonly aiAccess: () => Promise<StoredAiAccess>;
  /** Handed to the AI client; services never use the global one. */
  readonly fetch: typeof fetch;
}

const EMPTY: FitCheckOutcome = { kind: 'empty' };
const NO_KEY: FitCheckOutcome = { kind: 'noKey' };
const CANCELLED: FitCheckOutcome = { kind: 'cancelled' };

export function createFitCheckService(deps: FitCheckDeps): FitCheckService {
  return {
    async suggest(input, cancel) {
      try {
        const access = await deps.aiAccess();
        if (cancel.aborted) return CANCELLED;
        if (!access.configured) return NO_KEY;
        // The AI layer loads on first use, never with the start-up download.
        const { fitCheck } = await import('../ai/tasks/planning');
        const result = await fitCheck(input, {
          settings: access.settings,
          keys: access.keys,
          fetch: deps.fetch,
          cancel,
        });
        if (result.ok) {
          const text = result.value.trim();
          return text === '' ? EMPTY : { kind: 'text', text };
        }
        if (result.error.kind === 'cancelled') return CANCELLED;
        if (result.error.kind === 'noKey') return NO_KEY;
        return { kind: 'failed', messages: failureMessages(result.error) };
      } catch {
        if (cancel.aborted) return CANCELLED;
        return { kind: 'failed', messages: failureMessages({ kind: 'generic' }) };
      }
    },
  };
}
