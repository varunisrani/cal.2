import { useEffect, type CSSProperties } from 'react';
import { isHideableTab } from '../data/settingsSchema';
import { useFeed } from '../data/useLive';
import { t, type TKey } from '../i18n/t';
import { Icon, type IconName } from '../ui/icons';
import { useAppData } from './appDataContext';
import { useAppState } from './appState';
import { HOME_ROUTE, TAB_IDS, tabOf, type Route, type TabId } from './router';
import styles from './shell.module.css';
import { useRoute } from './useRoute';

const TAB_LABELS = {
  home: 'common.tabs.home',
  progress: 'common.tabs.progress',
  coach: 'common.tabs.coach',
  settings: 'common.tabs.settings',
} as const satisfies Record<TabId, TKey>;

const TAB_ICONS: Readonly<Record<TabId, IconName>> = {
  home: 'home',
  progress: 'chart',
  coach: 'chat',
  settings: 'gear',
};

/**
 * The tabs left after the stored hidden list, in their fixed order. Only Progress and Coach can
 * be hidden; Home, Settings and names this build does not know in the list are ignored (R05.13).
 */
export function visibleTabs(hidden: readonly string[]): TabId[] {
  return TAB_IDS.filter((tab) => !(isHideableTab(tab) && hidden.includes(tab)));
}

/** What a tap on `tab` does while `route` is on screen. */
export function tapOutcome(route: Route, tab: TabId): 'hub' | 'nothing' | 'switch' {
  const current = tabOf(route);
  if (tab === 'settings' && current === 'settings') return 'hub';
  return tab === current ? 'nothing' : 'switch';
}

/**
 * The floating bar of tabs. Not drawn until the hidden-tab setting is read (so a hidden tab
 * never flashes in), on onboarding, or while the analysis overlay is up.
 */
export function TabBar() {
  const settings = useFeed(useAppData().settings.feed);
  const { route, navigate, showTab } = useRoute();
  const { analysisOverlay } = useAppState();
  const hidden = settings.status === 'ready' ? settings.value['tabs.hidden'] : null;
  const tabs = hidden === null ? null : visibleTabs(hidden);
  const current = tabOf(route);
  const currentHidden = tabs !== null && current !== null && !tabs.includes(current);

  // The tab on screen was hidden (by the setting or a restored backup): leave it for Home.
  useEffect(() => {
    if (currentHidden) navigate(HOME_ROUTE);
  }, [currentHidden, navigate]);

  if (tabs === null || current === null || currentHidden || analysisOverlay) return null;

  const tap = (tab: TabId) => {
    const outcome = tapOutcome(route, tab);
    if (outcome === 'hub') navigate({ name: 'settings' });
    else if (outcome === 'switch') showTab(tab);
  };
  const pill = {
    '--tab-index': tabs.indexOf(current),
    '--tab-count': tabs.length,
  } as CSSProperties;

  return (
    <nav className={styles.tabBar} aria-label={t('shell.tabs')} data-ui="shell.tabs">
      <div className={styles.tabList}>
        <span className={styles.pill} style={pill} aria-hidden="true" />
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={styles.tab}
            data-ui={`shell.tab.${tab}`}
            aria-current={tab === current ? 'page' : undefined}
            onClick={() => tap(tab)}
          >
            <span className={styles.tabIcon}>
              <Icon name={TAB_ICONS[tab]} />
            </span>
            {t(TAB_LABELS[tab])}
          </button>
        ))}
      </div>
    </nav>
  );
}
