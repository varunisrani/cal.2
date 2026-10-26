import { describe, expect, it } from 'vitest';
import { createPhotoRepo } from '../data/repos/photoRepo';
import { withIdSequence } from '../lib/ids';
import { bytesOf } from '../test/blobs';
import { openTestDb } from '../test/db';
import { createFakeCodec, type FakeCodec } from '../test/fakeImageCodec';
import {
  PREVIEW_EDGE,
  STORED_EDGE,
  STORED_QUALITY,
  THUMB_EDGE,
  THUMB_QUALITY,
  VIEWER_EDGE,
  createPhotoService,
} from './photos';

async function setUp(fake: FakeCodec = createFakeCodec()) {
  const { db } = await openTestDb();
  const photoRepo = createPhotoRepo(db, { newId: withIdSequence('photo') });
  const service = createPhotoService({ photoRepo, codec: fake.codec });
  return { db, photoRepo, service, fake };
}

type Setup = Awaited<ReturnType<typeof setUp>>;

/** Stores `file` and returns its row, failing the test when it was not stored. */
async function storeRow({ service, photoRepo }: Setup, file: Blob) {
  const result = await service.store(file);
  if (result.kind !== 'stored') throw new Error(`not stored: ${result.kind}`);
  const row = await photoRepo.get(result.id);
  if (!row) throw new Error('stored row missing');
  return row;
}

/** The encodes made at one edge. */
const encodesAt = (fake: FakeCodec, maxEdge: number) =>
  fake.encodes.filter((encode) => encode.maxEdge === maxEdge);

