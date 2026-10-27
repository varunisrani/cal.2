import { describe, expect, it, vi } from 'vitest';
import { bytesOf, storableBlob } from '../../test/blobs';
import {
  MAX_ENTRIES,
  ZIP_TYPE,
  ZipError,
  crc32,
  readZip,
  writeZip,
  type ZipEntry,
  type ZipInput,
  type ZipProblem,
} from './zip';

// Times are local: tests run in America/New_York (vite.config.ts).
const MADE_AT = new Date(2026, 0, 2, 3, 4, 6).getTime();

const encode = (text: string) => new TextEncoder().encode(text);

async function bytesOfZip(entries: readonly ZipInput[], modifiedAt = MADE_AT): Promise<Uint8Array> {
  return new Uint8Array(await (await writeZip(entries, { modifiedAt })).arrayBuffer());
}

function fields(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Where the end record and the directory sit, in an archive without a comment. */
function layout(bytes: Uint8Array): { end: number; directory: number; count: number } {
  const end = bytes.length - 22;
  const view = fields(bytes);
  return { end, directory: view.getUint32(end + 16, true), count: view.getUint16(end + 10, true) };
}

async function problemOf(read: Promise<unknown>): Promise<{ problem: ZipProblem; entry?: string }> {
  const error = await read.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ZipError);
  const { problem, entry } = error as ZipError;
  return entry === undefined ? { problem } : { problem, entry };
}

function readBytes(bytes: Uint8Array): Promise<ZipEntry[]> {
  return readZip(new Blob([Uint8Array.from(bytes)]));
}

const ONE_ENTRY: ZipInput[] = [{ name: 'a.jpg', data: encode('hello, archive') }];

// A two-entry archive written by Info-ZIP 3.0 (`zip -0`), with its own extra fields.
const INFO_ZIP_ARCHIVE =
  'UEsDBAoAAAAAAIMYIly2iFbyGwAAABsAAAAMABwAcGF5bG9hZC5qc29uVVQJAAOlNVdppTVXaXV4CwABBAAAAAAEAAAAAHsibm90ZSI6Im1hZGUgYnkgSW5mby1aSVAifVBLAwQKAAAAAACDGCJcwkEkNQMAAAADAAAADwAcAHBob3Rvcy9tZWFsLmpwZ1VUCQADpTVXaaU1V2l1eAsAAQQAAAAABAAAAABhYmNQSwECHgMKAAAAAACDGCJctohW8hsAAAAbAAAADAAYAAAAAAAAAAAApIEAAAAAcGF5bG9hZC5qc29uVVQFAAOlNVdpdXgLAAEEAAAAAAQAAAAAUEsBAh4DCgAAAAAAgxgiXMJBJDUDAAAAAwAAAA8AGAAAAAAAAAAAAKSBYQAAAHBob3Rvcy9tZWFsLmpwZ1VUBQADpTVXaXV4CwABBAAAAAAEAAAAAFBLBQYAAAAAAgACAKcAAACtAAAAAAA=';

