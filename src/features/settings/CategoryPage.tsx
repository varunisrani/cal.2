import { Suspense, type ReactNode } from 'react';
import { useSettings } from '../../data/hooks';
import { tx } from '../home/text';
import type { SettingsCategory } from './registry';
import styles from './settings.module.css';

/** No setting in particular: the read only says whether the stored settings are in. */
const NO_KEYS = [] as const;

export interface CategoryPageProps {
  readonly category: SettingsCategory;
}

/**
 * A Settings category's content, under its back link and title. A page that shows stored
 * settings waits for them: until the first snapshot has been read a spinner stands in its place,
 * so a switch never shows its default instead of the stored value, nor stores that default when
 * tapped (R06.22). The same spinner covers the page's own download. A read that fails lets the
 * page draw, and the page says it cannot show its settings.
 */
export function CategoryPage({ category }: CategoryPageProps) {
  const Page = category.page;
  const page = (
    <Suspense fallback={<PageLoading />}>
      <Page />
    </Suspense>
  );
  if (category.waitForSettings === false) return page;
  return <SettingsGate>{page}</SettingsGate>;
}

function SettingsGate({ children }: { readonly children: ReactNode }) {
  const stored = useSettings(NO_KEYS);
  return stored.status === 'loading' ? <PageLoading /> : children;
}

/**
 * The spinner of a page that is not ready yet. Its hook, `settings.pageLoading`, is the one
 * `untilLoaded()` (src/test/lazy.ts) waits for.
 */
export function PageLoading() {
  return (
    <div
      className={styles.loading}
      role="status"
      aria-label={tx('settings.loading')}
      data-ui="settings.pageLoading"
    >
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  );
}
