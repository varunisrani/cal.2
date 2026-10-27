import { useSettings } from '../../../data/hooks';
import { HIDEABLE_TABS, type HideableTab } from '../../../data/settingsSchema';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Switch } from '../../../ui/Switch';
import styles from './appSettings.module.css';
import { useAppSettingsService, usePendingWrites, useSaveFailed } from './writes';

const SETTINGS = ['tabs.hidden'] as const;

/**
 * Settings › Tab bar (06 §3.5): a switch for each tab a person may take out of the bar (Progress
 * and Coach), on while the tab is shown; a note says Home and Settings always stay. A switch flips
 * the moment it is pressed and then follows the stored list. Each press changes its own tab only,
 * reading the stored list inside the write, so a page showing an older list never undoes a change
 * made elsewhere (R05.13). The shell's bar drops the tab, and leaves it for Home if it is on screen.
 */
export function TabsPage() {
  const settings = useSettings(SETTINGS);
  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="tabBar.unavailable">
        {t('appSettings.unavailable')}
      </p>
    );
  }
  return <TabSwitches hidden={settings.value['tabs.hidden']} />;
}

function TabSwitches({ hidden }: { readonly hidden: readonly HideableTab[] }) {
  const service = useAppSettingsService();
  const failed = useSaveFailed();
  // One plain value per switch, so a change to one tab never holds back the other.
  const shown = Object.fromEntries(HIDEABLE_TABS.map((tab) => [tab, !hidden.includes(tab)])) as {
    readonly [T in HideableTab]: boolean;
  };
  const pending = usePendingWrites(shown);

  const show = (tab: HideableTab, on: boolean): void => {
    pending.write(tab, on, () => service.setTabHidden(tab, !on)).catch(failed);
  };

  return (
    <div className={styles.page} data-ui="tabBar">
      <div className={styles.section}>
        <Card heading={t('appSettings.tabBar.heading')} className={styles.card}>
          <ul className={styles.rows}>
            {HIDEABLE_TABS.map((tab) => (
              <li key={tab} className={`${styles.rowItem} ${styles.switchItem}`}>
                <Switch
                  label={t(`common.tabs.${tab}`)}
                  checked={pending.shown(tab)}
                  onChange={(on) => show(tab, on)}
                  data-ui={`tabBar.${tab}`}
                />
              </li>
            ))}
          </ul>
        </Card>
        <p className={styles.note} data-ui="tabBar.note">
          {t('appSettings.tabBar.note')}
        </p>
      </div>
    </div>
  );
}