describe('crc32', () => {
  it('gives the standard check value for "123456789"', () => {
    expect(crc32(encode('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for no bytes and continues over pieces', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    const whole = encode('stored entries, one piece at a time');
    const first = crc32(whole.subarray(0, 11));
    expect(crc32(whole.subarray(11), first)).toBe(crc32(whole));
  });
});

describe('writeZip and readZip', () => {
  it('reads back every entry with its name, size, CRC and bytes, in the order written', async () => {
    const photo = await storableBlob(5_000, 7);
    const archive = await writeZip(
      [
        { name: 'payload.json', data: encode('{"rows":[1,2,3]}') },
        { name: 'photos/one.jpg', data: photo },
        { name: 'photos/empty.png', data: new Uint8Array(0) },
      ],
      { modifiedAt: MADE_AT },
    );
    expect(archive.type).toBe(ZIP_TYPE);

    const entries = await readZip(archive);
    expect(entries.map((entry) => [entry.name, entry.size])).toEqual([
      ['payload.json', 16],
      ['photos/one.jpg', 5_000],
      ['photos/empty.png', 0],
    ]);
    expect(new TextDecoder().decode(await entries[0]!.data.arrayBuffer())).toBe('{"rows":[1,2,3]}');
    expect(await bytesOf(entries[1]!.data)).toEqual(await bytesOf(photo));
    expect(entries[1]!.crc32).toBe(crc32(Uint8Array.from(await bytesOf(photo))));
    expect(entries[2]!.crc32).toBe(0);
    expect(await bytesOf(entries[2]!.data)).toEqual([]);
  });

  it('reads the entries to write one at a time', async () => {
    let reading = 0;
    let most = 0;
    const photo = (index: number) =>
      ({
        size: 64,
        type: 'image/jpeg',
        arrayBuffer: async () => {
          reading += 1;
          most = Math.max(most, reading);
          await Promise.resolve();
          reading -= 1;
          return new Uint8Array(64).fill(index).buffer;
        },
      }) as unknown as Blob;
    const entries = Array.from({ length: 20 }, (_, index) => ({
      name: `photos/${index}.jpg`,
      data: photo(index),
    }));
    expect(await readZip(await writeZip(entries, { modifiedAt: MADE_AT }))).toHaveLength(20);
    expect(most).toBe(1);
  });

  it('handles an archive larger than the pieces it is written and checked in', async () => {
    // Over 8 MiB: more than one output piece of the writer and eight CRC pieces of the reader.
    const big = new Uint8Array(8 * 1024 * 1024 + 5);
    for (let index = 0; index < big.length; index++) big[index] = (index * 7) % 251;
    const bytes = await bytesOfZip([
      { name: 'before.jpg', data: encode('small') },
      { name: 'big.jpg', data: big },
      { name: 'after.jpg', data: encode('small too') },
    ]);
    const entries = await readBytes(bytes);
    expect(entries.map((entry) => entry.size)).toEqual([5, big.length, 9]);
    expect(entries[1]!.crc32).toBe(crc32(big));
    expect(new TextDecoder().decode(await entries[2]!.data.arrayBuffer())).toBe('small too');

    const flipped = Uint8Array.from(bytes);
    const deep = 30 + 10 + 5 + 30 + 7 + 7 * 1024 * 1024 + 123;
    flipped[deep] = flipped[deep]! ^ 0x01;
    expect(await problemOf(readBytes(flipped))).toEqual({ problem: 'checksum', entry: 'big.jpg' });
  });

  it('writes local headers, a central directory and an end record as the format describes', async () => {
    const data = encode('hello, archive');
    const bytes = await bytesOfZip([{ name: 'a.jpg', data }]);
    const view = fields(bytes);
    // Local header: signature, version 1.0, no flags, stored, DOS time and date, CRC, sizes.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(4, true)).toBe(10);
    expect(view.getUint16(6, true)).toBe(0);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint16(10, true)).toBe((3 << 11) | (4 << 5) | 3);
    expect(view.getUint16(12, true)).toBe((46 << 9) | (1 << 5) | 2);
    expect(view.getUint32(14, true)).toBe(crc32(data));
    expect(view.getUint32(18, true)).toBe(data.length);
    expect(view.getUint32(22, true)).toBe(data.length);
    expect(view.getUint16(26, true)).toBe(5);
    expect(view.getUint16(28, true)).toBe(0);
    expect(new TextDecoder().decode(bytes.subarray(30, 35))).toBe('a.jpg');
    expect(Array.from(bytes.subarray(35, 35 + data.length))).toEqual(Array.from(data));

    // Central record right after the data, pointing back at the local header.
    const { end, directory, count } = layout(bytes);
    expect(directory).toBe(35 + data.length);
    expect(view.getUint32(directory, true)).toBe(0x02014b50);
    expect(view.getUint16(directory + 10, true)).toBe(0);
    expect(view.getUint32(directory + 16, true)).toBe(crc32(data));
    expect(view.getUint32(directory + 42, true)).toBe(0);
    // End record: one disk, one record, the directory's size and offset, no comment.
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(count).toBe(1);
    expect(view.getUint16(end + 8, true)).toBe(1);
    expect(view.getUint32(end + 12, true)).toBe(end - directory);
    expect(view.getUint16(end + 20, true)).toBe(0);
  });

  it('marks a name that is not ASCII as UTF-8 and reads it back', async () => {
    const bytes = await bytesOfZip([{ name: 'notes/méal.txt', data: encode('x') }]);
    expect(fields(bytes).getUint16(6, true) & (1 << 11)).not.toBe(0);
    const [entry] = await readBytes(bytes);
    expect(entry!.name).toBe('notes/méal.txt');
  });

  it('stamps a time before 1980 as the first day ZIP can hold', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY, new Date(1970, 0, 1).getTime());
    expect(fields(bytes).getUint16(10, true)).toBe(0);
    expect(fields(bytes).getUint16(12, true)).toBe((1 << 5) | 1);
  });

  it('writes an archive with no entries as a lone end record, and reads it as empty', async () => {
    const archive = await writeZip([], { modifiedAt: MADE_AT });
    expect(archive.size).toBe(22);
    expect(await readZip(archive)).toEqual([]);
  });

  it('reads an archive written by Info-ZIP, extra fields and all', async () => {
    const bytes = Uint8Array.from(atob(INFO_ZIP_ARCHIVE), (char) => char.charCodeAt(0));
    const entries = await readZip(new Blob([bytes]));
    expect(entries.map((entry) => entry.name)).toEqual(['payload.json', 'photos/meal.jpg']);
    expect(new TextDecoder().decode(await entries[1]!.data.arrayBuffer())).toBe('abc');
  });

  it('reads an archive with a comment after the end record', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    const comment = encode('kept for later');
    const withComment = new Uint8Array(bytes.length + comment.length);
    withComment.set(bytes);
    withComment.set(comment, bytes.length);
    fields(withComment).setUint16(bytes.length - 2, comment.length, true);
    const entries = await readBytes(withComment);
    expect(entries.map((entry) => entry.name)).toEqual(['a.jpg']);
  });
});

