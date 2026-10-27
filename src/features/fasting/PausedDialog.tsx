import { useState } from 'react';
import type { NutritionDraft } from '../../domain/model';
import { t } from '../../i18n/t';
import type { LogContext } from '../../services/diary';
import { Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/Toast';
import { useFasting } from './hours';

export interface PausedDialogProps {
  /** Open while a food write refused by a running fast waits for an answer. */
  readonly open: boolean;
  /**
   * "End fast and log": ends the fast and writes the food that was refused. May return a promise;
   * the button is busy until it settles. The caller closes the dialog afterwards.
   */
  readonly onEndAndLog: () => unknown;
  /** Cancel, Escape and the scrim: the fast keeps running and nothing is written. */
  readonly onCancel: () => void;
}

/**
 * The one dialog every food path shows when a running fast refused its write (05 §3.7.5, R05.1):
 * food logging is paused, and "End fast and log" ends the fast and logs the food in one step
 * (D-16.35); Cancel keeps fasting and leaves the sheet as it was. Each opening answers once.
 */
export function PausedDialog({ open, onEndAndLog, onCancel }: PausedDialogProps) {
  return (
    <Dialog
      open={open}
      title={t('fasting.paused.title')}
      message={t('fasting.paused.message')}
      confirmLabel={t('fasting.paused.endAndLog')}
      onConfirm={onEndAndLog}
      onCancel={onCancel}
      data-ui="fasting.paused"
    />
  );
}

interface Refused {
  readonly draft: NutritionDraft;
  readonly ctx: LogContext;
}

export interface LogPause {
  /** Opens the dialog for a draft the diary service refused with `fastActive`. */
  readonly pause: (draft: NutritionDraft, ctx: LogContext) => void;
  /** The props of the sheet's `PausedDialog`. */
  readonly dialog: PausedDialogProps;
}

/**
 * The paused dialog of a sheet that logs one draft (review, manual entry): `pause` opens it with
 * the refused draft and its context; "End fast and log" stores them while ending the fast, in one
 * write, then calls `onLogged`. A failure says so and keeps the sheet; Cancel only closes it.
 */
export function useLogPause(onLogged: () => void): LogPause {
  const fasting = useFasting();
  const toast = useToast();
  const [refused, setRefused] = useState<Refused | null>(null);

  const endAndLog = async (): Promise<void> => {
    if (!refused) return;
    try {
      const result = await fasting().endFastAndLog(refused.draft, refused.ctx);
      if (result.kind === 'logged') {
        onLogged();
        return;
      }
    } catch (error) {
      console.error('Ending the fast and logging the food failed', error);
      toast.show(t('fasting.paused.failed'));
    }
    setRefused(null);
  };

  return {
    pause: (draft, ctx) => setRefused({ draft, ctx }),
    dialog: { open: refused !== null, onEndAndLog: endAndLog, onCancel: () => setRefused(null) },
  };
}
