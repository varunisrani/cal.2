import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../../../i18n/t';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Field } from '../../../ui/Field';
import styles from './ai.module.css';
import { useAiEdits } from './useAiEdits';

/** Where FoodData Central hands out free keys (the USDA's own page, a third-party address). */
export const FDC_SIGNUP_URL = 'https://fdc.nal.usda.gov/api-key-signup';

type Problem = 'unsafe' | 'failed';

/**
 * Settings › AI providers › Food databases (02 §2, D-16.7): what the FoodData Central key adds to
 * barcode lookups, the key itself (typed hidden, shown saved only masked, kept in the `fdc` slot),
 * Save and Forget, where to get a key, and where it goes. A key a request header cannot carry
 * is refused here with the reason, before it is ever stored (R02.18).
 */
export function FoodDbSection() {
  const edits = useAiEdits();
  const [mask, setMask] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    let current = true;
    edits.foodDbKeyMask().then(
      (saved) => current && setMask(saved),
      () => current && setMask(null),
    );
    return () => {
      current = false;
    };
  }, [edits]);

  const save = async (): Promise<void> => {
    try {
      const result = await edits.saveFoodDbKey(text);
      if (result.ok) {
        setMask(result.value);
        setText('');
        setProblem(null);
      } else if (result.error === 'unsafe') {
        setProblem('unsafe');
      }
    } catch (error) {
      console.error('The food-database key could not be saved', error);
      setProblem('failed');
    }
  };

  const forget = async (): Promise<void> => {
    try {
      await edits.forgetFoodDbKey();
      setMask(null);
      setProblem(null);
    } catch (error) {
      console.error('The food-database key could not be removed', error);
      setProblem('failed');
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (text.trim() !== '') void save();
  };

  return (
    <Card heading={t('aiSetup.page.foodDb.heading')} className={styles.card} data-ui="ai.foodDb">
      <div className={styles.body}>
        <p className={styles.note}>{t('aiSetup.page.foodDb.about')}</p>
        <form className={styles.body} onSubmit={submit}>
          <Field
            type="password"
            label={t('aiSetup.page.foodDb.label')}
            value={text}
            onChange={(next) => {
              setText(next);
              setProblem(null);
            }}
            hint={mask ? t('aiSetup.key.replace') : undefined}
            error={problem === 'unsafe' ? t('aiSetup.page.foodDb.unsafe') : undefined}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-ui="ai.foodDb.key"
          />
          {mask ? (
            <p className={styles.saved} data-ui="ai.foodDb.saved">
              {t('aiSetup.page.foodDb.saved', { mask })}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="primary"
              disabled={text.trim() === ''}
              data-ui="ai.foodDb.save"
            >
              {t('aiSetup.page.foodDb.save')}
            </Button>
            {mask ? (
              <Button variant="quiet" data-ui="ai.foodDb.forget" onClick={forget}>
                {t('aiSetup.page.foodDb.forget')}
              </Button>
            ) : null}
          </div>
        </form>
        {problem === 'failed' ? (
          <p className={styles.alert} role="alert">
            {t('aiSetup.page.saveFailed')}
          </p>
        ) : null}
        <a
          className={styles.link}
          href={FDC_SIGNUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-ui="ai.foodDb.signUp"
        >
          {t('aiSetup.page.foodDb.signUp')}
        </a>
        <p className={styles.note}>{t('aiSetup.page.foodDb.device')}</p>
      </div>
    </Card>
  );
}
