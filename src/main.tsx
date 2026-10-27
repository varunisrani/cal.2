import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The tokens first, so component styles imported after them can build on them.
import './ui/tokens.css';
import { browserFetch } from './ai/transport';
import { App } from './app/App';
import { appState } from './app/appState';
import type { ShellPorts } from './app/ports';
import { createRouter, windowHost } from './app/router';
import { DataProvider, type DataSources } from './data/DataProvider';
import { openDb } from './data/db';
import { hasUnreadableData } from './data/guard';
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
import { createWaterRepo } from './data/repos/waterRepo';
import { createWeightRepo } from './data/repos/weightRepo';
import type { PlatewiseDb } from './data/schema';
import { createStorageAccess } from './data/storage';
import { systemClock } from './lib/clock';
import { createAiSetupService } from './services/aiSetup';
import { createAnalysisService } from './services/analysis';
import { createCaptureDraftService } from './services/captureDrafts';
import { createCopyDayService } from './services/copyDay';
import { ServicesProvider, type Services } from './services/context';
import { createAiAccess } from './services/aiAccess';
import { createDiaryService } from './services/diary';
import { createRebuildService } from './services/goals/rebuild';
import { createTargetEditsService } from './services/goals/targetEdits';
import { createTuneUpRunner } from './services/goals/tuneUp';
import type { PlanServiceDeps } from './services/goals/planRequest';
import { createPlanBuilder, storedAiAccess } from './services/goals/planBuilder';
import { createOnboardingService } from './services/onboarding';
import { createPhotoService } from './services/photos';
import { createProfileEditsService } from './services/profileEdits';
import { createSavedMealsService } from './services/savedMeals';
import { createShellPorts, openErrorPorts, openingPorts } from './services/shell';

// The composition root: the one place that opens the database, creates each repository once and
// hands the app the shell's ports, the services and the read hooks' data sources. Screens never
// see a repository.

const container = document.getElementById('root');
if (!container) throw new Error('Platewise: #root element missing from index.html');

const root = createRoot(container);
const router = createRouter(windowHost());

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

  const profileRepo = createProfileRepo(db);
  const settingsRepo = createSettingsRepo(db);
  const fastRepo = createFastRepo(db);
  const diaryRepo = createDiaryRepo(db);
  const weightRepo = createWeightRepo(db);
  const bodyFatRepo = createBodyFatRepo(db);
  const secretsRepo = createSecretsRepo(db);

  // A fast left running while tracking is off would keep food logging locked (R05.2).
  await fastRepo.settleOnOpen(systemClock.now()).catch((error: unknown) => {
    console.error('Platewise: ending a fast left running failed', error);
  });

  const storage = createStorageAccess({ settings: settingsRepo });
  const photoRepo = createPhotoRepo(db);
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

  const services: Services = {
    // D-16.8: ask the browser to keep our data once, after the first entry is logged.
    diary: createDiaryService({
      diaryRepo,
      photoRepo: createPhotoRepo(db),
      onFirstEntry: () => storage.requestPersistence(),
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
    coachRepo: createCoachRepo(db),
    unreadableFlag: () => hasUnreadableData(db),
    clock: systemClock,
  };
  render(createShellPorts({ profileRepo, settingsRepo }), services, data);
  // D-16.46: an analysis that finished before a reload opens its review again.
  analysis.restore().catch((error: unknown) => {
    console.error('Platewise: the stored analysis could not be read', error);
  });
}

void start();
