// The Coach screen as the Android app's notifications see it (P17, D-16.102): which chat it shows,
// so "The Coach replied" is not posted for the chat the person is looking at, and the chat a tap on
// a notification asked it to open. The screen says what it shows and takes what was asked for; the
// notifications read the one and ask for the other. Fetched by the Coach screen and by the Android
// app's notifications only.

export interface CoachScreen {
  /** The chat the Coach screen shows; null while it is not on screen. */
  shown(): string | null;
  show(chatId: string | null): void;
  /** The chat a tap asked the screen to open, until the screen takes it; null when none waits. */
  asked(): string | null;
  ask(chatId: string): void;
  /** The screen opened the chat asked for. */
  take(): void;
  /** Calls `onChange` when a chat is asked for or taken; returns the stop. */
  subscribe(onChange: () => void): () => void;
}

export function createCoachScreen(): CoachScreen {
  let shown: string | null = null;
  let asked: string | null = null;
  const listeners = new Set<() => void>();
  const setAsked = (chatId: string | null): void => {
    if (asked === chatId) return;
    asked = chatId;
    for (const listener of [...listeners]) listener();
  };
  return {
    shown: () => shown,
    show(chatId) {
      shown = chatId;
    },
    asked: () => asked,
    ask: setAsked,
    take: () => setAsked(null),
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}

/** The app's one Coach screen. */
export const coachScreen: CoachScreen = createCoachScreen();
