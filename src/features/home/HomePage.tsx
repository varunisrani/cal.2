import { useEffect, useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import { useRouter, useSheet } from '../../app/useRoute';
import { useDayEntries, useSettings, useTargets } from '../../data/hooks';
import { decodeLayout, type OfferedMethod } from '../../domain/food/addMenu';
import { useServices } from '../../services/context';
import { Card } from '../../ui/Card';
import { AddMenu } from '../log/AddMenu';
import { CaptureSheet, type CapturePicker, type CaptureRequest } from '../log/capture/CaptureSheet';
import { DescribeSheet } from '../log/DescribeSheet';
import { ManualSheet } from '../log/ManualSheet';
import { DaySummary } from './DaySummary';
import { Diary } from './Diary';
import styles from './home.module.css';
import { tx } from './text';

/** The manual entry sheet's place on the sheet stack. */
export const MANUAL_SHEET = 'manual';
/** The meal-photos sheet's place on the sheet stack. */
export const CAPTURE_SHEET = 'capture';
/** The typed meal sheet's place on the sheet stack. */
export const DESCRIBE_SHEET = 'describe';

const SETTINGS = ['units.energy', 'meals.times', 'goals.nutrients', 'menu.layout'] as const;

/**
 * The hook every add-menu method runs first. P06-17 arms a label scan after a barcode miss and
 * passes its disarm here; until then nothing is ever armed.
 */
const clearArmedLabelScan = (): void => undefined;

/**
 * Home for today (the week bar and the day swipe come in P07): the gauge and pillars, the diary
 * by meal, and the "+" button with the add menu of the stored layout. Nothing with a number is
 * drawn until the profile, the settings and the day's entries have been read, so a fallback goal
 * never flashes (R05.12); the "+" waits too, since its menu depends on what is stored. Photos
 * gathered for a meal before a reload bring their sheet back when Home opens (D-16.46).
 */
export function HomePage() {
  const today = useToday();
  // The viewed day; P07 lets the person pick another one.
  const dayKey = today;
  const entries = useDayEntries(dayKey);
  const targets = useTargets(today);
  const settings = useSettings(SETTINGS);
  const router = useRouter();
  const { captureDrafts, analysis } = useServices();
  const manual = useSheet(MANUAL_SHEET);
  const capture = useSheet(CAPTURE_SHEET);
  const describe = useSheet(DESCRIBE_SHEET);
  // What the capture sheet's "Add photo" opens; a sheet brought back after a reload uses the library.
  const [picker, setPicker] = useState<CapturePicker>('library');

  // A capture draft with photos opens its sheet again, unless an analysis has taken over.
  useEffect(() => {
    if (!captureDrafts) return undefined;
    let live = true;
    captureDrafts.load().then(
      (draft) => {
        if (!live || draft.photoIds.length === 0) return;
        if (analysis && analysis.getSnapshot().phase !== 'idle') return;
        router.openSheet(CAPTURE_SHEET);
      },
      (error: unknown) => console.error('The capture draft could not be read', error),
    );
    return () => {
      live = false;
    };
  }, [captureDrafts, analysis, router]);

  const choose = (method: OfferedMethod): void => {
    switch (method) {
      case 'camera':
      case 'library':
        setPicker(method);
        capture.show();
        return;
      case 'describe':
        describe.show();
        return;
      case 'manual':
        manual.show();
        return;
      case 'barcode':
      case 'recent':
      case 'often':
      case 'saved':
      case 'copyDay':
        // Their sheets are not built yet; the add menu leaves them off (METHODS_NOT_BUILT_YET).
        return;
    }
  };

  const analysePhotos = (request: CaptureRequest): void => {
    capture.close();
    // Never rejects. P06-17 adds `armedLabel` when these photos are a label scan's.
    void analysis?.start('photo', request);
  };

  const reads = [entries, targets, settings];
  const failed = reads.some((read) => read.status === 'error');
  let body;
  if (failed) {
    body = (
      <Card data-ui="home.error">
        <p className={styles.empty}>{tx('home.loadFailed')}</p>
      </Card>
    );
  } else if (
    entries.status === 'ready' &&
    targets.status === 'ready' &&
    settings.status === 'ready'
  ) {
    const unit = settings.value['units.energy'];
    const read = targets.value;
    body = (
      <>
        <DaySummary
          entries={entries.value}
          targets={read.kind === 'ok' ? read.targets : null}
          goals={settings.value['goals.nutrients']}
          energyUnit={unit}
        />
        <Diary
          entries={entries.value}
          energyUnit={unit}
          times={settings.value['meals.times']}
          isToday={dayKey === today}
        />
        <div className={styles.fabSlot}>
          <AddMenu
            label={tx('home.add.label')}
            layout={decodeLayout(settings.value['menu.layout'])}
            clearArmedLabelScan={clearArmedLabelScan}
            onChoose={choose}
            triggerClassName={styles.fab}
            data-ui="home.add"
          />
        </div>
      </>
    );
  } else {
    body = (
      <div className={styles.placeholder} aria-hidden="true" data-ui="home.loading">
        <div className={styles.placeholderSummary} />
        <div className={styles.placeholderRow} />
      </div>
    );
  }

  return (
    <section
      className={styles.page}
      aria-busy={reads.some((read) => read.status === 'loading') || undefined}
      data-ui="screen.home"
    >
      <h1 className={styles.title}>{tx('common.tabs.home')}</h1>
      {body}
      <ManualSheet open={manual.open} onClose={manual.close} dayKey={dayKey} />
      <CaptureSheet
        open={capture.open}
        picker={picker}
        onAnalyse={analysePhotos}
        onClose={capture.close}
      />
      <DescribeSheet open={describe.open} onClose={describe.close} />
    </section>
  );
}
