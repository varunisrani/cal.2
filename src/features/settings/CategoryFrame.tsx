import { tabRoute } from '../../app/router';
import { useRouter } from '../../app/useRoute';
import { Icon } from '../../ui/icons';
import { tx } from '../home/text';
import { CategoryPage } from './CategoryPage';
import type { SettingsCategory } from './registry';
import styles from './settings.module.css';

export interface CategoryFrameProps {
  readonly category: SettingsCategory;
  /** The page a sub-page is opened from (App settings for its pages); none for a hub page. */
  readonly parent?: SettingsCategory;
}

/**
 * A Settings category page: a back link, the category's title, then its page (a spinner until
 * the page and the settings it shows are ready). A hub page's back link is labelled with the
 * Settings tab's name and goes up to the hub; a sub-page's carries its parent's title and goes
 * back to the parent. Either way it steps back over the page when the page was opened from there,
 * so the browser's Back does not return here.
 */
export function CategoryFrame({ category, parent }: CategoryFrameProps) {
  const router = useRouter();

  return (
    <section className={styles.page} data-ui={`screen.settings.${category.id}`}>
      <button
        type="button"
        className={styles.back}
        data-ui="settings.back"
        onClick={() => router.navigate(parent ? parent.route : tabRoute('settings'))}
      >
        <Icon name="chevronLeft" size={20} />
        <span>{tx(parent ? parent.titleKey : 'common.tabs.settings')}</span>
      </button>
      <h1 className={styles.title}>{tx(category.titleKey)}</h1>
      <CategoryPage category={category} />
    </section>
  );
}
