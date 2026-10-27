import { useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { t, type TKey } from '../../../i18n/t';
import {
  offersLabelScan,
  type BarcodeService,
  type LookupFailureKind,
} from '../../../services/barcode/lookup';
import { useServices } from '../../../services/context';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { useModalLayer } from '../../../ui/modalLayer';
import overlay from '../analysis.module.css';

const MESSAGES: Record<LookupFailureKind, TKey> = {
  invalid: 'scan.failure.invalid',
  notFound: 'scan.failure.notFound',
  noNutrition: 'scan.failure.noNutrition',
  rateLimited: 'scan.failure.rateLimited',
  unavailable: 'scan.failure.unavailable',
  unexpected: 'scan.failure.unexpected',
  offline: 'scan.failure.offline',
  timeout: 'scan.failure.timeout',
  network: 'scan.failure.network',
  keyRefused: 'scan.failure.keyRefused',
  generic: 'scan.failure.generic',
};

/** The failure dialog's main action. */
type MainAction = 'scanLabel' | 'retry' | 'close';

function mainAction(failure: LookupFailureKind): MainAction {
  if (offersLabelScan(failure)) return 'scanLabel';
  // The same code would be refused again.
  return failure === 'invalid' ? 'close' : 'retry';
}

const ACTION_WORDS: Record<MainAction, TKey> = {
  scanLabel: 'scan.scanLabel',
  retry: 'common.retry',
  close: 'common.close',
};

function useBarcode(): BarcodeService {
  const { barcode } = useServices();
  if (!barcode) throw new Error('LookupOverlay: no barcode service above it');
  return barcode;
}

export interface LookupOverlayProps {
  /** After "Scan label" held the code: the opener opens the camera for the label's photo. */
  readonly onScanLabel: () => void;
}

/**
 * What a barcode lookup shows (02 §3.4, §3.12): while it runs, a layer with a spinner and Cancel;
 * when it finds nothing, the reason with one main action. A product that is unknown or has no
 * nutrition, and a refused FoodData Central key, offer "Scan label" (R02.20); a code that is not
 * digits offers only Close; every other failure offers Retry. Cancel shows nothing more. A product
 * found opens its review through the analysis draft, so nothing shows here then.
 */
export function LookupOverlay({ onScanLabel }: LookupOverlayProps) {
  const barcode = useBarcode();
  const state = useSyncExternalStore(barcode.subscribe, barcode.getSnapshot);
  const cancel = (): void => barcode.cancel();

  if (state.phase === 'looking') return <Looking onCancel={cancel} />;

  const failure = state.phase === 'failed' ? state.failure : null;
  const action = failure === null ? 'close' : mainAction(failure);
  const confirm = (): void => {
    if (action === 'scanLabel') {
      if (barcode.armLabelScan() !== null) onScanLabel();
    } else if (action === 'retry') {
      // Never rejects; the layer shows how it goes.
      void barcode.retry();
    } else {
      cancel();
    }
  };

  return (
    <Dialog
      open={failure !== null}
      title={t('scan.failedTitle')}
      message={failure === null ? null : <p>{t(MESSAGES[failure])}</p>}
      confirmLabel={t(ACTION_WORDS[action])}
      cancelLabel={action === 'close' ? null : undefined}
      onConfirm={confirm}
      onCancel={cancel}
      data-ui="scan.failed"
    />
  );
}

/** The layer while the databases are asked: modal, and only its button stops the lookup. */
function Looking({ onCancel }: { readonly onCancel: () => void }) {
  const status = t('scan.looking');
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalLayer(rootRef, panelRef, { initialFocus: cancelRef });

  return createPortal(
    <div ref={rootRef} className={overlay.layer}>
      <div
        ref={panelRef}
        className={overlay.panel}
        role="dialog"
        aria-modal="true"
        aria-label={status}
        tabIndex={-1}
        data-ui="scan.looking"
      >
        <svg className={overlay.spinner} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle cx="24" cy="24" r="20" fill="none" strokeWidth="4" />
        </svg>
        <p className={overlay.status} role="status">
          {status}
        </p>
        <Button
          ref={cancelRef}
          variant="secondary"
          onClick={onCancel}
          data-ui="scan.looking.cancel"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
