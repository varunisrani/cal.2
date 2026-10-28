import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { onDemand } from '../../app/onDemand';
import { useToday } from '../../app/TodayProvider';
import { WALK_ROUTE } from '../../app/router';
import { useRouter, useSheet } from '../../app/useRoute';
import {
  useActiveFast,
  useActivity,
  useDayEntries,
  useDayWater,
  useFasts,
  useSavedMeals,
  useSettings,
  useTargets,
  useWalks,
  type LiveState,
} from '../../data/hooks';
import type { DayKey } from '../../domain/dates/dayKey';
import { decodeLayout, type OfferedMethod } from '../../domain/food/addMenu';
import { fastsOnDay, type DiarySortMode } from '../../domain/meals/diary';
import type { DiaryEntry, Fast } from '../../domain/model';
import type { PillarKey } from '../../domain/nutrients/catalogue';
import type { SourceNutrient } from '../../domain/nutrients/sources';
import { withPartitions } from '../../i18n/onDemand';
import { useServices } from '../../services/context';
import type { WalkPhase, WalkService } from '../../services/walks/service';
import { Card } from '../../ui/Card';
import { useToast } from '../../ui/Toast';
import { AddMenu } from '../log/AddMenu';
import { burnSource, countedBurn, walkBurn, withBurn } from './burn';
import { CaptureSheet, type CapturePicker, type CaptureRequest } from '../log/capture/CaptureSheet';
import { CopyDaySheet } from '../log/CopyDaySheet';
import { DescribeSheet } from '../log/DescribeSheet';
import { ManualSheet } from '../log/ManualSheet';
import { ReuseSheet } from '../log/reuse/ReuseSheet';
import { LookupOverlay } from '../log/scan/LookupOverlay';
import { ScanSheet } from '../log/scan/ScanSheet';
import { NotifyHeader } from '../notifications/NotifyHeader';
import { DayNutrientsSheet } from './DayNutrientsSheet';
import type { WaterDay } from './dayNutrients';
import { DaySummary } from './DaySummary';
import { DaySwipe } from './DaySwipe';
import { Diary } from './Diary';
import type { FoodRowActions } from './EntryRow';
import styles from './home.module.css';
import { PillarPicker } from './PillarPicker';
import { SelectionBar } from './SelectionBar';
import { tx } from './text';
import { useSelectedDay } from './useSelectedDay';
import { useSelection } from './useSelection';
import { oldestDay, WeekBar } from './WeekBar';

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
/** The selected day's nutrients, and the pillar picker that opens over them (P07-04). */
export const NUTRIENTS_SHEET = 'nutrients';
export const PILLAR_PICKER_SHEET = 'pillars';
/** The foods one nutrient of the selected day came from (D-16.105). */
export const SOURCES_SHEET = 'sources';
/** The trackers' sheets (P07-05, P07-08): a custom water amount, start a fast, the fast editor. */
export const WATER_SHEET = 'water';
export const START_FAST_SHEET = 'startFast';
export const FAST_SHEET = 'fast';

// The trackers' sheets are their features' own; each is fetched the first time it opens.
const CustomWaterSheet = onDemand(() =>
  import('../water/CustomWaterSheet').then((module) => module.CustomWaterSheet),
);
const StartFastSheet = onDemand(() =>
  import('../fasting/StartFastSheet').then((module) => module.StartFastSheet),
);
const FastEditor = onDemand(() =>
  withPartitions(
    ['editor', 'review', 'ingredients', 'fitCheck'],
    import('../fasting/FastEditor'),
  ).then((module) => module.FastEditor),
);

// The Health Connect card (P11-04) exists only in the Android app; fetched when it is first drawn.
const ActivityCard = onDemand(() =>
  withPartitions(['health', 'walk'], import('./ActivityCard')).then(
    (module) => module.ActivityCard,
  ),
);

/** The entry editor a row's tap opens (P06-19). */
export const EDITOR_SHEET = 'entry';

// Fetched the first time a row is tapped.
const EntryEditor = onDemand(() =>
  withPartitions(
    ['editor', 'review', 'ingredients', 'fitCheck'],
    import('../log/EntryEditor'),
  ).then((module) => module.EntryEditor),
);

// Fetched the first time a nutrient's sources are opened.
const SourcesSheet = onDemand(() =>
  withPartitions(['sources'], import('./SourcesSheet')).then((module) => module.SourcesSheet),
);

const NO_ENTRIES: readonly DiaryEntry[] = [];

/** The entry the editor shows, and its day. */
interface Editing {
  readonly id: string;
  readonly day: DayKey;
}

