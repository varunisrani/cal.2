import { INSPIRATION, type InspirationCredit } from '../../config/credit';
import generated from '../../generated/notices.json';
import { t } from '../../i18n/t';
import { isHealthAvailable } from '../../services/health/platform';
import { Card } from '../../ui/Card';
import styles from './aboutPage.module.css';

/** One production package as scripts/notices.ts writes it into src/generated/notices.json. */
export interface PackageNotice {
  readonly name: string;
  readonly version: string;
  /** Its SPDX licence expression. */
  readonly license: string;
  readonly homepage: string | null;
  /** Its licence and notice files, or null when it ships none. */
  readonly text: string | null;
}

/** The generated list; typed here, so a change of its shape fails the type check. */
export const PACKAGE_NOTICES: readonly PackageNotice[] = generated.packages;

/** The standard licence texts of the Android list, once each, by SPDX id. */
const LICENSE_TEXTS: Readonly<Record<string, string>> = generated.licenseTexts;

/**
 * The libraries the Android app's APK carries besides the web build (P11-05), as package rows:
 * each one's licence text is its copyright line, where its licence asks for one, over the
 * standard text of its licence.
 */
export const ANDROID_NOTICES: readonly PackageNotice[] = generated.android.map((library) => ({
  name: library.name,
  version: library.version,
  license: library.license,
  homepage: library.homepage,
  text: [library.copyright, LICENSE_TEXTS[library.license]].filter(Boolean).join('\n\n') || null,
}));

export interface CreditsPageProps {
  /**
   * The generated list by default, followed inside the Android app by the libraries of its APK
   * (tests pass their own).
   */
  readonly packages?: readonly PackageNotice[];
  /** The credit read out of THIRD_PARTY_NOTICES.md at build time by default. */
  readonly inspiration?: InspirationCredit;
}

/**
 * Settings › Licences and credits (P09-16): the app that inspired Platewise, with its licence
 * notice kept as credit (00-decisions, 01-clean-room §7), then every production package that
 * ships in the app with its version and licence, each licence text opening on demand. The list
 * is generated from the installed packages at build time (scripts/notices.ts); inside the
 * Android app the libraries of its APK follow it (P11-05).
 */
export function CreditsPage({
  packages = isHealthAvailable() ? [...PACKAGE_NOTICES, ...ANDROID_NOTICES] : PACKAGE_NOTICES,
  inspiration = INSPIRATION,
}: CreditsPageProps) {
  const name = inspiration.name;
  return (
    <div className={styles.page} data-ui="credits">
      <Card heading={t('about.credits.inspiration.heading')} data-ui="credits.inspiration">
        <div className={styles.section}>
          <p className={styles.body}>{t('about.credits.inspiration.body', { name })}</p>
          <a
            className={styles.inlineLink}
            href={inspiration.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('about.credits.inspiration.visit', { name })}
          </a>
          <details className={styles.details}>
            <summary>
              <span className={styles.packageName}>
                {t('about.credits.inspiration.notice', { name })}
              </span>
            </summary>
            <pre className={styles.licenseText} data-ui="credits.inspiration.notice">
              {inspiration.notice}
            </pre>
          </details>
        </div>
      </Card>

      <Card heading={t('about.credits.packages.heading')} data-ui="credits.packages">
        <div className={styles.section}>
          <p className={styles.body}>{t('about.credits.packages.intro')}</p>
          <ul className={styles.packages}>
            {packages.map((pkg) => (
              <li
                key={`${pkg.name}@${pkg.version}`}
                className={styles.package}
                data-ui={`credits.package.${pkg.name}`}
              >
                <PackageDetails notice={pkg} />
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function PackageDetails({ notice }: { readonly notice: PackageNotice }) {
  return (
    <details className={styles.details}>
      <summary>
        <span className={styles.packageName}>{notice.name}</span>
        <span className={styles.packageMeta}>
          {t('about.credits.packages.version', { version: notice.version })}
          {' · '}
          {t('about.credits.packages.license', { license: notice.license })}
        </span>
      </summary>
      {notice.homepage === null ? null : (
        <p className={styles.body}>
          <a
            className={styles.inlineLink}
            href={notice.homepage}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('about.credits.packages.homepage', { name: notice.name })}
          </a>
        </p>
      )}
      {notice.text === null ? (
        <p className={styles.hint}>{t('about.credits.packages.noText')}</p>
      ) : (
        <pre className={styles.licenseText}>{notice.text}</pre>
      )}
    </details>
  );
}
