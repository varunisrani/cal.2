import { PROVIDERS, type ProviderId } from '../../ai/catalog/providers';
import { t } from '../../i18n/t';
import { Field } from '../../ui/Field';
import styles from './aiSetup.module.css';
import { KEY_PAGES } from './keyPages';

export interface KeyFieldProps {
  readonly provider: ProviderId;
  /** The key typed now; blank keeps the saved one. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The saved key, masked; null when none is saved, undefined while it is being read. */
  readonly savedMask: string | null | undefined;
  /** A key the provider requires is neither saved nor typed: asks the person to paste one. */
  readonly missing: boolean;
  readonly 'data-ui': string;
}

/**
 * A provider's API key: typed hidden, never echoed back whole. A saved key shows as its first and
 * last four characters; a new one pasted over it replaces it. Under the field: where that
 * provider's keys are made, and one plain line that the key stays on this device (D-16.7).
 */
export function KeyField({
  provider,
  value,
  onChange,
  savedMask,
  missing,
  'data-ui': ui,
}: KeyFieldProps) {
  const entry = PROVIDERS[provider];
  const optional = entry.key === 'optional';
  const page = KEY_PAGES[provider];
  const hint = savedMask ? t('aiSetup.key.replace') : optional ? t('aiSetup.key.optional') : '';
  return (
    <div className={styles.group}>
      <Field
        type="password"
        label={optional ? t('aiSetup.key.labelOptional') : t('aiSetup.key.label')}
        value={value}
        onChange={onChange}
        hint={hint || undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        data-ui={ui}
      />
      {savedMask ? (
        <p className={styles.saved} data-ui={`${ui}.saved`}>
          {t('aiSetup.key.saved', { mask: savedMask })}
        </p>
      ) : null}
      {missing ? (
        <p className={styles.needed} data-ui={`${ui}.missing`}>
          {t('aiSetup.key.missing')}
        </p>
      ) : null}
      {page ? (
        <a
          className={styles.link}
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          data-ui={`${ui}.page`}
        >
          {t('aiSetup.key.getAt', { place: t(page.place) })}
        </a>
      ) : null}
      <p className={styles.line} data-ui={`${ui}.device`}>
        {t('aiSetup.key.device', { provider: entry.name })}
      </p>
    </div>
  );
}
