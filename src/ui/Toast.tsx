import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './primitives.module.css';

/** How long a toast stays when the caller does not say. */
export const TOAST_DURATION_MS = 4000;

export interface ToastOptions {
  /** Milliseconds before the toast goes away by itself. */
  readonly duration?: number;
}

export interface Toasts {
  /** Shows `message` (already translated), replacing any toast on screen; returns its id. */
  show(message: string, options?: ToastOptions): number;
  /** Removes the toast with this id if it is still showing. */
  dismiss(id: number): void;
}

interface ShownToast {
  id: number;
  message: string;
}

const ToastContext = createContext<Toasts | null>(null);

/**
 * Holds the app's one toast and the polite live region that announces it. The region lives in
 * its own portal marked `data-layer-keep`, so an open sheet or dialog does not make it inert.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<ShownToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastId = useRef(0);

  const toasts = useMemo<Toasts>(() => {
    const hide = (id: number): void => {
      setShown((current) => (current?.id === id ? null : current));
    };
    return {
      show(message, { duration = TOAST_DURATION_MS } = {}) {
        lastId.current += 1;
        const id = lastId.current;
        clearTimeout(timer.current);
        setShown({ id, message });
        timer.current = setTimeout(() => hide(id), duration);
        return id;
      },
      dismiss(id) {
        if (id === lastId.current) clearTimeout(timer.current);
        hide(id);
      },
    };
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={toasts}>
      {children}
      {createPortal(
        <div
          className={styles.toastRegion}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-ui="toast.region"
          data-layer-keep=""
        >
          {shown ? (
            <p key={shown.id} className={styles.toast} data-ui="toast.message">
              {shown.message}
            </p>
          ) : null}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** The toast controls of the nearest `ToastProvider`. */
export function useToast(): Toasts {
  const toasts = useContext(ToastContext);
  if (!toasts) throw new Error('useToast needs a ToastProvider above it');
  return toasts;
}
