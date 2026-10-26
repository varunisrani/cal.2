import { describe, expect, it, vi } from 'vitest';
import { createDraftsRepo } from '../data/repos/draftsRepo';
import { createPhotoRepo } from '../data/repos/photoRepo';
import type { PlatewiseDb } from '../data/schema';
import { withIdSequence } from '../lib/ids';
import { openTestDb } from '../test/db';
import { createFakeCodec, type FakeCodec } from '../test/fakeImageCodec';
import {
  MAX_CAPTURE_PHOTOS,
  MAX_PICK_BYTES,
  createCaptureDraftService,
  type CaptureDraftDeps,
} from './captureDrafts';
import { createPhotoService, type PhotoService } from './photos';

interface SetUpOptions {
  /** Wraps the real photo service (to fail a store). */
  readonly photos?: (real: PhotoService) => CaptureDraftDeps['photos'];
}

/** The service over a test database: the real photo service and repositories, a fake codec. */
async function setUp(options: SetUpOptions = {}) {
  const { db } = await openTestDb();
  const fake = createFakeCodec();
  return { db, fake, ...connect(db, fake, options) };
}

/** A service over an existing database, as after a reload. */
function connect(db: PlatewiseDb, fake: FakeCodec, options: SetUpOptions = {}) {
  const photoRepo = createPhotoRepo(db, { newId: withIdSequence(`photo-${++connections}-`) });
  const draftsRepo = createDraftsRepo(db);
  const saveCapture = vi.fn(draftsRepo.saveCapture);
  const realPhotos = createPhotoService({ photoRepo, codec: fake.codec });
  const service = createCaptureDraftService({
    photos: options.photos ? options.photos(realPhotos) : realPhotos,
    draftsRepo: { ...draftsRepo, saveCapture },
    photoRepo,
  });
  return { service, photoRepo, draftsRepo, saveCapture };
}
let connections = 0;

/** `count` small photos, each a pixel wider than the last so their order can be checked. */
function photos(fake: FakeCodec, count: number, firstWidth = 800) {
  return Promise.all(
    Array.from({ length: count }, (_, index) => fake.photo(firstWidth + index, 600, 12_000)),
  );
}

/** A file whose bytes cannot be read (a cloud photo that failed to download). */
async function unreadable(fake: FakeCodec) {
  const file = await fake.photo(800, 600, 12_000);
  Object.defineProperty(file, 'arrayBuffer', {
    value: () =>
      Promise.reject(new DOMException('The file could not be read.', 'NotReadableError')),
  });
  return file;
}

/** A file over the size limit (never read, so its bytes are only zeros). */
const oversized = () => new Blob([new Uint8Array(30 * 1024 * 1024)], { type: 'image/jpeg' });

async function storedCount(photoRepo: ReturnType<typeof createPhotoRepo>) {
  return (await photoRepo.usage()).count;
}

/** The widths of the stored photos, in draft order. */
async function widthsOf(ids: readonly string[], setup: Awaited<ReturnType<typeof setUp>>) {
  const rows = await Promise.all(ids.map((id) => setup.photoRepo.get(id)));
  return rows.map((row) => row?.width);
}

describe('add: up to 10 photos (ACC-D4-1)', () => {
  it('keeps the first 10 of 12 picked photos and counts the 2 left out', async () => {
    const setup = await setUp();

    const result = await setup.service.add(await photos(setup.fake, 12));

    expect(result).toMatchObject({ kind: 'added', leftOut: 2 });
    const ids = result.kind === 'added' ? result.photoIds : [];
    expect(ids).toHaveLength(MAX_CAPTURE_PHOTOS);
    expect(await widthsOf(ids, setup)).toEqual([800, 801, 802, 803, 804, 805, 806, 807, 808, 809]);
    expect((await setup.draftsRepo.loadCapture())?.photoIds).toEqual(ids);
    expect(await storedCount(setup.photoRepo)).toBe(10);
  });

  it('fills only the room left, and a full draft takes none', async () => {
    const setup = await setUp();
    await setup.service.add(await photos(setup.fake, 9));

    const second = await setup.service.add(await photos(setup.fake, 3, 900));
    const third = await setup.service.add(await photos(setup.fake, 2, 950));

    expect(second).toMatchObject({ kind: 'added', leftOut: 2 });
    expect(third).toMatchObject({ kind: 'added', leftOut: 2 });
    const ids = (await setup.service.load()).photoIds;
    expect((await widthsOf(ids, setup)).slice(8)).toEqual([808, 900]);
    expect(await storedCount(setup.photoRepo)).toBe(10);
  });

  it('checks only the files that fit: a 30 MiB file past the cap does not refuse the others', async () => {
    const setup = await setUp();

    const result = await setup.service.add([...(await photos(setup.fake, 10)), oversized()]);

    expect(result).toMatchObject({ kind: 'added', leftOut: 1 });
  });

  it('runs picks one at a time, so two quick picks never pass 10', async () => {
    const setup = await setUp();
    const [first, second] = await Promise.all([photos(setup.fake, 6), photos(setup.fake, 6, 900)]);

    const results = await Promise.all([setup.service.add(first), setup.service.add(second)]);

    expect(results[0]).toMatchObject({ kind: 'added', leftOut: 0 });
    expect(results[1]).toMatchObject({ kind: 'added', leftOut: 2 });
    expect((await setup.service.load()).photoIds).toHaveLength(10);
    expect(await storedCount(setup.photoRepo)).toBe(10);
  });
});