describe('readZip refuses a damaged or unsupported file', () => {
  it('fails the CRC when one byte of an entry is flipped', async () => {
    const bytes = await bytesOfZip([
      { name: 'first.jpg', data: encode('left alone') },
      { name: 'second.jpg', data: encode('one byte flips') },
    ]);
    // The second entry's data: after the first entry (30 + 9 + 10) and its own header (30 + 10).
    const flipped = Uint8Array.from(bytes);
    const at = 30 + 9 + 10 + 30 + 10 + 3;
    flipped[at] = flipped[at]! ^ 0xff;
    expect(await problemOf(readBytes(flipped))).toEqual({
      problem: 'checksum',
      entry: 'second.jpg',
    });
  });

  it('says a file that is not a ZIP, or has lost its end, is not a ZIP', async () => {
    expect(await problemOf(readZip(new Blob([])))).toEqual({ problem: 'notZip' });
    expect(await problemOf(readBytes(encode('{"not":"a zip at all, just some text"}')))).toEqual({
      problem: 'notZip',
    });
    const bytes = await bytesOfZip(ONE_ENTRY);
    expect(await problemOf(readBytes(bytes.subarray(0, bytes.length - 5)))).toEqual({
      problem: 'notZip',
    });
  });

  it('says a file with bytes missing from the middle is damaged', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    const shorter = new Uint8Array(bytes.length - 3);
    shorter.set(bytes.subarray(0, 40));
    shorter.set(bytes.subarray(43), 40);
    expect(await problemOf(readBytes(shorter))).toEqual({ problem: 'damaged' });
  });

  it('refuses a compressed entry, whether the directory or the local header says so', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    const { directory } = layout(bytes);
    const inDirectory = Uint8Array.from(bytes);
    fields(inDirectory).setUint16(directory + 10, 8, true);
    expect(await problemOf(readBytes(inDirectory))).toEqual({
      problem: 'compressed',
      entry: 'a.jpg',
    });
    const inLocalHeader = Uint8Array.from(bytes);
    fields(inLocalHeader).setUint16(8, 8, true);
    expect(await problemOf(readBytes(inLocalHeader))).toEqual({
      problem: 'compressed',
      entry: 'a.jpg',
    });
  });

  it('refuses an encrypted entry', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    fields(bytes).setUint16(layout(bytes).directory + 8, 1, true);
    expect(await problemOf(readBytes(bytes))).toEqual({ problem: 'encrypted', entry: 'a.jpg' });
  });

  it('refuses ZIP64: a full entry count, a 32-bit size at its limit, or a ZIP64 locator', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    const { end, directory } = layout(bytes);

    const fullCount = Uint8Array.from(bytes);
    fields(fullCount).setUint16(end + 8, 0xffff, true);
    fields(fullCount).setUint16(end + 10, 0xffff, true);
    expect(await problemOf(readBytes(fullCount))).toEqual({ problem: 'zip64' });

    const fullSize = Uint8Array.from(bytes);
    fields(fullSize).setUint32(directory + 20, 0xffffffff, true);
    fields(fullSize).setUint32(directory + 24, 0xffffffff, true);
    expect(await problemOf(readBytes(fullSize))).toEqual({ problem: 'zip64', entry: 'a.jpg' });

    const withLocator = new Uint8Array(bytes.length + 20);
    withLocator.set(bytes.subarray(0, end));
    fields(withLocator).setUint32(end, 0x07064b50, true);
    withLocator.set(bytes.subarray(end), end + 20);
    expect(await problemOf(readBytes(withLocator))).toEqual({ problem: 'zip64' });
  });

  it('refuses an archive split over several disks', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    fields(bytes).setUint16(layout(bytes).end + 4, 1, true);
    expect(await problemOf(readBytes(bytes))).toEqual({ problem: 'split' });
  });

  it('refuses a local header that names a different entry than the directory', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    bytes[30] = 'b'.charCodeAt(0);
    expect(await problemOf(readBytes(bytes))).toEqual({ problem: 'damaged', entry: 'a.jpg' });
  });

  it('refuses a directory that points two records at the same bytes', async () => {
    const bytes = await bytesOfZip(ONE_ENTRY);
    const { end, directory } = layout(bytes);
    const record = bytes.subarray(directory, end);
    const doubled = new Uint8Array(bytes.length + record.length);
    doubled.set(bytes.subarray(0, end));
    doubled.set(record, end);
    doubled.set(bytes.subarray(end), end + record.length);
    const view = fields(doubled);
    const newEnd = end + record.length;
    view.setUint16(newEnd + 8, 2, true);
    view.setUint16(newEnd + 10, 2, true);
    view.setUint32(newEnd + 12, 2 * record.length, true);
    expect(await problemOf(readBytes(doubled))).toEqual({ problem: 'damaged', entry: 'a.jpg' });
  });
});

