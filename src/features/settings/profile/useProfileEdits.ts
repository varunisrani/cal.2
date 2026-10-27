import { useCallback } from 'react';
import type { ProfileEditsService } from '../../../services/profileEdits';
import { useServices } from '../../../services/context';
import { t } from '../../../i18n/t';
import { useToast } from '../../../ui/Toast';

/** The Personal info service; `main.tsx` always provides it. */
export function useProfileEdits(): ProfileEditsService {
  const { profileEdits } = useServices();
  if (!profileEdits) throw new Error('Personal info: no profileEdits service above it');
  return profileEdits;
}

/** Reports a write that failed: logged, and a toast says the change was not saved. */
export function useSaveFailed(): (error: unknown) => void {
  const toast = useToast();
  return useCallback(
    (error: unknown) => {
      console.error('Saving a Personal info change failed', error);
      toast.show(t('profile.saveFailed'));
    },
    [toast],
  );
}