describe('store: one rule for new photos (R02.19)', () => {
  it('stores a 4 000 px photo as a 2 048 px JPEG at 0.80 when that copy is smaller', async () => {
    const setup = await setUp();
    const { fake } = setup;
    const file = await fake.photo(4000, 3000, 900_000);

    const row = await storeRow(setup, file);

    expect(encodesAt(fake, STORED_EDGE)).toEqual([
      { width: 2048, height: 1536, maxEdge: 2048, quality: 0.8 },
    ]);
    expect(await fake.sizeOf(row.blob)).toEqual({ width: 2048, height: 1536 });
    expect(row.blob.type).toBe('image/jpeg');
    expect(row.blob.size).toBeLessThan(file.size);
    expect({ width: row.width, height: row.height, bytes: row.bytes }).toEqual({
      width: 2048,
      height: 1536,
      bytes: row.blob.size,
    });
  });

  it('keeps the original bytes of a large photo whose 2 048 px copy is not smaller', async () => {
    const setup = await setUp();
    const { fake } = setup;
    // Already well compressed: the 2 048 px copy at 0.80 would take 125 829 bytes.
    const file = await fake.photo(4000, 3000, 100_000);

    const row = await storeRow(setup, file);

    expect(encodesAt(fake, STORED_EDGE)).toHaveLength(1);
    expect(await bytesOf(row.blob)).toEqual(await bytesOf(file));
    expect({ width: row.width, height: row.height }).toEqual({ width: 4000, height: 3000 });
  });

  it('leaves a 1 000 px photo untouched, and one exactly at 2 048 px too', async () => {
    const setup = await setUp();
    const { fake } = setup;
    const small = await fake.photo(1000, 750, 200_000);
    const atEdge = await fake.photo(2048, 1536, 900_000);

    const smallRow = await storeRow(setup, small);
    const edgeRow = await storeRow(setup, atEdge);

    expect(encodesAt(fake, STORED_EDGE)).toEqual([]);
    expect(await bytesOf(smallRow.blob)).toEqual(await bytesOf(small));
    expect(await bytesOf(edgeRow.blob)).toEqual(await bytesOf(atEdge));
    expect({ width: smallRow.width, height: smallRow.height }).toEqual({
      width: 1000,
      height: 750,
    });
  });

  it('writes a 320 px JPEG thumbnail at 0.76 from the upright picture', async () => {
    const setup = await setUp();
    const { fake } = setup;
    // A phone photo held upright: the decoder hands over the turned (portrait) size.
    const file = await fake.photo(3000, 4000, 900_000);

    const row = await storeRow(setup, file);

    expect(encodesAt(fake, THUMB_EDGE)).toEqual([
      { width: 240, height: 320, maxEdge: 320, quality: 0.76 },
    ]);
    expect(row.thumb).toBeDefined();
    expect(await fake.sizeOf(row.thumb as Blob)).toEqual({ width: 240, height: 320 });
    expect({ width: row.width, height: row.height }).toEqual({ width: 1536, height: 2048 });
  });

  it('gives a small photo a thumbnail too', async () => {
    const setup = await setUp();
    const row = await storeRow(setup, await setup.fake.photo(800, 600, 50_000));
    expect(await setup.fake.sizeOf(row.thumb as Blob)).toEqual({ width: 320, height: 240 });
  });

  it('refuses a photo the browser cannot decode, as HEIC outside Safari, and writes nothing (ACC-D28-2)', async () => {
    const { service, photoRepo, fake } = await setUp();

    const result = await service.store(await fake.undecodable());

    expect(result).toEqual({ kind: 'unsupportedImage' });
    expect(await photoRepo.usage()).toEqual({ count: 0, photoBytes: 0, thumbBytes: 0 });
    expect(fake.encodes).toEqual([]);
  });

  it('keeps the original when the 2 048 px copy cannot be encoded', async () => {
    const setup = await setUp();
    const { fake } = setup;
    fake.failEncodesAt(STORED_EDGE);
    const file = await fake.photo(4000, 3000, 900_000);

    const row = await storeRow(setup, file);

    expect(await bytesOf(row.blob)).toEqual(await bytesOf(file));
    expect(row.thumb).toBeDefined();
  });

  it('stores the photo without a thumbnail when none can be encoded, and makes it on first use', async () => {
    const failing = createFakeCodec();
    failing.failEncodesAt(THUMB_EDGE);
    const setup = await setUp(failing);
    const row = await storeRow(setup, await failing.photo(1200, 900, 300_000));
    expect(row.thumb).toBeUndefined();

    const working = createFakeCodec();
    const later = createPhotoService({ photoRepo: setup.photoRepo, codec: working.codec });
    const thumb = await later.thumbnail(row.id);

    expect(await working.sizeOf(thumb as Blob)).toEqual({ width: 320, height: 240 });
    expect(await setup.photoRepo.getThumb(row.id)).not.toBeNull();
  });

  it('releases every picture it decodes', async () => {
    const setup = await setUp();
    const { fake, service } = setup;
    await service.store(await fake.photo(4000, 3000, 900_000));
    await service.store(await fake.photo(900, 600, 40_000));
    fake.failEncodesAt(THUMB_EDGE);
    await service.store(await fake.photo(900, 600, 40_000));

    expect(fake.decodes()).toBe(3);
    expect(fake.openPictures()).toBe(0);
  });

  it('uses the sizes the plan names', () => {
    expect({ STORED_EDGE, STORED_QUALITY, THUMB_EDGE, THUMB_QUALITY }).toEqual({
      STORED_EDGE: 2048,
      STORED_QUALITY: 0.8,
      THUMB_EDGE: 320,
      THUMB_QUALITY: 0.76,
    });
    expect({ PREVIEW_EDGE, VIEWER_EDGE }).toEqual({ PREVIEW_EDGE: 720, VIEWER_EDGE: 2048 });
  });
});

