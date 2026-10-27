import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ProviderId } from '../../../ai/catalog/providers';
import {
  DEFAULT_AI_SETTINGS,
  OPENROUTER_EFFORTS,
  type AiSettings,
  type OpenRouterEffort,
  type RoleName,
} from '../../../ai/settings';
import { useSettings } from '../../../data/hooks';
import { t } from '../../../i18n/t';
import type { AiChoice, SwitchableRole } from '../../../services/aiSetup';
import { Card } from '../../../ui/Card';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/icons';
import { useToast } from '../../../ui/Toast';
import { checkChoice } from '../../ai-setup/choice';
import { SelectField } from '../../ai-setup/SelectField';
import styles from './ai.module.css';
import { FoodDbSection } from './FoodDbSection';
import { InstructionsField } from './InstructionsField';
import { RoleCard } from './RoleCard';
import {
  ROLES,
  SWITCHABLE_ROLES,
  avoidDuplicate,
  backedRole,
  isStandby,
  roleChoice,
  roleUse,
  serversFor,
  usesOpenRouter,
  wholeNumber,
} from './roles';
import { useAiEdits, useSerial } from './useAiEdits';

const PAGE_SETTINGS = ['ai.settings'] as const;

type Choices = Readonly<Record<RoleName, AiChoice>>;
type Switches = Readonly<Record<SwitchableRole, boolean>>;
type Masks = Readonly<Partial<Record<ProviderId, string | null>>>;

function choicesOf(settings: AiSettings): Choices {
  return {
    primary: roleChoice(settings, 'primary'),
    textRole: roleChoice(settings, 'textRole'),
    imageStandby: roleChoice(settings, 'imageStandby'),
    textStandby: roleChoice(settings, 'textStandby'),
  };
}

function switchesOf(settings: AiSettings): Switches {
  return {
    textRole: settings.textRole.on,
    imageStandby: settings.imageStandby.on,
    textStandby: settings.textStandby.on,
  };
}

/**
 * Settings › AI providers (P09-07; 03 §3.3, D-16.7, D-16.23–D-16.26): the plain word on where keys
 * live; the main provider, "Different model for text" and the two standbys, each on the P05-04
 * provider form; the request limits (the time limit and the answer length limit, for every
 * provider, R03.9) and OpenRouter's reasoning effort while OpenRouter fills a role; the notes for
 * the AI; and the food-database key. Nothing is drawn until the settings are read (R06.22).
 */
export function AiPage() {
  const read = useSettings(PAGE_SETTINGS);
  if (read.status === 'loading') return null;
  // Not set up yet, or unreadable: the page starts from the defaults and a save replaces them.
  const stored =
    (read.status === 'ready' ? read.value['ai.settings'] : null) ?? DEFAULT_AI_SETTINGS;
  return <AiSettingsForm stored={stored} />;
}

interface AiSettingsFormProps {
  /** The stored AI settings, kept current by the live read. */
  readonly stored: AiSettings;
}