const SETTINGS = [
  'units.energy',
  'meals.times',
  'goals.nutrients',
  'menu.layout',
  'display.weekStart',
  'home.pillars',
  'home.sugarLine',
  'water.on',
  'water.goalMl',
  'water.unit',
  'home.sort',
  'fasting.on',
  'health.connected',
  'health.countActiveCalories',
  'units.height',
] as const;

const NO_WALK_PHASE: WalkPhase = { kind: 'idle' };
const NO_SUBSCRIPTION = () => () => undefined;

/** The walk recorder's phase, or idle where there is none (the web). */
function useWalkPhase(walks: WalkService | undefined): WalkPhase {
  return useSyncExternalStore(
    walks ? walks.subscribe : NO_SUBSCRIPTION,
    walks ? walks.getSnapshot : () => NO_WALK_PHASE,
  );
}

/**
 * `read`, except that while a new read is on its way the last one that arrived stays on screen:
 * moving to another day keeps the page, and the week bar under the person's finger, until that
 * day has been read.
 */
function useSteadyRead<T>(read: LiveState<T>): LiveState<T> {
  const [arrived, setArrived] = useState(read);
  if (read.status !== 'loading' && read !== arrived) setArrived(read);
  return read.status === 'loading' ? arrived : read;
}

/**
 * Home for one day, today unless the person picked another (P07-02): the week bar, the gauge and
 * the chosen pillars with water after them, then the Sugar line (D-16.98) (a sideways swipe over
 * them changes the day; "All nutrients" under them opens the day's nutrient sheet with the Sugar
 * on Home switch and, from it, the pillar picker; a nutrient's pillar, its row in that sheet and
 * the Sugar line open the foods it came from, each of which opens its entry, D-16.105), the diary with the day's food, water and fasts in the stored sort order (a fast's row opens its
 * editor, P07-05), and the "+" button with the add menu of the stored layout and the water and
 * fasting rows (P07-08). What is logged from here goes to the day shown. Nothing with a number is
 * drawn until the profile, the settings and the day's entries, water and fasts have been read, so
 * a fallback goal never flashes (R05.12); the "+" waits too, since its menu depends on what is
 * stored. Photos gathered for a meal before a reload bring their sheet back when Home opens
 * (D-16.46). A tap on a food row opens its editor; a long-press starts picking rows, and the bar
 * to combine them takes the "+" button's place (P06-19); each row's heart keeps a copy in the
 * saved meals. On the Android app with Health Connect connected (P11-04), an activity card follows
 * the gauge and, while counting is on, the day's energy target is the goal plus its active
 * calories. Where the app records walks (P15-03) the card lists the day's walks and has the Walk
 * button, the + menu has a Walk row, and without Health Connect the day's walks' active calories
 * are what counting adds.
 */
