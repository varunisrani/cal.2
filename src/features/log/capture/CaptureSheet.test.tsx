import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftsRepo } from '../../../data/repos/draftsRepo';
import { createPhotoRepo } from '../../../data/repos/photoRepo';
import type { PlatewiseDb } from '../../../data/schema';
import { enPartitions } from '../../../i18n/en';
import { capture } from '../../../i18n/en/capture';
import { common } from '../../../i18n/en/common';
import { lintCatalogue } from '../../../i18n/lint';
import { fixedClock } from '../../../lib/clock';
import { createCaptureDraftService } from '../../../services/captureDrafts';
import { ServicesProvider, type Services } from '../../../services/context';
import { createPhotoService } from '../../../services/photos';
import { openTestDb } from '../../../test/db';
import { createFakeCodec, type FakeCodec } from '../../../test/fakeImageCodec';
import { FACTORY_NOW } from '../../../test/factories';
import { CaptureSheet, type CapturePicker } from './CaptureSheet';

const words = capture.capture;

// ---- Object URLs: jsdom has none, so the cards' previews are recorded here ----------------------

let previews = new Map<string, Blob>();
const urlMethods = ['createObjectURL', 'revokeObjectURL'] as const;
const savedUrlMethods = urlMethods.map((name) => Object.getOwnPropertyDescriptor(URL, name));