describe('add: a pick is kept whole or not at all (R02.17)', () => {
  it('refuses the whole pick when one file is over 25 MiB, and stores nothing (ACC-D4-2)', async () => {
    const setup = await setUp();
    const before = await setup.service.add(await photos(setup.fake, 2));
    const decodes = setup.fake.decodes();

    const result = await setup.service.add([
      ...(await photos(setup.fake, 2, 900)),
      oversized(),
      await setup.fake.photo(950, 600, 12_000),
    ]);

    expect(result).toEqual({ kind: 'refused', reason: 'tooLarge' });
    expect(setup.fake.decodes()).toBe(decodes);
    expect(await storedCount(setup.photoRepo)).toBe(2);
    expect((await setup.service.load()).photoIds).toEqual(
      before.kind === 'added' ? before.photoIds : null,
    );
  });

  it('takes a file of exactly 25 MiB', async () => {
    const setup = await setUp();
    const limit = await setup.fake.photo(4000, 3000, MAX_PICK_BYTES);

    expect(await setup.service.add([limit])).toMatchObject({ kind: 'added' });
  });

  it('refuses the whole pick when a file cannot be read, before storing anything', async () => {
    const setup = await setUp();

    const result = await setup.service.add([
      await setup.fake.photo(800, 600, 12_000),
      await unreadable(setup.fake),
    ]);

    expect(result).toEqual({ kind: 'refused', reason: 'unreadable' });
    expect(setup.fake.decodes()).toBe(0);
    expect(await storedCount(setup.photoRepo)).toBe(0);
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
  });

  it('refuses an empty file as unreadable', async () => {
    const setup = await setUp();
    const result = await setup.service.add([await setup.fake.photo(800, 600), new Blob([])]);
    expect(result).toEqual({ kind: 'refused', reason: 'unreadable' });
    expect(await storedCount(setup.photoRepo)).toBe(0);
  });

  it('refuses a pick with a photo the browser cannot decode and removes the photos it already stored', async () => {
    const setup = await setUp();

    const result = await setup.service.add([
      ...(await photos(setup.fake, 2)),
      await setup.fake.undecodable(),
      await setup.fake.photo(950, 600, 12_000),
    ]);

    expect(result).toEqual({ kind: 'refused', reason: 'unsupportedImage' });
    expect(setup.fake.decodes()).toBe(3);
    expect(await storedCount(setup.photoRepo)).toBe(0);
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
  });

  it('removes the photos it stored when storage fails', async () => {
    let stores = 0;
    const setup = await setUp({
      photos: (real) => ({
        store: (file) => {
          stores += 1;
          return stores === 3 ? Promise.reject(new Error('quota')) : real.store(file);
        },
      }),
    });

    const result = await setup.service.add(await photos(setup.fake, 4));

    expect(result).toEqual({ kind: 'refused', reason: 'storageFailed' });
    expect(await storedCount(setup.photoRepo)).toBe(0);
  });
});

