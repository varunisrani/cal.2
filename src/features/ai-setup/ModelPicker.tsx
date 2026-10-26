import { useState } from 'react';
import { presetsFor, type ModelUse } from '../../ai/catalog/presets';
import { PROVIDERS, type ProviderId } from '../../ai/catalog/providers';
import { t } from '../../i18n/t';
import { Field } from '../../ui/Field';
import styles from './aiSetup.module.css';
import { SelectField } from './SelectField';

/** The picker's "another model" entry: a leading space, which no trimmed model id can have. */
const ANOTHER = ' another';

export interface ModelPickerProps {
  readonly provider: ProviderId;
  /** Which presets to offer: those for photo requests or for text requests. */
  readonly use: ModelUse;
  readonly value: string;
  readonly onChange: (model: string) => void;
  /** No model id yet: shows what to do. */
  readonly missing: boolean;
  readonly 'data-ui': string;
}

/**
 * The provider's presets, default first. A provider that takes any model id (OpenRouter, Hugging
 * Face, Ollama, Custom) also offers "another model", which opens a text field starting from the
 * current id; Custom has no presets, only the field. Render it with `key={provider}`, so a new
 * provider starts on its own list.
 */
export function ModelPicker({
  provider,
  use,
  value,
  onChange,
  missing,
  'data-ui': ui,
}: ModelPickerProps) {
  const presets = presetsFor(provider, use);
  const freeForm = PROVIDERS[provider].freeFormModel;
  // Local, so typing an id that happens to match a preset does not close the field mid-word.
  const [typing, setTyping] = useState(
    () => presets.length === 0 || (freeForm && !presets.includes(value.trim())),
  );

  const pick = (choice: string): void => {
    if (choice === ANOTHER) {
      setTyping(true);
      return;
    }
    setTyping(false);
    onChange(choice);
  };

  return (
    <div className={styles.group}>
      {presets.length > 0 ? (
        <SelectField
          label={t('aiSetup.model.label')}
          value={typing ? ANOTHER : value}
          onChange={pick}
          data-ui={ui}
        >
          {presets.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
          {freeForm ? <option value={ANOTHER}>{t('aiSetup.model.other')}</option> : null}
        </SelectField>
      ) : null}
      {typing ? (
        <Field
          label={presets.length > 0 ? t('aiSetup.model.idLabel') : t('aiSetup.model.label')}
          value={value}
          onChange={onChange}
          hint={t('aiSetup.model.idHint')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          data-ui={`${ui}.id`}
        />
      ) : null}
      {missing ? (
        <p className={styles.needed} data-ui={`${ui}.missing`}>
          {t('aiSetup.model.missing')}
        </p>
      ) : null}
    </div>
  );
}
