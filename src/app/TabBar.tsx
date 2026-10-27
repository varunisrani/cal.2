import { useLayoutEffect, type CSSProperties } from 'react';
import { t, type TKey } from '../i18n/t';
import { cx } from '../ui/classes';
import { Icon, type IconName } from '../ui/icons';
import { useAppState } from './appState';
import { useShellSettings } from './ports';
import { TABS, type TabId } from './router';
import styles from './shell.module.css';
import { appUpdates, useAppUpdate, type AppUpdates } from './swRegistration';
import { useRoute, useRouter } from './useRoute';

/** The tabs a person may hide; Home and Settings always stay. */
export const HIDEABLE_TABS: readonly TabId[] = ['progress', 'coach'];

/** Each tab's name in the catalogue. */
export const TAB_LABEL_KEYS: Readonly<Record<TabId, TKey>> = {
  home: 'common.tabs.home',
  progress: 'common.tabs.progress',
  coach: 'common.tabs.coach',
  settings: 'common.tabs.settings',
};

const TAB_ICONS: Readonly<Record<Exclude<TabId, 'home'>, IconName>> = {
  progress: 'chart',
  coach: 'chat',
  settings: 'gear',
};

/** True when `tab` can be hidden and the stored list hides it; other names change nothing. */
export function isHiddenTab(tab: TabId, hidden: readonly string[]): boolean {
  return HIDEABLE_TABS.includes(tab) && hidden.some((name) => name.trim() === tab);
}

/** The tabs the bar shows, always in the fixed order. */
export function visibleTabs(hidden: readonly string[]): TabId[] {
  return TABS.filter((tab) => !isHiddenTab(tab, hidden));
}

/**
 * A house for Home, drawn on the icon set's grid and stroke (the set has no home icon yet; see
 * the task note).
 */
function HomeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
      data-icon="home"
    >
      <path d="M3.5 11.2L12 4l8.5 7.2" />
      <path d="M6 9.4v9.1a1.5 1.5 0 0 0 1.5 1.5h3v-5.2h3V20h3a1.5 1.5 0 0 0 1.5-1.5V9.4" />
    </svg>
  );
}

export interface TabBarProps {
  /** The update flag behind the Settings tab's dot (P09-01); the app's own by default. */
  readonly updates?: AppUpdates;
}

/**
 * The floating bar of tabs at the bottom of every tab screen. It is drawn only once the settings
 * are known, so a hidden tab never shows for a moment (R05.13), and not at all on onboarding or
 * while the analysis overlay covers the screen. While a new version waits, a dot marks Settings,
 * where About tells more (the update banner says it in words).
 */
export function TabBar({ updates = appUpdates }: TabBarProps = {}) {
  const settings = useShellSettings();
  const update = useAppUpdate(updates).status;
  const route = useRoute();
  const router = useRouter();
  const { analysisOverlay } = useAppState();
  const hidden = settings?.hiddenTabs;
  const onHiddenTab =
    route.kind === 'tab' && hidden !== undefined && isHiddenTab(route.tab, hidden);

  // The tab on screen was hidden (by the setting or a restored backup): go Home before the
  // hidden screen is painted.
  useLayoutEffect(() => {
    if (onHiddenTab) router.selectTab('home');
  }, [onHiddenTab, router]);

  if (hidden === undefined || route.kind !== 'tab' || analysisOverlay) return null;

  const tabs = visibleTabs(hidden);
  const selected = tabs.indexOf(route.tab);
  const layout = { '--tab-count': tabs.length, '--tab-index': Math.max(selected, 0) };

  return (
    <nav
      className={styles.tabBar}
      aria-label={t('shell.tabBar.label')}
      data-ui="shell.tabbar"
      style={layout as CSSProperties}
    >
      {selected >= 0 ? <span className={styles.tabPill} aria-hidden="true" /> : null}
      {tabs.map((tab) => {
        const current = tab === route.tab;
        return (
          <button
            key={tab}
            type="button"
            className={cx(styles.tab, current && styles.tabSelected)}
            aria-current={current ? 'page' : undefined}
            data-ui={`shell.tabbar.${tab}`}
            onClick={() => router.selectTab(tab)}
          >
            {tab === 'home' ? <HomeGlyph /> : <Icon name={TAB_ICONS[tab]} />}
            {tab === 'settings' && update === 'ready' ? (
              <span className={styles.tabDot} aria-hidden="true" data-ui="shell.tabbar.updateDot" />
            ) : null}
            <span className={styles.tabLabel}>{t(TAB_LABEL_KEYS[tab])}</span>
          </button>
        );
      })}
    </nav>
  );
}
