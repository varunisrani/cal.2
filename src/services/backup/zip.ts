// A small ZIP codec for backup files (Proposed D-16.52), written from the public format description
// (PKWARE APPNOTE): every entry is stored as it is, with no compression, because the photos it
// carries are already JPEG. The writer puts a local header and the bytes of each entry in order,
// then one central-directory record per entry, then the end record. The reader starts from the end
// record, walks the central directory, checks each local header against its record and reads every
// entry to the end, so a damaged file fails its CRC here, before anything uses it. It refuses what
// this codec never writes: compressed, encrypted, ZIP64 and split archives.
//
// Pure: Blobs and bytes in, Blobs and bytes out. Data is read one entry (or one chunk) at a time
// and the output is folded into a Blob every few MiB, so a backup never sits in one array.

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_RECORD_BYTES = 22;
const ZIP64_LOCATOR_BYTES = 20;
const MAX_COMMENT_BYTES = 0xffff;

/** 1.0: enough for stored entries. */
const VERSION_NEEDED = 10;
/** Format 6.3 (the UTF-8 name flag), MS-DOS file attributes (host 0). */
const VERSION_MADE_BY = 63;

const FLAG_ENCRYPTED = 1 << 0;
const FLAG_DATA_DESCRIPTOR = 1 << 3;
const FLAG_STRONG_ENCRYPTION = 1 << 6;
const FLAG_UTF8_NAME = 1 << 11;
const FLAG_MASKED_HEADERS = 1 << 13;
const ENCRYPTION_FLAGS = FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION | FLAG_MASKED_HEADERS;

const METHOD_STORED = 0;
const ZIP64_EXTRA_ID = 0x0001;

/** The all-ones value of a 16-bit or 32-bit field means "see the ZIP64 record". */
const ZIP64_MARK_16 = 0xffff;
const ZIP64_MARK_32 = 0xffffffff;

/** The most entries an archive without ZIP64 can count. */
export const MAX_ENTRIES = ZIP64_MARK_16 - 1;
/** The largest size or offset a 32-bit field holds without ZIP64 (all ones means "see ZIP64"). */
export const MAX_OFFSET = ZIP64_MARK_32 - 1;
const MAX_NAME_BYTES = 0xffff;

/** The writer folds what it has into one Blob after this many bytes. */
const FOLD_BYTES = 8 * 1024 * 1024;
/** The reader checks CRCs in pieces of this size. */
const READ_CHUNK_BYTES = 1024 * 1024;

export const ZIP_TYPE = 'application/zip';

// ---- Errors -----------------------------------------------------------------------------------

/** Why a ZIP could not be written or read. */
export type ZipProblem =
  /** No end record: the file is not a ZIP at all. */
  | 'notZip'
  /** The structure does not hold together (cut short, records that disagree or overlap). */
  | 'damaged'
  /** An entry's bytes do not match its CRC-32. */
  | 'checksum'
  | 'compressed'
  | 'encrypted'
  | 'zip64'
  /** Spread over several disks (a split archive). */
  | 'split'
  /** Writing: more entries than an archive without ZIP64 can count. */
  | 'tooMany'
  /** Writing: an entry, an offset or the directory would reach 4 GiB. */
  | 'tooLarge'
  /** Writing: a name longer than 65 535 UTF-8 bytes. */
  | 'nameTooLong'
  /** Writing: an entry's bytes did not match its size when they were read. */
  | 'changed';

const PROBLEM_TEXT: Readonly<Record<ZipProblem, string>> = {
  notZip: 'not a ZIP file',
  damaged: 'the ZIP file is damaged',
  checksum: 'an entry does not match its checksum',
  compressed: 'compressed entries are not supported',
  encrypted: 'encrypted entries are not supported',
  zip64: 'ZIP64 archives are not supported',
  split: 'split archives are not supported',
  tooMany: 'too many entries for a ZIP without ZIP64',
  tooLarge: 'too large for a ZIP without ZIP64',
  nameTooLong: 'an entry name is too long',
  changed: 'an entry changed while it was written',
};

export class ZipError extends Error {
  override readonly name = 'ZipError';

