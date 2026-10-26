import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageBackend } from '../../ai/image';
import { fakeFetch, type FakeFetch, type FakeStep } from '../../ai/testing/fakeFetch';
import { geminiAnswer, geminiError } from '../../ai/testing/wire';
import { AppStateContext, createAppState, type AppStateStore } from '../../app/appState';
import {
  DEFAULT_SHELL_SETTINGS,
  fixedStore,
  ShellPortsContext,
  type BootState,
} from '../../app/ports';
import { createRouter } from '../../app/router';
import { TabBar } from '../../app/TabBar';
import { controlledStore } from '../../app/testing/controlledStore';
import { memoryHost } from '../../app/testing/memoryHost';
import { RouterProvider } from '../../app/useRoute';
import { createDraftsRepo } from '../../data/repos/draftsRepo';
import { createPhotoRepo, type PhotoRepo } from '../../data/repos/photoRepo';
import { createSecretsRepo } from '../../data/repos/secretsRepo';
import { createSettingsRepo } from '../../data/repos/settingsRepo';
import type { PlatewiseDb } from '../../data/schema';
import { ai } from '../../i18n/en/ai';
import { capture } from '../../i18n/en/capture';
import { common } from '../../i18n/en/common';
import { enPartitions } from '../../i18n/en';
import { lintCatalogue } from '../../i18n/lint';
import { fixedClock } from '../../lib/clock';
import { createAnalysisService, type AnalysisService } from '../../services/analysis';
import { ServicesProvider, type Services } from '../../services/context';
import { createPhotoService } from '../../services/photos';
import { storableBlob } from '../../test/blobs';
import { openTestDb } from '../../test/db';
import { createFakeCodec } from '../../test/fakeImageCodec';
import { FACTORY_NOW } from '../../test/factories';
import { AnalysisOverlay } from './AnalysisOverlay';

const words = capture.capture.analysing;
const GEMINI = 'https://generativelanguage.googleapis.com/';
const SOUP = { name: 'Lentil soup', kcal: 310, protein: 18, carbs: 44, fat: 7, servingGrams: 400 };
const answer: FakeStep = { json: geminiAnswer(JSON.stringify(SOUP)) };
const refused: FakeStep = {
  status: 401,
  json: geminiError(401, 'UNAUTHENTICATED', 'The key was refused.'),
};

const backend: ImageBackend = {
  decode: () =>
    Promise.resolve({
      width: 600,
      height: 600,
      toJpeg: () => Promise.resolve(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0)),
      close: () => undefined,
    }),
};

// ---- Object URLs: jsdom has none, so the photo's preview is recorded here ----------------------

let previews = new Map<string, Blob>();
const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));

