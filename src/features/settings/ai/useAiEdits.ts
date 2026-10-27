import { useCallback, useRef } from 'react';
import {
  hasSettingsEdits,
  type AiSettingsEdits,
  type AiSetupService,
} from '../../../services/aiSetup';
import { useServices } from '../../../services/context';

/** The AI setup service with the settings page's writes (P09-07). */
export function useAiEdits(): AiSetupService & AiSettingsEdits {
  const { aiSetup } = useServices();
  if (!hasSettingsEdits(aiSetup)) {
    throw new Error('AiPage: the aiSetup service above it cannot edit the AI settings');
  }
  return aiSetup;
}

/** Runs storage work one call at a time, in the order asked, so an older save never lands last. */
export function useSerial(): <T>(work: () => Promise<T>) => Promise<T> {
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback(<T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(work);
    tail.current = run.catch(() => undefined);
    return run;
  }, []);
}