  constructor(
    readonly problem: ZipProblem,
    /** The entry concerned, when there is one. */
    readonly entry?: string,
  ) {
    super(entry === undefined ? PROBLEM_TEXT[problem] : `${PROBLEM_TEXT[problem]}: ${entry}`);
  }
}

// ---- CRC-32 -----------------------------------------------------------------------------------

/** The CRC-32 of every byte value (reflected polynomial 0xEDB88320, as ZIP uses). */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value++) {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    table[value] = crc;
  }
  return table;
})();

/**
 * The CRC-32 of `bytes` as an unsigned number. Pass the CRC of the bytes before them as `previous`
 * to continue over pieces: `crc32(b, crc32(a))` equals the CRC of `a` followed by `b`.
 */
export function crc32(bytes: Uint8Array, previous = 0): number {
  let crc = ~previous;
  for (let index = 0; index < bytes.length; index++) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return ~crc >>> 0;
}

// ---- Little-endian fields ---------------------------------------------------------------------

type Bytes = Uint8Array<ArrayBuffer>;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Writes fields one after another into a fixed-size record. */
class RecordWriter {
  readonly bytes: Bytes;
  private readonly fields: DataView;
  private at = 0;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.fields = view(this.bytes);
  }

  u16(value: number): this {
    this.fields.setUint16(this.at, value, true);
    this.at += 2;
    return this;
  }

  u32(value: number): this {
    this.fields.setUint32(this.at, value, true);
    this.at += 4;
    return this;
  }

  raw(value: Uint8Array): this {
    this.bytes.set(value, this.at);
    this.at += value.length;
    return this;
  }
}

// ---- Writing ----------------------------------------------------------------------------------

export type ZipData = Blob | Bytes;

export interface ZipInput {
  /** The entry's path inside the archive, `/` between folders. */
  readonly name: string;
  readonly data: ZipData;
}

export interface WriteOptions {
  /** Every entry's modified time, epoch ms; ZIP keeps it as a local date and time. */
  readonly modifiedAt: number;
}

/** MS-DOS date and time fields; ZIP can hold 1980-01-01 to 2107-12-31, two-second steps. */
function dosStamp(at: number): { date: number; time: number } {
  const when = new Date(at);
  const year = when.getFullYear();
  if (!Number.isFinite(at) || year < 1980) return { date: (1 << 5) | 1, time: 0 };
  if (year > 2107) return { date: (127 << 9) | (12 << 5) | 31, time: (23 << 11) | (59 << 5) | 29 };
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
  };
}

interface Planned {
  readonly name: string;
  readonly nameBytes: Bytes;
  readonly flags: number;
  readonly data: ZipData;
  readonly size: number;
  /** Where its local header starts. */
  readonly offset: number;
}

// By shape, not class: bytes may come from another realm (a TextEncoder, a worker).
function isBytes(data: ZipData): data is Bytes {
  return ArrayBuffer.isView(data);
}

function sizeOf(data: ZipData): number {
  return isBytes(data) ? data.length : data.size;
}

function isAscii(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte < 0x80);
}

/** Lays the entries out and checks every limit from their sizes, before any byte is read. */
function plan(entries: readonly ZipInput[]): { items: Planned[]; directoryOffset: number } {
  if (entries.length > MAX_ENTRIES) throw new ZipError('tooMany');
  const encoder = new TextEncoder();
  const items: Planned[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    if (nameBytes.length > MAX_NAME_BYTES) throw new ZipError('nameTooLong', entry.name);
    const size = sizeOf(entry.data);
    if (offset > MAX_OFFSET || size > MAX_OFFSET) throw new ZipError('tooLarge', entry.name);
    const flags = isAscii(nameBytes) ? 0 : FLAG_UTF8_NAME;
    items.push({ name: entry.name, nameBytes, flags, data: entry.data, size, offset });
    offset += LOCAL_HEADER_BYTES + nameBytes.length + size;
  }
  const directoryBytes = items.reduce(
    (total, item) => total + CENTRAL_HEADER_BYTES + item.nameBytes.length,
    0,
  );
  if (offset > MAX_OFFSET || directoryBytes > MAX_OFFSET) throw new ZipError('tooLarge');
  return { items, directoryOffset: offset };
}

