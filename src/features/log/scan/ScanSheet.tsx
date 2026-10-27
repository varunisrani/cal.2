import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../../i18n/t';
import type { CameraFailure, ScanCamera } from '../../../services/barcode/decoder';
import { useServices } from '../../../services/context';
import { IconButton } from '../../../ui/Button';
import { Icon } from '../../../ui/icons';
import { useModalLayer } from '../../../ui/modalLayer';
import { DigitsField } from './DigitsField';
import styles from './scan.module.css';

export interface ScanSheetProps {
  readonly open: boolean;
  /**
   * A code from the camera or the typed digits, handed on once per opening: the opener closes
   * the scanner and looks the code up.
   */
  readonly onCode: (code: string) => void;
  /** The close button and Escape (Back closes it through the router). */
  readonly onClose: () => void;
}

/** What the camera part shows. */
type CameraView =
  | { readonly kind: 'starting' }
  | { readonly kind: 'live'; readonly camera: ScanCamera }
  /** Refused, or no camera to use. */
  | { readonly kind: CameraFailure }
  /** A camera, but no reader for its frames could be loaded. */
  | { readonly kind: 'unreadable' };

/**
 * The barcode scanner (02 §3.12, D-16.18): the back camera over the whole screen, a close button,
 * and under it the hint and the typed digits, which are always there. The first code found in
 * the frames, or typed, is handed on once. Tapping the picture focuses there where the camera can.
 * A refused camera has its own message and puts the focus in the digits; a missing camera, or
 * frames no reader can take, say the camera cannot scan here. The camera turns off when the
 * scanner closes, by any route. Renders nothing while closed.
 */
export function ScanSheet(props: ScanSheetProps) {
  return props.open ? <OpenScanSheet {...props} /> : null;
}

function useScanner() {
  const { barcode } = useServices();
  if (!barcode) throw new Error('ScanSheet: no barcode service above it');
  return barcode.scanner;
}

function OpenScanSheet({ onCode, onClose }: ScanSheetProps) {
  const scanner = useScanner();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const digitsRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<CameraView>({ kind: 'starting' });
  const handedOn = useRef(false);
  const latestOnCode = useRef(onCode);
  useLayoutEffect(() => {
    latestOnCode.current = onCode;
  });

  useModalLayer(rootRef, panelRef, { onEscape: onClose });

  /** The first code of this opening, from either source, goes on; any later one is dropped. */
  const handOn = useCallback((code: string) => {
    if (handedOn.current) return;
    handedOn.current = true;
    latestOnCode.current(code);
  }, []);

  // The camera opens with the scanner and turns off with it.
  useEffect(() => {
    let live = true;
    let opened: ScanCamera | undefined;
    scanner.openCamera().then(
      (result) => {
        if (!result.ok) {
          if (live) setView({ kind: result.error });
          return;
        }
        if (!live) {
          result.value.stop();
          return;
        }
        opened = result.value;
        setView({ kind: 'live', camera: result.value });
      },
      () => {
        if (live) setView({ kind: 'unavailable' });
      },
    );
    return () => {
      live = false;
      opened?.stop();
    };
  }, [scanner]);

  // Frames are read while the picture shows.
  const camera = view.kind === 'live' ? view.camera : undefined;
  useEffect(() => {
    const video = videoRef.current;
    if (!camera || !video) return undefined;
    video.srcObject = camera.stream;
    return scanner.watch(video, handOn, () => {
      camera.stop();
      setView({ kind: 'unreadable' });
    });
  }, [camera, scanner, handOn]);

  // Without a picture, the digits are the way on.
  const noPicture = view.kind !== 'starting' && view.kind !== 'live';
  useEffect(() => {
    if (noPicture) digitsRef.current?.focus();
  }, [noPicture]);

  const focusAt = (event: MouseEvent<HTMLVideoElement>): void => {
    if (!camera?.canFocus) return;
    const video = event.currentTarget;
    const point = pointInPicture(video, event.clientX, event.clientY);
    if (point) camera.focusAt(point.x, point.y);
  };

  return createPortal(
    <div ref={rootRef} className={styles.layer}>
      <div
        ref={panelRef}
        className={styles.scanner}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-ui="scan"
      >
        <div className={styles.view}>
          {view.kind === 'live' ? (
            <video
              ref={videoRef}
              className={styles.video}
              autoPlay
              muted
              playsInline
              aria-label={t('scan.preview')}
              onClick={focusAt}
              data-ui="scan.preview"
            />
          ) : (
            <CameraState view={view} />
          )}
          <div className={styles.top}>
            <IconButton
              className={styles.close}
              label={t('scan.close')}
              icon={<Icon name="close" size={22} />}
              onClick={onClose}
              data-ui="scan.close"
            />
            <h2 id={titleId} className={styles.title}>
              {t('scan.title')}
            </h2>
          </div>
        </div>
        <div className={styles.panel}>
          <div className={styles.hint} data-ui="scan.hint">
            <Icon name="barcode" size={32} />
            <div className={styles.hintText}>
              <p className={styles.hintLine}>{t('scan.hint')}</p>
              <p className={styles.hintSource}>{t('scan.source')}</p>
            </div>
          </div>
          <DigitsField onSubmit={handOn} inputRef={digitsRef} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CameraState({ view }: { readonly view: Exclude<CameraView, { kind: 'live' }> }) {
  if (view.kind === 'starting') {
    return (
      <p className={styles.state} role="status" data-ui="scan.starting">
        <span className={styles.stateText}>{t('scan.starting')}</span>
      </p>
    );
  }
  if (view.kind === 'denied') {
    return (
      <div className={styles.state} role="alert" data-ui="scan.denied">
        <p className={styles.stateTitle}>{t('scan.denied.title')}</p>
        <p className={styles.stateText}>{t('scan.denied.body')}</p>
      </div>
    );
  }
  return (
    <p className={styles.state} role="alert" data-ui="scan.unavailable">
      <span className={styles.stateText}>{t('scan.unavailable')}</span>
    </p>
  );
}

/**
 * Where a tap lands in the camera's picture, each from 0 to 1. The picture covers the view and
 * its overflow is cut off evenly on both sides, so the tap is mapped through that crop.
 */
function pointInPicture(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | undefined {
  const box = video.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return undefined;
  const x = clientX - box.left;
  const y = clientY - box.top;
  const { videoWidth, videoHeight } = video;
  if (videoWidth <= 0 || videoHeight <= 0) return { x: x / box.width, y: y / box.height };
  const scale = Math.max(box.width / videoWidth, box.height / videoHeight);
  const shownWidth = videoWidth * scale;
  const shownHeight = videoHeight * scale;
  return {
    x: (x + (shownWidth - box.width) / 2) / shownWidth,
    y: (y + (shownHeight - box.height) / 2) / shownHeight,
  };
}
