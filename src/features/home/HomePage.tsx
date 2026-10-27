import { useEffect, useState } from 'react';
import { useToday } from '../../app/TodayProvider';
import { useRouter, useSheet } from '../../app/useRoute';
import { useDayEntries, useSettings, useTargets } from '../../data/hooks';
import { decodeLayout, type OfferedMethod } from '../../domain/food/addMenu';
import { useServices } from '../../services/context';
import { Card } from '../../ui/Card';
import { AddMenu } from '../log/AddMenu';
import { CaptureSheet, type CapturePicker, type CaptureRequest } from '../log/capture/CaptureSheet';
import { CopyDaySheet } from '../log/CopyDaySheet';
import { DescribeSheet } from '../log/DescribeSheet';
import { ManualSheet } from '../log/ManualSheet';
import { ReuseSheet } from '../log/reuse/ReuseSheet';
import { LookupOverlay } from '../log/scan/LookupOverlay';
import { ScanSheet } from '../log/scan/ScanSheet';
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
/** The reuse lists' places on the sheet stack (P06-12). */
export const RECENT_SHEET = 'recent';
export const OFTEN_SHEET = 'often';
export const SAVED_SHEET = 'saved';
/** The copy-a-day sheet's place on the sheet stack (P06-13). */
export const COPY_DAY_SHEET = 'copyDay';
/** The barcode scanner's place on the sheet stack. */
export const SCAN_SHEET = 'scan';

const SETTINGS = ['units.energy', 'meals.times', 'goals.nutrients', 'menu.layout'] as const;

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
  const { captureDrafts, analysis, barcode } = useServices();
  const manual = useSheet(MANUAL_SHEET);
  const capture = useSheet(CAPTURE_SHEET);
  const describe = useSheet(DESCRIBE_SHEET);
  const recent = useSheet(RECENT_SHEET);
  const often = useSheet(OFTEN_SHEET);
  const saved = useSheet(SAVED_SHEET);
  const copyDay = useSheet(COPY_DAY_SHEET);
  const scan = useSheet(SCAN_SHEET);
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

  // A label scan armed after a barcode miss lives only as long as the photos sheet it opened:
  // Cancel, removing the last photo, Back or leaving Home all drop it (R02.20).
  const captureOpen = capture.open;
  useEffect(() => {
    if (!barcode || !captureOpen) return undefined;
    return () => barcode.clearArmedLabel();
  }, [barcode, captureOpen]);

  /** What every add-menu method runs first: no other method may inherit an armed label scan. */
  const clearArmedLabelScan = (): void => barcode?.clearArmedLabel();

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
        scan.show();
        return;
      case 'recent':
        recent.show();
        return;
      case 'often':
        often.show();
        return;
      case 'saved':
        saved.show();
        return;
      case 'copyDay':
        copyDay.show();
        return;
    }
  };

  const analysePhotos = (request: CaptureRequest): void => {
    // Taken before the sheet closes: closing drops whatever is still armed.
    const armedLabel = barcode?.takeArmedLabel() ?? null;
    capture.close();
    // Never rejects; a label scan's photos run as that product's label.
    void analysis?.start('photo', armedLabel === null ? request : { ...request, armedLabel });
  };

  const lookUp = (code: string): void => {
    scan.close();
    // Never rejects; the lookup layer shows how it goes.
    void barcode?.lookup(code);
  };

  /** "Scan label" held the code: the label's photo comes from the camera. */
  const photographLabel = (): void => {
    setPicker('camera');
    capture.show();
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
      <ReuseSheet list="recent" open={recent.open} onClose={recent.close} />
      <ReuseSheet list="often" open={often.open} onClose={often.close} />
      <ReuseSheet list="saved" open={saved.open} onClose={saved.close} />
      <CopyDaySheet open={copyDay.open} onClose={copyDay.close} targetDay={dayKey} />
      <ScanSheet open={scan.open} onCode={lookUp} onClose={scan.close} />
      {barcode ? <LookupOverlay onScanLabel={photographLabel} /> : null}
    </section>
  );
}
