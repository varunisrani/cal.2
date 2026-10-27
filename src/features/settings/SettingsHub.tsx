import { appUpdates, useAppUpdate, type AppUpdates } from '../../app/swRegistration';
import { useRouter } from '../../app/useRoute';
import { Card } from '../../ui/Card';
import { Icon, type IconName } from '../../ui/icons';
import { tx, type TxKey } from '../home/text';
import {
  hubGroups,
  SETTINGS_CATEGORIES,
  SETTINGS_LINKS,
  UPDATE_ROW,
  type HubRow,
  type SettingsCategory,
  type SettingsLink,
} from './registry';
import styles from './settings.module.css';

export interface SettingsHubProps {
  /** The categories to list; the registry's by default (tests pass their own). */
  readonly categories?: readonly SettingsCategory[];
  /** The link rows to list; the registry's by default (tests pass their own). */
  readonly links?: readonly SettingsLink[];
  /** The update flag behind the About row's dot; the app's own by default. */
  readonly updates?: AppUpdates;
}

/**
 * The Settings tab's first page: one card per group (preferences, then about), each listing its
 * rows in the hub's order (HUB_ORDER): pages that open under a back link, and links that open
 * Platewise's own pages in a new tab. Sub-pages are reached from their parent, not from here.
 * While a new version waits, a dot marks the About row. Until a phase registers a category, a
 * short note says there is nothing to set up yet.
 */
export function SettingsHub({
  categories = SETTINGS_CATEGORIES,
  links = SETTINGS_LINKS,
  updates = appUpdates,
}: SettingsHubProps) {
  const { status } = useAppUpdate(updates);
  const groups = hubGroups(categories, links);

  return (
    <section className={styles.page} data-ui="screen.settings">
      <h1 className={styles.title}>{tx('common.tabs.settings')}</h1>
      {groups.length === 0 ? (
        <Card data-ui="settings.empty">
          <p className={styles.note}>{tx('settings.empty')}</p>
        </Card>
      ) : (
        groups.map(({ group, rows }) => (
          <Card
            key={group}
            heading={tx(`settings.group.${group}`)}
            className={styles.group}
            data-ui={`settings.group.${group}`}
          >
            <ul className={styles.rows}>
              {rows.map((row) => (
                <li
                  key={row.kind === 'page' ? row.category.id : row.link.id}
                  className={styles.rowItem}
                >
                  <HubRowItem row={row} updateReady={status === 'ready'} />
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </section>
  );
}

interface RowFaceProps {
  readonly icon: IconName;
  readonly titleKey: TxKey;
  readonly dot: boolean;
}

/** What every row shows: the icon in its bubble, the title, the update dot if any, a chevron. */
function RowFace({ icon, titleKey, dot }: RowFaceProps) {
  return (
    <>
      <span className={styles.bubble} aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className={styles.rowTitle}>{tx(titleKey)}</span>
      {dot ? <span className={styles.dot} aria-hidden="true" data-ui="settings.updateDot" /> : null}
      <Icon name="chevronRight" size={18} className={styles.chevron} />
    </>
  );
}

function HubRowItem({ row, updateReady }: { readonly row: HubRow; readonly updateReady: boolean }) {
  const router = useRouter();
  if (row.kind === 'link') {
    const { link } = row;
    return (
      <a
        className={styles.row}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        data-ui={`settings.link.${link.id}`}
      >
        <RowFace icon={link.icon} titleKey={link.titleKey} dot={false} />
      </a>
    );
  }
  const { category } = row;
  return (
    <button
      type="button"
      className={styles.row}
      data-ui={`settings.category.${category.id}`}
      onClick={() => router.navigate(category.route)}
    >
      <RowFace
        icon={category.icon}
        titleKey={category.titleKey}
        dot={updateReady && category.id === UPDATE_ROW}
      />
    </button>
  );
}
