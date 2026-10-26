import { t } from '../i18n/t';
import type { TabRoute } from './router';
import styles from './shell.module.css';
import { TAB_LABEL_KEYS } from './TabBar';

/**
 * What each route shows. For now every tab is a titled placeholder: Home (P04-10), Progress,
 * Coach and the Settings hub (P04-13) replace their lines here.
 */
export function Screen({ route }: { readonly route: TabRoute }) {
  return (
    <section data-ui={`screen.${route.tab}`}>
      <h1 className={styles.screenTitle}>{t(TAB_LABEL_KEYS[route.tab])}</h1>
    </section>
  );
}
