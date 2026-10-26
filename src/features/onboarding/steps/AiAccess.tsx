import { useCallback, useEffect, useId, useRef, useState, type Dispatch } from 'react';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../../ai/settings';
import { useSettings } from '../../../data/hooks';
import { t } from '../../../i18n/t';
import type { AiChoice } from '../../../services/aiSetup';
import { useServices } from '../../../services/context';
import { Button } from '../../../ui/Button';
import formStyles from '../../ai-setup/aiSetup.module.css';
import { checkChoice, primaryChoice, savedServersOf } from '../../ai-setup/choice';
import { ProviderForm } from '../../ai-setup/ProviderForm';
import styles from '../onboarding.module.css';
import type { WizardAction } from '../wizard';
import { StepHeader } from './StepHeader';
import type { StepProps } from './stepProps';

const STEP_SETTINGS = ['ai.settings', 'onboarding.termsAccepted'] as const;

/** Runs storage work one call at a time, in the order asked, so an older save never lands last. */
function useSerial(): <T>(work: () => Promise<T>) => Promise<T> {
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(work);
    tail.current = run.catch(() => undefined);
    return run;
  }, []);
}

/**
 * Step 10 (01 §3.4 step 11, P05-04): the provider form for the primary role, our short terms with
 * a box to tick, and "Set up later". Whenever the setup is complete (terms ticked, nothing
 * missing), the choice is saved; Continue opens only once that save is stored, so Building plan
 * reads exactly what is shown. "Set up later" stores no provider and moves on; the plan then
 * comes from the formulas (Proposed D-16.49).
 */
export function AiAccess({ dispatch }: StepProps) {
  const read = useSettings(STEP_SETTINGS);
  const loading = read.status === 'loading';
  useEffect(() => {
    // Coming back from Plan ready: nothing goes on until the saved choice has been read again.
    if (loading) dispatch({ type: 'aiReady', ready: false });
  }, [loading, dispatch]);

  return (
    <>
      <StepHeader title={t('aiSetup.access.title')} subtitle={t('aiSetup.access.subtitle')} />
      {read.status === 'loading' ? null : (
        <AccessForm
          // Unreadable settings start the form from the defaults; saving replaces them.
          saved={read.status === 'ready' ? read.value['ai.settings'] : null}
          termsAccepted={read.status === 'ready' && read.value['onboarding.termsAccepted']}
          dispatch={dispatch}
        />
      )}
    </>
  );
}

interface AccessFormProps {
  readonly saved: AiSettings | null;
  readonly termsAccepted: boolean;
  readonly dispatch: Dispatch<WizardAction>;
}

/** A provider's saved key as last read or saved. */
interface KnownKey {
  readonly provider: AiChoice['provider'];
  readonly mask: string | null;
}

function AccessForm({ saved, termsAccepted, dispatch }: AccessFormProps) {
  const { aiSetup } = useServices();
  const serial = useSerial();
  const settings = saved ?? DEFAULT_AI_SETTINGS;
  const [choice, setChoice] = useState(() => primaryChoice(settings));
  const [terms, setTerms] = useState(termsAccepted);
  const [known, setKnown] = useState<KnownKey | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const leaving = useRef(false);
  const termsTitle = useId();

  const provider = choice.provider;
  const savedKeyMask = known?.provider === provider ? known.mask : undefined;
  const ready = terms && checkChoice(choice, savedKeyMask ?? null).ready;

  useEffect(() => {
    // Read in turn with the saves, so a read started before a save never lands after it.
    let current = true;
    serial(() => aiSetup.savedKeyMask(provider)).then(
      (mask) => current && setKnown({ provider, mask }),
      () => current && setKnown({ provider, mask: null }),
    );
    return () => {
      current = false;
    };
  }, [provider, aiSetup, serial]);

  useEffect(() => {
    // Any change takes readiness back until the new values are stored.
    dispatch({ type: 'aiReady', ready: false });
    if (!ready || leaving.current) return;
    let current = true;
    serial(() => aiSetup.saveChoice(choice)).then(
      (stored) => {
        if (!current) return;
        setKnown({ provider: choice.provider, mask: stored.keyMask });
        setFailed(false);
        if (stored.missing.length === 0) dispatch({ type: 'aiReady', ready: true });
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [ready, choice, attempt, aiSetup, serial, dispatch]);

  const recordTerms = (accepted: boolean): void => {
    serial(() => aiSetup.setTermsAccepted(accepted)).catch(() => setFailed(true));
  };

  const tick = (accepted: boolean): void => {
    setTerms(accepted);
    recordTerms(accepted);
  };

  const retry = (): void => {
    setFailed(false);
    recordTerms(terms);
    setAttempt((count) => count + 1);
  };

  const setUpLater = async (): Promise<void> => {
    leaving.current = true;
    try {
      await serial(() => aiSetup.setUpLater());
    } catch {
      leaving.current = false;
      setFailed(true);
      return;
    }
    dispatch({ type: 'aiReady', ready: true });
    dispatch({ type: 'next' });
  };

  return (
    <>
      <ProviderForm
        value={choice}
        onChange={setChoice}
        savedKeyMask={savedKeyMask}
        savedServers={savedServersOf(settings)}
        data-ui="wizard.ai"
      />
      <section className={formStyles.terms} aria-labelledby={termsTitle}>
        <h2 id={termsTitle} className={formStyles.termsTitle}>
          {t('aiSetup.access.terms.title')}
        </h2>
        <ul className={formStyles.termsList}>
          <li>{t('aiSetup.access.terms.estimates')}</li>
          <li>{t('aiSetup.access.terms.sharing')}</li>
          <li>{t('aiSetup.access.terms.local')}</li>
        </ul>
        <label className={formStyles.check}>
          <input
            type="checkbox"
            className={formStyles.checkInput}
            checked={terms}
            onChange={(event) => tick(event.target.checked)}
            data-ui="wizard.ai.terms"
          />
          {t('aiSetup.access.terms.accept')}
        </label>
      </section>
      {failed ? (
        <div className={formStyles.later}>
          <p className={styles.problem} role="alert">
            {t('aiSetup.access.saveFailed')}
          </p>
          <Button variant="secondary" data-ui="wizard.ai.retry" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : null}
      <div className={formStyles.later}>
        <Button variant="quiet" block data-ui="wizard.ai.later" onClick={setUpLater}>
          {t('aiSetup.access.later')}
        </Button>
        <p className={styles.note}>{t('aiSetup.access.laterNote')}</p>
      </div>
    </>
  );
}
