import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersistenceStatus } from '../../../data/storage';
import { numberFormat } from '../../../i18n/format';
import { currentLocale } from '../../../i18n/locale';
import { t, type TKey } from '../../../i18n/t';
import type { StorageReport, YourDataService } from '../../../services/yourData';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { useToast } from '../../../ui/Toast';
import styles from './yourData.module.css';

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/**
 * A byte count as the storage card shows it, in steps of 1 000: "512 bytes", "3.4 MB", "12 MB"
 * (one decimal below ten, none above).
 */
export function formatBytes(bytes: number, locale: string = currentLocale()): string {
  let value = Math.max(0, bytes);
  let step = 0;
  while (step < BYTE_UNITS.length - 1 && value >= 999.5) {
    value /= 1000;
    step++;
  }
  const unit = BYTE_UNITS[step] ?? 'byte';
  return numberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: unit === 'byte' ? 'long' : 'short',
    maximumFractionDigits: step > 0 && value < 9.95 ? 1 : 0,
  }).format(value);
}

const PERSISTENCE: Readonly<Record<PersistenceStatus, TKey>> = {
  persistent: 'data.storage.persistent',
  'best-effort': 'data.storage.bestEffort',
  unknown: 'data.storage.unknown',
};

function bytesText(bytes: number | null | undefined): string {
  if (bytes === undefined) return t('data.storage.measuring');
  return bytes === null ? t('data.storage.unavailable') : formatBytes(bytes);
}

function usageText(report: StorageReport | null): string {
  if (!report) return t('data.storage.measuring');
  const { estimate } = report;
  if (!estimate) return t('data.storage.unavailable');
  return t('data.storage.usedOf', {
    used: formatBytes(estimate.usage),
    quota: formatBytes(estimate.quota),
  });
}

export interface StorageCardProps {
  readonly service: YourDataService;
}

/**
 * The Storage card of Your data (06 §3.16, R06.19, D-16.8): the bytes of the stored photos and of
 * their thumbnails, what the site uses of its quota, and whether the browser keeps the data for
 * good, each "…" until measured; measured on opening and after Clear cache. Clear cache drops the
 * thumbnails only (made again when next shown) and runs one at a time. When the browser does not
 * promise to keep the data, a note says how to keep the diary safe.
 */
export function StorageCard({ service }: StorageCardProps) {
  const toast = useToast();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const measure = useCallback(async (): Promise<void> => {
    const measured = await service.measure();
    if (mounted.current) setReport(measured);
  }, [service]);

  useEffect(() => {
    void measure();
  }, [measure]);

  const clearCache = async (): Promise<void> => {
    // One action at a time, even for a second press before the busy state is drawn.
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await service.clearCache();
      toast.show(t('data.storage.cleared'));
    } catch (error) {
      console.error('Platewise: clearing the thumbnails failed', error);
    } finally {
      await measure();
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const persistence = report?.persistence;
  return (
    <Card heading={t('data.storage.heading')} className={styles.card} data-ui="storage">
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('data.storage.photos')}</dt>
          <dd data-ui="storage.photos">{bytesText(report ? report.photoBytes : undefined)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('data.storage.thumbs')}</dt>
          <dd data-ui="storage.thumbs">{bytesText(report ? report.thumbBytes : undefined)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('data.storage.used')}</dt>
          <dd data-ui="storage.used">{usageText(report)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('data.storage.persistence')}</dt>
          <dd data-ui="storage.persistence">
            {persistence ? t(PERSISTENCE[persistence]) : t('data.storage.measuring')}
          </dd>
        </div>
      </dl>
      {persistence !== undefined && persistence !== 'persistent' ? (
        <p className={styles.note} data-ui="storage.atRisk">
          {t('data.storage.atRisk')}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="secondary"
          block
          busy={busy}
          data-ui="storage.clearCache"
          onClick={clearCache}
        >
          {t('data.storage.clearCache')}
        </Button>
      </div>
      <p className={styles.note}>{t('data.storage.footer')}</p>
    </Card>
  );
}
