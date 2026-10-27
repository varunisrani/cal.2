import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSettings } from '../../../data/hooks';
import { dayKeyOf } from '../../../domain/dates/dayKey';
import { formatDay, formatTime } from '../../../i18n/format';
import { t, type TKey } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import { HEALTH_READ_KINDS, HEALTH_WRITE_KINDS } from '../../../services/health/contract';
import type { HealthService, HealthStatus } from '../../../services/health/service';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import { useToast } from '../../../ui/Toast';
import styles from './health.module.css';

const SETTINGS = [
  'health.connected',
  'health.countActiveCalories',
  'health.importWeights',
  'health.writeBack',
] as const;

type HealthSwitch = Exclude<(typeof SETTINGS)[number], 'health.connected'>;

/** What the connection card says. */
function statusKey(status: HealthStatus, connected: boolean): TKey {
  switch (status.availability) {
    case null:
      return 'health.status.checking';
    case 'notInstalled':
      return 'health.status.notInstalled';
    case 'updateRequired':
      return 'health.status.updateRequired';
    case 'notSupported':
      return 'health.status.notSupported';
    case 'available':
      break;
  }
  if (!connected) return 'health.status.notConnected';
  return status.granted?.read.length === 0 ? 'health.status.revoked' : 'health.status.connected';
}

/** "Last synced Oct 26, 2:05 PM", or "Not synced yet". */
function lastSyncText(ms: number | null): string {
  if (ms === null) return t('health.sync.never');
  return t('health.sync.last', { day: formatDay(dayKeyOf(ms), 'short'), time: formatTime(ms) });
}

/**
 * Settings › Health Connect (P11-04), registered only in the Android app: whether Health Connect
 * is there and connected, Connect (or Grant access again once access was removed), Disconnect and
 * Open Health Connect; then, while connected, what is allowed, the three switches and the last
 * sync with Sync now. Nothing is drawn until the settings are read (R06.22).
 */
export function HealthPage() {
  const { health } = useServices();
  if (!health) {
    return (
      <p className={styles.note} data-ui="health.unavailable">
        {t('health.status.notSupported')}
      </p>
    );
  }
  return <HealthSettings health={health} />;
}