describe('writeZip refuses what a ZIP without ZIP64 cannot hold', () => {
  it('refuses more entries than it can count, before reading any', async () => {
    const data = new Uint8Array(0);
    const entries = Array.from({ length: MAX_ENTRIES + 1 }, (_, index) => ({
      name: `photos/${index}.jpg`,
      data,
    }));
    expect(await problemOf(writeZip(entries, { modifiedAt: MADE_AT }))).toEqual({
      problem: 'tooMany',
    });
  });

  it('refuses an entry of 4 GiB from its size, without reading it', async () => {
    const arrayBuffer = vi.fn();
    // Only the size is looked at before the limit is checked.
    const huge = { size: 2 ** 32, type: '', arrayBuffer } as unknown as Blob;
    expect(
      await problemOf(writeZip([{ name: 'huge.jpg', data: huge }], { modifiedAt: MADE_AT })),
    ).toEqual({ problem: 'tooLarge', entry: 'huge.jpg' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('fails when an entry reads back shorter than its size', async () => {
    const shrunk = {
      size: 10,
      type: 'image/jpeg',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(9)),
    } as unknown as Blob;
    expect(
      await problemOf(writeZip([{ name: 'gone.jpg', data: shrunk }], { modifiedAt: MADE_AT })),
    ).toEqual({ problem: 'changed', entry: 'gone.jpg' });
  });

  it('passes on the error of a photo that can no longer be read', async () => {
    const lost = new Error('NotReadableError');
    const unreadable = {
      size: 4,
      type: 'image/jpeg',
      arrayBuffer: () => Promise.reject(lost),
    } as unknown as Blob;
    await expect(
      writeZip([{ name: 'lost.jpg', data: unreadable }], { modifiedAt: MADE_AT }),
    ).rejects.toBe(lost);
  });
});