describe('a reload brings the draft back (D-16.46)', () => {
  it('restores 3 photos, the note and the switch', async () => {
    const setup = await setUp();
    const added = await setup.service.add(await photos(setup.fake, 3));
    await setup.service.update({ note: 'Rice about 200 g' });
    await setup.service.update({ progressive: true });

    const reloaded = connect(setup.db, setup.fake).service;

    expect(await reloaded.load()).toEqual({
      photoIds: added.kind === 'added' ? added.photoIds : null,
      note: 'Rice about 200 g',
      progressive: true,
    });
  });

  it('drops photos that can no longer be read when it loads', async () => {
    const setup = await setUp();
    const added = await setup.service.add(await photos(setup.fake, 2));
    const [gone, kept] = added.kind === 'added' ? added.photoIds : [];
    await setup.db.photos.delete(gone as string);

    const reloaded = connect(setup.db, setup.fake).service;

    expect((await reloaded.load()).photoIds).toEqual([kept]);
    expect((await setup.draftsRepo.loadCapture())?.photoIds).toEqual([kept]);
  });

  it('loads an empty draft when there is none', async () => {
    const { service } = await setUp();
    expect(await service.load()).toEqual({ photoIds: [], note: '', progressive: false });
  });

  it('keeps a note typed before the first photo', async () => {
    const setup = await setUp();
    await setup.service.update({ note: 'No butter' });
    await setup.service.add(await photos(setup.fake, 1));

    expect(await connect(setup.db, setup.fake).service.load()).toMatchObject({
      note: 'No butter',
    });
  });
});

describe('remove, clear and waiting writes', () => {
  it('Cancel clears the draft and its photos', async () => {
    const setup = await setUp();
    await setup.service.add(await photos(setup.fake, 3));
    await setup.service.update({ note: 'Half the sauce' });

    await setup.service.clear();

    expect(await setup.draftsRepo.loadCapture()).toBeNull();
    expect(await storedCount(setup.photoRepo)).toBe(0);
  });

  it('turns a pick still being stored stale on clear, and removes what it stored', async () => {
    const setup = await setUp();
    const files = await photos(setup.fake, 3);
    const held = setup.fake.hold();

    const pick = setup.service.add(files);
    await held.reached;
    const cleared = setup.service.clear();
    held.release();

    expect(await pick).toEqual({ kind: 'cleared' });
    await cleared;
    expect(await storedCount(setup.photoRepo)).toBe(0);
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
  });

  it('does not start a pick that was waiting when the clear came', async () => {
    const setup = await setUp();
    const [one, two] = [await photos(setup.fake, 1), await photos(setup.fake, 2, 900)];
    const held = setup.fake.hold();
    const first = setup.service.add(one);
    const waiting = setup.service.add(two);
    await held.reached;
    void setup.service.clear();
    held.release();

    expect(await first).toEqual({ kind: 'cleared' });
    expect(await waiting).toEqual({ kind: 'cleared' });
    expect(setup.fake.decodes()).toBe(1);
    expect(await storedCount(setup.photoRepo)).toBe(0);
  });

  it('removes a photo and releases it; removing the last drops the draft and its note', async () => {
    const setup = await setUp();
    const added = await setup.service.add(await photos(setup.fake, 2));
    const [first, second] = added.kind === 'added' ? added.photoIds : [];
    await setup.service.update({ note: 'Two plates' });

    expect(await setup.service.remove(first as string)).toEqual([second]);
    expect(await setup.photoRepo.get(first as string)).toBeNull();
    expect(await setup.service.load()).toMatchObject({ photoIds: [second], note: 'Two plates' });

    expect(await setup.service.remove(second as string)).toEqual([]);
    expect(await setup.draftsRepo.loadCapture()).toBeNull();
    expect(await storedCount(setup.photoRepo)).toBe(0);
  });

  it('ignores a photo the draft does not hold', async () => {
    const setup = await setUp();
    const added = await setup.service.add(await photos(setup.fake, 1));
    setup.saveCapture.mockClear();

    expect(await setup.service.remove('nope')).toEqual(
      added.kind === 'added' ? added.photoIds : null,
    );
    expect(setup.saveCapture).not.toHaveBeenCalled();
  });

  it('merges note and switch changes made while a write waits into one write', async () => {
    const setup = await setUp();
    const files = await photos(setup.fake, 2);
    const held = setup.fake.hold();
    const pick = setup.service.add(files);
    await held.reached;

    const typed = [
      setup.service.update({ note: 'R' }),
      setup.service.update({ note: 'Ri' }),
      setup.service.update({ progressive: true }),
      setup.service.update({ note: 'Rice' }),
    ];
    held.release();
    await pick;
    await Promise.all(typed);

    expect(setup.saveCapture).toHaveBeenCalledTimes(2);
    expect(await setup.service.load()).toMatchObject({ note: 'Rice', progressive: true });
  });
});
