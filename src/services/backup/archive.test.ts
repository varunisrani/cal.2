import { describe, expect, it, vi } from 'vitest';
import { bytesOf, storableBlob } from '../../test/blobs';
import {
  BackupArchiveError,
  MAX_PAYLOAD_BYTES,
  MAX_PHOTO_NAME,
  PAYLOAD_ENTRY,
  isSafePhotoName,
  packBackup,
  photoNameOf,
  unpackBackup,
  type BackupArchiveProblem,
} from './archive';
import { ZipError, readZip, writeZip, type ZipEntry, type ZipInput } from './zip';

// The real reader, which a test can stand in for once (S-9: an entry size no test file could have).
vi.mock('./zip', async (importOriginal) => {
  const real = await importOriginal<typeof import('./zip')>();
  return { ...real, readZip: vi.fn(real.readZip) };
});

const MADE_AT = Date.UTC(2026, 9, 27, 9, 30);
const encode = (text: string) => new TextEncoder().encode(text);

const DOCUMENT = {
  kind: 'test-backup',
  rows: [
    { id: '7d1f0c2e-4b8a-4c51-9e3d-2a6b8f0e1c47', name: 'Lentil soup', kcal: 310 },
    { id: 'c0a8e3b4-1f2d-4e6a-8b9c-5d7e3f1a2b60', name: 'Pear', kcal: 95 },
  ],
};

/** The names the plan's Verify column lists, then a few more of each kind. */
const UNSAFE_NAMES = ['../x.jpg', '.hidden.jpg', 'a/b.jpg', `${'n'.repeat(125)}.jpg`, 'x.exe'];

async function problemOf(
  work: Promise<unknown>,
): Promise<{ problem: BackupArchiveProblem; entry?: string }> {
  const error = await work.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(BackupArchiveError);
  const { problem, entry } = error as BackupArchiveError;
  return entry === undefined ? { problem } : { problem, entry };
}

/** A ZIP laid out by hand, for files the backup writer would never make. */
function craft(entries: readonly ZipInput[]): Promise<Blob> {
  return writeZip(entries, { modifiedAt: MADE_AT });
}

const payloadEntry = (): ZipInput => ({
  name: PAYLOAD_ENTRY,
  data: encode(JSON.stringify(DOCUMENT)),
});

describe('isSafePhotoName', () => {
  it('takes plain names with a photo extension, up to 128 characters', () => {
    const plain = [
      'lunch.jpg',
      'DINNER.JPEG',
      'p.png',
      'q.webp',
      'snack_2-b.WebP',
      '3f9a6c1e-8d2b-4f7a-a1c3-9e5b7d2f4a68.jpg',
      `${'n'.repeat(MAX_PHOTO_NAME - 4)}.png`,
    ];
    expect(plain.filter((name) => !isSafePhotoName(name))).toEqual([]);
  });

  it('refuses every other name rather than cleaning it up (R06.9)', () => {
    const refused = [
      ...UNSAFE_NAMES,
      '',
      '.',
      '..',
      '.png',
      '..png',
      'a..b.jpg',
      '../../x.jpg',
      '/x.jpg',
      'a\\b.jpg',
      'D:x.jpg',
      'x.jpg.exe',
      'notes.txt',
      'x.gif',
      'x.heic',
      'png',
      'oats bowl.jpg',
      'crème.jpg',
      '٣.png',
      'x\u0000.jpg',
      `${'n'.repeat(MAX_PHOTO_NAME - 3)}.png`,
    ];
    expect(refused.filter((name) => isSafePhotoName(name))).toEqual([]);
  });
});

describe('photoNameOf', () => {
  it('gives the plain name of an entry directly under photos/, and null for anything else', () => {
    expect(photoNameOf('photos/lunch.jpg')).toBe('lunch.jpg');
    const others = [
      'lunch.jpg',
      'photos/',
      'photos/sub/lunch.jpg',
      'photos//lunch.jpg',
      'Photos/lunch.jpg',
      '/photos/lunch.jpg',
      'photos/../lunch.jpg',
      PAYLOAD_ENTRY,
    ];
    expect(others.map(photoNameOf)).toEqual(others.map(() => null));
  });
});