async function bytesOf(data: ZipData): Promise<Bytes> {
  return isBytes(data) ? data : new Uint8Array(await data.arrayBuffer());
}

/** Collects output pieces and folds them into a Blob every few MiB. */
class BlobSink {
  private folded: Blob | null = null;
  private pending: Bytes[] = [];
  private pendingBytes = 0;

  add(piece: Bytes): void {
    this.pending.push(piece);
    this.pendingBytes += piece.length;
    if (this.pendingBytes >= FOLD_BYTES) {
      this.folded = this.blob();
      this.pending = [];
      this.pendingBytes = 0;
    }
  }

  blob(type?: string): Blob {
    const parts: BlobPart[] = this.folded ? [this.folded, ...this.pending] : this.pending;
    return new Blob(parts, type === undefined ? undefined : { type });
  }
}

/**
 * A ZIP of the entries in the given order, every one stored. Each entry's data is read once, for
 * its CRC; the bytes read are the bytes written. Throws `ZipError` past the limits of a ZIP
 * without ZIP64, and when an entry's bytes do not match its size; a Blob that cannot be read
 * rejects with the browser's own error. Names are written as given (UTF-8).
 */
export async function writeZip(entries: readonly ZipInput[], options: WriteOptions): Promise<Blob> {
  const { items, directoryOffset } = plan(entries);
  const { date, time } = dosStamp(options.modifiedAt);
  const sink = new BlobSink();
  const crcs: number[] = [];

  for (const item of items) {
    const bytes = await bytesOf(item.data);
    if (bytes.length !== item.size) throw new ZipError('changed', item.name);
    const crc = crc32(bytes);
    crcs.push(crc);
    const header = new RecordWriter(LOCAL_HEADER_BYTES + item.nameBytes.length)
      .u32(LOCAL_SIGNATURE)
      .u16(VERSION_NEEDED)
      .u16(item.flags)
      .u16(METHOD_STORED)
      .u16(time)
      .u16(date)
      .u32(crc)
      .u32(item.size) // compressed size: stored, so the same
      .u32(item.size)
      .u16(item.nameBytes.length)
      .u16(0) // no extra field
      .raw(item.nameBytes);
    sink.add(header.bytes);
    sink.add(bytes);
  }

  let directoryBytes = 0;
  items.forEach((item, index) => {
    const record = new RecordWriter(CENTRAL_HEADER_BYTES + item.nameBytes.length)
      .u32(CENTRAL_SIGNATURE)
      .u16(VERSION_MADE_BY)
      .u16(VERSION_NEEDED)
      .u16(item.flags)
      .u16(METHOD_STORED)
      .u16(time)
      .u16(date)
      .u32(crcs[index]!)
      .u32(item.size)
      .u32(item.size)
      .u16(item.nameBytes.length)
      .u16(0) // extra field
      .u16(0) // comment
      .u16(0) // disk where the entry starts
      .u16(0) // internal attributes
      .u32(0) // external attributes
      .u32(item.offset)
      .raw(item.nameBytes);
    sink.add(record.bytes);
    directoryBytes += record.bytes.length;
  });

  const end = new RecordWriter(END_RECORD_BYTES)
    .u32(END_SIGNATURE)
    .u16(0) // this disk
    .u16(0) // disk where the directory starts
    .u16(items.length) // records on this disk
    .u16(items.length) // records in all
    .u32(directoryBytes)
    .u32(directoryOffset)
    .u16(0); // no comment
  sink.add(end.bytes);
  return sink.blob(ZIP_TYPE);
}

// ---- Reading ----------------------------------------------------------------------------------

export interface ZipEntry {
  readonly name: string;
  /** Bytes of the entry. */
  readonly size: number;
  readonly crc32: number;
  /** The entry's bytes: a slice of the archive, already checked against its CRC. */
  readonly data: Blob;
}

interface EndRecord {
  readonly count: number;
  readonly directoryOffset: number;
  readonly directoryBytes: number;
}

interface DirectoryRecord {
  readonly name: string;
  readonly nameBytes: Bytes;
  readonly flags: number;
  readonly crc: number;
  readonly size: number;
  readonly localOffset: number;
}

interface Located extends DirectoryRecord {
  readonly dataStart: number;
}