function HealthSettings({ health }: { readonly health: HealthService }) {
  const status = useSyncExternalStore(health.subscribe, health.getSnapshot);
  const settings = useSettings(SETTINGS);
  const toast = useToast();
  // A note under the connection card after an attempt to connect that gave nothing.
  const [refused, setRefused] = useState(false);
  const [saving, setSaving] = useState<HealthSwitch | null>(null);

  // What is allowed may have changed in Health Connect since the status was last read.
  useEffect(() => {
    void health.refresh();
  }, [health]);

  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="health.unavailable">
        {t('health.page.unavailable')}
      </p>
    );
  }

  const connected = settings.value['health.connected'];
  const available = status.availability === 'available';
  const revoked = connected && status.granted?.read.length === 0;
  const granted = status.granted;

  const connect = async (): Promise<void> => {
    setRefused(false);
    const outcome = await health.connect();
    if (outcome.kind === 'refused') setRefused(true);
    else if (outcome.kind === 'failed') toast.show(t('health.status.failed'));
  };

  const disconnect = async (): Promise<void> => {
    try {
      await health.disconnect();
    } catch (error) {
      console.error('Disconnecting Health Connect failed', error);
      toast.show(t('health.options.saveFailed'));
    }
  };

  const change = async (key: HealthSwitch, on: boolean): Promise<void> => {
    setSaving(key);
    try {
      if (key === 'health.writeBack') {
        const outcome = await health.setWriteBack(on);
        if (outcome.kind === 'refused') toast.show(t('health.options.writeRefused'));
        if (outcome.kind === 'failed') toast.show(t('health.options.saveFailed'));
      } else if (key === 'health.importWeights') {
        await health.setImportWeights(on);
      } else {
        await health.setCountActiveCalories(on);
      }
    } catch (error) {
      console.error('A Health Connect setting could not be saved', error);
      toast.show(t('health.options.saveFailed'));
    } finally {
      setSaving(null);
    }
  };

  const toggle = (key: HealthSwitch, label: TKey, hint: TKey, ui: string) => (
    <li className={`${styles.rowItem} ${styles.switchItem}`}>
      <Switch
        label={t(label)}
        description={t(hint)}
        checked={settings.value[key]}
        disabled={saving !== null}
        onChange={(next) => void change(key, next)}
        data-ui={ui}
      />
    </li>
  );

  return (
    <div className={styles.page} data-ui="health">
      <Card heading={t('health.status.heading')} className={styles.card} data-ui="health.status">
        <p className={styles.status} role="status" data-ui="health.status.text">
          {t(statusKey(status, connected))}
        </p>
        {refused ? (
          <p className={styles.problem} data-ui="health.status.refused">
            {t('health.status.refused')}
          </p>
        ) : null}
        {available ? (
          <div className={styles.actions}>
            {!connected || revoked ? (
              <Button variant="primary" onClick={connect} data-ui="health.connect">
                {t(connected ? 'health.status.grant' : 'health.status.connect')}
              </Button>
            ) : (
              <Button variant="quiet" onClick={disconnect} data-ui="health.disconnect">
                {t('health.status.disconnect')}
              </Button>
            )}
            <Button onClick={() => health.openHealthConnect()} data-ui="health.open">
              {t('health.status.open')}
            </Button>
          </div>
        ) : null}
        {available && connected ? (
          <p className={styles.note}>{t('health.status.disconnectNote')}</p>
        ) : null}
      </Card>

      {connected && available && granted ? (
        <Card heading={t('health.data.heading')} className={styles.listCard} data-ui="health.data">
          <ul className={styles.rows}>
            {HEALTH_READ_KINDS.map((kind) => (
              <li key={kind} className={`${styles.rowItem} ${styles.dataRow}`}>
                <span>{t(`health.data.read.${kind}`)}</span>
                <span className={styles.dataState} data-ui={`health.read.${kind}`}>
                  {t(
                    granted.read.includes(kind) ? 'health.data.allowed' : 'health.data.notAllowed',
                  )}
                </span>
              </li>
            ))}
            {HEALTH_WRITE_KINDS.map((kind) => (
              <li key={`write-${kind}`} className={`${styles.rowItem} ${styles.dataRow}`}>
                <span>{t(`health.data.write.${kind}`)}</span>
                <span className={styles.dataState} data-ui={`health.write.${kind}`}>
                  {t(
                    granted.write.includes(kind) ? 'health.data.allowed' : 'health.data.notAllowed',
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {connected ? (
        <Card
          heading={t('health.options.heading')}
          className={styles.listCard}
          data-ui="health.options"
        >
          <ul className={styles.rows}>
            {toggle(
              'health.countActiveCalories',
              'health.options.count',
              'health.options.countHint',
              'health.countActive',
            )}
            {toggle(
              'health.importWeights',
              'health.options.importWeights',
              'health.options.importWeightsHint',
              'health.importWeights',
            )}
            {toggle(
              'health.writeBack',
              'health.options.writeBack',
              'health.options.writeBackHint',
              'health.writeBack',
            )}
          </ul>
        </Card>
      ) : null}

      {connected ? (
        <Card heading={t('health.sync.heading')} className={styles.card} data-ui="health.sync">
          <p className={styles.status} data-ui="health.lastSync">
            {lastSyncText(status.lastSyncAt)}
          </p>
          {status.failure === null ? null : (
            <p className={styles.problem} data-ui="health.sync.failed">
              {t('health.sync.failed')}
            </p>
          )}
          <div className={styles.actions}>
            <Button
              busy={status.syncing}
              disabled={revoked || !available}
              onClick={() => health.sync()}
              data-ui="health.syncNow"
            >
              {t('health.sync.now')}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