function AiSettingsForm({ stored }: AiSettingsFormProps) {
  const edits = useAiEdits();
  const serial = useSerial();
  const toast = useToast();
  const [choices, setChoices] = useState<Choices>(() => choicesOf(stored));
  const [switches, setSwitches] = useState<Switches>(() => switchesOf(stored));
  const [masks, setMasks] = useState<Masks>({});
  const [effort, setEffort] = useState<OpenRouterEffort>(stored.openRouterEffort);
  const asked = useRef(new Set<ProviderId>());
  // The switches as last flipped, for saves that finish later.
  const flipped = useRef<Switches>(switches);

  const failed = useCallback(
    (error: unknown): void => {
      console.error('An AI setting could not be saved', error);
      toast.show(t('aiSetup.page.saveFailed'));
    },
    [toast],
  );

  // Each shown provider's saved key is read once, in turn with the saves, so it never lands late.
  const providersKey = [...new Set(ROLES.map((role) => choices[role].provider))].join(' ');
  useEffect(() => {
    for (const provider of providersKey.split(' ') as ProviderId[]) {
      if (asked.current.has(provider)) continue;
      asked.current.add(provider);
      serial(() => edits.savedKeyMask(provider)).then(
        (mask) => setMasks((known) => ({ ...known, [provider]: mask })),
        () => setMasks((known) => ({ ...known, [provider]: null })),
      );
    }
  }, [providersKey, edits, serial]);

  const save = useCallback(
    async (role: RoleName, choice: AiChoice) => {
      const saved = await serial(() => edits.saveRole(role, choice));
      setMasks((known) => ({ ...known, [choice.provider]: saved.keyMask }));
      // A role switched on before it was complete is stored on once it is.
      if (role !== 'primary' && flipped.current[role] && saved.missing.length === 0) {
        await serial(() => edits.setRoleOn(role, true));
      }
      return saved;
    },
    [edits, serial],
  );

  const forget = (provider: ProviderId): void => {
    serial(() => edits.forgetKey(provider)).then(() => {
      setMasks((known) => ({ ...known, [provider]: null }));
      // A key typed in any card for that provider is gone with it.
      setChoices((shown) => {
        const next: Record<RoleName, AiChoice> = { ...shown };
        for (const role of ROLES) {
          if (shown[role].provider === provider && shown[role].key !== '') {
            next[role] = { ...shown[role], key: '' };
          }
        }
        return next;
      });
    }, failed);
  };

  /**
   * A switch shows its new state at once. Off is stored at once; on is stored at once only when
   * the role is complete, else with its first complete save (`save`), so switching on a text
   * model that still lacks its key never stops text requests.
   */
  const flip = (role: SwitchableRole, on: boolean): void => {
    flipped.current = { ...flipped.current, [role]: on };
    setSwitches(flipped.current);
    let choice = choices[role];
    if (on && isStandby(role)) {
      // Switched on while it repeats the role it backs: start it on another model.
      choice = avoidDuplicate(choice, backedRole(stored, role), roleUse(role));
      if (choice !== choices[role]) setChoices((shown) => ({ ...shown, [role]: choice }));
    }
    if (!on || checkChoice(choice, masks[choice.provider] ?? null).ready) {
      serial(() => edits.setRoleOn(role, on)).catch(failed);
    }
  };

  const pickEffort = (value: string): void => {
    const next = OPENROUTER_EFFORTS.find((option) => option === value);
    if (next === undefined) return;
    setEffort(next);
    serial(() => edits.setOpenRouterEffort(next)).catch(failed);
  };

  const card = (role: RoleName) => (
    <RoleCard
      key={role}
      role={role}
      value={choices[role]}
      onChange={(next) => setChoices((shown) => ({ ...shown, [role]: next }))}
      on={role === 'primary' ? undefined : switches[role]}
      onSwitch={role === 'primary' ? undefined : (on) => flip(role, on)}
      savedKeyMask={masks[choices[role].provider]}
      savedServers={serversFor(stored, role)}
      backed={isStandby(role) ? backedRole(stored, role) : undefined}
      save={save}
      onForget={forget}
    />
  );

  return (
    <div className={styles.page} data-ui="ai">
      <p className={styles.warning} data-ui="ai.storage">
        <Icon name="lock" size={18} className={styles.warningIcon} />
        <span>{t('aiSetup.page.storage')}</span>
      </p>

      {card('primary')}
      {SWITCHABLE_ROLES.map(card)}

      <Card heading={t('aiSetup.page.limits.heading')} className={styles.card} data-ui="ai.limits">
        <div className={styles.body}>
          <NumberSetting
            label={t('aiSetup.page.limits.timeout.label')}
            unit={t('aiSetup.page.limits.timeout.unit')}
            hint={t('aiSetup.page.limits.timeout.hint')}
            initial={stored.timeoutSec}
            commit={(seconds) => serial(() => edits.setTimeoutSec(seconds))}
            onFailed={failed}
            data-ui="ai.timeout"
          />
          <NumberSetting
            label={t('aiSetup.page.limits.maxTokens.label')}
            unit={t('aiSetup.page.limits.maxTokens.unit')}
            hint={t('aiSetup.page.limits.maxTokens.hint')}
            initial={stored.maxTokens}
            commit={(tokens) => serial(() => edits.setMaxTokens(tokens))}
            onFailed={failed}
            data-ui="ai.maxTokens"
          />
          {usesOpenRouter(choices, switches) ? (
            <div className={styles.group}>
              <SelectField
                label={t('aiSetup.page.limits.effort.label')}
                value={effort}
                onChange={pickEffort}
                data-ui="ai.effort"
              >
                {OPENROUTER_EFFORTS.map((option) => (
                  <option key={option} value={option}>
                    {t(`aiSetup.page.limits.effort.options.${option}`)}
                  </option>
                ))}
              </SelectField>
              <p className={styles.note}>{t('aiSetup.page.limits.effort.help')}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <InstructionsField
        saved={stored.instructions}
        onSave={(text) => serial(() => edits.setInstructions(text))}
      />

      <FoodDbSection />
    </div>
  );
}

interface NumberSettingProps {
  readonly label: string;
  readonly unit: string;
  readonly hint: string;
  /** The stored value when the page opened. */
  readonly initial: number;
  /** Stores a typed whole number and resolves with the value as stored (clamped). */
  readonly commit: (value: number) => Promise<number>;
  readonly onFailed: (error: unknown) => void;
  readonly 'data-ui': string;
}

/**
 * A whole-number setting typed in a field and stored when the field is left (or Enter is
 * pressed). The field then shows the value as stored, so an out-of-range number shows where it
 * was clamped to; anything but digits goes back to the stored value.
 */
function NumberSetting({
  label,
  unit,
  hint,
  initial,
  commit,
  onFailed,
  'data-ui': ui,
}: NumberSettingProps) {
  const [text, setText] = useState(String(initial));
  const [stored, setStored] = useState(initial);

  const store = (): void => {
    const typed = wholeNumber(text);
    if (typed === null || typed === stored) {
      setText(String(stored));
      return;
    }
    commit(typed).then(
      (value) => {
        setStored(value);
        setText(String(value));
      },
      (error: unknown) => {
        setText(String(stored));
        onFailed(error);
      },
    );
  };

  const enter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  return (
    <Field
      label={label}
      unit={unit}
      hint={hint}
      value={text}
      onChange={setText}
      onBlur={store}
      onKeyDown={enter}
      inputMode="numeric"
      autoComplete="off"
      data-ui={ui}
    />
  );
}
