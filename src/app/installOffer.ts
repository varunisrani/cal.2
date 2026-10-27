/**
 * The browser's offer to install the app (P09-18). Chromium browsers fire `beforeinstallprompt`
 * when the app could be installed, often before React has drawn anything, so `main.tsx` starts
 * listening at once: the event's own mini prompt is held back and the event kept for the
 * install card (`InstallPrompt.tsx`), which may use it once. `appinstalled` ends the offer.
 */

/** The parts of the `beforeinstallprompt` event used here (not in TypeScript's DOM types). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallOfferState {
  /** The kept event, or `null` when the browser offered none or it was used. */
  readonly event: InstallPromptEvent | null;
  /** The app was installed from this page. */
  readonly installed: boolean;
}

export interface InstallOffer {
  getSnapshot(): InstallOfferState;
  subscribe(onChange: () => void): () => void;
  /** Hands out the kept event and forgets it: a browser lets it prompt only once. */
  take(): InstallPromptEvent | null;
  /** Starts listening on `target` (the window); returns the stop. */
  listen(target: EventTarget): () => void;
}

const NO_OFFER: InstallOfferState = { event: null, installed: false };

export function createInstallOffer(): InstallOffer {
  let state = NO_OFFER;
  const listeners = new Set<() => void>();
  const change = (next: InstallOfferState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    take() {
      const { event } = state;
      if (event) change({ ...state, event: null });
      return event;
    },
    listen(target) {
      const onOffer = (event: Event): void => {
        // Keeps the browser's own banner away; the install card asks at a better moment.
        event.preventDefault();
        change({ ...state, event: event as InstallPromptEvent });
      };
      const onInstalled = (): void => change({ event: null, installed: true });
      target.addEventListener('beforeinstallprompt', onOffer);
      target.addEventListener('appinstalled', onInstalled);
      return () => {
        target.removeEventListener('beforeinstallprompt', onOffer);
        target.removeEventListener('appinstalled', onInstalled);
      };
    },
  };
}

/** The app's one install offer; tests make their own. */
export const installOffer: InstallOffer = createInstallOffer();
