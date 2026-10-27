import { appUpdates, useAppUpdate, type AppUpdates } from '../../app/swRegistration';
import { useRouter } from '../../app/useRoute';
import { APP_VERSION } from '../../config/build';
import { INSPIRATION } from '../../config/credit';
import { isMailAddress, LINKS, type LinkName, type PlatewiseLinks } from '../../config/links';
import { t, type TKey } from '../../i18n/t';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/icons';
import { useToast } from '../../ui/Toast';
import { categoryFor, SETTINGS_CATEGORIES, type SettingsCategory } from '../settings/registry';
import styles from './aboutPage.module.css';
import { appAddress, browserShareTarget, shareLink, type ShareTarget } from './share';

/** The pages About links to, in order, by their Settings ids (P05-13, P09-16). */
export const ABOUT_SUBPAGES = ['methods', 'credits'] as const;

/** The help card's links, in order, with their row names. */
const HELP_LINKS: readonly { readonly name: LinkName; readonly label: TKey }[] = [
  { name: 'help', label: 'about.page.help.help' },
  { name: 'contact', label: 'about.page.help.contact' },
  { name: 'source', label: 'about.page.help.source' },
];

export interface AboutPageProps {
  /** The update flag; the app's own by default (tests pass theirs). */
  readonly updates?: AppUpdates;
  /** Platewise's own addresses; src/config/links.ts by default. */
  readonly links?: PlatewiseLinks;
  /** The browser's share sheet and clipboard by default. */
  readonly shareTarget?: ShareTarget;
  /** Where the linked pages are looked up; the registry by default. */
  readonly categories?: readonly SettingsCategory[];
}

/**
 * Settings › About Platewise (06 §3.20, D-16.43): the mark, the name and this build's version;
 * whether a new version waits (Reload only on a press, like the update banner, P09-17); what
 * changed; help, contact and source links once the owner has supplied them (hidden until then,
 * D-16.66); Share Platewise; the calculation methods and the licences and credits pages; and a
 * line naming the app that inspired Platewise. There is no What's New dialog.
 */
export function AboutPage({
  updates = appUpdates,
  links = LINKS,
  shareTarget,
  categories = SETTINGS_CATEGORIES,
}: AboutPageProps) {
  const { status, apply } = useAppUpdate(updates);
  const router = useRouter();
  const toast = useToast();
  const pages = ABOUT_SUBPAGES.flatMap((id) => categoryFor([id], categories) ?? []);
  const help = HELP_LINKS.flatMap(({ name, label }) => {
    const address = links[name];
    return address === null ? [] : [{ name, label, address }];
  });

  const share = async (): Promise<void> => {
    const url = appAddress(links.site, window.location.href, import.meta.env.BASE_URL);
    const outcome = await shareLink(
      { title: t('common.appName'), text: t('about.page.share.text'), url },
      shareTarget ?? browserShareTarget(),
    );
    if (outcome === 'copied') toast.show(t('about.page.share.copied'));
    if (outcome === 'failed') toast.show(t('about.page.share.failed', { url }));
  };

  return (
    <div className={styles.page} data-ui="about">
      <header className={styles.identity}>
        <img className={styles.mark} src={`${import.meta.env.BASE_URL}icons/mark.svg`} alt="" />
        <p className={styles.name}>{t('common.appName')}</p>
        <p className={styles.version} data-ui="about.version">
          {t('about.page.version', { version: APP_VERSION })}
        </p>
      </header>

      <Card heading={t('about.page.updates.heading')} className={styles.card}>
        <ul className={styles.rows}>
          <li className={styles.rowItem}>
            <div className={styles.status} role="status" data-ui="about.update">
              <Icon name={status === 'ready' ? 'warning' : 'check'} className={styles.rowIcon} />
              <div className={styles.statusText}>
                <p className={styles.statusTitle}>
                  {status === 'ready'
                    ? t('about.page.updates.ready')
                    : t('about.page.updates.current')}
                </p>
                <p className={styles.hint}>
                  {status === 'ready'
                    ? t('about.page.updates.readyHint')
                    : t('about.page.updates.currentHint')}
                </p>
              </div>
              {status === 'ready' ? (
                <Button variant="primary" data-ui="about.update.reload" onClick={apply}>
                  {t('about.page.updates.reload')}
                </Button>
              ) : null}
            </div>
          </li>
          {links.changelog === null ? null : (
            <li className={styles.rowItem}>
              <ExternalRow address={links.changelog} data-ui="about.link.changelog">
                {t('about.page.updates.changelog')}
              </ExternalRow>
            </li>
          )}
        </ul>
      </Card>

      {help.length > 0 ? (
        <Card heading={t('about.page.help.heading')} className={styles.card} data-ui="about.help">
          <ul className={styles.rows}>
            {help.map(({ name, label, address }) => (
              <li key={name} className={styles.rowItem}>
                <ExternalRow address={address} data-ui={`about.link.${name}`}>
                  {t(label)}
                </ExternalRow>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card heading={t('about.page.more.heading')} className={styles.card}>
        <ul className={styles.rows}>
          <li className={styles.rowItem}>
            <button type="button" className={styles.row} data-ui="about.share" onClick={share}>
              <span className={styles.rowTitle}>{t('about.page.share.label')}</span>
            </button>
          </li>
          {pages.map((page) => (
            <li key={page.id} className={styles.rowItem}>
              <button
                type="button"
                className={styles.row}
                data-ui={`about.page.${page.id}`}
                onClick={() => router.navigate(page.route)}
              >
                <span className={styles.rowTitle}>{t(page.titleKey)}</span>
                <Icon name="chevronRight" size={18} className={styles.chevron} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <p className={styles.footer} data-ui="about.inspired">
        {t('about.page.inspired', { name: INSPIRATION.name })}
      </p>
    </div>
  );
}

interface ExternalRowProps {
  readonly address: string;
  readonly children: string;
  readonly 'data-ui': string;
}

/** A row that leaves the app: a page in a new tab, or an email in the mail app. */
function ExternalRow({ address, children, 'data-ui': dataUi }: ExternalRowProps) {
  const page = !isMailAddress(address);
  return (
    <a
      className={styles.row}
      href={address}
      data-ui={dataUi}
      {...(page ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <span className={styles.rowTitle}>{children}</span>
      <Icon name="chevronRight" size={18} className={styles.chevron} />
    </a>
  );
}
