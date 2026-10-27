import { useEffect, useRef, useState } from 'react';
import { PROVIDERS, type ProviderId } from '../../../ai/catalog/providers';
import type { RoleName } from '../../../ai/settings';
import { t } from '../../../i18n/t';
import type { AiChoice, SavedChoice } from '../../../services/aiSetup';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import { checkChoice, type SavedServers } from '../../ai-setup/choice';
import { ProviderForm } from '../../ai-setup/ProviderForm';
import styles from './ai.module.css';
import { avoidDuplicate, hiddenModel, isDuplicate, roleUse, type BackedRole } from './roles';

export interface RoleCardProps {
  readonly role: RoleName;
  /** The role's choice as shown; every edit hands back a new one through `onChange`. */
  readonly value: AiChoice;
  readonly onChange: (next: AiChoice) => void;
  /** Whether a switchable role is on; left out for the primary, which always is. */
  readonly on?: boolean;
  readonly onSwitch?: (on: boolean) => void;
  /** The shown provider's saved key, masked; null when none is saved, undefined while reading. */
  readonly savedKeyMask: string | null | undefined;
  /** The addresses saved in the role's slot, where a provider switch starts from. */
  readonly savedServers: SavedServers;
  /** For a standby: the role it backs, whose model its list hides on the same server. */
  readonly backed?: BackedRole;
  /** Stores a complete choice for the role; the page runs these one at a time. */
  readonly save: (role: RoleName, choice: AiChoice) => Promise<SavedChoice>;
  /** Forgets the provider's key, for every role that uses it. */
  readonly onForget: (provider: ProviderId) => void;
}

/**
 * One role of Settings › AI providers (03 §3.3): its heading, its switch (the text model and the
 * standbys), then while it is on the P05-04 provider form and a way to forget the provider's key.
 * A choice is saved each time it becomes complete, so a half-made change never stops requests; a
 * standby never lists the model of the role it backs on the same server, and picking that
 * provider moves it to the provider's next preset.
 */
export function RoleCard({
  role,
  value,
  onChange,
  on,
  onSwitch,
  savedKeyMask,
  savedServers,
  backed,
  save,
  onForget,
}: RoleCardProps) {
  const use = roleUse(role);
  // What the page opened with is already stored; only the person's edits are saved.
  const opened = useRef(value);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const shown = on ?? true;
  const ready = checkChoice(value, savedKeyMask ?? null).ready;

  useEffect(() => {
    if (value === opened.current || !ready) return;
    let current = true;
    save(role, value).then(
      () => current && setFailed(false),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [role, value, ready, attempt, save]);

  const pick = (next: AiChoice): void => {
    const moved = backed !== undefined && next.provider !== value.provider;
    onChange(moved ? avoidDuplicate(next, backed, use) : next);
  };

  return (
    <Card
      heading={t(`aiSetup.page.roles.${role}.heading`)}
      className={styles.card}
      data-ui={`ai.${role}.card`}
    >
      {onSwitch && role !== 'primary' ? (
        <Switch
          label={t(`aiSetup.page.roles.${role}.switch`)}
          description={t(`aiSetup.page.roles.${role}.about`)}
          checked={shown}
          onChange={onSwitch}
          data-ui={`ai.${role}.on`}
        />
      ) : (
        <p className={styles.note}>{t('aiSetup.page.roles.primary.about')}</p>
      )}
      {shown ? (
        <div className={styles.body}>
          <ProviderForm
            value={value}
            onChange={pick}
            savedKeyMask={savedKeyMask}
            savedServers={savedServers}
            use={use}
            hiddenModel={backed ? hiddenModel(value, backed) : undefined}
            data-ui={`ai.${role}`}
          />
          {backed && isDuplicate(value, backed) ? (
            <p className={styles.alert} data-ui={`ai.${role}.same`}>
              {t('aiSetup.page.same')}
            </p>
          ) : null}
          {!ready && savedKeyMask !== undefined ? (
            <p className={styles.note} data-ui={`ai.${role}.pending`}>
              {t('aiSetup.page.pending')}
            </p>
          ) : null}
          {failed ? (
            <div className={styles.actions}>
              <p className={styles.alert} role="alert">
                {t('aiSetup.page.saveFailed')}
              </p>
              <Button data-ui={`ai.${role}.retry`} onClick={() => setAttempt((n) => n + 1)}>
                {t('common.retry')}
              </Button>
            </div>
          ) : null}
          {savedKeyMask ? (
            <Button
              variant="quiet"
              className={styles.start}
              data-ui={`ai.${role}.forget`}
              onClick={() => onForget(value.provider)}
            >
              {t('aiSetup.page.forget', { provider: PROVIDERS[value.provider].name })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
