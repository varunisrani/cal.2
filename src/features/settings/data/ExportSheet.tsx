import { useId, useState } from 'react';
import { useToday } from '../../../app/TodayProvider';
import { useSettings, useTargets } from '../../../data/hooks';
import { addDays, type DayKey } from '../../../domain/dates/dayKey';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import {
  EXPORT_FORMATS,
  EXPORT_RANGES,
  type ExportFormat,
  type ExportRange,
  type RangeChoice,
} from '../../../services/transfer/exportDiary';
import { Button } from '../../../ui/Button';
import { cx } from '../../../ui/classes';
import { DateTimeField } from '../../../ui/DateTimeField';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';
import styles from './data.module.css';

const SETTINGS = ['units.energy', 'display.weekStart'] as const;

/** The custom range starts this many days before today. */
const CUSTOM_DAYS_BACK = 7;

export interface ExportSheetProps {
  readonly open: boolean;
  /** Done, and after the file was shared or saved. */
  readonly onClose: () => void;
}

/**
 * Export diary (06 §3.13): which days (Today, This week from the app's week start, This month, All
 * time, or Custom From/To) and which file (JSON, Markdown, CSV), then Export. The file holds kcal
 * for every reader (R06.14). It goes to the share sheet when the browser can share it, else it is
 * downloaded; when the days hold nothing the sheet says so and makes no file. Renders nothing
 * while closed.
 */
export function ExportSheet(props: ExportSheetProps) {
  return props.open ? <OpenExportSheet {...props} /> : null;
}

type Message = 'empty' | 'failed';

function OpenExportSheet({ onClose }: ExportSheetProps) {
  const { transfer } = useServices();
  const toast = useToast();
  const today = useToday();
  const settings = useSettings(SETTINGS);
  const targets = useTargets(today);
  const [range, setRange] = useState<ExportRange>('week');
  const [format, setFormat] = useState<ExportFormat>('json');
  const [from, setFrom] = useState<DayKey>(() => addDays(today, -CUSTOM_DAYS_BACK));
  const [to, setTo] = useState<DayKey>(today);
  const [message, setMessage] = useState<Message | null>(null);

  const ready = settings.status === 'ready' && targets.status !== 'loading';

  const run = async (): Promise<void> => {
    if (!transfer || settings.status !== 'ready') return;
    setMessage(null);
    const choice: RangeChoice = range === 'custom' ? { kind: 'custom', from, to } : { kind: range };
    try {
      const result = await transfer.exportDiary({
        range: choice,
        format,
        today,
        weekStart: settings.value['display.weekStart'],
        energyUnit: settings.value['units.energy'],
        // No profile, or one that cannot be read: the file's targets are 0.
        targets:
          targets.status === 'ready' && targets.value.kind === 'ok' ? targets.value.targets : null,
      });
      if (result.kind === 'empty') {
        setMessage('empty');
        return;
      }
      const handed = await transfer.deliver(result.file);
      // The person closed the share sheet: they may pick again.
      if (handed === 'cancelled') return;
      if (handed === 'downloaded') toast.show(t('transfer.export.downloaded'));
      onClose();
    } catch (error) {
      console.error('Exporting the diary failed', error);
      setMessage('failed');
    }
  };

  return (
    <Sheet open title={t('transfer.export.title')} onClose={onClose} data-ui="exportDiary">
      <div className={styles.body}>
        <p className={styles.text}>{t('transfer.export.intro')}</p>
        <ChoiceChips
          legend={t('transfer.export.range.label')}
          options={EXPORT_RANGES.map((value) => ({
            value,
            label: t(`transfer.export.range.${value}`),
          }))}
          value={range}
          onChange={(value) => {
            setRange(value);
            setMessage(null);
          }}
          data-ui="exportDiary.range"
        />
        {range === 'custom' ? (
          <div className={styles.dates}>
            <DateTimeField
              kind="date"
              label={t('transfer.export.from')}
              value={from}
              onChange={setFrom}
              max={today}
              data-ui="exportDiary.from"
            />
            <DateTimeField
              kind="date"
              label={t('transfer.export.to')}
              value={to}
              onChange={setTo}
              max={today}
              data-ui="exportDiary.to"
            />
          </div>
        ) : null}
        <ChoiceChips
          legend={t('transfer.export.format.label')}
          options={EXPORT_FORMATS.map((value) => ({
            value,
            label: t(`transfer.export.format.${value}`),
          }))}
          value={format}
          onChange={setFormat}
          data-ui="exportDiary.format"
        />
        <p className={styles.text} data-ui="exportDiary.formatHint">
          {t(`transfer.export.formatHint.${format}`)}
        </p>
        {message ? (
          <p className={styles.message} role="alert" data-ui={`exportDiary.${message}`}>
            {t(`transfer.export.${message}`)}
          </p>
        ) : null}
        <Button
          variant="primary"
          block
          disabled={!ready || !transfer}
          onClick={run}
          data-ui="exportDiary.export"
        >
          {t('transfer.export.action')}
        </Button>
      </div>
    </Sheet>
  );
}

interface ChoiceChipsProps<V extends string> {
  readonly legend: string;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  /** The group's hook; each chip gets `<data-ui>.<value>`. */
  readonly 'data-ui': string;
}

/** Exclusive choices that wrap onto more lines: native radios drawn as chips. */
function ChoiceChips<V extends string>({
  legend,
  options,
  value,
  onChange,
  'data-ui': ui,
}: ChoiceChipsProps<V>) {
  const name = useId();
  return (
    <fieldset className={styles.group} data-ui={ui}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.chips}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(styles.chip, checked && styles.chipOn)}
              data-ui={`${ui}.${option.value}`}
            >
              <input
                type="radio"
                className={styles.radio}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
