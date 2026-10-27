import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The tokens first, so component styles imported after them can build on them.
import './ui/tokens.css';
import { browserFetch } from './ai/transport';
import { App } from './app/App';
import { appState } from './app/appState';
import type { ShellPorts } from './app/ports';
import { createRouter, windowHost } from './app/router';
import { installOffer } from './app/installOffer';
import { appUpdates, registerServiceWorker } from './app/swRegistration';
import { APP_VERSION } from './config/build';
import { documentVisibility } from './app/useTuneUp';
import { appBus } from './data/bus';
import { DataProvider, type DataSources } from './data/DataProvider';
import { openDb } from './data/db';
import { hasUnreadableData } from './data/guard';
import { createBackupRepo } from './data/repos/backupRepo';
import { createBodyFatRepo } from './data/repos/bodyFatRepo';
import { createCoachRepo } from './data/repos/coachRepo';
import { createDiaryRepo } from './data/repos/diaryRepo';
import { createDraftsRepo } from './data/repos/draftsRepo';
import { createFastRepo } from './data/repos/fastRepo';
import { createPhotoRepo } from './data/repos/photoRepo';
import { createProfileRepo } from './data/repos/profileRepo';
import { createSavedMealsRepo } from './data/repos/savedMealsRepo';
import { createSecretsRepo } from './data/repos/secretsRepo';
import { createSettingsRepo } from './data/repos/settingsRepo';
import { createTransferRepo } from './data/repos/transferRepo';
import { createWaterRepo } from './data/repos/waterRepo';
import { createWeightRepo } from './data/repos/weightRepo';
import type { PlatewiseDb } from './data/schema';
import { createStorageAccess } from './data/storage';
import { closeOnErase, eraseEverything } from './data/wipe';
import { t } from './i18n/t';
import { systemClock } from './lib/clock';
import { createAiSetupService } from './services/aiSetup';
import { createAnalysisService } from './services/analysis';
import { createAppSettingsService } from './services/appSettings';
import { createBackupService } from './services/backup/service';
import { createBarcodeService } from './services/barcode/lookup';
import { createCaptureDraftService } from './services/captureDrafts';
import { createCoachSession } from './services/coach/session';
import { createCombineService } from './services/combine';
import { createCopyDayService } from './services/copyDay';
import { ServicesProvider, type Services } from './services/context';
import { createAiAccess } from './services/aiAccess';
import { createDiaryService } from './services/diary';
import { createFastingService } from './services/fasting';
import { createFitCheckService } from './services/fitCheck';
import { createHomePrefsService } from './services/homePrefs';
import { createRebuildService } from './services/goals/rebuild';
import { createTargetEditsService } from './services/goals/targetEdits';
import { createTuneUpRunner } from './services/goals/tuneUp';
import type { PlanServiceDeps } from './services/goals/planRequest';
import { createPlanBuilder, storedAiAccess } from './services/goals/planBuilder';
import { createIngredientIntake } from './services/ingredientIntake';
import { createOnboardingService } from './services/onboarding';
import { createPhotoService } from './services/photos';
import { createProfileEditsService } from './services/profileEdits';
import { createSavedMealsService } from './services/savedMeals';
import { createProgressService } from './services/progress';
import { createReminderEngine } from './services/reminders/engine';
import { browserNotifications, createNotifier } from './services/reminders/notifier';
import {
  browserTimers,
  localReminderMemory,
  storedReminderSources,
} from './services/reminders/ports';
import { createReprocessService } from './services/reprocess';
import { createShellPorts, openErrorPorts, openingPorts } from './services/shell';
import { createStorageNudge } from './services/storageNudge';
import { createTrackingSettingsService } from './services/trackingSettings';
import { createTransferService } from './services/transfer/transfer';
import { createWaterService } from './services/water';
import { createYourDataService, reloadOnWelcome } from './services/yourData';

// The composition root: the one place that opens the database, creates each repository once and
// hands the app the shell's ports, the services and the read hooks' data sources. Screens never
// see a repository.

const container = document.getElementById('root');
if (!container) throw new Error('Platewise: #root element missing from index.html');

const root = createRoot(container);
const router = createRouter(windowHost());

// P09-18: the browser's install offer can come before anything is drawn; keep it for the card.
installOffer.listen(window);
// P09-17: the offline worker (production builds only), once the page itself has loaded.
window.addEventListener('load', () => void registerServiceWorker(appUpdates), { once: true });

function render(ports: ShellPorts, services?: Services, data?: DataSources): void {
  const app = <App ports={ports} router={router} />;
  const withData = data ? <DataProvider sources={data}>{app}</DataProvider> : app;
  root.render(
    <StrictMode>
      {services ? <ServicesProvider services={services}>{withData}</ServicesProvider> : withData}
    </StrictMode>,
  );
}

