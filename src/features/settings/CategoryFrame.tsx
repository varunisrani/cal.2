import { Suspense } from 'react';
import { tabRoute } from '../../app/router';
import { Skeleton } from '../../app/Skeleton';
import { useRouter } from '../../app/useRoute';
import { Icon } from '../../ui/icons';
import { tx } from '../home/text';
import type { SettingsCategory } from './registry';
import styles from './settings.module.css';

export interface CategoryFrameProps {
  readonly category: SettingsCategory;
}

/**
 * A Settings category page: a back link labelled with the Settings tab's name, the category's
 * title, then its page (the skeleton while the page is still loading). The back link goes up to
 * the hub by stepping back over the page, so the browser's Back does not return here.
 */
export function CategoryFrame({ category }: CategoryFrameProps) {
  const router = useRouter();
  const Page = category.page;

  return (
    <section className={styles.page} data-ui={`screen.settings.${category.id}`}>
      <button
        type="button"
        className={styles.back}
        data-ui="settings.back"
        onClick={() => router.navigate(tabRoute('settings'))}
      >
        <Icon name="chevronLeft" size={20} />
        <span>{tx('common.tabs.settings')}</span>
      </button>
      <h1 className={styles.title}>{tx(category.titleKey)}</h1>
      <Suspense fallback={<Skeleton heading={false} data-ui="settings.pageLoading" />}>
        <Page />
      </Suspense>
    </section>
  );
}