/** Exactly `length` bytes from `start`; fewer means the file was cut short. */
async function readBytes(file: Blob, start: number, length: number): Promise<Bytes> {
  if (start < 0 || start + length > file.size) throw new ZipError('damaged');
  const bytes = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
  if (bytes.length !== length) throw new ZipError('damaged');
  return bytes;
}

/** The end record: the last signature whose comment runs exactly to the end of the file. */
async function readEnd(file: Blob): Promise<EndRecord> {
  if (file.size < END_RECORD_BYTES) throw new ZipError('notZip');
  const tailBytes = Math.min(file.size, END_RECORD_BYTES + MAX_COMMENT_BYTES);
  const tailStart = file.size - tailBytes;
  const tail = await readBytes(file, tailStart, tailBytes);
  const fields = view(tail);

  let at = -1;
  for (let index = tail.length - END_RECORD_BYTES; index >= 0; index--) {
    if (
      fields.getUint32(index, true) === END_SIGNATURE &&
      index + END_RECORD_BYTES + fields.getUint16(index + 20, true) === tail.length
    ) {
      at = index;
      break;
    }
  }
  if (at < 0) throw new ZipError('notZip');

  const endOffset = tailStart + at;
  const thisDisk = fields.getUint16(at + 4, true);
  const directoryDisk = fields.getUint16(at + 6, true);
  const countHere = fields.getUint16(at + 8, true);
  const count = fields.getUint16(at + 10, true);
  const directoryBytes = fields.getUint32(at + 12, true);
  const directoryOffset = fields.getUint32(at + 16, true);

  if (
    count === ZIP64_MARK_16 ||
    countHere === ZIP64_MARK_16 ||
    directoryBytes === ZIP64_MARK_32 ||
    directoryOffset === ZIP64_MARK_32
  ) {
    throw new ZipError('zip64');
  }
  if (endOffset >= ZIP64_LOCATOR_BYTES) {
    const before = await readBytes(file, endOffset - ZIP64_LOCATOR_BYTES, 4);
    if (view(before).getUint32(0, true) === ZIP64_LOCATOR_SIGNATURE) throw new ZipError('zip64');
  }
  if (thisDisk !== 0 || directoryDisk !== 0 || countHere !== count) throw new ZipError('split');
  // The directory must end where the end record starts: nothing hidden in between.
  if (directoryOffset + directoryBytes !== endOffset) throw new ZipError('damaged');
  return { count, directoryOffset, directoryBytes };
}

function hasZip64Extra(extra: Uint8Array): boolean {
  const fields = view(extra);
  for (let at = 0; at + 4 <= extra.length; at += 4 + fields.getUint16(at + 2, true)) {
    if (fields.getUint16(at, true) === ZIP64_EXTRA_ID) return true;
  }
  return false;
}

function readDirectory(directory: Bytes, count: number): DirectoryRecord[] {
  const fields = view(directory);
  // Names without the UTF-8 flag are decoded the same way: any byte above 0x7f makes the name
  // something a backup never uses, however it reads.
  const decoder = new TextDecoder();
  const records: DirectoryRecord[] = [];
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (at + CENTRAL_HEADER_BYTES > directory.length) throw new ZipError('damaged');
    if (fields.getUint32(at, true) !== CENTRAL_SIGNATURE) throw new ZipError('damaged');
    const flags = fields.getUint16(at + 8, true);
    const method = fields.getUint16(at + 10, true);
    const crc = fields.getUint32(at + 16, true);
    const storedSize = fields.getUint32(at + 20, true);
    const size = fields.getUint32(at + 24, true);
    const nameLength = fields.getUint16(at + 28, true);
    const extraLength = fields.getUint16(at + 30, true);
    const commentLength = fields.getUint16(at + 32, true);
    const startDisk = fields.getUint16(at + 34, true);
    const localOffset = fields.getUint32(at + 42, true);

    const nameStart = at + CENTRAL_HEADER_BYTES;
    const extraStart = nameStart + nameLength;
    const next = extraStart + extraLength + commentLength;
    if (next > directory.length) throw new ZipError('damaged');
    const nameBytes = directory.slice(nameStart, extraStart);
    const name = decoder.decode(nameBytes);

    if (flags & ENCRYPTION_FLAGS) throw new ZipError('encrypted', name);
    if (
      storedSize === ZIP64_MARK_32 ||
      size === ZIP64_MARK_32 ||
      localOffset === ZIP64_MARK_32 ||
      startDisk === ZIP64_MARK_16 ||
      hasZip64Extra(directory.subarray(extraStart, extraStart + extraLength))
    ) {
      throw new ZipError('zip64', name);
    }
    if (startDisk !== 0) throw new ZipError('split', name);
    if (method !== METHOD_STORED) throw new ZipError('compressed', name);
    if (storedSize !== size) throw new ZipError('damaged', name);

    records.push({ name, nameBytes, flags, crc, size, localOffset });
    at = next;
  }
  if (at !== directory.length) throw new ZipError('damaged');
  return records;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

