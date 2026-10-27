import { useSettings } from '../../../data/hooks';
import type { Settings } from '../../../data/settingsSchema';
import { HEIGHT_DISPLAY_UNITS } from '../../../domain/units/body';
import { ENERGY_DISPLAY_UNITS } from '../../../domain/units/energy';
import { t } from '../../../i18n/t';
import { Card } from '../../../ui/Card';
import { Segmented, type SegmentedOption } from '../../../ui/Segmented';
import styles from './appSettings.module.css';
import { useAppSettingsService, usePendingWrites, useSaveFailed } from './writes';

const UNITS = ['units.energy', 'units.height'] as const;

type UnitKey = (typeof UNITS)[number];

/**
 * The Units card of Settings › App settings (06 §3.3, 01 §3.9): energy (kcal or kJ) and height
 * (cm or ft and in), two settings of their own, each stored the moment it is picked. Weight is kg
 * only, so it has no choice here (D-16.91). A unit changes only how numbers are shown and typed:
 * nothing stored is converted, as the note under the card says. Drawn once the settings are read,
 * so a stored unit never shows its default first (R06.22).
 */
export function UnitsSection() {
  const settings = useSettings(UNITS);
  if (settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className={styles.note} data-ui="appSettings.units.unavailable">
        {t('appSettings.unavailable')}
      </p>
    );
  }
  return <UnitChoices stored={settings.value} />;
}

interface UnitRowProps<V extends string> {
  readonly label: string;
  readonly options: readonly SegmentedOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly 'data-ui': string;
}

/** One unit setting: its name over its two choices. */
function UnitRow<V extends string>({
  label,
  options,
  value,
  onChange,
  'data-ui': ui,
}: UnitRowProps<V>) {
  return (
    <li className={`${styles.rowItem} ${styles.choice}`}>
      <span className={styles.choiceLabel} aria-hidden="true">
        {label}
      </span>
      <Segmented label={label} options={options} value={value} onChange={onChange} data-ui={ui} />
    </li>
  );
}

function UnitChoices({ stored }: { readonly stored: Pick<Settings, UnitKey> }) {
  const service = useAppSettingsService();
  const failed = useSaveFailed();
  const pending = usePendingWrites(stored);

  const choose = <K extends UnitKey>(key: K, value: Settings[K]): void => {
    pending.write(key, value, () => service.set(key, value)).catch(failed);
  };

  return (
    <div className={styles.section}>
      <Card
        heading={t('appSettings.units.heading')}
        className={styles.card}
        data-ui="appSettings.units"
      >
        <ul className={styles.rows}>
          <UnitRow
            label={t('appSettings.units.energy')}
            options={ENERGY_DISPLAY_UNITS.map((value) => ({
              value,
              label: t(`home.unit.${value}`),
            }))}
            value={pending.shown('units.energy')}
            onChange={(value) => choose('units.energy', value)}
            data-ui="appSettings.units.energy"
          />
          <UnitRow
            label={t('appSettings.units.height')}
            options={HEIGHT_DISPLAY_UNITS.map((value) => ({
              value,
              label: t(`profile.units.${value}`),
            }))}
            value={pending.shown('units.height')}
            onChange={(value) => choose('units.height', value)}
            data-ui="appSettings.units.height"
          />
        </ul>
      </Card>
      <p className={styles.note} data-ui="appSettings.units.note">
        {t('appSettings.units.note')}
      </p>
    </div>
  );
}