beforeEach(() => {
  previews = new Map();
  let made = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:capture-test/${++made}`;
      previews.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => void previews.delete(url),
  });
});

// ---- Databases ---------------------------------------------------------------------------------

const opened: PlatewiseDb[] = [];

afterEach(() => {
  urlMethods.forEach((name, index) => {
    const saved = savedUrlMethods[index];
    if (saved) Object.defineProperty(URL, name, saved);
    else Reflect.deleteProperty(URL, name);
  });
  for (const db of opened.splice(0)) db.close();
});

/** The real services over `db`, with a fake codec: what the app builds at start-up. */
function servicesOver(db: PlatewiseDb, fake: FakeCodec) {
  const photoRepo = createPhotoRepo(db);
  const draftsRepo = createDraftsRepo(db);
  const photos = createPhotoService({ photoRepo, codec: fake.codec });
  const captureDrafts = createCaptureDraftService({ photos, draftsRepo, photoRepo });
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
    photos,
    captureDrafts,
    clock: fixedClock(FACTORY_NOW, 'America/New_York'),
  };
  return { services, photoRepo, draftsRepo, captureDrafts };
}

async function setUp() {
  const { db } = await openTestDb();
  opened.push(db);
  const fake = createFakeCodec();
  return { db, fake, ...servicesOver(db, fake) };
}

/** Opens the sheet over `services`. */
function mount(services: Services, picker: CapturePicker = 'library') {
  const onAnalyse = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ServicesProvider services={services}>
      <CaptureSheet open picker={picker} onAnalyse={onAnalyse} onClose={onClose} />
    </ServicesProvider>,
  );
  return { onAnalyse, onClose, unmount: view.unmount };
}

// ---- The page ----------------------------------------------------------------------------------

const sheet = () => within(screen.getByRole('dialog', { name: words.title }));
const input = (which: CapturePicker) =>
  document.querySelector(`[data-ui="capture.${which}"]`) as HTMLInputElement;
const cards = () => document.querySelectorAll('[data-ui="capture.card"]');
const countLine = () => document.querySelector('[data-ui="capture.count"]')?.textContent;
const analyseButton = () => sheet().getByRole('button', { name: words.analyse });
const stepsSwitch = () => sheet().getByRole('switch', { name: words.steps.label });
const note = () => sheet().getByLabelText(words.note.label) as HTMLTextAreaElement;

/**
 * Lets one round of queued tasks run (IndexedDB callbacks, the fake codec), then lets React draw.
 * A message on a MessageChannel is a separate task: no timer is involved.
 */
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

/** Runs tasks until `check()` holds; fails after a generous number of rounds. */
async function until(check: () => boolean) {
  for (let round = 0; round < 500; round++) {
    if (check()) return;
    await nextTask();
  }
  throw new Error('The sheet never reached the expected state');
}

/** Picks `files` in one of the sheet's file inputs, as the browser's picker would hand them over. */
async function pick(files: readonly Blob[], which: CapturePicker = 'library') {
  await act(async () => {
    fireEvent.change(input(which), { target: { files } });
  });
}

/** Picks files and waits until the sheet shows `count` cards. */
async function pickAndShow(files: readonly Blob[], count: number) {
  await pick(files);
  await until(() => cards().length === count);
}

function photos(fake: FakeCodec, count: number, firstWidth = 800) {
  return Promise.all(
    Array.from({ length: count }, (_, index) => fake.photo(firstWidth + index, 600, 12_000)),
  );
}

/** Waits until every queued capture write has run (calls on the service run in order). */
async function settled(captureDrafts: Services['captureDrafts']) {
  await act(async () => {
    await captureDrafts?.load();
  });
}

describe('CaptureSheet', () => {
  it('opens the camera as one photo with capture=environment, and the library as several', async () => {
    const { services, captureDrafts } = await setUp();
    const camera = mount(services, 'camera');
    await settled(captureDrafts);

    expect(input('camera')).toHaveAttribute('accept', 'image/*');
    expect(input('camera')).toHaveAttribute('capture', 'environment');
    expect(input('camera')).not.toHaveAttribute('multiple');
    expect(input('library')).toHaveAttribute('accept', 'image/*');
    expect(input('library')).toHaveAttribute('multiple');
    expect(input('library')).not.toHaveAttribute('capture');

    const cameraClick = vi.spyOn(input('camera'), 'click').mockImplementation(() => {});
    fireEvent.click(sheet().getByRole('button', { name: words.addPhoto }));
    expect(cameraClick).toHaveBeenCalledTimes(1);
    camera.unmount();

    mount(services, 'library');
    await settled(captureDrafts);
    const libraryClick = vi.spyOn(input('library'), 'click').mockImplementation(() => {});
    fireEvent.click(sheet().getByRole('button', { name: words.addPhotos }));
    expect(libraryClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the first 10 of 12 picked photos and says 2 were left out (ACC-D4-1)', async () => {
    const { services, fake, photoRepo } = await setUp();
    mount(services);

    await pickAndShow(await photos(fake, 12), 10);

    expect(countLine()).toBe('10 of 10 photos');
    expect(sheet().getByRole('status')).toHaveTextContent(
      'A meal takes up to 10 photos, so 2 photos were left out.',
    );
    expect(sheet().queryByRole('button', { name: words.addPhotos })).toBeNull();
    expect((await photoRepo.usage()).count).toBe(10);
  });

  it('refuses a pick with a 30 MiB photo whole: a message, no card and nothing stored (ACC-D4-2, R02.17)', async () => {
    const { services, fake, photoRepo, draftsRepo } = await setUp();
    mount(services);
    const big = new Blob([new Uint8Array(30 * 1024 * 1024)], { type: 'image/jpeg' });

    await pick([...(await photos(fake, 2)), big]);
    await until(() => screen.queryByRole('alert') !== null);

    expect(screen.getByRole('alert')).toHaveTextContent(words.refused.tooLarge);
    expect(cards()).toHaveLength(0);
    expect(countLine()).toBe('0 of 10 photos');
    expect((await photoRepo.usage()).count).toBe(0);
    expect(await draftsRepo.loadCapture()).toBeNull();
  });

  it('says plainly when this browser cannot open a photo, as HEIC outside Safari (ACC-D28-2, D-16.21)', async () => {
    const { services, fake, photoRepo } = await setUp();
    mount(services);

    await pick([await fake.photo(800, 600, 12_000), await fake.undecodable()]);
    await until(() => screen.queryByRole('alert') !== null);

    expect(screen.getByRole('alert')).toHaveTextContent(words.refused.unsupportedImage);
    expect((await photoRepo.usage()).count).toBe(0);
  });

  it('keeps Analyse off while photos are being stored, then sends the photos and the note', async () => {
    const { services, fake } = await setUp();
    const { onAnalyse } = mount(services);
    await pickAndShow(await photos(fake, 1), 1);
    expect(analyseButton()).toBeEnabled();
    const second = await photos(fake, 1, 900);
    const held = fake.hold();

    await pick(second);
    await act(() => held.reached);

    expect(cards()).toHaveLength(1);
    expect(analyseButton()).toBeDisabled();
    expect(sheet().getByRole('button', { name: words.addPhotos })).toBeDisabled();
    expect(sheet().getByRole('status')).toHaveTextContent(words.adding);
    held.release();
    await until(() => cards().length === 2);
    expect(analyseButton()).toBeEnabled();

    fireEvent.change(note(), { target: { value: '  About 200 g of rice  ' } });
    fireEvent.click(analyseButton());

    expect(onAnalyse).toHaveBeenCalledTimes(1);
    const request = onAnalyse.mock.calls[0]?.[0];
    expect(request).toEqual({
      photoIds: expect.any(Array),
      note: 'About 200 g of rice',
      progressive: false,
    });
    expect(request.photoIds).toHaveLength(2);
  });

  it('keeps the plate-built-in-steps switch off with one photo, and sends it only with two or more', async () => {
    const { services, fake } = await setUp();
    const { onAnalyse } = mount(services);

    await pickAndShow(await photos(fake, 1), 1);
    expect(stepsSwitch()).toBeDisabled();
    expect(stepsSwitch()).toHaveAttribute('aria-checked', 'false');

    await pickAndShow(await photos(fake, 1, 900), 2);
    expect(stepsSwitch()).toBeEnabled();
    fireEvent.click(stepsSwitch());
    expect(stepsSwitch()).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(sheet().getByRole('button', { name: 'Remove photo 2' }));
    await until(() => cards().length === 1);
    expect(stepsSwitch()).toBeDisabled();
    expect(stepsSwitch()).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(analyseButton());
    expect(onAnalyse.mock.calls[0]?.[0]).toMatchObject({ progressive: false });

    await pickAndShow(await photos(fake, 1, 950), 2);
    expect(stepsSwitch()).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(analyseButton());
    expect(onAnalyse.mock.calls[1]?.[0]).toMatchObject({ progressive: true });
  });

  it('brings back 3 photos, the note and the switch after a reload (D-16.46)', async () => {
    const { db, services, fake, captureDrafts } = await setUp();
    const first = mount(services);
    await pickAndShow(await photos(fake, 3), 3);
    fireEvent.change(note(), { target: { value: 'Half the sauce' } });
    fireEvent.click(stepsSwitch());
    await settled(captureDrafts);
    first.unmount();

    // A reload: new services over the same database.
    mount(servicesOver(db, fake).services);
    await until(() => cards().length === 3);

    expect(countLine()).toBe('3 of 10 photos');
    expect(note()).toHaveValue('Half the sauce');
    expect(stepsSwitch()).toHaveAttribute('aria-checked', 'true');
  });

  it('Cancel clears the draft and its photos', async () => {
    const { services, fake, photoRepo, draftsRepo, captureDrafts } = await setUp();
    const { onClose, onAnalyse } = mount(services);
    await pickAndShow(await photos(fake, 3), 3);
    fireEvent.change(note(), { target: { value: 'Two eggs' } });

    fireEvent.click(sheet().getByRole('button', { name: common.common.cancel }));
    await settled(captureDrafts);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnalyse).not.toHaveBeenCalled();
    expect(await draftsRepo.loadCapture()).toBeNull();
    expect((await photoRepo.usage()).count).toBe(0);
  });

  it('removes a photo and numbers the rest again; removing the last closes the sheet', async () => {
    const { services, fake, photoRepo, draftsRepo } = await setUp();
    const { onClose } = mount(services);
    await pickAndShow(await photos(fake, 2), 2);

    fireEvent.click(sheet().getByRole('button', { name: 'Remove photo 1' }));
    await until(() => cards().length === 1);
    expect(countLine()).toBe('1 of 10 photos');
    expect(sheet().getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument();
    expect((await photoRepo.usage()).count).toBe(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(sheet().getByRole('button', { name: 'Remove photo 1' }));
    await until(() => cards().length === 0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await draftsRepo.loadCapture()).toBeNull();
    expect((await photoRepo.usage()).count).toBe(0);
  });

  it('shows each card as the 720 px preview, named by its place', async () => {
    const { services, fake } = await setUp();
    mount(services);

    await pickAndShow([await fake.photo(4000, 3000, 900_000)], 1);
    await until(() => document.querySelector('[data-ui="capture.card"] img') !== null);

    const image = sheet().getByRole('img', { name: 'Photo 1' });
    const blob = previews.get(image.getAttribute('src') ?? '');
    expect(await fake.sizeOf(blob as Blob)).toEqual({ width: 720, height: 540 });
  });

  it('explains plate built in steps in a dialog', async () => {
    const { services } = await setUp();
    mount(services);

    fireEvent.click(sheet().getByRole('button', { name: words.steps.about }));
    const dialog = screen.getByRole('alertdialog', { name: words.steps.label });
    expect(dialog).toHaveTextContent(words.steps.aboutBody);

    fireEvent.click(within(dialog).getByRole('button', { name: words.steps.gotIt }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('draws its words from a catalogue partition that passes the lint', () => {
    expect(lintCatalogue({ ...enPartitions, capture })).toEqual([]);
  });
});
