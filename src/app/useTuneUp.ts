import { useEffect } from 'react';
import type { TuneUpRunner } from '../services/goals/tuneUp';

/** Whether the page is shown, and news when that changes (the document's, or a test's). */
export interface PageVisibility {
  isVisible(): boolean;
  /** Calls `onChange` on every change; returns the function that stops it. */
  subscribe(onChange: () => void): () => void;
}

/** The browser document's visibility. */
export const documentVisibility: PageVisibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe(onChange) {
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  },
};

export interface TuneUpLifecycle {
  /** Created once by the composition root; a new object starts the triggers again. */
  readonly runner: Pick<TuneUpRunner, 'check'>;
  /** Onboarding is done. Nothing is sent before; becoming ready counts as the app opening. */
  readonly ready: boolean;
  readonly visibility?: PageVisibility;
}

/**
 * Wires the weekly tune-up to the app's lifecycle (P05-09): one `open` once the person is set up,
 * then a `visible` each time the page comes back to the front. The runner decides whether a check
 * is due and drops triggers while a run is in flight (R01.5). Its outcome is not shown: only a
 * run the person started from Settings has a dialog.
 */
export function useTuneUp({
  runner,
  ready,
  visibility = documentVisibility,
}: TuneUpLifecycle): void {
  useEffect(() => {
    if (!ready) return;
    const send = (trigger: 'open' | 'visible'): void => {
      runner.check(trigger).catch((error: unknown) => {
        console.error('The weekly tune-up failed', error);
      });
    };
    send('open');
    return visibility.subscribe(() => {
      if (visibility.isVisible()) send('visible');
    });
  }, [runner, ready, visibility]);
}