export function HomePage() {
  const today = useToday();
  const selection = useSelectedDay();
  const dayKey = selection.day;
  const dayRead = useDayEntries(dayKey);
  const entries = useSteadyRead(dayRead);
  const waterRead = useDayWater(dayKey);
  const waterLogs = useSteadyRead(waterRead);
  const fastsRead = useFasts(dayKey, dayKey);
  const fasts = useSteadyRead(fastsRead);
  const activityRead = useActivity(dayKey, dayKey);
  const activity = useSteadyRead(activityRead);
  const walksRead = useWalks(dayKey, dayKey);
  const dayWalks = useSteadyRead(walksRead);
  const activeFast = useActiveFast();
  const targets = useTargets(today);
  const settings = useSettings(SETTINGS);
  const router = useRouter();
  const { captureDrafts, analysis, barcode, homePrefs, health, walks } = useServices();
  const walkPhase = useWalkPhase(walks);
  const toast = useToast();
  const manual = useSheet(MANUAL_SHEET);
  const capture = useSheet(CAPTURE_SHEET);
  const describe = useSheet(DESCRIBE_SHEET);
  const recent = useSheet(RECENT_SHEET);
  const often = useSheet(OFTEN_SHEET);
  const saved = useSheet(SAVED_SHEET);
  const copyDay = useSheet(COPY_DAY_SHEET);
  const scan = useSheet(SCAN_SHEET);
  const nutrients = useSheet(NUTRIENTS_SHEET);
  const pillarPicker = useSheet(PILLAR_PICKER_SHEET);
  const sourcesSheet = useSheet(SOURCES_SHEET);
  // The nutrient the sources sheet shows, as it was picked.
  const [sourceOf, setSourceOf] = useState<SourceNutrient | null>(null);
  const waterSheet = useSheet(WATER_SHEET);
  const startFast = useSheet(START_FAST_SHEET);
  const fastSheet = useSheet(FAST_SHEET);
  // The fast the editor opened on, as it was stored when its row was tapped.
  const [editingFast, setEditingFast] = useState<Fast | null>(null);
  const editor = useSheet(EDITOR_SHEET);
  const [editing, setEditing] = useState<Editing | null>(null);
  const picking = useSelection(dayKey, entries.status === 'ready' ? entries.value : NO_ENTRIES);
  const savedMeals = useSavedMeals();
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

  const savePillars = async (keys: readonly PillarKey[]): Promise<void> => {
    if (!homePrefs) throw new Error('HomePage: no homePrefs service to store the pillars');
    await homePrefs.setPillars(keys);
  };

  const storeSort = (mode: DiarySortMode): void => {
    if (!homePrefs) {
      console.error('HomePage: no homePrefs service to store the sort order');
      toast.show(tx('home.sort.saveFailed'));
      return;
    }
    homePrefs.setSort(mode).catch((error: unknown) => {
      console.error('Storing the sort order failed', error);
      toast.show(tx('home.sort.saveFailed'));
    });
  };

  const storeSugarLine = (on: boolean): void => {
    (homePrefs?.setSugarLine(on) ?? Promise.reject(new Error('No homePrefs service'))).catch(
      (error: unknown) => {
        console.error('Storing the Sugar line switch failed', error);
        toast.show(tx('appSettings.saveFailed'));
      },
    );
  };

  const openFast = (fast: Fast): void => {
    setEditingFast(fast);
    fastSheet.show();
  };

  const openEntry = (entry: DiaryEntry): void => {
    setEditing({ id: entry.id, day: entry.dayKey });
    editor.show();
  };

  const showSources = (nutrient: SourceNutrient): void => {
    setSourceOf(nutrient);
    sourcesSheet.show();
  };

  const foodActions: FoodRowActions = {
    picked: picking.picked,
    // The heart waits for the saved meals, so it never shows the wrong state.
    saved:
      savedMeals.status === 'ready'
        ? new Set(savedMeals.value.flatMap((meal) => meal.originEntryId ?? []))
        : null,
    onOpen: openEntry,
    onPick: picking.pick,
    onToggle: picking.toggle,
  };

  const reads = [dayRead, waterRead, fastsRead, activeFast, targets, settings];
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
    waterLogs.status === 'ready' &&
    fasts.status === 'ready' &&
    // Health Connect's copy and the walks are waited for, but a failed read of either never keeps
    // the diary away.
    activity.status !== 'loading' &&
    dayWalks.status !== 'loading' &&
    activeFast.status === 'ready' &&
    targets.status === 'ready' &&
    settings.status === 'ready'
  ) {
    const unit = settings.value['units.energy'];
    const weekStart = settings.value['display.weekStart'];
    const read = targets.value;
    const plan = read.kind === 'ok' ? read.targets : null;
    const goals = settings.value['goals.nutrients'];
    const pillars = settings.value['home.pillars'];
    const waterOn = settings.value['water.on'];
    const waterUnit = settings.value['water.unit'];
    // Water counts only its own logs, and only while it is tracked (R05.4).
    const water: WaterDay | null = waterOn
      ? {
          totalMl: waterLogs.value.reduce((sum, log) => sum + log.ml, 0),
          goalMl: settings.value['water.goalMl'],
          unit: waterUnit,
        }
      : null;
    // Health Connect (P11-04): the day's activity, and its burn counted in the energy target.
    const connected = health !== undefined && settings.value['health.connected'];
    const shownDay = connected && activity.status === 'ready' ? (activity.value[0] ?? null) : null;
    // P15-03: without Health Connect the day's recorded walks count instead (burn.ts says why).
    const walksOfDay = dayWalks.status === 'ready' ? dayWalks.value : [];
    const source = burnSource(connected, walks !== undefined);
    let burned: number | null = null;
    if (plan && settings.value['health.countActiveCalories']) {
      if (source === 'health') burned = countedBurn(plan.kcal, shownDay);
      else if (source === 'walks') burned = walkBurn(plan.kcal, walksOfDay);
    }
    const walking = walkPhase.kind !== 'idle' && walkPhase.kind !== 'failed';
    const openWalk = (): void => router.navigate(WALK_ROUTE);
    const dayPlan = plan && withBurn(plan, burned);
    body = (
      <>
        <WeekBar
          today={today}
          selected={dayKey}
          weekStart={weekStart}
          onSelect={selection.select}
        />
        <DaySwipe
          day={dayKey}
          latest={today}
          earliest={oldestDay(today, weekStart)}
          onChange={selection.select}
        >
          <DaySummary
            entries={entries.value}
            targets={dayPlan}
            goals={goals}
            energyUnit={unit}
            pillars={pillars}
            water={water}
            sugarLine={settings.value['home.sugarLine']}
            onShowAll={nutrients.show}
            onShowSources={showSources}
            burn={plan && burned !== null ? { goalKcal: plan.kcal, burnedKcal: burned } : null}
          />
        </DaySwipe>
        {connected || walks ? (
          <Suspense fallback={null}>
            <ActivityCard
              day={shownDay}
              energyUnit={unit}
              lengthUnit={settings.value['units.height']}
              healthConnected={connected}
              {...(walks ? { walks: walksOfDay, onWalk: openWalk, walking } : {})}
            />
          </Suspense>
        ) : null}
        <Diary
          entries={entries.value}
          energyUnit={unit}
          times={settings.value['meals.times']}
          isToday={selection.isToday}
          water={waterLogs.value}
          waterUnit={waterUnit}
          fasts={fastsOnDay(fasts.value, dayKey, today)}
          sort={settings.value['home.sort']}
          onSortChange={storeSort}
          onOpenFast={openFast}
          foodActions={foodActions}
        />
        {picking.active ? (
          <SelectionBar entries={picking.chosen} onCancel={picking.end} onCombined={picking.end} />
        ) : null}
        {/* While rows are picked, the bar takes the "+" button's place. */}
        <div className={styles.fabSlot} hidden={picking.active}>
          <AddMenu
            label={tx('home.add.label')}
            layout={decodeLayout(settings.value['menu.layout'])}
            clearArmedLabelScan={clearArmedLabelScan}
            onChoose={choose}
            trackers={{
              day: dayKey,
              waterOn,
              fastingOn: settings.value['fasting.on'],
              activeFast: activeFast.value,
              onCustomWater: waterSheet.show,
              onStartFast: startFast.show,
              // P15-03: the walk recorder, in the Android app only.
              ...(walks ? { onWalk: openWalk, walking } : {}),
            }}
            triggerClassName={styles.fab}
            data-ui="home.add"
          />
        </div>
        <DayNutrientsSheet
          open={nutrients.open}
          onClose={nutrients.close}
          day={dayKey}
          isToday={selection.isToday}
          entries={entries.value}
          targets={dayPlan}
          goals={goals}
          energyUnit={unit}
          pillars={pillars}
          water={water}
          onChoosePillars={pillarPicker.show}
          sugarLine={settings.value['home.sugarLine']}
          onSugarLineChange={storeSugarLine}
          onOpenSources={showSources}
        />
        <PillarPicker
          open={pillarPicker.open}
          chosen={pillars}
          waterOn={waterOn}
          onSave={savePillars}
          onClose={pillarPicker.close}
        />
        <Suspense fallback={null}>
          {sourcesSheet.open && sourceOf ? (
            <SourcesSheet
              nutrient={sourceOf}
              day={dayKey}
              isToday={selection.isToday}
              entries={entries.value}
              targets={dayPlan}
              goals={goals}
              energyUnit={unit}
              onOpenEntry={openEntry}
              onClose={sourcesSheet.close}
            />
          ) : null}
        </Suspense>
        <Suspense fallback={null}>
          {waterSheet.open ? (
            <CustomWaterSheet open day={dayKey} unit={waterUnit} onClose={waterSheet.close} />
          ) : null}
        </Suspense>
        <Suspense fallback={null}>
          {startFast.open ? <StartFastSheet open onClose={startFast.close} /> : null}
        </Suspense>
        <Suspense fallback={null}>
          {fastSheet.open && editingFast ? (
            <FastEditor open fast={editingFast} onClose={fastSheet.close} />
          ) : null}
        </Suspense>
      </>
    );
  } else {
    body = (
      <div className={styles.placeholder} aria-hidden="true" data-ui="home.loading">
        <div className={styles.placeholderWeek} />
        <div className={styles.placeholderSummary} />
        <div className={styles.placeholderRow} />
      </div>
    );
  }

  return (
    <section
      className={styles.page}
      aria-busy={
        [...reads, activityRead, walksRead].some((read) => read.status === 'loading') || undefined
      }
      data-ui="screen.home"
    >
      <NotifyHeader>
        <h1 className={styles.title}>{tx('common.tabs.home')}</h1>
      </NotifyHeader>
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
      <Suspense fallback={null}>
        {editor.open && editing ? (
          <EntryEditor
            key={editing.id}
            entryId={editing.id}
            dayKey={editing.day}
            onClose={editor.close}
          />
        ) : null}
      </Suspense>
    </section>
  );
}