describe('stored photos are never rewritten (R02.19)', () => {
  /** A photo written as it was, the way a backup restore writes it: no cap, no thumbnail. */
  async function restoredPhoto(setup: Setup, width: number, height: number, bytes: number) {
    const blob = await setup.fake.photo(width, height, bytes);
    const id = await setup.photoRepo.put(blob, { width, height });
    return { id, blob };
  }

  it('makes a missing thumbnail for a restored 4 000 px photo and leaves its bytes as they were', async () => {
    const setup = await setUp();
    const { id, blob } = await restoredPhoto(setup, 4000, 3000, 900_000);

    const thumb = await setup.service.thumbnail(id);

    expect(await setup.fake.sizeOf(thumb as Blob)).toEqual({ width: 320, height: 240 });
    const row = await setup.photoRepo.get(id);
    expect(await bytesOf(row?.blob as Blob)).toEqual(await bytesOf(blob));
    expect({ width: row?.width, height: row?.height }).toEqual({ width: 4000, height: 3000 });
    expect(encodesAt(setup.fake, STORED_EDGE)).toEqual([]);
    expect(await setup.photoRepo.getThumb(id)).not.toBeNull();
  });

  it('hands back a stored thumbnail without decoding anything', async () => {
    const setup = await setUp();
    const row = await storeRow(setup, await setup.fake.photo(1200, 900, 300_000));
    const decodes = setup.fake.decodes();

    const thumb = await setup.service.thumbnail(row.id);

    expect(await bytesOf(thumb as Blob)).toEqual(await bytesOf(row.thumb as Blob));
    expect(setup.fake.decodes()).toBe(decodes);
  });

  it('has no thumbnail for a missing photo or one that does not decode', async () => {
    const setup = await setUp();
    const broken = await setup.photoRepo.put(await setup.fake.undecodable(), {
      width: 0,
      height: 0,
    });

    expect(await setup.service.thumbnail('nope')).toBeNull();
    expect(await setup.service.thumbnail(broken)).toBeNull();
    expect(await setup.photoRepo.getThumb(broken)).toBeNull();
  });
});

describe('display copies', () => {
  it('previews at 720 px and gives the viewer at most 2 048 px, leaving the row as it was', async () => {
    const setup = await setUp();
    const blob = await setup.fake.photo(4000, 3000, 100_000);
    const id = await setup.photoRepo.put(blob, { width: 4000, height: 3000 });

    const preview = await setup.service.preview(id);
    const viewer = await setup.service.viewer(id);

    expect(await setup.fake.sizeOf(preview as Blob)).toEqual({ width: 720, height: 540 });
    expect(await setup.fake.sizeOf(viewer as Blob)).toEqual({ width: 2048, height: 1536 });
    const row = await setup.photoRepo.get(id);
    expect(await bytesOf(row?.blob as Blob)).toEqual(await bytesOf(blob));
    expect(setup.fake.openPictures()).toBe(0);
  });

  it('shows a photo already within the size as it is stored, without decoding it', async () => {
    const setup = await setUp();
    const row = await storeRow(setup, await setup.fake.photo(600, 400, 20_000));
    const decodes = setup.fake.decodes();

    const preview = await setup.service.preview(row.id);
    const viewer = await setup.service.viewer(row.id);

    expect(await bytesOf(preview as Blob)).toEqual(await bytesOf(row.blob));
    expect(await bytesOf(viewer as Blob)).toEqual(await bytesOf(row.blob));
    expect(setup.fake.decodes()).toBe(decodes);
  });

  it('gives the viewer a stored 2 048 px photo as it is, and previews it at 720 px', async () => {
    const setup = await setUp();
    const row = await storeRow(setup, await setup.fake.photo(4000, 3000, 900_000));

    expect(await bytesOf((await setup.service.viewer(row.id)) as Blob)).toEqual(
      await bytesOf(row.blob),
    );
    expect(await setup.fake.sizeOf((await setup.service.preview(row.id)) as Blob)).toEqual({
      width: 720,
      height: 540,
    });
  });

  it('has nothing to show for a missing photo or one that does not decode', async () => {
    const setup = await setUp();
    const broken = await setup.photoRepo.put(await setup.fake.undecodable(), {
      width: 0,
      height: 0,
    });

    expect(await setup.service.preview('nope')).toBeNull();
    expect(await setup.service.viewer('nope')).toBeNull();
    expect(await setup.service.preview(broken)).toBeNull();
    expect(await setup.service.viewer(broken)).toBeNull();
  });
});
