import { useId, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { useRouter } from '../../../app/useRoute';
import { useSettings } from '../../../data/hooks';
import { APPEARANCES, WEEK_STARTS, type Settings } from '../../../data/settingsSchema';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Icon } from '../../../ui/icons';
import { Segmented } from '../../../ui/Segmented';
import { Switch } from '../../../ui/Switch';
import { APPEARANCE_LABEL_KEYS } from '../../../ui/theme';
import { ACCENT_IDS, ACCENT_LABEL_KEYS, type AccentId } from '../../../ui/tokens';
import { categoryFor, SETTINGS_CATEGORIES, type SettingsCategory } from '../registry';
import styles from './appSettings.module.css';
import { UnitsSection } from './UnitsSection';
import { useAppSettingsService, usePendingWrites, useSaveFailed } from './writes';

const SETTINGS = [
  'display.appearance',
  'display.accent',
  'log.gramsFirst',
  'display.weekStart',
] as const;

type PageKey = (typeof SETTINGS)[number];

/** The pages App settings links to, in order, by their Settings ids (P09-05, P09-06, P09-04). */
export const APP_SUBPAGES = ['menu', 'product-fields', 'tab-bar'] as const;

export interface AppPageProps {
  /** Where the linked pages are looked up; the registry by default (tests pass their own). */
  readonly categories?: readonly SettingsCategory[];
}

/**
 * Settings › App settings (06 §3.2–3.3): Appearance, Accent (our six presets, D-16.1), Grams
 * first, Week starts on, the Units card, then links to the pages under it. Every control stores
 * its setting the moment it is used and shows the choice at once. Nothing is drawn until the
 * settings are read, so a control never shows a default in place of a stored value (R06.22).
 * Save to Photos, app-icon colours, quick-action slots and the language picker are not offered
 * on the web (06 §5).
 */
export function AppPage({ categories = SETTINGS_CATEGORIES }: AppPageProps) {
  const settings = useSettings(SETTINGS);
  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="appSettings.unavailable">
        {t('appSettings.unavailable')}
      </p>
    );
  }
  return <AppSettings stored={settings.value} categories={categories} />;
}

interface AppSettingsProps {
  readonly stored: Pick<Settings, PageKey>;
  readonly categories: readonly SettingsCategory[];
}

function AppSettings({ stored, categories }: AppSettingsProps) {
  const service = useAppSettingsService();
  const failed = useSaveFailed();
  const pending = usePendingWrites(stored);
  const router = useRouter();
  const accentLabel = useId();
  const pages = APP_SUBPAGES.flatMap((id) => categoryFor([id], categories) ?? []);

  const choose = <K extends PageKey>(key: K, value: Settings[K]): void => {
    pending.write(key, value, () => service.set(key, value)).catch(failed);
  };

  return (
    <div className={styles.page} data-ui="appSettings">
      <Card heading={t('appSettings.look.heading')} className={styles.card}>
        <ul className={styles.rows}>
          <li className={`${styles.rowItem} ${styles.choice}`}>
            <span className={styles.choiceLabel} aria-hidden="true">
              {t('appSettings.look.appearance')}
            </span>
            <Segmented
              label={t('appSettings.look.appearance')}
              options={APPEARANCES.map((value) => ({
                value,
                label: t(APPEARANCE_LABEL_KEYS[value]),
              }))}
              value={pending.shown('display.appearance')}
              onChange={(value) => choose('display.appearance', value)}
              data-ui="appSettings.appearance"
            />
          </li>
          <li className={`${styles.rowItem} ${styles.choice}`}>
            <span id={accentLabel} className={styles.choiceLabel}>
              {t('appSettings.look.accent')}
            </span>
            <AccentChoice
              labelledBy={accentLabel}
              value={pending.shown('display.accent')}
              onChange={(value) => choose('display.accent', value)}
            />
          </li>
        </ul>
      </Card>

      <Card heading={t('appSettings.days.heading')} className={styles.card}>
        <ul className={styles.rows}>
          <li className={`${styles.rowItem} ${styles.switchItem}`}>
            <Switch
              label={t('appSettings.days.gramsFirst')}
              description={t('appSettings.days.gramsFirstHint')}
              checked={pending.shown('log.gramsFirst')}
              onChange={(on) => choose('log.gramsFirst', on)}
              data-ui="appSettings.gramsFirst"
            />
          </li>
          <li className={`${styles.rowItem} ${styles.choice}`}>
            <span className={styles.choiceLabel} aria-hidden="true">
              {t('appSettings.days.weekStart')}
            </span>
            <Segmented
              label={t('appSettings.days.weekStart')}
              options={WEEK_STARTS.map((value) => ({
                value,
                label: t(`appSettings.days.${value}`),
              }))}
              value={pending.shown('display.weekStart')}
              onChange={(value) => choose('display.weekStart', value)}
              data-ui="appSettings.weekStart"
            />
          </li>
        </ul>
      </Card>

      <UnitsSection />

      {pages.length > 0 ? (
        <Card
          heading={t('appSettings.pages.heading')}
          className={styles.card}
          data-ui="appSettings.pages"
        >
          <ul className={styles.rows}>
            {pages.map((page) => (
              <li key={page.id} className={styles.rowItem}>
                <button
                  type="button"
                  className={styles.link}
                  data-ui={`appSettings.page.${page.id}`}
                  onClick={() => router.navigate(page.route)}
                >
                  <span className={styles.linkTitle}>{t(page.titleKey)}</span>
                  <Icon name="chevronRight" size={18} className={styles.chevron} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/** The page's colour theme as drawn (`data-theme` on <html>), followed live. */
function subscribePageTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

function pageTheme(): string | undefined {
  return document.documentElement.dataset.theme;
}

interface AccentChoiceProps {
  readonly labelledBy: string;
  readonly value: AccentId;
  readonly onChange: (value: AccentId) => void;
}

/**
 * The accents as swatches with their names: a radio group with one tab stop, where the arrow
 * keys move to the next or previous swatch and choose it, Home and End go to the ends. Each swatch
 * shows its preset as the current theme draws it.
 */
function AccentChoice({ labelledBy, value, onChange }: AccentChoiceProps) {
  const theme = useSyncExternalStore(subscribePageTheme, pageTheme);
  const radios = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = ACCENT_IDS.indexOf(value);
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex;

  const choose = (index: number): void => {
    const count = ACCENT_IDS.length;
    const wrapped = ((index % count) + count) % count;
    const id = ACCENT_IDS[wrapped];
    if (id === undefined) return;
    radios.current[wrapped]?.focus();
    if (id !== value) onChange(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    // In a right-to-left page the next swatch is to the left.
    const forward = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl' ? -1 : 1;
    const target: Partial<Record<string, number>> = {
      ArrowRight: index + forward,
      ArrowLeft: index - forward,
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: ACCENT_IDS.length - 1,
    };
    const next = target[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(next);
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={styles.accents}
      data-ui="appSettings.accent"
    >
      {ACCENT_IDS.map((id, index) => {
        const checked = id === value;
        return (
          <button
            key={id}
            ref={(element) => {
              radios.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            className={styles.accent}
            data-ui={`appSettings.accent.${id}`}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span
              className={styles.swatch}
              data-accent={id}
              data-theme={theme === 'light' ? 'light' : undefined}
              aria-hidden="true"
            >
              {checked ? <Icon name="check" size={18} /> : null}
            </span>
            <span>{t(ACCENT_LABEL_KEYS[id])}</span>
          </button>
        );
      })}
    </div>
  );
}