beforeEach(() => {
  previews = new Map();
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:analysis-test/${++made}`;
      previews.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => void previews.delete(url),
  });
});

const opened: PlatewiseDb[] = [];

afterEach(() => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  for (const db of opened.splice(0)) db.close();
});

// ---- Set-up ----------------------------------------------------------------------------------

/** A `fetch` that holds every request until `open()`; an abort rejects a held one at once. */
function holding(fake: FakeFetch) {
  let open: () => void = () => undefined;
  let gate = new Promise<void>((resolve) => (open = resolve));
  let calls = 0;
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls += 1;
    const waitFor = gate;
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => reject(signal.reason));
      void waitFor.then(() => fake.fetch(input, init)).then(resolve, reject);
    });
  };
  return {
    fetch,
    calls: () => calls,
    /** Lets the held requests go; later ones wait for the next `open()`. */
    open() {
      open();
      gate = new Promise<void>((resolve) => (open = resolve));
    },
  };
}

interface Harness {
  readonly analysis: AnalysisService;
  readonly appState: AppStateStore;
  readonly photoRepo: PhotoRepo;
  readonly fake: FakeFetch;
  readonly held: ReturnType<typeof holding>;
}

/** The overlay and the tab bar over the real analysis service, on a test database. */
async function setUp(): Promise<Harness> {
  const { db, bus } = await openTestDb();
  opened.push(db);
  const settingsRepo = createSettingsRepo(db, { locale: 'en-GB', bus });
  const secretsRepo = createSecretsRepo(db);
  await secretsRepo.set('gemini', 'gm-test-key-5521');
  const photoRepo = createPhotoRepo(db);
  const fake = fakeFetch();
  const held = holding(fake);
  const appState = createAppState();
  const analysis = createAnalysisService({
    draftsRepo: createDraftsRepo(db),
    photoRepo,
    settingsRepo,
    secretsRepo,
    overlay: appState,
    fetch: held.fetch,
    imageBackend: backend,
  });
  const services: Services = {
    diary: { logEntry: vi.fn(), deleteEntry: vi.fn() },
    onboarding: { complete: vi.fn() },
    aiSetup: {
      saveChoice: vi.fn(),
      savedKeyMask: vi.fn(),
      setTermsAccepted: vi.fn(),
      setUpLater: vi.fn(),
    },
    planBuilder: { build: vi.fn() },
    photos: createPhotoService({ photoRepo, codec: createFakeCodec().codec }),
    analysis,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  };
  const ports = {
    settings: controlledStore(DEFAULT_SHELL_SETTINGS),
    boot: fixedStore<BootState>({ status: 'ready' }),
  };
  render(
    <ServicesProvider services={services}>
      <ShellPortsContext value={ports}>
        <AppStateContext value={appState}>
          <RouterProvider router={createRouter(memoryHost('#/home'))}>
            <TabBar />
            <AnalysisOverlay />
          </RouterProvider>
        </AppStateContext>
      </ShellPortsContext>
    </ServicesProvider>,
  );
  return { analysis, appState, photoRepo, fake, held };
}

/** Lets one round of queued tasks run (IndexedDB callbacks), then lets React draw. */
async function nextTask() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  });
}

async function until(check: () => boolean) {
  for (let round = 0; round < 500; round++) {
    if (check()) return;
    await nextTask();
  }
  throw new Error('The overlay never reached the expected state');
}

/**
 * Starts an analysis from outside (the capture or describe sheet does it in the app) and waits
 * until its request is held. Gives back the attempt's promise, wrapped so awaiting this does not
 * wait for it.
 */
async function startPending(
  harness: Harness,
  start: (analysis: AnalysisService) => Promise<void>,
): Promise<{ readonly done: Promise<void> }> {
  let done: Promise<void> = Promise.resolve();
  await act(async () => {
    done = start(harness.analysis);
  });
  const calls = harness.held.calls();
  await until(() => harness.held.calls() > calls);
  return { done };
}

const overlay = () => document.querySelector<HTMLElement>('[data-ui="analysis"]');
const failure = () => screen.queryByRole('alertdialog', { name: words.failedTitle });
const tabBar = () => screen.queryByRole('navigation');

function storedPhoto(photoRepo: PhotoRepo, size: number) {
  return storableBlob(size).then((blob) => photoRepo.put(blob, { width: 600, height: 600 }));
}

// ---- Tests -----------------------------------------------------------------------------------

describe('AnalysisOverlay', () => {
  it('shows nothing while no analysis runs', async () => {
    await setUp();
    expect(overlay()).toBeNull();
    expect(failure()).toBeNull();
    expect(tabBar()).toBeInTheDocument();
  });

  it('shows the first photo with Cancel while photos are analysed', async () => {
    const harness = await setUp();
    const first = await storedPhoto(harness.photoRepo, 900);
    const second = await storedPhoto(harness.photoRepo, 1_200);

    await startPending(harness, (analysis) =>
      analysis.start('photo', { photoIds: [first, second], note: '', progressive: false }),
    );
    await until(() => screen.queryByRole('img', { name: words.photo }) instanceof HTMLImageElement);

    expect(screen.getByRole('dialog', { name: words.status })).toBe(overlay());
    const layer = within(overlay() as HTMLElement);
    const photo = layer.getByRole('img', { name: words.photo }) as HTMLImageElement;
    expect((await previews.get(photo.src)?.arrayBuffer())?.byteLength).toBe(900);
    expect(layer.getByRole('status')).toHaveTextContent(words.status);
    expect(layer.getByRole('button', { name: common.common.cancel })).toHaveFocus();
    expect(document.querySelector('[data-ui="analysis.spinner"]')).toBeNull();
  });

  it('shows a spinner for a typed meal', async () => {
    const harness = await setUp();

    await startPending(harness, (analysis) => analysis.start('text', { text: 'Lentil soup' }));

    expect(screen.getByRole('dialog', { name: words.textStatus })).toBe(overlay());
    expect(within(overlay() as HTMLElement).getByRole('status')).toHaveTextContent(
      words.textStatus,
    );
    expect(document.querySelector('[data-ui="analysis.spinner"]')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: words.photo })).toBeNull();
  });

  it('hides the tab bar during an analysis and brings it back afterwards (ACC-A5-1)', async () => {
    const harness = await setUp();
    harness.fake.on(GEMINI, answer);
    expect(tabBar()).toBeInTheDocument();

    const { done } = await startPending(harness, (analysis) =>
      analysis.start('text', { text: 'Lentil soup' }),
    );
    expect(tabBar()).toBeNull();
    expect(harness.appState.getSnapshot().analysisOverlay).toBe(true);

    await act(async () => {
      harness.held.open();
      await done;
    });

    expect(overlay()).toBeNull();
    expect(tabBar()).toBeInTheDocument();
    expect(harness.analysis.getSnapshot().phase).toBe('reviewReady');
  });

  it('closes on Cancel with no error message, and the tab bar comes back (ACC-D5-1)', async () => {
    const harness = await setUp();
    harness.fake.on(GEMINI, answer);
    const { done } = await startPending(harness, (analysis) =>
      analysis.start('text', { text: 'Lentil soup' }),
    );

    await act(async () => {
      fireEvent.click(within(overlay() as HTMLElement).getByRole('button', { name: 'Cancel' }));
      await done;
    });

    expect(overlay()).toBeNull();
    expect(failure()).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(tabBar()).toBeInTheDocument();
    expect(harness.fake.requests).toHaveLength(0);
    expect(harness.analysis.getSnapshot().phase).toBe('idle');
  });

  it('shows the failure with Retry, which sends the same request again (ACC-D5-2)', async () => {
    const harness = await setUp();
    harness.fake.on(GEMINI, refused, answer);
    const first = await startPending(harness, (analysis) =>
      analysis.start('text', { text: 'Lentil soup' }),
    );
    await act(async () => {
      harness.held.open();
      await first.done;
    });

    const dialog = within(failure() as HTMLElement);
    expect(dialog.getByText(ai.ai.failure.keyRejected)).toBeInTheDocument();
    expect(overlay()).toBeNull();

    fireEvent.click(dialog.getByRole('button', { name: common.common.retry }));
    await until(() => harness.held.calls() === 2);
    expect(failure()).toBeNull();
    expect(overlay()).toBeInTheDocument();
    await act(async () => {
      harness.held.open();
    });
    await until(() => harness.analysis.getSnapshot().phase === 'reviewReady');

    expect(overlay()).toBeNull();
    expect(harness.fake.requests).toHaveLength(2);
    expect(harness.fake.requests[1]?.body).toEqual(harness.fake.requests[0]?.body);
  });

  it('closes the failure on Cancel and shows nothing more', async () => {
    const harness = await setUp();
    harness.fake.on(GEMINI, refused);
    const { done } = await startPending(harness, (analysis) =>
      analysis.start('text', { text: 'Lentil soup' }),
    );
    await act(async () => {
      harness.held.open();
      await done;
    });

    await act(async () => {
      fireEvent.click(
        within(failure() as HTMLElement).getByRole('button', { name: common.common.cancel }),
      );
    });

    expect(failure()).toBeNull();
    expect(overlay()).toBeNull();
    expect(harness.analysis.getSnapshot().phase).toBe('idle');
  });

  it('draws its words from a catalogue partition that passes the lint', () => {
    expect(lintCatalogue(enPartitions)).toEqual([]);
    expect(words.status).not.toBe('');
    expect(words.failedTitle).not.toBe('');
  });
});