/** Finds the entry's data through its local header, which must agree with the directory. */
async function locate(file: Blob, record: DirectoryRecord, limit: number): Promise<Located> {
  const headerBytes = LOCAL_HEADER_BYTES + record.nameBytes.length;
  if (record.localOffset + headerBytes > limit) throw new ZipError('damaged', record.name);
  const header = await readBytes(file, record.localOffset, headerBytes);
  const fields = view(header);
  if (fields.getUint32(0, true) !== LOCAL_SIGNATURE) throw new ZipError('damaged', record.name);
  const flags = fields.getUint16(6, true);
  const method = fields.getUint16(8, true);
  const nameLength = fields.getUint16(26, true);
  const extraLength = fields.getUint16(28, true);
  if (flags & ENCRYPTION_FLAGS) throw new ZipError('encrypted', record.name);
  if (method !== METHOD_STORED) throw new ZipError('compressed', record.name);
  if (!sameBytes(header.subarray(LOCAL_HEADER_BYTES, headerBytes), record.nameBytes)) {
    throw new ZipError('damaged', record.name);
  }
  // With a data descriptor the local fields may be zero; the directory's values count.
  if (!(flags & FLAG_DATA_DESCRIPTOR)) {
    const agrees =
      fields.getUint32(14, true) === record.crc &&
      fields.getUint32(18, true) === record.size &&
      fields.getUint32(22, true) === record.size;
    if (!agrees) throw new ZipError('damaged', record.name);
  }
  if (nameLength !== record.nameBytes.length) throw new ZipError('damaged', record.name);
  const dataStart = record.localOffset + LOCAL_HEADER_BYTES + nameLength + extraLength;
  if (dataStart + record.size > limit) throw new ZipError('damaged', record.name);
  return { ...record, dataStart };
}

async function checkCrc(file: Blob, entry: Located): Promise<void> {
  let crc = 0;
  for (let done = 0; done < entry.size; done += READ_CHUNK_BYTES) {
    const length = Math.min(READ_CHUNK_BYTES, entry.size - done);
    crc = crc32(await readBytes(file, entry.dataStart + done, length), crc);
  }
  if (crc !== entry.crc) throw new ZipError('checksum', entry.name);
}

/**
 * Every entry of a stored-only ZIP, in directory order, after reading each one to the end and
 * checking its CRC. Throws `ZipError` for anything else: not a ZIP, damaged structure, a CRC
 * mismatch, compressed, encrypted, ZIP64 or split archives. Entries may not overlap, so a crafted
 * directory cannot make the reader go over the same bytes again and again.
 */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const end = await readEnd(file);
  const directory = await readBytes(file, end.directoryOffset, end.directoryBytes);
  const records = readDirectory(directory, end.count);

  const located: Located[] = [];
  for (const record of records) located.push(await locate(file, record, end.directoryOffset));

  const byPlace = [...located].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 1; index < byPlace.length; index++) {
    const before = byPlace[index - 1]!;
    if (byPlace[index]!.localOffset < before.dataStart + before.size) {
      throw new ZipError('damaged', byPlace[index]!.name);
    }
  }

  for (const entry of located) await checkCrc(file, entry);
  return located.map((entry) => ({
    name: entry.name,
    size: entry.size,
    crc32: entry.crc,
    data: file.slice(entry.dataStart, entry.dataStart + entry.size),
  }));
}
