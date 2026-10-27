import type { ModelUse } from '../../ai/catalog/presets';
import { PROVIDERS, isProviderId, type ProviderId } from '../../ai/catalog/providers';
import type { UrlProblem } from '../../ai/endpoint';
import { t, type TKey } from '../../i18n/t';
import type { AiChoice } from '../../services/aiSetup';
import { Field } from '../../ui/Field';
import styles from './aiSetup.module.css';
import { checkChoice, providerGroups, withProvider, type SavedServers } from './choice';
import { KeyField } from './KeyField';
import { ModelPicker } from './ModelPicker';
import { SelectField } from './SelectField';

/** Why an address is refused; an empty one is asked for instead (`aiSetup.server.missing`). */
const URL_PROBLEM_KEYS: Readonly<Record<Exclude<UrlProblem, 'empty'>, TKey>> = {
  malformed: 'aiSetup.server.problem.malformed',
  credentials: 'aiSetup.server.problem.credentials',
  scheme: 'aiSetup.server.problem.scheme',
  plainHttp: 'aiSetup.server.problem.plainHttp',
  ipv6Loopback: 'aiSetup.server.problem.ipv6Loopback',
};

const SERVER_HELP_KEYS: Readonly<Partial<Record<ProviderId, TKey>>> = {
  ollama: 'aiSetup.server.ollamaHelp',
  custom: 'aiSetup.server.customHelp',
};

export interface ProviderFormProps {
  /** The role's choice; every edit hands back a new one through `onChange`. */
  readonly value: AiChoice;
  readonly onChange: (next: AiChoice) => void;
  /** The chosen provider's saved key, masked; null when none is saved, undefined while reading. */
  readonly savedKeyMask: string | null | undefined;
  /** Saved server addresses (Ollama, Custom), where a provider switch starts from. */
  readonly savedServers?: SavedServers;
  /**
   * The role's requests. A photo role (the primary, the photo standby) lists only the providers
   * that read photos; a text role lists all sixteen.
   */
  readonly use?: ModelUse;
  /** A preset the model list leaves out unless chosen (a standby's backed model, P09-07). */
  readonly hiddenModel?: string;
  /** The form's hook; its fields get `<data-ui>.provider`, `.model`, `.server` and `.key`. */
  readonly 'data-ui': string;
}

/**
 * One role's provider settings, shared by the onboarding AI step and the AI settings page: the
 * provider (vendors' clouds, then servers people run), its model, the server address for Ollama
 * and Custom, and the key for providers that take one. It stores nothing: the caller saves, using
 * `checkChoice` to know when the choice is complete.
 */
export function ProviderForm({
  value,
  onChange,
  savedKeyMask,
  savedServers,
  use = 'image',
  hiddenModel,
  'data-ui': ui,
}: ProviderFormProps) {
  const entry = PROVIDERS[value.provider];
  const groups = providerGroups(use);
  const check = checkChoice(value, savedKeyMask ?? null);
  const problem = check.urlProblem;
  const serverHelp = SERVER_HELP_KEYS[value.provider];

  const pickProvider = (id: string): void => {
    if (isProviderId(id) && id !== value.provider) onChange(withProvider(id, use, savedServers));
  };

  return (
    <div className={styles.form}>
      <SelectField
        label={t('aiSetup.provider.label')}
        value={value.provider}
        onChange={pickProvider}
        data-ui={`${ui}.provider`}
      >
        <optgroup label={t('aiSetup.provider.cloud')}>
          {groups.cloud.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </optgroup>
        <optgroup label={t('aiSetup.provider.ownServer')}>
          {groups.ownServer.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </optgroup>
      </SelectField>

      <ModelPicker
        key={value.provider}
        provider={value.provider}
        use={use}
        value={value.model}
        onChange={(model) => onChange({ ...value, model })}
        missing={check.missing.includes('model')}
        hiddenModel={hiddenModel}
        data-ui={`${ui}.model`}
      />

      {entry.endpoint === 'userServer' ? (
        <div className={styles.group}>
          <Field
            type="url"
            inputMode="url"
            label={t('aiSetup.server.label')}
            value={value.serverUrl}
            onChange={(serverUrl) => onChange({ ...value, serverUrl })}
            hint={
              check.urlHint === 'addV1'
                ? t('aiSetup.server.addV1')
                : serverHelp
                  ? t(serverHelp)
                  : undefined
            }
            error={problem && problem !== 'empty' ? t(URL_PROBLEM_KEYS[problem]) : undefined}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-ui={`${ui}.server`}
          />
          {problem === 'empty' ? (
            <p className={styles.needed} data-ui={`${ui}.server.missing`}>
              {t('aiSetup.server.missing')}
            </p>
          ) : null}
        </div>
      ) : null}

      {entry.key === 'none' ? null : (
        <KeyField
          provider={value.provider}
          value={value.key}
          onChange={(key) => onChange({ ...value, key })}
          savedMask={savedKeyMask}
          // Said only once the saved key has been read, so it never flashes over a saved key.
          missing={savedKeyMask !== undefined && check.missing.includes('key')}
          data-ui={`${ui}.key`}
        />
      )}
    </div>
  );
}
