import { useState } from 'react';
import { useSheet } from '../../../app/useRoute';
import { t } from '../../../i18n/t';
import { useServices } from '../../../services/context';
import type { YourDataService } from '../../../services/yourData';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Dialog } from '../../../ui/Dialog';
import { Icon } from '../../../ui/icons';
import { useToast } from '../../../ui/Toast';
import { BackupSection } from './BackupSection';
import { ExportSheet } from './ExportSheet';
import { ImportSheet } from './ImportSheet';
import { StorageCard } from './StorageCard';
import styles from './yourData.module.css';

/** The diary-file sheets have their own history entries, so Back closes them first. */
export const EXPORT_SHEET = 'data-export';
export const IMPORT_SHEET = 'data-import';

/**
 * Settings › Your data (06 §3.15–3.17): the Backup card with Restore from a file, the diary file
 * (Export and Import), the Storage card, then Clear diary and Erase everything, each asking first.
 */
export function DataPage() {
  const { yourData } = useServices();
  if (!yourData) {
    return (
      <p className={styles.note} data-ui="data.unavailable">
        {t('data.page.unavailable')}
      </p>
    );
  }
  return (
    <div className={styles.page} data-ui="data">
      <BackupSection />
      <DiaryFileCard />
      <StorageCard service={yourData} />
      <StartOverCard service={yourData} />
    </div>
  );
}

interface LinkRowProps {
  readonly title: string;
  readonly hint: string;
  readonly danger?: boolean;
  readonly onPress: () => void;
  readonly 'data-ui': string;
}

function LinkRow({ title, hint, danger = false, onPress, 'data-ui': ui }: LinkRowProps) {
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        className={danger ? `${styles.link} ${styles.danger}` : styles.link}
        data-ui={ui}
        onClick={onPress}
      >
        <span className={styles.linkText}>
          <span className={styles.linkTitle}>{title}</span>
          <span className={styles.linkHint}>{hint}</span>
        </span>
        <Icon name="chevronRight" size={18} className={styles.chevron} />
      </button>
    </li>
  );
}

/** Export diary and Import diary, each in its sheet (P09-10, P09-11). */
function DiaryFileCard() {
  const exportSheet = useSheet(EXPORT_SHEET);
  const importSheet = useSheet(IMPORT_SHEET);
  return (
    <Card heading={t('data.file.heading')} className={styles.listCard} data-ui="data.file">
      <ul className={styles.rows}>
        <LinkRow
          title={t('transfer.export.title')}
          hint={t('data.file.exportHint')}
          onPress={exportSheet.show}
          data-ui="data.export"
        />
        <LinkRow
          title={t('transfer.import.title')}
          hint={t('data.file.importHint')}
          onPress={importSheet.show}
          data-ui="data.import"
        />
      </ul>
      <ExportSheet open={exportSheet.open} onClose={exportSheet.close} />
      <ImportSheet open={importSheet.open} onClose={importSheet.close} />
    </Card>
  );
}

type Asking = null | 'clear' | 'erase';

type EraseState = 'idle' | 'blocked' | 'failed';

/** Clear diary and Erase everything (06 §3.15): each asks first, in a dialog. */
function StartOverCard({ service }: { readonly service: YourDataService }) {
  const toast = useToast();
  const [asking, setAsking] = useState<Asking>(null);
  const [erase, setErase] = useState<EraseState>('idle');

  const clearDiary = async (): Promise<void> => {
    try {
      await service.clearDiary();
      toast.show(t('data.clear.done'));
    } catch (error) {
      console.error('Platewise: clearing the diary failed', error);
      toast.show(t('data.clear.failed'));
    } finally {
      setAsking(null);
    }
  };

  const eraseEverything = async (): Promise<void> => {
    // Erased: the app is loading again on Welcome. The dialog stays until then; it has
    // answered, so neither Cancel nor the scrim can close it.
    const outcome = await service.eraseEverything();
    if (outcome.kind !== 'erased') setErase(outcome.kind);
  };

  return (
    <Card heading={t('data.reset.heading')} className={styles.listCard} data-ui="data.reset">
      <ul className={styles.rows}>
        <LinkRow
          title={t('data.clear.row')}
          hint={t('data.clear.hint')}
          danger
          onPress={() => setAsking('clear')}
          data-ui="data.clear"
        />
        <LinkRow
          title={t('data.erase.row')}
          hint={t('data.erase.hint')}
          danger
          onPress={() => setAsking('erase')}
          data-ui="data.erase"
        />
      </ul>
      <Dialog
        open={asking === 'clear'}
        title={t('data.clear.title')}
        message={t('data.clear.message')}
        confirmLabel={t('data.clear.confirm')}
        destructive
        onConfirm={clearDiary}
        onCancel={() => setAsking(null)}
        data-ui="data.clearDialog"
      />
      <Dialog
        open={asking === 'erase'}
        title={t('data.erase.title')}
        message={t('data.erase.message')}
        confirmLabel={t('data.erase.confirm')}
        destructive
        confirmDisabled={erase !== 'idle'}
        onConfirm={eraseEverything}
        onCancel={() => setAsking(null)}
        data-ui="data.eraseDialog"
      >
        {erase === 'blocked' ? (
          <p className={styles.note} role="status" data-ui="data.erase.blocked">
            {t('data.erase.blocked')}
          </p>
        ) : null}
        {erase === 'failed' ? (
          <div className={styles.failed}>
            <p className={styles.problem} role="alert" data-ui="data.erase.failed">
              {t('data.erase.failed')}
            </p>
            <Button variant="primary" block data-ui="data.erase.reload" onClick={service.restart}>
              {t('data.erase.reload')}
            </Button>
          </div>
        ) : null}
      </Dialog>
    </Card>
  );
}
