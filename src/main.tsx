import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The tokens first, so component styles imported after them can build on them.
import './ui/tokens.css';
import { App } from './app/App';
import type { ShellPorts } from './app/ports';
import { createRouter, windowHost } from './app/router';
import { openDb } from './data/db';
import { createDiaryRepo } from './data/repos/diaryRepo';
import { createFastRepo } from './data/repos/fastRepo';
import { createPhotoRepo } from './data/repos/photoRepo';
import { createProfileRepo } from './data/repos/profileRepo';
import { createSettingsRepo } from './data/repos/settingsRepo';
import { createWeightRepo } from './data/repos/weightRepo';
import type { PlatewiseDb } from './data/schema';
import { createStorageAccess } from './data/storage';
import { systemClock } from './lib/clock';
import { ServicesProvider, type Services } from './services/context';
import { createDiaryService } from './services/diary';
import { createOnboardingService } from './services/onboarding';
import { createShellPorts, openErrorPorts, openingPorts } from './services/shell';

// The composition root: the one place that opens the database, creates each repository once and
// hands the app the shell's ports and the services. Screens never see a repository.

const container = document.getElementById('root');
if (!container) throw new Error('Platewise: #root element missing from index.html');

const root = createRoot(container);
const router = createRouter(windowHost());

function render(ports: ShellPorts, services?: Services): void {
  const app = <App ports={ports} router={router} />;
  root.render(
    <StrictMode>
      {services ? <ServicesProvider services={services}>{app}</ServicesProvider> : app}
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

  // A fast left running while tracking is off would keep food logging locked (R05.2).
  await fastRepo.settleOnOpen(systemClock.now()).catch((error: unknown) => {
    console.error('Platewise: ending a fast left running failed', error);
  });

  const storage = createStorageAccess({ settings: settingsRepo });

  const services: Services = {
    // D-16.8: ask the browser to keep our data once, after the first entry is logged.
    diary: createDiaryService({
      diaryRepo: createDiaryRepo(db),
      photoRepo: createPhotoRepo(db),
      onFirstEntry: () => storage.requestPersistence(),
    }),
    onboarding: createOnboardingService({
      profileRepo,
      settingsRepo,
      weightRepo: createWeightRepo(db),
    }),
    clock: systemClock,
  };
  render(createShellPorts({ profileRepo, settingsRepo }), services);
}

void start();