async function start(): Promise<void> {
  // The start-up skeleton while the database opens.
  render(openingPorts());

  let db: PlatewiseDb;
  try {
    db = await openDb();
  } catch (error) {
    // A DbOpenError (newer data, a failed upgrade, no IndexedDB): the recovery card asks for a
    // reload, and nothing on disk is deleted or rewritten (R06.4).
    console.error('Platewise: the database could not be opened', error);
    render(openErrorPorts());
    return;
  }
  // P09-15: when another tab erases everything, this one lets go and starts again on Welcome.
  closeOnErase(db, reloadOnWelcome);

  const profileRepo = createProfileRepo(db);
  const settingsRepo = createSettingsRepo(db);
  const fastRepo = createFastRepo(db);
  const diaryRepo = createDiaryRepo(db);
  const weightRepo = createWeightRepo(db);
  const bodyFatRepo = createBodyFatRepo(db);
  const secretsRepo = createSecretsRepo(db);
  // One coach repository for the session and the read hooks: its writes queue per instance.
  const coachRepo = createCoachRepo(db);

  // A fast left running while tracking is off would keep food logging locked (R05.2).
  await fastRepo.settleOnOpen(systemClock.now()).catch((error: unknown) => {
    console.error('Platewise: ending a fast left running failed', error);
  });

  const storage = createStorageAccess({ settings: settingsRepo });
  // P09-15: the persistence request after the first entry, and Home's storage card for this visit.
  const storageNudge = createStorageNudge({ storage, settingsRepo, clock: systemClock });
  storageNudge.check().catch((error: unknown) => {
    console.error('Platewise: the storage card could not be worked out', error);
  });
  const photoRepo = createPhotoRepo(db);
  const backupRepo = createBackupRepo(db);
  // A restore's flag that a closed tab left behind would pause photo cleanup for good; the
  // restore itself either committed whole or rolled back.
  await backupRepo.endRestore().catch((error: unknown) => {
    console.error('Platewise: clearing a stale restore flag failed', error);
  });
  // One drafts repository for the capture draft and the analysis draft (same table).
  const draftsRepo = createDraftsRepo(db);
  const photos = createPhotoService({ photoRepo });
  const planDeps: PlanServiceDeps = {
    profileRepo,
    settingsRepo,
    weightRepo,
    bodyFatRepo,
    diaryRepo,
    clock: systemClock,
    aiAccess: createAiAccess({ settingsRepo, secretsRepo }),
    fetch: browserFetch,
  };
  const tuneUp = createTuneUpRunner(planDeps);
  const analysis = createAnalysisService({
    draftsRepo,
    photoRepo,
    settingsRepo,
    secretsRepo,
    overlay: appState,
    fetch: browserFetch,
  });
  // A product found by barcode becomes the analysis draft and opens through the same review.
  const barcode = createBarcodeService({
    fetch: browserFetch,
    secretsRepo,
    diaryRepo,
    draftsRepo,
    photoRepo,
    photos,
    openReview: () => analysis.restore(),
    unnamed: (code) => t('scan.unnamed', { code }),
  });

  // P09-08: reminders are worked out in the page (D-16.5). P09-09: they need the browser's
  // notification permission; the notifier shows one due while the page runs as a system
  // notification, and one missed while the app was closed as a banner in the app. The notifier
  // also sends the goal-weight alert that weigh-ins post on the bus (P05-14).
  const notifications = browserNotifications();
  const notifier = createNotifier({
    access: notifications,
    alertSettings: () => settingsRepo.snapshot(),
  });
  notifier.listen(appBus());
  const reminders = createReminderEngine({
    ...storedReminderSources({ settingsRepo, fastRepo, diaryRepo, profileRepo }),
    clock: systemClock,
    timers: browserTimers,
    visibility: documentVisibility,
    memory: localReminderMemory(),
    permitted: () => notifications.state() === 'granted',
    show: (notice) => void notifier.show(notice),
  });

  const services: Services = {
    // D-16.8: ask the browser to keep our data once, after the first entry is logged.
    diary: createDiaryService({
      diaryRepo,
      photoRepo: createPhotoRepo(db),
      // The entry editor's Saved switch (P06-11).
      savedMealsRepo: createSavedMealsRepo(db),
      onFirstEntry: () => storageNudge.afterFirstEntry(),
    }),
    onboarding: createOnboardingService({
      profileRepo,
      settingsRepo,
      weightRepo,
      bodyFatRepo,
    }),
    aiSetup: createAiSetupService({ settingsRepo, secretsRepo }),
    photos,
    captureDrafts: createCaptureDraftService({
      photos,
      draftsRepo,
      photoRepo,
    }),
    rebuild: createRebuildService(planDeps),
    tuneUp,
    targetEdits: createTargetEditsService({
      profileRepo,
      settingsRepo,
      tuneUp,
      clock: systemClock,
    }),
    planBuilder: createPlanBuilder({
      aiAccess: storedAiAccess({ settingsRepo, secretsRepo }),
      energyUnit: () => settingsRepo.get('units.energy'),
      fetch: browserFetch,
    }),
    analysis,
    profileEdits: createProfileEditsService({
      profileRepo,
      settingsRepo,
      weightRepo,
      clock: systemClock,
    }),
    savedMeals: createSavedMealsService({ savedMealsRepo: createSavedMealsRepo(db), photoRepo }),
    copyDay: createCopyDayService({ diaryRepo }),
    barcode,
    ingredientIntake: createIngredientIntake({
      photos,
      photoRepo,
      aiAccess: createAiAccess({ settingsRepo, secretsRepo }),
      fetch: browserFetch,
      // An ingredient scan looks codes up like Home's scans (R02.15).
      lookup: {
        secrets: secretsRepo,
        labels: diaryRepo,
        unnamed: (code) => t('scan.unnamed', { code }),
      },
    }),
    fitCheck: createFitCheckService({
      aiAccess: createAiAccess({ settingsRepo, secretsRepo }),
      fetch: browserFetch,
    }),
    reprocess: createReprocessService({
      aiAccess: createAiAccess({ settingsRepo, secretsRepo }),
      photoRepo,
      fetch: browserFetch,
    }),
    progress: createProgressService({ weightRepo, bodyFatRepo, settingsRepo, clock: systemClock }),
    homePrefs: createHomePrefsService({ settingsRepo }),
    water: createWaterService({ waterRepo: createWaterRepo(db), settingsRepo, clock: systemClock }),
    fasting: createFastingService({
      fastRepo,
      diaryRepo,
      settingsRepo,
      clock: systemClock,
      onFirstEntry: () => storageNudge.afterFirstEntry(),
    }),
    reminders,
    notifier,
    trackingSettings: createTrackingSettingsService({ settingsRepo, notifications, reminders }),
    coachSession: createCoachSession({
      coachRepo,
      data: {
        profileRepo,
        settingsRepo,
        diaryRepo,
        weightRepo,
        bodyFatRepo,
        fastRepo,
        waterRepo: createWaterRepo(db),
        clock: systemClock,
      },
      aiAccess: createAiAccess({ settingsRepo, secretsRepo }),
      fetch: browserFetch,
      photoOnlyText: () => t('coach.photoOnly'),
    }),
    // Home's picked rows as one entry (P06-19); the name's words come from the catalogue.
    combine: createCombineService({
      diaryRepo,
      photoRepo,
      words: {
        fallbackName: t('home.combine.unnamed'),
        more: (count) => t('home.combine.more', { count }),
      },
    }),
    // The diary file (P09-10, P09-11): its modules load on first use.
    transfer: createTransferService({ transferRepo: createTransferRepo(db), photoRepo }),
    appSettings: createAppSettingsService({ settingsRepo }),
    backup: createBackupService({
      backupRepo,
      settingsRepo,
      fastRepo,
      photoRepo,
      storage,
      clock: systemClock,
      // P09-16: package.json's version, written into the build.
      appVersion: APP_VERSION,
    }),
    // Settings › Your data (P09-15): Erase tells the backup, stops the reminders, then deletes.
    yourData: createYourDataService({
      transferRepo: createTransferRepo(db),
      photoRepo,
      storage,
      // Looked up when Erase runs: the backup service is built in this same object.
      backup: { invalidate: () => services.backup?.invalidate() },
      reminders,
      erase: () => eraseEverything({ db }),
    }),
    storageNudge,
    clock: systemClock,
  };
  const data: DataSources = {
    profileRepo,
    settingsRepo,
    diaryRepo,
    waterRepo: createWaterRepo(db),
    fastRepo,
    weightRepo,
    bodyFatRepo,
    savedMealsRepo: createSavedMealsRepo(db),
    coachRepo,
    unreadableFlag: () => hasUnreadableData(db),
    clock: systemClock,
  };
  render(createShellPorts({ profileRepo, settingsRepo }), services, data);
  reminders.start();
  // D-16.46: an analysis that finished before a reload opens its review again.
  analysis.restore().catch((error: unknown) => {
    console.error('Platewise: the stored analysis could not be read', error);
  });
}

void start();
