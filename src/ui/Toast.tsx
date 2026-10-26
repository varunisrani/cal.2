import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './primitives.module.css';

/** How long a toast stays when the caller does not say. */
export const TOAST_DEFAULT_MS = 4000;

export interface ToastItem {
  readonly message: string;
  readonly durationMs?: number;
}

export interface ToastProps {
  /** The toast on show, or null. A new object restarts the timer, even with the same text. */
  readonly toast: ToastItem | null;
  /** Called when the toast's time is up. */
  readonly onDismiss: () => void;
}

/**
 * The toast area: a polite status region that is always on the page (screen readers announce
 * only changes inside a region they already know), with the current toast in it.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => dismiss.current(), toast.durationMs ?? TOAST_DEFAULT_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className={styles.toastRegion} role="status" aria-live="polite" data-ui="ui.toasts">
      {toast !== null && (
        <p className={styles.toast} data-ui="ui.toast">
          {toast.message}
        </p>
      )}
    </div>
  );
}

export interface ToastApi {
  /** Shows a message, replacing the one on show. */
  show(message: string, options?: { readonly durationMs?: number }): void;
  /** Takes the current toast away now. */
  dismiss(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Holds the app's one toast; screens call `useToast().show(…)`. */
export function ToastProvider({ children }: { readonly children?: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const api = useMemo<ToastApi>(
    () => ({
      show: (message, options) => setToast({ message, durationMs: options?.durationMs }),
      dismiss: () => setToast(null),
    }),
    [],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast toast={toast} onDismiss={api.dismiss} />
    </ToastContext.Provider>
  );
}

/** The toast controls of the nearest `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast() needs a ToastProvider above it');
  return api;
}
