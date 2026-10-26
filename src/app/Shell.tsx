import { useLayoutEffect, useRef } from 'react';
import { routeHash, tabOf } from './router';
import { RouteScreen } from './RouteScreen';
import styles from './shell.module.css';
import { TabBar } from './TabBar';
import { useRoute, useRouter } from './useRoute';

/**
 * The app once it has started: one scrolling content area showing the route's screen, with
 * each address's scroll position kept and restored, and the tab bar floating over it.
 */
export function Shell() {
  const router = useRouter();
  const { route } = useRoute();
  const content = useRef<HTMLElement>(null);
  const address = routeHash(route);

  // The router reads the position at the moment a screen is left.
  useLayoutEffect(() => {
    router.setScrollReader(() => content.current?.scrollTop ?? 0);
    return () => router.setScrollReader(null);
  }, [router]);

  // Runs before paint, so a screen shown again never flashes at the wrong scroll position.
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = router.scrollOf(route);
    // `address` names the route; the route object itself is new on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, router]);

  return (
    <div className={styles.shell}>
      <main
        ref={content}
        className={styles.content}
        data-ui="shell.content"
        data-tab-bar={tabOf(route) === null ? undefined : ''}
      >
        <RouteScreen route={route} />
      </main>
      <TabBar />
    </div>
  );
}
