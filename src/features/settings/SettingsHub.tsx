import { useRouter } from '../../app/useRoute';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import { tx } from '../home/text';
import { groupsOf, SETTINGS_CATEGORIES, type SettingsCategory } from './registry';
import styles from './settings.module.css';

export interface SettingsHubProps {
  /** The categories to list; the registry's by default (tests pass their own). */
  readonly categories?: readonly SettingsCategory[];
}

/**
 * The Settings tab's first page: one card per group (preferences, then about), each listing its
 * categories in registry order as rows that open the category's page. Until a phase registers a
 * category, a short note says there is nothing to set up yet.
 */
export function SettingsHub({ categories = SETTINGS_CATEGORIES }: SettingsHubProps) {
  const router = useRouter();
  const groups = groupsOf(categories);

  return (
    <section className={styles.page} data-ui="screen.settings">
      <h1 className={styles.title}>{tx('common.tabs.settings')}</h1>
      {groups.length === 0 ? (
        <Card data-ui="settings.empty">
          <p className={styles.note}>{tx('settings.empty')}</p>
        </Card>
      ) : (
        groups.map(({ group, categories: rows }) => (
          <Card
            key={group}
            heading={tx(`settings.group.${group}`)}
            className={styles.group}
            data-ui={`settings.group.${group}`}
          >
            <ul className={styles.rows}>
              {rows.map((category) => (
                <li key={category.id} className={styles.rowItem}>
                  <button
                    type="button"
                    className={styles.row}
                    data-ui={`settings.category.${category.id}`}
                    onClick={() => router.navigate(category.route)}
                  >
                    <span className={styles.bubble} aria-hidden="true">
                      <Icon name={category.icon} size={18} />
                    </span>
                    <span className={styles.rowTitle}>{tx(category.titleKey)}</span>
                    <Icon name="chevronRight" size={18} className={styles.chevron} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </section>
  );
}
