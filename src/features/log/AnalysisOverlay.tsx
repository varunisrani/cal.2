import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/t';
import type { AnalysisService, AnalysisState } from '../../services/analysis';
import { useServices } from '../../services/context';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { useModalLayer } from '../../ui/modalLayer';
import styles from './analysis.module.css';

export interface Analysis {
  readonly service: AnalysisService;
  readonly state: AnalysisState;
}

/** The analysis service and its state; re-renders when the state changes. */
export function useAnalysis(): Analysis {
  const { analysis } = useServices();
  if (!analysis) throw new Error('useAnalysis: no analysis service above it');
  const state = useSyncExternalStore(analysis.subscribe, analysis.getSnapshot);
  return { service: analysis, state };
}

/**
 * What the food analysis shows (02 §3.4): while it runs, a layer over the whole app with the
 * first photo (a spinner for a typed meal) and Cancel, the tab bar hidden behind it; after a
 * failure, its message with Retry and Cancel. Cancel shows nothing more. Renders nothing at other
 * times; the review (P06-06) opens from the `reviewReady` state.
 */
export function AnalysisOverlay() {
  const { service, state } = useAnalysis();
  // Neither rejects; a failure to clean up is left to the photo repository's prune.
  const cancel = (): void => void service.cancel();

  if (state.phase === 'analysing') {
    return <Analysing photoId={state.photoIds[0]} onCancel={cancel} />;
  }
  return (
    <Dialog
      open={state.phase === 'failed'}
      title={t('capture.analysing.failedTitle')}
      message={
        state.phase === 'failed'
          ? state.messages.map((message) => (
              <p key={message.key}>{t(message.key, message.params)}</p>
            ))
          : null
      }
      confirmLabel={t('common.retry')}
      onConfirm={() => void service.retry()}
      onCancel={cancel}
      data-ui="analysis.failed"
    />
  );
}

interface AnalysingProps {
  /** The first photo of the meal; none for a typed meal. */
  readonly photoId: string | undefined;
  readonly onCancel: () => void;
}

/** The layer while the AI works: modal, so nothing behind it can be reached. */
function Analysing({ photoId, onCancel }: AnalysingProps) {
  const status = t(
    photoId === undefined ? 'capture.analysing.textStatus' : 'capture.analysing.status',
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Escape does nothing: only the button stops an analysis.
  useModalLayer(rootRef, panelRef, { initialFocus: cancelRef });

  return createPortal(
    <div ref={rootRef} className={styles.layer}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={status}
        tabIndex={-1}
        data-ui="analysis"
      >
        {photoId === undefined ? <Spinner /> : <FirstPhoto photoId={photoId} />}
        <p className={styles.status} role="status">
          {status}
        </p>
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} data-ui="analysis.cancel">
          {t('common.cancel')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

function Spinner() {
  return (
    <svg
      className={styles.spinner}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      data-ui="analysis.spinner"
    >
      <circle cx="24" cy="24" r="20" fill="none" strokeWidth="4" />
    </svg>
  );
}

/** The photo at card size (720 px); an empty frame while it loads or when it cannot be shown. */
function FirstPhoto({ photoId }: { readonly photoId: string }) {
  const { photos } = useServices();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photos) return undefined;
    let live = true;
    let url: string | null = null;
    photos.preview(photoId).then(
      (blob) => {
        if (!live || !blob) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      (error: unknown) => console.error('The analysed photo could not be shown', error),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photos, photoId]);

  const name = t('capture.analysing.photo');
  return src ? (
    <img className={styles.photo} src={src} alt={name} data-ui="analysis.photo" />
  ) : (
    <div className={styles.photo} role="img" aria-label={name} data-ui="analysis.photo" />
  );
}