describe('packBackup and unpackBackup', () => {
  it('writes payload.json first, then three photos by name, and reads them all back', async () => {
    const meal = await storableBlob(3_000, 11);
    const snack = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const drink = await storableBlob(40, 200, 'image/webp');
    const file = await packBackup({
      document: DOCUMENT,
      photos: [
        { name: 'b-meal.jpg', data: meal },
        { name: 'a-snack.png', data: snack },
        { name: 'c-drink.webp', data: drink },
      ],
      madeAt: MADE_AT,
    });

    expect((await readZip(file)).map((entry) => entry.name)).toEqual([
      'payload.json',
      'photos/a-snack.png',
      'photos/b-meal.jpg',
      'photos/c-drink.webp',
    ]);

    const backup = await unpackBackup(file);
    expect(backup.document).toEqual(DOCUMENT);
    expect(backup.documentBytes).toBe(encode(JSON.stringify(DOCUMENT)).length);
    expect(backup.skipped).toEqual([]);
    expect(backup.photos.map((photo) => [photo.name, photo.size, photo.data.type])).toEqual([
      ['a-snack.png', 7, 'image/png'],
      ['b-meal.jpg', 3_000, 'image/jpeg'],
      ['c-drink.webp', 40, 'image/webp'],
    ]);
    expect(await bytesOf(backup.photos[0]!.data)).toEqual(Array.from(snack));
    expect(await bytesOf(backup.photos[1]!.data)).toEqual(await bytesOf(meal));
    expect(await bytesOf(backup.photos[2]!.data)).toEqual(await bytesOf(drink));
  });

  it('round trips two hundred photos byte for byte', async () => {
    const photos = Array.from({ length: 200 }, (_, index) => ({
      name: `photo-${String(index).padStart(3, '0')}.jpg`,
      data: Uint8Array.from({ length: 1 + ((index * 389) % 2_000) }, (_, at) => (at + index) % 256),
    }));
    const backup = await unpackBackup(
      await packBackup({ document: DOCUMENT, photos, madeAt: MADE_AT }),
    );
    expect(backup.photos.map((photo) => [photo.name, photo.size])).toEqual(
      photos.map((photo) => [photo.name, photo.data.length]),
    );
    const read = await Promise.all(backup.photos.map((photo) => bytesOf(photo.data)));
    expect(read).toEqual(photos.map((photo) => Array.from(photo.data)));
  });

  it('writes a backup without photos as payload.json alone', async () => {
    const backup = await unpackBackup(
      await packBackup({ document: DOCUMENT, photos: [], madeAt: MADE_AT }),
    );
    expect(backup.document).toEqual(DOCUMENT);
    expect(backup.photos).toEqual([]);
  });

  it.each(
    UNSAFE_NAMES.map((name) => [name.length > 40 ? `${name.length} characters` : name, name]),
  )('refuses to write a photo named %s, reading nothing (R06.9)', async (_label, name) => {
    const arrayBuffer = vi.fn();
    const photo = { size: 3, type: 'image/jpeg', arrayBuffer } as unknown as Blob;
    expect(
      await problemOf(
        packBackup({
          document: DOCUMENT,
          photos: [
            { name: 'fine.jpg', data: photo },
            { name, data: photo },
          ],
          madeAt: MADE_AT,
        }),
      ),
    ).toEqual({ problem: 'unsafeName', entry: name });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('refuses to write two photos under one name', async () => {
    const data = encode('x');
    expect(
      await problemOf(
        packBackup({
          document: DOCUMENT,
          photos: [
            { name: 'twice.jpg', data },
            { name: 'twice.jpg', data },
          ],
          madeAt: MADE_AT,
        }),
      ),
    ).toEqual({ problem: 'duplicateName', entry: 'twice.jpg' });
  });

  it('refuses a document that has no JSON form', async () => {
    await expect(packBackup({ document: undefined, photos: [], madeAt: MADE_AT })).rejects.toThrow(
      TypeError,
    );
  });

  it('skips the same names when reading, with every other stray entry, and lists them (R06.9)', async () => {
    const stray = [
      ...UNSAFE_NAMES.map((name) => `photos/${name}`),
      '../x.jpg',
      'x.jpg',
      '/photos/x.jpg',
      'photos//x.jpg',
      'photos/..\\x.jpg',
      'photos/',
      'Photos/x.jpg',
      'other/x.jpg',
    ];
    const file = await craft([
      payloadEntry(),
      ...stray.map((name) => ({ name, data: encode('should never be restored') })),
      { name: 'photos/kept.jpg', data: encode('kept') },
    ]);

    const backup = await unpackBackup(file);
    expect(backup.photos.map((photo) => photo.name)).toEqual(['kept.jpg']);
    expect(await bytesOf(backup.photos[0]!.data)).toEqual(Array.from(encode('kept')));
    expect(backup.skipped).toEqual(stray);
    expect(backup.document).toEqual(DOCUMENT);
  });

  it('refuses a file that holds a photo or the payload twice', async () => {
    const photoTwice = await craft([
      payloadEntry(),
      { name: 'photos/one.jpg', data: encode('first') },
      { name: 'photos/one.jpg', data: encode('second') },
    ]);
    expect(await problemOf(unpackBackup(photoTwice))).toEqual({
      problem: 'duplicateName',
      entry: 'photos/one.jpg',
    });
    const payloadTwice = await craft([payloadEntry(), payloadEntry()]);
    expect(await problemOf(unpackBackup(payloadTwice))).toEqual({
      problem: 'duplicateName',
      entry: PAYLOAD_ENTRY,
    });
  });

  it('refuses a file without payload.json, or with one that is not UTF-8 JSON', async () => {
    const noPayload = await craft([{ name: 'photos/one.jpg', data: encode('x') }]);
    expect(await problemOf(unpackBackup(noPayload))).toEqual({ problem: 'noPayload' });

    for (const data of [encode('{"cut short":'), Uint8Array.from([0x22, 0xff, 0x22])]) {
      const badPayload = await craft([{ name: PAYLOAD_ENTRY, data }]);
      expect(await problemOf(unpackBackup(badPayload))).toEqual({
        problem: 'badPayload',
        entry: PAYLOAD_ENTRY,
      });
    }
  });

  it('refuses a payload.json declared over 256 MiB before reading it (S-9)', async () => {
    const read = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const declared = (size: number, data: Blob): ZipEntry => ({
      name: PAYLOAD_ENTRY,
      size,
      crc32: 0,
      data,
    });
    const huge = { size: MAX_PAYLOAD_BYTES + 1, type: '', arrayBuffer: read } as unknown as Blob;
    vi.mocked(readZip).mockResolvedValueOnce([declared(MAX_PAYLOAD_BYTES + 1, huge)]);

    expect(await problemOf(unpackBackup(new Blob()))).toEqual({
      problem: 'payloadTooLarge',
      entry: PAYLOAD_ENTRY,
    });
    expect(read).not.toHaveBeenCalled();
    expect(MAX_PAYLOAD_BYTES).toBe(256 * 1024 * 1024);

    // At the limit the document is read as usual.
    const text = new Blob([encode(JSON.stringify(DOCUMENT))]);
    vi.mocked(readZip).mockResolvedValueOnce([declared(MAX_PAYLOAD_BYTES, text)]);
    await expect(unpackBackup(new Blob())).resolves.toMatchObject({
      document: DOCUMENT,
      documentBytes: MAX_PAYLOAD_BYTES,
    });
  });

  it('fails the CRC of a file with one flipped byte before handing out anything', async () => {
    const file = await packBackup({
      document: DOCUMENT,
      photos: [{ name: 'only.jpg', data: encode('photo bytes') }],
      madeAt: MADE_AT,
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Past the payload entry (header, name, JSON) and the photo's header and name.
    const payloadBytes = encode(JSON.stringify(DOCUMENT)).length;
    const photoAt = 30 + PAYLOAD_ENTRY.length + payloadBytes + 30 + 'photos/only.jpg'.length + 2;
    bytes[photoAt] = bytes[photoAt]! ^ 0xff;

    const error = await unpackBackup(new Blob([bytes])).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ZipError);
    expect(error).toMatchObject({ problem: 'checksum', entry: 'photos/only.jpg' });
  });
});
